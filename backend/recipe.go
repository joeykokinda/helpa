package main

import (
	"context"
	"encoding/json"
	"errors"
)

// generatedRig is an on-demand appliance model for anything without a built-in one: a declarative recipe the
// app's RecipeModel renders, plus the catalog of parts and joints the choreographer maps steps onto.
type generatedRig struct {
	Catalog rigCatalog      `json:"catalog"`
	Recipe  json.RawMessage `json:"recipe"`
}

var errRecipesNotBuilt = errors.New("on-demand models are not built yet")

// generateModel builds an on-demand model for an appliance from its identity and the user's photos.
// Contract: called in parallel with research as soon as the appliance is identified; must not depend on the plan.
func generateModel(ctx context.Context, appliance string, photos []string) (*generatedRig, error) {
	return nil, errRecipesNotBuilt
}
