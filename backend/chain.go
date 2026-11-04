package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// After the diagnosis: what the repair should cost, reaching out to a pro, and updating the job from what the pro
// said. Sourcing is real (web search); contacting a business on the person's behalf is a demo: Helpa writes the
// message and the shop's reply is generated, clearly labelled. Email isn't offered: shops rarely publish an address
// and sending would need a mail service, so the real paths are the person's own phone (text or call).

//go:embed fixtures/fair_price.json fixtures/pro_reply.json fixtures/pro_said.json
var chainFixtures embed.FS

func chainFixture[T any](name string) (T, error) {
	var value T
	data, err := chainFixtures.ReadFile("fixtures/" + name)
	if err != nil {
		return value, err
	}
	return value, json.Unmarshal(data, &value)
}

type fairPrice struct {
	Summary     string   `json:"summary"`
	Low         int      `json:"low"`
	High        int      `json:"high"`
	ServiceCall string   `json:"service_call"`
	Includes    string   `json:"includes"`
	RedFlags    []string `json:"red_flags"`
	Sources     []string `json:"sources"`
	Sample      bool     `json:"sample,omitempty"`
}

type proContact struct {
	Pro       string `json:"pro"`
	Phone     string `json:"phone,omitempty"`
	Message   string `json:"message"`
	SentAt    int64  `json:"sent_at"`
	Reply     string `json:"reply"`
	QuoteLow  int    `json:"quote_low"`
	QuoteHigh int    `json:"quote_high"`
	SlotLabel string `json:"slot_label"`
	SlotAt    int64  `json:"slot_at"`
	Question  string `json:"question"`
	Demo      bool   `json:"demo"`
}

// jobCopy reads one job for a model call, which runs outside the file lock.
func jobCopy(device, id string) *job {
	jobs.mutex.Lock()
	defer jobs.mutex.Unlock()
	for _, item := range jobs.read(device).Jobs {
		if item.ID == id {
			return &item
		}
	}
	return nil
}

/* ---------- fair price ---------- */

var fairPriceSchema = map[string]any{
	"type": "object", "additionalProperties": false,
	"required": []string{"summary", "low", "high", "service_call", "includes", "red_flags", "sources"},
	"properties": map[string]any{
		"summary":      stringField("One plain sentence, e.g. 'Replacing a dryer thermal fuse usually costs $120 to $200 with a pro.'"),
		"low":          map[string]any{"type": "integer", "description": "Typical total in US dollars, low end, parts and labor. 0 if no source gave a number."},
		"high":         map[string]any{"type": "integer", "description": "Typical total in US dollars, high end. 0 if no source gave a number."},
		"service_call": stringField("The usual trip or diagnostic fee, e.g. '$75 to $100, often waived if you go ahead'; empty if not found."),
		"includes":     stringField("What the range covers, e.g. 'part about $15 plus an hour of labor'."),
		"red_flags":    map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "Up to 3 short warnings, e.g. 'More than $350, ask why' or 'Replacing the whole heater for a blown fuse'."},
		"sources":      map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "Web addresses of the pages the numbers came from, as seen in search results."},
	},
}

const fairPriceInstructions = `You tell a person what a repair should cost with a professional, so nobody overcharges them.
Use web search: repair cost guides (HomeGuide, Angi, Fixr, HomeAdvisor, RepairClinic, RepairPal for cars), parts
prices, and local rates for their area when you can find them. Give a typical total range in US dollars for parts
plus labor, the usual service-call fee, and up to 3 red flags that suggest a quote is too high or the wrong repair.
Only use numbers you actually saw in the search results and list those pages as sources. If you found no numbers,
set low and high to 0 and say so in the summary. Then call submit_price.`

