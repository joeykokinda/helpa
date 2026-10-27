package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

//go:embed library
var libraryFiles embed.FS

type libraryPart struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Where string `json:"where"`
}

type libraryProblem struct {
	ID             string          `json:"id"`
	Symptoms       []string        `json:"symptoms"`
	Plan           json.RawMessage `json:"plan"`
	StepAnimations json.RawMessage `json:"step_animations,omitempty"`
}

type libraryEntry struct {
	ID              string           `json:"id"`
	Appliance       string           `json:"appliance"`
	Brand           string           `json:"brand"`
	ModelFamily     string           `json:"model_family"`
	ModelNumbers    []string         `json:"model_numbers"`
	StickerLocation string           `json:"sticker_location"`
	ManualURLs      []string         `json:"manual_urls"`
	Parts           []libraryPart    `json:"parts"`
	Problems        []libraryProblem `json:"problems"`
	Scene           json.RawMessage  `json:"scene,omitempty"`
}

type libraryQuery struct {
	Appliance   string `json:"appliance"`
	Brand       string `json:"brand"`
	ModelNumber string `json:"model_number"`
}

var library = loadLibrary()

func loadLibrary() []libraryEntry {
	var entries []libraryEntry
	paths, _ := filepath.Glob("library/*.json")
	if len(paths) == 0 {
		embedded, _ := libraryFiles.ReadDir("library")
		for _, file := range embedded {
			if strings.HasSuffix(file.Name(), ".json") {
				paths = append(paths, "embed:library/"+file.Name())
			}
		}
	}
	for _, path := range paths {
		var data []byte
		var err error
		if embeddedPath, found := strings.CutPrefix(path, "embed:"); found {
			data, err = libraryFiles.ReadFile(embeddedPath)
		} else {
			data, err = os.ReadFile(path)
		}
		var entry libraryEntry
		if err == nil {
			err = json.Unmarshal(data, &entry)
		}
		if err != nil {
			log.Printf("library: skipping %s: %v", path, err)
			continue
		}
		entries = append(entries, entry)
	}
	log.Printf("library: %d appliances", len(entries))
	return entries
}

var applianceSynonyms = map[string]string{
	"washing machine": "washer", "clothes washer": "washer", "top-load washer": "washer", "front-load washer": "washer",
	"clothes dryer": "dryer", "tumble dryer": "dryer",
	"oven": "range", "stove": "range", "cooktop": "range", "electric range": "range",
	"over-the-range microwave": "microwave", "microwave oven": "microwave",
}

func normalizeAppliance(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	if canonical, found := applianceSynonyms[name]; found {
		return canonical
	}
	for _, canonical := range []string{"dishwasher", "microwave", "washer", "dryer", "range"} {
		if strings.Contains(name, canonical) {
			return canonical
		}
	}
	for synonym, canonical := range applianceSynonyms {
		if strings.Contains(name, synonym) {
			return canonical
		}
	}
	return name
}

// lookupLibrary finds the best pre-researched appliance for a query, or nil when nothing fits.
// A known brand that differs from every entry returns nil, since part locations vary by brand.
func lookupLibrary(query libraryQuery) *libraryEntry {
	appliance := normalizeAppliance(query.Appliance)
	brand := strings.ToLower(strings.TrimSpace(query.Brand))
	model := strings.ToUpper(strings.ReplaceAll(query.ModelNumber, " ", ""))
	var best *libraryEntry
	bestScore := 0
	for index := range library {
		entry := &library[index]
		if normalizeAppliance(entry.Appliance) != appliance {
			continue
		}
		score := 1
		if brand != "" {
			if !strings.EqualFold(entry.Brand, brand) {
				continue
			}
			score += 2
		}
		for _, known := range entry.ModelNumbers {
			prefix := strings.ToUpper(known)
			if len(prefix) > 6 {
				prefix = prefix[:6]
			}
			if model != "" && strings.HasPrefix(model, prefix) {
				score += 4
				break
			}
		}
		if score > bestScore {
			best, bestScore = entry, score
		}
	}
	return best
}

