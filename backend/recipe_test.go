package main

import (
	"bytes"
	"encoding/json"
	"os"
	"testing"
)

// The schema and reference recipes are embedded copies of the app's files; they must not drift.
func TestRecipeFilesMatchApp(t *testing.T) {
	for backend, app := range map[string]string{
		"blueprints/recipe.schema.json":               "../app/app/components/rig/recipes/recipe.schema.json",
		"blueprints/references/garbage_disposal.json": "../app/app/components/rig/recipes/examples/garbage_disposal.json",
		"blueprints/references/toilet.json":           "../app/app/components/rig/recipes/examples/toilet.json",
	} {
		ours, _ := os.ReadFile(backend)
		theirs, err := os.ReadFile(app)
		if err != nil || !bytes.Equal(ours, theirs) {
			t.Errorf("%s differs from %s: cp %s %s", backend, app, app, backend)
		}
	}
}

func TestMatchBlueprint(t *testing.T) {
	for appliance, want := range map[string]string{
		"InSinkErator Badger 5 garbage disposal": "garbage_disposal",
		"running toilet":                         "toilet",
		"2015 Honda Civic engine":                "car_engine_bay",
		"kitchen sink faucet":                    "sink",
		"Rheem gas water heater":                 "water_heater",
		"GE French door refrigerator":            "refrigerator",
		"Carrier gas furnace":                    "furnace_hvac",
		"road bike":                              "bicycle",
		"over-the-range hood fan":                "range_hood",
		"Breville toaster":                       "generic",
	} {
		if got := matchBlueprint(appliance); got == nil || got.ID != want {
			t.Errorf("matchBlueprint(%q) = %v, want %s", appliance, got, want)
		}
	}
}

// The hand-written references must already be valid and complete for their blueprints.
func TestReferenceRecipesNeedNoRepairs(t *testing.T) {
	for name, compact := range referenceRecipes {
		var built recipe
		if err := json.Unmarshal([]byte(compact), &built); err != nil {
			t.Fatal(err)
		}
		chosen := findBlueprint(name)
		if repairs := repairRecipe(&built, chosen); len(repairs) > 0 {
			t.Errorf("%s needed repairs: %v", name, repairs)
		}
	}
}

func TestRepairFixesBrokenRecipe(t *testing.T) {
	built := recipe{
		Name: "broken",
		Nodes: []recipeNode{
			{ID: "a", Parent: "b", Shape: "lathe", Size: []float64{-1}, Material: "unobtainium"},
			{ID: "a", Parent: "a", Shape: "box", Size: []float64{0.1, 0.1, 0.1}},
			{ID: "b", Parent: "a", Shape: "hose"},
		},
		Parts: []recipePart{{Node: "a", Joint: "hinge", Actions: []string{"press", "open"}, Amount: 5000}, {Node: "ghost", Joint: "slide"}},
	}
	repairRecipe(&built, findBlueprint("toilet"))
	if built.Nodes[1].ID == "a" || built.Nodes[0].Shape != "cylinder" || built.Nodes[2].Shape != "group" || built.Nodes[0].Material != "plastic" {
		t.Errorf("nodes not repaired: %+v", built.Nodes[:3])
	}
	part := built.Parts[0]
	if part.Amount != 720 || len(part.Actions) != 2 || part.Actions[0] != "open" || part.Actions[1] != "look" {
		t.Errorf("part not repaired: %+v", part)
	}
	for _, expected := range findBlueprint("toilet").Parts {
		if expected.Required && findNode(&built, expected.ID) == nil {
			t.Errorf("required part %s not added", expected.ID)
		}
	}
}

func findBlueprint(id string) *blueprint {
	for index := range blueprints {
		if blueprints[index].ID == id {
			return &blueprints[index]
		}
	}
	return nil
}
