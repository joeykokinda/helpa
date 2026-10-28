"use client";

import { useMemo, type ReactNode } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { recipeCatalog, sampleSteps, type Recipe, type RecipeMaterial, type RecipeNode } from "../../lib/rig/recipe";
import type { RigModule } from "./registry";
import { RigPart } from "./RigRuntime";
import { foilTexture, lintTexture, perforatedTexture, screenMeshTexture } from "./textures";

/** Renders an on-demand recipe (see lib/rig/recipe.ts) as meshes and RigParts, with the hand-built rigs' techniques. */

const degrees = THREE.MathUtils.degToRad;
const clampSize = (value: number | undefined, fallback: number) => (Number.isFinite(value) && (value as number) > 0 ? Math.min(6, Math.max(0.0005, value as number)) : fallback);

function hashSeed(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (Math.abs(hash) % 2147483646) + 1;
}

function seededRandom(seed: number) {
  let state = seed;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

/* ---------- canvas textures, drawn once ---------- */

const textureCache = new Map<string, THREE.CanvasTexture>();

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

function brushedTexture() {
  return canvasTexture("recipe-brushed", 512, 512, (context) => {
    context.fillStyle = "#e2e5e9";
    context.fillRect(0, 0, 512, 512);
    const random = seededRandom(11);
    for (let line = 0; line < 900; line++) {
      const y = random() * 512;
      const shade = 195 + Math.floor(random() * 55);
      context.strokeStyle = `rgba(${shade}, ${shade + 2}, ${shade + 5}, ${0.15 + random() * 0.25})`;
      context.lineWidth = 0.6 + random();
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(512, y + (random() - 0.5) * 2);
      context.stroke();
    }
  });
}

/** Folded filter media: light and shadow alternating across the pleats. */
function pleatTexture() {
  return canvasTexture(
    "recipe-pleats",
    256,
    16,
    (context) => {
      const gradient = context.createLinearGradient(0, 0, 32, 0);
      gradient.addColorStop(0, "#9c978b");
      gradient.addColorStop(0.45, "#f6f3ea");
      gradient.addColorStop(0.55, "#ffffff");
      gradient.addColorStop(1, "#a7a296");
      context.fillStyle = gradient;
      for (let pleat = 0; pleat < 8; pleat++) {
        context.save();
        context.translate(pleat * 32, 0);
        context.fillRect(0, 0, 32, 16);
        context.restore();
      }
    },
    [3, 1],
  );
}

/** Roller-chain links along the u direction. */
function chainTexture() {
  return canvasTexture("recipe-chain", 128, 32, (context) => {
    context.fillStyle = "#2b2e33";
    context.fillRect(0, 0, 128, 32);
    for (let link = 0; link < 4; link++) {
      const x = link * 32;
      context.fillStyle = link % 2 ? "#8d939b" : "#b5bac1";
      context.beginPath();
      context.roundRect(x + 2, 6, 28, 20, 9);
      context.fill();
      context.fillStyle = "#3a3d42";
      context.beginPath();
      context.arc(x + 9, 16, 4, 0, Math.PI * 2);
      context.arc(x + 23, 16, 4, 0, Math.PI * 2);
      context.fill();
    }
  });
}

/** Ribs across a flexible duct or corrugated hose, along u. */
function ribTexture(base: string) {
  return canvasTexture(`recipe-ribs:${base}`, 64, 16, (context) => {
    const gradient = context.createLinearGradient(0, 0, 64, 0);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.5, base);
    gradient.addColorStop(1, "#ffffff");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 16);
  });
}

function woodTexture() {
  return canvasTexture(
    "recipe-wood",
    256,
    256,
    (context) => {
      context.fillStyle = "#d9b98c";
      context.fillRect(0, 0, 256, 256);
      const random = seededRandom(31);
      for (let grain = 0; grain < 70; grain++) {
        const y = random() * 256;
        context.strokeStyle = `rgba(${140 + random() * 30}, ${100 + random() * 20}, ${60 + random() * 20}, ${0.2 + random() * 0.25})`;
        context.lineWidth = 1 + random() * 2.5;
        context.beginPath();
        context.moveTo(0, y);
        for (let x = 0; x <= 256; x += 32) context.lineTo(x, y + Math.sin(x / 40 + grain) * 3);
        context.stroke();
      }
    },
    [2, 2],
  );
}

type Dirt = { base: string; specks: string[]; count: number; size: [number, number]; strands?: boolean; glossy?: boolean };