func findLibraryEntry(id string) *libraryEntry {
	for index := range library {
		if library[index].ID == id {
			return &library[index]
		}
	}
	return nil
}

// forAgent is the library entry as the agent sees it: everything but the 3D geometry.
func (entry libraryEntry) forAgent() string {
	entry.Scene = nil
	for index := range entry.Problems {
		entry.Problems[index].StepAnimations = nil
	}
	data, _ := json.Marshal(entry)
	return string(data)
}

// sceneParts returns the entry's 3D parts and their ids.
func (entry libraryEntry) sceneParts() (json.RawMessage, []string) {
	var scene struct {
		Parts []struct {
			ID string `json:"id"`
		} `json:"parts"`
		Raw json.RawMessage `json:"-"`
	}
	var whole map[string]json.RawMessage
	json.Unmarshal(entry.Scene, &whole)
	json.Unmarshal(entry.Scene, &scene)
	ids := make([]string, len(scene.Parts))
	for index, part := range scene.Parts {
		ids[index] = part.ID
	}
	return whole["parts"], ids
}

const animateInstructions = `Map each step of a repair plan onto parts of an existing 3D model of the appliance.
For every plan step, in order and starting at 0, list the part_ids that move or matter (the first is the camera
focus), the motion, the axis it moves along (+y up, +z toward the user, +x to the user's right), how far in cm,
and a caption of at most 6 words.`

// animateSteps maps plan steps onto an existing set of 3D parts.
func animateSteps(ctx context.Context, partsJSON json.RawMessage, partIDs []string, plan json.RawMessage) (json.RawMessage, error) {
	schema := map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"required":             []string{"step_animations"},
		"properties": map[string]any{
			"step_animations": map[string]any{"type": "array", "items": map[string]any{
				"type":                 "object",
				"additionalProperties": false,
				"required":             []string{"step", "part_ids", "motion", "axis", "distance", "caption"},
				"properties": map[string]any{
					"step":     map[string]any{"type": "integer"},
					"part_ids": map[string]any{"type": "array", "items": map[string]any{"type": "string", "enum": partIDs}},
					"motion":   map[string]any{"type": "string", "enum": motions},
					"axis":     map[string]any{"type": "string", "enum": []string{"x", "y", "z"}},
					"distance": map[string]any{"type": "number"},
					"caption":  map[string]any{"type": "string"},
				},
			}},
		},
	}
	reply, err := createResponse(ctx, map[string]any{
		"model":        "muse-spark-1.3",
		"instructions": animateInstructions,
		"reasoning":    map[string]any{"effort": "low"},
		"input":        []any{userMessage("3D parts:\n" + string(partsJSON) + "\n\nRepair plan:\n" + string(plan))},
		"text":         map[string]any{"format": map[string]any{"type": "json_schema", "name": "animations", "schema": schema, "strict": true}},
	})
	if err != nil {
		return nil, err
	}
	var parsed struct {
		StepAnimations json.RawMessage `json:"step_animations"`
	}
	if err := json.Unmarshal([]byte(reply.text()), &parsed); err != nil {
		return nil, err
	}
	return parsed.StepAnimations, nil
}

// libraryScene builds the 3D model event for a plan based on a library entry, reusing cached
// animations when the plan is one of the entry's ready-made fixes.
func libraryScene(ctx context.Context, entry *libraryEntry, plan json.RawMessage, problemID string, stepCount int) (json.RawMessage, error) {
	partsJSON, partIDs := entry.sceneParts()
	if len(partIDs) == 0 {
		return nil, fmt.Errorf("library entry %s has no 3D model", entry.ID)
	}
	var animations json.RawMessage
	for _, problem := range entry.Problems {
		var cached []json.RawMessage
		if problem.ID == problemID && json.Unmarshal(problem.StepAnimations, &cached) == nil && len(cached) == stepCount {
			animations = problem.StepAnimations
		}
	}
	if animations == nil {
		var err error
		if animations, err = animateSteps(ctx, partsJSON, partIDs, plan); err != nil {
			return nil, err
		}
	}
	return json.Marshal(map[string]json.RawMessage{"parts": partsJSON, "step_animations": animations})
}

