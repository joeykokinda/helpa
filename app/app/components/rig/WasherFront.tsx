"use client";

import { RoundedBox } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { Beat, RigCatalog } from "../../lib/rig/types";
import catalogJson from "./catalogs/washer_front_load.json";
import type { RigModule } from "./registry";
import { RigPart } from "./RigRuntime";
import { lintTexture, perforatedTexture } from "./textures";

/** Whirlpool front-load washer (WFW5720 family). Metres, origin at the floor centre, +z toward the user. */
const width = 0.686;
const height = 0.985;
const depth = 0.72;
const front = depth / 2;
const cabinetBottom = 0.03;
const doorY = 0.52;
const doorRadius = 0.265;
const openingRadius = 0.2;
const drawerCenter: [number, number] = [-0.2, 0.915];
const drawerSize: [number, number] = [0.22, 0.085];
const flapCenter: [number, number] = [0.2, 0.1];
const flapSize: [number, number] = [0.2, 0.13];
const recessDepth = 0.09;
const wallZ = -front - 0.2;
const panelBottom = cabinetBottom;
const panelTop = height - 0.011;

const catalog = catalogJson as RigCatalog;

export const enamel = { color: "#f4f5f7", roughness: 0.3, metalness: 0.04 };
export const chrome = { color: "#dfe3e8", metalness: 0.92, roughness: 0.2 };
export const rubber = { color: "#24262a", roughness: 0.85, metalness: 0 };

const textureCache = new Map<string, THREE.Texture>();

/** A cached canvas texture; every texture this rig needs is drawn here so no shared file changes. */
export function canvasTexture(key: string, canvasWidth: number, canvasHeight: number, draw: (context: CanvasRenderingContext2D) => void, repeat: [number, number] = [1, 1]) {
  const cached = textureCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  draw(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, texture);
  return texture;
}

function seededRandom(start: number) {
  let seed = start;
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

/** Blotchy dark mildew and soap scum with see-through gaps, for seals and rims. */
export function grimeTexture(tint: [number, number, number] = [44, 48, 38]) {
  return canvasTexture(`grime-${tint.join(",")}`, 256, 128, (context) => {
    const random = seededRandom(11);
    context.clearRect(0, 0, 256, 128);
    for (let blot = 0; blot < 420; blot++) {
      const x = random() * 256;
      const y = 20 + random() * 88 + (random() - 0.5) * 30;
      const shade = random() * 30;
      context.fillStyle = `rgba(${tint[0] + shade}, ${tint[1] + shade}, ${tint[2] + shade * 0.6}, ${0.35 + random() * 0.5})`;
      context.beginPath();
      context.ellipse(x, y, 1 + random() * 7, 1 + random() * 4, random() * 3, 0, Math.PI * 2);
      context.fill();
    }
    // a few brown soap-scum streaks
    for (let streak = 0; streak < 40; streak++) {
      context.strokeStyle = `rgba(120, 96, 60, ${0.3 + random() * 0.3})`;
      context.lineWidth = 2 + random() * 3;
      const x = random() * 256;
      const y = 40 + random() * 50;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + 10 + random() * 25, y + (random() - 0.5) * 8);
      context.stroke();
    }
  });
}

/** Woven cloth in a given colour, for the laundry. */
export function fabricTexture(color: string) {
  return canvasTexture(`fabric-${color}`, 64, 64, (context) => {
    context.fillStyle = color;
    context.fillRect(0, 0, 64, 64);
    context.globalAlpha = 0.18;
    for (let line = 0; line < 64; line += 2) {
      context.fillStyle = line % 4 ? "#ffffff" : "#000000";
      context.fillRect(0, line, 64, 1);
      context.fillRect(line, 0, 1, 64);
    }
    // folds
    context.globalAlpha = 0.25;
    const random = seededRandom(color.length * 97);
    for (let fold = 0; fold < 6; fold++) {
      context.fillStyle = "#000000";
      context.fillRect(0, random() * 64, 64, 2 + random() * 3);
    }
  }, [3, 3]);
}

/** Crusty white-blue detergent residue. */
export function soapTexture() {
  return canvasTexture("soap-residue", 128, 128, (context) => {
    const random = seededRandom(5);
    context.clearRect(0, 0, 128, 128);
    for (let blob = 0; blob < 260; blob++) {
      const blue = random() > 0.6;
      context.fillStyle = blue ? `rgba(110, 160, 220, ${0.5 + random() * 0.4})` : `rgba(236, 238, 230, ${0.55 + random() * 0.4})`;
      context.beginPath();
      context.arc(10 + random() * 108, 10 + random() * 108, 2 + random() * 8, 0, Math.PI * 2);
      context.fill();
    }
  });
}

/** Ribbed grey drain hose. */
export function ribbedTexture() {
  return canvasTexture(
    "ribbed-hose",
    16,
    32,
    (context) => {
      const gradient = context.createLinearGradient(0, 0, 0, 32);
      gradient.addColorStop(0, "#9aa0a6");
      gradient.addColorStop(0.5, "#5c6168");
      gradient.addColorStop(1, "#9aa0a6");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 16, 32);
    },
    [1, 70],
  );
}

