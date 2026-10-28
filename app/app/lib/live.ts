import { moveAmount, pulseAmount } from "../components/rig/style/motion";
import type { PartMask } from "./masks";
import { actionTarget, applyBeats, pulseActions, type Beat, type Joint, type RigPartDef, type RigState, type Vec3 } from "./rig/types";

/** A box in 0..1 coordinates of the camera frame. */
export type Box = { x: number; y: number; width: number; height: number };

/**
 * The part SAM found on a frame: its pixels cut out with the mask (with a transparent margin so the hologram's
 * edge glow has room), where it sits, and its centroid inside the box (0..1).
 */
export type Cutout = { image: HTMLCanvasElement; box: Box; centroid: [number, number]; margin: number };

/** Draws the video's current frame into a canvas whose long side is at most maxSide. */
export function frameCanvas(video: HTMLVideoElement, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Draws one area of the video (0..1 box) at full sharpness into a canvas whose long side is at most maxSide. */
export function cropCanvas(video: HTMLVideoElement, area: Box, maxSide: number) {
  const width = area.width * video.videoWidth;
  const height = area.height * video.videoHeight;
  const scale = maxSide / Math.max(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")!.drawImage(video, area.x * video.videoWidth, area.y * video.videoHeight, width, height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** A frame box in the coordinates of a crop of that frame, and back. */
export const intoArea = (box: Box, area: Box): Box => ({ x: (box.x - area.x) / area.width, y: (box.y - area.y) / area.height, width: box.width / area.width, height: box.height / area.height });
export const outOfArea = (box: Box, area: Box): Box => ({ x: area.x + box.x * area.width, y: area.y + box.y * area.height, width: box.width * area.width, height: box.height * area.height });

/** A rectangle mask for when the person tapped a part SAM couldn't outline: the whole box is the part. */
export function boxMask(frame: { width: number; height: number }, box: Box): PartMask {
  return { left: box.x * frame.width, top: box.y * frame.height, width: box.width * frame.width, height: box.height * frame.height, raster: new Uint8Array(64).fill(1), rasterWidth: 8, rasterHeight: 8 };
}

export const canvasBlob =(canvas: HTMLCanvasElement, quality = 0.82) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("capture failed"))), "image/jpeg", quality));

/** Where the video's picture sits inside its element with object-fit: contain, in CSS pixels. */
export function displayRect(video: HTMLVideoElement) {
  const scale = Math.min(video.clientWidth / video.videoWidth, video.clientHeight / video.videoHeight);
  const width = video.videoWidth * scale;
  const height = video.videoHeight * scale;
  return { left: (video.clientWidth - width) / 2, top: (video.clientHeight - height) / 2, width, height };
}

/**
 * Which of SAM's masks is the part: the one nearest where we were already tracking it (a bolt among bolts stays
 * the same bolt), or on a first look the biggest, which is almost always the part rather than a reflection.
 */
export function pickMask(masks: PartMask[], frame: { width: number; height: number }, near: Box | null) {
  if (!near) return masks.reduce<PartMask | null>((best, mask) => (!best || mask.width * mask.height > best.width * best.height ? mask : best), null);
  const distance = (mask: PartMask) =>
    Math.hypot((mask.left + mask.width / 2) / frame.width - (near.x + near.width / 2), (mask.top + mask.height / 2) / frame.height - (near.y + near.height / 2));
  return masks.reduce<PartMask | null>((best, mask) => (!best || distance(mask) < distance(best) ? mask : best), null);
}

const cutoutMargin = 6;

/** Cuts the masked part out of the frame SAM looked at. */
export function cutOut(frame: HTMLCanvasElement, mask: PartMask): Cutout {
  const width = Math.max(1, Math.round(mask.width));
  const height = Math.max(1, Math.round(mask.height));
  const alpha = document.createElement("canvas");
  alpha.width = mask.rasterWidth;
  alpha.height = mask.rasterHeight;
  const tile = new ImageData(mask.rasterWidth, mask.rasterHeight);
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  mask.raster.forEach((value, index) => {
    if (!value) return;
    tile.data[index * 4 + 3] = 255;
    sumX += index % mask.rasterWidth;
    sumY += Math.floor(index / mask.rasterWidth);
    count++;
  });
  alpha.getContext("2d")!.putImageData(tile, 0, 0);

  const image = document.createElement("canvas");
  image.width = width + cutoutMargin * 2;
  image.height = height + cutoutMargin * 2;
  const context = image.getContext("2d")!;
  context.drawImage(frame, mask.left, mask.top, mask.width, mask.height, cutoutMargin, cutoutMargin, width, height);
  context.globalCompositeOperation = "destination-in";
  context.drawImage(alpha, cutoutMargin, cutoutMargin, width, height);
  return {
    image,
    margin: cutoutMargin,
    box: { x: mask.left / frame.width, y: mask.top / frame.height, width: mask.width / frame.width, height: mask.height / frame.height },
    centroid: count ? [sumX / count / mask.rasterWidth, sumY / count / mask.rasterHeight] : [0.5, 0.5],
  };
}