const dirt: Partial<Record<RecipeMaterial, Dirt>> = {
  grime: { base: "rgba(96, 78, 52, 0.88)", specks: ["#4a3a26", "#7a6040", "#2f261a", "#9a8460"], count: 260, size: [2, 9] },
  food_scraps: { base: "rgba(128, 98, 58, 0.6)", specks: ["#8a5a2b", "#a8743a", "#d9822b", "#efe8d6", "#f3eddc", "#5f8a3a", "#b8452e", "#6b4a2a"], count: 320, size: [2.5, 7] },
  rust: { base: "rgba(150, 72, 32, 0.92)", specks: ["#6b2e12", "#c06a32", "#7d3a18", "#d08a50"], count: 400, size: [1.5, 8] },
  mineral_scale: { base: "rgba(236, 233, 222, 0.9)", specks: ["#ffffff", "#c9c6bb", "#dcd8cc", "#b9b5aa"], count: 300, size: [2, 10] },
  hair: { base: "rgba(58, 44, 36, 0.75)", specks: ["#2a1d16", "#4a3426", "#6d523d", "#1a1310"], count: 160, size: [1, 2], strands: true },
  oil: { base: "rgba(36, 26, 16, 0.92)", specks: ["#120c06", "#3e2c18", "#5a4428"], count: 120, size: [3, 12] },
  water: { base: "rgba(120, 178, 222, 0.55)", specks: ["rgba(255,255,255,0.55)", "rgba(170,210,240,0.6)"], count: 40, size: [3, 10] },
};

function drawDirt(context: CanvasRenderingContext2D, size: number, recipe: Dirt, random: () => number) {
  for (let speck = 0; speck < recipe.count; speck++) {
    const x = random() * size;
    const y = random() * size;
    context.fillStyle = context.strokeStyle = recipe.specks[Math.floor(random() * recipe.specks.length)];
    if (recipe.strands) {
      context.lineWidth = recipe.size[0] + random() * (recipe.size[1] - recipe.size[0]);
      context.beginPath();
      context.moveTo(x, y);
      context.bezierCurveTo(x + (random() - 0.5) * 60, y + (random() - 0.5) * 60, x + (random() - 0.5) * 80, y + (random() - 0.5) * 80, x + (random() - 0.5) * 90, y + (random() - 0.5) * 90);
      context.stroke();
      continue;
    }
    const radius = recipe.size[0] + random() * (recipe.size[1] - recipe.size[0]);
    context.beginPath();
    context.ellipse(x, y, radius, radius * (0.5 + random() * 0.5), random() * Math.PI, 0, Math.PI * 2);
    context.fill();
  }
}

/** A material's look tiled over a whole surface, for clumps and coated parts. */
function surfaceTexture(material: RecipeMaterial) {
  const recipe = dirt[material];
  if (!recipe) return undefined;
  return canvasTexture(
    `recipe-surface:${material}`,
    256,
    256,
    (context) => {
      context.fillStyle = recipe.base.replace(/[\d.]+\)$/, "1)");
      context.fillRect(0, 0, 256, 256);
      drawDirt(context, 256, recipe, seededRandom(hashSeed(material)));
    },
    [2, 2],
  );
}

/** An irregular splotch with a ragged edge on a transparent background. */
function patchTexture(material: RecipeMaterial, color: string, seed: number) {
  const recipe = dirt[material] ?? { base: color, specks: [color], count: 0, size: [1, 1] as [number, number] };
  return canvasTexture(`recipe-patch:${material}:${color}:${seed % 4}`, 256, 256, (context) => {
    const random = seededRandom(seed % 4 + 3);
    context.clearRect(0, 0, 256, 256);
    context.save();
    context.beginPath();
    for (let lobe = 0; lobe < 5; lobe++) {
      const centerX = 128 + (random() - 0.5) * 90;
      const centerY = 128 + (random() - 0.5) * 90;
      const radius = 50 + random() * 40;
      for (let point = 0; point <= 24; point++) {
        const angle = (point / 24) * Math.PI * 2;
        const wobble = radius * (0.8 + random() * 0.3);
        const x = Math.min(250, Math.max(6, centerX + Math.cos(angle) * wobble));
        const y = Math.min(250, Math.max(6, centerY + Math.sin(angle) * wobble));
        context[point ? "lineTo" : "moveTo"](x, y);
      }
      context.closePath();
    }
    context.clip("nonzero");
    context.fillStyle = recipe.base;
    context.fillRect(0, 0, 256, 256);
    drawDirt(context, 256, recipe, random);
    context.restore();
  });
}

