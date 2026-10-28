package main

import (
	"context"
	"embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"time"
)

// generatedRig is an on-demand appliance model for anything without a built-in one: a declarative recipe the
// app's RecipeModel renders, plus the catalog of parts and joints the choreographer maps steps onto.
type generatedRig struct {
	Catalog rigCatalog      `json:"catalog"`
	Recipe  json.RawMessage `json:"recipe"`
}

// The recipe schema and the reference recipes are copies of app/app/components/rig/recipes/recipe.schema.json and
// recipes/examples/{garbage_disposal,toilet}.json (recipe_test.go fails when they drift); blueprints are backend-only.
//
//go:embed blueprints
var blueprintFiles embed.FS

type recipeNode struct {
	ID       string      `json:"id"`
	Parent   string      `json:"parent"`
	Shape    string      `json:"shape"`
	Size     []float64   `json:"size"`
	Position []float64   `json:"position"`
	Rotation []float64   `json:"rotation"`
	Material string      `json:"material"`
	Color    string      `json:"color"`
	Points   [][]float64 `json:"points"`
	Text     string      `json:"text"`
	Repeat   []float64   `json:"repeat"`
}

type recipePart struct {
	Node    string    `json:"node"`
	Label   string    `json:"label"`
	Aliases []string  `json:"aliases"`
	Joint   string    `json:"joint"`
	Axis    []float64 `json:"axis"`
	Amount  float64   `json:"amount"`
	Lift    float64   `json:"lift"`
	Pivot   []float64 `json:"pivot"`
	Actions []string  `json:"actions"`
	View    []float64 `json:"view"`
	Rest    float64   `json:"rest"`
}

type recipe struct {
	Name  string       `json:"name"`
	Nodes []recipeNode `json:"nodes"`
	Parts []recipePart `json:"parts"`
}

type blueprintPart struct {
	ID       string      `json:"id"`
	Label    string      `json:"label"`
	Required bool        `json:"required"`
	Describe string      `json:"describe"`
	Dims     string      `json:"dims"`
	Joint    string      `json:"joint"`
	Axis     []float64   `json:"axis"`
	Amount   float64     `json:"amount"`
	Actions  []string    `json:"actions"`
	View     []float64   `json:"view"`
	Rest     float64     `json:"rest,omitempty"`
	Fallback *recipeNode `json:"fallback,omitempty"`
}

type blueprint struct {
	ID      string          `json:"id"`
	Name    string          `json:"name"`
	Matches []string        `json:"matches"`
	Scene   string          `json:"scene"`
	Size    string          `json:"size"`
	Parts   []blueprintPart `json:"parts"`
	Debris  []string        `json:"debris"`
	Views   []string        `json:"views"`
	Notes   string          `json:"notes"`
}

var (
	recipeSchema     = loadRecipeSchema()
	blueprints       = loadBlueprints()
	referenceRecipes = loadReferenceRecipes()
)

func loadRecipeSchema() map[string]any {
	var schema map[string]any
	data, err := blueprintFiles.ReadFile("blueprints/recipe.schema.json")
	if err == nil {
		err = json.Unmarshal(data, &schema)
	}
	if err != nil {
		log.Fatalf("recipe schema: %v", err)
	}
	return schema
}

func loadBlueprints() []blueprint {
	files, _ := blueprintFiles.ReadDir("blueprints")
	var loaded []blueprint
	for _, file := range files {
		if file.IsDir() || !strings.HasSuffix(file.Name(), ".json") || file.Name() == "recipe.schema.json" {
			continue
		}
		data, err := blueprintFiles.ReadFile("blueprints/" + file.Name())
		var entry blueprint
		if err == nil {
			err = json.Unmarshal(data, &entry)
		}
		if err != nil {
			log.Fatalf("blueprint %s: %v", file.Name(), err)
		}
		loaded = append(loaded, entry)
	}
	return loaded
}

// loadReferenceRecipes keeps the hand-written examples minified, ready to paste into the prompt.
func loadReferenceRecipes() map[string]string {
	files, _ := blueprintFiles.ReadDir("blueprints/references")
	references := map[string]string{}
	for _, file := range files {
		data, err := blueprintFiles.ReadFile("blueprints/references/" + file.Name())
		var parsed recipe
		if err == nil {
			err = json.Unmarshal(data, &parsed)
		}
		if err != nil {
			log.Fatalf("reference recipe %s: %v", file.Name(), err)
		}
		compact, _ := json.Marshal(parsed)
		references[strings.TrimSuffix(file.Name(), ".json")] = string(compact)
	}
	return references
}

