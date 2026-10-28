"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from "react";
import * as THREE from "three";
import { applyBeats, pulseActions, restState, type Beat, type RigCatalog, type RigPartDef, type RigState } from "../../lib/rig/types";
import { RigProvider } from "./RigRuntime";
import BeatArrow from "./style/BeatArrow";
import Effects from "./style/Effects";
import Ground from "./style/Ground";
import MotionGuide, { type PlayHead } from "./style/MotionGuide";
import { beatSeconds, easeInOutCubic, moveAmount, pulseAmount, timing } from "./style/motion";
import StyledRenderer from "./style/StyledRenderer";
import { palette } from "./style/toon";

type OrbitControlsImpl = ComponentRef<typeof OrbitControls>;

const endHoldSeconds = 1.4;
const slowFactor = 1.8;
const flightSeconds = 1.2;

/** Where the timeline is: which beat, how far into it, and how far through its move. */
export function timelineAt(seconds: number, beatCount: number, slow: boolean): PlayHead {
  const scaled = seconds / (slow ? slowFactor : 1);
  const total = beatCount * beatSeconds + endHoldSeconds;
  const local = scaled % total;
  const index = Math.min(beatCount - 1, Math.floor(local / beatSeconds));
  const within = local - index * beatSeconds;
  const progress = local >= beatCount * beatSeconds ? 1 : Math.min(1, Math.max(0, (within - timing.lead) / timing.move));
  return { index, within, progress };
}

/** Joint amounts at a moment: earlier beats done, the current one part way. */
function amountsAt(start: RigState, beats: Beat[], defs: Record<string, RigPartDef>, index: number, progress: number): RigState {
  const state = applyBeats(start, beats.slice(0, index));
  const beat = beats[index];
  if (!beat) return state;
  const from = state[beat.part] ?? 0;
  const joint = defs[beat.part]?.joint ?? { kind: "none" };
  if (pulseActions.includes(beat.action)) {
    state[beat.part] = beat.action === "look" ? from : pulseAmount(beat.action, progress);
  } else {
    const target = applyBeats({}, [beat])[beat.part];
    if (target !== undefined) state[beat.part] = moveAmount(joint, from, target, progress);
  }
  return state;
}

function Timeline({ beats, defs, start, slow, clockStartRef, amountsRef, focusRef, playRef, onBeat }: { beats: Beat[]; defs: Record<string, RigPartDef>; start: RigState; slow: boolean; clockStartRef: RefObject<number>; amountsRef: RefObject<RigState>; focusRef: RefObject<string | null>; playRef: RefObject<PlayHead>; onBeat: (index: number) => void }) {
  const lastIndexRef = useRef(-1);
  useFrame(({ clock }) => {
    if (!beats.length) {
      amountsRef.current = { ...start };
      focusRef.current = null;
      return;
    }
    const play = timelineAt(clock.elapsedTime - clockStartRef.current, beats.length, slow);
    playRef.current = play;
    amountsRef.current = amountsAt(start, beats, defs, play.index, play.progress);
    focusRef.current = beats[play.index].part;
    if (play.index !== lastIndexRef.current) {
      lastIndexRef.current = play.index;
      onBeat(play.index);
    }
  });
  return null;
}

function worldBox(node: THREE.Object3D | undefined) {
  const box = new THREE.Box3();
  if (node) box.setFromObject(node);
  return box;
}

type Pose = { target: THREE.Vector3; direction: THREE.Vector3; distance: number; halfHeight: number };

/** Half the view height that frames a part of this size: buttons get close-ups, doors get the whole appliance. */
const frameFor = (size: number) => Math.max(0.12, Math.min(0.9, size * 1.25 + 0.11));
/** How far back the camera stands. Orthographic, so this only decides what sits in front of the part. */
const standoffFor = (size: number) => Math.max(0.42, Math.min(2.6, (size * 1.5 + 0.16) / Math.tan(THREE.MathUtils.degToRad(17.5))));

