"use client";

import { Edges, RoundedBox } from "@react-three/drei";
import { useMemo, type ReactNode } from "react";
import * as THREE from "three";
import type { Beat, RigCatalog } from "../../lib/rig/types";
import catalogJson from "./catalogs/microwave_otr.json";
import { ApplianceBulb, blackGlass, blotchTexture, brushedTexture, chrome, Drift, GlowWith, kitchenTexture, PanelWithHoles, roundedHole, seededRandom, stainless, TouchKey, Twin } from "./Range";
import type { RigModule } from "./registry";
import { RigPart } from "./RigRuntime";

/**
 * Whirlpool 30" over-the-range microwave hood (WMH31017H): left-hinged door, keypad on the right, vent grille across
 * the top front, grease filters and the cooktop light underneath. Metres; origin at the floor centre of the range below,
 * so the microwave hangs with its bottom 1.37 m up. Parts are modelled in the microwave's own frame (bottom centre).
 */
const mountY = 1.37;
const mountZ = -0.165;
const width = 0.76;
const height = 0.417;
const back = -0.195;
const front = 0.175;
const doorWidth = 0.565;
const doorHeight = 0.335;
const doorThickness = 0.04;
const cavity = { left: -0.355, right: 0.145, bottom: 0.0425, top: 0.3075, back: -0.17, front: 0.163 };
const cavityCenterX = (cavity.left + cavity.right) / 2;
const grilleBottom = 0.335;
const grilleHeight = 0.08;
const filterXs = [-0.2, 0.2];
const filterZ = -0.03;
const wallZ = -0.372;
const windowCenter: [number, number] = [-0.04, 0];

export const microwaveCatalog = catalogJson as RigCatalog;

// ---------- textures ----------

function perforationTexture() {
  return kitchenTexture(
    "microwave-perforation",
    64,
    64,
    (context, size) => {
      context.fillStyle = "rgba(8, 9, 11, 0.94)";
      context.fillRect(0, 0, size, size);
      context.globalCompositeOperation = "destination-out";
      for (const [x, y] of [
        [16, 16],
        [48, 16],
        [0, 48],
        [32, 48],
        [64, 48],
      ]) {
        context.beginPath();
        context.arc(x, y, 9, 0, Math.PI * 2);
        context.fillStyle = "rgba(0, 0, 0, 0.55)";
        context.fill();
      }
    },
    [26, 14],
  );
}

function expandedMetalTexture() {
  return kitchenTexture(
    "microwave-expanded-metal",
    64,
    64,
    (context, size) => {
      context.fillStyle = "#4b5056";
      context.fillRect(0, 0, size, size);
      context.strokeStyle = "#c9cfd6";
      context.lineWidth = 5;
      context.beginPath();
      for (const offset of [-size, 0, size]) {
        context.moveTo(offset, 0);
        context.lineTo(offset + size, size);
        context.moveTo(offset + size, 0);
        context.lineTo(offset, size);
      }
      context.stroke();
    },
    [12, 9],
  );
}

function charcoalTexture() {
  return kitchenTexture(
    "microwave-charcoal",
    128,
    128,
    (context, size) => {
      context.fillStyle = "#1b1c1e";
      context.fillRect(0, 0, size, size);
      const random = seededRandom(31);
      for (let grain = 0; grain < 1400; grain++) {
        const shade = 20 + Math.floor(random() * 50);
        context.fillStyle = `rgb(${shade}, ${shade}, ${shade + 3})`;
        context.fillRect(random() * size, random() * size, 1 + random() * 2, 1 + random() * 2);
      }
      context.strokeStyle = "rgba(170, 176, 184, 0.7)";
      context.lineWidth = 1;
      for (let line = 0; line <= size; line += 8) {
        context.beginPath();
        context.moveTo(line, 0);
        context.lineTo(line, size);
        context.moveTo(0, line);
        context.lineTo(size, line);
        context.stroke();
      }
    },
    [2, 2],
  );
}

/** Greasy film only around the edge, where the door meets the frame. */
function doorEdgeGrimeTexture() {
  return kitchenTexture("microwave-door-grime", 256, 160, (context, canvasWidth, canvasHeight) => {
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    const random = seededRandom(41);
    for (let blob = 0; blob < 140; blob++) {
      const edge = Math.floor(random() * 4);
      const along = random();
      const inset = random() * 12;
      const x = edge === 0 ? inset : edge === 1 ? canvasWidth - inset : along * canvasWidth;
      const y = edge === 2 ? inset : edge === 3 ? canvasHeight - inset : along * canvasHeight;
      context.fillStyle = random() > 0.4 ? "rgba(150, 104, 40, 0.75)" : "rgba(104, 66, 24, 0.85)";
      context.beginPath();
      context.arc(x, y, 3 + random() * 7, 0, Math.PI * 2);
      context.fill();
    }
  });
}

function keypadDisplayTexture() {
  return kitchenTexture("microwave-display", 512, 128, (context, canvasWidth, canvasHeight) => {
    context.fillStyle = "#050607";
    context.fillRect(0, 0, canvasWidth, canvasHeight);
    context.fillStyle = "#7fe0c8";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "500 88px ui-monospace, monospace";
    context.fillText("12:00", canvasWidth / 2, canvasHeight / 2 + 4);
  });
}

