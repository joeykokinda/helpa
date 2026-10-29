package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// webAgent runs Muse with web search until it submits its answer through the submit function, whose arguments
// must match schema. It is the research agent's pattern, for the smaller jobs after a diagnosis.
func webAgent(ctx context.Context, model, instructions, brief, submit string, schema map[string]any) (json.RawMessage, int, error) {
	tools := []map[string]any{
		{"type": "web_search"},
		{"type": "function", "name": submit, "description": "Submit the final answer.", "strict": true, "parameters": schema},
	}
	input := []any{userMessage(brief)}
	searches := 0
	for turn := 0; turn < 8; turn++ {
		var calls []outputItem
		items, err := streamResponse(ctx, map[string]any{
			"model": model, "instructions": instructions, "reasoning": map[string]any{"effort": "low"}, "tools": tools, "input": input,
		}, func(item outputItem) {
			if item.Type == "web_search_call" {
				searches++
			}
			if item.Type == "function_call" {
				calls = append(calls, item)
			}
		})
		if err != nil {
			return nil, searches, err
		}
		for _, item := range items {
			input = append(input, item.raw)
		}
		for _, call := range calls {
			if call.Name == submit {
				return json.RawMessage(call.Arguments), searches, nil
			}
			input = append(input, map[string]any{"type": "function_call_output", "call_id": call.CallID, "output": "unknown tool"})
		}
		if len(calls) == 0 {
			input = append(input, userMessage("Submit your answer with "+submit+" now."))
		}
	}
	return nil, searches, fmt.Errorf("%s: ran out of turns", submit)
}

func stringField(description string) map[string]any {
	return map[string]any{"type": "string", "description": description}
}

/* ---------- the exact part, and where to buy it ---------- */

var partSchema = map[string]any{
	"type": "object", "additionalProperties": false,
	"required": []string{"name", "part_number", "fits", "confidence", "buy"},
	"properties": map[string]any{
		"name":        stringField("Plain name, e.g. 'Dryer thermal fuse'."),
		"part_number": stringField("The manufacturer (OEM) part number for this exact model, as printed by the maker. Empty if you couldn't confirm one."),
		"fits":        stringField("One sentence: which models it fits, or how to check it matches (e.g. 'match the number printed on your old part')."),
		"confidence":  map[string]any{"type": "string", "enum": []string{"high", "medium", "low"}, "description": "high only when a source ties this part number to this exact model."},
		"buy": map[string]any{"type": "array", "description": "Up to 4 places that sell this exact part, best first.", "items": map[string]any{
			"type": "object", "additionalProperties": false, "required": []string{"store", "url", "price", "in_stock"},
			"properties": map[string]any{
				"store":    stringField("e.g. 'Whirlpool Parts', 'RepairClinic', 'Home Depot'."),
				"url":      stringField("A product page you actually saw in search results. Never made up."),
				"price":    stringField("As listed, e.g. '$12.49'; empty if not shown."),
				"in_stock": map[string]any{"type": "boolean"},
			},
		}},
	},
}

const partInstructions = `You find the exact replacement part a person needs for their machine, and where to buy it.
Use web search. Prefer the manufacturer's own part number for their exact model (the maker's parts site, the
model's parts diagram, RepairClinic, PartSelect, AppliancePartsPros; auto parts stores for cars). Only list product
pages you actually saw in the search results, with the price shown there. Never invent a part number, price or link:
if you can't confirm the part for this model, give the best general match, set confidence low, and say how to check
it matches the old part. Then call submit_part.`

func findPart(ctx context.Context, item *job, partName string) (jobPart, int, error) {
	brief := fmt.Sprintf("Machine: %s %s %s\nProblem: %s\nLikely cause: %s\nPart needed: %s",
		item.Brand, item.Model, item.Appliance, item.Title, item.Diagnosis, partName)
	raw, searches, err := webAgent(ctx, "muse-wonder-1.0", partInstructions, brief, "submit_part", partSchema)
	if err != nil {
		return jobPart{}, searches, err
	}
	var found jobPart
	if err := json.Unmarshal(raw, &found); err != nil {
		return jobPart{}, searches, err
	}
	found.Buy = keepLinks(found.Buy)
	return found, searches, nil
}