/** Orthographic, isometric-style framing of the current beat's part, from the side its catalog says shows it best, with an eased dolly between beats. */
function CameraDirector({ beat, def, nodes, controlsRef, userMovedRef }: { beat?: Beat; def?: RigPartDef; nodes: RefObject<Record<string, THREE.Group>>; controlsRef: RefObject<OrbitControlsImpl | null>; userMovedRef: RefObject<boolean> }) {
  const flight = useRef<{ from: Pose; to: Pose; elapsed: number } | null>(null);
  const framedBeatRef = useRef<Beat | undefined>(undefined);
  const placedRef = useRef(false);
  const goal = useRef<Pose>({ target: new THREE.Vector3(0, 0.5, 0), direction: new THREE.Vector3(0.6, 0.5, 1).normalize(), distance: 2.6, halfHeight: 0.8 });

  useFrame(({ camera, size }, delta) => {
    const ortho = camera as THREE.OrthographicCamera;
    const controls = controlsRef.current;
    const fit = Math.min(size.width, size.height);
    const node = beat ? nodes.current[beat.part] : undefined;
    // Frame each beat once, where the part is when the beat starts, so the camera doesn't chase debris away.
    if ((node && framedBeatRef.current !== beat) || !placedRef.current) {
      framedBeatRef.current = beat;
      if (node) {
        const box = worldBox(node);
        const partSize = box.getSize(new THREE.Vector3()).length();
        goal.current = { target: box.getCenter(new THREE.Vector3()), direction: new THREE.Vector3(...(def?.view ?? [0.6, 0.5, 1])).normalize(), distance: standoffFor(partSize), halfHeight: frameFor(partSize) };
      }
      const target = controls?.target ?? goal.current.target;
      const offset = camera.position.clone().sub(target);
      const current: Pose = { target: target.clone(), direction: offset.clone().normalize(), distance: offset.length(), halfHeight: fit / (2 * ortho.zoom) };
      // The first shot cuts straight in; later ones dolly from wherever the camera is, including after the user orbits.
      flight.current = placedRef.current ? { from: current, to: goal.current, elapsed: 0 } : { from: goal.current, to: goal.current, elapsed: flightSeconds };
      placedRef.current = true;
      userMovedRef.current = false;
    }
    if (userMovedRef.current || !flight.current) return;
    const active = flight.current;
    active.elapsed = Math.min(flightSeconds, active.elapsed + delta);
    const blend = easeInOutCubic(active.elapsed / flightSeconds);
    const target = active.from.target.clone().lerp(active.to.target, blend);
    const turn = new THREE.Quaternion().setFromUnitVectors(active.from.direction, active.to.direction);
    const direction = active.from.direction.clone().applyQuaternion(new THREE.Quaternion().slerp(turn, blend));
    const distance = THREE.MathUtils.lerp(active.from.distance, active.to.distance, blend);
    // Zoom in log space so close-ups ease in as smoothly as wide shots.
    const halfHeight = Math.exp(THREE.MathUtils.lerp(Math.log(active.from.halfHeight), Math.log(active.to.halfHeight), blend));
    camera.position.copy(target).addScaledVector(direction, distance);
    ortho.zoom = fit / (2 * halfHeight);
    ortho.updateProjectionMatrix();
    if (controls) {
      controls.target.copy(target);
      controls.minZoom = fit / (2 * 1.6);
      controls.maxZoom = fit / (2 * 0.05);
      controls.update();
    } else camera.lookAt(target);
  });
  return null;
}