/** Eases a tracked box toward SAM's latest box, so a re-anchor glides instead of jumping. */
export function easeBox(current: Box, target: Box, seconds: number): Box {
  const blend = 1 - Math.exp(-seconds * 9);
  return {
    x: current.x + (target.x - current.x) * blend,
    y: current.y + (target.y - current.y) * blend,
    width: current.width + (target.width - current.width) * blend,
    height: current.height + (target.height - current.height) * blend,
  };
}

/** A full-resolution still: the camera's photo mode when the browser has it, otherwise the largest video frame. */
export async function fullResolutionStill(video: HTMLVideoElement, track: MediaStreamTrack | null): Promise<ImageBitmap | HTMLCanvasElement> {
  const ImageCaptureClass = (window as unknown as { ImageCapture?: new (track: MediaStreamTrack) => { takePhoto: () => Promise<Blob> } }).ImageCapture;
  if (ImageCaptureClass && track && track.readyState === "live") {
    try {
      const photo = await createImageBitmap(await new ImageCaptureClass(track).takePhoto());
      // Photo mode can use a different crop than the preview; only trust it when the shape matches.
      if (Math.abs(photo.width / photo.height - video.videoWidth / video.videoHeight) < 0.02) return photo;
    } catch {
      // some cameras refuse photo mode while streaming; the video frame still works
    }
  }
  return frameCanvas(video, 4096);
}

/**
 * Helpa's own zoom: crops the still to a box (with some margin) and enlarges it for the reader. The person's
 * viewfinder never changes; only the picture sent to Muse is magnified.
 */
export function cropAndEnlarge(still: ImageBitmap | HTMLCanvasElement, box: Box, margin = 0.25, longSide = 1600) {
  const left = Math.max(0, box.x - box.width * margin) * still.width;
  const top = Math.max(0, box.y - box.height * margin) * still.height;
  const right = Math.min(1, box.x + box.width * (1 + margin)) * still.width;
  const bottom = Math.min(1, box.y + box.height * (1 + margin)) * still.height;
  const scale = longSide / Math.max(right - left, bottom - top);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((right - left) * scale));
  canvas.height = Math.max(1, Math.round((bottom - top) * scale));
  const context = canvas.getContext("2d")!;
  context.imageSmoothingQuality = "high";
  context.drawImage(still, left, top, right - left, bottom - top, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/* ---------- Tracking between SAM updates ---------- */

export const grayWidth = 160;

/** A small grey copy of the frame for patch tracking and for telling whether the picture moved. */
export function grayFrame(video: HTMLVideoElement, scratch: CanvasRenderingContext2D) {
  const height = Math.round((grayWidth * video.videoHeight) / video.videoWidth);
  // Setting a canvas's size reallocates it even when unchanged, so only on a real change.
  if (scratch.canvas.width !== grayWidth || scratch.canvas.height !== height) {
    scratch.canvas.width = grayWidth;
    scratch.canvas.height = height;
  }
  scratch.drawImage(video, 0, 0, grayWidth, height);
  const pixels = scratch.getImageData(0, 0, grayWidth, height).data;
  const gray = new Float32Array(grayWidth * height);
  for (let index = 0; index < gray.length; index++) gray[index] = pixels[index * 4] * 0.299 + pixels[index * 4 + 1] * 0.587 + pixels[index * 4 + 2] * 0.114;
  return { gray, width: grayWidth, height };
}

export type Gray = ReturnType<typeof grayFrame>;
const patchRadius = 6;

/** Normalized cross-correlation of a patch around (x, y) in one frame with one around (u, v) in another. */
function correlation(first: Gray, x: number, y: number, second: Gray, u: number, v: number) {
  let sumA = 0;
  let sumB = 0;
  let sumAA = 0;
  let sumBB = 0;
  let sumAB = 0;
  let count = 0;
  for (let dy = -patchRadius; dy <= patchRadius; dy += 2) {
    for (let dx = -patchRadius; dx <= patchRadius; dx += 2) {
      const a = first.gray[(y + dy) * first.width + x + dx];
      const b = second.gray[(v + dy) * second.width + u + dx];
      sumA += a;
      sumB += b;
      sumAA += a * a;
      sumBB += b * b;
      sumAB += a * b;
      count++;
    }
  }
  const covariance = sumAB - (sumA * sumB) / count;
  const varianceA = sumAA - (sumA * sumA) / count;
  const varianceB = sumBB - (sumB * sumB) / count;
  if (varianceA < count * 20) return -1; // flat patches (a white door panel) can't be tracked
  return covariance / Math.sqrt(varianceA * varianceB + 1e-6);
}

/**
 * How far the picture shifted between two grey frames, from a few textured patches (preferably inside the part's
 * box). The search also starts at the gyro's guesses, so quick pans still match. Score is the median correlation, 0..1.
 */
export function frameShift(previous: Gray, current: Gray, region: Box | null, guesses: { x: number; y: number }[]) {
  const margin = patchRadius + 12;
  const area = region
    ? { left: region.x * previous.width, top: region.y * previous.height, right: (region.x + region.width) * previous.width, bottom: (region.y + region.height) * previous.height }
    : { left: previous.width * 0.2, top: previous.height * 0.2, right: previous.width * 0.8, bottom: previous.height * 0.8 };
  const shifts: { x: number; y: number; score: number }[] = [];
  for (const [fx, fy] of [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75], [0.5, 0.15], [0.5, 0.85]]) {
    const x = Math.round(Math.min(previous.width - margin, Math.max(margin, area.left + (area.right - area.left) * fx)));
    const y = Math.round(Math.min(previous.height - margin, Math.max(margin, area.top + (area.bottom - area.top) * fy)));
    let best = { x: 0, y: 0, score: -1 };
    for (const center of [{ x: 0, y: 0 }, ...guesses]) {
      const centerX = Math.round(center.x);
      const centerY = Math.round(center.y);
      for (let dy = -6; dy <= 6; dy++) {
        for (let dx = -6; dx <= 6; dx++) {
          const u = x + centerX + dx;
          const v = y + centerY + dy;
          if (u < patchRadius || v < patchRadius || u >= current.width - patchRadius || v >= current.height - patchRadius) continue;
          const score = correlation(previous, x, y, current, u, v);
          if (score > best.score) best = { x: centerX + dx, y: centerY + dy, score };
        }
      }
    }
    if (best.score > 0.55) shifts.push(best);
  }
  if (shifts.length < 2) return { x: 0, y: 0, score: shifts.length ? 0.4 : 0 };
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  return { x: median(shifts.map((shift) => shift.x)), y: median(shifts.map((shift) => shift.y)), score: median(shifts.map((shift) => shift.score)) };
}

