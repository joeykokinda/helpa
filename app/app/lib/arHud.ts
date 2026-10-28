import type { ScreenRect } from "./arLayer";

/** The flat 2D layer over the holograms: lock-on brackets, the label, motion trails and particles. */

// White for what Helpa sees, orange for what your hands do, over a soft ink under-stroke so both read anywhere.
const white = "#ffffff";
const orange = "#ff5b2e";
const under = "rgba(14, 14, 15, 0.42)";
const ink = "#0e0e0f";

/** The app's own typeface for canvas text (next/font gives it a generated family name). */
let fontFamily = "";
function font(weight: number, size: number) {
  if (!fontFamily && typeof document !== "undefined") fontFamily = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  return `${weight} ${size}px ${fontFamily || "system-ui, sans-serif"}`;
}

/** "SLIDE UP" from the motion words, as a person would say it: "Slide up". */
function sentence(text: string) {
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

const easeOutBack = (progress: number) => 1 + 2.7 * (progress - 1) ** 3 + 1.7 * (progress - 1) ** 2;

/** Strokes a path twice, dark and wide under bright and thin, so it reads on a white dryer and a black engine. */
function doubleStroke(context: CanvasRenderingContext2D, width: number, color: string, draw: () => void) {
  context.strokeStyle = under;
  context.lineWidth = width + 3;
  context.beginPath();
  draw();
  context.stroke();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.beginPath();
  draw();
  context.stroke();
}

/** The swung part's outline in perspective, so a door still reads when its hologram is nearly edge-on. */
export function drawOutline(context: CanvasRenderingContext2D, corners: { x: number; y: number }[], opacity: number) {
  if (opacity <= 0.01) return;
  context.save();
  context.globalAlpha = opacity;
  context.lineJoin = "round";
  doubleStroke(context, 2, white, () => {
    corners.forEach((corner, index) => (index ? context.lineTo(corner.x, corner.y) : context.moveTo(corner.x, corner.y)));
    context.closePath();
  });
  context.restore();
}

/** Corner brackets that snap onto the part, then its label; `rising` puts the label below, out of the ghost's way. */
export function drawLockOn(context: CanvasRenderingContext2D, rect: ScreenRect, lock: number, opacity: number, name: string, action: string, rising = false) {
  if (opacity <= 0.01) return;
  const snap = easeOutBack(Math.min(1, lock));
  const spread = (1 - snap) * 34;
  const pad = 6;
  const left = rect.left - pad - spread;
  const top = rect.top - pad - spread;
  const right = rect.left + rect.width + pad + spread;
  const bottom = rect.top + rect.height + pad + spread;
  const arm = Math.max(10, Math.min(26, Math.min(rect.width, rect.height) * 0.28));
  context.save();
  context.globalAlpha = opacity * Math.min(1, lock * 1.6);
  context.lineCap = "round";
  context.lineJoin = "round";
  // Rounded corner brackets, like a camera's focus box.
  const bend = Math.min(8, arm * 0.45);
  doubleStroke(context, 3, white, () => {
    for (const [x, y, dx, dy] of [
      [left, top, 1, 1],
      [right, top, -1, 1],
      [left, bottom, 1, -1],
      [right, bottom, -1, -1],
    ]) {
      context.moveTo(x + dx * arm, y);
      context.lineTo(x + dx * bend, y);
      context.quadraticCurveTo(x, y, x, y + dy * bend);
      context.lineTo(x, y + dy * arm);
    }
  });

  if (lock > 0.45) {
    const text = context.globalAlpha;
    context.globalAlpha = text * Math.min(1, (lock - 0.45) * 3);
    // A white pill: the part's name in ink, then the move in orange.
    const nameText = name;
    const actionText = sentence(action);
    context.font = font(600, 13);
    const nameWidth = context.measureText(nameText).width;
    context.font = font(800, 13);
    const actionWidth = context.measureText(actionText).width;
    const width = 14 + nameWidth + 16 + actionWidth + 14;
    const height = 28;
    const canvasWidth = context.canvas.clientWidth || context.canvas.width;
    const canvasHeight = context.canvas.clientHeight || context.canvas.height;
    const above = rising ? bottom + height + 10 > canvasHeight - 120 : top > 52;
    const labelX = Math.min(canvasWidth - width - 8, Math.max(8, (left + right) / 2 - width / 2));
    const labelY = above ? top - height - 10 : bottom + 10;
    context.shadowColor = "rgba(0, 0, 0, 0.28)";
    context.shadowBlur = 12;
    context.shadowOffsetY = 3;
    context.fillStyle = white;
    context.beginPath();
    context.roundRect(labelX, labelY, width, height, height / 2);
    context.fill();
    context.shadowColor = "transparent";
    context.textBaseline = "middle";
    context.font = font(600, 13);
    context.fillStyle = ink;
    context.fillText(nameText, labelX + 14, labelY + height / 2 + 0.5);
    const dotX = labelX + 14 + nameWidth + 8;
    context.fillStyle = "rgba(14, 14, 15, 0.25)";
    context.beginPath();
    context.arc(dotX, labelY + height / 2, 2, 0, Math.PI * 2);
    context.fill();
    context.font = font(800, 13);
    context.fillStyle = orange;
    context.fillText(actionText, dotX + 8, labelY + height / 2 + 0.5);
  }
  context.restore();
}

/** A glowing dashed trail along the ghost's path, with chevrons pointing the way and an arrowhead at the end. */
export function drawTrail(context: CanvasRenderingContext2D, points: { x: number; y: number }[], opacity: number, time: number) {
  if (points.length < 2 || opacity <= 0.01) return;
  const last = points[points.length - 1];
  const length = points.reduce((total, point, index) => (index ? total + Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) : 0), 0);
  if (length < 14) return;
  context.save();
  context.globalAlpha = opacity;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.setLineDash([8, 9]);
  context.lineDashOffset = -time * 40;
  doubleStroke(context, 3.5, orange, () => {
    context.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) context.lineTo(point.x, point.y);
  });
  context.setLineDash([]);

  // Chevrons travel along the trail.
  const pointAt = (distance: number) => {
    let walked = 0;
    for (let index = 1; index < points.length; index++) {
      const step = Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
      if (walked + step >= distance) {
        const blend = (distance - walked) / (step || 1);
        return {
          x: points[index - 1].x + (points[index].x - points[index - 1].x) * blend,
          y: points[index - 1].y + (points[index].y - points[index - 1].y) * blend,
          angle: Math.atan2(points[index].y - points[index - 1].y, points[index].x - points[index - 1].x),
        };
      }
      walked += step;
    }
    return { ...last, angle: 0 };
  };
  const chevron = (x: number, y: number, angle: number, size: number) => {
    context.moveTo(x - size * Math.cos(angle - 0.7), y - size * Math.sin(angle - 0.7));
    context.lineTo(x, y);
    context.lineTo(x - size * Math.cos(angle + 0.7), y - size * Math.sin(angle + 0.7));
  };
  for (let index = 0; index < 3; index++) {
    const distance = (((time * 0.6 + index / 3) % 1) * 0.8 + 0.1) * length;
    const at = pointAt(distance);
    doubleStroke(context, 3, white, () => chevron(at.x, at.y, at.angle, 8));
  }
  const end = pointAt(length);
  context.fillStyle = orange;
  context.strokeStyle = white;
  context.lineWidth = 2.5;
  context.beginPath();
  context.moveTo(end.x + 13 * Math.cos(end.angle), end.y + 13 * Math.sin(end.angle));
  context.lineTo(end.x + 13 * Math.cos(end.angle + 2.5), end.y + 13 * Math.sin(end.angle + 2.5));
  context.lineTo(end.x + 13 * Math.cos(end.angle - 2.5), end.y + 13 * Math.sin(end.angle - 2.5));
  context.closePath();
  context.stroke();
  context.fill();
  context.restore();
}