function labelTexture(text: string, ink: string, aspect: number) {
  const canvasWidth = 512;
  const canvasHeight = Math.round(Math.min(512, Math.max(48, canvasWidth / aspect)));
  return canvasTexture(`recipe-label:${text}:${ink}:${canvasHeight}`, canvasWidth, canvasHeight, (context) => {
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.fillStyle = ink;
    context.textAlign = "center";
    context.textBaseline = "middle";
    const lines = text.split("\n").slice(0, 4);
    let fontSize = (canvasHeight * 0.72) / lines.length;
    context.font = `700 ${fontSize}px system-ui, sans-serif`;
    const widest = Math.max(...lines.map((line) => context.measureText(line).width));
    if (widest > canvasWidth * 0.9) fontSize *= (canvasWidth * 0.9) / widest;
    context.font = `700 ${fontSize}px system-ui, sans-serif`;
    lines.forEach((line, index) => context.fillText(line, canvasWidth / 2, canvasHeight / 2 + (index - (lines.length - 1) / 2) * fontSize * 1.1));
  });
}

/* ---------- materials ---------- */

type Preset = { color: string; roughness: number; metalness: number; opacity?: number; map?: () => THREE.Texture | undefined; seeThrough?: boolean; cutout?: boolean; emissive?: boolean };

const presets: Record<RecipeMaterial, Preset> = {
  white_enamel: { color: "#f3f4f6", roughness: 0.32, metalness: 0.05 },
  stainless: { color: "#eef0f3", roughness: 0.3, metalness: 0.55, map: brushedTexture },
  chrome: { color: "#e4e8ee", roughness: 0.14, metalness: 0.95 },
  plastic: { color: "#9aa1a9", roughness: 0.5, metalness: 0.05 },
  black_plastic: { color: "#2a2d32", roughness: 0.5, metalness: 0.05 },
  white_plastic: { color: "#eceef0", roughness: 0.45, metalness: 0 },
  rubber: { color: "#26282b", roughness: 0.9, metalness: 0 },
  glass: { color: "#cfe3ee", roughness: 0.05, metalness: 0.1, opacity: 0.35, seeThrough: true },
  ceramic: { color: "#fbfbf8", roughness: 0.12, metalness: 0 },
  brass: { color: "#c9a24a", roughness: 0.3, metalness: 0.85 },
  copper: { color: "#c27a4a", roughness: 0.32, metalness: 0.85 },
  painted_metal: { color: "#6f7a86", roughness: 0.45, metalness: 0.3 },
  cast_iron: { color: "#3b3d40", roughness: 0.7, metalness: 0.4 },
  aluminum: { color: "#d0d4d9", roughness: 0.35, metalness: 0.7, map: brushedTexture },
  wood: { color: "#ffffff", roughness: 0.7, metalness: 0, map: woodTexture },
  cardboard: { color: "#c9a878", roughness: 0.9, metalness: 0 },
  pleated_filter: { color: "#ffffff", roughness: 0.85, metalness: 0, map: pleatTexture },
  foil: { color: "#ffffff", roughness: 0.35, metalness: 0.7, map: foilTexture },
  perforated_metal: { color: "#ffffff", roughness: 0.38, metalness: 0.55, map: perforatedTexture },
  screen_mesh: { color: "#9aa1a9", roughness: 0.5, metalness: 0.3, map: screenMeshTexture, cutout: true },
  chain: { color: "#ffffff", roughness: 0.35, metalness: 0.8, map: chainTexture },
  glow: { color: "#ffb347", roughness: 0.3, metalness: 0, emissive: true },
  water: { color: "#7fbbe6", roughness: 0.05, metalness: 0.1, opacity: 0.35, seeThrough: true },
  grime: { color: "#ffffff", roughness: 0.95, metalness: 0, map: () => surfaceTexture("grime") },
  lint: { color: "#ffffff", roughness: 1, metalness: 0, map: lintTexture, cutout: true },
  food_scraps: { color: "#ffffff", roughness: 0.9, metalness: 0, map: () => surfaceTexture("food_scraps") },
  rust: { color: "#ffffff", roughness: 0.9, metalness: 0.2, map: () => surfaceTexture("rust") },
  mineral_scale: { color: "#ffffff", roughness: 0.95, metalness: 0, map: () => surfaceTexture("mineral_scale") },
  hair: { color: "#ffffff", roughness: 0.8, metalness: 0, map: () => surfaceTexture("hair") },
  oil: { color: "#2a1e12", roughness: 0.12, metalness: 0.2 },
  clear: { color: "#dfe8ee", roughness: 0.1, metalness: 0, opacity: 0.16, seeThrough: true },
};