type libraryTarget struct {
	ID        string
	Appliance string
	Brief     string
}

var libraryTargets = []libraryTarget{
	{"whirlpool-top-load-washer", "washer", "Whirlpool's best-selling current top-load washer in the US (agitator or impeller)"},
	{"whirlpool-front-load-washer", "washer", "Whirlpool's best-selling current front-load washer in the US"},
	{"whirlpool-electric-dryer", "dryer", "Whirlpool's best-selling current electric dryer in the US"},
	{"whirlpool-dishwasher", "dishwasher", "Whirlpool's best-selling current built-in dishwasher in the US"},
	{"whirlpool-electric-range", "range", "Whirlpool's best-selling current freestanding electric range (oven plus cooktop) in the US"},
	{"whirlpool-otr-microwave", "microwave", "Whirlpool's best-selling current over-the-range microwave in the US"},
}

const researchInstructions = `You are building Helpa's appliance library: the reference a beginner repair guide relies on.
Research the appliance described, using the manufacturer's own manuals and support pages first.

Produce, through submit_profile:
- The model family, 3 to 10 real model numbers it covers, and where the model sticker is.
- Official manual URLs you actually opened.
- Every part a home user touches for care or simple fixes (filters, drain pump access, lint screens, racks,
  spray arms, door seals, reset buttons, light bulbs, knobs, feet, vents, grease filters), each with a stable
  snake_case id, a plain label, and where it is in words a beginner understands.
- The 5 to 7 most common problems owners have that a beginner can safely fix or check, each with symptoms
  in the owner's own words and a complete plan from the manufacturer's guidance.

` + simpleStepRules + `

In plans, use photo -1, set library_id and library_problem to empty strings, and make each step's target_part
the plain label of the part it acts on. Never invent part numbers or URLs.`

const libraryModelInstructions = `Build a detailed but friendly 3D diagram of this appliance from its library profile, like a
clean IKEA-style instruction model. Model the outer body as see-through shells and every part from the
profile as its own solid part, in its real position, at real size, in its real color. Use each profile part id
exactly, and add only structural parts (cabinet, door, top, tub, drum) beyond them. Use 15 to 40 parts.

Coordinates are centimeters. The origin is the center of the appliance's floor, +y is up, +z points toward the
user (the front), +x is to the user's right. Size is [width, height, depth]. Rotation is degrees [x, y, z].
For cylinders, tubes and capsules, size is [diameter, length, diameter] along y before rotation.
Doors and lids are shown open when that is how a user reaches the parts. Leave step_animations empty.`

// buildLibrary researches each target with Muse Wonder and writes library/<id>.json.
func buildLibrary(ctx context.Context, onlyIDs []string) error {
	var wait sync.WaitGroup
	for _, target := range libraryTargets {
		if len(onlyIDs) > 0 && !containsString(onlyIDs, target.ID) {
			continue
		}
		wait.Add(1)
		go func() {
			defer wait.Done()
			if err := buildLibraryEntry(ctx, target); err != nil {
				log.Printf("library %s: %v", target.ID, err)
			}
		}()
	}
	wait.Wait()
	return nil
}

