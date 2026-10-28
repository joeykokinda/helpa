"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { checkStep, locatePart, type Plan } from "../lib/api";
import { ArLayer, type GhostDraw, type ScreenRect } from "../lib/arLayer";
import { drawLockOn, drawPress, drawTrail, drawTurn, Particles } from "../lib/arHud";
import { useCameraControls } from "../lib/camera";
import {
  actionWords,
  beatMotion,
  pickMask,
  canvasBlob,
  cutOut,
  displayRect,
  easeBox,
  frameCanvas,
  frameShift,
  grayChange,
  grayFrame,
  jointPose,
  pitchFromBeta,
  type Box,
  type Cutout,
  type Gray,
} from "../lib/live";
import { parseMasks } from "../lib/masks";
import { applyBeats, restState, type Beat, type Joint, type RigCatalog, type RigPartDef, type RigState } from "../lib/rig/types";
import Helpa, { type HelpaMood } from "./Helpa";
import Icon from "./Icons";
import { rigCatalogs } from "./rig/registry";
import { effectFor } from "./rig/style/Effects";
import type { PlayHead } from "./rig/style/MotionGuide";
import { timing } from "./rig/style/motion";
import { timelineAt } from "./rig/RigScene";

const RigStep = dynamic(() => import("./rig/RigStep"), { ssr: false });

export type LiveRig = { id: string; stepBeats: Beat[][]; recipe?: unknown; catalog?: unknown };

type LiveGuideProps = {
  plan: Plan;
  stepIndex: number;
  rig: LiveRig | null;
  mood: HelpaMood;
  speaking: boolean;
  say: (text: string, mood?: HelpaMood, aloud?: boolean) => void;
  /** Helpa saw the step done; the page moves on. */
  onDone: () => void;
  onNext: () => void;
  onClose: () => void;
};

/** Demo: the hologram acts out the step. Turn: the person does it while Helpa watches the real part. */
type Phase = "demo" | "turn" | "checking";
type Callout = { tone: "good" | "fix" | "unsure"; text: string } | null;

type Track = { cutout: Cutout; box: Box; target: Box; seenAt: number; lockedAt: number; misses: number; lookedAt: number };

const targetPart = "__target";
const demoLoops = 2;
const locateEveryMs = 900;
const checkCooldownMs = 4000;

const fluidParts = /drain_plug|drain plug|drain_hose_cap|drain cap/i;
const pourParts = /new_oil|jug|bottle|pitcher/i;