/** Debris looks: these materials are drawn as their own texture on patches. */
const debrisMaterials = new Set<RecipeMaterial>(["grime", "lint", "food_scraps", "rust", "mineral_scale", "hair", "oil", "water"]);

function validColor(color: string) {
  return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(color.trim()) ? color.trim() : "";
}

function Material({ node, map, doubleSide }: { node: RecipeNode; map?: THREE.Texture; doubleSide?: boolean }) {
  const preset = presets[node.material] ?? presets.plastic;
  const tint = validColor(node.color);
  const texture = map ?? preset.map?.();
  // A textured material keeps its drawn colours; a tint then multiplies over them, so stay light.
  const color = tint || preset.color;
  return (
    <meshStandardMaterial
      color={color}
      roughness={preset.roughness}
      metalness={preset.metalness}
      map={texture ?? null}
      transparent={preset.opacity !== undefined || preset.cutout}
      opacity={preset.opacity ?? 1}
      alphaTest={preset.cutout ? 0.2 : 0}
      depthWrite={!preset.seeThrough}
      side={doubleSide || preset.seeThrough || preset.cutout ? THREE.DoubleSide : THREE.FrontSide}
      emissive={preset.emissive ? color : "#000000"}
      emissiveIntensity={preset.emissive ? 1.1 : 1}
    />
  );
}

/* ---------- geometry ---------- */

type Bar = [THREE.Vector3, THREE.Vector3];

/** Many thin wires merged into one geometry, so a rack is one mesh instead of hundreds. */
function wireGeometry(bars: Bar[], radius: number) {
  const up = new THREE.Vector3(0, 1, 0);
  const pieces = bars.map(([start, end]) => {
    const span = end.clone().sub(start);
    const piece = new THREE.CylinderGeometry(radius, radius, span.length(), 6, 1, true);
    piece.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, span.normalize()));
    const middle = start.clone().add(end).multiplyScalar(0.5);
    piece.translate(middle.x, middle.y, middle.z);
    return piece;
  });
  const merged = mergeGeometries(pieces) ?? new THREE.BufferGeometry();
  pieces.forEach((piece) => piece.dispose());
  return merged;
}

function wireGrid(gridWidth: number, gridDepth: number, spacing: number) {
  const step = Math.max(spacing, Math.max(gridWidth, gridDepth) / 60);
  const radius = Math.min(0.006, Math.max(0.0012, step * 0.09));
  const halfWidth = gridWidth / 2;
  const halfDepth = gridDepth / 2;
  const point = (x: number, z: number) => new THREE.Vector3(x, 0, z);
  const bars: Bar[] = [
    [point(-halfWidth, -halfDepth), point(halfWidth, -halfDepth)],
    [point(-halfWidth, halfDepth), point(halfWidth, halfDepth)],
    [point(-halfWidth, -halfDepth), point(-halfWidth, halfDepth)],
    [point(halfWidth, -halfDepth), point(halfWidth, halfDepth)],
  ];
  for (let x = -halfWidth + step; x < halfWidth - step / 3; x += step) bars.push([point(x, -halfDepth), point(x, halfDepth)]);
  const crossStep = step * 3;
  for (let z = -halfDepth + crossStep; z < halfDepth - crossStep / 3; z += crossStep) bars.push([new THREE.Vector3(-halfWidth, radius * 1.6, z), new THREE.Vector3(halfWidth, radius * 1.6, z)]);
  return wireGeometry(bars, radius);
}