// keepLinks drops any buy option without a real web address and caps the list.
func keepLinks(options []buyOption) []buyOption {
	kept := []buyOption{}
	for _, option := range options {
		if strings.HasPrefix(option.URL, "https://") || strings.HasPrefix(option.URL, "http://") {
			kept = append(kept, option)
		}
		if len(kept) == 4 {
			break
		}
	}
	return kept
}

func handleFindParts(writer http.ResponseWriter, request *http.Request) {
	device, ok := deviceOf(writer, request)
	if !ok {
		return
	}
	var body struct{ Part string }
	if !readBody(writer, request, &body) {
		return
	}
	jobs.mutex.Lock()
	var current *job
	for _, item := range jobs.read(device).Jobs {
		if item.ID == request.PathValue("id") {
			copied := item
			current = &copied
		}
	}
	jobs.mutex.Unlock()
	if current == nil {
		http.Error(writer, "no such job", http.StatusNotFound)
		return
	}
	partName := clip(body.Part, 120)
	if partName == "" && len(current.PartsNeeded) > 0 {
		partName = current.PartsNeeded[0]
	}
	if partName == "" {
		http.Error(writer, "which part?", http.StatusBadRequest)
		return
	}
	var found jobPart
	var err error
	sample := replayDir != ""
	if sample {
		found, err = replayFinding[jobPart]("parts.json")
		found.Name = partName
	} else {
		if overBudget(writer, 0.9) {
			return
		}
		// Searches and tokens are counted against the daily budget as the replies come in.
		found, _, err = findPart(request.Context(), current, partName)
	}
	if err != nil {
		log.Printf("find part: %v", err)
		http.Error(writer, "I couldn't find that part right now. Try again?", http.StatusBadGateway)
		return
	}
	found.ID, found.Status = newID(), "found"
	item, err := jobs.updateJob(device, current.ID, func(item *job) error {
		item.Parts = append(item.Parts, found)
		item.Status = "needs_part"
		where := "a store"
		if len(found.Buy) > 0 {
			where = found.Buy[0].Store
		}
		number := ""
		if found.PartNumber != "" {
			number = " (" + found.PartNumber + ")"
		}
		item.note("part_found", fmt.Sprintf("Found the %s%s at %s.", found.Name, number, where))
		return nil
	})
	if item != nil {
		writeJSON(writer, map[string]any{"job": item, "sample": sample})
		return
	}
	replyJob(writer, item, err)
}

/* ---------- a good local pro ---------- */

var proSchema = map[string]any{
	"type": "object", "additionalProperties": false, "required": []string{"trade", "pros"},
	"properties": map[string]any{
		"trade": stringField("Who to call, e.g. 'appliance repair', 'plumber', 'electrician', 'HVAC technician', 'auto mechanic'."),
		"pros": map[string]any{"type": "array", "description": "Up to 5 businesses, best first.", "items": map[string]any{
			"type": "object", "additionalProperties": false,
			"required": []string{"name", "trade", "rating", "reviews", "phone", "website", "address", "why", "hours"},
			"properties": map[string]any{
				"name":    stringField("Business name exactly as listed."),
				"trade":   stringField("What they do."),
				"rating":  map[string]any{"type": "number", "description": "Star rating out of 5 as listed; 0 if not shown."},
				"reviews": map[string]any{"type": "integer", "description": "Number of reviews as listed; 0 if not shown."},
				"phone":   stringField("Phone as listed. Never made up; empty if not shown."),
				"website": stringField("Their site or listing page, as seen in results."),
				"address": stringField("Street or area, as listed."),
				"why":     stringField("One short reason they fit: brand-authorized, same-day, reviews mention this exact repair."),
				"hours":   stringField("Opening hours if shown, else empty."),
			},
		}},
	},
}

