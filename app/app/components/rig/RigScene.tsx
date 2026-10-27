"use client";

import { ContactShadows, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from "react";
import * as THREE from "three";
import { applyBeats, pulseActions, type Beat, type RigCatalog, type RigPartDef, type RigState } from "../../lib/rig/types";
import { RigProvider } from "./RigRuntime";

type OrbitControlsImpl = ComponentRef<typeof OrbitControls>;

const accent = "#ff8a2a";
const leadSeconds = 0.45;
const moveSeconds = 1.5;
const holdSeconds = 0.55;
const beatSeconds = leadSeconds + moveSeconds + holdSeconds;
const endHoldSeconds = 1.4;

const ease = (progress: number) => (progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2);

/** Where the timeline is: which beat, and how far through its move. */
function timelineAt(seconds: number, beatCount: number, slow: boolean) {
  const scaled = seconds / (slow ? 1.8 : 1);
  const total = beatCount * beatSeconds + endHoldSeconds;
  const local = scaled % total;
  const index = Math.min(beatCount - 1, Math.floor(local / beatSeconds));
  const within = local - index * beatSeconds;
  const progress = local >= beatCount * beatSeconds ? 1 : Math.min(1, Math.max(0, (within - leadSeconds) / moveSeconds));
  return { index, progress };
}

/** Joint amounts at a moment: earlier beats done, the current one part way. */
function amountsAt(start: RigState, beats: Beat[], index: number, progress: number): RigState {
  const state = applyBeats(start, beats.slice(0, index));
  const beat = beats[index];
  if (!beat) return state;
  const from = state[beat.part] ?? 0;
  if (pulseActions.includes(beat.action)) {
    state[beat.part] = beat.action === "look" ? from : Math.sin(Math.min(1, progress) * Math.PI);
  } else {
    const target = applyBeats({}, [beat])[beat.part];
    if (target !== undefined) state[beat.part] = from + (target - from) * ease(progress);
  }
  return state;
}

function Timeline({ beats, start, slow, clockStartRef, amountsRef, focusRef, onBeat }: { beats: Beat[]; start: RigState; slow: boolean; clockStartRef: RefObject<number>; amountsRef: RefObject<RigState>; focusRef: RefObject<string | null>; onBeat: (index: number) => void }) {
  const lastIndexRef = useRef(-1);
  useFrame(({ clock }) => {
    if (!beats.length) {
      amountsRef.current = { ...start };
      focusRef.current = null;
      return;
    }
    const { index, progress } = timelineAt(clock.elapsedTime - clockStartRef.current, beats.length, slow);
    amountsRef.current = amountsAt(start, beats, index, progress);
    focusRef.current = beats[index].part;
    if (index !== lastIndexRef.current) {
      lastIndexRef.current = index;
      onBeat(index);
    }
  });
  return null;
}

function worldBox(node: THREE.Object3D | undefined) {
  const box = new THREE.Box3();
  if (node) box.setFromObject(node);
  return box;
}

/** Big orange arrow for the current beat, built from the part's real joint so it always points the right way. */
function BeatArrow({ beat, def, nodes }: { beat?: Beat; def?: RigPartDef; nodes: RefObject<Record<string, THREE.Group>> }) {
  const groupRef = useRef<THREE.Group>(null);
  const straightRef = useRef<THREE.Group>(null);
  const curvedRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    const node = beat ? nodes.current[beat.part] : undefined;
    if (!group || !beat || !def || !node) {
      if (group) group.visible = false;
      return;
    }
    const joint = def.joint;
    const showArrow = beat.action !== "look" && joint.kind !== "none";
    group.visible = showArrow;
    if (!showArrow) return;
    const box = worldBox(node);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(0.04, Math.min(0.18, size.length() * 0.35));
    const worldQuaternion = node.getWorldQuaternion(new THREE.Quaternion());
    const nudge = (Math.sin(clock.elapsedTime * 5) + 1) * 0.5;
    const reverse = beat.action === "close" || beat.action === "insert" || beat.action === "lock";
    const curved = joint.kind === "hinge" || joint.kind === "twist" || joint.kind === "turn";
    straightRef.current!.visible = !curved;
    curvedRef.current!.visible = curved;

    if (curved) {
      const axis = new THREE.Vector3(...joint.axis).applyQuaternion(worldQuaternion).normalize();
      const spinSign = Math.sign(joint.angle) * (reverse ? -1 : 1);
      let anchor = center.clone();
      if (joint.kind === "hinge") anchor = node.localToWorld(new THREE.Vector3(...joint.pivot)).add(new THREE.Vector3(0, size.y * 0.5 + 0.05, 0));
      else anchor.add(axis.clone().multiplyScalar(Math.max(size.x, size.y, size.z) * 0.6 + 0.02));
      group.position.copy(anchor);
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
      curvedRef.current!.rotation.y = spinSign * (0.2 + nudge * 0.25);
      curvedRef.current!.scale.set(spinSign < 0 ? -radius : radius, radius, radius);
      return;
    }
    let direction = new THREE.Vector3(0, 1, 0);
    if (joint.kind === "slide" || joint.kind === "press") direction = new THREE.Vector3(...joint.direction).applyQuaternion(worldQuaternion).normalize();
    if (joint.kind === "debris") direction = new THREE.Vector3(...joint.away).applyQuaternion(worldQuaternion).normalize();
    if (reverse) direction.negate();
    const length = joint.kind === "debris" ? 0.16 : Math.max(0.1, radius * 1.4);
    // Pulls start at the part and point out; presses come from outside and point in.
    const start = joint.kind === "press" ? center.clone().sub(direction.clone().multiplyScalar(length + 0.03)) : center.clone().add(direction.clone().multiplyScalar(Math.max(size.x, size.y, size.z) * 0.5 + 0.02));
    group.position.copy(start).add(direction.clone().multiplyScalar(nudge * 0.02));
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    straightRef.current!.scale.setScalar(length);
  });

  const material = <meshBasicMaterial color={accent} depthTest={false} transparent opacity={0.96} toneMapped={false} />;
  return (
    <group ref={groupRef} renderOrder={20}>
      <group ref={straightRef}>
        <mesh position={[0, 0.4, 0]} renderOrder={20}>
          <cylinderGeometry args={[0.07, 0.07, 0.8, 20]} />
          {material}
        </mesh>
        <mesh position={[0, 0.92, 0]} renderOrder={20}>
          <coneGeometry args={[0.18, 0.32, 28]} />
          {material}
        </mesh>
      </group>
      <group ref={curvedRef}>
        <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={20}>
          <torusGeometry args={[1, 0.06, 12, 64, Math.PI * 1.3]} />
          {material}
        </mesh>
        <mesh position={[Math.cos(Math.PI * 1.3), 0, -Math.sin(Math.PI * 1.3)]} rotation={[0, Math.PI * 1.3, Math.PI / 2]} renderOrder={20}>
          <coneGeometry args={[0.16, 0.32, 24]} />
          {material}
        </mesh>
      </group>
    </group>
  );
}

