package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
)

var vector3 = map[string]any{"type": "array", "items": map[string]any{"type": "number"}}

var sceneSchema = map[string]any{
	"type":                 "object",
	"additionalProperties": false,
	"required":             []string{"parts", "step_animations"},
	"properties": map[string]any{
		"parts": map[string]any{"type": "array", "items": map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"required":             []string{"id", "label", "shape", "size", "position", "rotation", "color", "opacity"},
			"properties": map[string]any{
				"id":       map[string]any{"type": "string"},
				"label":    map[string]any{"type": "string", "description": "Plain words a beginner understands, 1-4 words."},
				"shape":    map[string]any{"type": "string", "enum": []string{"box", "rounded_box", "cylinder", "tube", "sphere", "cone", "torus", "capsule"}},
				"size":     vector3,
				"position": vector3,
				"rotation": vector3,
				"color":    map[string]any{"type": "string", "description": "Hex like #c8ccd2, close to the real part's color."},
				"opacity":  map[string]any{"type": "number", "description": "1 for parts, 0.15-0.3 for outer shells so the inside stays visible."},
			},
		}},
		"step_animations": map[string]any{"type": "array", "items": map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"required":             []string{"step", "part_ids", "motion", "axis", "distance", "caption"},
			"properties": map[string]any{
				"step":     map[string]any{"type": "integer"},
				"part_ids": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
				"motion":   map[string]any{"type": "string", "enum": motions},
				"axis":     map[string]any{"type": "string", "enum": []string{"x", "y", "z"}},
				"distance": map[string]any{"type": "number", "description": "How far the parts travel, in cm, for lift/pull_out/push_in."},
				"caption":  map[string]any{"type": "string", "description": "At most 6 words, e.g. 'Twist the filter left'."},
			},
		}},
	},
}

const sceneInstructions = `Build a simplified 3D diagram of the user's appliance from their photos and the repair plan,
like a friendly IKEA-style instruction model for a total beginner.

Coordinates are centimeters. The origin is the center of the appliance's floor, +y is up, +z points toward the user
(the front), +x is to the user's right. Size is [width, height, depth]. Rotation is degrees [x, y, z].
For cylinders, tubes and capsules, size is [diameter, length, diameter] along y before rotation.

Use real dimensions from the manual when you know them, otherwise estimate from the photos.
Include outer shells (cabinet, tub, open door) at opacity 0.15-0.3 so the inside stays visible, and model every part
any step touches as its own solid part, in its real place and color. Use 6 to 20 parts. Give ids like "filter".
Write one step_animation per plan step, in order, starting at 0. part_ids are the parts that move or matter in
that step; the first one is the camera focus.`

// buildScene asks Muse Spark for an animatable part-by-part 3D diagram of the appliance.
func buildScene(ctx context.Context, photos []string, plan json.RawMessage) (json.RawMessage, error) {
	reply, err := createResponse(ctx, map[string]any{
		"model":        "muse-spark-1.3",
		"instructions": sceneInstructions,
		"reasoning":    map[string]any{"effort": "low"},
		"input":        []any{userMessage("Repair plan:\n"+string(plan), photos...)},
		"text":         map[string]any{"format": map[string]any{"type": "json_schema", "name": "scene", "schema": sceneSchema, "strict": true}},
	})
	if err != nil {
		return nil, err
	}
	scene := json.RawMessage(reply.text())
	if !json.Valid(scene) {
		return nil, fmt.Errorf("scene was not valid json")
	}
	return scene, nil
}

