import type { Recipe } from "../../lib/rig/recipe";
import type { Beat, RigCatalog } from "../../lib/rig/types";
import dishwasher from "./catalogs/dishwasher.json";
import carOilChange from "./catalogs/car_oil_change.json";
import dryerTopVent from "./catalogs/dryer_top_vent.json";
import garbageDisposal from "./catalogs/garbage_disposal.json";
import microwaveOtr from "./catalogs/microwave_otr.json";
import rangeElectric from "./catalogs/range_electric.json";
import washerFrontLoad from "./catalogs/washer_front_load.json";
import washerTopLoad from "./catalogs/washer_top_load.json";

/** A built-in appliance model: its parts and joints, its 3D model, and a sample fix for the preview page. */
export type RigModule = {
  catalog: RigCatalog;
  Model: () => React.JSX.Element;
  sampleSteps: { instruction: string; beats: Beat[] }[];
};

export const rigCatalogs = [dryerTopVent, dishwasher, washerFrontLoad, washerTopLoad, rangeElectric, microwaveOtr, garbageDisposal, carOilChange] as RigCatalog[];

/** Models load on demand so the 3D code for one appliance doesn't slow down the rest of the app. */
export const rigLoaders: Record<string, () => Promise<RigModule>> = {
  dryer_top_vent: () => import("./Dryer").then((module) => module.rig),
  dishwasher: () => import("./Dishwasher").then((module) => module.rig),
  washer_front_load: () => import("./WasherFront").then((module) => module.rig),
  washer_top_load: () => import("./WasherTop").then((module) => module.rig),
  range_electric: () => import("./Range").then((module) => module.rig),
  microwave_otr: () => import("./MicrowaveOtr").then((module) => module.rig),
  garbage_disposal: () => import("./GarbageDisposal").then((module) => module.rig),
  car_oil_change: () => import("./CarOilChange").then((module) => module.rig),
};

/** An on-demand model (rig "generated"): the recipe arrives inline with the rig event, and its catalog derives from it. */
export const loadGeneratedRig = (recipe: Recipe) => import("./RecipeModel").then((module) => module.recipeRig(recipe));
