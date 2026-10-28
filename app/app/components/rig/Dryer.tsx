"use client";

import { RoundedBox } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { Beat, RigCatalog } from "../../lib/rig/types";
import catalogJson from "./catalogs/dryer_top_vent.json";
import type { RigModule } from "./registry";
import { RigPart } from "./RigRuntime";
import { foilTexture, lintTexture, perforatedTexture, screenMeshTexture } from "./textures";

/** Whirlpool WED5050LW top-load electric dryer (same cabinet as WED5010LW / WED6150PW), lint screen on the top panel. Metres, origin at the floor. */
const width = 0.686;
const height = 0.975;
const depth = 0.72;
const front = depth / 2;
const doorCenter: [number, number] = [0, 0.5];
const doorRadius = 0.27;
const openingRadius = 0.215;
const slotZ = -front + 0.2;

export const dryerCatalog = catalogJson as RigCatalog;

const enamel = { color: "#f3f4f6", roughness: 0.32, metalness: 0.05 };

/** A flat panel with holes, extruded to a small thickness and bevelled. */
function PanelWithHoles({ panelWidth, panelHeight, thickness, holes, color = enamel.color }: { panelWidth: number; panelHeight: number; thickness: number; holes: (THREE.Path | THREE.Shape)[]; color?: string }) {
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
    return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 48 });
  }, [panelWidth, panelHeight, thickness, holes]);
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={enamel.roughness} metalness={enamel.metalness} />
    </mesh>
  );
}

function circle(x: number, y: number, radius: number) {
  const path = new THREE.Path();
  path.absarc(x, y, radius, 0, Math.PI * 2, true);
  return path;
}

function rectangle(x: number, y: number, rectWidth: number, rectHeight: number) {
  const path = new THREE.Path();
  path.moveTo(x - rectWidth / 2, y - rectHeight / 2);
  path.lineTo(x - rectWidth / 2, y + rectHeight / 2);
  path.lineTo(x + rectWidth / 2, y + rectHeight / 2);
  path.lineTo(x + rectWidth / 2, y - rectHeight / 2);
  path.closePath();
  return path;
}