/** A flat panel with holes, extruded to a small thickness and bevelled. */
export function PanelWithHoles({ panelWidth, panelHeight, thickness, holes, color = enamel.color }: { panelWidth: number; panelHeight: number; thickness: number; holes: (THREE.Path | THREE.Shape)[]; color?: string }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    const radius = 0.012;
    const [left, bottom, right, top] = [-panelWidth / 2, -panelHeight / 2, panelWidth / 2, panelHeight / 2];
    shape.moveTo(left + radius, bottom);
    shape.lineTo(right - radius, bottom);
    shape.quadraticCurveTo(right, bottom, right, bottom + radius);
    shape.lineTo(right, top - radius);
    shape.quadraticCurveTo(right, top, right - radius, top);
    shape.lineTo(left + radius, top);
    shape.quadraticCurveTo(left, top, left, top - radius);
    shape.lineTo(left, bottom + radius);
    shape.quadraticCurveTo(left, bottom, left + radius, bottom);
    shape.holes.push(...holes);
    return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 64 });
  }, [panelWidth, panelHeight, thickness, holes]);
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={enamel.roughness} metalness={enamel.metalness} />
    </mesh>
  );
}

export function circle(x: number, y: number, radius: number) {
  const path = new THREE.Path();
  path.absarc(x, y, radius, 0, Math.PI * 2, true);
  return path;
}

export function rectangle(x: number, y: number, rectWidth: number, rectHeight: number) {
  const path = new THREE.Path();
  path.moveTo(x - rectWidth / 2, y - rectHeight / 2);
  path.lineTo(x - rectWidth / 2, y + rectHeight / 2);
  path.lineTo(x + rectWidth / 2, y + rectHeight / 2);
  path.lineTo(x + rectWidth / 2, y - rectHeight / 2);
  path.closePath();
  return path;
}

/** A smooth tube through a list of points. */
export function Tube({ points, radius, color = "#1d1f22", map, roughness = 0.6, metalness = 0 }: { points: [number, number, number][]; radius: number; color?: string; map?: THREE.Texture; roughness?: number; metalness?: number }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point))), [points]);
  return (
    <mesh castShadow>
      <tubeGeometry args={[curve, 64, radius, 16, false]} />
      <meshStandardMaterial color={color} map={map} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}

/** A dark open box seen from inside: the cavity behind a drawer or flap. */
export function Cavity({ position, size }: { position: [number, number, number]; size: [number, number, number] }) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color="#3a3e44" roughness={0.9} side={THREE.BackSide} />
    </mesh>
  );
}

/** A hose bib on the wall: static body and spout, and a round handle that is the movable part. */
export function WallTap({ id, x, y, z, handleColor }: { id: string; x: number; y: number; z: number; handleColor: string }) {
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0, 0.004]}>
        <cylinderGeometry args={[0.03, 0.03, 0.008, 32]} />
        <meshStandardMaterial {...chrome} />
      </mesh>
      <mesh position={[0, 0, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.011, 0.011, 0.05, 20]} />
        <meshStandardMaterial color="#c9a45c" metalness={0.85} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.055]}>
        <sphereGeometry args={[0.02, 24, 16]} />
        <meshStandardMaterial color="#c9a45c" metalness={0.85} roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.032, 0.055]}>
        <cylinderGeometry args={[0.012, 0.012, 0.035, 20]} />
        <meshStandardMaterial color="#c9a45c" metalness={0.85} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.078]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.005, 0.005, 0.03, 12]} />
        <meshStandardMaterial {...chrome} />
      </mesh>
      <RigPart id={id} position={[0, 0, 0.092]}>
        <mesh>
          <torusGeometry args={[0.028, 0.0065, 12, 40]} />
          <meshStandardMaterial color={handleColor} roughness={0.35} />
        </mesh>
        {[0, Math.PI / 2].map((angle) => (
          <mesh key={angle} rotation={[0, 0, angle]}>
            <boxGeometry args={[0.056, 0.008, 0.006]} />
            <meshStandardMaterial color={handleColor} roughness={0.35} />
          </mesh>
        ))}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.003]}>
          <cylinderGeometry args={[0.009, 0.009, 0.008, 20]} />
          <meshStandardMaterial {...chrome} />
        </mesh>
      </RigPart>
    </group>
  );
}

/** Four screw feet. The front-right foot and its lock nut are the movable parts. */
export function LevelingFeet({ halfX, halfZ, bottom }: { halfX: number; halfZ: number; bottom: number }) {
  const foot = (
    <>
      <mesh position={[0, 0.005, 0]} castShadow>
        <cylinderGeometry args={[0.022, 0.024, 0.01, 28]} />
        <meshStandardMaterial {...rubber} />
      </mesh>
      <mesh position={[0, (bottom + 0.01) / 2, 0]}>
        <cylinderGeometry args={[0.008, 0.008, bottom - 0.01, 16]} />
        <meshStandardMaterial color="#9da3aa" metalness={0.8} roughness={0.35} />
      </mesh>
      {/* a flat on the pad so turning shows */}
      <mesh position={[0.016, 0.006, 0]}>
        <boxGeometry args={[0.012, 0.004, 0.006]} />
        <meshStandardMaterial color="#5a5e64" roughness={0.6} />
      </mesh>
    </>
  );
  const nut = (
    <mesh position={[0, bottom - 0.006, 0]}>
      <cylinderGeometry args={[0.016, 0.016, 0.008, 6]} />
      <meshStandardMaterial color="#b5bbc2" metalness={0.85} roughness={0.3} />
    </mesh>
  );
  return (
    <>
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
      ].map(([x, z]) => (
        <group key={`${x}${z}`} position={[x * halfX, 0, z * halfZ]}>
          {foot}
          {nut}
        </group>
      ))}
      <RigPart id="leveling_feet" position={[halfX, 0, halfZ]}>
        {foot}
      </RigPart>
      <RigPart id="foot_lock_nut" position={[halfX, 0, halfZ]}>
        {nut}
      </RigPart>
    </>
  );
}

