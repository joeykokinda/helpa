"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Beat, RigCatalog } from "../../lib/rig/types";
import catalogJson from "./catalogs/dishwasher.json";
import type { RigModule } from "./registry";
import { RigPart, useRig } from "./RigRuntime";

/**
 * Whirlpool built-in dishwasher (WDT730 family): plastic tub, hidden controls on the top edge of the door,
 * three racks, two-piece filter in the tub floor. Metres, origin at the floor centre, +z toward the user.
 */
const width = 0.6;
const height = 0.865;
const tubFloor = 0.13;
const tubCeiling = 0.8;
const tubHalfWidth = 0.26;
const tubBack = -0.27;
const tubFront = 0.255;
const openingBottom = 0.125;
const openingTop = 0.805;
const doorBottom = 0.1;
const doorHeight = height - doorBottom;
const doorWidth = 0.597;
const filterZ = 0.1;
const armHubZ = -0.04;
const linerBottom = 0.03;
const linerTop = 0.7;
const dispenserY = 0.4;
const soapCupX = -0.03;
const rinseAidX = 0.115;
const counterTop = 0.906;
const sinkX = -0.61;

export const dishwasherCatalog = catalogJson as RigCatalog;

const tubPlastic = { color: "#e7eaed", roughness: 0.55, metalness: 0 };
const rackCoating = { color: "#8c96a0", roughness: 0.45, metalness: 0.25 };
const chrome = { color: "#d9dde2", roughness: 0.18, metalness: 0.95 };
const darkPlastic = { color: "#3b4148", roughness: 0.5, metalness: 0.05 };

/* ---------- textures, drawn once on canvases ---------- */

const textureCache = new Map<string, THREE.Texture>();

function canvasTexture(key: string, canvasWidth: number, canvasHeight: number, draw: (context: CanvasRenderingContext2D) => void, repeat: [number, number] = [1, 1]) {
  const cached = textureCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  draw(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, texture);
  return texture;
}

function seededRandom(seed: number) {
  let state = seed;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

/** Faint moulded speckle of a plastic tub. */
function tubTexture() {
  return canvasTexture(
    "dishwasher-tub",
    256,
    256,
    (context) => {
      context.fillStyle = "#eceef0";
      context.fillRect(0, 0, 256, 256);
      const random = seededRandom(11);
      for (let dot = 0; dot < 1600; dot++) {
        const shade = 214 + Math.floor(random() * 30);
        context.fillStyle = `rgba(${shade}, ${shade + 2}, ${shade + 5}, 0.55)`;
        context.fillRect(random() * 256, random() * 256, 1.5, 1.5);
      }
    },
    [3, 3],
  );
}

/** Fine filter screen: light wire grid over a dark backing, or see-through when there is no backing. */
function filterMeshTexture(seeThrough: boolean) {
  return canvasTexture(
    seeThrough ? "dishwasher-mesh-clear" : "dishwasher-mesh",
    128,
    128,
    (context) => {
      context.clearRect(0, 0, 128, 128);
      if (!seeThrough) {
        context.fillStyle = "#4c535b";
        context.fillRect(0, 0, 128, 128);
      }
      context.strokeStyle = "rgba(196, 202, 209, 0.95)";
      context.lineWidth = 2.2;
      for (let line = 0; line <= 16; line++) {
        context.beginPath();
        context.moveTo(line * 8, 0);
        context.lineTo(line * 8, 128);
        context.moveTo(0, line * 8);
        context.lineTo(128, line * 8);
        context.stroke();
      }
    },
    seeThrough ? [10, 3] : [14, 14],
  );
}

type KeepOut = { x: number; y: number; radiusX: number; radiusY: number };

/** Bits of old food: greasy smears, rice, carrot, herbs, crumbs. Transparent around them. */
function foodScrapsTexture(key: string, seed: number, count: number, keepOut?: KeepOut) {
  return canvasTexture(`dishwasher-scraps-${key}`, 256, 256, (context) => {
    context.clearRect(0, 0, 256, 256);
    const random = seededRandom(seed);
    const blocked = (x: number, y: number) => keepOut !== undefined && ((x / 256 - keepOut.x) / keepOut.radiusX) ** 2 + ((y / 256 - keepOut.y) / keepOut.radiusY) ** 2 < 1;
    const point = () => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const x = 14 + random() * 228;
        const y = 14 + random() * 228;
        if (!blocked(x, y)) return [x, y];
      }
      return null;
    };
    // greasy smears first
    for (let smear = 0; smear < count / 6; smear++) {
      const spot = point();
      if (!spot) continue;
      context.fillStyle = `rgba(${120 + random() * 30}, ${92 + random() * 20}, ${52 + random() * 20}, 0.45)`;
      context.beginPath();
      context.ellipse(spot[0], spot[1], 8 + random() * 16, 5 + random() * 10, random() * Math.PI, 0, Math.PI * 2);
      context.fill();
    }
    const palette = ["#8a5a2b", "#a8743a", "#d9822b", "#e9e1cf", "#f3eddc", "#5f8a3a", "#b8452e", "#6b4a2a"];
    for (let bit = 0; bit < count; bit++) {
      const spot = point();
      if (!spot) continue;
      const color = palette[Math.floor(random() * palette.length)];
      context.fillStyle = color;
      context.beginPath();
      const rice = color === "#f3eddc" || color === "#e9e1cf";
      context.ellipse(spot[0], spot[1], rice ? 5 : 2.5 + random() * 5, rice ? 2 : 2 + random() * 4, random() * Math.PI, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "rgba(255, 255, 255, 0.25)";
      context.beginPath();
      context.arc(spot[0] - 1, spot[1] - 1, 1.2, 0, Math.PI * 2);
      context.fill();
    }
  });
}

/** Grey-brown gunk packed into a row of spray holes. */
function sprayGunkTexture() {
  return canvasTexture("dishwasher-gunk", 256, 64, (context) => {
    context.clearRect(0, 0, 256, 64);
    const random = seededRandom(5);
    for (let blob = 0; blob < 70; blob++) {
      const x = 8 + random() * 240;
      const y = 32 + (random() - 0.5) * 34;
      context.fillStyle = `rgba(${96 + random() * 40}, ${80 + random() * 30}, ${58 + random() * 20}, ${0.55 + random() * 0.4})`;
      context.beginPath();
      context.ellipse(x, y, 3 + random() * 7, 2 + random() * 5, random() * Math.PI, 0, Math.PI * 2);
      context.fill();
    }
  });
}

