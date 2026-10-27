"use client";

import { ContactShadows, Edges, Environment, Lightformer, OrbitControls, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from "react";
import * as THREE from "three";
import type { Motion, Scene, ScenePart, StepAnimation } from "../lib/api";

type OrbitControlsImpl = ComponentRef<typeof OrbitControls>;

const centimeters = 0.01;
const accent = "#ff8a2a";
const accentDeep = "#c2531a";

// One loop: glow at rest, move, hold at the end pose, then reset.
const restSeconds = 0.9;
const moveSeconds = 1.8;
const holdSeconds = 1.3;
const cycleSeconds = restSeconds + moveSeconds + holdSeconds;

function vector(values: number[] | undefined, fallback: number): [number, number, number] {
  const safe = (index: number) => (Number.isFinite(values?.[index]) ? (values![index] as number) : fallback);
  return [safe(0), safe(1), safe(2)];
}

function sizeOf(part: ScenePart): [number, number, number] {
  return vector(part.size, 10).map((value) => Math.max(0.5, value) * centimeters) as [number, number, number];
}

/** Racks and baskets read as wire, filters and screens as mesh: solid boxes would hide what they are. */
function lookOf(part: ScenePart): "wire" | "mesh" | "solid" {
  const name = `${part.id} ${part.label}`.toLowerCase();
  if (/rack|basket|grate|grill|shelf|tray/.test(name)) return "wire";
  if (/filter|screen|mesh|strainer|vent|lint/.test(name)) return "mesh";
  return "solid";
}

function PartGeometry({ part }: { part: ScenePart }) {
  const [width, height, depth] = sizeOf(part);
  const radius = width / 2;
  switch (part.shape) {
    case "cylinder":
    case "tube":
      return <cylinderGeometry args={[radius, radius, height, 40]} />;
    case "sphere":
      return <sphereGeometry args={[radius, 32, 24]} />;
    case "cone":
      return <coneGeometry args={[radius, height, 40]} />;
    case "torus":
      return <torusGeometry args={[radius, Math.max(height, depth) / 4, 16, 48]} />;
    case "capsule":
      return <capsuleGeometry args={[radius, Math.max(0.001, height - width), 8, 24]} />;
    default:
      return <boxGeometry args={[width, height, depth]} />;
  }
}

/** Where a moving part sits at progress 0..1 through its motion: an offset in metres and a spin in radians. */
function poseAt(animation: StepAnimation, progress: number) {
  const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
  const travel = travelOf(animation);
  const along = axisVector(animation.axis);
  const offset = new THREE.Vector3();
  let spin = 0;
  let squash = 1;
  switch (animation.motion) {
    case "twist_ccw":
      spin = eased * Math.PI * 0.5;
      offset.y = Math.max(0, (eased - 0.55) / 0.45) * travel;
      break;
    case "twist_cw":
      spin = -eased * Math.PI * 0.5;
      break;
    case "unscrew":
      spin = eased * Math.PI * 4;
      offset.copy(along).multiplyScalar(eased * travel);
      break;
    case "screw_in":
      spin = -(1 - eased) * Math.PI * 4;
      offset.copy(along).multiplyScalar((1 - eased) * travel);
      break;
    case "lift":
      offset.set(0, eased * travel, 0);
      break;
    case "pull_out":
      offset.copy(along).multiplyScalar(eased * travel);
      break;
    case "push_in":
      offset.copy(along).multiplyScalar((1 - eased) * travel);
      break;
    case "press":
      squash = 1 - Math.sin(Math.min(1, progress) * Math.PI) * 0.3;
      offset.copy(along).multiplyScalar(-Math.sin(Math.min(1, progress) * Math.PI) * 0.01);
      break;
    case "rinse":
      spin = Math.sin(progress * Math.PI * 6) * 0.2;
      break;
  }
  return { offset, spin, squash };
}

function axisVector(axis: StepAnimation["axis"]) {
  return new THREE.Vector3(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0);
}

function travelOf(animation: StepAnimation) {
  return Math.max(6, Math.min(45, animation.distance || 15)) * centimeters;
}

/** Progress through the move phase of the loop, 0 while resting and 1 while holding. */
function phaseProgress(elapsed: number, slow: boolean) {
  const time = (elapsed / (slow ? 1.8 : 1)) % cycleSeconds;
  return Math.min(1, Math.max(0, (time - restSeconds) / moveSeconds));
}

type PartProps = {
  part: ScenePart;
  /** Size of the main focused part, so much larger parts can turn to glass instead of blocking it. */
  focusSize?: number;
  animation?: StepAnimation;
  role: "focus" | "context" | "plain";
  moves?: boolean;
  ghost?: boolean;
  slow: boolean;
  clockStartRef: RefObject<number>;
};

/** Mixes a color toward white so context parts recede and the focused part pops. */
function pale(color: string, amount: number) {
  return new THREE.Color(color).lerp(new THREE.Color("#ffffff"), amount).getStyle();
}

function Part({ part, focusSize = 0, animation, role, moves = false, ghost = false, slow, clockStartRef }: PartProps) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const basePosition = useMemo(() => new THREE.Vector3(...vector(part.position, 0)).multiplyScalar(centimeters), [part.position]);
  const baseRotation = useMemo(
    () => new THREE.Euler(...vector(part.rotation, 0).map((degrees) => THREE.MathUtils.degToRad(degrees))),
    [part.rotation],
  );
  const look = lookOf(part);
  // Only the part that moves is painted orange; other named parts get an orange outline.
  const focused = role === "focus" && moves;
  const outlined = role === "focus" && !moves;
  const partSize = Math.max(...sizeOf(part));
  // Cabinets, tubs, doors and anything far bigger than the focus become soft x-ray glass so nothing hides it.
  const shell = !focused && ((part.opacity || 1) < 0.5 || (focusSize > 0 && partSize > focusSize * 3));

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    group.position.copy(basePosition);
    group.rotation.copy(baseRotation);
    group.scale.setScalar(1);
    if (animation && moves) {
      const progress = ghost ? 1 : phaseProgress(clock.elapsedTime - clockStartRef.current, slow);
      const pose = poseAt(animation, progress);
      group.position.add(pose.offset);
      group.rotateY(pose.spin);
      group.scale.set(1, pose.squash, 1);
    }
    if (materialRef.current) {
      materialRef.current.emissiveIntensity = focused && !ghost ? 0.25 + Math.sin(clock.elapsedTime * 3.5) * 0.15 : 0;
    }
  });

  const [width, height, depth] = sizeOf(part);
  let color = part.color;
  let opacity = 1;
  let edgeColor = "#6b7280";
  let edgeOpacity = 0.35;
  if (ghost) {
    color = accent;
    opacity = 0.08;
    edgeColor = accent;
    edgeOpacity = 0.75;
  } else if (focused) {
    color = new THREE.Color(part.color).lerp(new THREE.Color(accent), 0.65).getStyle();
    edgeColor = accentDeep;
    edgeOpacity = 0.9;
  } else if (shell && !outlined) {
    color = pale(part.color, 0.55);
    opacity = role === "context" ? 0.1 : 0.16;
    edgeColor = "#94a3b8";
    edgeOpacity = role === "context" ? 0.22 : 0.35;
  } else if (outlined) {
    color = pale(part.color, 0.35);
    edgeColor = accentDeep;
    edgeOpacity = 0.9;
  } else if (role === "context") {
    color = pale(part.color, 0.6);
    edgeOpacity = 0.18;
  }
  if (look === "wire" && !ghost) opacity = Math.min(opacity, 0.15);

  const material = (
    <meshStandardMaterial
      ref={materialRef}
      color={color}
      emissive={accent}
      emissiveIntensity={0}
      transparent={opacity < 1}
      opacity={opacity}
      depthWrite={opacity >= 1}
      roughness={shell ? 0.2 : 0.55}
      metalness={shell ? 0 : 0.05}
    />
  );
  const boxy = part.shape === "box" || part.shape === "rounded_box";
  const bevel = Math.min(width, height, depth) * (part.shape === "rounded_box" ? 0.22 : 0.1);
  const wireThreshold = look === "wire" ? 1 : 25;
  return (
    <group ref={groupRef}>
      {boxy && look !== "wire" ? (
        <RoundedBox args={[width, height, depth]} radius={Math.max(0.0008, bevel)} smoothness={3} castShadow={!shell}>
          {material}
          <Edges color={edgeColor} transparent opacity={edgeOpacity} threshold={35} />
        </RoundedBox>
      ) : (
        <mesh castShadow={!shell}>
          <PartGeometry part={part} />
          {material}
          <Edges color={edgeColor} transparent opacity={edgeOpacity} threshold={wireThreshold} />
        </mesh>
      )}
      {look === "wire" && !ghost && <WireGrid width={width} height={height} depth={depth} color={focused ? accentDeep : edgeColor} opacity={Math.max(edgeOpacity, 0.5)} />}
      {look === "mesh" && !ghost && focused && <WireGrid width={width} height={height} depth={depth} color={accentDeep} opacity={0.6} />}
    </group>
  );
}