/** A heap of clothes: squashed blobs of cloth in a few colours. */
export function ClothesHeap({ blobs }: { blobs: { position: [number, number, number]; scale: [number, number, number]; color: string; tilt?: number }[] }) {
  return (
    <>
      {blobs.map((blob, index) => (
        <mesh key={index} position={blob.position} scale={blob.scale} rotation={[blob.tilt ?? 0, index * 0.9, (blob.tilt ?? 0) * 0.5]} castShadow>
          <sphereGeometry args={[1, 28, 16]} />
          <meshStandardMaterial map={fabricTexture(blob.color)} roughness={0.95} />
        </mesh>
      ))}
    </>
  );
}

/** Power outlet on the wall and the washer's plug, which pulls straight out. */
export function OutletAndPlug({ x, y, z, cordTo }: { x: number; y: number; z: number; cordTo: [number, number, number] }) {
  const cord = useMemo<[number, number, number][]>(() => [[x, y, z + 0.06], [x, y - 0.06, z + 0.09], [(x + cordTo[0]) / 2, (y + cordTo[1]) / 2 - 0.05, (z + cordTo[2]) / 2 + 0.03], cordTo], [x, y, z, cordTo]);
  return (
    <group>
      <mesh position={[x, y, z + 0.004]}>
        <boxGeometry args={[0.075, 0.115, 0.008]} />
        <meshStandardMaterial color="#f7f6f2" roughness={0.5} />
      </mesh>
      <RigPart id="power_cord" position={[x, y, z + 0.026]}>
        <RoundedBox args={[0.045, 0.055, 0.036]} radius={0.008}>
          <meshStandardMaterial color="#2c2f34" roughness={0.6} />
        </RoundedBox>
        <mesh position={[0, 0, 0.026]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.007, 0.009, 0.02, 12]} />
          <meshStandardMaterial color="#2c2f34" roughness={0.6} />
        </mesh>
      </RigPart>
      <Tube points={cord} radius={0.005} color="#2c2f34" />
    </group>
  );
}

/** The back wall behind the machine, one-sided so the camera can look through it from behind. */
export function BackWall({ z }: { z: number }) {
  return (
    <mesh position={[0, 1.1, z]} receiveShadow>
      <planeGeometry args={[3.2, 2.2]} />
      <meshBasicMaterial color="#f3efe9" />
    </mesh>
  );
}

function controlStripTexture() {
  // Strip spans x -0.075..0.33 and y 0.8725..0.9575 on the front panel.
  return canvasTexture("wfw-controls", 1024, 216, (context) => {
    const toX = (x: number) => ((x + 0.075) / 0.405) * 1024;
    const toY = (y: number) => ((0.9575 - y) / 0.085) * 216;
    const gradient = context.createLinearGradient(0, 0, 0, 216);
    gradient.addColorStop(0, "#d9dde2");
    gradient.addColorStop(1, "#c4c9cf");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1024, 216);
    // cycle names on both sides of the knob, with dots on an arc
    const knobX = toX(0.01);
    const knobY = toY(0.915);
    context.fillStyle = "#3b4048";
    for (let tick = 0; tick < 11; tick++) {
      const angle = Math.PI * 0.75 + (tick / 10) * Math.PI * 1.5;
      context.beginPath();
      context.arc(knobX + Math.cos(angle) * 100, knobY + Math.sin(angle) * 100, tick === 5 ? 5 : 3.5, 0, Math.PI * 2);
      context.fill();
    }
    context.font = "600 17px sans-serif";
    context.textAlign = "right";
    ["Normal", "Heavy Duty", "Whites", "Bulky", "Delicates"].forEach((label, index) => context.fillText(label, knobX - 112, 40 + index * 36));
    context.textAlign = "left";
    ["Quick Wash", "Rinse & Spin", "Drain & Spin", "Clean Washer", "Towels"].forEach((label, index) => context.fillText(label, knobX + 112, 40 + index * 36));
    // display
    context.fillStyle = "#1c2026";
    context.beginPath();
    context.roundRect(toX(0.09), toY(0.952), toX(0.31) - toX(0.09), toY(0.918) - toY(0.952), 10);
    context.fill();
    context.fillStyle = "#9fe3ff";
    context.font = "700 46px monospace";
    context.textAlign = "center";
    context.fillText("0:48", toX(0.2), toY(0.925));
    context.font = "600 14px sans-serif";
    context.fillStyle = "#6f8796";
    context.fillText("TEMP  ·  SPIN  ·  SOIL", toX(0.2), toY(0.948) + 12);
    // button labels
    context.fillStyle = "#30343b";
    context.font = "600 17px sans-serif";
    context.fillText("Power", toX(0.115), toY(0.878));
    context.fillText("Control Lock", toX(0.195), toY(0.878));
    context.fillText("Start/Pause", toX(0.28), toY(0.878));
  });
}