var wordPattern = regexp.MustCompile(`[a-z0-9]+`)

func stem(word string) string {
	if len(word) > 3 && strings.HasSuffix(word, "s") && !strings.HasSuffix(word, "ss") {
		return word[:len(word)-1]
	}
	return word
}

// matchBlueprint picks the blueprint for an appliance name: a whole matching phrase wins (longest first),
// otherwise the most phrase words in common; nothing in common means the generic blueprint.
func matchBlueprint(appliance string) *blueprint {
	name := strings.ToLower(appliance)
	words := map[string]bool{}
	for _, word := range wordPattern.FindAllString(name, -1) {
		words[stem(word)] = true
	}
	var best *blueprint
	bestScore := 0
	for index := range blueprints {
		for _, phrase := range blueprints[index].Matches {
			phrase = strings.ToLower(phrase)
			score := 0
			if regexp.MustCompile(`\b` + regexp.QuoteMeta(phrase) + `\b`).MatchString(name) {
				score = 100 + len(phrase)
			} else {
				for _, word := range wordPattern.FindAllString(phrase, -1) {
					if len(word) > 3 && words[stem(word)] {
						score += len(word)
					}
				}
			}
			if score > bestScore {
				best, bestScore = &blueprints[index], score
			}
		}
	}
	if best == nil {
		for index := range blueprints {
			if blueprints[index].ID == "generic" {
				return &blueprints[index]
			}
		}
	}
	return best
}

const recipeInstructions = `You build a 3D model of a household thing as a declarative RECIPE (JSON) that an app renders and animates,
so a total beginner can follow a repair. It must be instantly recognisable and look like a polished product illustration.

FRAME: metres, real scale. Origin at the centre of the floor under the thing; +y up; +z toward the viewer (the front);
+x to the viewer's right. Rotation is Euler degrees [x, y, z]. Each node's position and rotation are in its parent's frame.

NODES (geometry). shape and the meaning of size:
- group: no geometry, a frame for children (size [])
- box / rounded_box: [width, height, depth]; rounded_box for anything moulded or cast
- panel: [width, height, thickness], a plate in the XY plane facing +z, with holes in points as [x, y, radius] or
  [x, y, width, height]; rotate [-90,0,0] to lie flat (then hole y maps to -z). For faces with openings, counter cut-outs.
- cylinder: [diameter, height, bottom diameter or 0], along y; rotate [90,0,0] to point along z, [0,0,90] along x
- cone: [base diameter, height]; tube: [outer diameter, height, wall], hollow, along y (pipe ends, rings, collars)
- sphere: [width, height, depth]; capsule: [diameter, length] along y; torus: [ring diameter, thickness, arc degrees or 0], ring in XY
- lathe: [sweep degrees or 0, x stretch or 0, z stretch or 0]; points = [radius, y] profile revolved about y. Use it for any
  round housing, bowl, knob, tank, bottle, cap. Give walls thickness with a closed profile (outer down, then inner back up).
  A sweep of 270 with rotation [0,90,0] cuts away the front-right quarter to show what is inside.
- hose: [diameter]; points = [x, y, z] path (smooth curve through them). Pipes, hoses, cords, cables, chains, coils, belts.
  Repeat the first point at the end to close a loop.
- wire_grid: [width, depth, spacing], a wire rack or grille in the XZ plane
- plane: [width, height] facing +z, double sided (screens, sheets, filters)
- patch: [width, depth] irregular splotch lying flat facing +y (grime, rust, scale, puddles, lint) - put it on a surface
- clump: [width, height, depth] lumpy blob (food, hair clog, leaves, debris)
- label: [width, height] printed text facing +z, text in color; material is the backing, "clear" for none. Short text only.
material is a preset (white_enamel, stainless, chrome, plastic, black_plastic, white_plastic, rubber, glass, ceramic, brass,
copper, painted_metal, cast_iron, aluminum, wood, cardboard, pleated_filter, foil, perforated_metal, screen_mesh, chain, glow,
water, grime, lint, food_scraps, rust, mineral_scale, hair, oil, clear). clear is a faint see-through shell. color is a hex tint
("" keeps the preset colour). repeat = [count, dx, dy, dz, spin degrees]: copies shifted by (dx,dy,dz) and spun about the
PARENT's y axis each time (bolt circles, ribs, fins, spokes); [] for one.

PARTS (what the guide moves). Each part names a node; that node and all its children move together, so put the part's
node exactly where it pivots and build its pieces as children. Use the blueprint part ids as node ids.
joint and amount: slide (axis = direction, amount metres), hinge (axis, pivot = point on the hinge line in the node's own
frame, amount degrees, the sign picks the way it swings; axis [0,1,0] for a side-hinged door with the pivot on its left or
right edge, [1,0,0] for a drop-down door hinged at its bottom edge (dishwashers, ovens) or a lid hinged at its back edge), twist (unscrew: axis, amount degrees, lift = metres it lifts out
after turning), press (axis = push direction, amount = depth metres), turn (axis, amount degrees), debris (axis = direction it
is carried off, amount metres), none (only pointed at).
Allowed actions: slide open/close/remove/insert/look; hinge open/close/remove/insert/look; twist unlock/lock/remove/insert/look;
press press/look; turn turn/open/close/look (valves: rest 1 = normally open, open/close); debris clean/look; none look/clean.
Every part also gets "look". view = direction from the part to the camera, picked so nothing blocks it (e.g. under a sink
look from [0.6,0.3,1]; into a tank from above [0.3,1,0.6]; underneath [0.5,-0.3,1]).
Motions must not pass through other geometry: lift lids up and to the side, pull things out along a clear path.

QUALITY. Follow the reference recipes' level of detail: 40-60 nodes. Real proportions and colours. Smooth silhouettes
(lathes, rounded boxes, hoses), small recognisable details (screws via repeat, seams, labels, knobs, clamps, nuts at pipe
joints), and just enough surroundings (wall, cabinet, counter, floor tiles, engine bay walls) to make sense of it.
Hollow things (tanks, cabinets, basins, housings) are built from walls or cut-away lathes so their inside shows when opened.
Debris and dirt are their own small parts (patch or clump with a debris joint), usually children of what they sit on.
Include every required blueprint part, and optional ones that fit this model or appear in the photos. Use the photos for
colours, finishes, proportions and which parts exist; never model the background clutter. Numbers: at most 3 decimals.`

