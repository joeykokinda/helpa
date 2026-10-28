package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

// minConfidence is how sure the first look must be before the model and parts tracks start on its word.
const minConfidence = 0.6

const (
	maxQuestions    = 2
	questionTimeout = 3 * time.Minute
)

var identifyInstructions = `You take the first quick look at a home repair request: photos (numbered from 0) and a description.
Say what the broken thing is and what is wrong, fast. Do not research or plan the fix.

- appliance: plain name, e.g. "electric dryer", "top-load washer", "garbage disposal". Empty if you cannot tell.
- brand, model_number: only when readable on a photo or stated by the user, else empty. Never guess a model number.
- confidence: 0 to 1, how sure you are about the appliance.
- symptom: the problem in plain words, one short sentence.
- question: ONE short question for the user, only when the answer changes the fix and neither the photos nor
  the words tell you. Ask when you cannot tell what the appliance is (confidence below 0.6), or when the
  symptom could mean very different fixes ("it stopped working": does it hum, or is it silent?).
  Most requests need no question; then leave it empty.
- choices: 2 to 4 short tappable answers to the question, at most 5 words each. Empty with no question.
- visible_parts: up to 4 parts visible in the photos that a fix for this symptom likely touches. Describe each
  as what it looks like ("round mesh filter in the floor of the tub"), not manual jargon, with the photo
  index and its rough largest dimension in cm, judged from the photo. Empty when there are no photos.
- library_fix: when the user's problem is one of Helpa's ready fixes below (same appliance, same problem in
  other words, e.g. "takes ages to dry" is "clothes still damp, long dry time"), its id exactly as written
  ("entry/problem"), and then ask no question. Empty when none fits or the brand clearly differs.

Helpa's ready fixes:
` + libraryFixList()

// libraryFixList is the library's problems in one line each, so the first look can match a ready fix.
func libraryFixList() string {
	var lines []string
	for _, entry := range library {
		for _, problem := range entry.Problems {
			lines = append(lines, fmt.Sprintf("%s/%s (%s %s): %s", entry.ID, problem.ID, entry.Brand, entry.Appliance, strings.Join(problem.Symptoms, "; ")))
		}
	}
	return strings.Join(lines, "\n")
}

var identifySchema = map[string]any{
	"type":                 "object",
	"additionalProperties": false,
	"required":             []string{"appliance", "brand", "model_number", "confidence", "symptom", "question", "choices", "visible_parts", "library_fix"},
	"properties": map[string]any{
		"appliance":    map[string]any{"type": "string"},
		"brand":        map[string]any{"type": "string"},
		"model_number": map[string]any{"type": "string"},
		"confidence":   map[string]any{"type": "number"},
		"symptom":      map[string]any{"type": "string"},
		"library_fix":  map[string]any{"type": "string"},
		"question":     map[string]any{"type": "string"},
		"choices":      map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
		"visible_parts": map[string]any{"type": "array", "items": map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"required":             []string{"photo", "phrase", "size_cm"},
			"properties": map[string]any{
				"photo":   map[string]any{"type": "integer"},
				"phrase":  map[string]any{"type": "string"},
				"size_cm": map[string]any{"type": "number"},
			},
		}},
	},
}

type visiblePart struct {
	Photo  int     `json:"photo"`
	Phrase string  `json:"phrase"`
	SizeCM float64 `json:"size_cm"`
}

type identification struct {
	Appliance    string        `json:"appliance"`
	Brand        string        `json:"brand"`
	ModelNumber  string        `json:"model_number"`
	Confidence   float64       `json:"confidence"`
	Symptom      string        `json:"symptom"`
	Question     string        `json:"question"`
	Choices      []string      `json:"choices"`
	VisibleParts []visiblePart `json:"visible_parts"`
	LibraryFix   string        `json:"library_fix"`
}

func (ident identification) confident() bool {
	return ident.Appliance != "" && ident.Confidence >= minConfidence
}

