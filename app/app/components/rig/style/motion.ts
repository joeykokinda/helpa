import type { Joint, RigAction } from "../../../lib/rig/types";

/** Beat pacing: a beat of anticipation (camera settles, guide draws in), the move, then a hold to read the result. */
export const timing = { lead: 0.65, move: 1.55, hold: 0.75 };
export const beatSeconds = timing.lead + timing.move + timing.hold;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export const easeInOutCubic = (progress: number) => (progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2);
export const easeOutCubic = (progress: number) => 1 - (1 - progress) ** 3;

/** Back easing: a small wind-up before the move and a small overshoot after it. */
function easeInOutBack(progress: number, strength: number) {
  const scaled = strength * 1.525;
  return progress < 0.5
    ? ((2 * progress) ** 2 * ((scaled + 1) * 2 * progress - scaled)) / 2
    : ((2 * progress - 2) ** 2 * ((scaled + 1) * (progress * 2 - 2) + scaled) + 2) / 2;
}

/**
 * A move between joint amounts with anticipation and overshoot. Amounts never go below 0 (home is a hard stop:
 * a closing door bounces off its frame instead of passing through it). Debris peels off smoothly.
 */
export function moveAmount(joint: Joint, from: number, to: number, progress: number) {
  if (joint.kind === "debris") return from + (to - from) * easeInOutCubic(progress);
  const strength = joint.kind === "hinge" ? 0.9 : 1.1;
  const amount = from + (to - from) * easeInOutBack(progress, strength);
  return amount < 0 ? -amount * 0.6 : amount;
}

/** Presses snap in, hold, and spring back a little proud; turns twist with overshoot, hold, and return. */
export function pulseAmount(action: RigAction, progress: number) {
  if (action === "press") {
    if (progress < 0.2) return easeOutCubic(progress / 0.2);
    if (progress < 0.45) return 1;
    const release = (progress - 0.45) / 0.55;
    return Math.cos(release * Math.PI * 1.5) * Math.exp(-3 * release);
  }
  if (progress < 0.5) return easeInOutBack(progress / 0.5, 1.2);
  if (progress < 0.65) return 1;
  return 1 - easeInOutCubic(clamp01((progress - 0.65) / 0.35));
}