// showPlan turns a plan into visuals: per-step photo highlights, and the 3D guide once the model track
// delivers. The model preference is a built-in rig, then a generated model, then a generic scene; if all of
// them fail the app falls back to text plus photo steps.
func showPlan(ctx context.Context, photos []string, plan json.RawMessage, complaint string, models <-chan modelResult, emit func(event)) {
	var parsed struct {
		Steps []struct {
			TargetPart string `json:"target_part"`
			Photo      int    `json:"photo"`
		} `json:"steps"`
		LibraryID      string `json:"library_id"`
		LibraryProblem string `json:"library_problem"`
		Appliance      string `json:"appliance"`
		StopForPro     bool   `json:"stop_for_pro"`
	}
	json.Unmarshal(plan, &parsed)
	// A safety stop (gas smell, sparking) shows no repair animation: the only move is to get out and call.
	if parsed.StopForPro {
		emit(event{"type": "model_error", "message": "safety stop: no repair to show"})
		return
	}
	var wait sync.WaitGroup
	for index, step := range parsed.Steps {
		if step.Photo < 0 || step.Photo >= len(photos) || strings.TrimSpace(step.TargetPart) == "" {
			continue
		}
		wait.Add(1)
		go func() {
			defer wait.Done()
			raw, err := segment(ctx, photos[step.Photo], step.TargetPart)
			if err != nil {
				return
			}
			emit(event{"type": "step_parts", "step": index, "photo": step.Photo, "found": strings.Count(raw, "<|mask"), "sam": raw})
		}()
	}
	defer wait.Wait()

	var model modelResult
	select {
	case model = <-models:
	case <-ctx.Done():
		return
	}
	if model.generated != nil {
		// A library fix on its entry's hand-made model already has its beats.
		if model.generated.LibraryID == parsed.LibraryID {
			if stepBeats := recipeBeats(parsed.LibraryID, parsed.LibraryProblem, len(parsed.Steps)); stepBeats != nil {
				emit(event{"type": "rig", "rig": "generated", "step_beats": stepBeats, "recipe": model.generated.Recipe, "catalog": model.generated.Catalog})
				return
			}
		}
		stepBeats, err := choreograph(ctx, &model.generated.Catalog, plan)
		if err == nil {
			emit(event{"type": "rig", "rig": "generated", "step_beats": stepBeats, "recipe": model.generated.Recipe, "catalog": model.generated.Catalog})
			return
		}
		log.Printf("choreograph generated model: %v", err)
	}
	rig := model.rig
	if rig == nil {
		// The plan can name the appliance better than a vague first look did.
		if candidate := matchRig(parsed.Appliance); candidate != nil && !rigContradicted(candidate.ID, complaint+" "+parsed.Appliance) {
			rig = candidate
		}
	}
	if rig != nil {
		stepBeats := cachedRigBeats(parsed.LibraryID, parsed.LibraryProblem, rig.ID, len(parsed.Steps))
		if stepBeats == nil {
			var err error
			if stepBeats, err = choreograph(ctx, rig, plan); err != nil {
				log.Printf("choreograph %s: %v", rig.ID, err)
			}
		}
		if stepBeats != nil {
			emit(event{"type": "rig", "rig": rig.ID, "step_beats": stepBeats})
			return
		}
	}
	var scene json.RawMessage
	var err error
	if entry := findLibraryEntry(parsed.LibraryID); entry != nil {
		scene, err = libraryScene(ctx, entry, plan, parsed.LibraryProblem, len(parsed.Steps))
	}
	if scene == nil {
		emit(event{"type": "status", "text": "Building your 3D model"})
		scene, err = buildScene(ctx, photos, plan)
	}
	if err != nil {
		emit(event{"type": "model_error", "message": err.Error()})
		return
	}
	emit(event{"type": "model", "scene": scene})
}

var checkSchema = map[string]any{
	"type":                 "object",
	"additionalProperties": false,
	"required":             []string{"status", "done", "evidence", "feedback", "mistake"},
	"properties": map[string]any{
		"status": map[string]any{"type": "string", "enum": []string{"COMPLETED", "INCOMPLETE", "UNCERTAIN"},
			"description": "COMPLETED only when the photo clearly shows the step done; UNCERTAIN when the angle, light or blur hides what matters."},
		"done":     map[string]any{"type": "boolean", "description": "True exactly when status is COMPLETED."},
		"evidence": map[string]any{"type": "string", "description": "What in the photo shows it, in a few words, e.g. 'the lint screen is out of its slot'."},
		"feedback": map[string]any{"type": "string", "description": "One short, kind spoken sentence. If not done, say exactly what to change; if uncertain, ask for the angle you need."},
		"mistake": map[string]any{"type": "string", "description": "Empty unless the person is clearly about to do something wrong: touching or holding the wrong part, " +
			"turning or pulling the wrong way, or doing steps out of order. Then one short spoken correction naming what they have and where the right part is, " +
			"e.g. 'That's the spray arm. The filter is the round cap just below it.'"},
	},
}

// checkStep looks at a photo taken after a step and says whether the step looks done. Live frames come from
// the camera while the person works, so they are often mid-step and only a clear mistake should be called out.
func checkStep(ctx context.Context, photo, instruction, expected, part string, live bool) (json.RawMessage, error) {
	prompt := fmt.Sprintf("The user was told: %q\nWhen done, it should look like: %q\n", instruction, expected)
	if part != "" {
		prompt += fmt.Sprintf("The part this step is about: %q\n", part)
	}
	if live {
		prompt += "This is a frame from their live camera after they tried the step. Judge the real machine, not any overlay. " +
			"COMPLETED only if it clearly is done, UNCERTAIN if you can't see the part well enough, otherwise INCOMPLETE. " +
			"If their hands are on the wrong part or doing the wrong move, say so in mistake."
	} else {
		prompt += "Does this photo show the step done? Be encouraging, but don't pass it if it clearly isn't done."
	}
	// Meta's open-weight Muse Spark Open checks first when it's configured; Muse Spark backs it up.
	if openWeightsKey != "" {
		result, err := checkStepOpen(ctx, photo, prompt)
		if err == nil {
			return result, nil
		}
		log.Printf("check on muse spark open, falling back: %v", err)
	}
	reply, err := createResponse(ctx, map[string]any{
		"model":     "muse-spark-1.3",
		"reasoning": map[string]any{"effort": "low"},
		"input":     []any{userMessage(prompt, photo)},
		"text":      map[string]any{"format": map[string]any{"type": "json_schema", "name": "check", "schema": checkSchema, "strict": true}},
	})
	if err != nil {
		return nil, err
	}
	return json.RawMessage(reply.text()), nil
}