func handleFairPrice(writer http.ResponseWriter, request *http.Request) {
	device, ok := deviceOf(writer, request)
	if !ok {
		return
	}
	var body struct{ Location string }
	if !readBody(writer, request, &body) {
		return
	}
	current := jobCopy(device, request.PathValue("id"))
	if current == nil {
		http.Error(writer, "no such job", http.StatusNotFound)
		return
	}
	// Cached per job: the same repair doesn't need researching twice.
	if current.FairPrice != nil {
		writeJSON(writer, current)
		return
	}
	location := firstNonEmpty(clip(body.Location, 80), current.Location, "the United States")
	var price fairPrice
	var err error
	if replayDir != "" || spend.past(0.9) {
		price, err = chainFixture[fairPrice]("fair_price.json")
		price.Sample = true
	} else {
		var raw json.RawMessage
		brief := fmt.Sprintf("Location: %s\n%s", location, current.summary())
		raw, _, err = webAgent(request.Context(), "muse-wonder-1.0", fairPriceInstructions, brief, "submit_price", fairPriceSchema)
		if err == nil {
			err = json.Unmarshal(raw, &price)
		}
	}
	if err != nil {
		log.Printf("fair price: %v", err)
		http.Error(writer, "I couldn't check prices right now. Try again?", http.StatusBadGateway)
		return
	}
	price = cleanPrice(price)
	item, err := jobs.updateJob(device, current.ID, func(item *job) error {
		item.FairPrice = &price
		if price.High > 0 {
			item.note("note", fmt.Sprintf("Fair price checked: $%d to $%d with a pro.", price.Low, price.High))
		}
		return nil
	})
	replyJob(writer, item, err)
}

// cleanPrice keeps numbers only when they come with a source, as host names, and in a sane order.
func cleanPrice(price fairPrice) fairPrice {
	var hosts []string
	for _, source := range price.Sources {
		if parsed, err := url.Parse(strings.TrimSpace(source)); err == nil && parsed.Host != "" {
			host := strings.TrimPrefix(parsed.Host, "www.")
			if !containsString(hosts, host) && len(hosts) < 4 {
				hosts = append(hosts, host)
			}
		}
	}
	price.Sources = hosts
	if len(hosts) == 0 || price.Low < 0 || price.High <= 0 {
		price.Low, price.High = 0, 0
	}
	if price.Low > price.High {
		price.Low, price.High = price.High, price.Low
	}
	price.Summary, price.ServiceCall, price.Includes = clipWords(price.Summary, 240), clipWords(price.ServiceCall, 160), clipWords(price.Includes, 220)
	flags := []string{}
	for _, flag := range price.RedFlags {
		if flag = clipWords(flag, 160); flag != "" && len(flags) < 3 {
			flags = append(flags, flag)
		}
	}
	price.RedFlags = flags
	return price
}

/* ---------- reaching out to a pro (demo) ---------- */

var proReplySchema = map[string]any{
	"type": "object", "additionalProperties": false,
	"required": []string{"reply", "quote_low", "quote_high", "slot_index", "question"},
	"properties": map[string]any{
		"reply":      stringField("The shop's text back, 2 to 4 short sentences, friendly and specific to this job: the quote, the visit time, one question."),
		"quote_low":  map[string]any{"type": "integer", "description": "Quoted total in US dollars, low end."},
		"quote_high": map[string]any{"type": "integer", "description": "Quoted total in US dollars, high end (same as low for a flat price)."},
		"slot_index": map[string]any{"type": "integer", "description": "Which of the person's free times the shop can do, counting from 0."},
		"question":   stringField("The one question the shop asks, e.g. 'Is the dryer gas or electric?'"),
	},
}

const proReplyInstructions = `This is a product demo. Play the front desk of the repair shop named in the brief, replying by text
to a customer's message. Be realistic and specific to their machine and problem. Quote a price close to the fair
range in the brief (sometimes a little above it, never wildly off), pick one of the customer's free times, and ask
one useful question about the job. Sound like a real small business. No emoji.`

