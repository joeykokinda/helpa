package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
)

var vector3 = map[string]any{"type": "array", "items": map[string]any{"type": "number"}}

var motions = []string{"none", "twist_ccw", "twist_cw", "lift", "pull_out", "push_in", "press", "unscrew", "screw_in", "rinse"}

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

// afterPlan builds the 3D scene and highlights each step's part on its photo, in parallel.
func afterPlan(ctx context.Context, photos []string, plan json.RawMessage, emit func(event)) {
	var parsed struct {
		Steps []struct {
			TargetPart string `json:"target_part"`
			Photo      int    `json:"photo"`
		} `json:"steps"`
	}
	json.Unmarshal(plan, &parsed)
	var wait sync.WaitGroup
	wait.Add(1)
	go func() {
		defer wait.Done()
		emit(event{"type": "status", "text": "Building your 3D model"})
		scene, err := buildScene(ctx, photos, plan)
		if err != nil {
			emit(event{"type": "model_error", "message": err.Error()})
			return
		}
		emit(event{"type": "model", "scene": scene})
	}()
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
	wait.Wait()
}

var checkSchema = map[string]any{
	"type":                 "object",
	"additionalProperties": false,
	"required":             []string{"done", "feedback"},
	"properties": map[string]any{
		"done":     map[string]any{"type": "boolean"},
		"feedback": map[string]any{"type": "string", "description": "One short, kind spoken sentence. If not done, say exactly what to change."},
	},
}

// checkStep looks at a photo taken after a step and says whether the step looks done.
func checkStep(ctx context.Context, photo, instruction, expected string) (json.RawMessage, error) {
	prompt := fmt.Sprintf("The user was told: %q\nWhen done, it should look like: %q\nDoes this photo show the step done? Be encouraging, but don't pass it if it clearly isn't done.", instruction, expected)
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