// ---------- small pieces ----------

/** A Phillips screw along +y: head at the origin, shank going up into whatever it holds. */
function Screw() {
  const metal = <meshStandardMaterial color="#c3c8cf" metalness={0.9} roughness={0.25} />;
  return (
    <group>
      <mesh position={[0, -0.0015, 0]}>
        <cylinderGeometry args={[0.0055, 0.006, 0.003, 20]} />
        {metal}
      </mesh>
      <mesh position={[0, 0.007, 0]}>
        <cylinderGeometry args={[0.002, 0.002, 0.014, 10]} />
        {metal}
      </mesh>
      {[0, Math.PI / 2].map((angle) => (
        <mesh key={angle} position={[0, -0.0031, 0]} rotation={[0, angle, 0]}>
          <boxGeometry args={[0.007, 0.0006, 0.0013]} />
          <meshStandardMaterial color="#3a3d42" />
        </mesh>
      ))}
    </group>
  );
}

function UnlitBox({ size, position, color, edge = "#b9b2a6", children }: { size: [number, number, number]; position: [number, number, number]; color: string; edge?: string; children?: ReactNode }) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshBasicMaterial color={color} />
      <Edges color={edge} />
      {children}
    </mesh>
  );
}

// ---------- the microwave ----------

function Housing() {
  const brushed = useMemo(() => brushedTexture(), []);
  const frameHoles = useMemo(() => [roundedHole(cavityCenterX - (-width / 2 + doorWidth / 2), (cavity.top + cavity.bottom) / 2 - doorHeight / 2, cavity.right - cavity.left, cavity.top - cavity.bottom, 0.01)], []);
  const bottomHoles = useMemo(() => [...filterXs.map((x) => roundedHole(x, filterZ, 0.262, 0.202, 0.004)), roundedHole(0, 0.11, 0.122, 0.077, 0.004)], []);
  const cavityDepth = cavity.front - cavity.back;
  const paint = <meshStandardMaterial color="#8d939a" metalness={0.55} roughness={0.38} />;
  return (
    <group>
      {/* painted sides, top and back */}
      {[-1, 1].map((side) => (
        <RoundedBox key={side} args={[0.012, height, front - back]} radius={0.004} position={[(side * (width - 0.012)) / 2, height / 2, (front + back) / 2]} castShadow>
          {paint}
        </RoundedBox>
      ))}
      <RoundedBox args={[width, 0.01, front - back + 0.02]} radius={0.003} position={[0, height - 0.005, (front + back) / 2 + 0.01]} castShadow>
        <meshStandardMaterial map={brushed} {...stainless} />
      </RoundedBox>
      <mesh position={[0, height / 2, back + 0.005]}>
        <boxGeometry args={[width - 0.02, height, 0.01]} />
        {paint}
      </mesh>
      {/* underside with openings for the two grease filters and the cooktop light */}
      <group position={[0, 0.006, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <PanelWithHoles panelWidth={width - 0.004} panelHeight={front - back} thickness={0.006} holes={bottomHoles} cornerRadius={0.004}>
          <meshStandardMaterial color="#7d838a" metalness={0.5} roughness={0.45} />
        </PanelWithHoles>
      </group>
      {filterXs.map((x) => (
        <mesh key={x} position={[x, 0.016, filterZ]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.26, 0.2]} />
          <meshBasicMaterial color="#0d0e10" />
        </mesh>
      ))}
      {/* the small stamped tabs that hold each filter's front edge */}
      {filterXs.map((x) => (
        <mesh key={x} position={[x, -0.002, filterZ + 0.106]}>
          <boxGeometry args={[0.03, 0.004, 0.012]} />
          <meshStandardMaterial color="#9aa0a7" metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
      {/* recess over the cooktop light */}
      <mesh position={[0, 0.028, 0.11]}>
        <boxGeometry args={[0.12, 0.045, 0.075]} />
        <meshStandardMaterial color="#d9dbdc" side={THREE.BackSide} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.047, 0.11]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.011, 0.011, 0.008, 16]} />
        <meshStandardMaterial color="#e8e2d2" roughness={0.6} />
      </mesh>
      {/* front frame around the cooking cavity, behind the door */}
      <group position={[-width / 2 + doorWidth / 2, doorHeight / 2, cavity.front]}>
        <PanelWithHoles panelWidth={doorWidth} panelHeight={doorHeight} thickness={0.01} holes={frameHoles} cornerRadius={0.004}>
          <meshStandardMaterial color="#cfd3d7" roughness={0.4} metalness={0.2} />
        </PanelWithHoles>
      </group>
      <RigPart id="microwave_cavity" position={[cavityCenterX, (cavity.top + cavity.bottom) / 2, cavity.back + cavityDepth / 2]}>
        <mesh>
          <boxGeometry args={[cavity.right - cavity.left, cavity.top - cavity.bottom, cavityDepth]} />
          <meshStandardMaterial color="#e3e5e7" side={THREE.BackSide} roughness={0.55} />
        </mesh>
      </RigPart>
      <pointLight position={[cavityCenterX, cavity.top - 0.04, 0.05]} intensity={0.12} distance={0.45} decay={2} color="#fff1d6" />
      {/* dark duct behind the vent grille */}
      <mesh position={[0, (grilleBottom + height) / 2 - 0.01, -0.05]}>
        <planeGeometry args={[width - 0.03, height - grilleBottom + 0.02]} />
        <meshBasicMaterial color="#0b0b0c" />
      </mesh>
      <mesh position={[0, cavity.top + 0.003, 0.07]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width - 0.03, 0.26]} />
        <meshStandardMaterial color="#2a2c30" roughness={0.8} />
      </mesh>
    </group>
  );
}

