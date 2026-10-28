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
  /** Joint amount the part starts at, e.g. 1 for water taps that are normally open. Defaults to 0. */
  rest?: number;
};

/** One movement in a step: "open the door", "peel off the lint". */
export type Beat = { part: string; action: RigAction; caption: string };

/** A condition on a part's joint amount; `orFocus` also passes while that part's beat is playing. */
export type EffectWhen = { part: string; min?: number; max?: number; orFocus?: boolean };

/**
 * What an action does to the world, beyond the part moving: oil pouring out of the drain hole, water going down.
 * Anchored to parts so the 3D guide and the live camera overlay can both draw them from the catalog.
 *  - flow: a liquid stream falling from `from` onto `to` (or `length` metres down)
 *  - drip: drops falling from `from`
 *  - pool: a liquid surface in `from` (a pan, a tub) at a height between `range`, following `level`
 *  - airflow: glowing air moving along `points` (in `from`'s frame); while `level` is low it chokes at `chokeAt`
 */
export type RigEffect = {
  kind: "flow" | "drip" | "pool" | "airflow";
  /** Part the effect is anchored to. */
  from: string;
  /** Anchor offset in the part's frame. */
  offset?: Vec3;
  /** Ride along with the part's motion (a filter being unscrewed) instead of staying where it rests. */
  follow?: boolean;
  /** flow: the part it lands in, and where in that part's frame. */
  to?: string;
  toOffset?: Vec3;
  /** flow and drip: fall height in metres when there's no `to`. */
  length?: number;
  /** flow: stream width; drip: drop size; pool: radius (circle) or [x, z] size (box). */
  width?: number;
  size?: [number, number];
  /** pool: surface height in the part's frame at level 0 and level 1. */
  range?: [number, number];
  /** airflow: the route, and the index of the point where a clog chokes it. */
  points?: Vec3[];
  chokeAt?: number;
  color: string;
  opacity?: number;
  /** Every condition must hold for the effect to show. */
  when: EffectWhen[];
  /** 0..1 from a part's amount: a pool's fill, a stream's strength. */
  level?: { part: string; invert?: boolean };
};

export type RigCatalog = {
  id: string;
  name: string;
  /** Appliance names this rig stands in for, e.g. "top-load dryer". */
  matches: string[];
  parts: RigPartDef[];
  effects?: RigEffect[];
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
    case "clean":
      return 1;
    // On twist joints the first half is the turn and the second half is the lift, so unlock only turns.
    case "unlock":
      return 0.5;
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

/** The state every part starts in before any step has run. */
export function restState(catalog: RigCatalog): RigState {
  return Object.fromEntries(catalog.parts.filter((part) => part.rest !== undefined).map((part) => [part.id, part.rest as number]));
}
