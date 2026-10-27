"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import type { Beat, RigCatalog, Vec3 } from "../../lib/rig/types";
import catalogJson from "./catalogs/range_electric.json";
import type { RigModule } from "./registry";
import { RigPart, useRig } from "./RigRuntime";

/**
 * Whirlpool 30" freestanding electric range (WFES3030R / 3330R / 3530R): glass top, knobs and touch pad on the backguard,
 * bottom-hinged oven door, storage drawer. Metres, origin at the floor centre, +z toward the user.
 */
const width = 0.76;
const bodyBottom = 0.03;
const deckY = 0.912;
const glassTop = 0.925;
const front = 0.305;
const back = -0.335;
const backguardFront = -0.265;
const backguardTop = 1.195;
const ovenOpening = { left: -0.315, right: 0.315, bottom: 0.27, top: 0.78, back: -0.27 };
const rackSlots = [0.33, 0.395, 0.46, 0.525, 0.59, 0.655, 0.72];
const doorHinge = 0.185;
const doorHeight = 0.675;
const doorThickness = 0.05;
const wallZ = -0.372;

export const rangeCatalog = catalogJson as RigCatalog;

// ---------- shared helpers (also used by MicrowaveOtr.tsx) ----------

export const stainless = { color: "#dfe3e8", metalness: 0.72, roughness: 0.3 };
export const chrome = { color: "#e4e8ee", metalness: 0.95, roughness: 0.14 };
export const blackGlass = { color: "#0b0c0e", metalness: 0.25, roughness: 0.08 };
const highlight = new THREE.Color("#ff8a2a");

const textureCache = new Map<string, THREE.CanvasTexture>();

/** A cached canvas texture, drawn once. */
export function kitchenTexture(key: string, canvasWidth: number, canvasHeight: number, draw: (context: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number) => void, repeat: [number, number] = [1, 1]) {
  const cached = textureCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  draw(canvas.getContext("2d")!, canvasWidth, canvasHeight);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, texture);
  return texture;
}

export function seededRandom(seed: number) {
  let state = seed;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

/** Fine horizontal brushing for stainless panels. */
export function brushedTexture() {
  return kitchenTexture("kitchen-brushed", 512, 512, (context, size) => {
    context.fillStyle = "#d8dce1";
    context.fillRect(0, 0, size, size);
    const random = seededRandom(11);
    for (let line = 0; line < 900; line++) {
      const y = random() * size;
      const shade = 190 + Math.floor(random() * 60);
      context.strokeStyle = `rgba(${shade}, ${shade + 2}, ${shade + 6}, ${0.15 + random() * 0.25})`;
      context.lineWidth = 0.6 + random();
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(size, y + (random() - 0.5) * 2);
      context.stroke();
    }
  });
}

/** Printed key legend: light text on a transparent background, one or two lines. */
export function labelTexture(text: string, color = "#e9edf2", fontSize = 34) {
  return kitchenTexture(`kitchen-label:${text}:${color}:${fontSize}`, 256, 128, (context, canvasWidth, canvasHeight) => {
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.fillStyle = color;
    context.textAlign = "center";
    context.textBaseline = "middle";
    const lines = text.split("\n");
    lines.forEach((line, index) => {
      const size = index === 0 ? fontSize : fontSize * 0.68;
      context.font = `600 ${size}px system-ui, sans-serif`;
      context.fillText(line, canvasWidth / 2, canvasHeight / 2 + (index - (lines.length - 1) / 2) * fontSize * 1.05);
    });
  });
}

/** Grime and spills: irregular blotches on a transparent background. */
export function blotchTexture(key: string, colors: string[], options: { blobs: number; spread: number; minRadius: number; maxRadius: number; seed: number; rim?: string }) {
  return kitchenTexture(`kitchen-blotch:${key}`, 256, 256, (context, size) => {
    context.clearRect(0, 0, size, size);
    const random = seededRandom(options.seed);
    for (let blob = 0; blob < options.blobs; blob++) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * options.spread * size * 0.5;
      const x = size / 2 + Math.cos(angle) * distance;
      const y = size / 2 + Math.sin(angle) * distance;
      const radius = options.minRadius + random() * (options.maxRadius - options.minRadius);
      context.fillStyle = colors[Math.floor(random() * colors.length)];
      context.beginPath();
      for (let point = 0; point <= 18; point++) {
        const theta = (point / 18) * Math.PI * 2;
        const wobble = radius * (0.75 + random() * 0.4);
        context[point ? "lineTo" : "moveTo"](x + Math.cos(theta) * wobble, y + Math.sin(theta) * wobble);
      }
      context.fill();
      if (options.rim) {
        context.strokeStyle = options.rim;
        context.lineWidth = 2;
        context.stroke();
      }
    }
  });
}

/** A flat panel with holes, extruded to a small thickness and bevelled. Pass the material as a child. */
export function PanelWithHoles({ panelWidth, panelHeight, thickness, holes, cornerRadius = 0.012, children }: { panelWidth: number; panelHeight: number; thickness: number; holes: THREE.Path[]; cornerRadius?: number; children: ReactNode }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    const radius = cornerRadius;
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
    const extruded = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 24 });
    // Planar UVs in metres would tile a texture far too often; normalise them to the panel.
    const uv = extruded.attributes.uv;
    for (let index = 0; index < uv.count; index++) uv.setXY(index, uv.getX(index) / panelWidth + 0.5, uv.getY(index) / panelHeight + 0.5);
    return extruded;
  }, [panelWidth, panelHeight, thickness, holes, cornerRadius]);
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      {children}
    </mesh>
  );
}