function Cabinet() {
  const panelHeight = panelTop - panelBottom;
  const panelCenterY = (panelTop + panelBottom) / 2;
  const frontHoles = useMemo(
    () => [
      circle(0, doorY - panelCenterY, openingRadius),
      rectangle(drawerCenter[0], drawerCenter[1] - panelCenterY, drawerSize[0], drawerSize[1]),
      rectangle(flapCenter[0], flapCenter[1] - panelCenterY, flapSize[0], flapSize[1]),
    ],
    [panelCenterY],
  );
  const controls = useMemo(() => controlStripTexture(), []);
  return (
    <group>
      <group position={[0, panelCenterY, front - 0.012]}>
        <PanelWithHoles panelWidth={width} panelHeight={panelHeight} thickness={0.012} holes={frontHoles} />
      </group>
      {/* the top, a part so a beginner can be told to check it with a level */}
      <RigPart id="washer_top">
        <RoundedBox args={[width + 0.004, 0.022, depth + 0.006]} radius={0.008} position={[0, height - 0.011, 0]} castShadow receiveShadow>
          <meshStandardMaterial {...enamel} />
        </RoundedBox>
      </RigPart>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[(side * (width - 0.012)) / 2, (panelTop + panelBottom) / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.012, panelHeight, depth]} />
          <meshStandardMaterial {...enamel} />
        </mesh>
      ))}
      <mesh position={[0, panelCenterY, -front + 0.006]}>
        <boxGeometry args={[width - 0.02, panelHeight, 0.012]} />
        <meshStandardMaterial color="#d7dadf" roughness={0.6} />
      </mesh>
      {/* control strip */}
      <RoundedBox args={[0.405, 0.085, 0.006]} radius={0.003} position={[0.1275, 0.915, front + 0.003]}>
        <meshStandardMaterial color="#cdd2d8" metalness={0.4} roughness={0.35} />
      </RoundedBox>
      <mesh position={[0.1275, 0.915, front + 0.0062]}>
        <planeGeometry args={[0.399, 0.079]} />
        <meshStandardMaterial map={controls} roughness={0.4} />
      </mesh>
      {/* cavities behind the drawer and the filter flap */}
      <Cavity position={[drawerCenter[0], drawerCenter[1], front - 0.17]} size={[drawerSize[0] + 0.004, drawerSize[1] + 0.004, 0.34]} />
      <Cavity position={[flapCenter[0], flapCenter[1], front - 0.012 - recessDepth / 2]} size={[flapSize[0], flapSize[1], recessDepth]} />
      {/* door hinge knuckles */}
      {[-0.11, 0.11].map((offset) => (
        <RoundedBox key={offset} args={[0.03, 0.05, 0.03]} radius={0.008} position={[-0.29, doorY + offset, front + 0.012]}>
          <meshStandardMaterial {...chrome} />
        </RoundedBox>
      ))}
      {/* tiny drain hose clip in the recess */}
      <mesh position={[0.135, 0.084, front - 0.06]}>
        <boxGeometry args={[0.034, 0.008, 0.012]} />
        <meshStandardMaterial color="#121315" roughness={0.7} />
      </mesh>
    </group>
  );
}