// generateModel builds an on-demand model for an appliance from its identity and the user's photos.
// Contract: called in parallel with research as soon as the appliance is identified; must not depend on the plan.
func generateModel(ctx context.Context, appliance string, photos []string) (*generatedRig, error) {
	built, repairs, err := requestRecipe(ctx, appliance, matchBlueprint(appliance), photos)
	if err != nil {
		return nil, err
	}
	if len(repairs) > 0 {
		log.Printf("generate model %q: %d repairs: %s", appliance, len(repairs), strings.Join(repairs, "; "))
	}
	data, err := json.Marshal(built)
	if err != nil {
		return nil, err
	}
	return &generatedRig{Catalog: recipeCatalog(built, appliance), Recipe: data}, nil
}

func requestRecipe(ctx context.Context, appliance string, chosen *blueprint, photos []string) (*recipe, []string, error) {
	blueprintJSON, _ := json.Marshal(chosen)
	var references strings.Builder
	for _, name := range []string{"garbage_disposal", "toilet"} {
		fmt.Fprintf(&references, "\nREFERENCE RECIPE (%s):\n%s\n", name, referenceRecipes[name])
	}
	photoNote := "No photos: use the typical look of this exact kind of thing."
	if len(photos) > 0 {
		photoNote = fmt.Sprintf("%d photo(s) of the user's own one are attached: match them.", len(photos))
	}
	prompt := fmt.Sprintf("%s\nBLUEPRINT (the parts to build and how they move):\n%s\n\nBuild the recipe for: %s\n%s",
		references.String(), blueprintJSON, appliance, photoNote)
	started := time.Now()
	text, err := recipeResponse(ctx, map[string]any{
		"model":        "muse-spark-1.3",
		"instructions": recipeInstructions,
		"reasoning":    map[string]any{"effort": recipeEffort},
		"input":        []any{userMessage(prompt, photos...)},
		"text":         map[string]any{"format": map[string]any{"type": "json_schema", "name": "recipe", "schema": recipeSchema, "strict": true}},
	})
	if err != nil {
		return nil, nil, err
	}
	log.Printf("generate model %q: %s in %.1fs", appliance, chosen.ID, time.Since(started).Seconds())
	var built recipe
	if err := json.Unmarshal([]byte(text), &built); err != nil {
		return nil, nil, fmt.Errorf("recipe was not valid json: %w", err)
	}
	if built.Name == "" {
		built.Name = chosen.Name
	}
	repairs := repairRecipe(&built, chosen)
	if len(built.Nodes) == 0 {
		return nil, repairs, fmt.Errorf("recipe has no geometry")
	}
	return &built, repairs, nil
}