/** A rectangular hole with rounded corners, centred at x, y. */
export function roundedHole(x: number, y: number, holeWidth: number, holeHeight: number, radius = 0.006) {
  const path = new THREE.Path();
  const [left, bottom, right, top] = [x - holeWidth / 2, y - holeHeight / 2, x + holeWidth / 2, y + holeHeight / 2];
  path.moveTo(left + radius, bottom);
  path.quadraticCurveTo(left, bottom, left, bottom + radius);
  path.lineTo(left, top - radius);
  path.quadraticCurveTo(left, top, left + radius, top);
  path.lineTo(right - radius, top);
  path.quadraticCurveTo(right, top, right, top - radius);
  path.lineTo(right, bottom + radius);
  path.quadraticCurveTo(right, bottom, right - radius, bottom);
  path.closePath();
  return path;
}

function glowWalk(inner: THREE.Object3D, visit: (material: THREE.MeshStandardMaterial) => void) {
  const walk = (object: THREE.Object3D) => {
    if (object !== inner && object.userData.rigPart) return;
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) visit(material as THREE.MeshStandardMaterial);
    object.children.forEach(walk);
  };
  walk(inner);
}

/**
 * A part that only carries motion for a nested part (the rack height, the grille slide) has no meshes of its own,
 * so this makes the nested part's meshes glow while the outer one is the focus. Place it after the parts in the tree.
 */
export function GlowWith({ owners, target }: { owners: string[]; target: string }) {
  const rig = useRig();
  useFrame(({ clock }) => {
    if (!owners.includes(rig.focus.current ?? "")) return;
    const inner = rig.nodes.current[target]?.children[0];
    if (!inner) return;
    const pulse = (Math.sin(clock.elapsedTime * 4) + 1) / 2;
    glowWalk(inner, (material) => {
      if (!material.emissive) return;
      material.emissive.copy(highlight);
      material.emissiveIntensity = material.map ? 0.06 + pulse * 0.08 : 0.16 + pulse * 0.2;
    });
  });
  return null;
}

/** Carries a part away (to the side, onto a counter) once its joint passes `after`, so a removed piece clears the way. */
export function Drift({ part, offset, after = 0.5, children }: { part: string; offset: Vec3; after?: number; children: ReactNode }) {
  const rig = useRig();
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    const amount = rig.amounts.current[part] ?? 0;
    const progress = THREE.MathUtils.clamp((amount - after) / (1 - after), 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    groupRef.current?.position.set(offset[0] * eased, offset[1] * eased, offset[2] * eased);
  });
  return <group ref={groupRef}>{children}</group>;
}

/** A second copy of a part (the other grille screw) that mirrors its joint motion and glow. */
export function Twin({ of, position, children }: { of: string; position: Vec3; children: ReactNode }) {
  const rig = useRig();
  const innerRef = useRef<THREE.Group>(null);
  useFrame(() => {
    const source = rig.nodes.current[of]?.children[0];
    const inner = innerRef.current;
    if (!source || !inner) return;
    inner.position.copy(source.position);
    inner.quaternion.copy(source.quaternion);
    inner.scale.copy(source.scale);
    inner.visible = source.visible;
    let sourceMaterial: THREE.MeshStandardMaterial | undefined;
    glowWalk(source, (material) => {
      sourceMaterial ??= material;
    });
    if (!sourceMaterial) return;
    const glow = sourceMaterial;
    inner.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (material.userData.baseEmissive === undefined) material.userData.baseEmissive = material.emissive.clone();
      material.emissive.copy(glow.emissive);
      material.emissiveIntensity = glow.emissiveIntensity;
    });
  });
  return (
    <group position={position}>
      <group ref={innerRef}>{children}</group>
    </group>
  );
}

/** A flat touch key with a printed legend, optionally a pressable part. */
export function TouchKey({ id, label, position, size, keyColor = "#1b1d21", textColor = "#e9edf2", fontSize = 34 }: { id?: string; label: string; position: Vec3; size: [number, number]; keyColor?: string; textColor?: string; fontSize?: number }) {
  const legend = useMemo(() => labelTexture(label, textColor, fontSize), [label, textColor, fontSize]);
  const body = (
    <>
      <RoundedBox args={[size[0], size[1], 0.004]} radius={0.0015} smoothness={2} position={[0, 0, 0.002]}>
        <meshStandardMaterial color={keyColor} roughness={0.3} metalness={0.3} />
      </RoundedBox>
      <mesh position={[0, 0, 0.0042]}>
        <planeGeometry args={[size[0] * 0.96, size[0] * 0.48]} />
        <meshStandardMaterial map={legend} transparent roughness={0.5} />
      </mesh>
    </>
  );
  if (id)
    return (
      <RigPart id={id} position={position}>
        {body}
      </RigPart>
    );
  return <group position={position}>{body}</group>;
}

/** A small appliance bulb along +z: threaded base and a glass globe. */
export function ApplianceBulb({ globeRadius = 0.016 }: { globeRadius?: number }) {
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.008]}>
        <cylinderGeometry args={[globeRadius * 0.55, globeRadius * 0.55, 0.016, 20]} />
        <meshStandardMaterial color="#c9b98a" metalness={0.85} roughness={0.3} />
      </mesh>
      {[0.003, 0.008, 0.013].map((z) => (
        <mesh key={z} position={[0, 0, z]}>
          <torusGeometry args={[globeRadius * 0.57, 0.0011, 6, 20]} />
          <meshStandardMaterial color="#b6a676" metalness={0.85} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 0, 0.016 + globeRadius * 0.9]} scale={[1, 1, 1.25]}>
        <sphereGeometry args={[globeRadius, 24, 16]} />
        <meshStandardMaterial color="#fff8e4" emissive="#ffe6a8" emissiveIntensity={0.25} roughness={0.15} transparent opacity={0.92} />
      </mesh>
    </group>
  );
}