function CavityInside() {
  const splatter = useMemo(() => blotchTexture("microwave-splatter", ["rgba(160, 60, 30, 0.85)", "rgba(190, 120, 50, 0.8)", "rgba(110, 40, 20, 0.85)"], { blobs: 70, spread: 0.95, minRadius: 2, maxRadius: 9, seed: 13 }), []);
  const crumbs = useMemo(() => blotchTexture("microwave-crumbs", ["rgba(196, 150, 90, 0.95)", "rgba(150, 100, 50, 0.95)", "rgba(220, 190, 140, 0.95)"], { blobs: 90, spread: 0.9, minRadius: 1.5, maxRadius: 4, seed: 19 }), []);
  const grime = useMemo(() => doorEdgeGrimeTexture(), []);
  return (
    <group>
      <RigPart id="cavity_splatter" position={[cavityCenterX, 0.18, cavity.back + 0.002]}>
        <mesh>
          <planeGeometry args={[0.42, 0.2]} />
          <meshStandardMaterial map={splatter} transparent alphaTest={0.05} roughness={0.5} />
        </mesh>
      </RigPart>
      <RigPart id="cavity_crumbs" position={[cavityCenterX, cavity.bottom + 0.001, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.32, 0.28]} />
          <meshStandardMaterial map={crumbs} transparent alphaTest={0.05} roughness={0.9} />
        </mesh>
      </RigPart>
      <RigPart id="waveguide_cover" position={[cavity.right - 0.002, 0.2, -0.03]}>
        <mesh rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[0.12, 0.1]} />
          <meshStandardMaterial color="#cdbd94" roughness={0.7} />
        </mesh>
      </RigPart>
      <RigPart id="door_seal_area" position={[cavityCenterX, (cavity.top + cavity.bottom) / 2, cavity.front + 0.0105]}>
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh position={[(side * (cavity.right - cavity.left + 0.03)) / 2, 0, 0]}>
              <planeGeometry args={[0.028, cavity.top - cavity.bottom + 0.058]} />
              <meshStandardMaterial color="#c4c8cc" roughness={0.35} metalness={0.3} />
            </mesh>
            <mesh position={[0, (side * (cavity.top - cavity.bottom + 0.03)) / 2, 0]}>
              <planeGeometry args={[cavity.right - cavity.left + 0.058, 0.028]} />
              <meshStandardMaterial color="#c4c8cc" roughness={0.35} metalness={0.3} />
            </mesh>
          </group>
        ))}
      </RigPart>
      <RigPart id="door_seal_grime" position={[cavityCenterX, (cavity.top + cavity.bottom) / 2, cavity.front + 0.012]}>
        <mesh>
          <planeGeometry args={[cavity.right - cavity.left + 0.05, cavity.top - cavity.bottom + 0.05]} />
          <meshStandardMaterial map={grime} transparent alphaTest={0.05} roughness={0.6} />
        </mesh>
      </RigPart>
    </group>
  );
}

function Turntable() {
  const glass = <meshStandardMaterial color="#d6ecee" roughness={0.04} metalness={0.1} transparent opacity={0.42} />;
  const nylon = <meshStandardMaterial color="#3c3f44" roughness={0.6} />;
  return (
    <group>
      {/* drive hub poking up through the floor */}
      <RigPart id="turntable_hub" position={[cavityCenterX, cavity.bottom, 0]}>
        <mesh position={[0, 0.006, 0]}>
          <cylinderGeometry args={[0.011, 0.013, 0.012, 3]} />
          {nylon}
        </mesh>
        <mesh position={[0, 0.0012, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.0024, 32]} />
          <meshStandardMaterial color="#c7cbd0" roughness={0.5} />
        </mesh>
      </RigPart>
      <RigPart id="turntable_ring" position={[cavityCenterX, cavity.bottom + 0.009, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.095, 0.004, 10, 64]} />
          {nylon}
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.022, 0.004, 10, 32]} />
          {nylon}
        </mesh>
        {[0, 1, 2].map((index) => {
          const angle = (index / 3) * Math.PI * 2;
          return (
            <group key={index} rotation={[0, angle, 0]}>
              <mesh position={[0.058, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.003, 0.003, 0.074, 8]} />
                {nylon}
              </mesh>
              <mesh position={[0.095, -0.0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.009, 0.009, 0.007, 20]} />
                <meshStandardMaterial color="#202226" roughness={0.5} />
              </mesh>
            </group>
          );
        })}
      </RigPart>
      <RigPart id="turntable_plate" position={[cavityCenterX, cavity.bottom + 0.02, 0]}>
        <mesh>
          <cylinderGeometry args={[0.157, 0.152, 0.004, 64]} />
          {glass}
        </mesh>
        <mesh position={[0, 0.006, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.152, 0.005, 10, 72]} />
          {glass}
        </mesh>
        <mesh position={[0, -0.004, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.095, 0.003, 8, 64]} />
          {glass}
        </mesh>
      </RigPart>
    </group>
  );
}

