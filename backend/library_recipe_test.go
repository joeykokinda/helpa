package main

import (
	"encoding/json"
	"slices"
	"testing"
)

// Every library entry with a hand-made model loads it, and its fixes animate only parts and actions the model has.
func TestLibraryRecipesAndBeats(t *testing.T) {
	found := 0
	for index := range library {
		entry := &library[index]
		if entry.Recipe == "" {
			continue
		}
		found++
		rig := libraryRig(entry)
		if rig == nil {
			t.Fatalf("%s: model %q doesn't load", entry.ID, entry.Recipe)
		}
		var built recipe
		json.Unmarshal(rig.Recipe, &built)
		joints := map[string]string{}
		for _, part := range built.Parts {
			joints[part.Node] = part.Joint
			for _, action := range part.Actions {
				if !slices.Contains(jointActions[part.Joint], action) {
					t.Errorf("%s: part %s can't %s with a %s joint", entry.Recipe, part.Node, action, part.Joint)
				}
			}
		}
		for _, problem := range entry.Problems {
			var plan struct {
				Steps []json.RawMessage `json:"steps"`
			}
			json.Unmarshal(problem.Plan, &plan)
			if len(problem.RigBeats) != len(plan.Steps) {
				t.Errorf("%s/%s: %d steps but %d beat lists", entry.ID, problem.ID, len(plan.Steps), len(problem.RigBeats))
			}
			for _, beats := range problem.RigBeats {
				for _, beat := range beats {
					joint, known := joints[beat.Part]
					if !known {
						t.Errorf("%s/%s: beat on unknown part %q", entry.ID, problem.ID, beat.Part)
						continue
					}
					if !slices.Contains(jointActions[joint], beat.Action) {
						t.Errorf("%s/%s: %s can't %s", entry.ID, problem.ID, beat.Part, beat.Action)
					}
				}
			}
			if problem.Next != "" {
				if _, next := findLibraryFix(entry.ID + "/" + problem.Next); next == nil {
					t.Errorf("%s/%s: next %q doesn't exist", entry.ID, problem.ID, problem.Next)
				}
			}
		}
		if got := libraryRecipeFor(entry.Appliance); got == nil {
			t.Errorf("%s: %q doesn't find its own model", entry.ID, entry.Appliance)
		}
	}
	if found < 8 {
		t.Errorf("only %d library entries have hand-made models", found)
	}
}

// The words people use land on the right kind of thing.
func TestNormalizeHomeThings(t *testing.T) {
	cases := map[string]string{
		"two-piece toilet": "toilet", "kitchen faucet": "sink", "bathroom sink": "sink", "fridge": "refrigerator",
		"smoke detector": "smoke alarm", "GFCI outlet": "outlet", "range hood": "range hood", "gas furnace": "hvac",
		"shower head": "shower", "front-load washer": "washer", "water heater": "water heater", "interior door": "door",
		"Garbage disposal under a kitchen sink": "garbage disposal", "garbage disposal": "garbage disposal",
	}
	for input, want := range cases {
		if got := normalizeAppliance(input); got != want {
			t.Errorf("normalizeAppliance(%q) = %q, want %q", input, got, want)
		}
	}
}
