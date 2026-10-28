"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import type { Beat, RigPartDef } from "../../../lib/rig/types";
import { palette, toonGradient } from "./toon";

const sweep = Math.PI * 1.25;
const up = new THREE.Vector3(0, 1, 0);

function worldBox(node: THREE.Object3D) {
  return new THREE.Box3().setFromObject(node);
}

/** Chunky arrow parts, built once. The arc runs (cos t, 0, -sin t), a positive turn about +Y; mirroring x reverses it. */
function useArrowParts() {
  return useMemo(() => {
    const material = new THREE.MeshToonMaterial({ color: palette.accent, emissive: palette.accent, emissiveIntensity: 0.18, gradientMap: toonGradient(), depthTest: false });
    material.userData = { toon: true, seeThrough: false };
    const points = Array.from({ length: 33 }, (_, index) => {
      const angle = (index / 32) * sweep;
      return new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
    });
    const arc = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, 0.085, 10, false);
    const tangent = new THREE.Vector3(-Math.sin(sweep), 0, -Math.cos(sweep));
    const arcHead = { position: points[32].clone().add(tangent.clone().multiplyScalar(0.15)), quaternion: new THREE.Quaternion().setFromUnitVectors(up, tangent) };
    return { material, arc, arcHead, cap: new THREE.SphereGeometry(0.085, 12, 8), shaft: new THREE.CylinderGeometry(0.085, 0.085, 0.66, 14), head: new THREE.ConeGeometry(0.2, 0.34, 20) };
  }, []);
}

/** The beat's arrow, built from the part's real joint so it always points the right way: cel-shaded orange, outlined by the style pass. */
export default function BeatArrow({ beat, def, nodes }: { beat?: Beat; def?: RigPartDef; nodes: RefObject<Record<string, THREE.Group>> }) {
  const groupRef = useRef<THREE.Group>(null);
  const straightRef = useRef<THREE.Group>(null);
  const curvedRef = useRef<THREE.Group>(null);
  const parts = useArrowParts();

  useFrame(({ clock, camera, size: viewport }) => {
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
    // Keep the arrow in proportion to the shot: close-ups get small arrows that stay in frame.
    const frameHalf = viewport.height / (2 * (camera as THREE.OrthographicCamera).zoom);
    const radius = Math.min(frameHalf * 0.22, Math.max(0.04, Math.min(0.18, size.length() * 0.35)));
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
      group.quaternion.setFromUnitVectors(up, axis);
      curvedRef.current!.rotation.y = spinSign * (0.15 + nudge * 0.2);
      curvedRef.current!.scale.set(spinSign < 0 ? -radius : radius, radius, radius);
      return;
    }
    let direction = new THREE.Vector3(0, 1, 0);
    if (joint.kind === "slide" || joint.kind === "press") direction = new THREE.Vector3(...joint.direction).applyQuaternion(worldQuaternion).normalize();
    if (joint.kind === "debris") direction = new THREE.Vector3(...joint.away).applyQuaternion(worldQuaternion).normalize();
    if (reverse) direction.negate();
    const length = Math.min(frameHalf * 0.4, joint.kind === "debris" ? 0.16 : Math.max(0.1, radius * 1.4));
    // Pulls start at the part and point out; presses, inserts and closes come from outside and point in.
    const extent = Math.abs(size.clone().dot(direction)) * 0.5;
    const inward = joint.kind === "press" || reverse;
    const start = inward ? center.clone().sub(direction.clone().multiplyScalar(extent + length + Math.min(0.04, length * 0.3))) : center.clone().add(direction.clone().multiplyScalar(extent + 0.02));
    group.position.copy(start).add(direction.clone().multiplyScalar(nudge * 0.02));
    group.quaternion.setFromUnitVectors(up, direction);
    straightRef.current!.scale.setScalar(length);
  });

  const styled = { styled: true };
  return (
    <group ref={groupRef}>
      <group ref={straightRef}>
        <mesh geometry={parts.cap} material={parts.material} renderOrder={20} userData={styled} />
        <mesh geometry={parts.shaft} material={parts.material} position={[0, 0.33, 0]} renderOrder={20} userData={styled} />
        <mesh geometry={parts.head} material={parts.material} position={[0, 0.83, 0]} renderOrder={21} userData={styled} />
      </group>
      <group ref={curvedRef}>
        <mesh geometry={parts.cap} material={parts.material} position={[1, 0, 0]} renderOrder={20} userData={styled} />
        <mesh geometry={parts.arc} material={parts.material} renderOrder={20} userData={styled} />
        <mesh geometry={parts.head} material={parts.material} position={parts.arcHead.position} quaternion={parts.arcHead.quaternion} renderOrder={21} userData={styled} />
      </group>
    </group>
  );
}