// ---------- range textures ----------

const backguardPixels = 2000;
const toCanvasX = (x: number) => (x + width / 2) * backguardPixels;
const toCanvasY = (y: number) => (backguardTop - y) * backguardPixels;
const knobs = [
  { id: "knob_left_rear", x: -0.31, burner: 1 },
  { id: "knob_left_front", x: -0.225, burner: 0 },
  { id: "knob_right_front", x: 0.225, burner: 3 },
  { id: "knob_right_rear", x: 0.31, burner: 2 },
];
const knobY = 1.075;

function backguardTexture() {
  return kitchenTexture("range-backguard", Math.round(width * backguardPixels), Math.round((backguardTop - glassTop) * backguardPixels), (context, canvasWidth, canvasHeight) => {
    const gradient = context.createLinearGradient(0, 0, 0, canvasHeight);
    gradient.addColorStop(0, "#1b1d21");
    gradient.addColorStop(1, "#0c0d0f");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvasWidth, canvasHeight);
    // control centre outline
    context.strokeStyle = "#3d424a";
    context.lineWidth = 3;
    context.beginPath();
    context.roundRect(toCanvasX(-0.155), toCanvasY(1.185), 0.31 * backguardPixels, 0.24 * backguardPixels, 14);
    context.stroke();
    // knob dials: OFF at the top, heat rising clockwise
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (const knob of knobs) {
      const centerX = toCanvasX(knob.x);
      const centerY = toCanvasY(knobY);
      const radius = 0.033 * backguardPixels;
      for (let step = 0; step <= 14; step++) {
        const angle = THREE.MathUtils.degToRad(-55 + step * 19);
        const length = 8 + step * 1.4;
        context.strokeStyle = step === 14 ? "#ff7a3a" : "#aab0b8";
        context.lineWidth = 2 + step * 0.25;
        context.beginPath();
        context.moveTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
        context.lineTo(centerX + Math.cos(angle) * (radius + length), centerY + Math.sin(angle) * (radius + length));
        context.stroke();
      }
      context.fillStyle = "#d9dde2";
      context.font = "600 17px system-ui, sans-serif";
      context.fillText("OFF", centerX, centerY - radius - 18);
      context.font = "500 14px system-ui, sans-serif";
      context.fillText("LO", centerX + Math.cos(-0.6) * (radius + 34), centerY + Math.sin(-0.6) * (radius + 34));
      context.fillText("MED", centerX + Math.cos(1.2) * (radius + 38), centerY + Math.sin(1.2) * (radius + 38));
      context.fillText("HI", centerX + Math.cos(3.2) * (radius + 36), centerY + Math.sin(3.2) * (radius + 36));
      // which burner this knob runs
      const iconX = centerX;
      const iconY = toCanvasY(0.975);
      context.strokeStyle = "#8e959e";
      context.lineWidth = 2;
      context.beginPath();
      context.roundRect(iconX - 22, iconY - 16, 44, 32, 5);
      context.stroke();
      [
        [-10, 7],
        [-10, -7],
        [10, -7],
        [10, 7],
      ].forEach(([dx, dy], index) => {
        context.beginPath();
        context.arc(iconX + dx, iconY + dy, 5, 0, Math.PI * 2);
        if (index === knob.burner) {
          context.fillStyle = "#f2f4f6";
          context.fill();
        } else context.stroke();
      });
    }
    context.fillStyle = "#9aa1a9";
    context.font = "600 15px system-ui, sans-serif";
    context.textAlign = "left";
    context.fillText("HOT SURFACE", toCanvasX(-0.118), toCanvasY(0.963));
  });
}

function displayTexture() {
  return kitchenTexture("range-display", 512, 128, (context, canvasWidth, canvasHeight) => {
    context.fillStyle = "#050607";
    context.fillRect(0, 0, canvasWidth, canvasHeight);
    context.fillStyle = "#9fdcff";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "500 84px ui-monospace, monospace";
    context.fillText("12:00", canvasWidth / 2, canvasHeight / 2 + 4);
  });
}

function enamelTexture() {
  return kitchenTexture(
    "range-enamel",
    256,
    256,
    (context, size) => {
      context.fillStyle = "#3a3f4a";
      context.fillRect(0, 0, size, size);
      const random = seededRandom(23);
      for (let speck = 0; speck < 1800; speck++) {
        const shade = random() > 0.5 ? "rgba(210, 216, 228, 0.55)" : "rgba(20, 22, 28, 0.6)";
        context.fillStyle = shade;
        context.fillRect(random() * size, random() * size, 1 + random() * 1.5, 1 + random() * 1.5);
      }
    },
    [3, 3],
  );
}

function ventSlotTexture() {
  return kitchenTexture(
    "range-vent",
    256,
    32,
    (context, canvasWidth, canvasHeight) => {
      context.fillStyle = "#2a2d32";
      context.fillRect(0, 0, canvasWidth, canvasHeight);
      context.fillStyle = "#050506";
      for (let slot = 0; slot < 16; slot++) context.fillRect(slot * 16 + 3, 6, 10, canvasHeight - 12);
    },
    [6, 1],
  );
}

// ---------- range parts ----------