function DoorSeal() {
  const profile = useMemo(
    () =>
      [
        [0.214, 0.006],
        [0.204, 0.003],
        [0.199, -0.008],
        [0.201, -0.025],
        [0.214, -0.04],
        [0.226, -0.055],
        [0.222, -0.07],
        [0.207, -0.083],
        [0.209, -0.097],
        [0.226, -0.107],
        [0.248, -0.112],
      ].map(([radius, z]) => new THREE.Vector2(radius, z)),
    [],
  );
  const grimeProfile = useMemo(() => profile.slice(3, 8).map((point) => new THREE.Vector2(point.x - 0.0025, point.y)), [profile]);
  const grime = useMemo(() => grimeTexture(), []);
  return (
    <RigPart id="door_seal" position={[0, doorY, front]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <latheGeometry args={[profile, 96]} />
        <meshStandardMaterial color="#8e959d" roughness={0.82} side={THREE.DoubleSide} />
      </mesh>
      {/* black mildew and soap scum in the bottom folds */}
      <RigPart id="seal_grime" position={[0, -0.21, -0.05]}>
        <group position={[0, 0.21, 0.05]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <latheGeometry args={[grimeProfile, 48, -1.15, 2.3]} />
            <meshStandardMaterial map={grime} transparent alphaTest={0.05} roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
        </group>
      </RigPart>
      {/* a sock, a coin and a hair grip caught in the fold */}
      <RigPart id="seal_items" position={[0, -0.212, -0.055]}>
        <mesh position={[-0.05, 0, 0]} rotation={[0.2, 0.3, Math.PI / 2 - 0.15]}>
          <capsuleGeometry args={[0.011, 0.05, 6, 12]} />
          <meshStandardMaterial map={fabricTexture("#c77d8e")} roughness={0.95} />
        </mesh>
        <mesh position={[0.045, -0.006, 0.005]} rotation={[0.2, 0, 0.05]}>
          <cylinderGeometry args={[0.012, 0.012, 0.002, 28]} />
          <meshStandardMaterial color="#d2a24c" metalness={0.9} roughness={0.3} />
        </mesh>
        <mesh position={[0.075, -0.003, -0.01]} rotation={[0, 0.6, 0.1]}>
          <boxGeometry args={[0.04, 0.002, 0.004]} />
          <meshStandardMaterial color="#15161a" roughness={0.5} />
        </mesh>
      </RigPart>
    </RigPart>
  );
}

function Drum() {
  const perforated = useMemo(() => perforatedTexture(), []);
  const drumRadius = 0.25;
  const drumDepth = 0.5;
  return (
    <group position={[0, doorY, front - 0.112]}>
      <RigPart id="washer_drum">
        <mesh position={[0, 0, -drumDepth / 2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[drumRadius, drumRadius, drumDepth, 72, 1, true]} />
          <meshStandardMaterial map={perforated} side={THREE.BackSide} metalness={0.6} roughness={0.32} />
        </mesh>
        <mesh position={[0, 0, -drumDepth]}>
          <circleGeometry args={[drumRadius, 72]} />
          <meshStandardMaterial map={perforated} metalness={0.6} roughness={0.36} />
        </mesh>
        {/* hub on the back wall */}
        <mesh position={[0, 0, -drumDepth + 0.01]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.06, 0.07, 0.02, 40]} />
          <meshStandardMaterial color="#b8bec5" metalness={0.8} roughness={0.25} />
        </mesh>
        {/* stainless front lip */}
        <mesh position={[0, 0, -0.002]}>
          <ringGeometry args={[0.2, drumRadius, 72]} />
          <meshStandardMaterial color="#c9ced4" metalness={0.85} roughness={0.25} side={THREE.DoubleSide} />
        </mesh>
        {/* three lifters that tumble the clothes */}
        {[0, 1, 2].map((index) => {
          const angle = (index / 3) * Math.PI * 2 + Math.PI / 2;
          return (
            <mesh key={index} position={[Math.cos(angle) * (drumRadius - 0.025), Math.sin(angle) * (drumRadius - 0.025), -drumDepth / 2 - 0.01]} rotation={[0, 0, angle]}>
              <boxGeometry args={[0.05, 0.05, drumDepth - 0.04]} />
              <meshStandardMaterial color="#d4d9de" metalness={0.75} roughness={0.25} />
            </mesh>
          );
        })}
      </RigPart>
      <RigPart id="laundry" position={[0, -0.185, -0.2]}>
        <ClothesHeap
          blobs={[
            { position: [-0.07, 0, -0.06], scale: [0.11, 0.05, 0.09], color: "#3f5f8f", tilt: 0.2 },
            { position: [0.08, 0.005, 0], scale: [0.1, 0.05, 0.1], color: "#f1efe9", tilt: -0.15 },
            { position: [0.0, 0.03, 0.06], scale: [0.09, 0.045, 0.07], color: "#c0504d", tilt: 0.3 },
            { position: [-0.02, 0.02, -0.16], scale: [0.12, 0.05, 0.08], color: "#7d8a74", tilt: -0.2 },
            { position: [0.1, 0.02, -0.14], scale: [0.07, 0.04, 0.07], color: "#e3c565", tilt: 0.1 },
          ]}
        />
      </RigPart>
    </group>
  );
}

function Door() {
  const ringGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, doorRadius, 0, Math.PI * 2, false);
    shape.holes.push(circle(0, 0, 0.19));
    return new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 3, curveSegments: 96 });
  }, []);
  // A glass bowl that reaches into the seal: base radius 0.185, 0.07 deep.
  const bowlRadius = 0.28;
  const bowlAngle = Math.asin(0.185 / bowlRadius);
  const bowlCenterZ = -0.07 + bowlRadius;
  return (
    <RigPart id="washer_door" position={[0, doorY, front + 0.004]}>
      <mesh geometry={ringGeometry} castShadow>
        <meshStandardMaterial color="#eef0f3" roughness={0.25} metalness={0.1} />
      </mesh>
      {/* chrome bezels */}
      <mesh position={[0, 0, 0.037]}>
        <torusGeometry args={[0.194, 0.007, 16, 96]} />
        <meshStandardMaterial {...chrome} />
      </mesh>
      <mesh position={[0, 0, 0.018]}>
        <torusGeometry args={[doorRadius + 0.002, 0.006, 12, 96]} />
        <meshStandardMaterial color="#b9c0c8" metalness={0.9} roughness={0.25} />
      </mesh>
      {/* smoked glass, flat front and the bowl behind */}
      <mesh position={[0, 0, 0.03]}>
        <circleGeometry args={[0.19, 72]} />
        <meshStandardMaterial color="#56708a" roughness={0.04} metalness={0.3} transparent opacity={0.32} />
      </mesh>
      <mesh position={[0, 0, bowlCenterZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <sphereGeometry args={[bowlRadius, 64, 12, 0, Math.PI * 2, 0, bowlAngle]} />
        <meshStandardMaterial color="#6b8aa6" roughness={0.05} metalness={0.2} transparent opacity={0.28} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* grey inner trim that presses on the seal */}
      <mesh position={[0, 0, -0.004]}>
        <torusGeometry args={[0.205, 0.01, 12, 72]} />
        <meshStandardMaterial color="#9aa1a9" roughness={0.6} />
      </mesh>
      {/* pull handle on the right edge */}
      <mesh position={[0, 0, 0.044]} rotation={[0, 0, -0.32]}>
        <torusGeometry args={[0.236, 0.011, 10, 24, 0.64]} />
        <meshStandardMaterial {...chrome} />
      </mesh>
      {/* hinge arm */}
      <mesh position={[-doorRadius - 0.012, 0, 0.012]}>
        <boxGeometry args={[0.03, 0.2, 0.02]} />
        <meshStandardMaterial {...chrome} />
      </mesh>
    </RigPart>
  );
}