func handleReachOut(writer http.ResponseWriter, request *http.Request) {
	device, ok := deviceOf(writer, request)
	if !ok {
		return
	}
	var body struct {
		Pro        string
		Message    string
		Permission bool
		Slots      []struct {
			Label string `json:"label"`
			At    int64  `json:"at"`
		}
	}
	if !readBody(writer, request, &body) {
		return
	}
	if !body.Permission {
		http.Error(writer, "Helpa needs your OK before it reaches out for you.", http.StatusBadRequest)
		return
	}
	current := jobCopy(device, request.PathValue("id"))
	if current == nil {
		http.Error(writer, "no such job", http.StatusNotFound)
		return
	}
	var pro *jobPro
	for index := range current.Pros {
		if current.Pros[index].Name == body.Pro {
			pro = &current.Pros[index]
		}
	}
	message := clip(body.Message, 1500)
	if pro == nil || message == "" {
		http.Error(writer, "pick a pro and write the message", http.StatusBadRequest)
		return
	}
	if len(body.Slots) == 0 {
		http.Error(writer, "pick a time you're free", http.StatusBadRequest)
		return
	}
	if len(body.Slots) > 6 {
		body.Slots = body.Slots[:6]
	}
	var reply struct {
		Reply     string `json:"reply"`
		QuoteLow  int    `json:"quote_low"`
		QuoteHigh int    `json:"quote_high"`
		SlotIndex int    `json:"slot_index"`
		Question  string `json:"question"`
	}
	var err error
	if replayDir != "" || spend.past(0.9) {
		reply, err = chainFixture[struct {
			Reply     string `json:"reply"`
			QuoteLow  int    `json:"quote_low"`
			QuoteHigh int    `json:"quote_high"`
			SlotIndex int    `json:"slot_index"`
			Question  string `json:"question"`
		}]("pro_reply.json")
		reply.Reply = strings.ReplaceAll(reply.Reply, "{slot}", strings.ToLower(body.Slots[0].Label))
		time.Sleep(1500 * time.Millisecond)
	} else {
		var times []string
		for index, slot := range body.Slots {
			times = append(times, fmt.Sprintf("%d: %s", index, clip(slot.Label, 40)))
		}
		fair := "unknown"
		if current.FairPrice != nil && current.FairPrice.High > 0 {
			fair = fmt.Sprintf("$%d to $%d", current.FairPrice.Low, current.FairPrice.High)
		}
		brief := fmt.Sprintf("Shop: %s (%s)\nFair price range for this job: %s\nCustomer's free times:\n%s\n\nCustomer's message:\n%s",
			pro.Name, pro.Trade, fair, strings.Join(times, "\n"), message)
		var answer response
		answer, err = createResponse(request.Context(), map[string]any{
			"model": "muse-spark-1.3", "instructions": proReplyInstructions, "reasoning": map[string]any{"effort": "low"},
			"input": []any{userMessage(brief)},
			"text":  map[string]any{"format": map[string]any{"type": "json_schema", "name": "pro_reply", "schema": proReplySchema, "strict": true}},
		})
		if err == nil {
			err = json.Unmarshal([]byte(answer.text()), &reply)
		}
	}
	if err != nil {
		log.Printf("reach out: %v", err)
		http.Error(writer, "Helpa couldn't reach them right now. Try again, or text them yourself.", http.StatusBadGateway)
		return
	}
	if reply.SlotIndex < 0 || reply.SlotIndex >= len(body.Slots) {
		reply.SlotIndex = 0
	}
	if reply.QuoteHigh < reply.QuoteLow {
		reply.QuoteHigh = reply.QuoteLow
	}
	slot := body.Slots[reply.SlotIndex]
	contact := proContact{Pro: pro.Name, Phone: pro.Phone, Message: message, SentAt: time.Now().UnixMilli(), Reply: clip(reply.Reply, 600),
		QuoteLow: reply.QuoteLow, QuoteHigh: reply.QuoteHigh, SlotLabel: clip(slot.Label, 40), SlotAt: slot.At, Question: clip(reply.Question, 200), Demo: true}
	item, err := jobs.updateJob(device, current.ID, func(item *job) error {
		item.Contact = &contact
		for index := range item.Pros {
			if item.Pros[index].Name == pro.Name {
				item.Pros[index].Contacted = contact.SentAt
			}
		}
		item.note("contacted", fmt.Sprintf("Helpa messaged %s (demo). They quoted %s and can come %s.", pro.Name, quoteText(contact.QuoteLow, contact.QuoteHigh), strings.ToLower(contact.SlotLabel)))
		return nil
	})
	replyJob(writer, item, err)
}

func quoteText(low, high int) string {
	if low <= 0 && high <= 0 {
		return "no price yet"
	}
	if low == high || low <= 0 {
		return fmt.Sprintf("$%d", high)
	}
	return fmt.Sprintf("$%d to $%d", low, high)
}

/* ---------- what the pro said ---------- */

type proUpdate struct {
	Diagnosis string `json:"diagnosis"`
	Parts     []struct {
		Name       string `json:"name"`
		PartNumber string `json:"part_number"`
	} `json:"parts"`
	QuotedPrice int    `json:"quoted_price"`
	Status      string `json:"status"`
	NextStep    string `json:"next_step"`
}

var proSaidSchema = map[string]any{
	"type": "object", "additionalProperties": false,
	"required": []string{"diagnosis", "parts", "quoted_price", "status", "next_step"},
	"properties": map[string]any{
		"diagnosis": stringField("What the pro says is wrong, one plain sentence. Empty if they didn't say."),
		"parts": map[string]any{"type": "array", "items": map[string]any{
			"type": "object", "additionalProperties": false, "required": []string{"name", "part_number"},
			"properties": map[string]any{"name": stringField("Plain part name, e.g. 'Thermal fuse'."), "part_number": stringField("As the pro said it; empty if not said.")},
		}},
		"quoted_price": map[string]any{"type": "integer", "description": "The price the pro quoted in US dollars, 0 if none."},
		"status":       map[string]any{"type": "string", "enum": []string{"fixed", "needs_part", "pro_returning", "diy"}, "description": "fixed: it works now. needs_part: a part has to be bought. pro_returning: the pro comes back. diy: the person can do it themselves."},
		"next_step":    stringField("Helpa's one next step for the person, short and plain."),
	},
}