function Door() {
  const brushed = useMemo(() => brushedTexture(), []);
  const perforation = useMemo(() => perforationTexture(), []);
  const skinHoles = useMemo(() => [roundedHole(windowCenter[0], windowCenter[1], 0.4, 0.21, 0.012)], []);
  const bandHoles = useMemo(() => [roundedHole(windowCenter[0], windowCenter[1], 0.36, 0.18, 0.01)], []);
  const innerHoles = useMemo(() => [roundedHole(windowCenter[0], windowCenter[1], 0.36, 0.2, 0.01)], []);
  const half = doorThickness / 2;
  return (
    // Hinged on the left front edge; the right side swings out toward the user.
    <RigPart id="microwave_door" position={[-width / 2, doorHeight / 2, front + half]}>
      <group position={[doorWidth / 2, 0, 0]}>
        <group position={[0, 0, half - 0.005]}>
          <PanelWithHoles panelWidth={doorWidth} panelHeight={doorHeight} thickness={0.004} holes={skinHoles} cornerRadius={0.008}>
            <meshStandardMaterial map={brushed} {...stainless} />
          </PanelWithHoles>
        </group>
        <group position={[0, 0, half - 0.012]}>
          <PanelWithHoles panelWidth={doorWidth - 0.02} panelHeight={doorHeight - 0.02} thickness={0.005} holes={bandHoles} cornerRadius={0.008}>
            <meshPhysicalMaterial {...blackGlass} clearcoat={1} />
          </PanelWithHoles>
        </group>
        <mesh position={[windowCenter[0], windowCenter[1], half - 0.009]}>
          <planeGeometry args={[0.37, 0.19]} />
          <meshStandardMaterial map={perforation} transparent roughness={0.2} />
        </mesh>
        <mesh position={[windowCenter[0], windowCenter[1], half - 0.0045]}>
          <planeGeometry args={[0.4, 0.21]} />
          <meshPhysicalMaterial color="#1a1f25" roughness={0.03} transparent opacity={0.25} clearcoat={1} />
        </mesh>
        {/* inner face that seals against the frame */}
        <group position={[0, 0, -half]}>
          <PanelWithHoles panelWidth={doorWidth - 0.006} panelHeight={doorHeight - 0.006} thickness={0.006} holes={innerHoles} cornerRadius={0.006}>
            <meshStandardMaterial color="#d3d6da" roughness={0.4} />
          </PanelWithHoles>
        </group>
        <mesh position={[windowCenter[0], windowCenter[1], -half + 0.003]}>
          <planeGeometry args={[0.36, 0.2]} />
          <meshStandardMaterial map={perforation} transparent roughness={0.3} side={THREE.DoubleSide} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[(side * (doorWidth - 0.006)) / 2, 0, 0]}>
            <boxGeometry args={[0.006, doorHeight, doorThickness - 0.006]} />
            <meshStandardMaterial color="#5d6269" metalness={0.5} roughness={0.4} />
          </mesh>
        ))}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[0, (side * (doorHeight - 0.006)) / 2, 0]}>
            <boxGeometry args={[doorWidth, 0.006, doorThickness - 0.006]} />
            <meshStandardMaterial color="#5d6269" metalness={0.5} roughness={0.4} />
          </mesh>
        ))}
        {/* vertical pull handle on the free edge */}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[doorWidth / 2 - 0.035, side * 0.11, half + 0.018]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.008, 0.01, 0.036, 16]} />
            <meshStandardMaterial {...chrome} />
          </mesh>
        ))}
        <mesh position={[doorWidth / 2 - 0.035, 0, half + 0.037]} castShadow>
          <cylinderGeometry args={[0.011, 0.011, 0.27, 24]} />
          <meshStandardMaterial {...chrome} />
        </mesh>
      </group>
    </RigPart>
  );
}

const keyColumns = [0.229, 0.285, 0.341];
const keyRows = [0.255, 0.221, 0.187, 0.153, 0.119, 0.085, 0.045];
const keySize: [number, number] = [0.05, 0.026];