/** Mean brightness change between two grey frames, 0 to 255. */
export function grayChange(first: Gray | null, second: Gray | null) {
  if (!first || !second || first.gray.length !== second.gray.length) return 255;
  let total = 0;
  for (let index = 0; index < first.gray.length; index += 3) total += Math.abs(first.gray[index] - second.gray[index]);
  return total / (first.gray.length / 3);
}

/** Phone rotation from the gyro, integrated in radians; iOS asks for permission on a tap. */
export async function requestMotionPermission() {
  const motion = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
  try {
    if (motion?.requestPermission) await motion.requestPermission();
  } catch {
    // denied or not a tap; tracking falls back to the picture alone
  }
}

/** The phone's pitch from the vertical, from DeviceOrientation; a phone pointed at a wall is 0, looking down is positive. */
export function pitchFromBeta(beta: number | null) {
  if (beta === null) return 0.4;
  return Math.min(1.2, Math.max(0, ((90 - beta) * Math.PI) / 180));
}

/* ---------- One animation language: catalog joints and beats ---------- */

/**
 * How far along its joint a beat's part is at a moment, using the same easing as the 3D model so the two move
 * together. `from` is where the part was when the beat began, which is how the camera sees it.
 */
export function beatMotion(beats: Beat[], start: RigState, defs: Record<string, RigPartDef>, index: number, progress: number) {
  const beat = beats[index];
  if (!beat) return null;
  const joint: Joint = defs[beat.part]?.joint ?? { kind: "none" };
  const from = applyBeats(start, beats.slice(0, index))[beat.part] ?? 0;
  const target = actionTarget(beat.action);
  let amount = from;
  if (pulseActions.includes(beat.action)) amount = beat.action === "look" ? from : pulseAmount(beat.action, progress);
  else if (target !== null) amount = moveAmount(joint, from, target, progress);
  return { beat, joint, from, amount, end: target ?? from };
}

/** Rig vectors (x right, y up, z toward you) as the camera sees them when the phone looks down by `pitch`. */
export function toView([x, y, z]: Vec3, pitch: number): Vec3 {
  return [x, y * Math.cos(pitch) - z * Math.sin(pitch), y * Math.sin(pitch) + z * Math.cos(pitch)];
}

/**
 * Where a part's ghost is for a joint amount, relative to where the camera saw it: a pivot on the part (0..1 of
 * its box, y down), a rotation about an axis through that pivot, and a move in pixels (x right, y up, z toward you).
 */
export type Pose = { pivot: [number, number]; axis: Vec3; angle: number; move: Vec3; depth: number };