function Body() {
  const brushed = useMemo(() => brushedTexture(), []);
  const enamel = useMemo(() => enamelTexture(), []);
  const frameHoles = useMemo(() => {
    const frameCenter = (deckY + bodyBottom) / 2;
    return [
      roundedHole(0, (ovenOpening.top + ovenOpening.bottom) / 2 - frameCenter, ovenOpening.right - ovenOpening.left, ovenOpening.top - ovenOpening.bottom, 0.02),
      roundedHole(0, 0.1025 - frameCenter, 0.71, 0.135, 0.006),
    ];
  }, []);
  const cavityDepth = front - 0.01 - ovenOpening.back;
  return (
    <group>
      {/* front frame with the oven and drawer openings */}
      <group position={[0, (deckY + bodyBottom) / 2, front - 0.012]}>
        <PanelWithHoles panelWidth={width} panelHeight={deckY - bodyBottom} thickness={0.01} holes={frameHoles} cornerRadius={0.004}>
          <meshStandardMaterial color="#17181b" roughness={0.4} metalness={0.3} />
        </PanelWithHoles>
      </group>
      {/* black enamel sides and a dark back */}
      {[-1, 1].map((side) => (
        <RoundedBox key={side} args={[0.012, deckY - bodyBottom, front - back]} radius={0.004} position={[(side * (width - 0.012)) / 2, (deckY + bodyBottom) / 2, (front + back) / 2]} castShadow receiveShadow>
          <meshStandardMaterial color="#1a1c1f" roughness={0.32} metalness={0.35} />
        </RoundedBox>
      ))}
      <mesh position={[0, (deckY + bodyBottom) / 2, back + 0.005]}>
        <boxGeometry args={[width - 0.02, deckY - bodyBottom, 0.01]} />
        <meshStandardMaterial color="#2a2c30" roughness={0.7} />
      </mesh>
      {/* the oven cavity, speckled blue-grey porcelain seen from inside */}
      <mesh position={[0, (ovenOpening.top + ovenOpening.bottom) / 2, ovenOpening.back + cavityDepth / 2]}>
        <boxGeometry args={[ovenOpening.right - ovenOpening.left, ovenOpening.top - ovenOpening.bottom, cavityDepth]} />
        <meshStandardMaterial map={enamel} side={THREE.BackSide} roughness={0.45} metalness={0.1} />
      </mesh>
      {/* embossed rack ridges on both side walls */}
      {rackSlots.map((slotY) =>
        [-1, 1].map((side) => (
          <mesh key={`${slotY}${side}`} position={[side * (ovenOpening.right - 0.006), slotY - 0.006, -0.01]}>
            <boxGeometry args={[0.012, 0.009, 0.46]} />
            <meshStandardMaterial map={enamel} roughness={0.45} />
          </mesh>
        )),
      )}
      {/* broil element across the oven roof */}
      <mesh position={[0, ovenOpening.top - 0.02, -0.02]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.2, 0.004, 8, 48]} />
        <meshStandardMaterial color="#5a5550" metalness={0.6} roughness={0.5} />
      </mesh>
      <pointLight position={[0, ovenOpening.top - 0.06, 0.05]} intensity={0.35} distance={0.7} decay={2} color="#ffe2b5" />
      {/* stainless end caps and top trim of the backguard */}
      <mesh position={[0, (glassTop + backguardTop) / 2, (back + backguardFront) / 2]} castShadow>
        <boxGeometry args={[width - 0.02, backguardTop - glassTop, backguardFront - back]} />
        <meshStandardMaterial color="#141518" roughness={0.5} />
      </mesh>
      {[-1, 1].map((side) => (
        <RoundedBox key={side} args={[0.014, backguardTop - deckY + 0.004, backguardFront - back + 0.004]} radius={0.004} position={[side * (width / 2 - 0.007), (deckY + backguardTop) / 2 + 0.002, (back + backguardFront) / 2]} castShadow>
          <meshStandardMaterial map={brushed} {...stainless} />
        </RoundedBox>
      ))}
      <RoundedBox args={[width, 0.012, backguardFront - back + 0.006]} radius={0.004} position={[0, backguardTop + 0.004, (back + backguardFront) / 2]} castShadow>
        <meshStandardMaterial map={brushed} {...stainless} />
      </RoundedBox>
      {/* wall behind */}
      <mesh position={[0, 1.2, wallZ]} receiveShadow>
        <planeGeometry args={[3.2, 2.4]} />
        <meshBasicMaterial color="#f3efe9" />
      </mesh>
    </group>
  );
}

const burners = [
  { id: "burner_left_front", x: -0.19, z: 0.165, rings: [0.115, 0.075] },
  { id: "burner_left_rear", x: -0.19, z: -0.09, rings: [0.08] },
  { id: "burner_right_rear", x: 0.19, z: -0.09, rings: [0.08] },
  { id: "burner_right_front", x: 0.19, z: 0.165, rings: [0.1] },
];