/** A curved arrow around a knob or a cap for turns and twists. */
export function drawTurn(context: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number, clockwise: boolean, opacity: number, time: number) {
  if (opacity <= 0.01) return;
  const start = -Math.PI * 0.85;
  const sweep = Math.PI * 1.1 * (clockwise ? 1 : -1);
  const end = start + sweep;
  context.save();
  context.globalAlpha = opacity;
  context.lineCap = "round";
  context.setLineDash([8, 9]);
  context.lineDashOffset = -time * 40 * (clockwise ? 1 : -1);
  doubleStroke(context, 3.5, orange, () => context.arc(centerX, centerY, radius, start, end, !clockwise));
  context.setLineDash([]);
  const tipX = centerX + radius * Math.cos(end);
  const tipY = centerY + radius * Math.sin(end);
  const heading = end + (clockwise ? Math.PI / 2 : -Math.PI / 2);
  context.fillStyle = orange;
  context.strokeStyle = white;
  context.lineWidth = 2.5;
  context.beginPath();
  context.moveTo(tipX + 13 * Math.cos(heading), tipY + 13 * Math.sin(heading));
  context.lineTo(tipX + 13 * Math.cos(heading + 2.5), tipY + 13 * Math.sin(heading + 2.5));
  context.lineTo(tipX + 13 * Math.cos(heading - 2.5), tipY + 13 * Math.sin(heading - 2.5));
  context.closePath();
  context.stroke();
  context.fill();
  context.restore();
}