function Cabinet() {
  const frontHoles = useMemo(() => [circle(doorCenter[0], doorCenter[1] - height / 2, openingRadius)], []);
  const topHoles = useMemo(() => [rectangle(0, -slotZ, 0.31, 0.03)], []);
  return (
    <group>
      {/* front panel with the door opening */}
      <group position={[0, height / 2, front - 0.012]}>
        <PanelWithHoles panelWidth={width} panelHeight={height - 0.06} thickness={0.012} holes={frontHoles} />
      </group>
      {/* top panel with the lint slot, lying flat */}
      <group position={[0, height - 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <PanelWithHoles panelWidth={width} panelHeight={depth} thickness={0.012} holes={topHoles} />
      </group>
      {/* sides and back */}
      {[-1, 1].map((side) => (
        <RoundedBox key={side} args={[0.012, height - 0.03, depth]} radius={0.005} position={[(side * (width - 0.012)) / 2, (height - 0.03) / 2 + 0.03, 0]} castShadow receiveShadow>
          <meshStandardMaterial {...enamel} />
        </RoundedBox>
      ))}
      <mesh position={[0, height / 2, -front + 0.006]}>
        <boxGeometry args={[width - 0.02, height - 0.04, 0.012]} />
        <meshStandardMaterial color="#d7dadf" roughness={0.6} />
      </mesh>
      {/* toe kick */}
      <mesh position={[0, 0.022, front - 0.03]}>
        <boxGeometry args={[width - 0.04, 0.035, 0.04]} />
        <meshStandardMaterial color="#9aa0a8" roughness={0.7} />
      </mesh>
      {/* the slot rim the lint screen sits in */}
      <mesh position={[0, height + 0.002, slotZ]}>
        <boxGeometry args={[0.34, 0.006, 0.05]} />
        <meshStandardMaterial color="#cfd3d8" roughness={0.5} />
      </mesh>
    </group>
  );
}

function Drum() {
  const texture = useMemo(() => perforatedTexture(), []);
  return (
    <RigPart id="dryer_drum" position={[doorCenter[0], doorCenter[1], -0.02]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.6, 64, 1, true]} />
        <meshStandardMaterial map={texture} side={THREE.BackSide} metalness={0.55} roughness={0.38} />
      </mesh>
      <mesh position={[0, 0, -0.3]}>
        <circleGeometry args={[0.3, 64]} />
        <meshStandardMaterial map={texture} metalness={0.55} roughness={0.4} />
      </mesh>
      {/* tumbling baffles */}
      {[0, 1, 2].map((index) => {
        const angle = (index / 3) * Math.PI * 2 + 0.4;
        return (
          <mesh key={index} position={[Math.cos(angle) * 0.27, Math.sin(angle) * 0.27, 0]} rotation={[0, 0, angle]}>
            <boxGeometry args={[0.06, 0.03, 0.56]} />
            <meshStandardMaterial color="#e3e6ea" roughness={0.4} />
          </mesh>
        );
      })}
      {/* door seal */}
      <mesh position={[0, 0, front - 0.03 + 0.02]}>
        <torusGeometry args={[openingRadius + 0.004, 0.012, 16, 64]} />
        <meshStandardMaterial color="#2b2d31" roughness={0.8} />
      </mesh>
    </RigPart>
  );
}

function Door() {
  return (
    <RigPart id="dryer_door" position={[doorCenter[0], doorCenter[1], front + 0.03]}>
      {/* chrome rim */}
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[doorRadius, doorRadius, 0.05, 64]} />
        <meshStandardMaterial color="#f7f8fa" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.026]}>
        <torusGeometry args={[doorRadius - 0.012, 0.012, 16, 64]} />
        <meshStandardMaterial color="#c4cad2" metalness={0.85} roughness={0.25} />
      </mesh>
      {/* tinted window */}
      <mesh position={[0, 0, 0.027]}>
        <circleGeometry args={[0.185, 64]} />
        <meshStandardMaterial color="#3b4350" roughness={0.05} metalness={0.2} transparent opacity={0.72} />
      </mesh>
      {/* inner bowl seen when the door is open */}
      <mesh position={[0, 0, -0.03]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.17, 0.03, 48]} />
        <meshStandardMaterial color="#e9ebee" roughness={0.4} />
      </mesh>
      {/* handle on the right edge */}
      <RoundedBox args={[0.035, 0.14, 0.03]} radius={0.012} position={[doorRadius - 0.03, 0, 0.04]}>
        <meshStandardMaterial color="#c4cad2" metalness={0.8} roughness={0.25} />
      </RoundedBox>
    </RigPart>
  );
}

function LintScreen() {
  const mesh = useMemo(() => screenMeshTexture(), []);
  const lint = useMemo(() => lintTexture(), []);
  const frameWidth = 0.3;
  const frameHeight = 0.31;
  return (
    // Seated with its handle just above the top panel; slides straight up to come out.
    <RigPart id="lint_screen" position={[0, height - frameHeight / 2 + 0.012, slotZ]}>
      {/* frame */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[(side * (frameWidth - 0.02)) / 2, 0, 0]}>
          <boxGeometry args={[0.02, frameHeight, 0.022]} />
          <meshStandardMaterial color="#e8e6e1" roughness={0.55} />
        </mesh>
      ))}
      <mesh position={[0, -frameHeight / 2 + 0.01, 0]}>
        <boxGeometry args={[frameWidth, 0.02, 0.022]} />
        <meshStandardMaterial color="#e8e6e1" roughness={0.55} />
      </mesh>
      {/* top handle with a finger grip */}
      <RoundedBox args={[frameWidth + 0.02, 0.035, 0.03]} radius={0.01} position={[0, frameHeight / 2 + 0.008, 0]}>
        <meshStandardMaterial color="#d9d6cf" roughness={0.5} />
      </RoundedBox>
      <mesh position={[0, frameHeight / 2 + 0.012, 0.0155]}>
        <boxGeometry args={[0.09, 0.012, 0.002]} />
        <meshStandardMaterial color="#8d8a84" roughness={0.6} />
      </mesh>
      {/* the screen mesh, both faces */}
      {[0.006, -0.006].map((offset) => (
        <mesh key={offset} position={[0, 0.005, offset]} rotation={[0, offset < 0 ? Math.PI : 0, 0]}>
          <planeGeometry args={[frameWidth - 0.04, frameHeight - 0.03]} />
          <meshStandardMaterial map={mesh} transparent alphaTest={0.2} color="#9aa1a9" side={THREE.DoubleSide} roughness={0.5} />
        </mesh>
      ))}
      {/* the lint itself, a separate piece that peels off */}
      <RigPart id="lint" position={[0, 0.0, 0.009]}>
        <mesh>
          <planeGeometry args={[frameWidth - 0.05, frameHeight - 0.05, 12, 12]} />
          <meshStandardMaterial map={lint} transparent alphaTest={0.05} roughness={1} side={THREE.DoubleSide} />
        </mesh>
      </RigPart>
    </RigPart>
  );
}

