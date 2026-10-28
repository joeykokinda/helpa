"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { Beat, RigPartDef } from "../../../lib/rig/types";
import { applyJoint } from "../RigRuntime";
import { easeOutCubic, timing } from "./motion";
import { ghostMaterial, overlayLayer, palette } from "./toon";

export type PlayHead = { index: number; within: number; progress: number };

const samples = 40;

function toOverlay(object: THREE.Object3D) {
  object.traverse((child) => child.layers.set(overlayLayer));
}

/** World point of a part-local point with the joint at a given amount. */
function jointPoint(def: RigPartDef, outer: THREE.Object3D, local: THREE.Vector3, amount: number, scratch: THREE.Object3D) {
  applyJoint(def, amount, scratch);
  scratch.updateMatrix();
  return local.clone().applyMatrix4(scratch.matrix).applyMatrix4(outer.matrixWorld);
}

function createGuide() {
  const material = new LineMaterial({ color: palette.accentDeep, linewidth: 3, dashed: true, dashSize: 0.02, gapSize: 0.014, transparent: true, depthTest: false, worldUnits: false });
  const line = new Line2(new LineGeometry(), material);
  line.renderOrder = 30;
  line.frustumCulled = false;
  line.visible = false;
  const end = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 28), new THREE.MeshBasicMaterial({ color: palette.accentDeep, transparent: true, depthTest: false, side: THREE.DoubleSide }));
  end.renderOrder = 30;
  end.visible = false;
  return { line, material, end, scratch: new THREE.Object3D() };
}

/** Where the part will go: a marching dashed path (straight for slides, an arc for hinges and twists) and a ghost of the end pose. */
export default function MotionGuide({ beat, def, from, to, nodes, playRef }: { beat?: Beat; def?: RigPartDef; from: number; to: number; nodes: RefObject<Record<string, THREE.Group>>; playRef: RefObject<PlayHead> }) {
  const rootRef = useRef<THREE.Group>(null);
  const builtRef = useRef<Beat | undefined>(undefined);
  const ghostRef = useRef<THREE.Object3D | null>(null);
  const guideRef = useRef<ReturnType<typeof createGuide> | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const guide = createGuide();
    guideRef.current = guide;
    root.add(guide.line, guide.end);
    toOverlay(root);
    return () => {
      root.remove(guide.line, guide.end);
      guide.line.geometry.dispose();
      guide.material.dispose();
      guide.end.geometry.dispose();
      (guide.end.material as THREE.Material).dispose();
      guideRef.current = null;
    };
  }, []);

  useFrame(({ camera, size }, delta) => {
    const root = rootRef.current;
    const guide = guideRef.current;
    if (!root || !guide) return;
    if (builtRef.current !== beat) {
      builtRef.current = beat;
      if (ghostRef.current) root.remove(ghostRef.current);
      ghostRef.current = null;
      guide.line.visible = false;
      guide.end.visible = false;
      const node = beat ? nodes.current[beat.part] : undefined;
      const inner = node?.children[0];
      const kind = def?.joint.kind;
      const pulse = beat?.action === "turn";
      if (!beat || !def || !node || !inner || kind === "none" || kind === "debris" || kind === "press" || beat.action === "look" || (!pulse && Math.abs(to - from) < 0.01)) return;
      node.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(node);
      const center = box.getCenter(new THREE.Vector3());
      const extent = box.getSize(new THREE.Vector3());
      const local = inner.worldToLocal(center.clone()).applyMatrix4(inner.matrix);
      const joint = def.joint;
      if (joint.kind === "twist" || joint.kind === "turn") {
        // Trace a point off the axis, on the side facing the viewer, so the turn draws an arc.
        const axis = new THREE.Vector3(...joint.axis).normalize();
        const toward = new THREE.Vector3(...(def.view ?? [0.6, 0.5, 1])).normalize().applyQuaternion(node.getWorldQuaternion(new THREE.Quaternion()).invert());
        const side = toward.sub(axis.clone().multiplyScalar(toward.dot(axis)));
        if (side.lengthSq() < 1e-4) side.set(1, 0, 0).cross(axis);
        local.add(side.normalize().multiplyScalar(Math.max(extent.x, extent.y, extent.z) * 0.62 + 0.01));
      }
      // The part-local point at the beat's start amount, taken back to the joint's rest frame.
      applyJoint(def, from, guide.scratch);
      guide.scratch.updateMatrix();
      const rest = local.clone().applyMatrix4(guide.scratch.matrix.clone().invert());
      const start = pulse ? 0 : from;
      const end = pulse ? 1 : to;
      const positions: number[] = [];
      for (let index = 0; index <= samples; index++) positions.push(...jointPoint(def, node, rest, start + ((end - start) * index) / samples, guide.scratch).toArray());
      const last = new THREE.Vector3().fromArray(positions, samples * 3);
      const length = new THREE.Vector3().fromArray(positions, 0).distanceTo(last);
      if (length < 0.004) return;
      guide.line.geometry.dispose();
      guide.line.geometry = new LineGeometry().setPositions(positions);
      guide.line.computeLineDistances();
      const dash = Math.max(0.006, Math.min(0.03, length * 0.07));
      guide.material.dashSize = dash;
      guide.material.gapSize = dash * 0.7;
      guide.line.visible = true;
      guide.end.position.copy(last);
      guide.end.scale.setScalar(Math.max(0.008, extent.length() * 0.035));
      guide.end.visible = true;

      if (!pulse) {
        const ghost = inner.clone(true);
        ghost.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) mesh.material = ghostMaterial();
          else if ((child as THREE.Line).isLine) child.visible = false;
        });
        applyJoint(def, to, ghost);
        ghost.updateMatrix();
        ghost.matrix.premultiply(node.matrixWorld);
        ghost.matrixAutoUpdate = false;
        ghost.matrixWorldNeedsUpdate = true;
        toOverlay(ghost);
        root.add(ghost);
        ghostRef.current = ghost;
      }
    }

    const play = playRef.current;
    const within = play.within;
    const appear = easeOutCubic(Math.min(1, within / timing.lead));
    const leave = 1 - Math.max(0, (within - timing.lead - timing.move) / timing.hold);
    const visibility = Math.max(0, appear * leave);
    guide.material.opacity = 0.95 * visibility;
    guide.material.dashOffset -= delta * 0.06;
    guide.material.resolution.set(size.width, size.height);
    (guide.end.material as THREE.MeshBasicMaterial).opacity = visibility;
    guide.end.quaternion.copy(camera.quaternion);
    ghostMaterial().opacity = 0.42 * visibility * (1 - play.progress ** 3);
  });

  return <group ref={rootRef} />;
}