const proInstructions = `You find the best local professionals for a home or car repair the person can't or shouldn't do themselves.
Use web search for businesses near their location. Pick the right trade for the problem. Rank by real reviews (high
rating AND many reviews), brand authorization for their machine, and reviews that mention this kind of repair.
Only list businesses you actually saw in search results, with their listed phone, rating and review count. Never
invent a business, phone number or rating; leave a field empty or 0 when it wasn't shown. Then call submit_pros.`

func findPros(ctx context.Context, item *job, location string) (string, []jobPro, int, error) {
	brief := fmt.Sprintf("Location: %s\n%s", location, item.summary())
	raw, searches, err := webAgent(ctx, "muse-wonder-1.0", proInstructions, brief, "submit_pros", proSchema)
	if err != nil {
		return "", nil, searches, err
	}
	var found struct {
		Trade string   `json:"trade"`
		Pros  []jobPro `json:"pros"`
	}
	if err := json.Unmarshal(raw, &found); err != nil {
		return "", nil, searches, err
	}
	if len(found.Pros) > 5 {
		found.Pros = found.Pros[:5]
	}
	return found.Trade, found.Pros, searches, nil
}

func handleFindPros(writer http.ResponseWriter, request *http.Request) {
	device, ok := deviceOf(writer, request)
	if !ok {
		return
	}
	var body struct{ Location string }
	if !readBody(writer, request, &body) {
		return
	}
	location := clip(body.Location, 80)
	if location == "" {
		http.Error(writer, "where are you? a ZIP code or town is enough", http.StatusBadRequest)
		return
	}
	jobs.mutex.Lock()
	var current *job
	for _, item := range jobs.read(device).Jobs {
		if item.ID == request.PathValue("id") {
			copied := item
			current = &copied
		}
	}
	jobs.mutex.Unlock()
	if current == nil {
		http.Error(writer, "no such job", http.StatusNotFound)
		return
	}
	var trade string
	var pros []jobPro
	var err error
	sample := replayDir != ""
	if sample {
		var found struct {
			Trade string   `json:"trade"`
			Pros  []jobPro `json:"pros"`
		}
		found, err = replayFinding[struct {
			Trade string   `json:"trade"`
			Pros  []jobPro `json:"pros"`
		}]("pros.json")
		trade, pros = found.Trade, found.Pros
	} else {
		if overBudget(writer, 0.9) {
			return
		}
		trade, pros, _, err = findPros(request.Context(), current, location)
	}
	if err != nil {
		log.Printf("find pros: %v", err)
		http.Error(writer, "I couldn't search for pros right now. Try again?", http.StatusBadGateway)
		return
	}
	item, err := jobs.updateJob(device, current.ID, func(item *job) error {
		item.Pros, item.Location = pros, location
		if item.Status == "fixing" {
			item.Status = "needs_pro"
		}
		item.note("pros_found", fmt.Sprintf("Found %d well-reviewed %s near %s.", len(pros), plural(trade), location))
		return nil
	})
	if item != nil {
		writeJSON(writer, map[string]any{"job": item, "sample": sample})
		return
	}
	replyJob(writer, item, err)
}

func plural(trade string) string {
	if trade == "" {
		return "pros"
	}
	if strings.HasSuffix(trade, "repair") || strings.HasSuffix(trade, "service") {
		return trade + " shops"
	}
	return trade + "s"
}

// replayFinding reads a recorded finder answer from the replay folder, so the app can be built and demoed offline.
// The app labels these as samples.
func replayFinding[T any](name string) (T, error) {
	var value T
	time.Sleep(1500 * time.Millisecond)
	data, err := os.ReadFile(filepath.Join(replayDir, name))
	if err != nil {
		return value, err
	}
	return value, json.Unmarshal(data, &value)
}