function DetergentDrawer() {
  const residue = useMemo(() => soapTexture(), []);
  const trayDepth = 0.3;
  const trayWidth = drawerSize[0] - 0.012;
  const trayHeight = drawerSize[1] - 0.014;
  const wall = 0.004;
  const plastic = { color: "#eef0f2", roughness: 0.45 };
  // Walls of the open-top tray: floor, sides, back, and dividers that make the cups.
  const boxes: { position: [number, number, number]; size: [number, number, number]; color?: string }[] = [
    { position: [0, -trayHeight / 2, -trayDepth / 2], size: [trayWidth, wall, trayDepth] },
    { position: [-trayWidth / 2, 0, -trayDepth / 2], size: [wall, trayHeight, trayDepth] },
    { position: [trayWidth / 2, 0, -trayDepth / 2], size: [wall, trayHeight, trayDepth] },
    { position: [0, 0, -trayDepth], size: [trayWidth, trayHeight, wall] },
    // main wash on the left, bleach front right, softener back right
    { position: [0.03, -0.004, -0.13], size: [wall, trayHeight - 0.008, 0.25] },
    { position: [0.07, -0.004, -0.13], size: [0.08, trayHeight - 0.008, wall] },
    { position: [0, -0.004, -0.255], size: [trayWidth, trayHeight - 0.008, wall] },
  ];
  return (
    <RigPart id="detergent_drawer" position={[drawerCenter[0], drawerCenter[1], front]}>
      <RoundedBox args={[drawerSize[0] - 0.004, drawerSize[1] - 0.004, 0.018]} radius={0.005} position={[0, 0, 0.001]} castShadow>
        <meshStandardMaterial {...enamel} />
      </RoundedBox>
      {/* finger pull */}
      <mesh position={[0, -0.03, 0.011]}>
        <boxGeometry args={[0.11, 0.012, 0.004]} />
        <meshStandardMaterial color="#9ba1a8" roughness={0.5} />
      </mesh>
      {boxes.map((box, index) => (
        <mesh key={index} position={box.position}>
          <boxGeometry args={box.size} />
          <meshStandardMaterial {...plastic} />
        </mesh>
      ))}
      {/* coloured cup markers: blue for bleach, pale blue for softener, a release tab */}
      <mesh position={[0.07, trayHeight / 2 - 0.006, -0.07]}>
        <boxGeometry args={[0.07, 0.004, 0.03]} />
        <meshStandardMaterial color="#5b8fd9" roughness={0.4} />
      </mesh>
      <mesh position={[0.07, trayHeight / 2 - 0.006, -0.2]}>
        <boxGeometry args={[0.07, 0.004, 0.03]} />
        <meshStandardMaterial color="#9fc6ef" roughness={0.4} />
      </mesh>
      <mesh position={[-0.03, -trayHeight / 2 + 0.01, -0.27]}>
        <boxGeometry args={[0.03, 0.016, 0.012]} />
        <meshStandardMaterial color="#2f6fdb" roughness={0.4} />
      </mesh>
      <RigPart id="drawer_residue" position={[-0.04, -trayHeight / 2 + 0.004, -0.1]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.13, 0.17]} />
          <meshStandardMaterial map={residue} transparent alphaTest={0.05} roughness={0.95} />
        </mesh>
        {[-0.045, 0.02].map((x) => (
          <mesh key={x} position={[x, 0.004, 0.02 - x]} scale={[0.02, 0.005, 0.03]}>
            <sphereGeometry args={[1, 16, 8]} />
            <meshStandardMaterial color="#d9e3ee" roughness={0.9} />
          </mesh>
        ))}
      </RigPart>
    </RigPart>
  );
}

function Controls() {
  return (
    <group>
      <RigPart id="cycle_knob" position={[0.01, 0.915, front + 0.006]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.016]} castShadow>
          <cylinderGeometry args={[0.032, 0.035, 0.032, 56]} />
          <meshStandardMaterial color="#c5cbd2" metalness={0.85} roughness={0.28} />
        </mesh>
        <mesh position={[0, 0, 0.0325]}>
          <circleGeometry args={[0.028, 48]} />
          <meshStandardMaterial color="#e6e9ed" metalness={0.7} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0.019, 0.034]}>
          <boxGeometry args={[0.005, 0.016, 0.002]} />
          <meshStandardMaterial color="#2f6fdb" />
        </mesh>
      </RigPart>
      {[
        { id: "power_button", x: 0.115, color: "#ffffff" },
        { id: "control_lock_button", x: 0.195, color: "#ffffff" },
        { id: "start_button", x: 0.28, color: "#e8f0ff" },
      ].map((button) => (
        <RigPart key={button.id} id={button.id} position={[button.x, 0.895, front + 0.006]}>
          <RoundedBox args={[button.id === "start_button" ? 0.05 : 0.04, 0.016, 0.008]} radius={0.004} position={[0, 0, 0.004]}>
            <meshStandardMaterial color={button.color} roughness={0.35} />
          </RoundedBox>
          {button.id === "start_button" && (
            <mesh position={[0, 0, 0.0085]}>
              <planeGeometry args={[0.03, 0.003]} />
              <meshStandardMaterial color="#2f6fdb" />
            </mesh>
          )}
        </RigPart>
      ))}
    </group>
  );
}