function Console() {
  const consoleDepth = 0.15;
  const consoleHeight = 0.2;
  const tilt = -0.32;
  return (
    <group position={[0, height, -front + consoleDepth / 2]}>
      <RoundedBox args={[width, consoleHeight, consoleDepth]} radius={0.015} position={[0, consoleHeight / 2, 0]} castShadow>
        <meshStandardMaterial {...enamel} />
      </RoundedBox>
      {/* the sloped control face */}
      <group position={[0, consoleHeight / 2 + 0.01, consoleDepth / 2 + 0.002]} rotation={[tilt, 0, 0]}>
        <mesh>
          <planeGeometry args={[width - 0.04, consoleHeight - 0.05]} />
          <meshStandardMaterial color="#e6e8eb" roughness={0.35} />
        </mesh>
        <RigPart id="cycle_knob" position={[0.13, 0, 0.004]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.018]}>
            <cylinderGeometry args={[0.045, 0.048, 0.036, 48]} />
            <meshStandardMaterial color="#3a3f47" roughness={0.45} metalness={0.3} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.037]}>
            <torusGeometry args={[0.04, 0.004, 12, 48]} />
            <meshStandardMaterial color="#c9ced6" metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.03, 0.038]}>
            <boxGeometry args={[0.006, 0.022, 0.002]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
        </RigPart>
        {[
          ["power_button", -0.27],
          ["temperature_button", -0.17],
          ["options_button", -0.08],
          ["start_button", 0.27],
        ].map(([id, x]) => (
          <RigPart key={id as string} id={id as string} position={[x as number, -0.01, 0.004]}>
            <RoundedBox args={[0.05, 0.026, 0.012]} radius={0.005} position={[0, 0, 0.006]}>
              <meshStandardMaterial color={id === "start_button" ? "#2f6fdb" : "#ffffff"} roughness={0.4} />
            </RoundedBox>
          </RigPart>
        ))}
      </group>
    </group>
  );
}

function InsideDrum() {
  return (
    <group position={[doorCenter[0], doorCenter[1], 0]}>
      {/* moisture sensor strips near the bottom of the opening, with a film that wipes off */}
      {[-0.035, 0.035].map((x) => (
        <mesh key={x} position={[x, -0.2, 0.25]} rotation={[-0.5, 0, 0]}>
          <boxGeometry args={[0.012, 0.004, 0.09]} />
          <meshStandardMaterial color="#d6dbe1" metalness={0.95} roughness={0.15} />
        </mesh>
      ))}
      <RigPart id="moisture_sensor_film" position={[0, -0.198, 0.25]}>
        <mesh rotation={[-0.5, 0, 0]}>
          <boxGeometry args={[0.09, 0.002, 0.095]} />
          <meshStandardMaterial color="#e9e2c9" roughness={0.9} transparent opacity={0.55} />
        </mesh>
      </RigPart>
      {/* drum light at the back wall */}
      <RigPart id="drum_light_bulb" position={[0.14, 0.14, -0.31]}>
        <mesh>
          <sphereGeometry args={[0.025, 24, 16]} />
          <meshStandardMaterial color="#fff6d8" emissive="#ffe08a" emissiveIntensity={0.4} roughness={0.2} />
        </mesh>
      </RigPart>
    </group>
  );
}

