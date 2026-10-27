/** Built-in appliance models with real joints. Muse only picks which part does which action. */

export type Vec3 = [number, number, number];

/** How a part moves, in its parent's frame, in metres and radians. */
export type Joint =
  | { kind: "slide"; direction: Vec3; distance: number }
  | { kind: "hinge"; pivot: Vec3; axis: Vec3; angle: number }
  | { kind: "twist"; axis: Vec3; angle: number; lift: number }
  | { kind: "press"; direction: Vec3; depth: number }
  | { kind: "turn"; axis: Vec3; angle: number }
  | { kind: "debris"; away: Vec3 }
  | { kind: "none" };

export type RigAction = "open" | "close" | "remove" | "insert" | "unlock" | "lock" | "press" | "turn" | "clean" | "look";

export type RigPartDef = {
  id: string;
  label: string;
  /** Other names the plan or the manual may use for this part. */
  aliases?: string[];
  joint: Joint;
  actions: RigAction[];
  /** Where the camera should look from for this part, as a direction from the part. */
  view?: Vec3;
};

/** One movement in a step: "open the door", "peel off the lint". */
export type Beat = { part: string; action: RigAction; caption: string };

export type RigCatalog = {
  id: string;
  name: string;
  /** Appliance names this rig stands in for, e.g. "top-load dryer". */
  matches: string[];
  parts: RigPartDef[];
};

/** Where each part sits along its joint: 0 is home (closed, in place), 1 is fully open, out, or cleaned away. */
export type RigState = Record<string, number>;

/** Pulsing actions go there and back within the beat instead of staying moved. */
export const pulseActions: RigAction[] = ["press", "turn", "look"];

/** The joint amount an action leaves a part at, or null when it does not change state. */
export function actionTarget(action: RigAction): number | null {
  switch (action) {
    case "open":
    case "remove":
    case "unlock":
    case "clean":
      return 1;
    case "close":
    case "insert":
    case "lock":
      return 0;
    default:
      return null;
  }
}

/** State after a list of beats, starting from a given state. */
export function applyBeats(start: RigState, beats: Beat[]): RigState {
  const state = { ...start };
  for (const beat of beats) {
    const target = actionTarget(beat.action);
    if (target !== null) state[beat.part] = target;
  }
  return state;
}
