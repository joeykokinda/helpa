"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { EffectWhen, RigEffect, RigState } from "../../../lib/rig/types";
import { useRig } from "../RigRuntime";
import { overlayLayer } from "./toon";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function effectActive(when: EffectWhen[], amounts: RigState, focus: string | null) {
  return when.every((condition) => {
    if (condition.orFocus && focus === condition.part) return true;
    const amount = amounts[condition.part] ?? 0;
    return amount >= (condition.min ?? -Infinity) && amount <= (condition.max ?? Infinity);
  });
}

export function effectLevel(effect: RigEffect, amounts: RigState) {
  if (!effect.level) return 1;
  const amount = clamp01(amounts[effect.level.part] ?? 0);
  return effect.level.invert ? 1 - amount : amount;
}

/** World position of a point in a part's frame: where it rests, or where it is now when `follow`. */
export function effectAnchor(nodes: Record<string, THREE.Group>, part: string, offset: [number, number, number] | undefined, follow: boolean, target: THREE.Vector3) {
  const node = nodes[part];
  if (!node) return false;
  const frame = follow ? (node.children[0] ?? node) : node;
  frame.updateWorldMatrix(true, false);
  target.set(...(offset ?? [0, 0, 0]));
  frame.localToWorld(target);
  return true;
}

function Liquid({ color, opacity = 1 }: { color: string; opacity?: number }) {
  return <meshStandardMaterial color={color} roughness={0.12} metalness={0.1} transparent={opacity < 1} opacity={opacity} />;
}

const beads = 5;
const splashes = 5;

/** A stream that visibly runs: a body that thins as it empties, beads sliding down it, a ring and drops where it lands. */
function Flow({ effect }: { effect: RigEffect }) {
  const rig = useRig();
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const beadRefs = useRef<(THREE.Mesh | null)[]>([]);
  const splashRefs = useRef<(THREE.Mesh | null)[]>([]);
  const top = useRef(new THREE.Vector3()).current;
  const bottom = useRef(new THREE.Vector3()).current;
  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const amounts = rig.amounts.current;
    const level = effectLevel(effect, amounts);
    const visible = effectActive(effect.when, amounts, rig.focus.current) && level > 0.02 && effectAnchor(rig.nodes.current, effect.from, effect.offset, !!effect.follow, top);
    group.visible = visible;
    if (!visible) return;
    if (effect.to && effectAnchor(rig.nodes.current, effect.to, effect.toOffset, false, bottom)) bottom.set(top.x, Math.min(bottom.y, top.y - 0.01), top.z);
    else bottom.set(top.x, top.y - (effect.length ?? 0.2), top.z);
    const length = top.y - bottom.y;
    const time = clock.elapsedTime;
    const width = (effect.width ?? 0.012) * (0.35 + 0.65 * level);
    const wobble = 1 + 0.1 * Math.sin(time * 23);
    const body = bodyRef.current;
    if (body) {
      body.position.set(top.x, top.y - length / 2, top.z);
      body.scale.set(width * wobble, length, width * (2 - wobble));
    }
    beadRefs.current.forEach((bead, index) => {
      if (!bead) return;
      const phase = (time * 1.7 + index / beads) % 1;
      bead.position.set(top.x, top.y - length * phase ** 1.4, top.z);
      bead.scale.setScalar(width * (1.25 + 0.25 * Math.sin(index * 2.1 + time * 9)));
    });
    const ring = ringRef.current;
    if (ring) {
      const phase = (time * 2.4) % 1;
      ring.position.set(bottom.x, bottom.y + 0.002, bottom.z);
      ring.scale.setScalar(width * (1.4 + 2.6 * phase));
      (ring.material as THREE.MeshStandardMaterial).opacity = 0.9 * (1 - phase);
    }
    splashRefs.current.forEach((drop, index) => {
      if (!drop) return;
      const phase = (time * 2.1 + index / splashes) % 1;
      const angle = index * 2.4 + Math.floor(time * 2.1 + index / splashes) * 1.3;
      const reach = width * 4 * phase;
      drop.position.set(bottom.x + Math.cos(angle) * reach, bottom.y + Math.sin(phase * Math.PI) * width * 3, bottom.z + Math.sin(angle) * reach);
      drop.scale.setScalar(width * 0.55 * (1 - phase * 0.6));
    });
  });
  return (
    <group ref={groupRef} visible={false}>
      <mesh ref={bodyRef}>
        <cylinderGeometry args={[0.45, 0.55, 1, 14, 1, true]} />
        <Liquid color={effect.color} opacity={effect.opacity} />
      </mesh>
      {Array.from({ length: beads }, (_, index) => (
        <mesh key={index} ref={(mesh) => void (beadRefs.current[index] = mesh)}>
          <sphereGeometry args={[0.5, 12, 8]} />
          <Liquid color={effect.color} opacity={effect.opacity} />
        </mesh>
      ))}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} userData={{ noOutline: true }}>
        <ringGeometry args={[0.8, 1, 32]} />
        <meshBasicMaterial color={effect.color} transparent depthWrite={false} />
      </mesh>
      {Array.from({ length: splashes }, (_, index) => (
        <mesh key={index} ref={(mesh) => void (splashRefs.current[index] = mesh)}>
          <sphereGeometry args={[0.5, 10, 6]} />
          <Liquid color={effect.color} opacity={effect.opacity} />
        </mesh>
      ))}
    </group>
  );
}