/** Rings bursting out of a button as it goes in. */
export function drawPress(context: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number, amount: number, opacity: number) {
  context.save();
  for (const lag of [0, 0.3]) {
    const grow = Math.min(1, Math.max(0, amount - lag) / (1 - lag));
    context.globalAlpha = opacity * (1 - grow);
    doubleStroke(context, 3, lag ? white : orange, () => context.arc(centerX, centerY, radius * (1 + grow * 0.9), 0, Math.PI * 2));
  }
  context.restore();
}

type Particle = { x: number; y: number; vx: number; vy: number; life: number; age: number; size: number; gravity: number; warm: boolean };

/** Debris and fluid streams: lint and grime in white, oil warm amber so it reads as oil. */
export class Particles {
  private items: Particle[] = [];

  /** Bits peeling off along a direction (lint, food scraps, grime). */
  burst(x: number, y: number, spreadX: number, spreadY: number, directionX: number, directionY: number, count: number) {
    for (let index = 0; index < count; index++) {
      const speed = 40 + Math.random() * 90;
      this.items.push({
        x: x + (Math.random() - 0.5) * spreadX,
        y: y + (Math.random() - 0.5) * spreadY,
        vx: directionX * speed + (Math.random() - 0.5) * 30,
        vy: directionY * speed + (Math.random() - 0.5) * 30,
        life: 0.9 + Math.random() * 0.7,
        age: 0,
        size: 1.5 + Math.random() * 2.5,
        gravity: 30,
        warm: false,
      });
    }
  }

  /** A falling stream, called every frame while the fluid runs. */
  stream(x: number, y: number, width: number, rate: number, seconds: number, warm: boolean) {
    const count = Math.round(rate * seconds + Math.random());
    for (let index = 0; index < count; index++) {
      this.items.push({ x: x + (Math.random() - 0.5) * width, y, vx: (Math.random() - 0.5) * 10, vy: 30 + Math.random() * 30, life: 1.2, age: 0, size: 2 + Math.random() * 2, gravity: 520, warm });
    }
  }

  step(seconds: number) {
    for (const particle of this.items) {
      particle.age += seconds;
      particle.vy += particle.gravity * seconds;
      particle.x += particle.vx * seconds;
      particle.y += particle.vy * seconds;
    }
    this.items = this.items.filter((particle) => particle.age < particle.life).slice(-500);
  }

  draw(context: CanvasRenderingContext2D, floor: number) {
    context.save();
    for (const particle of this.items) {
      if (particle.y > floor) continue;
      const fade = 1 - particle.age / particle.life;
      context.globalAlpha = fade;
      context.fillStyle = under;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size + 1.5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = particle.warm ? "#ffb347" : white;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  clear() {
    this.items = [];
  }
}