function Cooktop() {
  const spill = useMemo(() => blotchTexture("cooktop-spill", ["rgba(92, 52, 24, 0.95)", "rgba(60, 32, 14, 0.95)", "rgba(130, 86, 44, 0.85)", "rgba(40, 22, 10, 0.95)"], { blobs: 26, spread: 0.6, minRadius: 10, maxRadius: 38, seed: 5, rim: "rgba(170, 130, 80, 0.6)" }), []);
  const vent = useMemo(() => ventSlotTexture(), []);
  const glassDepth = 0.345 - (backguardFront + 0.03);
  const glassCenterZ = (0.345 + backguardFront + 0.03) / 2;
  return (
    <group>
      <RigPart id="glass_cooktop" position={[0, (deckY + glassTop) / 2, glassCenterZ]}>
        <RoundedBox args={[width, glassTop - deckY, glassDepth]} radius={0.004} smoothness={3} receiveShadow>
          <meshPhysicalMaterial {...blackGlass} clearcoat={1} clearcoatRoughness={0.04} />
        </RoundedBox>
      </RigPart>
      {burners.map((burner) => (
        <RigPart key={burner.id} id={burner.id} position={[burner.x, glassTop + 0.0004, burner.z]}>
          {burner.rings.map((radius) => (
            <mesh key={radius} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[radius - 0.0035, radius, 72]} />
              <meshStandardMaterial color="#a2a8b0" roughness={0.4} metalness={0.2} />
            </mesh>
          ))}
          {/* the coil under the glass, a faint dark red through the black */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.0002, 0]}>
            <circleGeometry args={[burner.rings[0] - 0.006, 48]} />
            <meshStandardMaterial color="#1c0f0e" roughness={0.12} metalness={0.2} transparent opacity={0.85} />
          </mesh>
        </RigPart>
      ))}
      {/* burnt-on spill beside the right front burner */}
      <RigPart id="cooktop_spill" position={[0.07, glassTop + 0.001, 0.2]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.13, 0.11]} />
          <meshStandardMaterial map={spill} transparent alphaTest={0.05} roughness={0.75} />
        </mesh>
      </RigPart>
      {/* oven vent slot between the glass and the backguard */}
      <RigPart id="oven_vent" position={[0, deckY + 0.004, backguardFront + 0.015]}>
        <mesh>
          <boxGeometry args={[width - 0.06, 0.012, 0.026]} />
          <meshStandardMaterial map={vent} roughness={0.6} metalness={0.4} />
        </mesh>
      </RigPart>
    </group>
  );
}

function Knob({ id, x }: { id: string; x: number }) {
  return (
    <RigPart id={id} position={[x, knobY, backguardFront]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.003]}>
        <cylinderGeometry args={[0.028, 0.028, 0.006, 48]} />
        <meshStandardMaterial {...chrome} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.017]} castShadow>
        <cylinderGeometry args={[0.022, 0.025, 0.024, 48]} />
        <meshStandardMaterial color="#c4c9d0" metalness={0.85} roughness={0.28} />
      </mesh>
      {/* grip fin with the pointer line */}
      <RoundedBox args={[0.012, 0.042, 0.018]} radius={0.004} position={[0, 0, 0.036]} castShadow>
        <meshStandardMaterial color="#d3d8de" metalness={0.85} roughness={0.25} />
      </RoundedBox>
      <mesh position={[0, 0.013, 0.0452]}>
        <planeGeometry args={[0.003, 0.014]} />
        <meshStandardMaterial color="#1a1c1f" roughness={0.6} />
      </mesh>
    </RigPart>
  );
}

const panelKeys = [
  { id: "bake_button", label: "BAKE", column: 0, row: 0 },
  { id: "broil_button", label: "BROIL", column: 1, row: 0 },
  { id: "steam_clean_button", label: "STEAM\nCLEAN", column: 2, row: 0 },
  { id: "keep_warm_button", label: "KEEP\nWARM", column: 3, row: 0 },
  { id: "temp_up_button", label: "▲\nTEMP/TIME", column: 0, row: 1 },
  { id: "temp_down_button", label: "▼\nTEMP/TIME", column: 1, row: 1 },
  { id: "timer_button", label: "TIMER\nSET/OFF", column: 2, row: 1 },
  { id: "light_button", label: "OVEN\nLIGHT", column: 3, row: 1 },
  { id: "control_lock_button", label: "CONTROL\nLOCK 3 SEC", column: 0, row: 2 },
  { id: "clock_button", label: "CLOCK", column: 1, row: 2 },
  { id: "cancel_button", label: "CANCEL", column: 2, row: 2 },
  { id: "start_button", label: "START", column: 3, row: 2 },
];

function Backguard() {
  const face = useMemo(() => backguardTexture(), []);
  const display = useMemo(() => displayTexture(), []);
  return (
    <group>
      <mesh position={[0, (glassTop + backguardTop) / 2, backguardFront + 0.0005]}>
        <planeGeometry args={[width - 0.028, backguardTop - glassTop]} />
        <meshPhysicalMaterial map={face} roughness={0.1} metalness={0.2} clearcoat={1} clearcoatRoughness={0.05} />
      </mesh>
      {knobs.map((knob) => (
        <Knob key={knob.id} id={knob.id} x={knob.x} />
      ))}
      <RigPart id="oven_control_panel" position={[0, 1.06, backguardFront + 0.001]}>
        <mesh>
          <planeGeometry args={[0.3, 0.23]} />
          <meshStandardMaterial color="#111215" roughness={0.25} metalness={0.2} transparent opacity={0.6} />
        </mesh>
        <mesh position={[0, 0.098, 0.001]}>
          <planeGeometry args={[0.13, 0.034]} />
          <meshStandardMaterial map={display} emissiveMap={display} emissive="#ffffff" emissiveIntensity={0.9} roughness={0.2} />
        </mesh>
        {panelKeys.map((key) => (
          <TouchKey key={key.id} id={key.id} label={key.label} position={[-0.108 + key.column * 0.072, 0.047 - key.row * 0.045, 0]} size={[0.064, 0.036]} keyColor={key.id === "start_button" ? "#25292f" : "#1b1d21"} textColor={key.id === "start_button" ? "#9fdcff" : "#e9edf2"} fontSize={key.label.length > 9 ? 28 : 34} />
        ))}
        <RigPart id="hot_surface_light" position={[-0.13, -0.097, 0.001]}>
          <mesh>
            <circleGeometry args={[0.005, 24]} />
            <meshStandardMaterial color="#ff6a1a" emissive="#ff5a0a" emissiveIntensity={1.2} />
          </mesh>
        </RigPart>
      </RigPart>
    </group>
  );
}