/** Thin bars across the top and front of a rack so it reads as a rack, not a block. */
function WireGrid({ width, height, depth, color, opacity }: { width: number; height: number; depth: number; color: string; opacity: number }) {
  const geometry = useMemo(() => {
    const points: number[] = [];
    const bars = 9;
    for (let index = 1; index < bars; index++) {
      const x = -width / 2 + (width * index) / bars;
      points.push(x, -height / 2, -depth / 2, x, -height / 2, depth / 2);
      points.push(x, -height / 2, depth / 2, x, height / 2, depth / 2);
      const z = -depth / 2 + (depth * index) / bars;
      points.push(-width / 2, -height / 2, z, width / 2, -height / 2, z);
    }
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return buffer;
  }, [width, height, depth]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={opacity} />
    </lineSegments>
  );
}

/** A chunky arrow showing which way to move: straight for pull, lift and press, curved for twists. */
function MotionArrow({ animation, anchor, partSize, slow, clockStartRef }: { animation: StepAnimation; anchor: THREE.Vector3; partSize: number; slow: boolean; clockStartRef: RefObject<number> }) {
  const groupRef = useRef<THREE.Group>(null);
  const motion: Motion = animation.motion;
  const along = axisVector(animation.axis);
  const travel = travelOf(animation);
  const scale = Math.max(0.05, Math.min(0.14, partSize * 0.45 + 0.03));
  const curved = motion === "twist_ccw" || motion === "twist_cw" || motion === "unscrew" || motion === "screw_in";

  const { direction, start } = useMemo(() => {
    const gap = partSize * 0.5 + scale * 0.25;
    if (motion === "lift") return { direction: new THREE.Vector3(0, 1, 0), start: anchor.clone().add(new THREE.Vector3(0, gap, 0)) };
    if (motion === "press") {
      // Buttons face the user or face up: come in from that side and point at the part.
      const inward = animation.axis === "y" ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(0, 0, -1);
      return { direction: inward, start: anchor.clone().sub(inward.clone().multiplyScalar(gap + scale * 1.6)) };
    }
    if (motion === "push_in") return { direction: along.clone().negate(), start: anchor.clone().add(along.clone().multiplyScalar(gap + travel + scale)) };
    return { direction: along.clone(), start: anchor.clone().add(along.clone().multiplyScalar(gap + travel * 0.6)) };
  }, [motion, anchor, along, partSize, scale, travel, animation.axis]);

  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()), [direction]);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const time = clock.elapsedTime - clockStartRef.current;
    const nudge = Math.sin(time * (slow ? 3 : 5)) * 0.15 + 0.15;
    group.position.copy(start).add(direction.clone().multiplyScalar(curved ? 0 : nudge * scale * 0.4));
    if (curved) group.rotation.y = (motion === "twist_cw" || motion === "screw_in" ? 1 : -1) * nudge * 0.6;
  });

  if (motion === "none" || motion === "rinse") return null;
  const arrowMaterial = <meshBasicMaterial color={accent} depthTest={false} transparent opacity={0.95} />;

  if (curved) {
    const radius = Math.max(0.035, Math.min(0.12, partSize * 0.55));
    const clockwise = motion === "twist_cw" || motion === "screw_in";
    const arc = Math.PI * 1.25;
    const tipAngle = clockwise ? -arc : arc;
    return (
      <group ref={groupRef} renderOrder={10}>
        <group position={[0, partSize * 0.35 + 0.015, 0]}>
          <mesh rotation={[Math.PI / 2, 0, clockwise ? -arc : 0]} renderOrder={10}>
            <torusGeometry args={[radius, Math.max(0.004, radius * 0.07), 12, 64, arc]} />
            {arrowMaterial}
          </mesh>
          <mesh
            position={[Math.cos(tipAngle) * radius, 0, -Math.sin(tipAngle) * radius]}
            rotation={[0, tipAngle + (clockwise ? Math.PI : 0), Math.PI / 2]}
            renderOrder={10}
          >
            <coneGeometry args={[radius * 0.25, radius * 0.45, 24]} />
            {arrowMaterial}
          </mesh>
        </group>
      </group>
    );
  }

  const shaft = scale;
  return (
    <group ref={groupRef} quaternion={quaternion} renderOrder={10}>
      <mesh position={[0, shaft / 2, 0]} renderOrder={10}>
        <cylinderGeometry args={[scale * 0.07, scale * 0.07, shaft, 20]} />
        {arrowMaterial}
      </mesh>
      <mesh position={[0, shaft + scale * 0.18, 0]} renderOrder={10}>
        <coneGeometry args={[scale * 0.24, scale * 0.38, 28]} />
        {arrowMaterial}
      </mesh>
    </group>
  );
}