function Keypad() {
  const display = useMemo(() => keypadDisplayTexture(), []);
  const panelLeft = doorWidth - width / 2;
  const panelCenterX = (panelLeft + width / 2) / 2;
  const plainKeys: [string, number, number][] = [
    ["TIMER", 2, 0],
    ["POPCORN", 0, 1],
    ["DEFROST", 1, 1],
    ["POWER", 2, 1],
    ["+30 SEC", 2, 5],
  ];
  const digits: [string, number, number][] = [
    ["1", 0, 2],
    ["2", 1, 2],
    ["3", 2, 2],
    ["4", 0, 3],
    ["5", 1, 3],
    ["6", 2, 3],
    ["7", 0, 4],
    ["8", 1, 4],
    ["9", 2, 4],
    ["0", 1, 5],
  ];
  const padCenter: [number, number] = [keyColumns[1], (keyRows[2] + keyRows[5]) / 2];
  const faceZ = front + doorThickness - 0.002;
  return (
    <group>
      <RoundedBox args={[width / 2 - panelLeft - 0.004, doorHeight, doorThickness]} radius={0.004} position={[panelCenterX, doorHeight / 2, front + doorThickness / 2 - 0.002]} castShadow>
        <meshStandardMaterial color="#5d6269" metalness={0.5} roughness={0.4} />
      </RoundedBox>
      <RigPart id="touch_control_panel" position={[panelCenterX, doorHeight / 2, faceZ + 0.0005]}>
        <mesh>
          <planeGeometry args={[width - doorWidth - 0.012, doorHeight - 0.01]} />
          <meshPhysicalMaterial {...blackGlass} clearcoat={1} clearcoatRoughness={0.05} />
        </mesh>
        <mesh position={[keyColumns[1] - panelCenterX, 0.298 - doorHeight / 2, 0.001]}>
          <planeGeometry args={[0.15, 0.032]} />
          <meshStandardMaterial map={display} emissiveMap={display} emissive="#ffffff" emissiveIntensity={0.9} roughness={0.2} />
        </mesh>
      </RigPart>
      <group position={[0, 0, faceZ + 0.001]}>
        <TouchKey id="vent_fan_button" label={"VENT\nFAN"} position={[keyColumns[0], keyRows[0], 0]} size={keySize} fontSize={30} />
        <TouchKey id="light_button" label={"LIGHT\nHI/LO"} position={[keyColumns[1], keyRows[0], 0]} size={keySize} fontSize={30} />
        <TouchKey id="clock_button" label="CLOCK" position={[keyColumns[0], keyRows[5], 0]} size={keySize} />
        <TouchKey id="cancel_button" label="CANCEL" position={[keyColumns[0], keyRows[6], 0]} size={keySize} textColor="#ff8f7a" />
        <TouchKey id="start_button" label="START" position={[(keyColumns[1] + keyColumns[2]) / 2, keyRows[6], 0]} size={[0.106, 0.026]} keyColor="#24292f" textColor="#7fe0c8" fontSize={30} />
        {plainKeys.map(([label, column, row]) => (
          <TouchKey key={label} label={label} position={[keyColumns[column], keyRows[row], 0]} size={keySize} fontSize={28} />
        ))}
        <RigPart id="number_pad" position={[padCenter[0], padCenter[1], 0]}>
          {digits.map(([label, column, row]) => (
            <TouchKey key={label} label={label} position={[keyColumns[column] - padCenter[0], keyRows[row] - padCenter[1], 0]} size={keySize} fontSize={44} />
          ))}
        </RigPart>
      </group>
    </group>
  );
}

function VentGrille() {
  const brushed = useMemo(() => brushedTexture(), []);
  const slots = useMemo(() => Array.from({ length: 44 }, (_, index) => roundedHole(-0.31 + (index * 0.62) / 43, -0.004, 0.0065, 0.044, 0.003)), []);
  const screwY = grilleBottom + grilleHeight - 0.017;
  const grilleZ = front + 0.03;
  const screwZ = grilleZ + 0.007;
  return (
    <group>
      {/* slide left, tilt the top forward on the bottom hooks, then lift out */}
      <Drift part="vent_grille_lift" offset={[-0.5, -0.22, 0.3]} after={0.55}>
        <RigPart id="vent_grille" position={[0, grilleBottom + grilleHeight / 2, grilleZ]}>
          <RigPart id="vent_grille_tilt">
            <RigPart id="vent_grille_lift">
              <PanelWithHoles panelWidth={width - 0.004} panelHeight={grilleHeight} thickness={0.004} holes={slots} cornerRadius={0.004}>
                <meshStandardMaterial map={brushed} {...stainless} />
              </PanelWithHoles>
              {/* bottom hooks */}
              {[-0.3, 0, 0.3].map((x) => (
                <mesh key={x} position={[x, -grilleHeight / 2 + 0.002, -0.008]}>
                  <boxGeometry args={[0.02, 0.004, 0.016]} />
                  <meshStandardMaterial color="#9aa0a7" metalness={0.6} roughness={0.4} />
                </mesh>
              ))}
            </RigPart>
          </RigPart>
        </RigPart>
      </Drift>
      <GlowWith owners={["vent_grille", "vent_grille_tilt"]} target="vent_grille_lift" />
      {/* two screws through the grille face near its top corners */}
      <Drift part="vent_grille_screws" offset={[0, -0.13, 0.2]}>
        <RigPart id="vent_grille_screws" position={[-0.345, screwY, screwZ]}>
          <group rotation={[-Math.PI / 2, 0, 0]}>
            <Screw />
          </group>
        </RigPart>
        <Twin of="vent_grille_screws" position={[0.345, screwY, screwZ]}>
          <group rotation={[-Math.PI / 2, 0, 0]}>
            <Screw />
          </group>
        </Twin>
      </Drift>
    </group>
  );
}