function OvenDoor() {
  const brushed = useMemo(() => brushedTexture(), []);
  const skinHoles = useMemo(() => [roundedHole(0, 0.335 - doorHeight / 2, 0.52, 0.31, 0.012)], []);
  const bandHoles = useMemo(() => [roundedHole(0, 0.335 - doorHeight / 2, 0.44, 0.25, 0.01)], []);
  const linerHoles = useMemo(() => [roundedHole(0, 0.335 - doorHeight / 2, 0.42, 0.24, 0.01)], []);
  const half = doorThickness / 2;
  return (
    // Hinged at the bottom front edge; the top swings out toward the user and down.
    <RigPart id="oven_door" position={[0, doorHinge, front + half]}>
      <group position={[0, doorHeight / 2, 0]}>
        {/* stainless skin with the window opening */}
        <group position={[0, 0, half - 0.006]}>
          <PanelWithHoles panelWidth={0.75} panelHeight={doorHeight} thickness={0.004} holes={skinHoles} cornerRadius={0.01}>
            <meshStandardMaterial map={brushed} {...stainless} />
          </PanelWithHoles>
        </group>
        {/* black glass band framing the window */}
        <group position={[0, 0, half - 0.014]}>
          <PanelWithHoles panelWidth={0.7} panelHeight={0.6} thickness={0.006} holes={bandHoles} cornerRadius={0.01}>
            <meshPhysicalMaterial {...blackGlass} clearcoat={1} />
          </PanelWithHoles>
        </group>
        {/* inner liner, grey enamel, seen when the door is down */}
        <group position={[0, 0, -half]}>
          <PanelWithHoles panelWidth={0.72} panelHeight={doorHeight - 0.02} thickness={0.008} holes={linerHoles} cornerRadius={0.01}>
            <meshStandardMaterial color="#3f444d" roughness={0.45} />
          </PanelWithHoles>
        </group>
        {/* edges */}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.372, 0, 0]}>
            <boxGeometry args={[0.006, doorHeight, doorThickness - 0.004]} />
            <meshStandardMaterial color="#2a2d31" roughness={0.5} metalness={0.4} />
          </mesh>
        ))}
        <mesh position={[0, doorHeight / 2 - 0.003, 0]}>
          <boxGeometry args={[0.75, 0.006, doorThickness - 0.004]} />
          <meshStandardMaterial map={brushed} {...stainless} />
        </mesh>
        <mesh position={[0, -doorHeight / 2 + 0.003, 0]}>
          <boxGeometry args={[0.75, 0.006, doorThickness - 0.004]} />
          <meshStandardMaterial color="#2a2d31" roughness={0.5} />
        </mesh>
        {/* window glass */}
        <RigPart id="oven_window" position={[0, 0.335 - doorHeight / 2, half - 0.008]}>
          <mesh>
            <planeGeometry args={[0.5, 0.29]} />
            <meshPhysicalMaterial color="#1d242c" roughness={0.03} metalness={0.3} transparent opacity={0.5} clearcoat={1} />
          </mesh>
        </RigPart>
        {/* towel-bar handle on two posts */}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.31, doorHeight / 2 - 0.06, half + 0.022]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.009, 0.011, 0.044, 20]} />
            <meshStandardMaterial {...chrome} />
          </mesh>
        ))}
        <mesh position={[0, doorHeight / 2 - 0.06, half + 0.046]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.0125, 0.0125, 0.7, 32]} />
          <meshStandardMaterial {...chrome} />
        </mesh>
      </group>
    </RigPart>
  );
}

function DoorSeal() {
  const sealWidth = ovenOpening.right - ovenOpening.left + 0.016;
  const sealHeight = ovenOpening.top - ovenOpening.bottom + 0.016;
  const centerY = (ovenOpening.top + ovenOpening.bottom) / 2;
  const material = <meshStandardMaterial color="#6d7176" roughness={0.95} />;
  return (
    <RigPart id="oven_door_seal" position={[0, centerY, front + 0.002]}>
      {[-1, 1].map((side) => (
        <group key={side}>
          <RoundedBox args={[0.014, sealHeight, 0.008]} radius={0.003} position={[(side * sealWidth) / 2, 0, 0]}>
            {material}
          </RoundedBox>
          <RoundedBox args={[sealWidth, 0.014, 0.008]} radius={0.003} position={[0, (side * sealHeight) / 2, 0]}>
            {material}
          </RoundedBox>
        </group>
      ))}
    </RigPart>
  );
}

function RackWires() {
  const rackWidth = 0.6;
  const rackDepth = 0.46;
  const wire = <meshStandardMaterial color="#dfe3e8" metalness={0.92} roughness={0.22} />;
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[(side * rackWidth) / 2, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.0035, 0.0035, rackDepth, 8]} />
            {wire}
          </mesh>
          <mesh position={[0, 0, (side * rackDepth) / 2]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.0035, 0.0035, rackWidth, 8]} />
            {wire}
          </mesh>
        </group>
      ))}
      {Array.from({ length: 15 }, (_, index) => (
        <mesh key={index} position={[-rackWidth / 2 + ((index + 1) * rackWidth) / 16, 0.004, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.0022, 0.0022, rackDepth, 6]} />
          {wire}
        </mesh>
      ))}
      {[-0.12, 0.12].map((z) => (
        <mesh key={z} position={[0, -0.003, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.0028, 0.0028, rackWidth, 6]} />
          {wire}
        </mesh>
      ))}
      {/* raised front bar to grab */}
      <mesh position={[0, 0.018, rackDepth / 2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.0035, 0.0035, rackWidth - 0.06, 8]} />
        {wire}
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (rackWidth / 2 - 0.03), 0.009, rackDepth / 2]}>
          <cylinderGeometry args={[0.003, 0.003, 0.018, 6]} />
          {wire}
        </mesh>
      ))}
    </group>
  );
}