/** Flies the camera to frame the focused parts from the angle that best shows the motion. */
function CameraDirector({ target, radius, motion, controls, settledRef }: { target: THREE.Vector3; radius: number; motion?: Motion; controls: RefObject<OrbitControlsImpl | null>; settledRef: RefObject<boolean> }) {
  const { camera } = useThree();
  const desired = useMemo(() => {
    const direction =
      motion === "twist_ccw" || motion === "twist_cw" || motion === "unscrew" || motion === "screw_in"
        ? new THREE.Vector3(0.35, 1.1, 0.75)
        : motion === "pull_out" || motion === "push_in"
          ? new THREE.Vector3(1.1, 0.55, 0.8)
          : motion === "lift"
            ? new THREE.Vector3(0.55, 0.45, 1)
            : new THREE.Vector3(0.6, 0.6, 1);
    const fov = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov);
    const distance = (radius / Math.sin(fov / 2)) * 1.15;
    return target.clone().add(direction.normalize().multiplyScalar(distance));
  }, [target, radius, motion, camera]);

  const framingKey = `${target.x.toFixed(3)},${target.y.toFixed(3)},${target.z.toFixed(3)},${radius.toFixed(3)},${motion}`;
  useEffect(() => {
    settledRef.current = false;
  }, [framingKey, settledRef]);

  const placedRef = useRef(false);
  useFrame((_, delta) => {
    if (settledRef.current) return;
    // Start already framed on first load; fly smoothly between steps after that.
    const blend = placedRef.current ? 1 - Math.exp(-delta * 4) : 1;
    placedRef.current = true;
    camera.position.lerp(desired, blend);
    const orbit = controls.current;
    if (orbit) {
      orbit.target.lerp(target, blend);
      orbit.update();
    } else {
      camera.lookAt(target);
    }
    if (camera.position.distanceTo(desired) < 0.002) settledRef.current = true;
  });
  return null;
}