function roundedRectangle<T extends THREE.Path>(path: T, left: number, bottom: number, right: number, top: number, radius: number) {
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

/** A bevelled plate in the XY plane, centred on its thickness, with round and rectangular holes. */
function panelGeometry(panelWidth: number, panelHeight: number, thickness: number, holes: number[][]) {
  const corner = Math.min(0.012, panelWidth * 0.08, panelHeight * 0.08);
  const shape = roundedRectangle(new THREE.Shape(), -panelWidth / 2, -panelHeight / 2, panelWidth / 2, panelHeight / 2, corner);
  for (const hole of holes) {
    if (hole.length < 3 || hole.some((value) => !Number.isFinite(value))) continue;
    const [x, y] = hole;
    if (hole.length === 3) {
      const radius = Math.abs(hole[2]);
      if (radius <= 0 || Math.abs(x) + radius > panelWidth / 2 || Math.abs(y) + radius > panelHeight / 2) continue;
      const path = new THREE.Path();
      path.absarc(x, y, radius, 0, Math.PI * 2, true);
      shape.holes.push(path);
    } else {
      const holeWidth = Math.abs(hole[2]);
      const holeHeight = Math.abs(hole[3]);
      if (Math.abs(x) + holeWidth / 2 > panelWidth / 2 || Math.abs(y) + holeHeight / 2 > panelHeight / 2) continue;
      const radius = Math.min(0.006, holeWidth * 0.2, holeHeight * 0.2);
      shape.holes.push(roundedRectangle(new THREE.Path(), x - holeWidth / 2, y - holeHeight / 2, x + holeWidth / 2, y + holeHeight / 2, radius));
    }
  }
  const bevel = Math.min(0.003, thickness * 0.3);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.0005, thickness - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 32 });
  geometry.translate(0, 0, -thickness / 2 + bevel);
  // Planar UVs in metres would tile a texture far too often; normalise them to the panel.
  const uv = geometry.attributes.uv;
  for (let index = 0; index < uv.count; index++) uv.setXY(index, uv.getX(index) / panelWidth + 0.5, uv.getY(index) / panelHeight + 0.5);
  return geometry;
}

/** A lumpy blob: a sphere pushed in and out by a few seeded waves. */
function clumpGeometry(seed: number) {
  const geometry = new THREE.IcosahedronGeometry(0.5, 3);
  const random = seededRandom(seed);
  const waves = Array.from({ length: 5 }, () => ({ direction: new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize(), frequency: 3 + random() * 5, phase: random() * 6 }));
  const position = geometry.attributes.position;
  const vertex = new THREE.Vector3();
  for (let index = 0; index < position.count; index++) {
    vertex.fromBufferAttribute(position, index);
    const bump = waves.reduce((total, wave) => total + Math.sin(vertex.dot(wave.direction) * wave.frequency + wave.phase), 0);
    vertex.multiplyScalar(1 + bump * 0.045);
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function profilePoints(points: number[][]) {
  return points.filter((point) => point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1])).map(([radius, y]) => new THREE.Vector2(Math.max(0.0001, radius), y));
}

function pathCurve(points: number[][]) {
  const vectors = points.filter((point) => point.length >= 3 && point.every(Number.isFinite)).map(([x, y, z]) => new THREE.Vector3(x, y, z));
  if (vectors.length < 2) return null;
  const closed = vectors.length > 3 && vectors[0].distanceTo(vectors[vectors.length - 1]) < 1e-3;
  if (closed) vectors.pop();
  return new THREE.CatmullRomCurve3(vectors, closed, "centripetal");
}

const sweep = (value: number | undefined) => (value && value > 0 && value < 360 ? degrees(value) : Math.PI * 2);

