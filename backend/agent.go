package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
)

const maxAgentTurns = 12

const agentInstructions = `You are Helpa, a calm, patient repair guide for people who have never fixed anything.
The user sends photos (numbered from 0) and describes a problem with something in their home.

Work like this:
1. Work out the appliance type, brand and model, usually from a photo of the model sticker.
2. Call lookup_library with what you know. If it returns a matching appliance, trust it: reuse its manual,
   part locations and, when the symptom matches, its ready plan, adapting only what this user's case needs.
   Only search the web for what the library does not cover.
3. Otherwise use web search to find that model's official manual and the manufacturer's guidance.
   Prefer the manufacturer's own site. Find OEM replacement part numbers when a part may need replacing.
4. Call segment_parts on the photo that shows the parts, naming each part as a short visual description of
   what it looks like ("round mesh filter in the floor of the tub"), not manual jargon. If a part comes back
   with 0 found, try once more with a different description.
5. Call submit_plan exactly once with the full plan, grounded in the manual.

Between tool calls, say in one short, friendly sentence what you are doing, as if talking to the user.
If there are no photos, work from the description alone, skip segment_parts, and use photo -1 in steps.

` + simpleStepRules + `

Never invent part numbers or manual URLs. If something is unsafe for a beginner (gas, mains wiring,
refrigerant), say so in safety and stop at "call a pro".`

const simpleStepRules = `Steps are for a total beginner, like a busy parent with no tools experience:
- 3 to 7 steps. Each instruction is one plain action of at most 12 words ("Twist the filter left and lift it out").
- Put anything extra (how hard to twist, what it looks like, what to do if it is stuck) in details, at most 3 short lines.
- Set show_3d to true when knowing WHERE something is matters (a hidden filter, a reset button, a drain plug),
  false for steps like "unplug it" or "wait 5 minutes".
- No jargon. Say "the round screen in the floor of the tub", not "the micro filter assembly".`

var motions = []string{"none", "twist_ccw", "twist_cw", "lift", "pull_out", "push_in", "press", "unscrew", "screw_in", "rinse"}

var stepSchema = map[string]any{
	"type":                 "object",
	"additionalProperties": false,
	"required":             []string{"instruction", "details", "target_part", "photo", "motion", "show_3d", "check"},
	"properties": map[string]any{
		"instruction": map[string]any{"type": "string", "description": "One plain action, at most 12 words."},
		"details":     map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "0 to 3 short helpful lines."},
		"target_part": map[string]any{"type": "string", "description": "Visual noun phrase SAM can segment."},
		"photo":       map[string]any{"type": "integer", "description": "Index of the photo showing target_part, or -1."},
		"motion":      map[string]any{"type": "string", "enum": motions},
		"show_3d":     map[string]any{"type": "boolean", "description": "True when the 3D model helps show where the part is."},
		"check":       map[string]any{"type": "string", "description": "What a photo looks like once this step is done."},
	},
}

var planSchema = map[string]any{
	"type":                 "object",
	"additionalProperties": false,
	"required": []string{"brand", "model_number", "appliance", "manual_url", "diagnosis", "tools", "replacement_parts",
		"safety", "steps", "library_id", "library_problem"},
	"properties": map[string]any{
		"brand":             map[string]any{"type": "string"},
		"model_number":      map[string]any{"type": "string"},
		"appliance":         map[string]any{"type": "string", "description": "Plain name, e.g. 'top-load washer'."},
		"manual_url":        map[string]any{"type": "string"},
		"diagnosis":         map[string]any{"type": "string", "description": "Two short sentences a beginner understands."},
		"tools":             map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
		"replacement_parts": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
		"safety":            map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
		"steps":             map[string]any{"type": "array", "items": stepSchema},
		"library_id":        map[string]any{"type": "string", "description": "The lookup_library id this plan is based on, or empty."},
		"library_problem":   map[string]any{"type": "string", "description": "The library problem id reused unchanged, or empty."},
	},
}

