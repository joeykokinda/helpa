"use client";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useEffect, useId, useState, type CSSProperties } from "react";

export type HelpaMood =
  | "idle"
  | "listening"
  | "thinking"
  | "searching"
  | "found"
  | "explaining"
  | "pointing"
  | "worried"
  | "celebrate";

export const HELPA_MOODS: HelpaMood[] = [
  "idle",
  "listening",
  "thinking",
  "searching",
  "found",
  "explaining",
  "pointing",
  "worried",
  "celebrate",
];

type Point = { x: number; y: number };

type HelpaProps = {
  mood?: HelpaMood;
  speaking?: boolean;
  /** Direction to look or point, each axis from -1 to 1, positive y is down. */
  lookAt?: Point;
  size?: number;
  className?: string;
};

const palette = {
  outline: "#2a1d17",
  wall: "#fff3e0",
  roof: "#ff6a3d",
  chimney: "#e2522a",
  glow: "#ffd98a",
  door: "#d9572f",
  doorInside: "#ffc46b",
  cheek: "#f79a86",
  doormat: "#a3b47f",
  smoke: "#ece5dc",
  smokeEdge: "#a8998b",
  sparkle: "#ffd23f",
  tongue: "#f28b7d",
};

const confettiColors = [palette.roof, palette.sparkle, palette.doormat, palette.cheek];

const softSpring = { type: "spring", stiffness: 170, damping: 18 } as const;
const settleSpring = { type: "spring", stiffness: 140, damping: 20 } as const;
const snappySpring = { type: "spring", stiffness: 520, damping: 26 } as const;

const leftEye = { x: 70, y: 124 };
const rightEye = { x: 130, y: 124 };

/** Fixed SVG pivot in viewBox units, so particles never shift a group's origin. */
function pivot(x: number, y: number): CSSProperties {
  return { transformBox: "view-box", transformOrigin: `${x}px ${y}px` };
}