// identify is the fast first look: one Muse Spark vision call with structured output.
func identify(ctx context.Context, photos []string, complaint string, allowQuestion bool) (identification, error) {
	prompt := fmt.Sprintf("Problem: %s\nI attached %d photos.", complaint, len(photos))
	if !allowQuestion {
		prompt += "\nThe user already answered a question; do not ask another (leave question and choices empty)."
	}
	reply, err := createResponse(ctx, map[string]any{
		"model":        "muse-spark-1.3",
		"instructions": identifyInstructions,
		"reasoning":    map[string]any{"effort": "low"},
		"input":        []any{userMessage(prompt, photos...)},
		"text":         map[string]any{"format": map[string]any{"type": "json_schema", "name": "identification", "schema": identifySchema, "strict": true}},
	})
	if err != nil {
		return identification{}, err
	}
	var ident identification
	if err := json.Unmarshal([]byte(reply.text()), &ident); err != nil {
		return identification{}, err
	}
	if !allowQuestion || len(ident.Choices) < 2 {
		ident.Question, ident.Choices = "", nil
	}
	if len(ident.Choices) > 4 {
		ident.Choices = ident.Choices[:4]
	}
	return ident, nil
}

func emitIdentify(emit func(event), ident identification) {
	emit(event{"type": "identify", "appliance": ident.Appliance, "brand": ident.Brand, "model_number": ident.ModelNumber,
		"confidence": ident.Confidence, "symptom": ident.Symptom})
}

// emitTrack reports one parallel track's progress; the app shows each track as its own checklist row.
func emitTrack(emit func(event), track, state, title, detail string) {
	emit(event{"type": "track", "track": track, "state": state, "title": title, "detail": detail})
}

// fixSession lets a running fix wait for the user to answer a question sent down its SSE stream.
type fixSession struct {
	id      string
	answers chan string
	asked   int
}

var sessions sync.Map

func newSession() *fixSession {
	random := make([]byte, 12)
	rand.Read(random)
	session := &fixSession{id: hex.EncodeToString(random), answers: make(chan string, 1)}
	sessions.Store(session.id, session)
	return session
}

func (session *fixSession) close() { sessions.Delete(session.id) }

// ask emits a question and waits for the answer. It reports false when the question budget is spent,
// the user doesn't answer in time, or they leave. Questions are asked one at a time.
func (session *fixSession) ask(ctx context.Context, emit func(event), question string, choices []string) (string, bool) {
	if session.asked >= maxQuestions {
		return "", false
	}
	session.asked++
	select {
	case <-session.answers: // a stale answer to nothing
	default:
	}
	emit(event{"type": "question", "session": session.id, "question": question, "choices": choices})
	select {
	case answer := <-session.answers:
		return answer, true
	case <-time.After(questionTimeout):
		return "", false
	case <-ctx.Done():
		return "", false
	}
}

// answerSession hands an answer to a waiting session; false when there is no such session or it already has one.
func answerSession(id, answer string) bool {
	value, found := sessions.Load(id)
	if !found {
		return false
	}
	select {
	case value.(*fixSession).answers <- answer:
		return true
	default:
		return false
	}
}

type modelResult struct {
	rig       *rigCatalog
	generated *generatedRig
}

// followUp is a fix that didn't work: what was tried, so the next run goes after the next most likely cause.
type followUp struct {
	// RuledOut are the library fixes already tried ("entry/problem"), oldest first.
	RuledOut []string
	// Tried says what was tried in words, for research when the library has no next cause.
	Tried              string
	Brand, ModelNumber string
}

// readFollowUp reads what a "Still broken" request says was tried. Only real library fix ids are kept, and the
// free text is capped, since it goes into the model prompt.
func readFollowUp(request *http.Request) followUp {
	follow := followUp{Tried: clip(request.FormValue("tried"), 400), Brand: clip(request.FormValue("brand"), 60), ModelNumber: clip(request.FormValue("model_number"), 60)}
	for _, id := range strings.Split(request.FormValue("ruled_out"), ",") {
		if _, problem := findLibraryFix(strings.TrimSpace(id)); problem != nil && len(follow.RuledOut) < 10 {
			follow.RuledOut = append(follow.RuledOut, strings.TrimSpace(id))
		}
	}
	return follow
}