var agentTools = []map[string]any{
	{"type": "web_search"},
	{
		"type":        "function",
		"name":        "lookup_library",
		"description": "Look up Helpa's pre-researched appliance library: manuals, where parts are, and ready fixes for common problems.",
		"strict":      true,
		"parameters": map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"required":             []string{"appliance", "brand", "model_number"},
			"properties": map[string]any{
				"appliance":    map[string]any{"type": "string", "description": "e.g. washer, dryer, dishwasher, range, microwave"},
				"brand":        map[string]any{"type": "string", "description": "Empty if unknown."},
				"model_number": map[string]any{"type": "string", "description": "Empty if unknown."},
			},
		},
	},
	{
		"type":        "function",
		"name":        "segment_parts",
		"description": "Highlight parts in one of the user's photos. Returns how many instances of each phrase were found.",
		"strict":      true,
		"parameters": map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"required":             []string{"photo", "phrases"},
			"properties": map[string]any{
				"photo":   map[string]any{"type": "integer"},
				"phrases": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
			},
		},
	},
	{
		"type":        "function",
		"name":        "submit_plan",
		"description": "Submit the final repair plan. Call exactly once, last.",
		"strict":      true,
		"parameters":  planSchema,
	},
}

type event map[string]any

// runAgent drives Muse Wonder through the repair tools, emitting progress as it goes.
func runAgent(ctx context.Context, photos []string, complaint string, emit func(event)) error {
	input := []any{userMessage(fmt.Sprintf("Problem: %s\nI attached %d photos.", complaint, len(photos)), photos...)}
	for turn := 0; turn < maxAgentTurns; turn++ {
		var calls []outputItem
		items, err := streamResponse(ctx, map[string]any{
			"model":        "muse-wonder-1.0",
			"instructions": agentInstructions,
			"reasoning":    map[string]any{"effort": "low"},
			"tools":        agentTools,
			"input":        input,
		}, func(item outputItem) {
			switch item.Type {
			case "message":
				if text := strings.TrimSpace(item.text()); text != "" {
					emit(event{"type": "say", "text": text})
				}
			case "web_search_call":
				emit(event{"type": "search", "action": item.Action})
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
			return fmt.Errorf("agent stopped without submitting a plan")
		}
		for _, call := range calls {
			if call.Name == "submit_plan" {
				plan := json.RawMessage(call.Arguments)
				emit(event{"type": "plan", "plan": plan})
				afterPlan(ctx, photos, plan, emit)
				return nil
			}
			output := runTool(ctx, call, photos, emit)
			input = append(input, map[string]any{"type": "function_call_output", "call_id": call.CallID, "output": output})
		}
	}
	return fmt.Errorf("agent ran out of turns")
}

func runTool(ctx context.Context, call outputItem, photos []string, emit func(event)) string {
	if call.Name == "lookup_library" {
		var query libraryQuery
		if err := json.Unmarshal([]byte(call.Arguments), &query); err != nil {
			return "bad arguments: " + err.Error()
		}
		entry := lookupLibrary(query)
		if entry == nil {
			return "No library match. Research it on the web."
		}
		emit(event{"type": "library", "brand": entry.Brand, "appliance": entry.Appliance, "model_family": entry.ModelFamily})
		return entry.forAgent()
	}
	if call.Name != "segment_parts" {
		return "unknown tool " + call.Name
	}
	var args struct {
		Photo   int      `json:"photo"`
		Phrases []string `json:"phrases"`
	}
	if err := json.Unmarshal([]byte(call.Arguments), &args); err != nil {
		return "bad arguments: " + err.Error()
	}
	if args.Photo < 0 || args.Photo >= len(photos) {
		return fmt.Sprintf("photo must be between 0 and %d", len(photos)-1)
	}
	results := make([]string, len(args.Phrases))
	var wait sync.WaitGroup
	for index, phrase := range args.Phrases {
		wait.Add(1)
		go func() {
			defer wait.Done()
			raw, err := segment(ctx, photos[args.Photo], phrase)
			if err != nil {
				results[index] = fmt.Sprintf("%s: error %v", phrase, err)
				return
			}
			found := strings.Count(raw, "<|mask")
			emit(event{"type": "parts", "photo": args.Photo, "phrase": phrase, "found": found, "sam": raw})
			results[index] = fmt.Sprintf("%s: %d found", phrase, found)
		}()
	}
	wait.Wait()
	return strings.Join(results, "\n")
}