// recipeEffort is Muse's reasoning effort for recipes; HELPA_RECIPE_EFFORT overrides it for measuring.
var recipeEffort = cmpOr(os.Getenv("HELPA_RECIPE_EFFORT"), "minimal")

func cmpOr(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

// recipeResponse is createResponse plus a token-usage log line, since output length is what sets the latency.
func recipeResponse(ctx context.Context, body map[string]any) (string, error) {
	reply, err := postResponses(ctx, body)
	if err != nil {
		return "", err
	}
	defer reply.Body.Close()
	data, err := io.ReadAll(reply.Body)
	if err != nil {
		return "", err
	}
	if reply.StatusCode != http.StatusOK {
		return "", fmt.Errorf("meta api %d: %s", reply.StatusCode, data)
	}
	var parsed struct {
		response
		Usage struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
			Details      struct {
				Reasoning int `json:"reasoning_tokens"`
			} `json:"output_tokens_details"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(data, &parsed); err != nil {
		return "", err
	}
	if parsed.Error != nil {
		return "", fmt.Errorf("meta api: %s", parsed.Error.Message)
	}
	recordReply(body, tokenUsage{parsed.Usage.InputTokens, parsed.Usage.OutputTokens}, parsed.Output)
	log.Printf("recipe tokens: %d in, %d out (%d reasoning)", parsed.Usage.InputTokens, parsed.Usage.OutputTokens, parsed.Usage.Details.Reasoning)
	return parsed.text(), nil
}

/* ---------- validation and repair ---------- */

var (
	recipeShapes    = schemaEnum("nodes", "shape")
	recipeMaterials = schemaEnum("nodes", "material")
	hexColor        = regexp.MustCompile(`^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$`)
	// Actions each joint kind can show; matches jointActions in app/app/lib/rig/recipe.ts.
	jointActions = map[string][]string{
		"none":   {"look", "clean"},
		"press":  {"press", "look"},
		"turn":   {"turn", "open", "close", "look"},
		"slide":  {"open", "close", "remove", "insert", "look"},
		"hinge":  {"open", "close", "remove", "insert", "look"},
		"twist":  {"unlock", "lock", "remove", "insert", "open", "close", "look"},
		"debris": {"clean", "remove", "look"},
	}
)

func schemaEnum(list, field string) []string {
	properties := recipeSchema["properties"].(map[string]any)[list].(map[string]any)["items"].(map[string]any)["properties"].(map[string]any)
	var values []string
	for _, value := range properties[field].(map[string]any)["enum"].([]any) {
		values = append(values, value.(string))
	}
	return values
}

func finite(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }

func clamp(value, low, high float64) float64 { return math.Max(low, math.Min(high, value)) }

// vector returns a 3-vector clamped to ±limit, or fallback when it is missing, malformed or zero.
func vector(values []float64, limit float64, fallback []float64) []float64 {
	if len(values) < 3 || !finite(values[0]) || !finite(values[1]) || !finite(values[2]) || (values[0] == 0 && values[1] == 0 && values[2] == 0) {
		return slices.Clone(fallback)
	}
	return []float64{clamp(values[0], -limit, limit), clamp(values[1], -limit, limit), clamp(values[2], -limit, limit)}
}

func humanize(id string) string {
	label := strings.ReplaceAll(id, "_", " ")
	if label == "" {
		return "Part"
	}
	return strings.ToUpper(label[:1]) + label[1:]
}

// repairRecipe makes a model-written recipe safe to render and complete for its blueprint, returning what it changed.
func repairRecipe(built *recipe, chosen *blueprint) []string {
	var repairs []string
	note := func(format string, args ...any) { repairs = append(repairs, fmt.Sprintf(format, args...)) }

	if len(built.Nodes) > 160 {
		note("trimmed %d nodes to 160", len(built.Nodes))
		built.Nodes = built.Nodes[:160]
	}
	seen := map[string]bool{}
	for index := range built.Nodes {
		node := &built.Nodes[index]
		node.ID = strings.TrimSpace(node.ID)
		if node.ID == "" {
			node.ID = fmt.Sprintf("node_%d", index)
		}
		if seen[node.ID] {
			original := node.ID
			for suffix := 2; seen[node.ID]; suffix++ {
				node.ID = fmt.Sprintf("%s_%d", original, suffix)
			}
			note("renamed duplicate node %s to %s", original, node.ID)
		}
		seen[node.ID] = true
		repairNode(node, note)
	}
	byID := map[string]*recipeNode{}
	for index := range built.Nodes {
		byID[built.Nodes[index].ID] = &built.Nodes[index]
	}
	for index := range built.Nodes {
		node := &built.Nodes[index]
		if node.Parent != "" && (byID[node.Parent] == nil || node.Parent == node.ID) {
			note("node %s had missing parent %s", node.ID, node.Parent)
			node.Parent = ""
		}
	}
	// Break parent cycles: walk up from every node; a walk that revisits a node detaches it.
	for index := range built.Nodes {
		node := &built.Nodes[index]
		visited := map[string]bool{node.ID: true}
		for current := node; current.Parent != ""; current = byID[current.Parent] {
			if visited[current.Parent] {
				note("broke a parent cycle at %s", current.ID)
				current.Parent = ""
				break
			}
			visited[current.Parent] = true
		}
	}

	partNodes := map[string]bool{}
	var kept []recipePart
	for _, part := range built.Parts {
		if byID[part.Node] == nil || partNodes[part.Node] {
			note("dropped part %q (no such node or a repeat)", part.Node)
			continue
		}
		kept = append(kept, part)
		partNodes[part.Node] = true
	}
	built.Parts = kept
	for index := range built.Parts {
		repairPart(&built.Parts[index], note)
	}

	// The generic blueprint only suggests parts, so it enforces nothing.
	if chosen != nil && chosen.ID != "generic" {
		for _, expected := range chosen.Parts {
			ensureBlueprintPart(built, expected, byID, note)
		}
	}
	// A part flung far from the model (a units mix-up) goes back near the origin.
	for _, part := range built.Parts {
		if position, found := worldPosition(built, part.Node); found && (math.Abs(position[0]) > 3 || math.Abs(position[2]) > 3 || position[1] < -1 || position[1] > 3) {
			node := findNode(built, part.Node)
			node.Parent, node.Position = "", []float64{0, 0.5, 0}
			note("part %s was out of bounds", part.Node)
		}
	}
	return repairs
}

func findNode(built *recipe, id string) *recipeNode {
	for index := range built.Nodes {
		if built.Nodes[index].ID == id {
			return &built.Nodes[index]
		}
	}
	return nil
}

// worldPosition sums positions up the parent chain; rotations are ignored, which is fine for a sanity bound.
func worldPosition(built *recipe, id string) ([]float64, bool) {
	position := []float64{0, 0, 0}
	node := findNode(built, id)
	if node == nil {
		return nil, false
	}
	for depth := 0; node != nil && depth < 64; depth++ {
		for axis := range 3 {
			position[axis] += node.Position[axis]
		}
		if node.Parent == "" {
			break
		}
		node = findNode(built, node.Parent)
	}
	return position, true
}

func repairNode(node *recipeNode, note func(string, ...any)) {
	if !slices.Contains(recipeShapes, node.Shape) {
		note("node %s had unknown shape %q", node.ID, node.Shape)
		node.Shape = "box"
	}
	if !slices.Contains(recipeMaterials, node.Material) {
		node.Material = "plastic"
	}
	if !hexColor.MatchString(strings.TrimSpace(node.Color)) {
		node.Color = ""
	}
	for index, value := range node.Size {
		if !finite(value) || value < 0 {
			node.Size[index] = 0
		} else {
			node.Size[index] = math.Min(value, 4)
		}
	}
	if len(node.Size) > 3 {
		node.Size = node.Size[:3]
	}
	node.Position = vector(node.Position, 4, []float64{0, 0, 0})
	node.Rotation = vector(node.Rotation, 360, []float64{0, 0, 0})
	var points [][]float64
	for _, point := range node.Points {
		if len(point) < 2 || len(point) > 4 || slices.ContainsFunc(point, func(value float64) bool { return !finite(value) }) {
			continue
		}
		for index := range point {
			point[index] = clamp(point[index], -4, 4)
		}
		points = append(points, point)
	}
	if len(points) > 64 {
		points = points[:64]
	}
	node.Points = points
	// A lathe or hose without a usable path would draw nothing; give it a plain shape instead.
	if node.Shape == "lathe" && countPoints(points, 2) < 2 {
		note("lathe %s had no profile", node.ID)
		node.Shape, node.Size = "cylinder", []float64{0.1, 0.1, 0}
	}
	if node.Shape == "hose" && countPoints(points, 3) < 2 {
		note("hose %s had no path", node.ID)
		node.Shape, node.Size = "group", []float64{}
	}
	if len(node.Repeat) > 0 {
		node.Repeat = node.Repeat[:min(5, len(node.Repeat))]
		for index, value := range node.Repeat {
			if !finite(value) {
				node.Repeat[index] = 0
			}
		}
		node.Repeat[0] = clamp(math.Floor(node.Repeat[0]), 1, 48)
	}
	if node.Size == nil {
		node.Size = []float64{}
	}
	if node.Points == nil {
		node.Points = [][]float64{}
	}
	if node.Repeat == nil {
		node.Repeat = []float64{}
	}
}

func countPoints(points [][]float64, length int) int {
	count := 0
	for _, point := range points {
		if len(point) >= length {
			count++
		}
	}
	return count
}

func repairPart(part *recipePart, note func(string, ...any)) {
	if _, known := jointActions[part.Joint]; !known {
		note("part %s had unknown joint %q", part.Node, part.Joint)
		part.Joint = "none"
	}
	if part.Label = strings.TrimSpace(part.Label); part.Label == "" {
		part.Label = humanize(part.Node)
	}
	if len(part.Aliases) > 8 {
		part.Aliases = part.Aliases[:8]
	}
	if part.Aliases == nil {
		part.Aliases = []string{}
	}
	part.Axis = vector(part.Axis, 1e6, []float64{0, 1, 0})
	length := math.Sqrt(part.Axis[0]*part.Axis[0] + part.Axis[1]*part.Axis[1] + part.Axis[2]*part.Axis[2])
	for index := range part.Axis {
		part.Axis[index] = math.Round(part.Axis[index]/length*1000) / 1000
	}
	part.Pivot = vector(part.Pivot, 3, []float64{0, 0, 0})
	part.View = vector(part.View, 1e6, []float64{0.6, 0.5, 1})
	if !finite(part.Amount) {
		part.Amount = 0
	}
	sign := 1.0
	if part.Amount < 0 {
		sign = -1
	}
	magnitude := math.Abs(part.Amount)
	switch part.Joint {
	case "slide":
		part.Amount = clampOr(magnitude, 0.005, 1.2, 0.15)
	case "press":
		part.Amount = clampOr(magnitude, 0.001, 0.03, 0.006)
	case "hinge", "turn", "twist":
		part.Amount = sign * clampOr(magnitude, 5, 720, 90)
	case "debris":
		part.Amount = clampOr(magnitude, 0.05, 1, 0.25)
	default:
		part.Amount = 0
	}
	if !finite(part.Lift) {
		part.Lift = 0
	}
	part.Lift = clamp(math.Abs(part.Lift), 0, 0.5)
	if part.Joint == "twist" && part.Lift == 0 && slices.Contains(part.Actions, "remove") {
		part.Lift = 0.05
	}
	if part.Joint != "twist" {
		part.Lift = 0
	}
	allowed := jointActions[part.Joint]
	var actions []string
	for _, action := range part.Actions {
		if slices.Contains(allowed, action) && !slices.Contains(actions, action) {
			actions = append(actions, action)
		}
	}
	if !slices.Contains(actions, "look") {
		actions = append(actions, "look")
	}
	part.Actions = actions
	if !finite(part.Rest) {
		part.Rest = 0
	}
	part.Rest = clamp(part.Rest, 0, 1)
}

func clampOr(value, low, high, fallback float64) float64 {
	if value == 0 {
		return fallback
	}
	return clamp(value, low, high)
}

// ensureBlueprintPart makes a blueprint part present with the blueprint's motion: it adopts a node or part the model
// named differently, and builds the blueprint's fallback shape for a required part the model left out.
func ensureBlueprintPart(built *recipe, expected blueprintPart, byID map[string]*recipeNode, note func(string, ...any)) {
	var part *recipePart
	for index := range built.Parts {
		if built.Parts[index].Node == expected.ID {
			part = &built.Parts[index]
		}
	}
	if part == nil {
		// The model may have built it under another name: a matching label counts as present, with its own motion.
		for _, candidate := range built.Parts {
			if strings.EqualFold(candidate.Label, expected.Label) || slices.ContainsFunc(candidate.Aliases, func(alias string) bool { return strings.EqualFold(alias, expected.Label) }) {
				return
			}
		}
	}
	if part == nil {
		if byID[expected.ID] == nil {
			if !expected.Required || expected.Fallback == nil {
				return
			}
			fallback := *expected.Fallback
			fallback.ID = expected.ID
			repairNode(&fallback, func(string, ...any) {})
			built.Nodes = append(built.Nodes, fallback)
			byID[expected.ID] = &built.Nodes[len(built.Nodes)-1]
			note("added missing required part %s", expected.ID)
		} else {
			note("node %s became the blueprint part", expected.ID)
		}
		built.Parts = append(built.Parts, recipePart{Node: expected.ID, Label: expected.Label, Joint: expected.Joint, Axis: expected.Axis, Amount: expected.Amount, Actions: slices.Clone(expected.Actions), View: expected.View, Rest: expected.Rest})
		repairPart(&built.Parts[len(built.Parts)-1], func(string, ...any) {})
		return
	}
	if part.Joint != expected.Joint {
		note("part %s moved as %s, blueprint says %s", part.Node, part.Joint, expected.Joint)
		part.Joint, part.Axis, part.Amount, part.Actions = expected.Joint, expected.Axis, expected.Amount, slices.Clone(expected.Actions)
		repairPart(part, func(string, ...any) {})
		return
	}
	for _, action := range expected.Actions {
		if !slices.Contains(part.Actions, action) && slices.Contains(jointActions[part.Joint], action) {
			part.Actions = append(part.Actions, action)
		}
	}
}

// recipeCatalog derives the parts the choreographer can use from a recipe.
func recipeCatalog(built *recipe, appliance string) rigCatalog {
	catalog := rigCatalog{ID: "generated", Name: built.Name, Matches: []string{appliance}}
	for _, part := range built.Parts {
		catalog.Parts = append(catalog.Parts, rigPart{ID: part.Node, Label: part.Label, Aliases: part.Aliases, Actions: part.Actions, Rest: part.Rest})
	}
	return catalog
}

// generateModelCommand is `helpa generate-model "<appliance>" [photo paths...]`: prints the recipe JSON, timing on stderr.
func generateModelCommand(ctx context.Context, args []string) error {
	if len(args) == 0 {
		return fmt.Errorf(`usage: helpa generate-model "<appliance>" [photo paths...]`)
	}
	var photos []string
	for _, path := range args[1:] {
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		kind := mime.TypeByExtension(strings.ToLower(filepath.Ext(path)))
		if kind == "" {
			kind = "image/jpeg"
		}
		photos = append(photos, "data:"+kind+";base64,"+base64.StdEncoding.EncodeToString(data))
	}
	chosen := matchBlueprint(args[0])
	started := time.Now()
	built, repairs, err := requestRecipe(ctx, args[0], chosen, photos)
	if err != nil {
		return err
	}
	fmt.Fprintf(os.Stderr, "blueprint %s, %.1fs, %d nodes, %d parts, %d repairs\n", chosen.ID, time.Since(started).Seconds(), len(built.Nodes), len(built.Parts), len(repairs))
	for _, repair := range repairs {
		fmt.Fprintln(os.Stderr, "  repair:", repair)
	}
	output, err := json.MarshalIndent(built, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(output))
	return nil
}