func clip(text string, limit int) string {
	runes := []rune(strings.TrimSpace(text))
	if len(runes) > limit {
		runes = runes[:limit]
	}
	return string(runes)
}

// runPipeline identifies the appliance fast, then builds the model, spots parts and researches the fix in
// parallel, asking the user when an answer would change the fix. The plan never waits on the model.
func runPipeline(requestCtx context.Context, photos []string, complaint string, follow followUp, session *fixSession, emit func(event)) error {
	// Tracks stop when research fails, so nothing emits after the stream closes.
	ctx, cancel := context.WithCancel(requestCtx)
	defer cancel()
	if follow.Tried != "" {
		complaint += "\nAlready tried, and it did not fix it: " + follow.Tried + ". Go after the next most likely cause; don't repeat those steps."
	}
	var ident identification
	var err error
	if next := nextFix(follow.RuledOut); next != "" {
		// The library knows the next most likely cause, so there's nothing to look at again.
		entry, _ := findLibraryFix(next)
		ident = identification{Appliance: entry.Appliance, Brand: follow.Brand, ModelNumber: follow.ModelNumber, Confidence: 1, LibraryFix: next}
	} else if ident, err = identify(ctx, photos, complaint, true); err != nil {
		// The first look is a shortcut, not a gate: research can still identify on its own.
		log.Printf("identify: %v", err)
	}
	log.Printf("identify: %s (%.2f) fix=%q question=%q", ident.Appliance, ident.Confidence, ident.LibraryFix, ident.Question)
	emitIdentify(emit, ident)

	var tracks sync.WaitGroup
	models := make(chan modelResult, 1)
	started := false
	startTracks := func(ident identification) {
		started = true
		tracks.Add(2)
		go func() {
			defer tracks.Done()
			models <- buildModel(ctx, ident, complaint, photos, emit)
		}()
		go func() {
			defer tracks.Done()
			spotParts(ctx, photos, ident, emit)
		}()
	}
	if ident.confident() {
		startTracks(ident)
	}
	if ident.Question != "" {
		if answer, answered := session.ask(ctx, emit, ident.Question, ident.Choices); answered {
			complaint += fmt.Sprintf("\nHelpa asked: %s\nThe user answered: %s", ident.Question, answer)
			// A second quick look with the answer can settle the appliance or match a ready fix,
			// which beats a full research run.
			if second, err := identify(ctx, photos, complaint, false); err == nil {
				ident = second
				emitIdentify(emit, ident)
			}
		}
	}
	if !started {
		startTracks(ident)
	}

	plan := libraryPlan(ident, complaint, follow.RuledOut, emit)
	if plan == nil {
		plan, err = research(ctx, photos, complaint, ident, session, emit)
	}
	if err != nil {
		cancel()
		tracks.Wait()
		return err
	}
	emit(event{"type": "plan", "plan": plan})
	showPlan(ctx, photos, plan, complaint, models, emit)
	tracks.Wait()
	return nil
}