const drips = 3;

/** Drops falling off a part, speeding up as they fall. */
function Drip({ effect }: { effect: RigEffect }) {
  const rig = useRig();
  const groupRef = useRef<THREE.Group>(null);
  const dropRefs = useRef<(THREE.Mesh | null)[]>([]);
  const origin = useRef(new THREE.Vector3()).current;
  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const amounts = rig.amounts.current;
    const visible = effectActive(effect.when, amounts, rig.focus.current) && effectAnchor(rig.nodes.current, effect.from, effect.offset, !!effect.follow, origin);
    group.visible = visible;
    if (!visible) return;
    const size = effect.width ?? 0.01;
    const fall = effect.length ?? 0.25;
    dropRefs.current.forEach((drop, index) => {
      if (!drop) return;
      const phase = (clock.elapsedTime * 1.25 + index / drips) % 1;
      drop.position.set(origin.x, origin.y - fall * phase * phase, origin.z);
      // Teardrop: stretched along the fall, smaller as it goes.
      drop.scale.set(size * (1 - 0.3 * phase), size * (1.5 + phase), size * (1 - 0.3 * phase));
    });
  });
  return (
    <group ref={groupRef} visible={false}>
      {Array.from({ length: drips }, (_, index) => (
        <mesh key={index} ref={(mesh) => void (dropRefs.current[index] = mesh)}>
          <sphereGeometry args={[0.5, 12, 8]} />
          <Liquid color={effect.color} opacity={effect.opacity} />
        </mesh>
      ))}
    </group>
  );
}

/** A liquid surface that rises or falls with its level: oil filling the pan, water going down the drain. */
function Pool({ effect }: { effect: RigEffect }) {
  const rig = useRig();
  const meshRef = useRef<THREE.Mesh>(null);
  const point = useRef(new THREE.Vector3()).current;
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const amounts = rig.amounts.current;
    const level = effectLevel(effect, amounts);
    const [low, high] = effect.range ?? [0, 0.05];
    const [x, , z] = effect.offset ?? [0, 0, 0];
    const visible = effectActive(effect.when, amounts, rig.focus.current) && level > 0.01 && effectAnchor(rig.nodes.current, effect.from, [x, low + (high - low) * level, z], !!effect.follow, point);
    mesh.visible = visible;
    if (!visible) return;
    mesh.position.copy(point);
    // A slow swirl while it moves, so the level change reads as liquid.
    if (!effect.size) mesh.rotation.z = clock.elapsedTime * 0.6;
    const shrink = 0.82 + 0.18 * level;
    mesh.scale.set(shrink, shrink, 1);
  });
  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      {effect.size ? <planeGeometry args={effect.size} /> : <circleGeometry args={[effect.width ?? 0.1, 40]} />}
      <Liquid color={effect.color} opacity={effect.opacity} />
    </mesh>
  );
}


const airParticles = 40;
const onOverlay = (object: THREE.Object3D | null) => void object?.layers.set(overlayLayer);

/**
 * X-ray airflow drawn over the model: glowing air runs along the route. While the clog is in (low `level`) most of
 * it piles up behind `chokeAt` and turns hot, and only a trickle gets past; once it's clear, it streams through.
 */