function OvenInterior() {
  const spill = useMemo(() => blotchTexture("oven-floor-spill", ["rgba(120, 72, 30, 0.9)", "rgba(88, 50, 20, 0.92)", "rgba(150, 100, 50, 0.8)"], { blobs: 30, spread: 0.65, minRadius: 8, maxRadius: 32, seed: 17, rim: "rgba(60, 34, 14, 0.7)" }), []);
  const enamel = useMemo(() => enamelTexture(), []);
  const lightX = 0.2;
  const lightY = 0.725;
  return (
    <group>
      {/* the lower rack: pull out to the stop, lift to another slot, slide in */}
      <RigPart id="oven_rack_level" position={[0, rackSlots[1] + 0.004, 0]}>
        <RigPart id="oven_rack">
          <RackWires />
        </RigPart>
      </RigPart>
      <RigPart id="oven_rack_upper" position={[0, rackSlots[5] + 0.004, 0]}>
        <RackWires />
      </RigPart>
      <GlowWith owners={["oven_rack_level"]} target="oven_rack" />
      <RigPart id="oven_floor" position={[0, ovenOpening.bottom + 0.002, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.61, 0.55]} />
          <meshStandardMaterial map={enamel} roughness={0.45} />
        </mesh>
      </RigPart>
      <RigPart id="oven_floor_spill" position={[-0.04, ovenOpening.bottom + 0.004, 0.02]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.24, 0.2]} />
          <meshStandardMaterial map={spill} transparent alphaTest={0.05} roughness={0.6} />
        </mesh>
      </RigPart>
      {/* light socket on the back wall, the bulb, and the glass cover over it */}
      <mesh position={[lightX, lightY, ovenOpening.back + 0.004]}>
        <torusGeometry args={[0.038, 0.004, 12, 40]} />
        <meshStandardMaterial {...chrome} />
      </mesh>
      <mesh position={[lightX, lightY, ovenOpening.back + 0.004]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.013, 0.013, 0.008, 20]} />
        <meshStandardMaterial color="#e8e2d2" roughness={0.6} />
      </mesh>
      <RigPart id="oven_light_bulb" position={[lightX, lightY, ovenOpening.back + 0.006]}>
        <ApplianceBulb globeRadius={0.012} />
      </RigPart>
      <Drift part="oven_light_cover" offset={[-0.1, -0.09, 0.23]}>
        <RigPart id="oven_light_cover" position={[lightX, lightY, ovenOpening.back + 0.006]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.75, 1]}>
            <sphereGeometry args={[0.034, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshPhysicalMaterial color="#f4f7fa" roughness={0.35} transmission={0.4} transparent opacity={0.6} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 0, 0.002]}>
            <torusGeometry args={[0.034, 0.003, 10, 40]} />
            <meshStandardMaterial color="#eef1f4" roughness={0.3} transparent opacity={0.8} />
          </mesh>
        </RigPart>
      </Drift>
    </group>
  );
}

function StorageDrawer() {
  const brushed = useMemo(() => brushedTexture(), []);
  const boxColor = <meshStandardMaterial color="#5b6068" roughness={0.6} metalness={0.3} />;
  return (
    <RigPart id="storage_drawer" position={[0, 0.1025, front]}>
      <RoundedBox args={[0.745, 0.142, 0.024]} radius={0.005} position={[0, 0, 0.012]} castShadow>
        <meshStandardMaterial map={brushed} {...stainless} />
      </RoundedBox>
      {/* finger pull under the top lip */}
      <mesh position={[0, 0.058, 0.0245]}>
        <boxGeometry args={[0.66, 0.01, 0.002]} />
        <meshStandardMaterial color="#2b2e33" roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.058, -0.26]}>
        <boxGeometry args={[0.68, 0.006, 0.5]} />
        {boxColor}
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.337, -0.01, -0.26]}>
          <boxGeometry args={[0.006, 0.1, 0.5]} />
          {boxColor}
        </mesh>
      ))}
      <mesh position={[0, -0.01, -0.507]}>
        <boxGeometry args={[0.68, 0.1, 0.006]} />
        {boxColor}
      </mesh>
    </RigPart>
  );
}

function Leg() {
  return (
    <group>
      <mesh position={[0, 0.003, 0]}>
        <cylinderGeometry args={[0.02, 0.022, 0.006, 24]} />
        <meshStandardMaterial color="#2d3035" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.018, 0]}>
        <cylinderGeometry args={[0.011, 0.011, 0.024, 6]} />
        <meshStandardMaterial color="#9aa0a8" metalness={0.8} roughness={0.35} />
      </mesh>
    </group>
  );
}

