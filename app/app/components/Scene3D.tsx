"use client";

import { Bounds, Edges, OrbitControls, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Scene, ScenePart, StepAnimation } from "../lib/api";

const centimeters = 0.01;
const cycleSeconds = 3.2;

function vector(values: number[] | undefined, fallback: number): [number, number, number] {
  const safe = (index: number) => (Number.isFinite(values?.[index]) ? (values![index] as number) : fallback);
  return [safe(0), safe(1), safe(2)];
}

function PartGeometry({ part }: { part: ScenePart }) {
  const [width, height, depth] = vector(part.size, 10).map((value) => Math.max(0.5, value) * centimeters);
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

/** Where a moving part sits at progress 0..1 through its step's motion. */
function poseAt(animation: StepAnimation, progress: number) {
  const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
  const travel = Math.max(3, Math.min(60, animation.distance || 12)) * centimeters;
  const axisVector = new THREE.Vector3(animation.axis === "x" ? 1 : 0, animation.axis === "y" ? 1 : 0, animation.axis === "z" ? 1 : 0);
  const offset = new THREE.Vector3();
  let spin = 0;
  let squash = 1;
  switch (animation.motion) {
    case "twist_ccw":
      spin = eased * Math.PI * 0.6;
      offset.y = Math.max(0, eased - 0.6) * travel;
      break;
    case "twist_cw":
      spin = -eased * Math.PI * 0.6;
      break;
    case "unscrew":
      spin = eased * Math.PI * 4;
      offset.copy(axisVector).multiplyScalar(eased * travel);
      break;
    case "screw_in":
      spin = -(1 - eased) * Math.PI * 4;
      offset.copy(axisVector).multiplyScalar((1 - eased) * travel);
      break;
    case "lift":
      offset.set(0, eased * travel, 0);
      break;
    case "pull_out":
      offset.copy(axisVector).multiplyScalar(eased * travel);
      break;
    case "push_in":
      offset.copy(axisVector).multiplyScalar((1 - eased) * travel);
      break;
    case "press":
      squash = 1 - Math.sin(progress * Math.PI * 2) ** 2 * 0.25;
      break;
    case "rinse":
      spin = Math.sin(progress * Math.PI * 6) * 0.25;
      break;
  }
  return { offset, spin, squash };
}

function Part({ part, animation, focused, dimmed }: { part: ScenePart; animation?: StepAnimation; focused: boolean; dimmed: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const basePosition = useMemo(() => new THREE.Vector3(...vector(part.position, 0)).multiplyScalar(centimeters), [part.position]);
  const baseRotation = useMemo(
    () => new THREE.Euler(...vector(part.rotation, 0).map((degrees) => THREE.MathUtils.degToRad(degrees))),
    [part.rotation],
  );
  const opacity = Math.min(1, Math.max(0.08, part.opacity || 1)) * (dimmed ? 0.35 : 1);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    group.position.copy(basePosition);
    group.rotation.copy(baseRotation);
    group.scale.setScalar(1);
    if (animation && focused) {
      const cycle = (clock.elapsedTime % cycleSeconds) / cycleSeconds;
      const progress = Math.min(1, Math.max(0, (cycle - 0.15) / 0.6));
      const pose = poseAt(animation, progress);
      group.position.add(pose.offset);
      group.rotateY(pose.spin);
      group.scale.set(1, pose.squash, 1);
    }
    if (materialRef.current) {
      materialRef.current.emissiveIntensity = focused ? 0.45 + Math.sin(clock.elapsedTime * 4) * 0.25 : 0;
    }
  });

  const geometry = <PartGeometry part={part} />;
  const [width, height, depth] = vector(part.size, 10).map((value) => Math.max(0.5, value) * centimeters);
  return (
    <group ref={groupRef}>
      {part.shape === "rounded_box" ? (
        <RoundedBox args={[width, height, depth]} radius={Math.min(width, height, depth) * 0.15} smoothness={4}>
          <meshStandardMaterial ref={materialRef} color={part.color} emissive="#ffaa3c" transparent opacity={opacity} depthWrite={opacity > 0.9} />
          <Edges color={focused ? "#c25a1c" : "#5a5f66"} transparent opacity={dimmed ? 0.25 : 0.7} threshold={20} />
        </RoundedBox>
      ) : (
        <mesh castShadow>
          {geometry}
          <meshStandardMaterial
            ref={materialRef}
            color={part.color}
            emissive="#ffaa3c"
            transparent
            opacity={opacity}
            depthWrite={opacity > 0.9}
            roughness={0.55}
          />
          <Edges color={focused ? "#c25a1c" : "#5a5f66"} transparent opacity={dimmed ? 0.25 : 0.7} threshold={20} />
        </mesh>
      )}
    </group>
  );
}

type Scene3DProps = { scene: Scene; stepIndex: number };

/** A friendly, part-by-part 3D diagram with the current step's parts glowing and moving. */
export default function Scene3D({ scene, stepIndex }: Scene3DProps) {
  const animation = scene.step_animations.find((candidate) => candidate.step === stepIndex);
  const focusIds = new Set(animation?.part_ids ?? []);
  const focusLabel = scene.parts.find((part) => part.id === animation?.part_ids[0])?.label;
  return (
    <div className="scene-3d">
      <Canvas camera={{ position: [1.2, 1, 1.6], fov: 40 }} dpr={[1, 2]}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[2, 3, 2]} intensity={1.4} />
        <hemisphereLight args={["#fff6e8", "#d9dde3", 0.6]} />
        <Bounds key={stepIndex} fit clip margin={1.3}>
          {scene.parts.map((part) => (
            <Part
              key={part.id}
              part={part}
              animation={animation}
              focused={focusIds.has(part.id)}
              dimmed={focusIds.size > 0 && !focusIds.has(part.id)}
            />
          ))}
        </Bounds>
        <OrbitControls makeDefault enablePan={false} autoRotate autoRotateSpeed={0.6} />
      </Canvas>
      {animation && (
        <p className="scene-caption">
          {focusLabel && <span className="scene-caption-part">{focusLabel}</span>}
          {animation.caption}
        </p>
      )}
    </div>
  );
}
