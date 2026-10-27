package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

const maxAgentTurns = 12

const agentInstructions = `You are Helpa, a calm, patient repair guide for people who have never fixed anything.
The user sends photos (numbered from 0) and describes a problem with something in their home.
A quick first look has already identified the appliance and checked Helpa's library; both are in the
first message. Trust them unless the photos clearly disagree, and do not re-identify the appliance.

Work like this:
1. If a library match is given, trust it: reuse its manual, part locations and, when the symptom matches,
   its ready plan, adapting only what this user's case needs. Only search the web for what it does not cover.
   If the first look is clearly wrong or missing, call lookup_library once with the right appliance.
2. Otherwise use web search to find that model's official manual and the manufacturer's guidance.
   Prefer the manufacturer's own site. Find OEM replacement part numbers when a part may need replacing.
3. Only if the answer would change the fix and you truly cannot tell, call ask_user with one short question
   and 2 to 4 short choices. Use it at most once, and never ask what the photos or description already say.
4. Call submit_plan exactly once with the full plan, grounded in the manual.

Between tool calls, say in one short, friendly sentence what you are doing, as if talking to the user.
Make each step's target_part a short visual description of what the part looks like ("round mesh filter in
the floor of the tub"), with photo the index of the photo showing it. With no photos, use photo -1.

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
		"safety", "steps", "library_id", "library_problem", "pro_visit_cost", "aftercare"},
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
		"pro_visit_cost": map[string]any{"type": "integer", "description": "Typical US cost in dollars of paying a technician for THIS exact fix. " +
			"0 when people would not normally call anyone (cleaning a lint screen, pressing a reset button)."},
		"aftercare": map[string]any{"type": "string", "description": "One short tip to stop this happening again, e.g. 'Clean the lint screen after every load.'"},
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
		"name":        "ask_user",
		"description": "Ask the user one short question when the answer changes the fix. Returns their answer. Use sparingly.",
		"strict":      true,
		"parameters": map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"required":             []string{"question", "choices"},
			"properties": map[string]any{
				"question": map[string]any{"type": "string", "description": "One short spoken question."},
				"choices":  map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "2 to 4 short tappable answers, at most 5 words each."},
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

// research is the research-and-plan track: Muse Wonder with the first look and library match already in hand.
func research(ctx context.Context, photos []string, complaint string, ident identification, session *fixSession, emit func(event)) (json.RawMessage, error) {
	emitTrack(emit, "research", "active", "Finding the fix", "")
	brief := fmt.Sprintf("Problem: %s\nI attached %d photos.", complaint, len(photos))
	if ident.Appliance != "" {
		firstLook, _ := json.Marshal(map[string]any{"appliance": ident.Appliance, "brand": ident.Brand,
			"model_number": ident.ModelNumber, "confidence": ident.Confidence, "symptom": ident.Symptom})
		brief += "\nFirst look: " + string(firstLook)
		if entry := lookupLibrary(libraryQuery{ident.Appliance, ident.Brand, ident.ModelNumber}); entry != nil {
			emit(event{"type": "library", "brand": entry.Brand, "appliance": entry.Appliance, "model_family": entry.ModelFamily})
			brief += "\nLibrary match: " + entry.forAgent()
		} else {
			brief += "\nLibrary match: none. Research it on the web."
		}
	}
	input := []any{userMessage(brief, photos...)}
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
			return nil, err
		}
		for _, item := range items {
			input = append(input, item.raw)
		}
		if len(calls) == 0 {
			return nil, fmt.Errorf("agent stopped without submitting a plan")
		}
		for _, call := range calls {
			if call.Name == "submit_plan" {
				emitTrack(emit, "research", "done", "Plan ready", "")
				return json.RawMessage(call.Arguments), nil
			}
			output := runTool(ctx, call, session, emit)
			input = append(input, map[string]any{"type": "function_call_output", "call_id": call.CallID, "output": output})
		}
	}
	return nil, fmt.Errorf("agent ran out of turns")
}

func runTool(ctx context.Context, call outputItem, session *fixSession, emit func(event)) string {
	switch call.Name {
	case "lookup_library":
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
	case "ask_user":
		var args struct {
			Question string   `json:"question"`
			Choices  []string `json:"choices"`
		}
		if err := json.Unmarshal([]byte(call.Arguments), &args); err != nil {
			return "bad arguments: " + err.Error()
		}
		if len(args.Choices) > 4 {
			args.Choices = args.Choices[:4]
		}
		answer, answered := session.ask(ctx, emit, args.Question, args.Choices)
		if !answered {
			return "No answer. Do not ask again; go with the most likely case and say so in the diagnosis."
		}
		return "The user answered: " + answer
	}
	return "unknown tool " + call.Name
}