function BehindTheGrille() {
  const charcoal = useMemo(() => charcoalTexture(), []);
  const lightX = 0.12;
  return (
    <group>
      <RigPart id="charcoal_filter" position={[-0.18, 0.362, 0.07]}>
        <mesh>
          <boxGeometry args={[0.24, 0.012, 0.2]} />
          <meshStandardMaterial map={charcoal} roughness={0.9} />
        </mesh>
        {/* wire mesh face toward the front */}
        <mesh position={[0, 0, 0.1005]}>
          <planeGeometry args={[0.24, 0.012]} />
          <meshStandardMaterial color="#b9bfc6" metalness={0.8} roughness={0.35} />
        </mesh>
      </RigPart>
      {/* inside light: a small box with a flip-up cover, the bulb pointing forward */}
      <mesh position={[lightX, 0.372, 0.13]}>
        <boxGeometry args={[0.07, 0.05, 0.06]} />
        <meshStandardMaterial color="#d8dadc" side={THREE.BackSide} roughness={0.6} />
      </mesh>
      <mesh position={[lightX, 0.372, 0.1]}>
        <boxGeometry args={[0.07, 0.05, 0.002]} />
        <meshStandardMaterial color="#9aa0a7" roughness={0.5} />
      </mesh>
      <RigPart id="inside_light_bulb" position={[lightX, 0.372, 0.112]}>
        <ApplianceBulb globeRadius={0.0095} />
      </RigPart>
      <RigPart id="inside_light_cover" position={[lightX, 0.396, 0.162]}>
        <mesh position={[0, -0.0235, 0]}>
          <boxGeometry args={[0.066, 0.046, 0.003]} />
          <meshStandardMaterial color="#eef0f2" roughness={0.45} transparent opacity={0.85} />
        </mesh>
      </RigPart>
    </group>
  );
}

function Underside() {
  const mesh = useMemo(() => expandedMetalTexture(), []);
  const grease = useMemo(() => blotchTexture("microwave-grease", ["rgba(150, 100, 30, 0.7)", "rgba(110, 70, 20, 0.8)", "rgba(190, 140, 60, 0.6)"], { blobs: 60, spread: 0.95, minRadius: 8, maxRadius: 26, seed: 29 }), []);
  return (
    <group>
      {/* grease filters: slide back off the front tabs, then drop down and out */}
      <RigPart id="grease_filters" position={[0, 0, filterZ]}>
        <RigPart id="grease_filters_drop">
          {filterXs.map((x) => (
            <group key={x} position={[x, 0.006, 0]}>
              {[-1, 1].map((side) => (
                <group key={side}>
                  <mesh position={[(side * 0.126), 0, 0]}>
                    <boxGeometry args={[0.008, 0.009, 0.198]} />
                    <meshStandardMaterial color="#c9ced4" metalness={0.8} roughness={0.3} />
                  </mesh>
                  <mesh position={[0, 0, side * 0.096]}>
                    <boxGeometry args={[0.26, 0.009, 0.008]} />
                    <meshStandardMaterial color="#c9ced4" metalness={0.8} roughness={0.3} />
                  </mesh>
                </group>
              ))}
              <mesh position={[0, -0.004, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <planeGeometry args={[0.246, 0.186]} />
                <meshStandardMaterial map={mesh} metalness={0.7} roughness={0.35} side={THREE.DoubleSide} />
              </mesh>
              {/* finger ring at the front */}
              <mesh position={[0, -0.006, 0.082]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.009, 0.0018, 8, 20]} />
                <meshStandardMaterial {...chrome} />
              </mesh>
            </group>
          ))}
          {/* grease film on the underside; its frame is flipped so it peels downward */}
          <RigPart id="grease_filter_grease" position={[0, 0.0005, 0]} rotation={[Math.PI, 0, 0]}>
            {filterXs.map((x) => (
              <mesh key={x} position={[x, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[0.24, 0.18]} />
                <meshStandardMaterial map={grease} transparent alphaTest={0.05} roughness={0.35} />
              </mesh>
            ))}
          </RigPart>
        </RigPart>
      </RigPart>
      <GlowWith owners={["grease_filters"]} target="grease_filters_drop" />
      {/* cooktop light: screw at the front, cover hinged at the back, bulb pointing down */}
      <RigPart id="cooktop_light_bulb" position={[0, 0.042, 0.11]}>
        <group rotation={[Math.PI / 2, 0, 0]}>
          <ApplianceBulb globeRadius={0.011} />
        </group>
      </RigPart>
      <RigPart id="cooktop_light_cover" position={[0, -0.001, 0.0725]}>
        <mesh position={[0, -0.002, 0.0375]}>
          <boxGeometry args={[0.122, 0.004, 0.077]} />
          <meshStandardMaterial color="#8f959c" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0, -0.0042, 0.0375]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.09, 0.048]} />
          <meshStandardMaterial color="#f6f4ee" emissive="#fff3d6" emissiveIntensity={0.15} roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
      </RigPart>
      <Drift part="cooktop_light_screw" offset={[0.07, -0.07, 0.08]}>
        <RigPart id="cooktop_light_screw" position={[0, -0.006, 0.14]}>
          <Screw />
        </RigPart>
      </Drift>
    </group>
  );
}

function MicrowaveModel() {
  return (
    <group>
      <group position={[0, mountY, mountZ]}>
        <Housing />
        <CavityInside />
        <Turntable />
        <Door />
        <Keypad />
        <VentGrille />
        <BehindTheGrille />
        <Underside />
      </group>
      <Surroundings />
    </group>
  );
}