/** The live camera with Helpa's holograms on it: the step played on the real machine, then checked as you do it. */
export default function LiveGuide({ plan, stepIndex, rig, mood, speaking, say, onDone, onNext, onClose }: LiveGuideProps) {
  const step = plan.steps[stepIndex];
  const reducedMotion = useReducedMotion() ?? false;
  const videoRef = useRef<HTMLVideoElement>(null);
  const backdropRef = useRef<HTMLVideoElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const hudCanvasRef = useRef<HTMLCanvasElement>(null);
  const helpaRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const playHeadRef = useRef<PlayHead>({ index: 0, within: 0, progress: 0 });
  const tracksRef = useRef<Record<string, Track>>({});
  const phraseRef = useRef<Record<string, string>>({});
  const phaseRef = useRef<Phase>("demo");
  const confidenceRef = useRef(0);
  const offsetRef = useRef({ x: 0, y: 0 });
  const gyroRef = useRef({ x: 0, y: 0, speed: 0, pitch: 0.4 });
  const watchRef = useRef<{ slot: Box | null; changed: boolean; startedAt: number; lastCheck: number; stillSince: number }>({ slot: null, changed: false, startedAt: 0, lastCheck: 0, stillSince: 0 });
  const spokenRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const onDoneRef = useRef(onDone);
  const sayRef = useRef(say);
  const { adopt, torch, setTorchOn, pinchHandlers } = useCameraControls(trackRef);
  const [camera, setCamera] = useState<"starting" | "ready" | "failed">("starting");
  const [phase, setPhase] = useState<Phase>("demo");
  const [callout, setCallout] = useState<Callout>(null);
  const [steady, setSteady] = useState(true);
  const [locked, setLocked] = useState(false);
  const [helpaSide, setHelpaSide] = useState<"left" | "right">("right");

  useEffect(() => {
    onDoneRef.current = onDone;
    sayRef.current = say;
  });

  const catalog = useMemo<RigCatalog | null>(() => (rig ? ((rig.catalog as RigCatalog | undefined) ?? rigCatalogs.find((candidate) => candidate.id === rig.id) ?? null) : null), [rig]);
  const rigBeats = useMemo(() => rig?.stepBeats[stepIndex] ?? [], [rig, stepIndex]);
  const hasRig = Boolean(catalog && rigBeats.length);
  // Without a model for this step, the step's target part still gets locked on and outlined.
  const beats = useMemo<Beat[]>(() => (hasRig ? rigBeats : [{ part: targetPart, action: "look", caption: step.target_part }]), [hasRig, rigBeats, step.target_part]);
  const defs = useMemo<Record<string, RigPartDef>>(() => {
    const byId: Record<string, RigPartDef> = Object.fromEntries((catalog?.parts ?? []).map((part) => [part.id, part]));
    byId[targetPart] = { id: targetPart, label: step.target_part || "part", joint: { kind: "none" }, actions: ["look"] };
    return byId;
  }, [catalog, step.target_part]);
  const stepStart = useMemo<RigState>(() => (catalog && rig ? applyBeats(restState(catalog), rig.stepBeats.slice(0, stepIndex).flat()) : {}), [catalog, rig, stepIndex]);
  // The part Helpa watches while you work: the first one the step really moves.
  const watched = useMemo(() => beats.find((beat) => beat.action !== "look")?.part ?? beats[0].part, [beats]);

  const speakOnce = (text: string, nextMood: HelpaMood) => {
    const now = performance.now();
    if (spokenRef.current.text === text && now - spokenRef.current.at < 12000) return;
    spokenRef.current = { text, at: now };
    sayRef.current(text, nextMood);
  };

  const enterPhase = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  // The camera: widest zoom, the person's own pinch, never an automatic flashlight.
  useEffect(() => {
    let stream: MediaStream | undefined;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 } }, audio: false })
      .then((granted) => {
        stream = granted;
        adopt(granted.getVideoTracks()[0]);
        if (backdropRef.current) backdropRef.current.srcObject = granted;
        if (videoRef.current) videoRef.current.srcObject = granted;
        setCamera("ready");
      })
      .catch(() => setCamera("failed"));
    return () => stream?.getTracks().forEach((track) => track.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gyro: how fast the phone turns (a guess for the picture tracker) and how far it looks down (for the 3D poses).
  useEffect(() => {
    const onMotion = (motionEvent: DeviceMotionEvent) => {
      const rate = motionEvent.rotationRate;
      if (!rate) return;
      const seconds = (motionEvent.interval || 16) / (motionEvent.interval > 1 ? 1000 : 1);
      // Degrees per second to grey-frame pixels: about 2.9 px per degree for a 160 px wide picture.
      // Turning about the phone's long side pans the picture sideways; tilting about its short side pans it up and down.
      gyroRef.current.x += (rate.gamma ?? 0) * seconds * 2.9;
      gyroRef.current.y += (rate.beta ?? 0) * seconds * 2.9;
      gyroRef.current.speed = Math.hypot(rate.alpha ?? 0, rate.beta ?? 0, rate.gamma ?? 0);
    };
    const onOrientation = (orientationEvent: DeviceOrientationEvent) => {
      gyroRef.current.pitch = pitchFromBeta(orientationEvent.beta);
    };
    window.addEventListener("devicemotion", onMotion);
    window.addEventListener("deviceorientation", onOrientation);
    return () => {
      window.removeEventListener("devicemotion", onMotion);
      window.removeEventListener("deviceorientation", onOrientation);
    };
  }, []);

  // A new step starts with the demo again.
  useEffect(() => {
    tracksRef.current = {};
    phaseRef.current = "demo";
    watchRef.current = { slot: null, changed: false, startedAt: 0, lastCheck: 0, stillSince: 0 };
    const reset = setTimeout(() => {
      setPhase("demo");
      setCallout(null);
      setLocked(false);
    });
    return () => clearTimeout(reset);
  }, [stepIndex]);

  // The render loop: tracking, the holograms, and the HUD, every frame.
  useEffect(() => {
    const video = videoRef.current;
    const glCanvas = glCanvasRef.current;
    const hudCanvas = hudCanvasRef.current;
    if (camera !== "ready" || !video || !glCanvas || !hudCanvas) return;
    const layer = new ArLayer(glCanvas);
    const hud = hudCanvas.getContext("2d")!;
    const scratch = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const particles = new Particles();
    const appearRef: Record<string, { value: number; leaving: boolean }> = {};
    let previousGray: Gray | null = null;
    let lastTime = performance.now();
    let lastWithin = 0;
    let lastIndex = 0;
    let loops = 0;
    let lastPhase: Phase = "demo";
    let frame = 0;
    let lastFired = "";
    let ownClockStart = performance.now();
    let side: "left" | "right" = "right";
    let wasLocked = false;
    let wasSteady = true;
    let raf = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const seconds = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      frame++;
      if (!video.videoWidth) return;
      const width = video.clientWidth;
      const height = video.clientHeight;
      layer.resize(width, height);
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      if (hudCanvas.width !== Math.round(width * ratio)) {
        hudCanvas.width = Math.round(width * ratio);
        hudCanvas.height = Math.round(height * ratio);
      }
      hud.setTransform(ratio, 0, 0, ratio, 0, 0);
      hud.clearRect(0, 0, width, height);

      // Track the picture between SAM updates: patches on a small grey frame, seeded by the gyro.
      if (frame % 2 === 0) {
        const gray = grayFrame(video, scratch);
        const current = tracksRef.current[phaseRef.current === "demo" ? beats[playHeadRef.current.index]?.part : watched];
        const gyro = gyroRef.current;
        const guess = { x: gyro.x, y: gyro.y };
        gyro.x = gyro.y = 0;
        const change = grayChange(previousGray, gray);
        if (previousGray) {
          const shift = frameShift(previousGray, gray, current?.box ?? null, [guess, { x: -guess.x, y: -guess.y }]);
          const dx = shift.x / gray.width;
          const dy = shift.y / gray.height;
          offsetRef.current.x += dx;
          offsetRef.current.y += dy;
          for (const track of Object.values(tracksRef.current)) {
            track.box = { ...track.box, x: track.box.x + dx, y: track.box.y + dy };
            track.target = { ...track.target, x: track.target.x + dx, y: track.target.y + dy };
          }
          const fast = gyro.speed > 110 || Math.hypot(shift.x, shift.y) > 9;
          const trusted = shift.score > 0.6 || change < 3;
          const goal = fast || !trusted ? 0.15 : 1;
          confidenceRef.current += (goal - confidenceRef.current) * Math.min(1, seconds * 2 * (goal < confidenceRef.current ? 3 : 2));
        }
        const watch = watchRef.current;
        if (change > 4) watch.stillSince = now;
        previousGray = gray;
      }

      // One clock: the corner model's play head, or our own when there is no model for this step.
      let play = playHeadRef.current;
      if (!hasRig) play = timelineAt((now - ownClockStart) / 1000, beats.length, false);
      // "Show me again" restarts the count; a loop only counts if the person could see it on their machine.
      if (phaseRef.current === "demo" && lastPhase !== "demo") loops = 0;
      lastPhase = phaseRef.current;
      if (play.index < lastIndex || (play.index === lastIndex && play.within + 0.5 < lastWithin)) {
        if (wasLocked) loops++;
        particles.clear();
        if (loops >= demoLoops && phaseRef.current === "demo") {
          enterPhase("turn");
          watchRef.current = { slot: tracksRef.current[watched]?.box ?? null, changed: false, startedAt: now, lastCheck: now, stillSince: now };
          speakOnce("Your turn! I'm watching.", "listening");
        }
      }
      lastIndex = play.index;
      lastWithin = play.within;

      const rectOf = (box: Box): ScreenRect => {
        const shown = displayRect(video);
        return { left: shown.left + box.x * shown.width, top: shown.top + box.y * shown.height, width: box.width * shown.width, height: box.height * shown.height };
      };
      for (const track of Object.values(tracksRef.current)) track.box = easeBox(track.box, track.target, seconds);
      const fresh = (track: Track | undefined) => track && now - track.seenAt < 8000 && track.misses < 4;
      const confidence = confidenceRef.current;
      const draws: GhostDraw[] = [];
      const pitch = gyroRef.current.pitch;
      const poseFor = (joint: Joint, from: number, amount: number, rect: ScreenRect, centroid: [number, number]) => jointPose(joint, from, amount, rect, centroid, pitch, height * 0.28);
      const time = now / 1000;
      const demo = phaseRef.current === "demo";
      const motionNow = beatMotion(beats, stepStart, defs, play.index, play.progress);
      const beat = motionNow?.beat;
      const focusPart = demo ? beat?.part : watched;
      const focusTrack = focusPart ? tracksRef.current[focusPart] : undefined;

      // Every part's state right now, so a lint screen pulled out in beat one stays out while the lint comes off.
      const amounts = applyBeats(stepStart, beats.slice(0, play.index));
      if (motionNow) amounts[motionNow.beat.part] = motionNow.amount;

      const appearIn = Math.min(1, play.within / (timing.lead * 0.9));
      for (const [part, track] of Object.entries(tracksRef.current)) {
        const def = defs[part];
        if (!def || !fresh(track)) continue;
        const rect = rectOf(track.box);
        const startAmount = stepStart[part] ?? 0;
        const displaced = Math.abs((amounts[part] ?? startAmount) - startAmount) > 0.01;
        const isBeat = part === beat?.part && beat.action !== "look";
        const wanted = demo && (isBeat || displaced) && def.joint.kind !== "none";
        const state = (appearRef[part] ??= { value: 0, leaving: false });
        if (wanted) {
          state.leaving = false;
          state.value = isBeat && !displaced ? Math.max(state.value, appearIn) : Math.min(1, state.value + seconds * 1.8);
        } else if (state.value > 0) {
          state.leaving = true;
          state.value = Math.max(0, state.value - seconds * 1.6);
        }
        const pose = poseFor(def.joint, startAmount, amounts[part] ?? startAmount, rect, track.cutout.centroid);
        if (state.value > 0) draws.push({ id: part, cutout: track.cutout, rect, pose, appear: state.value, leaving: state.leaving, hole: state.leaving ? 0 : Math.min(1, pose.depth * 2.5) * state.value, mode: "ghost", opacity: confidence });
        else if (!demo && part === watched) draws.push({ id: part, cutout: track.cutout, rect, pose: { ...pose, angle: 0, move: [0, 0, 0], depth: 0 }, appear: 1, leaving: false, hole: 0, mode: "slot", opacity: confidence });
      }
      layer.render(draws, time, reducedMotion);

      // Lock-on brackets and the label on the part this beat is about.
      const showLock = Boolean(focusTrack && fresh(focusTrack) && confidence > 0.3);
      if (focusTrack && showLock && focusPart) {
        const def = defs[focusPart];
        const rect = rectOf(focusTrack.box);
        const words = demo && beat ? actionWords(beat.action, def.joint) : "YOUR TURN";
        drawLockOn(hud, rect, (now - focusTrack.lockedAt) / 420, confidence, def.label, words);

        if (demo && motionNow && beat) {
          const { joint, from, end } = motionNow;
          const startAmount = stepStart[beat.part] ?? 0;
          const fadeOut = 1 - Math.max(0, (play.within - timing.lead - timing.move) / timing.hold);
          const guideOpacity = appearIn * fadeOut * confidence;
          if (joint.kind === "turn" || (joint.kind === "twist" && (beat.action === "unlock" || beat.action === "lock"))) {
            const center = layer.project(rect, poseFor(joint, startAmount, from, rect, focusTrack.cutout.centroid), focusTrack.cutout.centroid);
            drawTurn(hud, center.x, center.y, Math.max(rect.width, rect.height) * 0.62, (joint.kind === "turn" ? joint.angle : -joint.angle) * (end - from || 1) < 0, guideOpacity, time);
          } else if (joint.kind === "press" || beat.action === "press") {
            drawPress(hud, rect.left + rect.width / 2, rect.top + rect.height / 2, Math.max(rect.width, rect.height) * 0.55, play.progress, guideOpacity);
          } else if (beat.action !== "look" && Math.abs(end - from) > 0.01) {
            // The trail follows the ghost: the free edge of a door, the middle of anything that slides or lifts.
            const pivot = poseFor(joint, startAmount, from, rect, focusTrack.cutout.centroid).pivot;
            const point: [number, number] = joint.kind === "hinge" ? [1 - pivot[0] * 0.8 - 0.1, 1 - pivot[1] * 0.8 - 0.1] : focusTrack.cutout.centroid;
            const points = Array.from({ length: 14 }, (_, index) => layer.project(rect, poseFor(joint, startAmount, from + ((end - from) * index) / 13, rect, focusTrack.cutout.centroid), point));
            drawTrail(hud, points, guideOpacity, time);
          }
        }

        // Helpa stands beside the part, on the roomier side, pointing at it.
        const nextSide = rect.left + rect.width / 2 < width / 2 ? "right" : "left";
        if (nextSide !== side) {
          side = nextSide;
          setHelpaSide(side);
        }
        if (helpaRef.current) {
          const helpaSize = 64;
          const x = side === "right" ? Math.min(width - helpaSize - 8, rect.left + rect.width + 14) : Math.max(8, rect.left - helpaSize - 14);
          const y = Math.min(height - helpaSize - 140, Math.max(70, rect.top + rect.height / 2 - helpaSize / 2));
          helpaRef.current.style.transform = `translate(${x}px, ${y}px)`;
        }
      }
      if (showLock !== wasLocked) {
        wasLocked = showLock;
        setLocked(showLock);
      }
      const isSteady = confidence > 0.35;
      if (isSteady !== wasSteady) {
        wasSteady = isSteady;
        setSteady(isSteady);
      }

      // Effects where they really happen, using the same rules as the 3D model's effects.
      if (demo && beat && motionNow) {
        const def = defs[beat.part];
        const effect = def ? effectFor(beat, def) : null;
        const key = `${loops}-${play.index}`;
        const host = tracksRef.current[beat.part] && fresh(tracksRef.current[beat.part]) ? beat.part : beats.slice(0, play.index).reverse().find((earlier) => fresh(tracksRef.current[earlier.part]))?.part;
        if (effect && host && play.within >= effect.at && lastFired !== key) {
          lastFired = key;
          const track = tracksRef.current[host];
          const hostDef = defs[host];
          const rect = rectOf(track.box);
          const pose = poseFor(hostDef.joint, stepStart[host] ?? 0, amounts[host] ?? 0, rect, track.cutout.centroid);
          const center = layer.project(rect, pose, track.cutout.centroid);
          const away = def.joint.kind === "debris" ? def.joint.away : [0, 1, 0.3];
          const length = Math.hypot(away[0], away[1]) || 1;
          if (effect.puff) particles.burst(center.x, center.y, rect.width * 0.7, rect.height * 0.5, away[0] / length + 0.2, -away[1] / length - 0.4, 34);
          if (effect.sparkle) particles.burst(center.x, center.y, rect.width, rect.height, 0, -0.6, 10);
        }
        // Fluids: a stream from where a drain plug really is while it's out, and a pour from a tipped jug.
        for (const [part, track] of Object.entries(tracksRef.current)) {
          if (!fresh(track)) continue;
          const name = `${part} ${defs[part]?.label ?? ""}`;
          const rect = rectOf(track.box);
          const warm = /oil|car|engine/i.test(`${catalog?.id ?? ""} ${name}`);
          if (fluidParts.test(name) && (amounts[part] ?? 0) - (stepStart[part] ?? 0) > 0.55) particles.stream(rect.left + rect.width / 2, rect.top + rect.height * 0.9, rect.width * 0.25, 70, seconds, warm);
          if (pourParts.test(name) && part === beat.part && beat.action === "turn" && play.progress > 0.25 && play.progress < 0.7) {
            particles.stream(rect.left + rect.width * 0.15, rect.top + rect.height * 0.2, 6, 90, seconds, true);
          }
        }
      }
      particles.step(seconds);
      particles.draw(hud, height);
    };
    raf = requestAnimationFrame(tick);
    ownClockStart = performance.now();
    return () => {
      cancelAnimationFrame(raf);
      layer.dispose();
    };
  }, [camera, beats, defs, stepStart, watched, hasRig, reducedMotion, catalog]);

  // SAM about once a second for the part that matters right now, plus the watching and checking while you work.
  useEffect(() => {
    const video = videoRef.current;
    if (camera !== "ready" || !video) return;
    let alive = true;
    let busy = false;
    let lastGray: Gray | null = null;
    const scratch = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const backoff: Record<string, number> = {};

    // SAM knows plain nouns better than repair words ("filter" finds a lint screen that "lint screen" misses),
    // so after the full names it tries their last words, three at a time, and keeps whichever one worked.
    const attempts: Record<string, number> = {};
    const phrasesFor = (part: string) => {
      const def = defs[part];
      const full = [def?.label, ...(def?.aliases ?? []).filter((alias) => !alias.includes("_")), part === watched ? step.target_part : ""];
      const names = [full[0], ...full.map((name) => name?.trim().split(/\s+/).pop()), ...full.slice(1)];
      const candidates = [...new Set(names.filter((name): name is string => Boolean(name && name.trim())).map((name) => name.toLowerCase()))];
      const known = phraseRef.current[part];
      if (known) return [known, ...candidates.filter((name) => name !== known)].slice(0, 2);
      const offset = ((attempts[part] = (attempts[part] ?? -1) + 1) * 4) % Math.max(1, candidates.length);
      return [...candidates, ...candidates].slice(offset, offset + 4);
    };

    const locate = async (part: string, now: number) => {
      const track = tracksRef.current[part];
      if ((backoff[part] ?? 0) > now) return;
      const gray = grayFrame(video, scratch);
      const moved = grayChange(lastGray, gray) > 5;
      // Only spend a SAM call when there's no fix yet, the picture changed, or the fix is getting old.
      if (track && !moved && now - track.lookedAt < 4000) return;
      lastGray = gray;
      // 960 px keeps small parts (a drain plug, a filter cap) big enough for SAM to see.
      const canvas = frameCanvas(video, 960);
      const offsetAtSend = { ...offsetRef.current };
      if (track) track.lookedAt = now;
      busy = true;
      try {
        const { sam, phrase } = await locatePart(await canvasBlob(canvas, 0.8), phrasesFor(part));
        if (!alive) return;
        const seen = performance.now();
        const drift = { x: offsetRef.current.x - offsetAtSend.x, y: offsetRef.current.y - offsetAtSend.y };
        const recent = track && seen - track.seenAt < 3000 ? { ...track.target, x: track.target.x - drift.x, y: track.target.y - drift.y } : null;
        let mask = pickMask(sam ? parseMasks(sam) : [], canvas, recent);
        // A fresh lock never jumps to a different thing across the picture; that's a miss, not a move.
        if (mask && recent && Math.hypot((mask.left + mask.width / 2) / canvas.width - (recent.x + recent.width / 2), (mask.top + mask.height / 2) / canvas.height - (recent.y + recent.height / 2)) > 0.28) mask = null;
        if (!mask) {
          if (track) track.misses++;
          else backoff[part] = seen + 1200;
          if (track && track.misses >= 2) backoff[part] = seen + 2500;
          if (phaseRef.current !== "demo" && part === watched && track) watchRef.current.changed = true;
          return;
        }
        phraseRef.current[part] = phrase;
        const cutout = cutOut(canvas, mask);
        // The phone kept moving while SAM looked; carry the box along by what the tracker saw since.
        const target = { ...cutout.box, x: cutout.box.x + drift.x, y: cutout.box.y + drift.y };
        const previous = tracksRef.current[part];
        const slot = watchRef.current.slot;
        if (phaseRef.current !== "demo" && part === watched && slot) {
          const shift = Math.hypot(target.x - slot.x, target.y - slot.y) / Math.max(slot.width, slot.height);
          if (shift > 0.35 || Math.abs(target.width * target.height - slot.width * slot.height) / (slot.width * slot.height) > 0.5) watchRef.current.changed = true;
        }
        tracksRef.current[part] = {
          cutout,
          target,
          box: previous && seen - previous.seenAt < 6000 ? previous.box : target,
          seenAt: seen,
          lockedAt: previous && seen - previous.seenAt < 6000 ? previous.lockedAt : seen,
          misses: 0,
          lookedAt: seen,
        };
      } catch {
        // a dropped request just means no update this second
      } finally {
        busy = false;
      }
    };

    const runCheck = async (now: number) => {
      const watch = watchRef.current;
      watch.lastCheck = now;
      watch.changed = false;
      enterPhase("checking");
      try {
        const result = await checkStep(await canvasBlob(frameCanvas(video, 1024), 0.85), step, { part: defs[watched]?.label ?? step.target_part, live: true });
        if (!alive) return;
        const status = result.status ?? (result.done ? "COMPLETED" : "INCOMPLETE");
        if (status === "COMPLETED") {
          setCallout({ tone: "good", text: result.evidence ? `Got it! ${capitalize(result.evidence)}.` : "Got it!" });
          speakOnce(`Got it! ${result.feedback}`, "celebrate");
          setTimeout(() => alive && onDoneRef.current(), 1800);
          return;
        }
        const text = status === "UNCERTAIN" ? `I can't quite see it. ${result.feedback}` : result.mistake || result.feedback;
        setCallout({ tone: status === "UNCERTAIN" ? "unsure" : "fix", text });
        speakOnce(text, "worried");
      } catch {
        // try again on the next quiet moment
      }
      if (alive && phaseRef.current === "checking") enterPhase("turn");
      watchRef.current.lastCheck = performance.now();
    };

    const timer = window.setInterval(() => {
      if (!alive || busy || document.hidden) return;
      const now = performance.now();
      const phaseNow = phaseRef.current;
      if (phaseNow === "checking") return;
      if (phaseNow === "turn") {
        const watch = watchRef.current;
        const settled = now - watch.stillSince > 1000;
        const due = now - watch.lastCheck > checkCooldownMs && now - watch.startedAt > 2500;
        // Check when the real part moved and the picture settled, or every so often while it's quiet.
        if (due && settled && (watch.changed || now - watch.lastCheck > 8000)) {
          busy = true;
          runCheck(now).finally(() => (busy = false));
          return;
        }
        locate(watched, now);
        return;
      }
      const part = beats[playHeadRef.current.index]?.part ?? beats[0].part;
      locate(part, now);
    }, locateEveryMs / 2);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [camera, beats, defs, watched, step]);

  const checkNow = () => {
    watchRef.current.changed = true;
    watchRef.current.lastCheck = 0;
    watchRef.current.startedAt = 0;
    watchRef.current.stillSince = 0;
    if (phaseRef.current === "demo") enterPhase("turn");
  };

  const showAgain = () => {
    setCallout(null);
    enterPhase("demo");
  };

  const partName = defs[watched]?.label ?? step.target_part ?? "part";
  const lastStep = stepIndex + 1 === plan.steps.length;

  return (
    <section className="screen live" aria-label={`Step ${stepIndex + 1}, on your camera`}>
      <div className="live-view" {...pinchHandlers}>
        <video ref={backdropRef} className="camera-backdrop" autoPlay playsInline muted aria-hidden="true" />
        <video ref={videoRef} className="camera-video live-video" autoPlay playsInline muted aria-label="Camera with Helpa's guide drawn on it" />
        <canvas ref={glCanvasRef} className="live-layer" aria-hidden="true" />
        <canvas ref={hudCanvasRef} className="live-layer" aria-hidden="true" />
        {phase === "checking" && <div className="scan-sweep live-scan" aria-hidden="true" />}
        <div ref={helpaRef} className={`live-helpa ${locked ? "live-helpa-on" : ""}`} aria-hidden="true">
          <Helpa mood={phase === "demo" ? "pointing" : mood === "celebrate" ? "celebrate" : "listening"} speaking={speaking} size={64} lookAt={{ x: helpaSide === "right" ? -1 : 1, y: 0 }} />
        </div>
      </div>

      <div className="topbar live-top">
        <button className="icon-button glass press" onClick={onClose} aria-label="Back to the step">
          <Icon name="close" />
        </button>
        <div className="live-title">
          <span className="live-count">
            Step {stepIndex + 1} of {plan.steps.length}
          </span>
          <strong>{step.instruction}</strong>
        </div>
        {torch !== "unsupported" ? (
          <button className={`icon-button glass press ${torch === "on" ? "torch-on" : ""}`} onClick={() => setTorchOn(torch !== "on")} aria-label={torch === "on" ? "Turn flashlight off" : "Turn flashlight on"} aria-pressed={torch === "on"}>
            <Icon name="flashlight" />
          </button>
        ) : (
          <span className="live-top-spacer" />
        )}
      </div>

      <div className="live-status" aria-live="polite">
        {camera === "failed" ? (
          <p className="live-pill">I need the camera for this. You can go back to the 3D guide.</p>
        ) : !steady && locked ? (
          <p className="live-pill">Hold steady on the {partName.toLowerCase()}. The model in the corner shows the move.</p>
        ) : !locked ? (
          <p className="live-pill">
            <span className="spinner" aria-hidden="true" /> Point me at the {partName.toLowerCase()}
          </p>
        ) : phase === "demo" ? (
          <p className="live-pill live-pill-holo">Watch the hologram, then it&apos;s your turn</p>
        ) : phase === "checking" ? (
          <p className="live-pill live-pill-holo">Checking…</p>
        ) : (
          <p className="live-pill live-pill-holo">Your turn. I&apos;m watching</p>
        )}
      </div>

      {rig && hasRig && (
        <div className="live-corner" aria-label="3D guide">
          <RigStep rigId={rig.id} stepBeats={rig.stepBeats} stepIndex={stepIndex} recipe={rig.recipe} playHeadRef={playHeadRef} holo />
        </div>
      )}

      <AnimatePresence>
        {callout && (
          <motion.div key={callout.text} className={`live-callout live-callout-${callout.tone}`} initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} role="status">
            <Icon name={callout.tone === "good" ? "check" : callout.tone === "unsure" ? "camera" : "help"} size={18} />
            <span>{callout.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bottom-bar bottom-bar-row live-actions">
        <button className="btn-square glass press" onClick={showAgain} aria-label="Show me again" disabled={phase === "demo"}>
          <Icon name="replay" />
        </button>
        <button className="btn btn-light press" onClick={checkNow} disabled={phase === "checking"}>
          <Icon name="scan" size={20} />
          {phase === "demo" ? "My turn" : "Check now"}
        </button>
        <button className="btn btn-primary press" onClick={onNext}>
          {lastStep ? "All done" : "Next"}
        </button>
      </div>
    </section>
  );
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