function clampUnit(value: number) {
  return Math.max(-1, Math.min(1, value));
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

type MouthShape = "smile" | "flat" | "wobble" | "grin" | "o";

type MoodLook = {
  pose: { x: number; y: number; rotate: number; scale: number };
  eyeScale: number;
  pupil?: Point;
  happyEyes: boolean;
  brows: { left: number; right: number; lift: number };
  mouth: MouthShape;
};

const moodLooks: Record<HelpaMood, MoodLook> = {
  idle: {
    pose: { x: 0, y: 0, rotate: 0, scale: 1 },
    eyeScale: 1,
    happyEyes: false,
    brows: { left: 0, right: 0, lift: 0 },
    mouth: "smile",
  },
  listening: {
    pose: { x: 0, y: 3, rotate: 0, scale: 1.05 },
    eyeScale: 1.14,
    happyEyes: false,
    brows: { left: -4, right: 4, lift: -4 },
    mouth: "o",
  },
  thinking: {
    pose: { x: 0, y: 0, rotate: -3, scale: 1 },
    eyeScale: 1,
    pupil: { x: 5, y: -6 },
    happyEyes: false,
    brows: { left: 0, right: -10, lift: -2 },
    mouth: "flat",
  },
  searching: {
    pose: { x: 0, y: 0, rotate: 0, scale: 1 },
    eyeScale: 1.06,
    happyEyes: false,
    brows: { left: 6, right: -6, lift: 0 },
    mouth: "flat",
  },
  found: {
    pose: { x: 0, y: 0, rotate: 0, scale: 1.03 },
    eyeScale: 1,
    happyEyes: true,
    brows: { left: -6, right: 6, lift: -3 },
    mouth: "grin",
  },
  explaining: {
    pose: { x: 0, y: 0, rotate: 0, scale: 1 },
    eyeScale: 1.02,
    happyEyes: false,
    brows: { left: -3, right: 3, lift: -1 },
    mouth: "smile",
  },
  pointing: {
    pose: { x: 0, y: 0, rotate: 0, scale: 1 },
    eyeScale: 1.04,
    happyEyes: false,
    brows: { left: -3, right: 3, lift: -2 },
    mouth: "smile",
  },
  worried: {
    pose: { x: 0, y: 4, rotate: 0, scale: 0.9 },
    eyeScale: 1.06,
    pupil: { x: 0, y: 3 },
    happyEyes: false,
    brows: { left: -16, right: 16, lift: -2 },
    mouth: "wobble",
  },
  celebrate: {
    pose: { x: 0, y: 0, rotate: 0, scale: 1.05 },
    eyeScale: 1,
    happyEyes: true,
    brows: { left: -8, right: 8, lift: -4 },
    mouth: "grin",
  },
};

type LoopSpec = { keyframes: number[]; duration: number; times?: number[]; repeatDelay?: number };
type BodyChannel = "x" | "y" | "rotate" | "scaleX" | "scaleY";

const bodyLoops: Record<HelpaMood, Partial<Record<BodyChannel, LoopSpec>>> = {
  idle: {
    y: { keyframes: [0, -3, 0], duration: 3.2 },
    scaleY: { keyframes: [1, 1.02, 1], duration: 3.2 },
  },
  listening: {
    scaleX: { keyframes: [1, 1.025, 1], duration: 1.4 },
    scaleY: { keyframes: [1, 1.025, 1], duration: 1.4 },
  },
  thinking: {
    rotate: { keyframes: [0, 2, 0, -2, 0], duration: 4.4 },
    y: { keyframes: [0, -2, 0], duration: 2.2 },
  },
  searching: {
    x: { keyframes: [0, -3, 0, 3, 0], duration: 1.3 },
  },
  found: {
    y: { keyframes: [0, -16, 0, 0], times: [0, 0.35, 0.7, 1], duration: 0.9, repeatDelay: 0.5 },
    scaleY: { keyframes: [1, 1.05, 0.9, 1], times: [0, 0.35, 0.72, 1], duration: 0.9, repeatDelay: 0.5 },
    scaleX: { keyframes: [1, 0.97, 1.08, 1], times: [0, 0.35, 0.72, 1], duration: 0.9, repeatDelay: 0.5 },
  },
  explaining: {
    y: { keyframes: [0, -2, 0], duration: 2.6 },
  },
  pointing: {
    y: { keyframes: [0, -2, 0], duration: 2 },
  },
  worried: {
    x: { keyframes: [0, -1.2, 1.2, -1.2, 0], duration: 0.4, repeatDelay: 0.8 },
  },
  celebrate: {
    y: { keyframes: [0, -28, 0, 0], times: [0, 0.4, 0.8, 1], duration: 0.85 },
    scaleY: { keyframes: [1, 1.06, 0.88, 1], times: [0, 0.4, 0.82, 1], duration: 0.85 },
    scaleX: { keyframes: [1, 0.96, 1.1, 1], times: [0, 0.4, 0.82, 1], duration: 0.85 },
    rotate: { keyframes: [0, -5, 0, 5, 0], duration: 1.7 },
  },
};

const searchDart: LoopSpec = { keyframes: [0, -6, -6, 6, 6, 0], times: [0, 0.15, 0.4, 0.55, 0.85, 1], duration: 1.6 };

/** Springs a value back to rest, then loops it. Returns a stop function. */
function playLoop(value: MotionValue<number>, rest: number, loop: LoopSpec | undefined, intensity: number) {
  let stopped = false;
  let current = animate(value, rest, settleSpring);
  if (loop) {
    current.then(() => {
      if (stopped) return;
      current = animate(
        value,
        loop.keyframes.map((keyframe) => rest + (keyframe - rest) * intensity),
        {
          duration: loop.duration,
          times: loop.times,
          repeat: Infinity,
          repeatDelay: loop.repeatDelay,
          ease: "easeInOut",
        },
      );
    });
  }
  return () => {
    stopped = true;
    current.stop();
  };
}

const mouthStrokePaths: Record<"smile" | "flat" | "wobble", string> = {
  smile: "M 92 156 Q 96 162 100 162 Q 104 162 108 156",
  flat: "M 94 160 Q 97 160 100 160 Q 103 160 106 158.5",
  wobble: "M 91 160 Q 95.5 155 100 160 Q 104.5 165 109 160",
};

const heartPath =
  "M 0 5 C -8 -1 -8 -8 -3 -8 C -1.3 -8 0 -6.6 0 -5.4 C 0 -6.6 1.3 -8 3 -8 C 8 -8 8 -1 0 5 Z";
const sparklePath = "M 0 -9 Q 1.6 -1.6 9 0 Q 1.6 1.6 0 9 Q -1.6 1.6 -9 0 Q -1.6 -1.6 0 -9 Z";

const celebrationBits = [
  { kind: "heart", startX: 100, endX: 40, endY: -10, color: palette.roof, delay: 0 },
  { kind: "confetti", startX: 96, endX: 70, endY: -20, color: confettiColors[1], delay: 0.25 },
  { kind: "heart", startX: 104, endX: 162, endY: -6, color: palette.cheek, delay: 0.5 },
  { kind: "confetti", startX: 100, endX: 132, endY: -22, color: confettiColors[2], delay: 0.75 },
  { kind: "confetti", startX: 102, endX: 22, endY: 30, color: confettiColors[0], delay: 1 },
  { kind: "heart", startX: 98, endX: 186, endY: 34, color: palette.roof, delay: 1.25 },
] as const;

const sparkles = [
  { x: 178, y: 54, scale: 1, delay: 0 },
  { x: 24, y: 64, scale: 0.75, delay: 0.35 },
  { x: 166, y: 18, scale: 0.6, delay: 0.7 },
];

function Eye({
  center,
  clipId,
  eyeScale,
  pupilTarget,
  dartX,
  blinking,
  happy,
  browRotate,
  browLift,
}: {
  center: Point;
  clipId: string;
  eyeScale: number;
  pupilTarget: Point;
  dartX: MotionValue<number>;
  blinking: boolean;
  happy: boolean;
  browRotate: number;
  browLift: number;
}) {
  return (
    <g>
      <rect
        x={center.x - 20}
        y={center.y + 16}
        width={40}
        height={6}
        rx={3}
        fill={palette.roof}
        stroke={palette.outline}
        strokeWidth={3}
      />
      <motion.g style={pivot(center.x, center.y)} animate={{ scale: eyeScale }} transition={softSpring}>
        <clipPath id={clipId}>
          <rect x={center.x - 16} y={center.y - 16} width={32} height={32} rx={9} />
        </clipPath>
        <rect
          x={center.x - 16}
          y={center.y - 16}
          width={32}
          height={32}
          rx={9}
          fill={palette.glow}
          stroke={palette.outline}
          strokeWidth={4.5}
        />
        <g clipPath={`url(#${clipId})`}>
          <motion.g animate={{ ...pupilTarget, opacity: happy ? 0 : 1 }} transition={softSpring}>
            <motion.g style={{ x: dartX }}>
              <motion.g
                style={pivot(center.x, center.y + 1)}
                animate={{ scaleY: blinking ? 0.1 : 1 }}
                transition={{ duration: 0.07 }}
              >
                <ellipse cx={center.x} cy={center.y + 1} rx={6} ry={7.5} fill={palette.outline} />
                <circle cx={center.x + 2} cy={center.y - 2} r={2} fill="#ffffff" />
              </motion.g>
            </motion.g>
          </motion.g>
        </g>
        <motion.path
          d={`M ${center.x - 8} ${center.y + 4} Q ${center.x} ${center.y - 8} ${center.x + 8} ${center.y + 4}`}
          fill="none"
          stroke={palette.outline}
          strokeWidth={4}
          strokeLinecap="round"
          style={pivot(center.x, center.y)}
          initial={false}
          animate={{ opacity: happy ? 1 : 0, scale: happy ? 1 : 0.6 }}
          transition={softSpring}
        />
      </motion.g>
      <motion.rect
        x={center.x - 10}
        y={center.y - 26}
        width={20}
        height={5}
        rx={2.5}
        fill={palette.outline}
        style={pivot(center.x, center.y - 23)}
        initial={false}
        animate={{ rotate: browRotate, y: browLift }}
        transition={softSpring}
      />
    </g>
  );
}

function Mouth({ shape, hidden }: { shape: MouthShape; hidden: boolean }) {
  const isStroke = shape === "smile" || shape === "flat" || shape === "wobble";
  return (
    <motion.g initial={false} animate={{ opacity: hidden ? 0 : 1 }} transition={{ duration: 0.12 }}>
      <motion.g
        initial={false}
        animate={shape === "wobble" ? { x: [0, -1.4, 1.4, 0] } : { x: 0 }}
        transition={shape === "wobble" ? { duration: 0.5, repeat: Infinity } : softSpring}
      >
        <motion.path
          fill="none"
          stroke={palette.outline}
          strokeWidth={3.5}
          strokeLinecap="round"
          initial={false}
          animate={{
            d: isStroke ? mouthStrokePaths[shape] : mouthStrokePaths.smile,
            opacity: isStroke ? 1 : 0,
          }}
          transition={softSpring}
        />
      </motion.g>
      <motion.g
        style={pivot(100, 158)}
        initial={false}
        animate={{ opacity: shape === "grin" ? 1 : 0, scale: shape === "grin" ? 1 : 0.4 }}
        transition={softSpring}
      >
        <path d="M 90 155 Q 100 155 110 155 Q 108 168 100 168 Q 92 168 90 155 Z" fill={palette.outline} />
        <ellipse cx={100} cy={165} rx={4.5} ry={2.6} fill={palette.tongue} />
      </motion.g>
      <motion.ellipse
        cx={100}
        cy={160}
        rx={4}
        ry={5}
        fill={palette.outline}
        style={pivot(100, 160)}
        initial={false}
        animate={{ opacity: shape === "o" ? 1 : 0, scale: shape === "o" ? 1 : 0.3 }}
        transition={softSpring}
      />
    </motion.g>
  );
}

function SmokePuffs({ reduced }: { reduced: boolean }) {
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
      {[0, 1, 2].map((index) => (
        <motion.circle
          key={index}
          cx={140}
          cy={26}
          r={8}
          fill={palette.smoke}
          stroke={palette.smokeEdge}
          strokeWidth={2.5}
          style={pivot(140, 26)}
          initial={{ opacity: 0, scale: 0.4, x: 0, y: 0 }}
          animate={
            reduced
              ? { opacity: [0, 0.9, 0], scale: 0.9, y: -14 - index * 10 }
              : { opacity: [0, 0.95, 0.8, 0], scale: [0.4, 0.9, 1.2, 1.4], y: [0, -16, -32, -44], x: [0, 4, -2, 3] }
          }
          transition={{ duration: 2.4, repeat: Infinity, delay: index * 0.8, ease: "easeOut" }}
        />
      ))}
    </motion.g>
  );
}