/** The geometry for one node, or null for groups and labels (drawn separately). */
function buildGeometry(node: RecipeNode): THREE.BufferGeometry | null {
  const size = node.size ?? [];
  const [first, second, third] = [size[0], size[1], size[2]];
  switch (node.shape) {
    case "box":
      return new THREE.BoxGeometry(clampSize(first, 0.1), clampSize(second, 0.1), clampSize(third, 0.1));
    case "rounded_box": {
      const [boxWidth, boxHeight, boxDepth] = [clampSize(first, 0.1), clampSize(second, 0.1), clampSize(third, 0.1)];
      return new RoundedBoxGeometry(boxWidth, boxHeight, boxDepth, 3, Math.min(boxWidth, boxHeight, boxDepth) * 0.2);
    }
    case "panel":
      return panelGeometry(clampSize(first, 0.3), clampSize(second, 0.3), clampSize(third, 0.01), node.points ?? []);
    case "cylinder": {
      const top = clampSize(first, 0.1) / 2;
      return new THREE.CylinderGeometry(top, third && third > 0 ? clampSize(third, 0.1) / 2 : top, clampSize(second, 0.1), 48);
    }
    case "cone":
      return new THREE.ConeGeometry(clampSize(first, 0.1) / 2, clampSize(second, 0.1), 48);
    case "tube": {
      const outer = clampSize(first, 0.05) / 2;
      const inner = Math.max(0.0002, outer - clampSize(third, outer * 0.15));
      const half = clampSize(second, 0.1) / 2;
      const profile = [new THREE.Vector2(inner, -half), new THREE.Vector2(outer, -half), new THREE.Vector2(outer, half), new THREE.Vector2(inner, half), new THREE.Vector2(inner, -half)];
      return new THREE.LatheGeometry(profile, 48);
    }
    case "sphere": {
      const geometry = new THREE.SphereGeometry(0.5, 40, 24);
      const diameter = clampSize(first, 0.1);
      geometry.scale(diameter, clampSize(second, diameter), clampSize(third, diameter));
      return geometry;
    }
    case "capsule": {
      const radius = clampSize(first, 0.05) / 2;
      return new THREE.CapsuleGeometry(radius, Math.max(0.0001, clampSize(second, 0.15) - radius * 2), 8, 24);
    }
    case "torus":
      return new THREE.TorusGeometry(clampSize(first, 0.1) / 2, clampSize(second, 0.01) / 2, 16, 64, sweep(third));
    case "lathe": {
      const profile = profilePoints(node.points ?? []);
      if (profile.length < 2) return null;
      const geometry = new THREE.LatheGeometry(profile, 56, 0, sweep(first));
      // Oval basins and bowls: stretch the revolved shape across and front to back.
      geometry.scale(second && second > 0 ? Math.min(4, second) : 1, 1, third && third > 0 ? Math.min(4, third) : 1);
      return geometry;
    }
    case "hose": {
      const curve = pathCurve(node.points ?? []);
      if (!curve) return null;
      return new THREE.TubeGeometry(curve, Math.min(240, Math.max(24, Math.round(curve.getLength() * 120))), clampSize(first, 0.02) / 2, 16, curve.closed);
    }
    case "wire_grid":
      return wireGrid(clampSize(first, 0.4), clampSize(second, 0.4), clampSize(third, 0.025));
    case "plane":
      return new THREE.PlaneGeometry(clampSize(first, 0.2), clampSize(second, 0.2));
    case "patch": {
      const geometry = new THREE.PlaneGeometry(clampSize(first, 0.1), clampSize(second, 0.1));
      geometry.rotateX(-Math.PI / 2);
      return geometry;
    }
    case "clump": {
      const geometry = clumpGeometry(hashSeed(node.id));
      geometry.scale(clampSize(first, 0.05), clampSize(second, 0.04), clampSize(third, 0.05));
      return geometry;
    }
    default:
      return null;
  }
}

/** A hose's texture repeats along its length, so ribs and links keep their real spacing. */
function hoseTexture(node: RecipeNode, geometry: THREE.BufferGeometry | null) {
  if (node.shape !== "hose" || !geometry || !(node.material === "foil" || node.material === "chain")) return undefined;
  const curve = (geometry as THREE.TubeGeometry).parameters?.path;
  const length = curve ? curve.getLength() : 1;
  const base = node.material === "chain" ? chainTexture() : ribTexture("#9aa1aa");
  const texture = base.clone();
  const period = node.material === "chain" ? 0.05 : Math.max(0.012, clampSize(node.size?.[0], 0.1) * 0.25);
  texture.repeat.set(Math.max(1, Math.round(length / period)), 1);
  texture.needsUpdate = true;
  return texture;
}

function LabelMesh({ node }: { node: RecipeNode }) {
  const labelWidth = clampSize(node.size?.[0], 0.1);
  const labelHeight = clampSize(node.size?.[1], 0.04);
  const ink = validColor(node.color) || "#1d2125";
  const texture = useMemo(() => labelTexture(node.text || " ", ink, labelWidth / labelHeight), [node.text, ink, labelWidth, labelHeight]);
  const backing = node.material !== "clear";
  const backingNode = useMemo(() => ({ ...node, color: "" }), [node]);
  return (
    <group>
      {backing && (
        <mesh position={[0, 0, -0.0004]} receiveShadow>
          <planeGeometry args={[labelWidth, labelHeight]} />
          <Material node={backingNode} />
        </mesh>
      )}
      <mesh position={[0, 0, 0.0004]}>
        <planeGeometry args={[labelWidth * 0.94, labelHeight * 0.9]} />
        <meshStandardMaterial map={texture} transparent alphaTest={0.05} roughness={0.6} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
    </group>
  );
}