/** Frames the current beat's part from the side that shows it best, flying smoothly between beats. */
function CameraDirector({ beat, def, nodes, controlsRef, userMovedRef }: { beat?: Beat; def?: RigPartDef; nodes: RefObject<Record<string, THREE.Group>>; controlsRef: RefObject<OrbitControlsImpl | null>; userMovedRef: RefObject<boolean> }) {
  const { camera } = useThree();
  const placedRef = useRef(false);
  const goal = useRef({ position: new THREE.Vector3(1.6, 1.4, 2.2), target: new THREE.Vector3(0, 0.55, 0) });

  useEffect(() => {
    userMovedRef.current = false;
  }, [beat, userMovedRef]);

  useFrame((_, delta) => {
    const node = beat ? nodes.current[beat.part] : undefined;
    if (node) {
      const box = worldBox(node);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3()).length();
      const view = new THREE.Vector3(...(def?.view ?? [0.6, 0.5, 1])).normalize();
      const fov = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov);
      // Close enough to see the part, far enough to keep its surroundings for context.
      const distance = Math.max(1.05, Math.min(2.6, (size * 1.2 + 0.45) / Math.tan(fov / 2)));
      goal.current.target.copy(center);
      goal.current.position.copy(center).add(view.multiplyScalar(distance));
    }
    if (userMovedRef.current) return;
    const blend = placedRef.current ? 1 - Math.exp(-delta * 2) : 1;
    placedRef.current = true;
    camera.position.lerp(goal.current.position, blend);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.lerp(goal.current.target, blend);
      controls.update();
    }
  });
  return null;
}