function BehindTheDryer() {
  const foil = useMemo(() => foilTexture(), []);
  const curve = useMemo(
    () => new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.12, -front), new THREE.Vector3(0, 0.12, -front - 0.1), new THREE.Vector3(0.05, 0.25, -front - 0.18), new THREE.Vector3(0.12, 0.35, -front - 0.22)]),
    [],
  );
  return (
    <group>
      {/* wall behind */}
      <mesh position={[0, 1.1, -front - 0.24]} receiveShadow>
        <planeGeometry args={[3.2, 2.2]} />
        <meshBasicMaterial color="#f3efe9" toneMapped={false} />
      </mesh>
      <RigPart id="vent_hose">
        <mesh>
          <tubeGeometry args={[curve, 40, 0.05, 24, false]} />
          <meshStandardMaterial map={foil} metalness={0.7} roughness={0.35} />
        </mesh>
        <mesh position={[0.12, 0.35, -front - 0.235]}>
          <cylinderGeometry args={[0.065, 0.065, 0.01, 32]} />
          <meshStandardMaterial color="#d0d4d9" metalness={0.6} roughness={0.3} />
        </mesh>
      </RigPart>
      {/* outlet and plug */}
      <mesh position={[-0.22, 0.55, -front - 0.235]}>
        <boxGeometry args={[0.08, 0.12, 0.01]} />
        <meshStandardMaterial color="#f7f7f5" roughness={0.6} />
      </mesh>
      <RigPart id="power_plug" position={[-0.22, 0.55, -front - 0.215]}>
        <RoundedBox args={[0.06, 0.07, 0.04]} radius={0.01}>
          <meshStandardMaterial color="#2f3237" roughness={0.6} />
        </RoundedBox>
      </RigPart>
    </group>
  );
}

function Feet() {
  return (
    <>
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x * (width / 2 - 0.05), 0.012, z * (front - 0.06)]}>
          <cylinderGeometry args={[0.02, 0.022, 0.024, 24]} />
          <meshStandardMaterial color="#45494f" roughness={0.6} />
        </mesh>
      ))}
      <RigPart id="leveling_feet" position={[width / 2 - 0.05, 0.012, front - 0.06]}>
        <mesh>
          <cylinderGeometry args={[0.02, 0.022, 0.024, 6]} />
          <meshStandardMaterial color="#45494f" roughness={0.6} />
        </mesh>
      </RigPart>
    </>
  );
}

/** Where the air goes: through the tumbling clothes, out through the lint screen, down to the blower, out the vent. */
export const airRoute: [number, number, number][] = [
  [0, 0.42, 0.18],
  [0, 0.58, 0.02],
  [0, 0.8, -0.16],
  [0, 0.55, -0.26],
  [0, 0.14, -0.28],
  [0, 0.12, -front],
  [0, 0.13, -front - 0.1],
  [0.05, 0.25, -front - 0.18],
  [0.12, 0.35, -front - 0.225],
];

/** An invisible stand-in the size of the air route, so the camera can frame the whole airflow. */
function AirPath() {
  return (
    <RigPart id="air_path">
      <mesh position={[0, 0.5, -0.1]} visible={false}>
        <boxGeometry args={[0.3, 0.8, 0.9]} />
        <meshBasicMaterial />
      </mesh>
    </RigPart>
  );
}

export function DryerModel() {
  return (
    <group>
      <Cabinet />
      <Drum />
      <InsideDrum />
      <Door />
      <LintScreen />
      <Console />
      <BehindTheDryer />
      <Feet />
      <AirPath />
    </group>
  );
}

const sampleSteps: { instruction: string; beats: Beat[] }[] = [
  { instruction: "See where the air gets stuck", beats: [{ part: "air_path", action: "look", caption: "Lint blocks the hot air" }] },
  {
    instruction: "Clean the lint screen",
    beats: [
      { part: "lint_screen", action: "remove", caption: "Pull the screen straight up" },
      { part: "lint", action: "clean", caption: "Roll the lint off" },
      { part: "lint_screen", action: "insert", caption: "Slide it back down" },
    ],
  },
  { instruction: "Turn the cycle knob to Normal", beats: [{ part: "cycle_knob", action: "turn", caption: "Turn to Normal" }] },
  { instruction: "Press Start", beats: [{ part: "start_button", action: "press", caption: "Press and hold Start" }] },
  {
    instruction: "Wipe the sensor strips",
    beats: [
      { part: "dryer_door", action: "open", caption: "Open the door" },
      { part: "moisture_sensor_film", action: "clean", caption: "Wipe the two metal strips" },
      { part: "dryer_door", action: "close", caption: "Close the door" },
    ],
  },
  { instruction: "Check the vent hose", beats: [{ part: "vent_hose", action: "look", caption: "Make sure it isn't crushed" }] },
  {
    instruction: "Run a short timed dry, feel the vent",
    beats: [
      { part: "air_path", action: "look", caption: "Air flows freely now" },
      { part: "vent_hose", action: "look", caption: "Strong warm air outside" },
    ],
  },
];

export const rig: RigModule = { catalog: dryerCatalog, Model: DryerModel, sampleSteps };
