package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"log"
	"slices"
	"strings"
)

// The rig catalogs are the app's built-in appliance models (app/app/components/rig/catalogs), copied here by
// tools/sync_rigs.sh so the backend knows which parts exist and how each one can move.
//
//go:embed rigs
var rigFiles embed.FS

type rigPart struct {
	ID      string   `json:"id"`
	Label   string   `json:"label"`
	Aliases []string `json:"aliases"`
	Actions []string `json:"actions"`
	Rest    float64  `json:"rest,omitempty"`
}

type rigCatalog struct {
	ID      string    `json:"id"`
	Name    string    `json:"name"`
	Matches []string  `json:"matches"`
	Parts   []rigPart `json:"parts"`
}

type beat struct {
	Part    string `json:"part"`
	Action  string `json:"action"`
	Caption string `json:"caption"`
}

var rigCatalogs = loadRigCatalogs()

func loadRigCatalogs() []rigCatalog {
	var catalogs []rigCatalog
	files, _ := rigFiles.ReadDir("rigs")
	for _, file := range files {
		if !strings.HasSuffix(file.Name(), ".json") {
			continue
		}
		data, err := rigFiles.ReadFile("rigs/" + file.Name())
		var catalog rigCatalog
		if err == nil {
			err = json.Unmarshal(data, &catalog)
		}
		if err != nil {
			log.Printf("rigs: skipping %s: %v", file.Name(), err)
			continue
		}
		// A catalog without parts is a placeholder for an appliance not modelled yet.
		if len(catalog.Parts) > 0 {
			catalogs = append(catalogs, catalog)
		}
	}
	log.Printf("rigs: %d built-in appliance models", len(catalogs))
	return catalogs
}

// matchRig picks the built-in model for an appliance name, preferring the longest matching phrase
// so "front-load washer" beats plain "washer".
func matchRig(appliance string) *rigCatalog {
	name := strings.ToLower(appliance)
	var best *rigCatalog
	bestLength := 0
	for index := range rigCatalogs {
		for _, phrase := range rigCatalogs[index].Matches {
			if containsWords(name, strings.ToLower(phrase)) && len(phrase) > bestLength {
				best, bestLength = &rigCatalogs[index], len(phrase)
			}
		}
	}
	return best
}

func findRig(id string) *rigCatalog {
	for index := range rigCatalogs {
		if rigCatalogs[index].ID == id {
			return &rigCatalogs[index]
		}
	}
	return nil
}

const choreographInstructions = `You turn a beginner's repair plan into animation beats on a 3D model of their appliance.
For every plan step, in order, list the beats that SHOW that step: each beat is one part doing one action.
Break steps into their real physical sequence, e.g. "clean the lint screen" is: lint_screen remove, lint clean,
lint_screen insert. Open doors or drawers before reaching inside them, and close them when the step ends if the
person would. Use only actions listed for that part. Use "look" to point at a part without moving it.
Show something whenever a listed part is involved: unplugging is "remove" on the plug or power cord, cleaning
or rinsing is "clean" on the matching debris part (lint, scraps, grime), checking is "look". Only a step that
touches no listed part at all (wait 5 minutes, flip the breaker) gets an empty beats list.
For twist-off parts (filters, caps, bulbs), "unlock" is only the turn and "remove" is the lift out, so use both:
"unlock" then "remove", and "insert" then "lock" to put it back. Parts marked "starts_open" are open before any
step (water taps are normally on); close them only when the plan says to turn them off.
Captions are at most 6 plain words, like "Twist the filter left".`

// choreograph maps a plan's steps onto a rig's parts and actions.
func choreograph(ctx context.Context, catalog *rigCatalog, plan json.RawMessage) ([][]beat, error) {
	partIDs := make([]string, len(catalog.Parts))
	actionSet := map[string]bool{}
	for index, part := range catalog.Parts {
		partIDs[index] = part.ID
		for _, action := range part.Actions {
			actionSet[action] = true
		}
	}
	actions := make([]string, 0, len(actionSet))
	for action := range actionSet {
		actions = append(actions, action)
	}
	slices.Sort(actions)
	beatSchema := map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"required":             []string{"part", "action", "caption"},
		"properties": map[string]any{
			"part":    map[string]any{"type": "string", "enum": partIDs},
			"action":  map[string]any{"type": "string", "enum": actions},
			"caption": map[string]any{"type": "string"},
		},
	}
	schema := map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"required":             []string{"steps"},
		"properties": map[string]any{
			"steps": map[string]any{"type": "array", "items": map[string]any{
				"type":                 "object",
				"additionalProperties": false,
				"required":             []string{"beats"},
				"properties":           map[string]any{"beats": map[string]any{"type": "array", "items": beatSchema}},
			}},
		},
	}
	type partForPrompt struct {
		ID         string   `json:"id"`
		Label      string   `json:"label"`
		Actions    []string `json:"actions"`
		StartsOpen bool     `json:"starts_open,omitempty"`
	}
	described := make([]partForPrompt, len(catalog.Parts))
	for index, part := range catalog.Parts {
		described[index] = partForPrompt{part.ID, part.Label, part.Actions, part.Rest > 0}
	}
	parts, _ := json.Marshal(described)
	reply, err := createResponse(ctx, map[string]any{
		"model":        "muse-spark-1.3",
		"instructions": choreographInstructions,
		"reasoning":    map[string]any{"effort": "low"},
		"input":        []any{userMessage(fmt.Sprintf("Appliance model: %s\nParts and their allowed actions:\n%s\n\nRepair plan:\n%s", catalog.Name, parts, plan))},
		"text":         map[string]any{"format": map[string]any{"type": "json_schema", "name": "beats", "schema": schema, "strict": true}},
	})
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Steps []struct {
			Beats []beat `json:"beats"`
		} `json:"steps"`
	}
	if err := json.Unmarshal([]byte(reply.text()), &parsed); err != nil {
		return nil, err
	}
	allowed := map[string][]string{}
	for _, part := range catalog.Parts {
		allowed[part.ID] = part.Actions
	}
	stepBeats := make([][]beat, len(parsed.Steps))
	for index, step := range parsed.Steps {
		stepBeats[index] = []beat{}
		for _, candidate := range step.Beats {
			// The schema can't tie actions to parts, so drop any pairing the model doesn't allow.
			if slices.Contains(allowed[candidate.Part], candidate.Action) {
				stepBeats[index] = append(stepBeats[index], candidate)
			}
		}
	}
	return stepBeats, nil
}

// containsWords reports whether phrase appears in text as whole words, so "car" doesn't match "carpet".
func containsWords(text, phrase string) bool {
	for start := 0; ; {
		index := strings.Index(text[start:], phrase)
		if index < 0 {
			return false
		}
		begin, end := start+index, start+index+len(phrase)
		boundary := func(position int) bool {
			if position < 0 || position >= len(text) {
				return true
			}
			character := text[position]
			return !(character >= 'a' && character <= 'z' || character >= '0' && character <= '9')
		}
		if boundary(begin-1) && boundary(end) {
			return true
		}
		start = begin + 1
	}
}