/** Keeps the annotation pill near its part, with a dashed leader line to a dot on the part. */
function PinTracker({ beat, nodes, pinRef, leaderRef, dotRef }: { beat?: Beat; nodes: RefObject<Record<string, THREE.Group>>; pinRef: RefObject<HTMLDivElement | null>; leaderRef: RefObject<SVGLineElement | null>; dotRef: RefObject<SVGCircleElement | null> }) {
  const sideRef = useRef(1);
  useFrame(({ camera, size }) => {
    const pin = pinRef.current;
    const leader = leaderRef.current;
    const dot = dotRef.current;
    const node = beat ? nodes.current[beat.part] : undefined;
    if (!pin || !leader || !dot) return;
    if (!node) {
      pin.style.opacity = "0";
      leader.style.opacity = dot.style.opacity = "0";
      return;
    }
    const box = worldBox(node);
    const projected = box.getCenter(new THREE.Vector3()).project(camera);
    const anchorX = ((projected.x + 1) / 2) * size.width;
    const anchorY = ((1 - projected.y) / 2) * size.height;
    // Put the pill on the roomier side, and keep it there for the beat so it doesn't flip mid-move.
    const side = anchorX > size.width * 0.62 ? -1 : anchorX < size.width * 0.38 ? 1 : sideRef.current;
    sideRef.current = side;
    const width = pin.offsetWidth;
    const height = pin.offsetHeight;
    const left = Math.min(size.width - width - 10, Math.max(10, anchorX + side * 34 - (side < 0 ? width : 0)));
    const top = Math.min(size.height - height - 96, Math.max(56, anchorY - 74));
    pin.style.transform = `translate(${left}px, ${top}px)`;
    const endX = Math.min(left + width - 14, Math.max(left + 14, anchorX));
    leader.setAttribute("x1", `${anchorX}`);
    leader.setAttribute("y1", `${anchorY}`);
    leader.setAttribute("x2", `${endX}`);
    leader.setAttribute("y2", `${top + (anchorY > top ? height : 0)}`);
    dot.setAttribute("cx", `${anchorX}`);
    dot.setAttribute("cy", `${anchorY}`);
    const visible = projected.z < 1 ? "1" : "0";
    pin.style.opacity = leader.style.opacity = dot.style.opacity = visible;
  });
  return null;
}

function StartClock({ clockStartRef, restartKey }: { clockStartRef: RefObject<number>; restartKey: string }) {
  const { clock } = useThree();
  useEffect(() => {
    clockStartRef.current = clock.elapsedTime;
  }, [clock, clockStartRef, restartKey]);
  return null;
}

type RigSceneProps = {
  catalog: RigCatalog;
  Model: () => React.JSX.Element;
  /** Beats for every step of the plan, so later steps start where earlier ones left off. */
  stepBeats: Beat[][];
  stepIndex: number;
  /** Shares the play head with the live camera, so its ghost motion moves in step with this model. */
  playHeadRef?: RefObject<PlayHead>;
  /** The camera-mode look: no paper or floor, so the model floats as a hologram over the live picture. */
  holo?: boolean;
};

