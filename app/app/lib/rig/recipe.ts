/**
 * On-demand appliance models: a declarative recipe Muse fills in (strict JSON schema) and RecipeModel renders.
 * The schema lives in recipes/recipe.schema.json so the backend can embed the same file (backend/blueprints).
 */
import schemaJson from "../../components/rig/recipes/recipe.schema.json";
import type { Beat, Joint, RigAction, RigCatalog, RigPartDef, Vec3 } from "./types";

export const recipeSchema = schemaJson;

/**
 * Size meaning per shape (metres):
 * - group: none, just a frame for children
 * - box, rounded_box: [width, height, depth]
 * - panel: [width, height, thickness], a plate in the XY plane facing +z; holes in `points` as [x, y, r] or [x, y, w, h]
 * - cylinder: [diameter, height, bottom diameter (0 = same)] along y
 * - cone: [base diameter, height] along y
 * - tube: [outer diameter, height, wall], hollow and open along y
 * - sphere: [width, height, depth]
 * - capsule: [diameter, length] along y
 * - torus: [ring diameter, thickness, arc degrees (0 = full)], ring in the XY plane
 * - lathe: [sweep degrees (0 = full), x stretch, z stretch (0 = 1)], `points` is a [radius, y] profile revolved about y
 * - hose: [diameter], `points` is an [x, y, z] path; closed when the last point repeats the first
 * - wire_grid: [width, depth, spacing], a wire rack or grille in the XZ plane
 * - plane: [width, height], double sided, facing +z (screens, sheets)
 * - patch: [width, depth], an irregular splotch lying flat facing +y (grime, puddles, lint)
 * - clump: [width, height, depth], a lumpy blob (food, a hair clog, leaves)
 * - label: [width, height], printed `text` facing +z in `color`; the material is its backing (clear = none)
 */
export type RecipeShape =
  | "group"
  | "box"
  | "rounded_box"
  | "panel"
  | "cylinder"
  | "cone"
  | "tube"
  | "sphere"
  | "capsule"
  | "torus"
  | "lathe"
  | "hose"
  | "wire_grid"
  | "plane"
  | "patch"
  | "clump"
  | "label";

export type RecipeMaterial = (typeof schemaJson.properties.nodes.items.properties.material.enum)[number];

export type RecipeNode = {
  id: string;
  parent: string;
  shape: RecipeShape;
  size: number[];
  position: number[];
  /** Euler degrees. */
  rotation: number[];
  material: RecipeMaterial;
  color: string;
  points: number[][];
  text: string;
  /** [count, dx, dy, dz, spin degrees about the parent's y axis], or empty. */
  repeat: number[];
};

export type RecipeJointKind = Joint["kind"];

export type RecipePart = {
  node: string;
  label: string;
  aliases: string[];
  joint: RecipeJointKind;
  axis: number[];
  /** slide and press in metres, hinge, twist and turn in degrees, debris in metres away. */
  amount: number;
  lift: number;
  pivot: number[];
  actions: RigAction[];
  view: number[];
  rest: number;
};

export type Recipe = { name: string; nodes: RecipeNode[]; parts: RecipePart[] };

/** Actions each joint kind can show; the backend enforces the same table. */
export const jointActions: Record<RecipeJointKind, RigAction[]> = {
  none: ["look", "clean"],
  press: ["press", "look"],
  turn: ["turn", "open", "close", "look"],
  slide: ["open", "close", "remove", "insert", "look"],
  hinge: ["open", "close", "remove", "insert", "look"],
  twist: ["unlock", "lock", "remove", "insert", "open", "close", "look"],
  debris: ["clean", "remove", "look"],
};

const radians = (degrees: number) => (degrees * Math.PI) / 180;

function vec3(values: number[] | undefined, fallback: Vec3): Vec3 {
  if (!values || values.length < 3 || values.slice(0, 3).some((value) => !Number.isFinite(value))) return fallback;
  if (values[0] === 0 && values[1] === 0 && values[2] === 0) return fallback;
  return [values[0], values[1], values[2]];
}

function jointOf(part: RecipePart): Joint {
  const axis = vec3(part.axis, [0, 1, 0]);
  switch (part.joint) {
    case "slide":
      return { kind: "slide", direction: axis, distance: part.amount || 0.1 };
    case "press":
      return { kind: "press", direction: axis, depth: part.amount || 0.006 };
    case "hinge":
      return { kind: "hinge", pivot: vec3(part.pivot, [0, 0, 0]), axis, angle: radians(part.amount || 90) };
    case "twist":
      return { kind: "twist", axis, angle: radians(part.amount || 90), lift: part.lift || 0.05 };
    case "turn":
      return { kind: "turn", axis, angle: radians(part.amount || 90) };
    case "debris": {
      const length = Math.hypot(...axis) || 1;
      const away = part.amount || 0.25;
      return { kind: "debris", away: axis.map((value) => (value / length) * away) as Vec3 };
    }
    default:
      return { kind: "none" };
  }
}

/** The rig catalog for a recipe: one part per recipe part whose node exists, joints converted to radians. */
export function recipeCatalog(recipe: Recipe, matches: string[] = []): RigCatalog {
  const nodeIds = new Set(recipe.nodes.map((node) => node.id));
  const parts: RigPartDef[] = recipe.parts
    .filter((part) => nodeIds.has(part.node))
    .map((part) => ({
      id: part.node,
      label: part.label,
      aliases: part.aliases,
      joint: jointOf(part),
      actions: part.actions.filter((action) => jointActions[part.joint]?.includes(action)),
      view: vec3(part.view, [0.6, 0.5, 1]),
      ...(part.rest ? { rest: part.rest } : {}),
    }));
  return { id: "generated", name: recipe.name, matches, parts };
}

/**
 * One demo step per part, exercising its actions, so a recipe can be judged without a plan. Steps build on each other
 * like a real fix: lids, doors and covers stay off once opened so later steps can see inside; twist-offs go back on.
 */
export function sampleSteps(catalog: RigCatalog): { instruction: string; beats: Beat[] }[] {
  return catalog.parts.map((part) => {
    const has = (action: RigAction) => part.actions.includes(action);
    const name = part.label.toLowerCase();
    const beat = (action: RigAction, caption: string): Beat => ({ part: part.id, action, caption });
    const beats: Beat[] = [];
    if (part.joint.kind === "debris") beats.push(beat("clean", `Clean off the ${name}`));
    else if (part.joint.kind === "twist" && has("unlock")) {
      beats.push(beat("unlock", `Twist the ${name} loose`));
      if (has("remove")) beats.push(beat("remove", `Lift out the ${name}`), beat("insert", "Put it back"));
      beats.push(beat("lock", "Twist it tight"));
    } else if (has("remove")) beats.push(beat("remove", `Take off the ${name}`));
    else if (has("open") && !part.rest) beats.push(beat("open", `Open the ${name}`));
    else if (has("close") && part.rest) beats.push(beat("close", `Close the ${name}`), beat("open", "Open it again"));
    if (has("press")) beats.push(beat("press", `Press the ${name}`));
    if (has("turn")) beats.push(beat("turn", `Turn the ${name}`));
    if (!beats.length) beats.push(beat("look", `This is the ${name}`));
    return { instruction: part.label, beats };
  });
}