/** Unlit context: the wall, the wall cabinet above (right door open to show the outlet), and the range below. */
function Surroundings() {
  const cabinetBottom = mountY + height + 0.003;
  const cabinetTop = 2.42;
  const cabinetFront = -0.06;
  const cabinetHeight = cabinetTop - cabinetBottom;
  const cabinetCenterY = (cabinetBottom + cabinetTop) / 2;
  const cord = useMemo(() => new THREE.CatmullRomCurve3([new THREE.Vector3(0.2, 1.865, -0.335), new THREE.Vector3(0.21, 1.83, -0.32), new THREE.Vector3(0.24, 1.8, -0.3), new THREE.Vector3(0.24, cabinetBottom, -0.3)]), [cabinetBottom]);
  return (
    <group>
      <mesh position={[0, 1.3, wallZ]}>
        <planeGeometry args={[3.2, 2.6]} />
        <meshBasicMaterial color="#f3efe9" />
      </mesh>
      {/* wall cabinet */}
      <UnlitBox size={[width, 0.018, -wallZ + cabinetFront]} position={[0, cabinetBottom + 0.009, (wallZ + cabinetFront) / 2]} color="#e7e1d7" />
      <UnlitBox size={[width, 0.018, -wallZ + cabinetFront]} position={[0, cabinetTop - 0.009, (wallZ + cabinetFront) / 2]} color="#e7e1d7" />
      <UnlitBox size={[width - 0.04, 0.016, -wallZ + cabinetFront - 0.02]} position={[0, 2.12, (wallZ + cabinetFront) / 2]} color="#ddd6ca" />
      {[-1, 1].map((side) => (
        <UnlitBox key={side} size={[0.018, cabinetHeight, -wallZ + cabinetFront]} position={[(side * (width - 0.018)) / 2, cabinetCenterY, (wallZ + cabinetFront) / 2]} color="#e7e1d7" />
      ))}
      <mesh position={[0, cabinetCenterY, wallZ + 0.004]}>
        <planeGeometry args={[width - 0.03, cabinetHeight]} />
        <meshBasicMaterial color="#d8d1c4" />
      </mesh>
      <UnlitBox size={[width / 2 - 0.004, cabinetHeight, 0.02]} position={[-width / 4, cabinetCenterY, cabinetFront + 0.01]} color="#efe9df" />
      <group position={[width / 2, cabinetCenterY, cabinetFront + 0.01]} rotation={[0, 1.75, 0]}>
        <UnlitBox size={[width / 2 - 0.004, cabinetHeight, 0.02]} position={[-width / 4, 0, 0]} color="#efe9df" />
      </group>
      {/* outlet, cord and plug */}
      <UnlitBox size={[0.07, 0.115, 0.008]} position={[0.2, 1.88, wallZ + 0.008]} color="#f8f7f3" edge="#b0aaa0" />
      <mesh>
        <tubeGeometry args={[cord, 24, 0.0035, 8, false]} />
        <meshStandardMaterial color="#202226" roughness={0.6} />
      </mesh>
      <RigPart id="power_plug" position={[0.2, 1.865, wallZ + 0.03]}>
        <RoundedBox args={[0.034, 0.042, 0.03]} radius={0.006}>
          <meshStandardMaterial color="#25272b" roughness={0.6} />
        </RoundedBox>
      </RigPart>
      {/* the range below, flat and quiet */}
      <UnlitBox size={[width, 0.88, 0.64]} position={[0, 0.47, -0.015]} color="#34373b" edge="#55595f" />
      <UnlitBox size={[0.75, 0.67, 0.05]} position={[0, 0.52, 0.33]} color="#5e6369" edge="#73787f" />
      <UnlitBox size={[width, 0.014, 0.6]} position={[0, 0.918, 0.04]} color="#1d1e21" edge="#3b3e43" />
      <UnlitBox size={[width, 0.27, 0.07]} position={[0, 1.06, -0.3]} color="#26282b" edge="#45484d" />
      {[
        [-0.19, 0.165, 0.11],
        [-0.19, -0.09, 0.08],
        [0.19, -0.09, 0.08],
        [0.19, 0.165, 0.1],
      ].map(([x, z, radius]) => (
        <mesh key={`${x}${z}`} position={[x, 0.9262, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius - 0.004, radius, 48]} />
          <meshBasicMaterial color="#6f747b" />
        </mesh>
      ))}
    </group>
  );
}