/** The appliance model playing one step: each beat moves a real part, with a guide, an arrow, a caption and a following camera. */
export default function RigScene({ catalog, Model, stepBeats, stepIndex, playHeadRef, holo }: RigSceneProps) {
  const defs = useMemo(() => Object.fromEntries(catalog.parts.map((part) => [part.id, part])), [catalog]);
  const beats = useMemo(() => stepBeats[stepIndex] ?? [], [stepBeats, stepIndex]);
  const start = useMemo(() => applyBeats(restState(catalog), stepBeats.slice(0, stepIndex).flat()), [catalog, stepBeats, stepIndex]);
  const amountsRef = useRef<RigState>({ ...start });
  const focusRef = useRef<string | null>(null);
  const ownPlayRef = useRef<PlayHead>({ index: 0, within: 0, progress: 0 });
  const playRef = playHeadRef ?? ownPlayRef;
  const nodesRef = useRef<Record<string, THREE.Group>>({});
  const clockStartRef = useRef(0);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const userMovedRef = useRef(false);
  const pinRef = useRef<HTMLDivElement | null>(null);
  const leaderRef = useRef<SVGLineElement | null>(null);
  const dotRef = useRef<SVGCircleElement | null>(null);
  const [beatIndex, setBeatIndex] = useState(0);
  const [slow, setSlow] = useState(false);
  const [replays, setReplays] = useState(0);
  const beat = beats[beatIndex];
  const def = beat ? defs[beat.part] : undefined;
  const beatFrom = beat ? (applyBeats(start, beats.slice(0, beatIndex))[beat.part] ?? 0) : 0;
  const beatTo = beat ? (applyBeats({}, [beat])[beat.part] ?? beatFrom) : 0;
  const runtime = useMemo(() => ({ defs, amounts: amountsRef, focus: focusRef, nodes: nodesRef }), [defs]);

  return (
    <div className={holo ? "scene-3d rig-scene rig-scene-holo" : "scene-3d rig-scene"} data-beat-seconds={beatSeconds * (slow ? slowFactor : 1)}>
      <Canvas orthographic camera={{ position: [1.6, 1.4, 2.2], zoom: 220, near: 0.01, far: 12 }} dpr={[1, 2]} shadows="variance" flat>
        <RigProvider value={runtime}>
          <StartClock clockStartRef={clockStartRef} restartKey={`${stepIndex}-${replays}-${slow}`} />
          <Timeline beats={beats} defs={defs} start={start} slow={slow} clockStartRef={clockStartRef} amountsRef={amountsRef} focusRef={focusRef} playRef={playRef} onBeat={setBeatIndex} />
          <hemisphereLight args={["#fffdf8", "#b9a990", 2.2]} />
          <directionalLight
            position={[-1.3, 3.0, 1.65]}
            intensity={1.05}
            color="#fff6ea"
            castShadow
            shadow-mapSize={[1024, 1024]}
            shadow-radius={9}
            shadow-blurSamples={10}
            shadow-bias={-0.0004}
            shadow-camera-left={-1.6}
            shadow-camera-right={1.6}
            shadow-camera-top={1.6}
            shadow-camera-bottom={-1.6}
            shadow-camera-near={0.5}
            shadow-camera-far={8}
          />
          {!holo && <color attach="background" args={[palette.paper]} />}
          <Model />
          {!holo && <Ground />}
          <BeatArrow beat={beat} def={def} nodes={nodesRef} />
          <MotionGuide beat={beat} def={def} from={beatFrom} to={beatTo} nodes={nodesRef} playRef={playRef} />
          <Effects beat={beat} def={def} nodes={nodesRef} playRef={playRef} />
          <CameraDirector beat={beat} def={def} nodes={nodesRef} controlsRef={controlsRef} userMovedRef={userMovedRef} />
          <PinTracker beat={beat} nodes={nodesRef} pinRef={pinRef} leaderRef={leaderRef} dotRef={dotRef} />
          <StyledRenderer focusRef={focusRef} nodesRef={nodesRef} />
          <OrbitControls
            ref={controlsRef}
            makeDefault
            enablePan={false}
            enableDamping
            onStart={() => {
              userMovedRef.current = true;
            }}
          />
        </RigProvider>
      </Canvas>
      {beat && (
        <>
          <svg className="scene-pin-leader" aria-hidden="true">
            <line ref={leaderRef} />
            <circle ref={dotRef} r={5} />
          </svg>
          <div ref={pinRef} className="scene-pin" aria-hidden="true">
            <span className="scene-pin-label">{def?.label ?? beat.part}</span>
          </div>
        </>
      )}
      <div className="scene-controls">
        <button type="button" className="scene-control" onClick={() => setReplays((count) => count + 1)} aria-label="Replay">
          ↺
        </button>
        <button type="button" className="scene-control" aria-pressed={slow} onClick={() => setSlow((current) => !current)}>
          {slow ? "1x" : "Slow"}
        </button>
      </div>
      {beats.length > 0 && (
        <div className="rig-beats">
          {beats.length > 1 && (
            <div className="rig-beat-dots" aria-hidden="true">
              {beats.map((_, index) => (
                <span key={index} className={index === beatIndex ? "rig-beat-dot rig-beat-dot-on" : "rig-beat-dot"} />
              ))}
            </div>
          )}
          <p className="scene-caption rig-caption" aria-live="polite">
            {beats.length > 1 && <span className="rig-caption-count">{beatIndex + 1}</span>}
            {beat?.caption}
          </p>
        </div>
      )}
    </div>
  );
}