func buildLibraryEntry(ctx context.Context, target libraryTarget) error {
	logf := func(format string, args ...any) {
		log.Printf("library %s: "+format, append([]any{target.ID}, args...)...)
	}
	profileSchema := map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"required":             []string{"appliance", "brand", "model_family", "model_numbers", "sticker_location", "manual_urls", "parts", "problems"},
		"properties": map[string]any{
			"appliance":        map[string]any{"type": "string"},
			"brand":            map[string]any{"type": "string"},
			"model_family":     map[string]any{"type": "string"},
			"model_numbers":    map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
			"sticker_location": map[string]any{"type": "string"},
			"manual_urls":      map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
			"parts": map[string]any{"type": "array", "items": map[string]any{
				"type":                 "object",
				"additionalProperties": false,
				"required":             []string{"id", "label", "where"},
				"properties": map[string]any{
					"id": map[string]any{"type": "string"}, "label": map[string]any{"type": "string"}, "where": map[string]any{"type": "string"},
				},
			}},
			"problems": map[string]any{"type": "array", "items": map[string]any{
				"type":                 "object",
				"additionalProperties": false,
				"required":             []string{"id", "symptoms", "plan"},
				"properties": map[string]any{
					"id":       map[string]any{"type": "string"},
					"symptoms": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
					"plan":     planSchema,
				},
			}},
		},
	}
	tools := []map[string]any{
		{"type": "web_search"},
		{"type": "function", "name": "submit_profile", "description": "Submit the finished library profile. Call once, last.", "strict": true, "parameters": profileSchema},
	}
	input := []any{userMessage(fmt.Sprintf("Appliance to research: %s. Appliance type: %s.", target.Brief, target.Appliance))}
	var profile json.RawMessage
	for turn := 0; turn < 20 && profile == nil; turn++ {
		var calls []outputItem
		items, err := streamResponse(ctx, map[string]any{
			"model":        "muse-wonder-1.0",
			"instructions": researchInstructions,
			"reasoning":    map[string]any{"effort": "high"},
			"tools":        tools,
			"input":        input,
		}, func(item outputItem) {
			switch item.Type {
			case "web_search_call":
				logf("search %s", item.Action)
			case "function_call":
				calls = append(calls, item)
			}
		})
		if err != nil {
			return err
		}
		for _, item := range items {
			input = append(input, item.raw)
		}
		if len(calls) == 0 {
			input = append(input, userMessage("Call submit_profile now with what you have found."))
		}
		for _, call := range calls {
			if call.Name == "submit_profile" {
				profile = json.RawMessage(call.Arguments)
			}
		}
	}
	if profile == nil {
		return fmt.Errorf("research never submitted a profile")
	}
	var entry libraryEntry
	if err := json.Unmarshal(profile, &entry); err != nil {
		return err
	}
	entry.ID = target.ID
	logf("profile: %s, %d parts, %d problems", entry.ModelFamily, len(entry.Parts), len(entry.Problems))

	partsOnly := map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"required":             []string{"parts"},
		"properties":           map[string]any{"parts": sceneSchema["properties"].(map[string]any)["parts"]},
	}
	reply, err := createResponse(ctx, map[string]any{
		"model":        "muse-wonder-1.0",
		"instructions": libraryModelInstructions,
		"reasoning":    map[string]any{"effort": "high"},
		"input":        []any{userMessage("Library profile:\n" + string(profile))},
		"text":         map[string]any{"format": map[string]any{"type": "json_schema", "name": "model", "schema": partsOnly, "strict": true}},
	})
	if err != nil {
		return fmt.Errorf("3D model: %w", err)
	}
	entry.Scene = json.RawMessage(reply.text())
	partsJSON, partIDs := entry.sceneParts()
	logf("3D model: %d parts", len(partIDs))

	var wait sync.WaitGroup
	for index := range entry.Problems {
		wait.Add(1)
		go func() {
			defer wait.Done()
			animations, err := animateSteps(ctx, partsJSON, partIDs, entry.Problems[index].Plan)
			if err != nil {
				logf("animations for %s: %v", entry.Problems[index].ID, err)
				return
			}
			entry.Problems[index].StepAnimations = animations
		}()
	}
	wait.Wait()

	data, err := json.MarshalIndent(entry, "", "  ")
	if err != nil {
		return err
	}
	path := filepath.Join("library", target.ID+".json")
	logf("wrote %s", path)
	return os.WriteFile(path, data, 0o644)
}

func containsString(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}