const sampleSteps: { instruction: string; beats: Beat[] }[] = [
  {
    instruction: "Get the microwave to start",
    beats: [
      { part: "microwave_door", action: "open", caption: "Open the door" },
      { part: "microwave_door", action: "close", caption: "Close it firmly until it clicks" },
      { part: "cancel_button", action: "press", caption: "Hold Cancel three seconds" },
      { part: "power_plug", action: "look", caption: "Check the plug is tight" },
      { part: "start_button", action: "press", caption: "Heat a cup of water" },
    ],
  },
  {
    instruction: "Clean inside to stop sparks",
    beats: [
      { part: "cancel_button", action: "press", caption: "Press Cancel right away" },
      { part: "microwave_door", action: "open", caption: "Open, remove any metal" },
      { part: "cavity_splatter", action: "clean", caption: "Wipe walls with soapy cloth" },
      { part: "waveguide_cover", action: "look", caption: "Wipe this cover gently" },
      { part: "door_seal_grime", action: "clean", caption: "Wipe where door meets frame" },
      { part: "microwave_door", action: "close", caption: "Close the door" },
      { part: "start_button", action: "press", caption: "Test with a cup of water" },
    ],
  },
  {
    instruction: "Clean the grease and charcoal filters",
    beats: [
      { part: "vent_fan_button", action: "press", caption: "Turn the fan off" },
      { part: "grease_filters", action: "open", caption: "Slide filter back from tab" },
      { part: "grease_filters_drop", action: "open", caption: "Drop it down and out" },
      { part: "grease_filter_grease", action: "clean", caption: "Wash in warm soapy water" },
      { part: "vent_grille_screws", action: "remove", caption: "Remove the two grille screws" },
      { part: "vent_grille", action: "open", caption: "Slide the grille left" },
      { part: "vent_grille_tilt", action: "open", caption: "Tilt the top forward" },
      { part: "vent_grille_lift", action: "remove", caption: "Lift the grille out" },
      { part: "charcoal_filter", action: "remove", caption: "Pull out the old filter" },
      { part: "charcoal_filter", action: "insert", caption: "Slide in the new filter" },
      { part: "vent_grille_lift", action: "insert", caption: "Hook the grille back in" },
      { part: "vent_grille_tilt", action: "close", caption: "Tilt it back" },
      { part: "vent_grille", action: "close", caption: "Slide it right" },
      { part: "vent_grille_screws", action: "insert", caption: "Put both screws back" },
      { part: "grease_filters_drop", action: "close", caption: "Swing the filter back up" },
      { part: "grease_filters", action: "close", caption: "Slide toward tab to seat" },
    ],
  },
  {
    instruction: "Replace the cooktop light bulb",
    beats: [
      { part: "power_plug", action: "remove", caption: "Unplug the microwave" },
      { part: "cooktop_light_screw", action: "remove", caption: "Remove the cover screw" },
      { part: "cooktop_light_cover", action: "open", caption: "Swing the cover down" },
      { part: "cooktop_light_bulb", action: "remove", caption: "Twist out the old bulb" },
      { part: "cooktop_light_bulb", action: "insert", caption: "Screw in new bulb by hand" },
      { part: "cooktop_light_cover", action: "close", caption: "Close the cover flat" },
      { part: "cooktop_light_screw", action: "insert", caption: "Put the screw back" },
      { part: "power_plug", action: "insert", caption: "Plug it back in" },
      { part: "light_button", action: "press", caption: "Press Light to test" },
    ],
  },
  {
    instruction: "Clean and reseat the turntable",
    beats: [
      { part: "microwave_door", action: "open", caption: "Open the door" },
      { part: "turntable_plate", action: "remove", caption: "Lift the glass plate out" },
      { part: "turntable_ring", action: "remove", caption: "Lift out the support ring" },
      { part: "cavity_crumbs", action: "clean", caption: "Wipe crumbs off the floor" },
      { part: "turntable_ring", action: "insert", caption: "Set the ring in its groove" },
      { part: "turntable_plate", action: "insert", caption: "Set plate on the center hub" },
      { part: "microwave_door", action: "close", caption: "Close the door" },
      { part: "start_button", action: "press", caption: "Heat water, listen closely" },
    ],
  },
  {
    instruction: "Set the clock after a power cut",
    beats: [
      { part: "cancel_button", action: "press", caption: "Press Cancel" },
      { part: "clock_button", action: "press", caption: "Press Clock" },
      { part: "number_pad", action: "press", caption: "Type the time" },
      { part: "clock_button", action: "press", caption: "Press Clock again to save" },
    ],
  },
  {
    instruction: "Replace the inside light bulb",
    beats: [
      { part: "power_plug", action: "remove", caption: "Unplug the microwave" },
      { part: "vent_grille_screws", action: "remove", caption: "Remove the two grille screws" },
      { part: "vent_grille", action: "open", caption: "Slide the grille left" },
      { part: "vent_grille_tilt", action: "open", caption: "Tilt the top forward" },
      { part: "vent_grille_lift", action: "remove", caption: "Lift the grille out" },
      { part: "inside_light_cover", action: "open", caption: "Open the light cover" },
      { part: "inside_light_bulb", action: "remove", caption: "Twist out the old bulb" },
      { part: "inside_light_bulb", action: "insert", caption: "Screw in the new bulb" },
      { part: "inside_light_cover", action: "close", caption: "Close the light cover" },
      { part: "vent_grille_lift", action: "insert", caption: "Hook the grille back in" },
      { part: "vent_grille_tilt", action: "close", caption: "Tilt it back" },
      { part: "vent_grille", action: "close", caption: "Slide it right" },
      { part: "vent_grille_screws", action: "insert", caption: "Put both screws back" },
      { part: "power_plug", action: "insert", caption: "Plug in, open door to test" },
    ],
  },
];

export const rig: RigModule = { catalog: microwaveCatalog, Model: MicrowaveModel, sampleSteps };