// libraryPlan is the fastest path: when the first look matched a ready library fix outright and asked
// nothing, that fix is the plan and research is skipped. A fix already tried, or a complaint that says the
// machine differs from the library's ("coil burners" against a glass top), goes to research instead.
func libraryPlan(ident identification, complaint string, ruledOut []string, emit func(event)) json.RawMessage {
	entryID, problemID, found := strings.Cut(ident.LibraryFix, "/")
	if !found || ident.Question != "" || containsString(ruledOut, ident.LibraryFix) {
		return nil
	}
	// The first look named the fix; trust it when it is the same kind of machine and no other brand.
	entry := findLibraryEntry(entryID)
	if entry == nil || normalizeAppliance(entry.Appliance) != normalizeAppliance(ident.Appliance) || (ident.Brand != "" && !strings.EqualFold(entry.Brand, ident.Brand)) {
		return nil
	}
	if word := entry.contradiction(complaint + " " + ident.Appliance + " " + ident.Symptom); word != "" {
		log.Printf("library: %s doesn't fit, the person mentions %q", entry.ID, word)
		return nil
	}
	for _, problem := range entry.Problems {
		var plan map[string]any
		if problem.ID != problemID || json.Unmarshal(problem.Plan, &plan) != nil {
			continue
		}
		plan["library_id"], plan["library_problem"] = entry.ID, problem.ID
		if problem.Cause != "" {
			plan["cause"] = problem.Cause
		}
		// The sticker the person showed beats the library's example model number.
		if ident.ModelNumber != "" {
			plan["model_number"] = ident.ModelNumber
		}
		family, brand := entry.ModelFamily, entry.Brand
		// Without a brand we don't know it's this exact machine, so say so instead of naming one.
		if ident.Brand == "" {
			family, brand = fmt.Sprintf("Works on most %ss", entry.Appliance), ""
			plan["brand"] = ""
			if ident.ModelNumber == "" {
				plan["model_number"] = ""
			}
		}
		data, err := json.Marshal(plan)
		if err != nil {
			return nil
		}
		emit(event{"type": "library", "brand": brand, "appliance": entry.Appliance, "model_family": family})
		emitTrack(emit, "research", "done", "Found a ready fix", family)
		return data
	}
	return nil
}

// buildModel is the model track: a built-in rig when one fits (instant), otherwise an on-demand model.
// An empty result means the plan step falls back to a generic scene, then to no visual at all.
func buildModel(ctx context.Context, ident identification, complaint string, photos []string, emit func(event)) modelResult {
	if rig := matchRig(ident.Appliance); rig != nil && !rigContradicted(rig.ID, complaint+" "+ident.Appliance) {
		emitTrack(emit, "model", "done", "Found a 3D model", rig.Name)
		return modelResult{rig: rig}
	}
	if ident.Appliance == "" {
		return modelResult{}
	}
	emitTrack(emit, "model", "active", "Building your model", ident.Appliance)
	generated, err := generateModel(ctx, ident.Appliance, photos)
	if err != nil {
		log.Printf("generate model %q: %v", ident.Appliance, err)
		return modelResult{}
	}
	emitTrack(emit, "model", "done", "Your 3D model is ready", ident.Appliance)
	return modelResult{generated: generated}
}

// spotParts is the measure track: SAM highlights the parts the first look expects, with their rough sizes.
func spotParts(ctx context.Context, photos []string, ident identification, emit func(event)) {
	var targets []visiblePart
	for _, part := range ident.VisibleParts {
		if part.Photo >= 0 && part.Photo < len(photos) && strings.TrimSpace(part.Phrase) != "" {
			targets = append(targets, part)
		}
	}
	if len(targets) == 0 {
		return
	}
	emitTrack(emit, "measure", "active", "Spotting parts", "")
	var wait sync.WaitGroup
	var lock sync.Mutex
	spotted := 0
	for _, part := range targets {
		wait.Add(1)
		go func() {
			defer wait.Done()
			raw, err := segment(ctx, photos[part.Photo], part.Phrase)
			if err != nil {
				log.Printf("segment %q: %v", part.Phrase, err)
				return
			}
			found := strings.Count(raw, "<|mask")
			if found > 0 {
				lock.Lock()
				spotted++
				lock.Unlock()
			}
			emit(event{"type": "parts", "photo": part.Photo, "phrase": part.Phrase, "found": found, "size_cm": part.SizeCM, "sam": raw})
		}()
	}
	wait.Wait()
	emitTrack(emit, "measure", "done", fmt.Sprintf("Spotted %d of %d parts", spotted, len(targets)), "")
}