function PinTracker({ beat, nodes, pinRef }: { beat?: Beat; nodes: RefObject<Record<string, THREE.Group>>; pinRef: RefObject<HTMLDivElement | null> }) {
  const { camera, size } = useThree();
  useFrame(() => {
    const pin = pinRef.current;
    const node = beat ? nodes.current[beat.part] : undefined;
    if (!pin) return;
    if (!node) {
      pin.style.opacity = "0";
      return;
    }
    const box = worldBox(node);
    const point = box.getCenter(new THREE.Vector3());
    point.y = box.max.y;
    const projected = point.project(camera);
    const x = Math.min(size.width - 130, Math.max(12, ((projected.x + 1) / 2) * size.width));
    const y = Math.min(size.height - 80, Math.max(60, ((1 - projected.y) / 2) * size.height));
    pin.style.transform = `translate(${x}px, ${y}px)`;
    pin.style.opacity = projected.z < 1 ? "1" : "0";
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
};

/** The appliance model playing one step: each beat moves a real part, with an arrow, a caption and a following camera. */
export default function RigScene({ catalog, Model, stepBeats, stepIndex }: RigSceneProps) {
  const defs = useMemo(() => Object.fromEntries(catalog.parts.map((part) => [part.id, part])), [catalog]);
  const beats = stepBeats[stepIndex] ?? [];
  const start = useMemo(() => applyBeats({}, stepBeats.slice(0, stepIndex).flat()), [stepBeats, stepIndex]);
  const amountsRef = useRef<RigState>({ ...start });
  const focusRef = useRef<string | null>(null);
  const nodesRef = useRef<Record<string, THREE.Group>>({});
  const clockStartRef = useRef(0);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const userMovedRef = useRef(false);
  const pinRef = useRef<HTMLDivElement | null>(null);
  const [beatIndex, setBeatIndex] = useState(0);
  const [slow, setSlow] = useState(false);
  const [replays, setReplays] = useState(0);
  const beat = beats[beatIndex];
  const runtime = useMemo(() => ({ defs, amounts: amountsRef, focus: focusRef, nodes: nodesRef }), [defs]);

  return (
    <div className="scene-3d rig-scene">
      <Canvas camera={{ position: [1.6, 1.4, 2.2], fov: 35, near: 0.02, far: 30 }} dpr={[1, 2]} shadows>
        <RigProvider value={runtime}>
          <StartClock clockStartRef={clockStartRef} restartKey={`${stepIndex}-${replays}-${slow}`} />
          <Timeline beats={beats} start={start} slow={slow} clockStartRef={clockStartRef} amountsRef={amountsRef} focusRef={focusRef} onBeat={setBeatIndex} />
          <ambientLight intensity={0.3} />
          <directionalLight position={[1.8, 3.2, 2.4]} intensity={1.7} castShadow shadow-mapSize={[1024, 1024]} />
          <Environment resolution={128}>
            <Lightformer form="rect" intensity={2.4} position={[0, 4, 2]} scale={[6, 3, 1]} />
            <Lightformer form="rect" intensity={1.2} color="#ffe9d2" position={[-4, 1.5, 1]} rotation-y={Math.PI / 2} scale={[4, 2, 1]} />
            <Lightformer form="rect" intensity={1} color="#dbe7ff" position={[4, 1.5, -1]} rotation-y={-Math.PI / 2} scale={[4, 2, 1]} />
          </Environment>
          <Model />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
            <circleGeometry args={[2.2, 64]} />
            <meshStandardMaterial color="#f1ede7" roughness={1} />
          </mesh>
          <ContactShadows position={[0, 0.001, 0]} scale={3} blur={2.4} far={1.2} opacity={0.4} resolution={512} />
          <BeatArrow beat={beat} def={beat ? defs[beat.part] : undefined} nodes={nodesRef} />
          <CameraDirector beat={beat} def={beat ? defs[beat.part] : undefined} nodes={nodesRef} controlsRef={controlsRef} userMovedRef={userMovedRef} />
          <PinTracker beat={beat} nodes={nodesRef} pinRef={pinRef} />
          <OrbitControls
            ref={controlsRef}
            makeDefault
            enablePan={false}
            enableDamping
            minDistance={0.3}
            maxDistance={5}
            onStart={() => {
              userMovedRef.current = true;
            }}
          />
        </RigProvider>
      </Canvas>
      {beat && (
        <div ref={pinRef} className="scene-pin" aria-hidden="true">
          <span className="scene-pin-dot" />
          <span className="scene-pin-label">{defs[beat.part]?.label ?? beat.part}</span>
        </div>
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