function Sparkles({ reduced }: { reduced: boolean }) {
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {sparkles.map((sparkle) => (
        <g key={`${sparkle.x}-${sparkle.y}`} transform={`translate(${sparkle.x} ${sparkle.y})`}>
          <motion.path
          d={sparklePath}
          fill={palette.sparkle}
          stroke={palette.outline}
          strokeWidth={2}
          strokeLinejoin="round"
          style={pivot(0, 0)}
          initial={{ scale: 0 }}
          animate={
            reduced
              ? { scale: sparkle.scale }
              : { scale: [0, sparkle.scale * 1.15, sparkle.scale * 0.8, 0], rotate: [0, 30, 60, 90] }
          }
          transition={{ duration: 1.4, repeat: Infinity, delay: sparkle.delay, ease: "easeOut" }}
          />
        </g>
      ))}
    </motion.g>
  );
}

function Celebration({ reduced }: { reduced: boolean }) {
  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {celebrationBits.map((bit, index) => (
        <motion.g
          key={index}
          initial={{ x: bit.startX, y: 60, opacity: 0, scale: 0.4 }}
          animate={
            reduced
              ? { x: bit.endX, y: bit.endY + 20, opacity: [0, 1, 0], scale: 1 }
              : {
                  x: [bit.startX, (bit.startX + bit.endX) / 2, bit.endX],
                  y: [60, bit.endY - 10, bit.endY + 30],
                  opacity: [0, 1, 1, 0],
                  scale: [0.4, 1.1, 0.9],
                  rotate: [0, bit.kind === "heart" ? 12 : 200, bit.kind === "heart" ? -8 : 360],
                }
          }
          transition={{ duration: 1.6, repeat: Infinity, delay: bit.delay, ease: "easeOut" }}
        >
          {bit.kind === "heart" ? (
            <path d={heartPath} fill={bit.color} stroke={palette.outline} strokeWidth={2} strokeLinejoin="round" />
          ) : (
            <rect x={-4} y={-2.5} width={8} height={5} rx={1.5} fill={bit.color} />
          )}
        </motion.g>
      ))}
    </motion.g>
  );
}