function Airflow({ effect }: { effect: RigEffect }) {
  const rig = useRig();
  const groupRef = useRef<THREE.Group>(null);
  const particleRefs = useRef<(THREE.Mesh | null)[]>([]);
  const routeRef = useRef<THREE.Mesh>(null);
  const curve = useMemo(() => new THREE.CatmullRomCurve3((effect.points ?? [[0, 0, 0], [0, 0.1, 0]]).map((point) => new THREE.Vector3(...point)), false, "centripetal"), [effect.points]);
  const route = useMemo(() => new THREE.TubeGeometry(curve, 80, 0.012, 8, false), [curve]);
  const chokeAt = useMemo(() => {
    const points = effect.points ?? [];
    if (effect.chokeAt === undefined || points.length < 2) return 2;
    // Arc-length position of the choke point along the route.
    const lengths = curve.getLengths(400);
    const target = new THREE.Vector3(...points[effect.chokeAt]);
    let best = 0;
    for (let index = 0, closest = Infinity; index <= 400; index++) {
      const distance = curve.getPoint(index / 400).distanceTo(target);
      if (distance < closest) [closest, best] = [distance, lengths[index] / lengths[400]];
    }
    return best;
  }, [curve, effect.points, effect.chokeAt]);
  const hot = useMemo(() => new THREE.Color("#ff5a3c"), []);
  const air = useMemo(() => new THREE.Color(effect.color), [effect.color]);
  useFrame(({ clock }) => {
    const group = groupRef.current;
    const node = rig.nodes.current[effect.from];
    if (!group) return;
    const visible = !!node && effectActive(effect.when, rig.amounts.current, rig.focus.current);
    group.visible = visible;
    if (!visible || !node) return;
    node.updateWorldMatrix(true, false);
    group.matrix.copy(node.matrixWorld);
    group.matrixAutoUpdate = false;
    const clear = effectLevel(effect, rig.amounts.current);
    const choked = clear < 0.5;
    const time = clock.elapsedTime;
    const speed = choked ? 0.16 : 0.42;
    particleRefs.current.forEach((particle, index) => {
      if (!particle) return;
      let along = (time * speed + index / airParticles) % 1;
      const getsThrough = index % 6 === 0;
      let heat = 0;
      if (choked && along > chokeAt && !getsThrough) {
        // Stuck behind the clog: bunch up and jostle.
        along = chokeAt - 0.01 - (index % 9) * 0.008 + Math.sin(time * 6 + index) * 0.004;
        heat = 1;
      }
      particle.position.copy(curve.getPointAt(Math.min(1, Math.max(0, along))));
      particle.position.x += Math.sin(index * 3.7 + time * 3) * 0.01;
      const fade = Math.min(1, along * 12, (1 - along) * 12);
      particle.scale.setScalar(0.019 * (0.7 + 0.5 * fade) * (heat ? 1.3 : 1));
      (particle.material as THREE.MeshBasicMaterial).color.copy(air).lerp(hot, heat);
    });
    const routeMaterial = routeRef.current?.material as THREE.MeshBasicMaterial | undefined;
    if (routeMaterial) routeMaterial.opacity = 0.18 + 0.06 * Math.sin(time * 4);
  });
  return (
    <group ref={groupRef} visible={false}>
      <mesh ref={(mesh) => void onOverlay((routeRef.current = mesh))} geometry={route} renderOrder={38}>
        <meshBasicMaterial color={effect.color} transparent depthTest={false} depthWrite={false} />
      </mesh>
      {Array.from({ length: airParticles }, (_, index) => (
        <mesh key={index} ref={(mesh) => void onOverlay((particleRefs.current[index] = mesh))} renderOrder={39}>
          <sphereGeometry args={[1, 10, 8]} />
          <meshBasicMaterial color={effect.color} transparent opacity={0.95} depthTest={false} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** The catalog's liquid effects for whichever model is showing. Works in world space, so mount it at the scene root. */
export default function PartEffects({ effects }: { effects?: RigEffect[] }) {
  return (
    <group>
      {effects?.map((effect, index) => {
        if (effect.kind === "flow") return <Flow key={index} effect={effect} />;
        if (effect.kind === "drip") return <Drip key={index} effect={effect} />;
        if (effect.kind === "airflow") return <Airflow key={index} effect={effect} />;
        return <Pool key={index} effect={effect} />;
      })}
    </group>
  );
}