const twistTurn = (amount: number) => Math.min(1, Math.max(0, amount * 2));
const twistLift = (amount: number) => Math.max(0, amount * 2 - 1);

export function jointPose(joint: Joint, from: number, amount: number, size: { width: number; height: number }, centroid: [number, number], pitch: number, reach = Infinity): Pose {
  // Things slide about their own size, but never off the screen.
  const travel = Math.min(reach, Math.max(size.width, size.height));
  const still: Pose = { pivot: [0.5, 0.5], axis: [0, 0, 1], angle: 0, move: [0, 0, 0], depth: 0 };
  switch (joint.kind) {
    case "slide": {
      const [x, y, z] = toView(joint.direction, pitch);
      const moved = (amount - from) * travel * 0.95;
      return { ...still, move: [x * moved, y * moved, z * moved], depth: Math.abs(amount - from) };
    }
    case "hinge": {
      // The pivot is the box edge on the hinge side: a negative angle about +y swings the right edge toward you.
      const vertical = Math.abs(joint.axis[1]) >= Math.abs(joint.axis[0]);
      const pivot: [number, number] = vertical ? [joint.angle < 0 ? 0 : 1, 0.5] : [0.5, joint.angle > 0 ? 1 : 0];
      // A flat hologram swung past about 70 degrees turns edge-on and vanishes, so swings out of the screen's
      // plane stop there; it still reads as wide open. Swings in the screen's plane (a tap handle) keep their angle.
      const axis = toView(joint.axis, pitch);
      const angle = Math.abs(axis[2]) < 0.7 ? Math.sign(joint.angle) * Math.min(Math.abs(joint.angle), 1.22) : joint.angle;
      return { ...still, pivot, axis, angle: angle * (amount - from), depth: Math.abs(amount - from) };
    }
    case "twist": {
      const lift = (twistLift(amount) - twistLift(from)) * size.height * 1.1;
      const [x, y, z] = toView(joint.axis, pitch);
      return { pivot: centroid, axis: [x, y, z], angle: joint.angle * (twistTurn(amount) - twistTurn(from)), move: [x * lift, y * lift, z * lift], depth: Math.abs(amount - from) };
    }
    case "turn":
      return { ...still, pivot: centroid, axis: toView(joint.axis, pitch), angle: joint.angle * (amount - from) };
    case "press": {
      const [x, y, z] = toView(joint.direction, pitch);
      const pushed = amount * Math.min(size.width, size.height) * 0.12;
      return { ...still, move: [x * pushed, y * pushed, z * pushed] };
    }
    case "debris": {
      const [x, y, z] = toView(joint.away, pitch);
      const length = Math.hypot(x, y, z) || 1;
      const moved = (amount - from) * travel * 1.2;
      return { ...still, move: [(x / length) * moved, (y / length) * moved, (z / length) * moved], depth: Math.abs(amount - from) };
    }
    default:
      return still;
  }
}

/** Short words for the lock-on label, from the beat and its joint: "SLIDE UP", "SWING OPEN", "TWIST LEFT". */
export function actionWords(action: string, joint: Joint) {
  const slideWord = (direction: Vec3, out: boolean) => {
    const [x, y, z] = out ? direction : (direction.map((value) => -value) as Vec3);
    if (Math.abs(y) >= Math.abs(x) && Math.abs(y) >= Math.abs(z)) return y > 0 ? "SLIDE UP" : "SLIDE DOWN";
    if (Math.abs(z) >= Math.abs(x)) return z > 0 ? "PULL OUT" : "PUSH IN";
    return x > 0 ? "SLIDE RIGHT" : "SLIDE LEFT";
  };
  const twistWord = (angle: number, locking: boolean) => ((angle > 0) !== locking ? "TWIST LEFT" : "TWIST RIGHT");
  switch (action) {
    case "open":
      return joint.kind === "slide" ? slideWord(joint.direction, true) : joint.kind === "hinge" ? "SWING OPEN" : "OPEN";
    case "close":
      return joint.kind === "slide" ? slideWord(joint.direction, false) : joint.kind === "hinge" ? "SWING SHUT" : "CLOSE";
    case "remove":
      return joint.kind === "slide" ? slideWord(joint.direction, true) : joint.kind === "twist" ? "LIFT OUT" : "TAKE OUT";
    case "insert":
      return joint.kind === "slide" ? slideWord(joint.direction, false) : "PUT BACK";
    case "unlock":
      return joint.kind === "twist" ? twistWord(joint.angle, false) : "UNLOCK";
    case "lock":
      return joint.kind === "twist" ? twistWord(joint.angle, true) : "LOCK";
    case "turn":
      return "TURN";
    case "press":
      return "PRESS";
    case "clean":
      return "CLEAN OFF";
    default:
      return "LOOK HERE";
  }
}