function ShapeMesh({ node }: { node: RecipeNode }) {
  const geometry = useMemo(() => buildGeometry(node), [node]);
  const map = useMemo(() => {
    if (node.shape === "patch") return node.material === "lint" ? lintTexture() : patchTexture(node.material, presets[node.material]?.color ?? "#888888", hashSeed(node.id));
    return hoseTexture(node, geometry);
  }, [node, geometry]);
  if (node.shape === "label") return <LabelMesh node={node} />;
  if (!geometry) return null;
  const solid = !presets[node.material]?.seeThrough && node.shape !== "patch";
  const doubleSide = node.shape === "lathe" || node.shape === "plane" || node.shape === "patch" || node.shape === "tube";
  // Patches carry their own drawn look; for debris the texture already has the colours.
  const patchMap = node.shape === "patch" ? map : undefined;
  return (
    <mesh geometry={geometry} castShadow={solid} receiveShadow>
      {patchMap ? (
        <meshStandardMaterial map={patchMap} color={debrisMaterials.has(node.material) ? "#ffffff" : validColor(node.color) || "#ffffff"} transparent alphaTest={0.04} roughness={node.material === "water" || node.material === "oil" ? 0.08 : 0.95} side={THREE.DoubleSide} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
      ) : (
        <Material node={node} map={map} doubleSide={doubleSide} />
      )}
    </mesh>
  );
}

/* ---------- the tree ---------- */

type Tree = { roots: RecipeNode[]; children: Map<string, RecipeNode[]>; parts: Set<string> };

function buildTree(recipe: Recipe): Tree {
  const ids = new Set(recipe.nodes.map((node) => node.id));
  const children = new Map<string, RecipeNode[]>();
  const roots: RecipeNode[] = [];
  for (const node of recipe.nodes) {
    if (node.parent && node.parent !== node.id && ids.has(node.parent)) {
      const siblings = children.get(node.parent) ?? [];
      siblings.push(node);
      children.set(node.parent, siblings);
    } else roots.push(node);
  }
  return { roots, children, parts: new Set(recipe.parts.map((part) => part.node)) };
}

const triple = (values: number[] | undefined, scale = 1): [number, number, number] => [0, 1, 2].map((index) => (Number.isFinite(values?.[index]) ? (values![index] as number) * scale : 0)) as [number, number, number];

function NodeView({ node, tree, depth }: { node: RecipeNode; tree: Tree; depth: number }) {
  const position = triple(node.position);
  const rotation = triple(node.rotation, Math.PI / 180);
  // Nodes caught in a parent cycle are never reached from a root, and depth stops runaway nesting.
  const content: ReactNode =
    depth > 24 ? null : (
      <>
        <ShapeMesh node={node} />
        {(tree.children.get(node.id) ?? []).map((child) => (
          <NodeView key={child.id} node={child} tree={tree} depth={depth + 1} />
        ))}
      </>
    );
  if (tree.parts.has(node.id))
    return (
      <RigPart id={node.id} position={position} rotation={rotation}>
        {content}
      </RigPart>
    );
  const [count, stepX, stepY, stepZ, spin] = node.repeat ?? [];
  const copies = Math.min(64, Math.max(1, Math.floor(count || 1)));
  return (
    <>
      {Array.from({ length: copies }, (_, index) => (
        <group key={index} rotation={[0, degrees((spin || 0) * index), 0]}>
          <group position={[position[0] + (stepX || 0) * index, position[1] + (stepY || 0) * index, position[2] + (stepZ || 0) * index]} rotation={rotation}>
            {content}
          </group>
        </group>
      ))}
    </>
  );
}

export function RecipeModel({ recipe }: { recipe: Recipe }) {
  const tree = useMemo(() => buildTree(recipe), [recipe]);
  return (
    <group>
      {tree.roots.map((node) => (
        <NodeView key={node.id} node={node} tree={tree} depth={0} />
      ))}
    </group>
  );
}

/** A generated appliance as a rig module: catalog derived from the recipe's parts, one demo step per part. */
export function recipeRig(recipe: Recipe, matches: string[] = []): RigModule {
  const catalog = recipeCatalog(recipe, matches);
  const Model = () => <RecipeModel recipe={recipe} />;
  return { catalog, Model, sampleSteps: sampleSteps(catalog) };
}