function LegsAndBracket() {
  const bracket = <meshStandardMaterial color="#a9b0b8" metalness={0.75} roughness={0.35} />;
  return (
    <group>
      {[
        [-0.33, 0.26],
        [-0.3, -0.305],
        [0.3, -0.305],
      ].map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <Leg />
        </group>
      ))}
      <RigPart id="leveling_legs" position={[0.33, 0, 0.26]}>
        <Leg />
      </RigPart>
      {/* anti-tip bracket screwed to the floor and wall, its lip over the back right foot */}
      <RigPart id="anti_tip_bracket" position={[0.3, 0, -0.33]}>
        <mesh position={[0, 0.0015, 0.005]}>
          <boxGeometry args={[0.09, 0.003, 0.085]} />
          {bracket}
        </mesh>
        <mesh position={[0, 0.035, -0.036]}>
          <boxGeometry args={[0.09, 0.07, 0.003]} />
          {bracket}
        </mesh>
        <mesh position={[0, 0.0105, 0.0]}>
          <boxGeometry args={[0.09, 0.003, 0.07]} />
          {bracket}
        </mesh>
        {[-0.03, 0.03].map((x) => (
          <mesh key={x} position={[x, 0.05, -0.034]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.005, 0.005, 0.003, 12]} />
            <meshStandardMaterial color="#6d737b" metalness={0.8} roughness={0.3} />
          </mesh>
        ))}
      </RigPart>
    </group>
  );
}

function RangeModel() {
  return (
    <group>
      <Body />
      <Cooktop />
      <Backguard />
      <DoorSeal />
      <OvenInterior />
      <OvenDoor />
      <StorageDrawer />
      <LegsAndBracket />
    </group>
  );
}

const sampleSteps: { instruction: string; beats: Beat[] }[] = [
  {
    instruction: "Reset the oven controls",
    beats: [
      { part: "cancel_button", action: "press", caption: "Press Cancel once" },
      { part: "control_lock_button", action: "press", caption: "Hold Control Lock three seconds" },
      { part: "oven_control_panel", action: "look", caption: "Breaker off one minute, on" },
      { part: "bake_button", action: "press", caption: "Press Bake" },
      { part: "temp_up_button", action: "press", caption: "Set the temperature" },
      { part: "start_button", action: "press", caption: "Press Start" },
    ],
  },
  {
    instruction: "Test the burner that won't heat",
    beats: [
      { part: "knob_right_front", action: "look", caption: "Make sure this knob is Off" },
      { part: "hot_surface_light", action: "look", caption: "Wait for this light off" },
      { part: "burner_right_front", action: "look", caption: "Center a flat pan here" },
      { part: "knob_right_front", action: "turn", caption: "Turn to medium heat" },
      { part: "burner_right_front", action: "look", caption: "Watch for a red glow" },
    ],
  },
  {
    instruction: "Move the rack and adjust the temperature",
    beats: [
      { part: "oven_door", action: "open", caption: "Open the oven door" },
      { part: "oven_rack", action: "open", caption: "Pull the rack to the stop" },
      { part: "oven_rack_level", action: "open", caption: "Lift to the middle slot" },
      { part: "oven_rack", action: "close", caption: "Slide the rack back in" },
      { part: "oven_door", action: "close", caption: "Close the door" },
      { part: "temp_down_button", action: "press", caption: "Hold down arrow five seconds" },
      { part: "temp_up_button", action: "press", caption: "Tap arrows to adjust" },
      { part: "start_button", action: "press", caption: "Press Start to save" },
    ],
  },
  {
    instruction: "Replace the oven light bulb",
    beats: [
      { part: "oven_control_panel", action: "look", caption: "Turn the breaker off first" },
      { part: "oven_door", action: "open", caption: "Open the oven door" },
      { part: "oven_light_cover", action: "remove", caption: "Twist the cover left, remove" },
      { part: "oven_light_bulb", action: "remove", caption: "Twist the old bulb out" },
      { part: "oven_light_bulb", action: "insert", caption: "Screw in the new bulb" },
      { part: "oven_light_cover", action: "insert", caption: "Twist the cover back on" },
      { part: "oven_door", action: "close", caption: "Close the door" },
      { part: "light_button", action: "press", caption: "Breaker on, press Light" },
    ],
  },
  {
    instruction: "Clean the burnt-on spill",
    beats: [
      { part: "knob_right_front", action: "look", caption: "Check every knob is Off" },
      { part: "hot_surface_light", action: "look", caption: "Wait until this light is off" },
      { part: "cooktop_spill", action: "look", caption: "Soak it with water, five minutes" },
      { part: "cooktop_spill", action: "clean", caption: "Wipe gently with soft sponge" },
      { part: "glass_cooktop", action: "look", caption: "Dry the glass with cloth" },
    ],
  },
  {
    instruction: "Steam clean the oven floor",
    beats: [
      { part: "oven_door", action: "open", caption: "Open the cool oven" },
      { part: "oven_floor", action: "look", caption: "Take out pans and bits" },
      { part: "oven_floor_spill", action: "look", caption: "Pour 12 oz water here" },
      { part: "oven_door", action: "close", caption: "Close the door fully" },
      { part: "steam_clean_button", action: "press", caption: "Press Steam Clean" },
      { part: "start_button", action: "press", caption: "Press Start" },
      { part: "oven_door", action: "open", caption: "Open when it shows End" },
      { part: "oven_floor_spill", action: "clean", caption: "Wipe the loosened spill away" },
      { part: "oven_door", action: "close", caption: "Close the door" },
    ],
  },
  {
    instruction: "Check the anti-tip bracket",
    beats: [
      { part: "storage_drawer", action: "open", caption: "Pull the drawer out" },
      { part: "anti_tip_bracket", action: "look", caption: "Back foot sits in bracket" },
      { part: "storage_drawer", action: "close", caption: "Slide the drawer back" },
    ],
  },
];

export const rig: RigModule = { catalog: rangeCatalog, Model: RangeModel, sampleSteps };