function MagnifyingGlass({ reduced }: { reduced: boolean }) {
  return (
    <motion.g
      style={pivot(176, 160)}
      initial={{ opacity: 0, scale: 0.3 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.3 }}
      transition={softSpring}
    >
      <motion.g
        animate={reduced ? { x: 0 } : { x: [0, -10, -10, 4, 4, 0], y: [0, -4, -4, 2, 2, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <line x1={182} y1={167} x2={192} y2={178} stroke={palette.outline} strokeWidth={7} strokeLinecap="round" />
        <circle cx={174} cy={158} r={11} fill="#ffffff" fillOpacity={0.45} stroke={palette.outline} strokeWidth={4.5} />
        <path d="M 168 154 Q 170 150 174 150" fill="none" stroke="#ffffff" strokeWidth={2.5} strokeLinecap="round" />
      </motion.g>
    </motion.g>
  );
}

function PointingArm({ direction }: { direction: Point }) {
  const side = direction.x >= 0 ? 1 : -1;
  const degrees = (Math.atan2(direction.y, Math.abs(direction.x) || 0.0001) * 180) / Math.PI;
  const angle = Math.max(-70, Math.min(70, degrees)) * side;
  const shoulderX = side > 0 ? 150 : 50;
  const shoulderY = 150;
  const handX = shoulderX + 40 * side;
  return (
    <motion.g
      style={pivot(shoulderX, shoulderY)}
      initial={{ opacity: 0, scale: 0.2, rotate: 0 }}
      animate={{ opacity: 1, scale: 1, rotate: angle }}
      exit={{ opacity: 0, scale: 0.2 }}
      transition={softSpring}
    >
      <line x1={shoulderX} y1={shoulderY} x2={handX} y2={shoulderY} stroke={palette.outline} strokeWidth={10} strokeLinecap="round" />
      <line x1={shoulderX} y1={shoulderY} x2={handX} y2={shoulderY} stroke={palette.wall} strokeWidth={4.5} strokeLinecap="round" />
      <circle cx={handX + 3 * side} cy={shoulderY} r={6.5} fill={palette.wall} stroke={palette.outline} strokeWidth={3.5} />
    </motion.g>
  );
}

export default function Helpa({ mood = "idle", speaking = false, lookAt, size = 160, className }: HelpaProps) {
  const reduced = useReducedMotion() ?? false;
  const look = moodLooks[mood];
  const idBase = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const loopX = useMotionValue(0);
  const loopY = useMotionValue(0);
  const loopRotate = useMotionValue(0);
  const loopScaleX = useMotionValue(1);
  const loopScaleY = useMotionValue(1);
  const dartX = useMotionValue(0);
  const shadowScale = useTransform(loopY, [-30, 0], [0.62, 1]);

  const [blinking, setBlinking] = useState(false);
  const [wander, setWander] = useState<Point>({ x: 0, y: 0 });
  const [doorOpenness, setDoorOpenness] = useState(0);

  useEffect(() => {
    const intensity = reduced ? 0.2 : 1;
    const loops = bodyLoops[mood];
    const stops = [
      playLoop(loopX, 0, loops.x, intensity),
      playLoop(loopY, 0, loops.y, intensity),
      playLoop(loopRotate, 0, loops.rotate, intensity),
      playLoop(loopScaleX, 1, loops.scaleX, intensity),
      playLoop(loopScaleY, 1, loops.scaleY, intensity),
      playLoop(dartX, 0, mood === "searching" ? searchDart : undefined, intensity),
    ];
    return () => stops.forEach((stop) => stop());
  }, [mood, reduced, loopX, loopY, loopRotate, loopScaleX, loopScaleY, dartX]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const scheduleBlink = () => {
      timer = setTimeout(() => {
        setBlinking(true);
        timer = setTimeout(() => {
          setBlinking(false);
          scheduleBlink();
        }, 130);
      }, randomBetween(2200, 5600));
    };
    scheduleBlink();
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (mood !== "idle" || reduced) return;
    let timer: ReturnType<typeof setTimeout>;
    const wanderAgain = () => {
      timer = setTimeout(() => {
        setWander(Math.random() < 0.35 ? { x: 0, y: 0 } : { x: randomBetween(-5, 5), y: randomBetween(-3, 3) });
        wanderAgain();
      }, randomBetween(1400, 3200));
    };
    wanderAgain();
    return () => clearTimeout(timer);
  }, [mood, reduced]);

  useEffect(() => {
    if (!speaking) return;
    let timer: ReturnType<typeof setTimeout>;
    const flap = () => {
      setDoorOpenness((previous) => (previous > 0.35 ? randomBetween(0, 0.2) : randomBetween(0.45, 1)));
      timer = setTimeout(flap, randomBetween(90, 210));
    };
    timer = setTimeout(flap, 0);
    return () => clearTimeout(timer);
  }, [speaking]);

  const pointDirection = lookAt ? { x: clampUnit(lookAt.x), y: clampUnit(lookAt.y) } : { x: 1, y: 0.3 };
  const followsLookAt = mood === "pointing" || (lookAt && (mood === "idle" || mood === "listening" || mood === "explaining"));

  let pupilTarget: Point = { x: 0, y: 0 };
  if (look.pupil) pupilTarget = look.pupil;
  else if (followsLookAt) pupilTarget = { x: pointDirection.x * 6, y: pointDirection.y * 5 };
  else if (mood === "idle") pupilTarget = wander;

  const pose =
    mood === "pointing"
      ? { x: pointDirection.x * 8, y: Math.max(0, pointDirection.y) * 3, rotate: pointDirection.x * 7, scale: 1 }
      : look.pose;

  const doorTalkAmount = reduced ? 0.35 : 0.72;
  const doorPanel = speaking
    ? { scaleX: 1 - doorOpenness * doorTalkAmount }
    : mood === "celebrate" && !reduced
      ? { scaleX: [1, 0.35, 1, 0.35, 1, 1] }
      : { scaleX: 1 };
  const doorTransition = speaking
    ? snappySpring
    : mood === "celebrate" && !reduced
      ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" as const }
      : softSpring;

  const showSmoke = mood === "thinking" || mood === "searching";

  return (
    <svg
      viewBox="-15 -25 230 230"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`Helpa the house helper, ${mood}${speaking ? ", speaking" : ""}`}
      style={{ overflow: "visible", display: "block" }}
    >
      <motion.ellipse
        cx={100}
        cy={186}
        rx={60}
        ry={7}
        fill={palette.outline}
        fillOpacity={0.16}
        style={{ ...pivot(100, 186), scaleX: shadowScale }}
      />
      <motion.g style={pivot(100, 182)} initial={false} animate={pose} transition={softSpring}>
        <motion.g
          style={{
            ...pivot(100, 182),
            x: loopX,
            y: loopY,
            rotate: loopRotate,
            scaleX: loopScaleX,
            scaleY: loopScaleY,
          }}
        >
          <AnimatePresence>{showSmoke && <SmokePuffs key="smoke" reduced={reduced} />}</AnimatePresence>

          <rect x={126} y={34} width={28} height={10} rx={4} fill={palette.chimney} stroke={palette.outline} strokeWidth={4} />
          <rect x={130} y={42} width={20} height={34} fill={palette.chimney} stroke={palette.outline} strokeWidth={4} />

          <AnimatePresence>
            {mood === "pointing" && <PointingArm key="arm" direction={pointDirection} />}
          </AnimatePresence>

          <rect x={42} y={82} width={116} height={98} rx={20} fill={palette.wall} stroke={palette.outline} strokeWidth={5} />
          <path
            d="M 24 96 Q 16 90 24 83 L 90 33 Q 100 25 110 33 L 176 83 Q 184 90 176 96 Z"
            fill={palette.roof}
            stroke={palette.outline}
            strokeWidth={5}
            strokeLinejoin="round"
          />
          <path d="M 40 84 L 94 42" stroke="#ffffff" strokeOpacity={0.35} strokeWidth={4} strokeLinecap="round" />

          <motion.g
            initial={false}
            animate={{ opacity: mood === "worried" ? 0.35 : 0.85 }}
            transition={softSpring}
          >
            <ellipse cx={55} cy={154} rx={7.5} ry={4.5} fill={palette.cheek} />
            <ellipse cx={145} cy={154} rx={7.5} ry={4.5} fill={palette.cheek} />
          </motion.g>

          <Eye
            center={leftEye}
            clipId={`${idBase}-left-eye`}
            eyeScale={look.eyeScale}
            pupilTarget={pupilTarget}
            dartX={dartX}
            blinking={blinking}
            happy={look.happyEyes}
            browRotate={look.brows.left}
            browLift={look.brows.lift}
          />
          <Eye
            center={rightEye}
            clipId={`${idBase}-right-eye`}
            eyeScale={look.eyeScale}
            pupilTarget={pupilTarget}
            dartX={dartX}
            blinking={blinking}
            happy={look.happyEyes}
            browRotate={look.brows.right}
            browLift={look.brows.lift}
          />

          <path
            d="M 85 180 L 85 158 Q 85 145 100 145 Q 115 145 115 158 L 115 180 Z"
            fill={palette.doorInside}
            stroke={palette.outline}
            strokeWidth={4}
            strokeLinejoin="round"
          />
          <motion.g style={pivot(85, 162)} initial={false} animate={doorPanel} transition={doorTransition}>
            <path
              d="M 85 180 L 85 158 Q 85 145 100 145 Q 115 145 115 158 L 115 180 Z"
              fill={palette.door}
              stroke={palette.outline}
              strokeWidth={4}
              strokeLinejoin="round"
            />
            <circle cx={109} cy={172} r={2.2} fill={palette.outline} />
            <Mouth shape={look.mouth} hidden={speaking} />
          </motion.g>

          <rect x={80} y={177} width={40} height={7} rx={3.5} fill={palette.doormat} stroke={palette.outline} strokeWidth={3} />

          <AnimatePresence>
            {mood === "searching" && <MagnifyingGlass key="glass" reduced={reduced} />}
          </AnimatePresence>
        </motion.g>
      </motion.g>

      <AnimatePresence>{mood === "found" && <Sparkles key="sparkles" reduced={reduced} />}</AnimatePresence>
      <AnimatePresence>{mood === "celebrate" && <Celebration key="celebration" reduced={reduced} />}</AnimatePresence>
    </svg>
  );
}