/** Chalky white hard-water or soap film. */
function filmTexture(key: string, seed: number, density: number) {
  return canvasTexture(`dishwasher-film-${key}`, 256, 256, (context) => {
    context.clearRect(0, 0, 256, 256);
    const random = seededRandom(seed);
    for (let spot = 0; spot < density; spot++) {
      const x = random() * 256;
      const y = random() * 256;
      const radius = 2 + random() * 12;
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(255, 255, 255, ${0.5 + random() * 0.4})`);
      gradient.addColorStop(0.75, "rgba(250, 250, 248, 0.55)");
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      // dried edge of the drop, so spots show even on pale plastic
      context.strokeStyle = `rgba(130, 140, 150, ${0.5 + random() * 0.3})`;
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(x, y, radius * 0.8, 0, Math.PI * 2);
      context.stroke();
    }
    // drip streaks
    context.strokeStyle = "rgba(255, 255, 255, 0.35)";
    for (let streak = 0; streak < density / 12; streak++) {
      const x = random() * 256;
      context.lineWidth = 1 + random() * 2;
      context.beginPath();
      context.moveTo(x, random() * 100);
      context.lineTo(x + (random() - 0.5) * 6, 120 + random() * 136);
      context.stroke();
    }
  });
}

/** Plastic with rows of drainage slots, for the fork and knife basket. */
function slottedPlasticTexture() {
  return canvasTexture(
    "dishwasher-slots",
    128,
    128,
    (context) => {
      context.fillStyle = "#e3e7eb";
      context.fillRect(0, 0, 128, 128);
      context.globalCompositeOperation = "destination-out";
      for (let row = 0; row < 8; row++) {
        for (let column = 0; column < 4; column++) {
          context.fillRect(column * 32 + 6 + (row % 2) * 14, row * 16 + 5, 14, 6);
        }
      }
    },
    [2, 2],
  );
}

const buttonLabels = ["Heavy", "Normal", "1 Hour", "Heat Dry", "Ext Dry", "Sani", "Cancel", "Start"];
const buttonSpacing = 0.068;
const buttonX = (index: number) => (index - (buttonLabels.length - 1) / 2) * buttonSpacing;
const stripWidth = 0.56;
const stripDepth = 0.038;

/** The printed control strip on the top edge of the door: labels nearest the user, lights behind them. */
function controlStripTexture() {
  return canvasTexture("dishwasher-controls", 1024, 72, (context) => {
    context.fillStyle = "#1d2125";
    context.fillRect(0, 0, 1024, 72);
    const toPixel = (x: number) => ((x + stripWidth / 2) / stripWidth) * 1024;
    context.textAlign = "center";
    context.textBaseline = "middle";
    buttonLabels.forEach((label, index) => {
      const x = toPixel(buttonX(index));
      context.fillStyle = label === "Start" ? "#7ee08a" : "#eef1f4";
      context.font = "600 17px system-ui, sans-serif";
      context.fillText(label, x, 55);
      context.fillStyle = index === 3 ? "#ffb347" : "#4a5158";
      context.beginPath();
      context.arc(x + 30, 20, 3, 0, Math.PI * 2);
      context.fill();
    });
    // control lock icon next to Heat Dry
    const lockX = toPixel(buttonX(3)) + 30;
    context.strokeStyle = "#ffb347";
    context.lineWidth = 2;
    context.strokeRect(lockX - 5, 34, 10, 8);
    context.beginPath();
    context.arc(lockX, 34, 4, Math.PI, 0);
    context.stroke();
  });
}

/* ---------- geometry helpers ---------- */

type Bar = [number, number, number, number, number, number];

/** Many thin wires merged into one geometry, so a rack is one mesh instead of hundreds. */
function wireGeometry(bars: Bar[], radius: number) {
  const up = new THREE.Vector3(0, 1, 0);
  const pieces = bars.map(([startX, startY, startZ, endX, endY, endZ]) => {
    const start = new THREE.Vector3(startX, startY, startZ);
    const end = new THREE.Vector3(endX, endY, endZ);
    const span = end.clone().sub(start);
    const piece = new THREE.CylinderGeometry(radius, radius, span.length(), 6, 1, true);
    piece.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, span.normalize()));
    const middle = start.add(end).multiplyScalar(0.5);
    piece.translate(middle.x, middle.y, middle.z);
    return piece;
  });
  const merged = mergeGeometries(pieces)!;
  pieces.forEach((piece) => piece.dispose());
  return merged;
}

function rectangleLoop(y: number, halfWidth: number, back: number, front: number): Bar[] {
  return [
    [-halfWidth, y, back, halfWidth, y, back],
    [-halfWidth, y, front, halfWidth, y, front],
    [-halfWidth, y, back, -halfWidth, y, front],
    [halfWidth, y, back, halfWidth, y, front],
  ];
}

function steps(from: number, to: number, step: number) {
  const values: number[] = [];
  for (let value = from; value <= to + 1e-6; value += step) values.push(value);
  return values;
}

/** The sides, floor grid and handle every rack shares. */
function rackShell(halfWidth: number, back: number, front: number, rackHeight: number, loops: number[], postStep: number, floorStep: number): Bar[] {
  const bars: Bar[] = loops.flatMap((y) => rectangleLoop(y, halfWidth, back, front));
  for (const x of steps(-halfWidth, halfWidth, postStep)) {
    bars.push([x, 0, back, x, rackHeight, back], [x, 0, front, x, rackHeight * 0.8, front]);
    bars.push([x, 0, back, x, 0, front]);
  }
  for (const z of steps(back, front, postStep)) {
    bars.push([-halfWidth, 0, z, -halfWidth, rackHeight, z], [halfWidth, 0, z, halfWidth, rackHeight, z]);
  }
  for (const z of steps(back, front, floorStep)) bars.push([-halfWidth, 0, z, halfWidth, 0, z]);
  // front handle
  bars.push([-0.06, rackHeight * 0.8, front, -0.06, rackHeight * 0.8 + 0.012, front + 0.02], [0.06, rackHeight * 0.8, front, 0.06, rackHeight * 0.8 + 0.012, front + 0.02]);
  bars.push([-0.06, rackHeight * 0.8 + 0.012, front + 0.02, 0.06, rackHeight * 0.8 + 0.012, front + 0.02]);
  return bars;
}

function roundedRectanglePath<T extends THREE.Path>(path: T, left: number, bottom: number, right: number, top: number, radius: number) {
  path.moveTo(left + radius, bottom);
  path.lineTo(right - radius, bottom);
  path.quadraticCurveTo(right, bottom, right, bottom + radius);
  path.lineTo(right, top - radius);
  path.quadraticCurveTo(right, top, right - radius, top);
  path.lineTo(left + radius, top);
  path.quadraticCurveTo(left, top, left, top - radius);
  path.lineTo(left, bottom + radius);
  path.quadraticCurveTo(left, bottom, left + radius, bottom);
  return path;
}

function circlePath(x: number, y: number, radius: number) {
  const path = new THREE.Path();
  path.absarc(x, y, radius, 0, Math.PI * 2, true);
  return path;
}

/** A flat plate with cut-outs, extruded to a thickness. Shape x is x; shape y is up (or -z when laid flat). */
function extrudedPlate(outline: THREE.Shape, holes: THREE.Path[], thickness: number, bevel = 0) {
  outline.holes.push(...holes);
  return new THREE.ExtrudeGeometry(outline, { depth: thickness, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 40 });
}

/** A closed loop with rounded corners in the x-z plane, for tubes like the seal and heating ring. */
function roundedLoopCurve(halfX: number, halfZ: number, radius: number, plane: "xz" | "xy") {
  const points: THREE.Vector3[] = [];
  const corners: [number, number, number][] = [
    [halfX - radius, halfZ - radius, 0],
    [-halfX + radius, halfZ - radius, Math.PI / 2],
    [-halfX + radius, -halfZ + radius, Math.PI],
    [halfX - radius, -halfZ + radius, (3 * Math.PI) / 2],
  ];
  for (const [centerA, centerB, startAngle] of corners) {
    for (let sample = 0; sample <= 6; sample++) {
      const angle = startAngle + (sample / 6) * (Math.PI / 2);
      const a = centerA + Math.cos(angle) * radius;
      const b = centerB + Math.sin(angle) * radius;
      points.push(plane === "xz" ? new THREE.Vector3(a, 0, b) : new THREE.Vector3(a, b, 0));
    }
  }
  return new THREE.CatmullRomCurve3(points, true, "centripetal");
}

/** Parts that only exist once you bring them (a cup, a tablet, a bottle): hidden while their joint is at rest. */
function ShowWhenBrought({ id, children }: { id: string; children: ReactNode }) {
  const rig = useRig();
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (groupRef.current) groupRef.current.visible = (rig.amounts.current[id] ?? 0) > 0.02;
  });
  return (
    <group ref={groupRef} visible={false}>
      {children}
    </group>
  );
}

/**
 * Mess that only belongs to one problem (standing water, hard-water film): hidden until its own beat starts,
 * so it doesn't show up in every other fix.
 */
function ShowFromOwnBeat({ id, children }: { id: string; children: ReactNode }) {
  const rig = useRig();
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (groupRef.current) groupRef.current.visible = rig.focus.current === id || (rig.amounts.current[id] ?? 0) > 0.001;
  });
  return (
    <group ref={groupRef} visible={false}>
      {children}
    </group>
  );
}

/* ---------- the tub ---------- */

function Tub() {
  const plastic = useMemo(() => tubTexture(), []);
  const frameGeometry = useMemo(() => {
    const frameHeight = height - doorBottom;
    const centerY = doorBottom + frameHeight / 2;
    const outline = roundedRectanglePath(new THREE.Shape(), -width / 2 + 0.0015, -frameHeight / 2, width / 2 - 0.0015, frameHeight / 2, 0.004);
    const opening = roundedRectanglePath(new THREE.Path(), -0.262, openingBottom - centerY, 0.262, openingTop - centerY, 0.02);
    return extrudedPlate(outline, [opening], 0.008, 0.002);
  }, []);
  const depth = tubFront - tubBack;
  const wallHeight = tubCeiling - tubFloor;
  const wallMaterial = <meshStandardMaterial map={plastic} {...tubPlastic} />;
  return (
    <group>
      {/* the front frame around the tub opening */}
      <mesh geometry={frameGeometry} position={[0, doorBottom + (height - doorBottom) / 2, tubFront - 0.016]} castShadow receiveShadow>
        <meshStandardMaterial color="#e3e6e9" roughness={0.45} />
      </mesh>
      {/* latch strike at the top middle of the opening */}
      <mesh position={[0, 0.835, tubFront - 0.006]}>
        <boxGeometry args={[0.05, 0.014, 0.004]} />
        <meshStandardMaterial color="#2e3338" roughness={0.6} />
      </mesh>
      <RigPart id="tub">
        <mesh position={[0, (tubFloor + tubCeiling) / 2, tubBack]} receiveShadow>
          <planeGeometry args={[tubHalfWidth * 2, wallHeight]} />
          {wallMaterial}
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * tubHalfWidth, (tubFloor + tubCeiling) / 2, (tubFront + tubBack) / 2]} rotation={[0, -side * (Math.PI / 2), 0]} receiveShadow>
            <planeGeometry args={[depth, wallHeight]} />
            {wallMaterial}
          </mesh>
        ))}
        <mesh position={[0, tubCeiling, (tubFront + tubBack) / 2]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[tubHalfWidth * 2, depth]} />
          {wallMaterial}
        </mesh>
        {/* moulded ledges the bottom rack wheels roll on */}
        {[-1, 1].map((side) => (
          <mesh key={`ledge${side}`} position={[side * (tubHalfWidth - 0.012), (tubFloor + 0.185) / 2, (tubFront + tubBack) / 2 - 0.005]} receiveShadow>
            <boxGeometry args={[0.024, 0.185 - tubFloor, depth - 0.01]} />
            <meshStandardMaterial {...tubPlastic} color="#dde1e5" />
          </mesh>
        ))}
        {/* rollers the middle and top rack rails ride on */}
        {[-1, 1].flatMap((side) =>
          [-0.2, 0.21].flatMap((z) => [
            <mesh key={`mid${side}${z}`} position={[side * 0.252, 0.492, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.01, 0.01, 0.012, 16]} />
              <meshStandardMaterial color="#f2f3f4" roughness={0.4} />
            </mesh>,
            <mesh key={`top${side}${z}`} position={[side * 0.25, 0.725, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.008, 0.008, 0.01, 16]} />
              <meshStandardMaterial color="#f2f3f4" roughness={0.4} />
            </mesh>,
          ]),
        )}
        {/* water feed up the back wall, with the dock the middle rack's arm plugs into */}
        <mesh position={[0, (tubFloor + tubCeiling) / 2, tubBack + 0.018]}>
          <cylinderGeometry args={[0.016, 0.016, wallHeight, 20]} />
          <meshStandardMaterial {...tubPlastic} color="#d6dade" />
        </mesh>
        <mesh position={[0, 0.452, tubBack + 0.03]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.02, 0.022, 0.02, 20]} />
          <meshStandardMaterial {...tubPlastic} color="#cfd4d9" />
        </mesh>
        <mesh position={[0, tubCeiling - 0.012, (tubBack + armHubZ) / 2 - 0.005]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.013, 0.013, armHubZ - tubBack - 0.01, 16]} />
          <meshStandardMaterial {...tubPlastic} color="#d6dade" />
        </mesh>
      </RigPart>
    </group>
  );
}

function TubFloor() {
  const plastic = useMemo(() => tubTexture(), []);
  const floorGeometry = useMemo(() => {
    // Shape y is -z once the plate is laid flat.
    const outline = roundedRectanglePath(new THREE.Shape(), -tubHalfWidth, -tubFront, tubHalfWidth, -tubBack, 0.01);
    return extrudedPlate(outline, [circlePath(0, -filterZ, 0.051)], 0.012);
  }, []);
  const heatingCurve = useMemo(() => roundedLoopCurve(0.2, 0.21, 0.05, "xz"), []);
  return (
    <group>
      <RigPart id="bottom_of_tub">
        <mesh geometry={floorGeometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, tubFloor - 0.012, 0]} receiveShadow>
          <meshStandardMaterial map={plastic} {...tubPlastic} color="#dfe3e7" />
        </mesh>
        {/* the sump the filters sit in */}
        <mesh position={[0, tubFloor - 0.05, filterZ]}>
          <cylinderGeometry args={[0.051, 0.045, 0.1, 40, 1, true]} />
          <meshStandardMaterial color="#59616a" roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, tubFloor - 0.099, filterZ]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.046, 40]} />
          <meshStandardMaterial color="#2d3238" roughness={0.8} />
        </mesh>
        {/* moulded collar around the sump */}
        <mesh position={[0, tubFloor + 0.001, filterZ]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.051, 0.06, 48]} />
          <meshStandardMaterial color="#c9ced3" roughness={0.5} />
        </mesh>
        {/* fixed base of the bottom spray arm */}
        <mesh position={[0, (tubFloor + 0.176) / 2, armHubZ]}>
          <cylinderGeometry args={[0.024, 0.03, 0.176 - tubFloor, 28]} />
          <meshStandardMaterial {...tubPlastic} color="#d2d7dc" />
        </mesh>
      </RigPart>
      <RigPart id="heating_ring" position={[0, tubFloor + 0.008, 0.005]}>
        <mesh>
          <tubeGeometry args={[heatingCurve, 120, 0.0055, 12, true]} />
          <meshStandardMaterial color="#3a3e43" roughness={0.35} metalness={0.6} />
        </mesh>
      </RigPart>
    </group>
  );
}

/* ---------- spray arms ---------- */

/** A flat spray arm, wider at the hub, with a row of jets along its top. */
function SprayArm({ id, reach, gunkId, holesFacing, hubUp }: { id: string; reach: number; gunkId?: string; holesFacing: 1 | -1; hubUp: boolean }) {
  const gunk = useMemo(() => sprayGunkTexture(), []);
  const armGeometry = useMemo(() => {
    const outline = new THREE.Shape();
    outline.moveTo(-reach, -0.012);
    outline.quadraticCurveTo(-reach - 0.014, 0, -reach, 0.012);
    outline.lineTo(-0.03, 0.022);
    outline.quadraticCurveTo(0, 0.03, 0.03, 0.022);
    outline.lineTo(reach, 0.012);
    outline.quadraticCurveTo(reach + 0.014, 0, reach, -0.012);
    outline.lineTo(0.03, -0.022);
    outline.quadraticCurveTo(0, -0.03, -0.03, -0.022);
    outline.closePath();
    const geometry = new THREE.ExtrudeGeometry(outline, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2 });
    geometry.translate(0, 0, -0.005);
    return geometry;
  }, [reach]);
  const jets = useMemo(() => steps(0.05, reach - 0.02, 0.028).flatMap((distance) => [distance, -distance]), [reach]);
  const jetSurface = holesFacing * 0.0075;
  return (
    <RigPart id={id}>
      <mesh geometry={armGeometry} rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <meshStandardMaterial color="#e9ecef" roughness={0.38} />
      </mesh>
      <mesh position={[0, (hubUp ? 1 : -1) * 0.01, 0]}>
        <cylinderGeometry args={[0.02, 0.022, 0.012, 24]} />
        <meshStandardMaterial color="#dfe3e7" roughness={0.4} />
      </mesh>
      {jets.map((distance) => (
        <mesh key={distance} position={[distance, jetSurface, (distance > 0 ? 1 : -1) * 0.004]} rotation={[0, 0, 0]}>
          <cylinderGeometry args={[0.0028, 0.0028, 0.0012, 10]} />
          <meshStandardMaterial color="#47505a" roughness={0.7} />
        </mesh>
      ))}
      {gunkId && (
        <RigPart id={gunkId} position={[0, jetSurface + holesFacing * 0.0012, 0]}>
          <mesh rotation={[holesFacing * -Math.PI / 2, 0, 0]}>
            <planeGeometry args={[reach * 2 - 0.04, 0.03]} />
            <meshStandardMaterial map={gunk} transparent alphaTest={0.05} roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
        </RigPart>
      )}
    </RigPart>
  );
}

/* ---------- filters ---------- */

function Filters() {
  const screen = useMemo(() => filterMeshTexture(true), []);
  const fineMesh = useMemo(() => filterMeshTexture(false), []);
  const roundScraps = useMemo(() => foodScrapsTexture("round", 3, 260), []);
  const flatScraps = useMemo(() => foodScrapsTexture("flat", 9, 240, { x: 0.5, y: 0.393, radiusX: 0.23, radiusY: 0.4 }), []);
  const flatGeometries = useMemo(() => {
    const outline = () => roundedRectanglePath(new THREE.Shape(), -0.13, -0.09, 0.13, 0.06, 0.018);
    const plate = extrudedPlate(outline(), [circlePath(0, 0, 0.053)], 0.003);
    const rim = extrudedPlate(outline(), [roundedRectanglePath(new THREE.Path(), -0.12, -0.08, 0.12, 0.05, 0.012)], 0.005);
    return { plate, rim };
  }, []);
  return (
    <group>
      {/* flat bottom filter: lies in the floor; lift the front a little and pull it forward */}
      <RigPart id="flat_bottom_filter" position={[0, tubFloor + 0.001, filterZ]}>
        <mesh geometry={flatGeometries.plate} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <meshStandardMaterial map={fineMesh} roughness={0.45} metalness={0.4} />
        </mesh>
        <mesh geometry={flatGeometries.rim} rotation={[-Math.PI / 2, 0, 0]} castShadow>
          <meshStandardMaterial {...darkPlastic} />
        </mesh>
        <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.056, 0.004, 10, 48]} />
          <meshStandardMaterial {...darkPlastic} />
        </mesh>
        <RigPart id="flat_filter_scraps" position={[0, 0.0065, 0.015]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.25, 0.14]} />
            <meshStandardMaterial map={flatScraps} transparent alphaTest={0.05} roughness={0.85} />
          </mesh>
        </RigPart>
      </RigPart>

      {/* round top filter: sits down in the sump; a quarter turn left frees it to lift out */}
      <RigPart id="round_top_filter" position={[0, tubFloor, filterZ]}>
        <mesh position={[0, -0.044, 0]}>
          <cylinderGeometry args={[0.041, 0.041, 0.08, 40, 1, true]} />
          <meshStandardMaterial map={screen} transparent alphaTest={0.3} color="#c4cad0" metalness={0.5} roughness={0.35} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.044, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.08, 32]} />
          <meshStandardMaterial color="#5a636c" roughness={0.6} />
        </mesh>
        {[-0.084, -0.004].map((y) => (
          <mesh key={y} position={[0, y, 0]}>
            <cylinderGeometry args={[0.044, 0.044, 0.008, 40]} />
            <meshStandardMaterial {...darkPlastic} />
          </mesh>
        ))}
        {/* cap with the finger grip */}
        <mesh position={[0, 0.005, 0]} castShadow>
          <cylinderGeometry args={[0.052, 0.054, 0.01, 48]} />
          <meshStandardMaterial {...darkPlastic} color="#454c54" />
        </mesh>
        <RoundedBox args={[0.088, 0.024, 0.016]} radius={0.006} position={[0, 0.021, 0]} castShadow>
          <meshStandardMaterial color="#626b75" roughness={0.45} />
        </RoundedBox>
        {/* turn arrows moulded into the cap */}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[0, 0.0102, side * 0.032]} rotation={[-Math.PI / 2, 0, side > 0 ? 0 : Math.PI]}>
            <circleGeometry args={[0.008, 3]} />
            <meshStandardMaterial color="#f4f5f6" roughness={0.5} />
          </mesh>
        ))}
        <RigPart id="round_filter_scraps">
          <mesh position={[0, -0.044, 0]}>
            <cylinderGeometry args={[0.0425, 0.0425, 0.072, 40, 1, true]} />
            <meshStandardMaterial map={roundScraps} transparent alphaTest={0.05} roughness={0.85} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 0.0105, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.03, 0.05, 40]} />
            <meshStandardMaterial map={roundScraps} transparent alphaTest={0.05} roughness={0.85} />
          </mesh>
        </RigPart>
      </RigPart>

      {/* seeds and a glass chip down in the sump, under the filters */}
      <RigPart id="sump_debris" position={[0, tubFloor - 0.092, filterZ]}>
        {[
          [0.018, 0, 0.01, "#c8a86a"],
          [-0.014, 0, 0.016, "#d8bf84"],
          [0.004, 0, -0.02, "#7a4a2a"],
          [-0.022, 0, -0.008, "#c8a86a"],
          [0.024, 0, -0.014, "#9b6b3a"],
        ].map(([x, y, z, color]) => (
          <mesh key={`${x}${z}`} position={[x as number, y as number, z as number]} scale={[1, 0.5, 0.6]}>
            <sphereGeometry args={[0.006, 12, 8]} />
            <meshStandardMaterial color={color as string} roughness={0.6} />
          </mesh>
        ))}
        <mesh position={[-0.004, 0.002, 0.002]} rotation={[-Math.PI / 2, 0, 0.6]}>
          <circleGeometry args={[0.012, 3]} />
          <meshStandardMaterial color="#cfe6ec" transparent opacity={0.6} metalness={0.3} roughness={0.05} side={THREE.DoubleSide} />
        </mesh>
      </RigPart>
    </group>
  );
}

/* ---------- racks ---------- */

function Wheel({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[0.02, 0.02, 0.012, 20]} />
      <meshStandardMaterial color="#f1f3f5" roughness={0.4} />
    </mesh>
  );
}

function ForkBasket() {
  const slots = useMemo(() => slottedPlasticTexture(), []);
  const basketWidth = 0.13;
  const basketHeight = 0.12;
  const basketDepth = 0.15;
  const handle = useMemo(() => new THREE.EllipseCurve(0, 0, basketWidth / 2 - 0.01, 0.05, 0, Math.PI, false, 0), []);
  const handleCurve = useMemo(() => new THREE.CatmullRomCurve3(handle.getPoints(16).map((point) => new THREE.Vector3(point.x, point.y + basketHeight, 0))), [handle]);
  const wall = <meshStandardMaterial map={slots} transparent alphaTest={0.5} roughness={0.5} side={THREE.DoubleSide} />;
  return (
    <RigPart id="fork_and_knife_basket" position={[0.155, 0.004, 0.13]}>
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[basketWidth, basketDepth]} />
        {wall}
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`x${side}`} position={[(side * basketWidth) / 2, basketHeight / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[basketDepth, basketHeight]} />
          {wall}
        </mesh>
      ))}
      {[-1, 0, 1].map((side) => (
        <mesh key={`z${side}`} position={[0, basketHeight / 2, (side * basketDepth) / 2]}>
          <planeGeometry args={[basketWidth, basketHeight]} />
          {wall}
        </mesh>
      ))}
      <mesh>
        <tubeGeometry args={[handleCurve, 24, 0.004, 8, false]} />
        <meshStandardMaterial color="#e3e7eb" roughness={0.5} />
      </mesh>
      {/* a few spoons and forks so it reads as the cutlery basket */}
      {[-0.035, 0, 0.035].map((x, index) => (
        <group key={x} position={[x, basketHeight + 0.02, (index - 1) * 0.03]} rotation={[0.12 * (index - 1), 0, 0.1 * (index - 1)]}>
          <mesh>
            <cylinderGeometry args={[0.0035, 0.0035, 0.14, 8]} />
            <meshStandardMaterial {...chrome} />
          </mesh>
          <mesh position={[0, 0.075, 0]} scale={[1, 1.6, 0.4]}>
            <sphereGeometry args={[0.011, 12, 8]} />
            <meshStandardMaterial {...chrome} />
          </mesh>
        </group>
      ))}
    </RigPart>
  );
}

function VinegarCup() {
  return (
    // Rests above the rack; bringing it lowers it onto the rack floor.
    <RigPart id="vinegar_cup" position={[-0.035, 0.264, 0.12]}>
      <ShowWhenBrought id="vinegar_cup">
        <mesh position={[0, 0.055, 0]}>
          <cylinderGeometry args={[0.042, 0.038, 0.11, 32, 1, true]} />
          <meshStandardMaterial color="#dfeef6" transparent opacity={0.55} roughness={0.08} metalness={0.15} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 0.002, 0]}>
          <cylinderGeometry args={[0.038, 0.038, 0.004, 32]} />
          <meshStandardMaterial color="#e8f2f7" transparent opacity={0.5} roughness={0.05} />
        </mesh>
        <mesh position={[0, 0.036, 0]}>
          <cylinderGeometry args={[0.039, 0.037, 0.066, 32]} />
          <meshStandardMaterial color="#e9c46a" transparent opacity={0.85} roughness={0.1} />
        </mesh>
        <mesh position={[0.046, 0.06, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <torusGeometry args={[0.022, 0.005, 10, 24, Math.PI]} />
          <meshStandardMaterial color="#e8f2f7" transparent opacity={0.5} roughness={0.05} />
        </mesh>
      </ShowWhenBrought>
    </RigPart>
  );
}

const bottomRackBack = -0.235;
const bottomRackFront = 0.215;
const bottomRackHalfWidth = 0.235;

function BottomRack() {
  const geometry = useMemo(() => {
    const bars = rackShell(bottomRackHalfWidth, bottomRackBack, bottomRackFront, 0.12, [0, 0.06, 0.12], 0.034, 0.068);
    // plate tines across the bottomRackBack half
    for (const z of [-0.17, -0.105, -0.04]) {
      bars.push([-0.22, 0.003, z, 0.22, 0.003, z]);
      for (const x of steps(-0.21, 0.21, 0.03)) bars.push([x, 0, z, x, 0.13, z - 0.015]);
    }
    // bowl tines on the bottomRackFront left
    for (const z of [0.05, 0.125]) {
      bars.push([-0.22, 0.003, z, -0.085, 0.003, z]);
      for (const x of steps(-0.21, -0.09, 0.03)) bars.push([x, 0, z, x, 0.09, z - 0.012]);
    }
    return wireGeometry(bars, 0.0022);
  }, []);
  return (
    <RigPart id="bottom_rack" position={[0, 0.205, -0.01]}>
      <mesh geometry={geometry} castShadow>
        <meshStandardMaterial {...rackCoating} />
      </mesh>
      {[-1, 1].flatMap((side) => [-0.17, 0.17].map((z) => <Wheel key={`${side}${z}`} position={[side * 0.247, 0, z]} />))}
      <ForkBasket />
      <VinegarCup />
    </RigPart>
  );
}

const middleRackBack = -0.225;
const middleRackFront = 0.225;
const middleRackHalfWidth = 0.235;

function MiddleRack() {
  const back = middleRackBack;
  const geometry = useMemo(() => {
    const bars = rackShell(middleRackHalfWidth, middleRackBack, middleRackFront, 0.14, [0, 0.07, 0.14], 0.034, 0.05);
    // glass tines down the middle
    for (const x of [-0.08, 0.08]) {
      bars.push([x, 0.003, middleRackBack, x, 0.003, middleRackFront]);
      for (const z of steps(middleRackBack + 0.02, middleRackFront - 0.02, 0.035)) bars.push([x, 0, z, x + Math.sign(x) * 0.012, 0.075, z]);
    }
    // fold-down cup shelves along both sides
    for (const side of [-1, 1]) {
      for (const x of [0.165, 0.195, 0.225]) bars.push([side * x, 0.1, middleRackBack + 0.02, side * x, 0.1, middleRackFront - 0.02]);
      for (const z of steps(middleRackBack + 0.02, middleRackFront - 0.02, 0.06)) bars.push([side * 0.165, 0.1, z, side * 0.235, 0.1, z]);
    }
    // stand-offs to the rails
    for (const side of [-1, 1]) for (const z of [-0.18, 0.18]) bars.push([side * middleRackHalfWidth, 0.04, z, side * 0.246, 0.04, z]);
    return wireGeometry(bars, 0.0022);
  }, []);
  return (
    <RigPart id="middle_rack" position={[0, 0.47, -0.01]}>
      <mesh geometry={geometry} castShadow>
        <meshStandardMaterial {...rackCoating} />
      </mesh>
      {/* rails that run on the tub rollers */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.252, 0.04, -0.01]}>
          <boxGeometry args={[0.012, 0.016, 0.45]} />
          <meshStandardMaterial color="#c7ccd1" roughness={0.4} metalness={0.3} />
        </mesh>
      ))}
      {/* water pipe under the rack, from the back dock to the arm */}
      <mesh position={[0, -0.018, (back - 0.01) / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.011, 0.011, -back + 0.01, 16]} />
        <meshStandardMaterial {...tubPlastic} color="#dfe3e7" />
      </mesh>
      <group position={[0, -0.045, 0]}>
        <SprayArm id="middle_spray_arm" reach={0.2} gunkId="middle_arm_gunk" holesFacing={1} hubUp />
      </group>
    </RigPart>
  );
}

const topRackBack = -0.215;
const topRackFront = 0.215;
const topRackHalfWidth = 0.235;

function TopRack() {
  const geometry = useMemo(() => {
    const bars = rackShell(topRackHalfWidth, topRackBack, topRackFront, 0.045, [0, 0.045], 0.03, 0.03);
    for (const x of steps(-topRackHalfWidth, topRackHalfWidth, 0.025)) bars.push([x, 0, topRackBack, x, 0, topRackFront]);
    for (const x of [-0.08, 0.08]) bars.push([x, 0.03, topRackBack, x, 0.03, topRackFront], [x, 0, topRackBack, x, 0.03, topRackBack], [x, 0, topRackFront, x, 0.03, topRackFront]);
    for (const side of [-1, 1]) for (const z of [-0.17, 0.17]) bars.push([side * topRackHalfWidth, 0.025, z, side * 0.244, 0.025, z]);
    return wireGeometry(bars, 0.0018);
  }, []);
  return (
    <RigPart id="top_small_rack" position={[0, 0.715, -0.01]}>
      <mesh geometry={geometry} castShadow>
        <meshStandardMaterial {...rackCoating} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.25, 0.025, 0]}>
          <boxGeometry args={[0.01, 0.012, 0.43]} />
          <meshStandardMaterial color="#c7ccd1" roughness={0.4} metalness={0.3} />
        </mesh>
      ))}
    </RigPart>
  );
}

/* ---------- door ---------- */

function TopEdgeControls() {
  const strip = useMemo(() => controlStripTexture(), []);
  const named: Record<number, string> = { 3: "heat_dry_button", 4: "extended_dry_button", 6: "cancel_button", 7: "start_button" };
  const pad = (index: number) => (
    <RoundedBox args={[0.05, 0.004, 0.014]} radius={0.0015} position={[0, 0.002, 0]}>
      <meshStandardMaterial color={index === 7 ? "#4a6b52" : "#3c434a"} roughness={0.35} />
    </RoundedBox>
  );
  return (
    <RigPart id="top_edge_buttons" position={[0, doorHeight + 0.0004, 0.028]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[stripWidth, stripDepth]} />
        <meshStandardMaterial map={strip} roughness={0.25} metalness={0.1} />
      </mesh>
      {buttonLabels.map((label, index) =>
        named[index] ? (
          <RigPart key={label} id={named[index]} position={[buttonX(index), 0, -0.011]}>
            {pad(index)}
          </RigPart>
        ) : (
          <group key={label} position={[buttonX(index), 0, -0.011]}>
            {pad(index)}
          </group>
        ),
      )}
    </RigPart>
  );
}

function SoapCupAndRinseAid() {
  const film = useMemo(() => filmTexture("soap", 21, 260), []);
  const cupWidth = 0.13;
  const cupHeight = 0.085;
  const bottleQuaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.85, 0, -0.5).normalize()), []);
  const cavity = { color: "#cdd2d7", roughness: 0.5 };
  return (
    <group>
      {/* soap cup well, recessed into the door */}
      <group position={[soapCupX, dispenserY, 0]}>
        <mesh position={[0, 0, 0.014]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[cupWidth, cupHeight]} />
          <meshStandardMaterial {...cavity} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={`x${side}`} position={[(side * cupWidth) / 2, 0, 0.001]}>
            <boxGeometry args={[0.003, cupHeight, 0.026]} />
            <meshStandardMaterial {...cavity} />
          </mesh>
        ))}
        {[-1, 1].map((side) => (
          <mesh key={`y${side}`} position={[0, (side * cupHeight) / 2, 0.001]}>
            <boxGeometry args={[cupWidth, 0.003, 0.026]} />
            <meshStandardMaterial {...cavity} />
          </mesh>
        ))}
      </group>
      <RigPart id="soap_cup_film" position={[soapCupX, dispenserY, 0.0125]}>
        <mesh rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[cupWidth - 0.01, cupHeight - 0.01]} />
          <meshStandardMaterial map={film} color="#eaf3ff" transparent alphaTest={0.04} roughness={0.9} />
        </mesh>
      </RigPart>
      {/* lid hinged along its top edge; it swings out from the door */}
      <RigPart id="soap_cup" position={[soapCupX, dispenserY + cupHeight / 2 + 0.002, -0.016]}>
        <RoundedBox args={[cupWidth + 0.008, cupHeight + 0.004, 0.006]} radius={0.002} position={[0, -(cupHeight + 0.004) / 2, 0]} castShadow>
          <meshStandardMaterial color="#f3f4f6" roughness={0.4} />
        </RoundedBox>
        <mesh position={[0, -cupHeight + 0.004, -0.004]}>
          <boxGeometry args={[0.03, 0.01, 0.004]} />
          <meshStandardMaterial color="#9aa3ab" roughness={0.5} />
        </mesh>
        <mesh position={[0, -cupHeight / 2, -0.0032]}>
          <boxGeometry args={[cupWidth - 0.03, 0.002, 0.001]} />
          <meshStandardMaterial color="#c4cad0" roughness={0.5} />
        </mesh>
      </RigPart>
      {/* tablet: rests above the cup, dropping it in brings it into view */}
      <RigPart id="detergent_tablet" position={[soapCupX, dispenserY, -0.13]}>
        <ShowWhenBrought id="detergent_tablet">
          <RoundedBox args={[0.042, 0.03, 0.009]} radius={0.003} position={[0, 0, 0.004]}>
            <meshStandardMaterial color="#f7f7f5" roughness={0.7} />
          </RoundedBox>
          <RoundedBox args={[0.042, 0.03, 0.008]} radius={0.003} position={[0, 0, -0.004]}>
            <meshStandardMaterial color="#2f74d0" roughness={0.6} />
          </RoundedBox>
          <mesh position={[0, 0, -0.0085]}>
            <sphereGeometry args={[0.008, 16, 10]} />
            <meshStandardMaterial color="#e2433a" roughness={0.5} />
          </mesh>
        </ShowWhenBrought>
      </RigPart>

      {/* rinse aid filler: dark fill hole and the level window beside it */}
      <mesh position={[rinseAidX, dispenserY, -0.006]}>
        <circleGeometry args={[0.026, 40]} />
        <meshStandardMaterial color="#d8dde2" roughness={0.5} />
      </mesh>
      <mesh position={[rinseAidX, dispenserY, -0.0065]}>
        <circleGeometry args={[0.012, 32]} />
        <meshStandardMaterial color="#23282d" roughness={0.8} />
      </mesh>
      <RoundedBox args={[0.016, 0.03, 0.002]} radius={0.0008} position={[rinseAidX + 0.045, dispenserY, -0.0125]}>
        <meshStandardMaterial color="#2f5f8f" roughness={0.2} metalness={0.2} />
      </RoundedBox>
      <RigPart id="rinse_aid_holder" position={[rinseAidX, dispenserY, -0.006]}>
        <mesh position={[0, 0, -0.0045]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.026, 0.027, 0.009, 40]} />
          <meshStandardMaterial color="#f1f2f4" roughness={0.4} />
        </mesh>
        <RoundedBox args={[0.036, 0.008, 0.008]} radius={0.002} position={[0, 0, -0.012]}>
          <meshStandardMaterial color="#d5dadf" roughness={0.4} />
        </RoundedBox>
        <mesh position={[0, 0.017, -0.0092]}>
          <circleGeometry args={[0.004, 3]} />
          <meshStandardMaterial color="#2f74d0" />
        </mesh>
      </RigPart>
      {/* the bottle comes in tipped, spout to the hole */}
      <RigPart id="rinse_aid_bottle" position={[rinseAidX + 0.172, dispenserY, -0.03 - 0.101]}>
        <ShowWhenBrought id="rinse_aid_bottle">
          <group quaternion={bottleQuaternion}>
            <mesh position={[0, 0.015, 0]}>
              <cylinderGeometry args={[0.011, 0.005, 0.03, 16]} />
              <meshStandardMaterial color="#f4f5f6" roughness={0.4} />
            </mesh>
            <mesh position={[0, 0.042, 0]}>
              <cylinderGeometry args={[0.02, 0.02, 0.026, 20]} />
              <meshStandardMaterial color="#f4f5f6" roughness={0.4} />
            </mesh>
            <RoundedBox args={[0.085, 0.17, 0.05]} radius={0.016} position={[0, 0.14, 0]} castShadow>
              <meshStandardMaterial color="#2b7ad6" transparent opacity={0.9} roughness={0.2} />
            </RoundedBox>
            <mesh position={[0, 0.13, 0.0255]}>
              <planeGeometry args={[0.065, 0.08]} />
              <meshStandardMaterial color="#f6f7f8" roughness={0.6} />
            </mesh>
          </group>
        </ShowWhenBrought>
      </RigPart>
    </group>
  );
}

function Door() {
  const plastic = useMemo(() => tubTexture(), []);
  const whiteFilm = useMemo(() => filmTexture("hard-water", 33, 520), []);
  const linerGeometry = useMemo(() => {
    const linerCenterY = (linerBottom + linerTop) / 2;
    const outline = roundedRectanglePath(new THREE.Shape(), -0.255, -(linerTop - linerBottom) / 2, 0.255, (linerTop - linerBottom) / 2, 0.02);
    const soapHole = roundedRectanglePath(new THREE.Path(), soapCupX - 0.065, dispenserY - linerCenterY - 0.0425, soapCupX + 0.065, dispenserY - linerCenterY + 0.0425, 0.006);
    return extrudedPlate(outline, [soapHole, circlePath(rinseAidX, dispenserY - linerCenterY, 0.027)], 0.009, 0.003);
  }, []);
  return (
    <RigPart id="door" position={[0, doorBottom, tubFront]}>
      {/* fingerprint-resistant stainless front */}
      <RoundedBox args={[doorWidth, doorHeight, 0.044]} radius={0.006} smoothness={3} position={[0, doorHeight / 2, 0.028]} castShadow receiveShadow>
        <meshStandardMaterial color="#cdd2d7" roughness={0.33} metalness={0.5} />
      </RoundedBox>
      {/* pocket handle near the top */}
      <mesh position={[0, doorHeight - 0.075, 0.0505]}>
        <boxGeometry args={[0.34, 0.032, 0.002]} />
        <meshStandardMaterial color="#25292e" roughness={0.6} />
      </mesh>
      <mesh position={[0, doorHeight - 0.058, 0.0515]}>
        <boxGeometry args={[0.35, 0.004, 0.003]} />
        <meshStandardMaterial {...chrome} />
      </mesh>
      {/* small status light on the front */}
      <mesh position={[0.24, doorHeight - 0.075, 0.0505]}>
        <circleGeometry args={[0.003, 16]} />
        <meshStandardMaterial color="#5fd17a" emissive="#5fd17a" emissiveIntensity={0.6} />
      </mesh>
      {/* inner plastic frame and liner */}
      <mesh position={[0, doorHeight / 2, 0.003]}>
        <boxGeometry args={[doorWidth - 0.008, doorHeight - 0.008, 0.006]} />
        <meshStandardMaterial color="#dfe2e5" roughness={0.5} />
      </mesh>
      <mesh geometry={linerGeometry} position={[0, (linerBottom + linerTop) / 2, -0.009]} receiveShadow>
        <meshStandardMaterial map={plastic} {...tubPlastic} />
      </mesh>
      {/* rails the bottom rack rolls out onto */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.245, 0.225, -0.0235]} castShadow>
          <boxGeometry args={[0.012, 0.39, 0.023]} />
          <meshStandardMaterial {...tubPlastic} color="#d9dde1" />
        </mesh>
      ))}
      <SoapCupAndRinseAid />
      {/* hard-water film on the door liner, only shown in the fix that washes it away */}
      <RigPart id="white_film" position={[0, (linerBottom + linerTop) / 2, -0.0128]}>
        <ShowFromOwnBeat id="white_film">
          <mesh rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[0.48, linerTop - linerBottom - 0.02]} />
            <meshStandardMaterial map={whiteFilm} transparent alphaTest={0.03} roughness={0.95} />
          </mesh>
        </ShowFromOwnBeat>
      </RigPart>
      <RigPart id="door_vent" position={[-0.17, 0.645, -0.0125]}>
        <RoundedBox args={[0.09, 0.03, 0.004]} radius={0.0015}>
          <meshStandardMaterial color="#c9ced3" roughness={0.45} />
        </RoundedBox>
        {[-0.008, 0, 0.008].map((y) => (
          <mesh key={y} position={[0, y, -0.0025]}>
            <boxGeometry args={[0.074, 0.004, 0.001]} />
            <meshStandardMaterial color="#353a40" roughness={0.7} />
          </mesh>
        ))}
      </RigPart>
      <RigPart id="door_latch" position={[0, 0.728, -0.004]}>
        <RoundedBox args={[0.05, 0.02, 0.012]} radius={0.003} position={[0, 0, -0.004]}>
          <meshStandardMaterial {...darkPlastic} color="#30363c" />
        </RoundedBox>
        <mesh position={[0, 0.004, -0.013]}>
          <boxGeometry args={[0.018, 0.006, 0.01]} />
          <meshStandardMaterial color="#9aa3ab" roughness={0.4} metalness={0.4} />
        </mesh>
      </RigPart>
      <TopEdgeControls />
    </RigPart>
  );
}

/* ---------- inside the tub: seal, debris, film, water ---------- */

/** Crumbs caught along the bottom of the door seal: x, y, radius, colour. */
const sealCrumbs: [number, number, number, string][] = [
  [-0.05, 0.002, 0.009, "#8a5a2b"],
  [-0.03, 0.004, 0.007, "#d9822b"],
  [-0.012, 0.001, 0.01, "#6b4a2a"],
  [0.008, 0.003, 0.006, "#efe6cf"],
  [0.025, 0.002, 0.008, "#5f8a3a"],
  [0.045, 0.001, 0.0095, "#8a5a2b"],
  [0.07, 0.003, 0.007, "#b8452e"],
  [0.09, 0.001, 0.008, "#efe6cf"],
  [0.115, 0.002, 0.0075, "#a8743a"],
];

function SealAndDebris() {
  const sealCurve = useMemo(() => roundedLoopCurve(0.268, (openingTop - openingBottom) / 2 + 0.006, 0.026, "xy"), []);
  return (
    <group>
      <RigPart id="rubber_door_seal" position={[0, (openingTop + openingBottom) / 2, tubFront - 0.004]}>
        <mesh>
          <tubeGeometry args={[sealCurve, 160, 0.0055, 10, true]} />
          <meshStandardMaterial color="#2a2e33" roughness={0.85} />
        </mesh>
      </RigPart>
      <RigPart id="seal_food" position={[-0.17, openingBottom - 0.003, tubFront - 0.002]}>
        {sealCrumbs.map(([x, y, radius, color]) => (
          <mesh key={x} position={[x, y, 0]} scale={[1.4, 0.75, 1]}>
            <sphereGeometry args={[radius, 12, 8]} />
            <meshStandardMaterial color={color} roughness={0.7} />
          </mesh>
        ))}
      </RigPart>
      {/* The water itself is a catalog pool effect that goes down as it's scooped or drains; these only give the camera its size. */}
      {["standing_water", "rinse_water"].map((id) => (
        <RigPart key={id} id={id} position={[0, tubFloor + 0.02, (tubFront + tubBack) / 2]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} visible={false}>
            <planeGeometry args={[tubHalfWidth * 2 - 0.05, tubFront - tubBack - 0.01]} />
            <meshBasicMaterial />
          </mesh>
        </RigPart>
      ))}
    </group>
  );
}

/* ---------- shell, base, kick plate, feet ---------- */

function ShellAndBase() {
  const shellDepth = tubFront - 0.016 - -0.29;
  const shellCenterZ = (tubFront - 0.016 + -0.29) / 2;
  return (
    <group>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.2975, (0.115 + height) / 2, shellCenterZ]} castShadow receiveShadow>
          <boxGeometry args={[0.004, height - 0.115, shellDepth]} />
          <meshStandardMaterial color="#d3d7db" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, height - 0.003, shellCenterZ]} castShadow>
        <boxGeometry args={[width - 0.004, 0.006, shellDepth]} />
        <meshStandardMaterial color="#d8dce0" roughness={0.6} />
      </mesh>
      <mesh position={[0, (0.115 + height) / 2, -0.29]}>
        <boxGeometry args={[width - 0.004, height - 0.115, 0.004]} />
        <meshStandardMaterial color="#cdd1d5" roughness={0.6} />
      </mesh>
      {/* mounting tabs that screw to the counter */}
      {[-1, 1].map((side) => (
        <mesh key={`tab${side}`} position={[side * 0.24, height + 0.004, tubFront - 0.03]}>
          <boxGeometry args={[0.04, 0.008, 0.03]} />
          <meshStandardMaterial color="#aeb4ba" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {/* base pan, side rails and pump behind the kick plate */}
      <mesh position={[0, 0.07, -0.05]}>
        <boxGeometry args={[0.56, 0.09, 0.47]} />
        <meshStandardMaterial color="#2b2f34" roughness={0.8} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`rail${side}`} position={[side * 0.285, 0.07, -0.03]}>
          <boxGeometry args={[0.02, 0.09, 0.52]} />
          <meshStandardMaterial color="#5a6067" roughness={0.6} metalness={0.4} />
        </mesh>
      ))}
      <mesh position={[0.09, 0.075, 0.12]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.04, 0.04, 0.09, 24]} />
        <meshStandardMaterial color="#1f2328" roughness={0.6} />
      </mesh>
      {/* rear feet */}
      {[-1, 1].map((side) => (
        <mesh key={`rear${side}`} position={[side * 0.255, 0.012, -0.25]}>
          <cylinderGeometry args={[0.014, 0.016, 0.024, 16]} />
          <meshStandardMaterial color="#25292e" roughness={0.7} />
        </mesh>
      ))}
      <RigPart id="front_leveling_feet" position={[0, 0, 0.215]}>
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 0.255, 0, 0]}>
            <mesh position={[0, 0.006, 0]}>
              <cylinderGeometry args={[0.016, 0.018, 0.012, 20]} />
              <meshStandardMaterial color="#25292e" roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.04, 0]}>
              <cylinderGeometry args={[0.006, 0.006, 0.058, 12]} />
              <meshStandardMaterial color="#b9bfc5" metalness={0.8} roughness={0.35} />
            </mesh>
            <mesh position={[0, 0.072, 0]}>
              <boxGeometry args={[0.03, 0.012, 0.03]} />
              <meshStandardMaterial color="#6a7077" metalness={0.5} roughness={0.5} />
            </mesh>
          </group>
        ))}
      </RigPart>
      <RigPart id="bottom_front_cover" position={[0, 0.052, 0.284]}>
        <RoundedBox args={[0.58, 0.09, 0.012]} radius={0.003} castShadow>
          <meshStandardMaterial color="#2f3439" roughness={0.45} metalness={0.3} />
        </RoundedBox>
        {steps(-0.2, 0.2, 0.025).map((x) => (
          <mesh key={x} position={[x, -0.012, 0.0065]}>
            <boxGeometry args={[0.012, 0.03, 0.001]} />
            <meshStandardMaterial color="#14171a" roughness={0.8} />
          </mesh>
        ))}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.26, 0.025, 0.0065]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.005, 0.005, 0.002, 16]} />
            <meshStandardMaterial {...chrome} />
          </mesh>
        ))}
      </RigPart>
    </group>
  );
}

/* ---------- the sink cabinet next to it ---------- */

function SinkCabinet() {
  const cabinetLeft = -0.91;
  const cabinetRight = -0.31;
  const cabinetCenter = (cabinetLeft + cabinetRight) / 2;
  const counterGeometry = useMemo(() => {
    const left = -0.935;
    const right = -0.302;
    const centerX = (left + right) / 2;
    // Shape y is -z once laid flat.
    const outline = roundedRectanglePath(new THREE.Shape(), left - centerX, -0.33, right - centerX, 0.32, 0.004);
    const sinkHole = roundedRectanglePath(new THREE.Path(), sinkX - centerX - 0.21, -0.17, sinkX - centerX + 0.21, 0.2, 0.03);
    const geometry = extrudedPlate(outline, [sinkHole], 0.03, 0.002);
    geometry.translate(centerX, 0, 0);
    return geometry;
  }, []);
  const faucetCurve = useMemo(
    () => new THREE.CatmullRomCurve3([new THREE.Vector3(sinkX, counterTop + 0.02, -0.27), new THREE.Vector3(sinkX, counterTop + 0.25, -0.27), new THREE.Vector3(sinkX, counterTop + 0.32, -0.2), new THREE.Vector3(sinkX, counterTop + 0.27, -0.1), new THREE.Vector3(sinkX, counterTop + 0.2, -0.085)]),
    [],
  );
  const drainHose = useMemo(
    () => new THREE.CatmullRomCurve3([new THREE.Vector3(-0.39, counterTop - 0.03, -0.265), new THREE.Vector3(-0.4, 0.62, -0.25), new THREE.Vector3(-0.36, 0.3, -0.2), new THREE.Vector3(-0.33, 0.17, -0.16), new THREE.Vector3(-0.3, 0.15, -0.15)]),
    [],
  );
  const sinkHose = useMemo(() => new THREE.CatmullRomCurve3([new THREE.Vector3(-0.39, counterTop - 0.03, -0.26), new THREE.Vector3(-0.47, 0.7, -0.2), new THREE.Vector3(-0.58, 0.62, -0.08)]), []);
  const supplyLine = useMemo(
    () => new THREE.CatmullRomCurve3([new THREE.Vector3(-0.45, 0.285, -0.25), new THREE.Vector3(-0.43, 0.2, -0.22), new THREE.Vector3(-0.37, 0.14, -0.17), new THREE.Vector3(-0.3, 0.13, -0.13)]),
    [],
  );
  const trap = useMemo(
    () => new THREE.CatmullRomCurve3([new THREE.Vector3(sinkX, 0.706, -0.02), new THREE.Vector3(sinkX, 0.56, -0.02), new THREE.Vector3(sinkX, 0.5, -0.06), new THREE.Vector3(sinkX, 0.54, -0.12), new THREE.Vector3(sinkX, 0.56, -0.29)]),
    [],
  );
  const carcass = { color: "#f2eee8", roughness: 0.55 };
  const inside = { color: "#e7e0d5", roughness: 0.7 };
  return (
    <group>
      {/* kitchen wall */}
      <mesh position={[-0.2, 1.1, -0.31]} receiveShadow>
        <planeGeometry args={[3.2, 2.2]} />
        <meshStandardMaterial color="#f1ece5" roughness={0.95} />
      </mesh>
      {/* cabinet box, shown with its doors off */}
      {[cabinetLeft + 0.009, cabinetRight - 0.009].map((x) => (
        <mesh key={x} position={[x, 0.476, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.018, 0.8, 0.6]} />
          <meshStandardMaterial {...carcass} />
        </mesh>
      ))}
      <mesh position={[cabinetCenter, 0.476, -0.29]}>
        <boxGeometry args={[0.58, 0.8, 0.012]} />
        <meshStandardMaterial {...inside} />
      </mesh>
      <mesh position={[cabinetCenter, 0.087, 0]} receiveShadow>
        <boxGeometry args={[0.58, 0.018, 0.6]} />
        <meshStandardMaterial {...inside} />
      </mesh>
      <mesh position={[cabinetCenter, 0.039, 0.24]}>
        <boxGeometry args={[0.6, 0.078, 0.018]} />
        <meshStandardMaterial color="#d8d2c8" roughness={0.7} />
      </mesh>
      <mesh position={[cabinetCenter, 0.82, 0.31]} castShadow>
        <boxGeometry args={[0.6, 0.11, 0.02]} />
        <meshStandardMaterial {...carcass} />
      </mesh>
      {[cabinetLeft + 0.02, cabinetRight - 0.02].map((x) => (
        <mesh key={`stile${x}`} position={[x, 0.46, 0.31]}>
          <boxGeometry args={[0.04, 0.72, 0.02]} />
          <meshStandardMaterial {...carcass} />
        </mesh>
      ))}
      <mesh position={[cabinetCenter, 0.11, 0.31]}>
        <boxGeometry args={[0.6, 0.03, 0.02]} />
        <meshStandardMaterial {...carcass} />
      </mesh>
      {/* counter with the sink cut-out */}
      <mesh geometry={counterGeometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, counterTop - 0.03, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#4b4f55" roughness={0.35} metalness={0.05} />
      </mesh>
      {/* stainless basin */}
      <group position={[sinkX, counterTop - 0.1, 0.0]}>
        <mesh position={[0, -0.1, 0.015]}>
          <boxGeometry args={[0.42, 0.004, 0.37]} />
          <meshStandardMaterial color="#b9c0c7" metalness={0.7} roughness={0.35} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={`bx${side}`} position={[side * 0.21, 0, 0.015]}>
            <boxGeometry args={[0.004, 0.2, 0.37]} />
            <meshStandardMaterial color="#c4cad0" metalness={0.7} roughness={0.35} />
          </mesh>
        ))}
        {[-1, 1].map((side) => (
          <mesh key={`bz${side}`} position={[0, 0, 0.015 + side * 0.185]}>
            <boxGeometry args={[0.42, 0.2, 0.004]} />
            <meshStandardMaterial color="#c4cad0" metalness={0.7} roughness={0.35} />
          </mesh>
        ))}
      </group>
      {/* faucet */}
      <mesh position={[sinkX, counterTop + 0.015, -0.27]}>
        <cylinderGeometry args={[0.026, 0.03, 0.03, 24]} />
        <meshStandardMaterial {...chrome} />
      </mesh>
      <mesh>
        <tubeGeometry args={[faucetCurve, 40, 0.011, 16, false]} />
        <meshStandardMaterial {...chrome} />
      </mesh>
      <mesh position={[sinkX + 0.035, counterTop + 0.09, -0.27]} rotation={[0, 0, -0.5]}>
        <cylinderGeometry args={[0.006, 0.006, 0.07, 12]} />
        <meshStandardMaterial {...chrome} />
      </mesh>
      {/* air gap body; its cap lifts off */}
      <mesh position={[-0.39, counterTop + 0.008, -0.265]}>
        <cylinderGeometry args={[0.018, 0.022, 0.016, 24]} />
        <meshStandardMaterial {...chrome} />
      </mesh>
      <RigPart id="air_gap_food" position={[-0.39, counterTop + 0.018, -0.265]}>
        {[
          [0, 0, 0, "#8a5a2b"],
          [0.008, 0.002, 0.004, "#d9822b"],
          [-0.007, 0.001, -0.004, "#efe6cf"],
          [0.002, 0.004, -0.008, "#6b4a2a"],
        ].map(([x, y, z, color]) => (
          <mesh key={`${x}${z}`} position={[x as number, y as number, z as number]} scale={[1.2, 0.7, 1]}>
            <sphereGeometry args={[0.0065, 12, 8]} />
            <meshStandardMaterial color={color as string} roughness={0.7} />
          </mesh>
        ))}
      </RigPart>
      <RigPart id="sink_drain_cap" position={[-0.39, counterTop + 0.004, -0.265]}>
        <mesh position={[0, 0.03, 0]} castShadow>
          <cylinderGeometry args={[0.022, 0.024, 0.052, 32]} />
          <meshStandardMaterial {...chrome} />
        </mesh>
        <mesh position={[0, 0.056, 0]} scale={[1, 0.45, 1]}>
          <sphereGeometry args={[0.022, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial {...chrome} />
        </mesh>
        <mesh position={[0, 0.042, 0.0225]}>
          <boxGeometry args={[0.014, 0.008, 0.002]} />
          <meshStandardMaterial color="#2c3035" roughness={0.6} />
        </mesh>
      </RigPart>
      {/* plumbing under the sink */}
      <mesh>
        <tubeGeometry args={[trap, 40, 0.019, 16, false]} />
        <meshStandardMaterial color="#f2f2ef" roughness={0.5} />
      </mesh>
      <mesh>
        <tubeGeometry args={[drainHose, 50, 0.011, 12, false]} />
        <meshStandardMaterial color="#9ea5ac" roughness={0.6} />
      </mesh>
      <mesh>
        <tubeGeometry args={[sinkHose, 30, 0.011, 12, false]} />
        <meshStandardMaterial color="#9ea5ac" roughness={0.6} />
      </mesh>
      <mesh>
        <tubeGeometry args={[supplyLine, 40, 0.006, 10, false]} />
        <meshStandardMaterial color="#c3c9cf" metalness={0.75} roughness={0.35} />
      </mesh>
      {/* faucet supply valves (static) */}
      {[-0.68, -0.54].map((x) => (
        <group key={x} position={[x, 0.42, -0.27]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.011, 0.011, 0.04, 16]} />
            <meshStandardMaterial {...chrome} />
          </mesh>
          <mesh position={[0, 0, 0.026]} scale={[1.5, 1, 1]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.016, 0.016, 0.007, 24]} />
            <meshStandardMaterial {...chrome} />
          </mesh>
        </group>
      ))}
      {/* dishwasher hot water valve: stub from the wall, body, and the handle that turns */}
      <mesh position={[-0.45, 0.3, -0.278]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.025, 16]} />
        <meshStandardMaterial color="#b87a4b" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[-0.45, 0.3, -0.258]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.014, 0.014, 0.022, 20]} />
        <meshStandardMaterial {...chrome} />
      </mesh>
      <mesh position={[-0.45, 0.287, -0.255]}>
        <cylinderGeometry args={[0.007, 0.007, 0.02, 12]} />
        <meshStandardMaterial {...chrome} />
      </mesh>
      <RigPart id="water_tap_under_sink" position={[-0.45, 0.3, -0.24]}>
        <mesh position={[0, 0, -0.004]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.004, 0.004, 0.012, 10]} />
          <meshStandardMaterial {...chrome} />
        </mesh>
        <mesh position={[0, 0, 0.003]} scale={[1.6, 1, 1]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 0.008, 28]} />
          <meshStandardMaterial color="#e4e7ea" metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh position={[0.02, 0, 0.0075]}>
          <circleGeometry args={[0.004, 16]} />
          <meshStandardMaterial color="#d23b2f" />
        </mesh>
      </RigPart>
    </group>
  );
}

export function DishwasherModel() {
  return (
    <group>
      <Tub />
      <TubFloor />
      <Filters />
      <group position={[0, 0.185, armHubZ]}>
        <SprayArm id="bottom_spray_arm" reach={0.215} gunkId="bottom_arm_gunk" holesFacing={1} hubUp={false} />
      </group>
      <group position={[0, 0.782, -0.03]}>
        <SprayArm id="top_spray_arm" reach={0.13} holesFacing={-1} hubUp />
      </group>
      <BottomRack />
      <MiddleRack />
      <TopRack />
      <SealAndDebris />
      <Door />
      <ShellAndBase />
      <SinkCabinet />
      {/* soft light inside the tub so the open door shows a bright interior */}
      <pointLight position={[0, 0.62, 0.12]} intensity={0.35} distance={1.4} decay={2} color="#fff6ea" />
      <pointLight position={[0, 0.3, 0.2]} intensity={0.18} distance={1} decay={2} color="#eef4ff" />
    </group>
  );
}

const openDoor: Beat = { part: "door", action: "open", caption: "Open the door" };
const closeDoor: Beat = { part: "door", action: "close", caption: "Close the door" };
const pullBottomRack: Beat = { part: "bottom_rack", action: "open", caption: "Pull out the bottom rack" };
const pushBottomRack: Beat = { part: "bottom_rack", action: "close", caption: "Push the bottom rack in" };
const roundFilterOut: Beat = { part: "round_top_filter", action: "remove", caption: "Turn left, then lift out" };
const roundFilterIn: Beat = { part: "round_top_filter", action: "insert", caption: "Drop in, turn right to lock" };
const flatFilterOut: Beat = { part: "flat_bottom_filter", action: "remove", caption: "Lift out the flat filter" };
const flatFilterIn: Beat = { part: "flat_bottom_filter", action: "insert", caption: "Lay the flat filter back" };

const sampleSteps: { instruction: string; beats: Beat[] }[] = [
  {
    instruction: "Clean the spray arm and filters",
    beats: [
      openDoor,
      { part: "middle_rack", action: "open", caption: "Pull out the middle rack" },
      { part: "middle_spray_arm", action: "turn", caption: "Spin the arm by hand" },
      { part: "middle_arm_gunk", action: "clean", caption: "Clear food from spray holes" },
      { part: "middle_rack", action: "close", caption: "Push the middle rack in" },
      pullBottomRack,
      roundFilterOut,
      { part: "round_filter_scraps", action: "clean", caption: "Rinse the food off" },
      flatFilterOut,
      { part: "flat_filter_scraps", action: "clean", caption: "Brush the flat filter clean" },
      flatFilterIn,
      roundFilterIn,
      pushBottomRack,
      closeDoor,
    ],
  },
  {
    instruction: "Clear the water and the drain",
    beats: [
      openDoor,
      pullBottomRack,
      { part: "standing_water", action: "clean", caption: "Scoop out the standing water" },
      roundFilterOut,
      flatFilterOut,
      { part: "sump_debris", action: "clean", caption: "Pick out seeds and glass" },
      flatFilterIn,
      roundFilterIn,
      pushBottomRack,
      closeDoor,
      { part: "sink_drain_cap", action: "remove", caption: "Lift off the sink drain cap" },
      { part: "air_gap_food", action: "clean", caption: "Pull out the stuck food" },
      { part: "sink_drain_cap", action: "insert", caption: "Push the cap back on" },
      { part: "start_button", action: "press", caption: "Press Start to drain" },
      { part: "rinse_water", action: "open", caption: "Fresh water fills the bottom" },
      { part: "rinse_water", action: "close", caption: "It drains away: fixed" },
    ],
  },
  {
    instruction: "Fill rinse aid and dry better",
    beats: [
      openDoor,
      { part: "rinse_aid_holder", action: "remove", caption: "Turn cap left, lift off" },
      { part: "rinse_aid_bottle", action: "open", caption: "Pour to the Full mark" },
      { part: "rinse_aid_bottle", action: "close", caption: "Wipe up any spills" },
      { part: "rinse_aid_holder", action: "insert", caption: "Cap on, turn right" },
      { part: "top_small_rack", action: "open", caption: "Plastic cups go up here" },
      { part: "top_small_rack", action: "close", caption: "Push the top rack in" },
      { part: "middle_rack", action: "open", caption: "Lean glasses so water drains" },
      { part: "middle_rack", action: "close", caption: "Push the middle rack in" },
      closeDoor,
      { part: "extended_dry_button", action: "press", caption: "Press Extended Dry" },
      { part: "start_button", action: "press", caption: "Press Start" },
    ],
  },
  {
    instruction: "Clean filters and seal, vinegar wash",
    beats: [
      openDoor,
      pullBottomRack,
      roundFilterOut,
      flatFilterOut,
      { part: "flat_bottom_filter", action: "look", caption: "Rinse both under the tap" },
      flatFilterIn,
      roundFilterIn,
      { part: "rubber_door_seal", action: "look", caption: "Wipe the seal all around" },
      { part: "vinegar_cup", action: "open", caption: "Stand a cup of vinegar" },
      pushBottomRack,
      closeDoor,
      { part: "start_button", action: "press", caption: "Run an empty wash" },
    ],
  },
  {
    instruction: "Find where the door leaks",
    beats: [
      openDoor,
      { part: "rubber_door_seal", action: "look", caption: "Look along the whole seal" },
      { part: "seal_food", action: "clean", caption: "Wipe food off the seal" },
      { part: "bottom_rack", action: "open", caption: "Nothing should stick out" },
      { part: "bottom_rack", action: "close", caption: "Push the rack fully in" },
      { part: "door_vent", action: "look", caption: "Check the vent for drips" },
      closeDoor,
      { part: "bottom_front_cover", action: "remove", caption: "Take off the bottom cover" },
      { part: "front_leveling_feet", action: "look", caption: "Both feet touch the floor" },
      { part: "bottom_front_cover", action: "insert", caption: "Put the cover back" },
      { part: "start_button", action: "press", caption: "Run a short wash" },
    ],
  },
  {
    instruction: "Get it to start",
    beats: [
      openDoor,
      { part: "bottom_rack", action: "open", caption: "Check the rack faces in" },
      { part: "bottom_rack", action: "close", caption: "Slide it fully in" },
      closeDoor,
      { part: "door_latch", action: "press", caption: "Push until it clicks" },
      { part: "heat_dry_button", action: "press", caption: "Hold to unlock the buttons" },
      { part: "cancel_button", action: "press", caption: "Press Cancel once" },
      { part: "water_tap_under_sink", action: "open", caption: "Turn the water tap on" },
      { part: "start_button", action: "press", caption: "Press Start" },
    ],
  },
  {
    instruction: "Clear white film and spots",
    beats: [
      openDoor,
      pullBottomRack,
      roundFilterOut,
      { part: "round_top_filter", action: "look", caption: "Brush off white crust" },
      roundFilterIn,
      { part: "vinegar_cup", action: "open", caption: "Stand a cup of vinegar" },
      pushBottomRack,
      { part: "rinse_aid_holder", action: "remove", caption: "Turn cap left, lift off" },
      { part: "rinse_aid_bottle", action: "open", caption: "Fill to the Full mark" },
      { part: "rinse_aid_bottle", action: "close", caption: "Set the bottle aside" },
      { part: "rinse_aid_holder", action: "insert", caption: "Cap on, turn right" },
      closeDoor,
      { part: "start_button", action: "press", caption: "Run an empty wash" },
      { part: "door", action: "open", caption: "Open it when done" },
      { part: "white_film", action: "clean", caption: "The white film is gone" },
      { part: "soap_cup", action: "open", caption: "Open the soap cup" },
      { part: "soap_cup_film", action: "clean", caption: "Wipe out old soap" },
      { part: "detergent_tablet", action: "open", caption: "Drop in one tablet" },
      { part: "soap_cup", action: "close", caption: "Snap the lid shut" },
      closeDoor,
    ],
  },
];

export const rig: RigModule = { catalog: dishwasherCatalog, Model: DishwasherModel, sampleSteps };