/** Keeps the floating part label pinned over the focused part on screen. */
function LabelTracker({ point, labelRef }: { point: THREE.Vector3; labelRef: RefObject<HTMLDivElement | null> }) {
  const { camera, size } = useThree();
  useFrame(() => {
    const label = labelRef.current;
    if (!label) return;
    const projected = point.clone().project(camera);
    const x = Math.min(size.width - 120, Math.max(16, ((projected.x + 1) / 2) * size.width));
    const y = Math.min(size.height - 70, Math.max(64, ((1 - projected.y) / 2) * size.height));
    label.style.transform = `translate(${x}px, ${y}px)`;
    label.style.opacity = projected.z < 1 ? "1" : "0";
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

/** Matches a step's part id to a model part, tolerating ids that drifted ("power_button" vs "power_btn"). */
function resolvePart(parts: ScenePart[], wanted: string): ScenePart | undefined {
  const exact = parts.find((part) => part.id === wanted);
  if (exact) return exact;
  const words = wanted.toLowerCase().split(/[_\s-]+/).filter((word) => word.length > 2);
  let best: ScenePart | undefined;
  let bestScore = 0;
  for (const part of parts) {
    const name = `${part.id} ${part.label}`.toLowerCase();
    const score = words.filter((word) => name.includes(word)).length / Math.max(1, words.length);
    if (score > bestScore) [best, bestScore] = [part, score];
  }
  return bestScore >= 0.5 ? best : undefined;
}

/** Pulling sideways is almost never right for appliances; trust up/down, otherwise pull toward the user. */
function saneAnimation(animation: StepAnimation | undefined): StepAnimation | undefined {
  if (!animation) return animation;
  if ((animation.motion === "pull_out" || animation.motion === "push_in") && animation.axis === "x") return { ...animation, axis: "z" };
  return animation;
}

type Scene3DProps = { scene: Scene; stepIndex: number };

/** A friendly part-by-part 3D diagram: the current step's part glows, an arrow shows the move, and the camera frames it. */
export default function Scene3D({ scene, stepIndex }: Scene3DProps) {
  const animation = saneAnimation(scene.step_animations.find((candidate) => candidate.step === stepIndex));
  const focusParts = [
    ...new Set((animation?.part_ids ?? []).map((id) => resolvePart(scene.parts, id)).filter((part): part is ScenePart => !!part)),
  ];
  const focusIds = new Set(focusParts.map((part) => part.id));
  const primary = focusParts[0];
  // Only the main part and similar-sized pieces move; a tub or door named for context stays put.
  const moveLimit = primary ? Math.max(...sizeOf(primary)) * 1.6 : 0;
  const movingIds = new Set(focusParts.filter((part) => part === primary || Math.max(...sizeOf(part)) <= moveLimit).map((part) => part.id));
  const [slow, setSlow] = useState(false);
  const [replays, setReplays] = useState(0);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const settledRef = useRef(false);
  const labelRef = useRef<HTMLDivElement | null>(null);
  const clockStartRef = useRef(0);

  const { center, radius, anchor, primarySize, labelPoint } = (() => {
    const box = new THREE.Box3();
    const moving = focusParts.filter((part) => movingIds.has(part.id));
    const parts = moving.length ? moving : focusParts.length ? focusParts : scene.parts;
    for (const part of parts) {
      const position = new THREE.Vector3(...vector(part.position, 0)).multiplyScalar(centimeters);
      const half = new THREE.Vector3(...sizeOf(part)).multiplyScalar(0.5);
      box.expandByPoint(position.clone().sub(half)).expandByPoint(position.clone().add(half));
    }
    if (animation && focusParts.length) {
      const end = poseAt(animation, 1).offset;
      box.expandByPoint(box.max.clone().add(end)).expandByPoint(box.min.clone().add(end));
    }
    if (animation && primary && animation.motion !== "none") {
      // leave room for the arrow above or in front of the part
      const reach = Math.max(...sizeOf(primary)) + travelOf(animation) + 0.12;
      box.expandByScalar(Math.min(0.12, reach * 0.25));
    }
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const minimum = focusParts.length ? 0.2 : 0.4;
    const anchorPoint = primary ? new THREE.Vector3(...vector(primary.position, 0)).multiplyScalar(centimeters) : sphere.center;
    const size = primary ? Math.max(...sizeOf(primary)) : 0.1;
    return {
      center: sphere.center,
      radius: Math.max(minimum, sphere.radius),
      anchor: anchorPoint,
      primarySize: size,
      labelPoint: anchorPoint.clone().add(new THREE.Vector3(0, size * 0.5, 0)),
    };
  })();

  return (
    <div className="scene-3d">
      <Canvas camera={{ position: [1.4, 1.1, 1.8], fov: 38, near: 0.01, far: 50 }} dpr={[1, 2]}>
        <ambientLight intensity={0.35} />
        <directionalLight position={[1.5, 3, 2]} intensity={1.6} />
        <Environment resolution={128}>
          <Lightformer form="rect" intensity={2.2} position={[0, 4, 2]} scale={[6, 3, 1]} />
          <Lightformer form="rect" intensity={1.1} color="#ffe9d2" position={[-4, 1.5, 1]} rotation-y={Math.PI / 2} scale={[4, 2, 1]} />
          <Lightformer form="rect" intensity={0.9} color="#dbe7ff" position={[4, 1.5, -1]} rotation-y={-Math.PI / 2} scale={[4, 2, 1]} />
        </Environment>
        <ContactShadows position={[0, 0.001, 0]} scale={3} blur={2.6} far={1.6} opacity={0.35} resolution={512} />
        <StartClock clockStartRef={clockStartRef} restartKey={`${stepIndex}-${replays}-${slow}`} />
        {scene.parts.map((part) => (
          <Part
            key={part.id}
            part={part}
            animation={animation}
            role={focusIds.has(part.id) ? "focus" : focusIds.size ? "context" : "plain"}
            moves={movingIds.has(part.id)}
            focusSize={primary ? Math.max(...sizeOf(primary)) : 0}
            slow={slow}
            clockStartRef={clockStartRef}
          />
        ))}
        {animation &&
          animation.motion !== "none" &&
          focusParts
            .filter((part) => movingIds.has(part.id))
            .map((part) => <Part key={`ghost-${part.id}`} part={part} animation={animation} role="focus" moves ghost slow={slow} clockStartRef={clockStartRef} />)}
        {animation && primary && <MotionArrow key={stepIndex} animation={animation} anchor={anchor} partSize={primarySize} slow={slow} clockStartRef={clockStartRef} />}
        <CameraDirector target={center} radius={radius} motion={animation?.motion} controls={controlsRef} settledRef={settledRef} />
        <LabelTracker point={labelPoint} labelRef={labelRef} />
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enablePan={false}
          enableDamping
          minDistance={0.1}
          maxDistance={6}
          onStart={() => {
            settledRef.current = true;
          }}
        />
      </Canvas>
      {primary && (
        <div ref={labelRef} className="scene-pin" aria-hidden="true">
          <span className="scene-pin-dot" />
          <span className="scene-pin-label">{primary.label}</span>
        </div>
      )}
      <div className="scene-controls">
        <button
          type="button"
          className="scene-control"
          onClick={() => {
            settledRef.current = false;
            setReplays((count) => count + 1);
          }}
          aria-label="Replay and recenter"
        >
          ↺
        </button>
        <button type="button" className="scene-control" aria-pressed={slow} onClick={() => setSlow((current) => !current)}>
          {slow ? "1x" : "Slow"}
        </button>
      </div>
      {animation && <p className="scene-caption">{animation.caption}</p>}
    </div>
  );
}