function DrainPumpFilterArea() {
  const lint = useMemo(() => lintTexture(), []);
  const flapThickness = 0.012;
  return (
    <group>
      <RigPart id="filter_access_door" position={[flapCenter[0], flapCenter[1], front]}>
        <RoundedBox args={[flapSize[0] - 0.004, flapSize[1] - 0.004, flapThickness]} radius={0.004} position={[0, 0, -flapThickness / 2 + 0.002]} castShadow>
          <meshStandardMaterial {...enamel} />
        </RoundedBox>
        {/* finger notch on the top edge */}
        <mesh position={[0, flapSize[1] / 2 - 0.01, 0.0025]}>
          <boxGeometry args={[0.05, 0.008, 0.002]} />
          <meshStandardMaterial color="#9ba1a8" roughness={0.5} />
        </mesh>
      </RigPart>

      {/* small drain hose, angled slightly down, with its cap */}
      <RigPart id="small_drain_hose" position={[0.135, 0.09, front - 0.035]} rotation={[0.22, 0, 0]}>
        <mesh position={[0, 0, -0.13]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.0105, 0.0105, 0.26, 20]} />
          <meshStandardMaterial color="#17181b" roughness={0.55} />
        </mesh>
        <RigPart id="drain_hose_cap">
          <mesh position={[0, 0, 0.008]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.0135, 0.0135, 0.026, 20]} />
            <meshStandardMaterial color="#e2e5e8" roughness={0.45} />
          </mesh>
          <mesh position={[0, 0, 0.024]}>
            <torusGeometry args={[0.008, 0.0025, 8, 20]} />
            <meshStandardMaterial color="#e2e5e8" roughness={0.45} />
          </mesh>
        </RigPart>
      </RigPart>

      {/* the drain pump filter: cap and barrel slide out; the grip handle twists to unlock */}
      <RigPart id="drain_pump_filter" position={[0.248, flapCenter[1], front - 0.09]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.012]} castShadow>
          <cylinderGeometry args={[0.045, 0.045, 0.024, 48]} />
          <meshStandardMaterial color="#e4e6e9" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0, 0.0245]}>
          <ringGeometry args={[0.034, 0.042, 48]} />
          <meshStandardMaterial color="#c3c8ce" roughness={0.4} />
        </mesh>
        {/* barrel with slots */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.07]}>
          <cylinderGeometry args={[0.034, 0.03, 0.14, 32]} />
          <meshStandardMaterial color="#d6dade" roughness={0.45} />
        </mesh>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <mesh key={index} rotation={[Math.PI / 2, 0, (index / 6) * Math.PI * 2]} position={[0, 0, -0.075]}>
            <boxGeometry args={[0.072, 0.008, 0.11]} />
            <meshStandardMaterial color="#c4c9cf" roughness={0.45} />
          </mesh>
        ))}
        <RigPart id="drain_filter_handle" position={[0, 0, 0.024]}>
          <RoundedBox args={[0.016, 0.074, 0.022]} radius={0.005} position={[0, 0, 0.011]}>
            <meshStandardMaterial color="#d9dce0" roughness={0.35} />
          </RoundedBox>
          <mesh position={[0, 0.03, 0.0225]}>
            <coneGeometry args={[0.006, 0.01, 3]} />
            <meshStandardMaterial color="#2f6fdb" />
          </mesh>
        </RigPart>
        {/* lint wrapped round the barrel, two coins and a hair grip */}
        <RigPart id="filter_debris" position={[0, 0, -0.07]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.01]}>
            <cylinderGeometry args={[0.044, 0.04, 0.09, 24, 1, true]} />
            <meshStandardMaterial map={lint} transparent alphaTest={0.08} roughness={1} side={THREE.DoubleSide} color="#b9b4ae" />
          </mesh>
          {[
            { position: [0.03, 0.035, 0.03] as [number, number, number], color: "#d2a24c" },
            { position: [-0.03, 0.04, -0.01] as [number, number, number], color: "#c8ccd0" },
          ].map((coin) => (
            <mesh key={coin.color} position={coin.position} rotation={[0.5, 0.3, 0.6]}>
              <cylinderGeometry args={[0.012, 0.012, 0.0022, 28]} />
              <meshStandardMaterial color={coin.color} metalness={0.9} roughness={0.3} />
            </mesh>
          ))}
          <mesh position={[0.0, 0.046, 0.0]} rotation={[0, 0.8, 0]}>
            <boxGeometry args={[0.05, 0.002, 0.005]} />
            <meshStandardMaterial color="#15161a" roughness={0.5} />
          </mesh>
          {[-0.03, 0.035].map((x) => (
            <mesh key={x} position={[x, -0.035, 0.02]} scale={[0.02, 0.015, 0.025]}>
              <sphereGeometry args={[1, 14, 10]} />
              <meshStandardMaterial map={lint} color="#a8a29a" roughness={1} />
            </mesh>
          ))}
        </RigPart>
      </RigPart>
    </group>
  );
}

const taps = [
  { id: "hot_water_tap", x: -0.19, band: "#c8402f" },
  { id: "cold_water_tap", x: -0.08, band: "#2f6fc8" },
];
const standpipe: [number, number, number] = [0.2, 0, wallZ + 0.05];

function BehindTheWasher() {
  const ribbed = useMemo(() => ribbedTexture(), []);
  const hoses = useMemo(
    () =>
      taps.map(
        (tap) =>
          [
            [tap.x, 1.068, wallZ + 0.055],
            [tap.x, 1.0, wallZ + 0.06],
            [tap.x + 0.02, 0.92, -front - 0.1],
            [tap.x, 0.865, -front - 0.04],
            [tap.x, 0.86, -front - 0.012],
          ] as [number, number, number][],
      ),
    [],
  );
  const drainHose = useMemo<[number, number, number][]>(
    () => [
      [0.17, 0.2, -front],
      [0.17, 0.2, -front - 0.06],
      [0.19, 0.45, -front - 0.1],
      [0.2, 0.9, standpipe[2] + 0.04],
      [0.2, 1.0, standpipe[2] + 0.03],
      [0.2, 1.01, standpipe[2] + 0.002],
      [0.2, 0.96, standpipe[2]],
      [0.2, 0.86, standpipe[2]],
    ],
    [],
  );
  return (
    <group>
      <BackWall z={wallZ} />
      {taps.map((tap) => (
        <WallTap key={tap.id} id={tap.id} x={tap.x} y={1.12} z={wallZ} handleColor={tap.band} />
      ))}
      <RigPart id="water_inlet_hoses">
        {hoses.map((points, index) => (
          <group key={index}>
            <Tube points={points} radius={0.011} color="#1d1f22" />
            {/* coloured bands and brass couplings at both ends */}
            <mesh position={points[0]}>
              <cylinderGeometry args={[0.016, 0.016, 0.02, 6]} />
              <meshStandardMaterial color="#c9a45c" metalness={0.85} roughness={0.3} />
            </mesh>
            <mesh position={[points[4][0], points[4][1], points[4][2] - 0.008]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.016, 0.016, 0.02, 6]} />
              <meshStandardMaterial color="#c9a45c" metalness={0.85} roughness={0.3} />
            </mesh>
            <mesh position={[points[3][0], points[3][1], points[3][2] - 0.01]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.0125, 0.0125, 0.02, 16]} />
              <meshStandardMaterial color={taps[index].band} roughness={0.5} />
            </mesh>
          </group>
        ))}
      </RigPart>
      {/* drain standpipe with the main drain hose hooked loosely into it */}
      <mesh position={[standpipe[0], 0.47, standpipe[2]]}>
        <cylinderGeometry args={[0.025, 0.025, 0.94, 32, 1, true]} />
        <meshStandardMaterial color="#f0f0ec" roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <RigPart id="main_drain_hose">
        <Tube points={drainHose} radius={0.014} map={ribbed} color="#c4c8cd" roughness={0.5} />
      </RigPart>
      <OutletAndPlug x={-0.32} y={0.45} z={wallZ} cordTo={[-0.29, 0.78, -front - 0.005]} />
    </group>
  );
}

