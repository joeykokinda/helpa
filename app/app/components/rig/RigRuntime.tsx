"use client";

import { useFrame } from "@react-three/fiber";
import { createContext, useContext, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import * as THREE from "three";
import type { RigPartDef, RigState } from "../../lib/rig/types";
import { palette, toonCopy } from "./style/toon";

type RigRuntime = {
  defs: Record<string, RigPartDef>;
  /** Live joint amounts, written by the timeline every frame. */
  amounts: RefObject<RigState>;
  /** The part the current beat acts on. */
  focus: RefObject<string | null>;
  /** Outer groups by part id, so the camera and arrows can find parts in world space. */
  nodes: RefObject<Record<string, THREE.Group>>;
};

const RigContext = createContext<RigRuntime | null>(null);

export function RigProvider({ value, children }: { value: RigRuntime; children: ReactNode }) {
  return <RigContext.Provider value={value}>{children}</RigContext.Provider>;
}

export function useRig() {
  const rig = useContext(RigContext);
  if (!rig) throw new Error("RigPart must be inside a RigProvider");
  return rig;
}

const highlight = new THREE.Color(palette.accent);

type PartMaterial = THREE.Material & { emissive?: THREE.Color; emissiveIntensity?: number; map?: THREE.Texture | null };

/** Applies a joint at amount 0..1 to the inner group, relative to where the part rests. Amounts may overshoot a little for easing. */
export function applyJoint(def: RigPartDef, amount: number, inner: THREE.Object3D, materials: PartMaterial[] = []) {
  inner.position.set(0, 0, 0);
  inner.quaternion.identity();
  inner.scale.setScalar(1);
  const joint = def.joint;
  switch (joint.kind) {
    case "slide":
      inner.position.set(...joint.direction).normalize().multiplyScalar(joint.distance * amount);
      break;
    case "press": {
      const direction = new THREE.Vector3(...joint.direction).normalize();
      inner.position.copy(direction).multiplyScalar(joint.depth * amount);
      // Squash along the press, bulge a little across it; a release past rest stretches instead.
      const along = 1 - 0.22 * amount;
      const across = 1 + 0.08 * amount;
      inner.scale.set(across + (along - across) * Math.abs(direction.x), across + (along - across) * Math.abs(direction.y), across + (along - across) * Math.abs(direction.z));
      break;
    }
    case "hinge": {
      const pivot = new THREE.Vector3(...joint.pivot);
      const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...joint.axis).normalize(), joint.angle * amount);
      inner.quaternion.copy(rotation);
      inner.position.copy(pivot.clone().sub(pivot.clone().applyQuaternion(rotation)));
      break;
    }
    case "twist":
    case "turn": {
      const axis = new THREE.Vector3(...joint.axis).normalize();
      // Twists turn during the first half (unlock) and lift during the second (remove); turns use the whole range.
      const turned = joint.kind === "twist" ? Math.min(1, amount / 0.5) : amount;
      inner.quaternion.setFromAxisAngle(axis, joint.angle * turned);
      if (joint.kind === "twist") {
        // Twist first, then lift out along the axis.
        const lift = Math.max(0, (amount - 0.5) / 0.5);
        inner.position.copy(axis.multiplyScalar(joint.lift * lift));
      }
      break;
    }
    case "debris": {
      // Peel up and off, drift away, then fade out.
      const peel = Math.min(1, amount / 0.45);
      const drift = Math.max(0, (amount - 0.3) / 0.7);
      const away = new THREE.Vector3(...joint.away);
      inner.position.set(0, 0.04 * peel, 0).add(away.multiplyScalar(drift)).add(new THREE.Vector3(0, -0.25 * drift * drift, 0));
      inner.rotation.set(-0.9 * peel - 0.6 * drift, 0.4 * drift, 0);
      inner.scale.setScalar(1 - 0.35 * drift);
      const opacity = 1 - Math.max(0, (amount - 0.55) / 0.45);
      for (const material of materials) {
        material.opacity = opacity * ((material.userData.baseOpacity as number) ?? 1);
      }
      inner.visible = opacity > 0.01;
      break;
    }
  }
}

/** Lets the camera and arrows find a part in world space; returns the cleanup. */
function registerNode(rig: RigRuntime, id: string, outer: THREE.Group) {
  const nodes = rig.nodes.current;
  nodes[id] = outer;
  return () => {
    delete nodes[id];
  };
}

/** Each part's own (cloned) materials, keyed by its inner group. */
const partMaterials = new WeakMap<THREE.Group, PartMaterial[]>();

/** Gives a part's meshes their own cel-shaded materials so it can glow alone; stops at nested parts, which own theirs. */
function claimMaterials(inner: THREE.Group, fades: boolean) {
  const owned: PartMaterial[] = [];
  const walk = (object: THREE.Object3D) => {
    if (object !== inner && object.userData.rigPart) return;
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) {
      const cloned = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((material) => {
        const toon = toonCopy(material);
        const copy = (toon === material ? material.clone() : toon) as PartMaterial;
        copy.userData = { ...material.userData, ...toon.userData };
        // Set once, so fading debris never swaps shader programs mid-animation.
        if (fades) copy.transparent = true;
        copy.userData.baseOpacity = copy.opacity;
        copy.userData.baseEmissive = copy.emissive?.clone();
        copy.userData.baseEmissiveIntensity = copy.emissiveIntensity;
        return copy;
      });
      mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
      owned.push(...cloned);
    }
    object.children.forEach(walk);
  };
  walk(inner);
  return owned;
}

/** The focused part gets a thick outline from the style pass; this only adds a faint warm breath on top. */
function paintGlow(materials: PartMaterial[], focused: boolean, seconds: number) {
  const pulse = (Math.sin(seconds * 5) + 1) / 2;
  for (const material of materials) {
    if (!material.emissive) continue;
    if (focused) {
      material.emissive.copy(highlight);
      // Textured things (lint, mesh, grime) only get a hint of glow so they still look like themselves.
      material.emissiveIntensity = material.map ? 0.02 + pulse * 0.03 : 0.04 + pulse * 0.06;
    } else {
      if (material.userData.baseEmissive) material.emissive.copy(material.userData.baseEmissive);
      material.emissiveIntensity = (material.userData.baseEmissiveIntensity as number) ?? 1;
    }
  }
}

type RigPartProps = {
  id: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  children: ReactNode;
};

/**
 * A movable appliance part. The outer group is where it rests; the inner group carries the joint motion,
 * so children can be modelled in the part's own frame. Materials are cloned so the part can glow alone.
 */
export function RigPart({ id, position, rotation, children }: RigPartProps) {
  const rig = useRig();
  const outerRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Group>(null);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    const outer = outerRef.current;
    if (!inner || !outer) return;
    partMaterials.set(inner, claimMaterials(inner, rig.defs[id]?.joint.kind === "debris"));
    return registerNode(rig, id, outer);
  }, [id, rig]);

  useFrame(({ clock }) => {
    const def = rig.defs[id];
    const inner = innerRef.current;
    if (!def || !inner) return;
    const materials = partMaterials.get(inner) ?? [];
    applyJoint(def, rig.amounts.current[id] ?? 0, inner, materials);
    paintGlow(materials, rig.focus.current === id, clock.elapsedTime);
  });

  return (
    <group ref={outerRef} position={position} rotation={rotation} userData={{ rigPart: id }}>
      <group ref={innerRef} userData={{ rigPart: `${id}:inner` }}>
        {children}
      </group>
    </group>
  );
}