const proSaidInstructions = `A person tells you what their repair technician said, in their own words. Turn it into a job update:
what's wrong, the parts needed with part numbers exactly as said, the price quoted, and the status. Never invent a
part number or price that wasn't said. Then give one plain next step for the person.`

func handleProSaid(writer http.ResponseWriter, request *http.Request) {
	device, ok := deviceOf(writer, request)
	if !ok {
		return
	}
	var body struct{ Text string }
	if !readBody(writer, request, &body) {
		return
	}
	said := clip(body.Text, 1200)
	if said == "" {
		http.Error(writer, "what did the pro say?", http.StatusBadRequest)
		return
	}
	current := jobCopy(device, request.PathValue("id"))
	if current == nil {
		http.Error(writer, "no such job", http.StatusNotFound)
		return
	}
	var update proUpdate
	var err error
	if replayDir != "" {
		update, err = chainFixture[proUpdate]("pro_said.json")
	} else {
		if overBudget(writer, 1) {
			return
		}
		update, err = readProUpdate(request.Context(), current, said)
	}
	if err != nil {
		log.Printf("pro said: %v", err)
		http.Error(writer, "I couldn't make sense of that right now. Try again?", http.StatusBadGateway)
		return
	}
	item, err := jobs.updateJob(device, current.ID, func(item *job) error {
		applyProUpdate(item, said, update)
		return nil
	})
	if err != nil {
		replyJob(writer, item, err)
		return
	}
	aboveFair := current.FairPrice != nil && current.FairPrice.High > 0 && update.QuotedPrice > current.FairPrice.High
	writeJSON(writer, map[string]any{"job": item, "update": update, "above_fair": aboveFair})
}

func readProUpdate(ctx context.Context, current *job, said string) (proUpdate, error) {
	var update proUpdate
	brief := fmt.Sprintf("%s\n\nWhat the pro said:\n%s", current.summary(), said)
	answer, err := createResponse(ctx, map[string]any{
		"model": "muse-spark-1.3", "instructions": proSaidInstructions, "reasoning": map[string]any{"effort": "low"},
		"input": []any{userMessage(brief)},
		"text":  map[string]any{"format": map[string]any{"type": "json_schema", "name": "pro_update", "schema": proSaidSchema, "strict": true}},
	})
	if err != nil {
		return update, err
	}
	err = json.Unmarshal([]byte(answer.text()), &update)
	return update, err
}

// applyProUpdate puts what the pro said on the job: the new diagnosis, the parts to find, the status and the log.
func applyProUpdate(item *job, said string, update proUpdate) {
	if diagnosis := clip(update.Diagnosis, 600); diagnosis != "" {
		item.Diagnosis = diagnosis
	}
	// The pro has seen it, so the parts they name replace Helpa's guesses.
	var named []string
	for _, part := range update.Parts {
		name := clip(part.Name, 80)
		if name == "" {
			continue
		}
		if number := clip(part.PartNumber, 30); number != "" {
			name = fmt.Sprintf("%s (part number %s)", name, number)
		}
		if !containsString(named, name) && len(named) < 6 {
			named = append(named, name)
		}
	}
	if len(named) > 0 {
		item.PartsNeeded = named
	}
	booked := item.Appointment != nil && item.Appointment.At > time.Now().Add(-24*time.Hour).UnixMilli()
	switch update.Status {
	case "fixed":
		item.Status = "done"
	case "needs_part":
		// A booked pro who names a part is bringing it; the visit is still the next thing.
		if booked {
			item.Status = "pro_booked"
		} else {
			item.Status = "needs_part"
		}
	case "pro_returning":
		item.Status = "pro_booked"
	case "diy":
		item.Status = "fixing"
	}
	text := "The pro said: " + clipWords(said, 240)
	if !strings.ContainsAny(text[len(text)-1:], ".!?…") {
		text += "."
	}
	if update.QuotedPrice > 0 {
		text += fmt.Sprintf(" Quoted $%d.", update.QuotedPrice)
	}
	item.note("note", text)
}