export function WasherFrontModel() {
  return (
    <group>
      <Cabinet />
      <DoorSeal />
      <Drum />
      <Door />
      <DetergentDrawer />
      <Controls />
      <DrainPumpFilterArea />
      <BehindTheWasher />
      <LevelingFeet halfX={width / 2 - 0.055} halfZ={front - 0.06} bottom={cabinetBottom} />
    </group>
  );
}

const sampleSteps: { instruction: string; beats: Beat[] }[] = [
  {
    instruction: "Clear the drain pump filter",
    beats: [
      { part: "power_cord", action: "remove", caption: "Unplug the washer" },
      { part: "filter_access_door", action: "open", caption: "Open the bottom flap" },
      { part: "small_drain_hose", action: "remove", caption: "Pull out the small hose" },
      { part: "drain_hose_cap", action: "remove", caption: "Pull the cap, drain into pan" },
      { part: "drain_hose_cap", action: "insert", caption: "Cap it when water stops" },
      { part: "drain_filter_handle", action: "unlock", caption: "Twist the filter left" },
      { part: "drain_pump_filter", action: "remove", caption: "Pull the filter out" },
      { part: "filter_debris", action: "clean", caption: "Pick off lint and coins" },
      { part: "drain_pump_filter", action: "insert", caption: "Push the filter back in" },
      { part: "drain_filter_handle", action: "lock", caption: "Twist right until upright" },
      { part: "small_drain_hose", action: "insert", caption: "Tuck the hose back" },
      { part: "filter_access_door", action: "close", caption: "Close the flap" },
      { part: "main_drain_hose", action: "look", caption: "Hose sits loosely in pipe" },
      { part: "power_cord", action: "insert", caption: "Plug it back in" },
    ],
  },
  {
    instruction: "Level the washer so it stops shaking",
    beats: [
      { part: "washer_door", action: "look", caption: "Empty the drum, shut door" },
      { part: "washer_top", action: "look", caption: "Rock corners, feel for wobble" },
      { part: "washer_top", action: "look", caption: "Set a level on top" },
      { part: "leveling_feet", action: "turn", caption: "Turn the low foot" },
      { part: "foot_lock_nut", action: "turn", caption: "Tighten nut up to washer" },
      { part: "washer_top", action: "look", caption: "Rock again and recheck" },
    ],
  },
  {
    instruction: "Get the washer to start",
    beats: [
      { part: "washer_door", action: "open", caption: "Open the door" },
      { part: "door_seal", action: "look", caption: "Nothing caught in the seal" },
      { part: "washer_door", action: "close", caption: "Push shut until it clicks" },
      { part: "control_lock_button", action: "press", caption: "Hold Control Lock 3 seconds" },
      { part: "hot_water_tap", action: "look", caption: "Both taps fully on" },
      { part: "start_button", action: "press", caption: "Hold Start 3 seconds" },
      { part: "power_cord", action: "remove", caption: "Unplug, wait five minutes" },
      { part: "power_cord", action: "insert", caption: "Plug back in, try again" },
    ],
  },
  {
    instruction: "Unlock a door that will not open",
    beats: [
      { part: "power_button", action: "press", caption: "Press Power once" },
      { part: "washer_door", action: "look", caption: "Wait ten minutes, don't unplug" },
      { part: "hot_water_tap", action: "open", caption: "Open the hot tap fully" },
      { part: "cold_water_tap", action: "open", caption: "Open the cold tap fully" },
      { part: "water_inlet_hoses", action: "look", caption: "Straighten any kinked hoses" },
      { part: "washer_door", action: "open", caption: "Lock light off? Pull open" },
      { part: "cycle_knob", action: "turn", caption: "Run Drain and Spin empty" },
    ],
  },
  {
    instruction: "Clean out a smelly washer",
    beats: [
      { part: "laundry", action: "clean", caption: "Take out all the clothes" },
      { part: "washer_drum", action: "look", caption: "Drop a tablet in drum" },
      { part: "washer_door", action: "close", caption: "Shut door until it clicks" },
      { part: "cycle_knob", action: "turn", caption: "Turn to Clean Washer" },
      { part: "start_button", action: "press", caption: "Hold Start 3 seconds" },
      { part: "washer_door", action: "open", caption: "After the cycle, open door" },
      { part: "seal_grime", action: "clean", caption: "Wipe grime from seal folds" },
      { part: "washer_door", action: "look", caption: "Leave it ajar to dry" },
    ],
  },
  {
    instruction: "Stop a leak at the front",
    beats: [
      { part: "hot_water_tap", action: "close", caption: "Turn the hot tap off" },
      { part: "cold_water_tap", action: "close", caption: "Turn the cold tap off" },
      { part: "door_seal", action: "look", caption: "Wipe the seal and glass" },
      { part: "seal_items", action: "clean", caption: "Pull out stuck socks, coins" },
      { part: "detergent_drawer", action: "remove", caption: "Pull the drawer out" },
      { part: "drawer_residue", action: "clean", caption: "Rinse off old soap" },
      { part: "detergent_drawer", action: "insert", caption: "Slide it fully back in" },
      { part: "washer_door", action: "close", caption: "Close the door" },
      { part: "hot_water_tap", action: "open", caption: "Taps back on" },
      { part: "cold_water_tap", action: "open", caption: "Run a short wash, watch" },
    ],
  },
];

export const rig: RigModule = { catalog, Model: WasherFrontModel, sampleSteps };
