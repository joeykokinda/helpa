"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import type { Beat, RigCatalog, Vec3 } from "../../lib/rig/types";
import catalogJson from "./catalogs/car_oil_change.json";
import { blotchTexture, chrome, Drift, kitchenTexture, labelTexture, Twin } from "./Range";
import type { RigModule } from "./registry";
import { RigPart, useRig } from "./RigRuntime";

/**
 * A 2015 Toyota Camry (XV50) with the 2.5 L 2AR-FE transverse four: cartridge oil filter hanging under the front of
 * the block beside the oil pan, 14 mm drain plug, yellow dipstick loop up front, fill cap on the valve cover. Body
 * proportions are a mid-size sedan's, simplified. Driven forward onto ramps so the underside can be reached. Car parts are modelled in the car's own frame:
 * metres, ground under the tyres at y = 0, front axle at z = 0.6, +z toward the front bumper, +x the driver's side.
 * The car frame is pitched nose-up about the rear tyre contact; the ramps, chocks, drain pan and oil stream sit in the
 * world frame on the floor.
 */
const frontAxleZ = 0.6;
const rearAxleZ = -2.1;
const wheelRadius = 0.315;
const trackHalf = 0.77;
const rampHeight = 0.2;
const pitch = -Math.asin(rampHeight / (frontAxleZ - rearAxleZ));
const worldShiftZ = 0.5;
const bodyHalfWidth = 0.89;
const slabInner = 0.69;
const hoodPivot: Vec3 = [0, 0.915, 0.24];
const hoodSlope = 0.105;
const fillNeck: Vec3 = [-0.12, 0.8, 0.78];
const washerNeck: Vec3 = [-0.6, 0.72, 1.12];
const drainPlugAt: Vec3 = [-0.08, 0.2, 0.84];
const dipstickTop: Vec3 = [-0.25, 0.775, 0.987];
const dipstickTilt = Math.atan2(0.2016, 0.979);
const filterBase: Vec3 = [-0.27, 0.3, 0.975];
const archStart = Math.PI + Math.atan2(0.115, Math.sqrt(0.38 ** 2 - 0.115 ** 2));
const archEnd = -Math.atan2(0.115, Math.sqrt(0.38 ** 2 - 0.115 ** 2));

export const carOilChangeCatalog = catalogJson as RigCatalog;

/** Where a point of the pitched car lands in the world. */
function carToWorld([x, y, z]: Vec3): Vec3 {
  const relative = z - rearAxleZ;
  return [x, y * Math.cos(pitch) - relative * Math.sin(pitch), y * Math.sin(pitch) + relative * Math.cos(pitch) + rearAxleZ + worldShiftZ];
}

const paint = { color: "#2f5f9c", roughness: 0.3, metalness: 0.35 };
const blackPlastic = { color: "#24262a", roughness: 0.6, metalness: 0.05 };
const trimPlastic = { color: "#34373c", roughness: 0.65 };
const aluminium = { color: "#aab0b6", roughness: 0.45, metalness: 0.6 };
const castIron = { color: "#6f747a", roughness: 0.6, metalness: 0.5 };
const glass = { color: "#1f2f3e", roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.38, depthWrite: false };
const translucentTank = { color: "#f2efe6", roughness: 0.35, transparent: true, opacity: 0.72 };

/* ---------- small geometry helpers ---------- */

/** A side profile (shape x = car z, shape y = height) extruded across the car toward -x, starting at `outerX`. */
function SideExtrusion({ shape, outerX, width, bevel = 0.02, children }: { shape: THREE.Shape; outerX: number; width: number; bevel?: number; children: ReactNode }) {
  const geometry = useMemo(() => {
    const extruded = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, width - bevel * 2), bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 32 });
    extruded.rotateY(-Math.PI / 2);
    return extruded;
  }, [shape, width, bevel]);
  return (
    <mesh geometry={geometry} position={[outerX - bevel, 0, 0]} castShadow receiveShadow>
      {children}
    </mesh>
  );
}

function profile(points: [number, number][], arches: { after: number; center: [number, number] }[] = []) {
  const shape = new THREE.Shape();
  points.forEach(([z, y], index) => {
    if (index === 0) shape.moveTo(z, y);
    else shape.lineTo(z, y);
    const arch = arches.find((candidate) => candidate.after === index);
    if (arch) shape.absarc(arch.center[0], arch.center[1], 0.38, archStart, archEnd, true);
  });
  shape.closePath();
  return shape;
}

function Tube({ points, radius, segments = 40, children }: { points: Vec3[]; radius: number; segments?: number; children: ReactNode }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)), false, "centripetal"), [points]);
  return (
    <mesh castShadow>
      <tubeGeometry args={[curve, segments, radius, 14, false]} />
      {children}
    </mesh>
  );
}

function Block({ center, size, radius = 0.01, children }: { center: Vec3; size: Vec3; radius?: number; children: ReactNode }) {
  return (
    <RoundedBox args={size} radius={Math.min(radius, Math.min(...size) / 2 - 0.0005)} smoothness={3} position={center} castShadow receiveShadow>
      {children}
    </RoundedBox>
  );
}

/** Things you bring for one job (a bottle, a jug, the crust): hidden unless their beat is running or they're in use. */
function ShowFromBeat({ ids, children }: { ids: string[]; children: ReactNode }) {
  const rig = useRig();
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (groupRef.current) groupRef.current.visible = ids.some((id) => rig.focus.current === id || ((rig.amounts.current[id] ?? 0) > 0.001 && (rig.amounts.current[id] ?? 0) < 0.999));
  });
  return (
    <group ref={groupRef} visible={false}>
      {children}
    </group>
  );
}

function radiatorTexture() {
  return kitchenTexture("car-radiator-fins", 128, 128, (context, size) => {
    context.fillStyle = "#3a3e44";
    context.fillRect(0, 0, size, size);
    context.strokeStyle = "#646a72";
    context.lineWidth = 2;
    for (let x = 0; x < size; x += 4) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, size);
      context.stroke();
    }
  }, [6, 3]);
}

function pleatTexture() {
  return kitchenTexture("car-filter-pleats", 128, 64, (context, canvasWidth, canvasHeight) => {
    context.fillStyle = "#efe6cf";
    context.fillRect(0, 0, canvasWidth, canvasHeight);
    for (let x = 0; x < canvasWidth; x += 8) {
      const gradient = context.createLinearGradient(x, 0, x + 8, 0);
      gradient.addColorStop(0, "#c9bd9e");
      gradient.addColorStop(0.5, "#f6efdc");
      gradient.addColorStop(1, "#c9bd9e");
      context.fillStyle = gradient;
      context.fillRect(x, 0, 8, canvasHeight);
    }
  }, [3, 1]);
}

/* ---------- body ---------- */

const frontPiece = profile(
  [
    [1.48, 0.24],
    [1.555, 0.32],
    [1.565, 0.5],
    [1.54, 0.66],
    [1.47, 0.765],
    [1.2, 0.8],
    [0.6, 0.86],
    [0.22, 0.92],
    [0.17, 0.925],
    [0.17, 0.2],
    [0.238, 0.2],
    [1.3, 0.22],
  ],
  [{ after: 10, center: [frontAxleZ, wheelRadius] }],
);

const rearPiece = profile(
  [
    [-0.95, 0.985],
    [-1.6, 1.0],
    [-2.25, 1.02],
    [-2.95, 1.0],
    [-3.08, 0.95],
    [-3.12, 0.75],
    [-3.1, 0.4],
    [-3.0, 0.27],
    [-2.6, 0.2],
    [-2.462, 0.2],
    [-0.95, 0.2],
  ],
  [{ after: 9, center: [rearAxleZ, wheelRadius] }],
);

const doorShape = profile([
  [0, 0.3],
  [0, 0.925],
  [-0.47, 0.97],
  [-1.12, 0.985],
  [-1.12, 0.3],
]);

const bumperShape = profile([
  [1.3, 0.22],
  [1.48, 0.24],
  [1.555, 0.32],
  [1.565, 0.5],
  [1.54, 0.66],
  [1.47, 0.765],
  [1.3, 0.765],
]);

const trunkShape = profile([
  [-1.9, 0.2],
  [-1.9, 1.0],
  [-2.25, 1.02],
  [-2.95, 1.0],
  [-3.08, 0.95],
  [-3.12, 0.75],
  [-3.1, 0.4],
  [-3.0, 0.27],
  [-2.6, 0.2],
]);

const greenhouseShape = profile([
  [0.22, 0.925],
  [-0.55, 1.4],
  [-0.72, 1.43],
  [-1.5, 1.43],
  [-1.72, 1.39],
  [-2.26, 1.02],
  [-1.6, 1.0],
  [-0.3, 0.97],
]);

function Body() {
  return (
    <group>
      {[1, -1].map((side) => (
        <group key={side}>
          <SideExtrusion shape={frontPiece} outerX={side > 0 ? bodyHalfWidth : -slabInner} width={bodyHalfWidth - slabInner}>
            <meshStandardMaterial {...paint} />
          </SideExtrusion>
          <SideExtrusion shape={rearPiece} outerX={side > 0 ? bodyHalfWidth : -slabInner} width={bodyHalfWidth - slabInner}>
            <meshStandardMaterial {...paint} />
          </SideExtrusion>
          {/* rocker under the doors, with the jack point notch on the driver side */}
          <Block center={[side * 0.79, 0.25, -0.39]} size={[0.2, 0.1, 1.12]} radius={0.02}>
            <meshStandardMaterial {...paint} />
          </Block>
          <Block center={[side * 0.86, 0.205, -0.39]} size={[0.012, 0.03, 1.1]} radius={0.003}>
            <meshStandardMaterial {...trimPlastic} />
          </Block>
          {/* wheel-well liners */}
          {[frontAxleZ, rearAxleZ].map((axleZ) => (
            <mesh key={axleZ} position={[side * 0.78, wheelRadius, axleZ]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.372, 0.372, 0.22, 40, 1, true, -0.35, Math.PI + 0.7]} />
              <meshStandardMaterial color="#1b1c1f" roughness={0.9} side={THREE.DoubleSide} />
            </mesh>
          ))}
          {/* A-, B- and C-pillars */}
          <Tube points={[[side * 0.715, 0.93, 0.2], [side * 0.71, 1.17, -0.17], [side * 0.7, 1.405, -0.56]]} radius={0.032}>
            <meshStandardMaterial {...paint} />
          </Tube>
          <Block center={[side * 0.718, 1.2, -0.98]} size={[0.03, 0.44, 0.08]} radius={0.01}>
            <meshStandardMaterial color="#1d1f23" roughness={0.4} />
          </Block>
          <group position={[side * 0.71, 1.21, -1.95]} rotation={[-0.63, 0, 0]}>
            <Block center={[0, 0, 0]} size={[0.04, 0.5, 0.26]} radius={0.015}>
              <meshStandardMaterial {...paint} />
            </Block>
          </group>
          {/* tail light */}
          <Block center={[side * 0.68, 0.88, -3.09]} size={[0.36, 0.1, 0.06]} radius={0.02}>
            <meshStandardMaterial color="#b0202a" roughness={0.25} metalness={0.2} />
          </Block>
        </group>
      ))}
      <SideExtrusion shape={bumperShape} outerX={slabInner} width={slabInner * 2} bevel={0.015}>
        <meshStandardMaterial {...paint} />
      </SideExtrusion>
      <SideExtrusion shape={trunkShape} outerX={0.66} width={1.32} bevel={0.02}>
        <meshStandardMaterial {...paint} />
      </SideExtrusion>
      <SideExtrusion shape={greenhouseShape} outerX={0.72} width={1.44} bevel={0.03}>
        <meshStandardMaterial {...glass} />
      </SideExtrusion>
      <Block center={[0, 1.428, -1.1]} size={[1.42, 0.035, 1.06]} radius={0.016}>
        <meshStandardMaterial {...paint} />
      </Block>
      {/* grille, lower intake, plate */}
      <Block center={[0, 0.405, 1.562]} size={[0.92, 0.2, 0.012]} radius={0.04}>
        <meshStandardMaterial color="#141518" roughness={0.7} />
      </Block>
      <Block center={[0, 0.635, 1.548]} size={[0.62, 0.05, 0.01]} radius={0.02}>
        <meshStandardMaterial color="#141518" roughness={0.7} />
      </Block>
      <Block center={[0, 0.58, 1.565]} size={[0.3, 0.075, 0.006]} radius={0.004}>
        <meshStandardMaterial color="#f2f3f5" roughness={0.6} />
      </Block>
      <Block center={[0, 0.6, -3.125]} size={[0.3, 0.15, 0.006]} radius={0.004}>
        <meshStandardMaterial color="#f2f3f5" roughness={0.6} />
      </Block>
      {/* headlights */}
      <RigPart id="headlight" position={[0.6, 0.715, 1.47]}>
        <Headlamp />
      </RigPart>
      <group position={[-0.6, 0.715, 1.47]} scale={[-1, 1, 1]}>
        <Headlamp />
      </group>
      {/* cabin floor, firewall, cowl, under-floor */}
      <Block center={[0, 0.25, -0.85]} size={[1.32, 0.1, 2.1]} radius={0.01}>
        <meshStandardMaterial color="#2a2c30" roughness={0.8} />
      </Block>
      <Block center={[0, 0.63, 0.19]} size={[1.38, 0.58, 0.02]} radius={0.005}>
        <meshStandardMaterial color="#3a3d42" roughness={0.7} />
      </Block>
      <Block center={[0, 0.912, 0.215]} size={[1.4, 0.03, 0.09]} radius={0.01}>
        <meshStandardMaterial {...blackPlastic} />
      </Block>
    </group>
  );
}

function Headlamp() {
  return (
    <group>
      <group rotation={[0.25, 0.35, 0]}>
        <Block center={[0, 0, 0]} size={[0.32, 0.075, 0.16]} radius={0.03}>
          <meshStandardMaterial color="#d9e2ea" roughness={0.08} metalness={0.4} transparent opacity={0.85} />
        </Block>
        <mesh position={[0.06, 0, 0.07]} rotation={[0, 0, 0]}>
          <circleGeometry args={[0.024, 24]} />
          <meshStandardMaterial color="#ffffff" emissive="#fff4d6" emissiveIntensity={0.25} />
        </mesh>
      </group>
    </group>
  );
}

function Wheel({ position, mirrored = false }: { position: Vec3; mirrored?: boolean }) {
  const tyre = useMemo(() => {
    const half = 0.1;
    const points: THREE.Vector2[] = [];
    const inner = 0.21;
    points.push(new THREE.Vector2(inner, -half));
    for (let index = 0; index <= 8; index++) {
      const angle = -Math.PI / 2 + (index / 8) * Math.PI;
      points.push(new THREE.Vector2(wheelRadius - 0.035 + Math.cos(angle) * 0.035, Math.sin(angle) * (half - 0.005)));
    }
    points.push(new THREE.Vector2(inner, half));
    return new THREE.LatheGeometry(points, 56);
  }, []);
  const outward = mirrored ? -1 : 1;
  return (
    <group position={position} rotation={[0, 0, Math.PI / 2]}>
      <mesh geometry={tyre} castShadow receiveShadow>
        <meshStandardMaterial color="#1e1f22" roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
      {/* alloy wheel: rim lip, face, five spokes, hub */}
      <mesh position={[0, outward * 0.06, 0]}>
        <cylinderGeometry args={[0.212, 0.212, 0.03, 40, 1, true]} />
        <meshStandardMaterial color="#c4c9cf" metalness={0.8} roughness={0.25} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, outward * 0.03, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.01, 40]} />
        <meshStandardMaterial color="#2a2d31" roughness={0.6} />
      </mesh>
      {Array.from({ length: 5 }, (_, index) => (
        <group key={index} rotation={[0, (index / 5) * Math.PI * 2, 0]}>
          <Block center={[0, outward * 0.065, 0.11]} size={[0.045, 0.02, 0.19]} radius={0.008}>
            <meshStandardMaterial color="#c4c9cf" metalness={0.8} roughness={0.25} />
          </Block>
        </group>
      ))}
      <mesh position={[0, outward * 0.07, 0]}>
        <cylinderGeometry args={[0.045, 0.05, 0.03, 24]} />
        <meshStandardMaterial color="#b9bec4" metalness={0.8} roughness={0.25} />
      </mesh>
      {/* brake disc behind the spokes */}
      <mesh position={[0, outward * 0.005, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.025, 40]} />
        <meshStandardMaterial color="#8a8f95" metalness={0.7} roughness={0.4} />
      </mesh>
    </group>
  );
}

function Doors() {
  const doorWidth = 0.05;
  const door = (side: 1 | -1) => (
    <RigPart key={side} id={side > 0 ? "driver_door" : "passenger_door"} position={[side * bodyHalfWidth, 0, 0.17]}>
      <group scale={[side, 1, 1]}>
        <SideExtrusion shape={doorShape} outerX={0} width={doorWidth} bevel={0.012}>
          <meshStandardMaterial {...paint} />
        </SideExtrusion>
        <Block center={[-doorWidth - 0.006, 0.62, -0.56]} size={[0.012, 0.6, 1.06]} radius={0.004}>
          <meshStandardMaterial {...trimPlastic} />
        </Block>
        <Block center={[0.006, 0.86, -0.85]} size={[0.012, 0.022, 0.12]} radius={0.006}>
          <meshStandardMaterial {...chrome} />
        </Block>
        {/* mirror */}
        <Block center={[0.06, 1.0, -0.12]} size={[0.1, 0.11, 0.16]} radius={0.03}>
          <meshStandardMaterial {...paint} />
        </Block>
      </group>
    </RigPart>
  );
  return (
    <group>
      {door(1)}
      {door(-1)}
    </group>
  );
}

function Interior() {
  return (
    <group>
      {/* dashboard and the instrument hood */}
      <Block center={[0, 0.84, -0.03]} size={[1.32, 0.18, 0.46]} radius={0.05}>
        <meshStandardMaterial color="#464a51" roughness={0.75} />
      </Block>
      <Block center={[0.37, 0.95, -0.17]} size={[0.3, 0.06, 0.12]} radius={0.02}>
        <meshStandardMaterial color="#1c1e21" roughness={0.6} />
      </Block>
      {/* centre stack and console */}
      <Block center={[0, 0.55, -0.32]} size={[0.24, 0.42, 0.36]} radius={0.03}>
        <meshStandardMaterial color="#2a2c31" roughness={0.75} />
      </Block>
      {/* driver knee panel with the hood release on its left */}
      <Block center={[0.43, 0.68, -0.18]} size={[0.44, 0.14, 0.16]} radius={0.02}>
        <meshStandardMaterial color="#4b4f56" roughness={0.75} />
      </Block>
      <Block center={[0.655, 0.5, -0.12]} size={[0.02, 0.22, 0.2]} radius={0.005}>
        <meshStandardMaterial color="#4b4f56" roughness={0.75} />
      </Block>
      {/* Camry: the release sits low on the left kick panel by the driver's left knee; pull it toward you */}
      <RigPart id="hood_release_lever" position={[0.63, 0.53, -0.18]}>
        <Block center={[0, -0.028, -0.014]} size={[0.03, 0.065, 0.026]} radius={0.008}>
          <meshStandardMaterial color="#d3d7dc" roughness={0.45} />
        </Block>
        <Block center={[-0.0155, -0.035, -0.014]} size={[0.002, 0.03, 0.016]} radius={0.0008}>
          <meshStandardMaterial color="#e0702e" roughness={0.5} />
        </Block>
      </RigPart>
      {/* steering wheel with its spoke buttons */}
      <SteeringWheel />
      <RigPart id="start_button" position={[0.6, 0.83, -0.262]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 0.012, 24]} />
          <meshStandardMaterial color="#b9bec4" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0, -0.0065]}>
          <circleGeometry args={[0.013, 24]} />
          <meshStandardMaterial color="#1c1e21" emissive="#c23b2e" emissiveIntensity={0.25} />
        </mesh>
      </RigPart>
      <GloveBox />
      {/* seats */}
      {[0.36, -0.36].map((x) => (
        <group key={x}>
          <Block center={[x, 0.42, -0.82]} size={[0.5, 0.13, 0.5]} radius={0.05}>
            <meshStandardMaterial color="#3a3d43" roughness={0.85} />
          </Block>
          <group position={[x, 0.75, -1.1]} rotation={[-0.22, 0, 0]}>
            <Block center={[0, 0, 0]} size={[0.5, 0.62, 0.13]} radius={0.05}>
              <meshStandardMaterial color="#3a3d43" roughness={0.85} />
            </Block>
          </group>
        </group>
      ))}
      <Block center={[0, 0.42, -1.62]} size={[1.24, 0.13, 0.5]} radius={0.05}>
        <meshStandardMaterial color="#3a3d43" roughness={0.85} />
      </Block>
    </group>
  );
}

function SteeringWheel() {
  return (
    <group>
      <Tube points={[[0.37, 0.8, -0.18], [0.37, 0.84, -0.32], [0.37, 0.88, -0.4]]} radius={0.028}>
        <meshStandardMaterial color="#202226" roughness={0.6} />
      </Tube>
      <RigPart id="steering_wheel" position={[0.37, 0.9, -0.43]}>
        <group rotation={[0.4, 0, 0]}>
          <mesh>
            <torusGeometry args={[0.18, 0.016, 12, 48]} />
            <meshStandardMaterial color="#1c1d20" roughness={0.55} />
          </mesh>
          <Block center={[0, -0.02, 0]} size={[0.13, 0.1, 0.05]} radius={0.025}>
            <meshStandardMaterial color="#232529" roughness={0.6} />
          </Block>
          {[-1, 1].map((side) => (
            <group key={side}>
              <Block center={[side * 0.11, -0.01, 0]} size={[0.1, 0.04, 0.02]} radius={0.008}>
                <meshStandardMaterial color="#232529" roughness={0.6} />
              </Block>
              <Block center={[side * 0.1, -0.005, -0.012]} size={[0.035, 0.022, 0.006]} radius={0.003}>
                <meshStandardMaterial color="#9aa0a6" metalness={0.6} roughness={0.35} />
              </Block>
            </group>
          ))}
        </group>
      </RigPart>
    </group>
  );
}

/** Passenger-side glove box (drops down past its stops) and the cabin air filter that slides out behind it. */
function GloveBox() {
  const pleats = useMemo(() => pleatTexture(), []);
  return (
    <group>
      <Block center={[-0.4, 0.68, -0.04]} size={[0.38, 0.16, 0.26]} radius={0.01}>
        <meshStandardMaterial color="#1c1e21" roughness={0.8} />
      </Block>
      <RigPart id="cabin_air_filter" position={[-0.4, 0.725, -0.03]}>
        <Block center={[0, 0, 0]} size={[0.22, 0.032, 0.2]} radius={0.004}>
          <meshStandardMaterial color="#3a3d42" roughness={0.7} />
        </Block>
        <mesh position={[0, 0.0165, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.2, 0.18]} />
          <meshStandardMaterial map={pleats} color="#d8d2c2" roughness={0.9} />
        </mesh>
        <Block center={[0, 0, -0.1]} size={[0.24, 0.045, 0.012]} radius={0.004}>
          <meshStandardMaterial color="#202226" roughness={0.6} />
        </Block>
      </RigPart>
      <RigPart id="glove_box" position={[-0.4, 0.6, -0.27]}>
        <Block center={[0, 0.075, -0.006]} size={[0.36, 0.15, 0.014]} radius={0.006}>
          <meshStandardMaterial color="#33363b" roughness={0.7} />
        </Block>
        <Block center={[0, 0.11, -0.015]} size={[0.08, 0.018, 0.01]} radius={0.004}>
          <meshStandardMaterial {...chrome} />
        </Block>
        {/* shallow bin behind the lid */}
        <Block center={[0, 0.004, 0.04]} size={[0.34, 0.008, 0.08]} radius={0.003}>
          <meshStandardMaterial color="#26282c" roughness={0.8} />
        </Block>
        {[-1, 1].map((side) => (
          <Block key={side} center={[side * 0.166, 0.04, 0.04]} size={[0.008, 0.07, 0.08]} radius={0.003}>
            <meshStandardMaterial color="#26282c" roughness={0.8} />
          </Block>
        ))}
      </RigPart>
    </group>
  );
}

/* ---------- hood, latch, prop rod, wipers ---------- */

function Hood() {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.76, 0);
    shape.lineTo(0.76, 0);
    shape.lineTo(0.73, -1.12);
    shape.quadraticCurveTo(0.71, -1.235, 0.58, -1.235);
    shape.lineTo(-0.58, -1.235);
    shape.quadraticCurveTo(-0.71, -1.235, -0.73, -1.12);
    shape.closePath();
    const extruded = new THREE.ExtrudeGeometry(shape, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.008, bevelSegments: 3, curveSegments: 24 });
    extruded.rotateX(-Math.PI / 2);
    return extruded;
  }, []);
  const pad = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.62, -0.06);
    shape.lineTo(0.62, -0.06);
    shape.lineTo(0.6, -1.0);
    shape.lineTo(-0.6, -1.0);
    shape.closePath();
    const flat = new THREE.ShapeGeometry(shape);
    flat.rotateX(-Math.PI / 2);
    return flat;
  }, []);
  return (
    <RigPart id="hood" position={hoodPivot}>
      <group rotation={[hoodSlope, 0, 0]}>
        <mesh geometry={geometry} position={[0, -0.02, 0]} castShadow receiveShadow>
          <meshStandardMaterial {...paint} />
        </mesh>
        {/* insulation pad and the slot the prop rod hooks into */}
        <mesh geometry={pad} position={[0, -0.0275, 0]}>
          <meshStandardMaterial color="#4a4d52" roughness={0.95} side={THREE.DoubleSide} />
        </mesh>
        <Block center={[-0.45, -0.03, 0.9]} size={[0.05, 0.006, 0.025]} radius={0.002}>
          <meshStandardMaterial color="#111214" roughness={0.9} />
        </Block>
        {/* latch striker and the secondary safety latch */}
        <mesh position={[0, -0.05, 1.17]} rotation={[0, 0, 0]}>
          <torusGeometry args={[0.014, 0.003, 8, 16, Math.PI]} />
          <meshStandardMaterial {...chrome} />
        </mesh>
        <RigPart id="hood_latch" position={[0.05, -0.04, 1.16]}>
          <Block center={[0.02, -0.006, 0]} size={[0.05, 0.012, 0.012]} radius={0.004}>
            <meshStandardMaterial color="#c9ced4" metalness={0.8} roughness={0.3} />
          </Block>
          <Block center={[0.046, -0.014, 0]} size={[0.012, 0.022, 0.016]} radius={0.004}>
            <meshStandardMaterial color="#c9ced4" metalness={0.8} roughness={0.3} />
          </Block>
        </RigPart>
      </group>
    </RigPart>
  );
}

function PropRod() {
  const length = 0.963;
  return (
    <group>
      {/* pivot bracket and the stowing clip on the radiator support */}
      <Block center={[-0.45, 0.755, 1.3]} size={[0.02, 0.02, 0.02]} radius={0.004}>
        <meshStandardMaterial color="#2c2f34" roughness={0.6} />
      </Block>
      <Block center={[-0.45 + length - 0.02, 0.76, 1.3]} size={[0.02, 0.012, 0.02]} radius={0.004}>
        <meshStandardMaterial color="#2c2f34" roughness={0.6} />
      </Block>
      <RigPart id="prop_rod" position={[-0.45, 0.765, 1.3]}>
        <mesh position={[length / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.0045, 0.0045, length, 10]} />
          <meshStandardMaterial color="#1f2125" metalness={0.4} roughness={0.45} />
        </mesh>
        <mesh position={[length * 0.3, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.009, 0.009, 0.12, 12]} />
          <meshStandardMaterial color="#e2b22c" roughness={0.6} />
        </mesh>
      </RigPart>
    </group>
  );
}

function Wipers() {
  const wiper = (
    <group>
      <Block center={[0.27, 0.0, 0.0]} size={[0.54, 0.008, 0.016]} radius={0.003}>
        <meshStandardMaterial color="#1b1c1f" roughness={0.6} />
      </Block>
      <Block center={[0.3, -0.009, -0.004]} size={[0.5, 0.01, 0.012]} radius={0.003}>
        <meshStandardMaterial color="#2c2e33" roughness={0.8} />
      </Block>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.014, 0.014, 0.014, 16]} />
        <meshStandardMaterial color="#1b1c1f" roughness={0.6} />
      </mesh>
    </group>
  );
  return (
    <group>
      <RigPart id="wiper_blades" position={[-0.5, 0.982, 0.158]}>
        {wiper}
      </RigPart>
      <Twin of="wiper_blades" position={[0.06, 0.982, 0.158]}>
        {wiper}
      </Twin>
    </group>
  );
}

/* ---------- engine bay ---------- */

function EngineBay() {
  const fins = useMemo(() => radiatorTexture(), []);
  return (
    <group>
      {/* strut towers */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.6, 0, frontAxleZ]}>
          <mesh position={[0, 0.65, 0]} castShadow>
            <cylinderGeometry args={[0.085, 0.1, 0.3, 32]} />
            <meshStandardMaterial {...paint} />
          </mesh>
          {[0, 1, 2].map((index) => (
            <mesh key={index} position={[Math.sin((index / 3) * Math.PI * 2) * 0.05, 0.802, Math.cos((index / 3) * Math.PI * 2) * 0.05]}>
              <cylinderGeometry args={[0.008, 0.008, 0.006, 6]} />
              <meshStandardMaterial {...chrome} />
            </mesh>
          ))}
        </group>
      ))}
      {/* radiator support, radiator and fan */}
      <Block center={[0, 0.74, 1.3]} size={[1.26, 0.04, 0.06]} radius={0.008}>
        <meshStandardMaterial color="#2c2f34" roughness={0.6} />
      </Block>
      <RigPart id="radiator">
        <mesh position={[0, 0.55, 1.282]}>
          <boxGeometry args={[1.0, 0.34, 0.035]} />
          <meshStandardMaterial map={fins} roughness={0.6} metalness={0.4} />
        </mesh>
        <Block center={[0, 0.735, 1.27]} size={[1.02, 0.02, 0.05]} radius={0.004}>
          <meshStandardMaterial {...blackPlastic} />
        </Block>
      </RigPart>
      <Block center={[0, 0.55, 1.225]} size={[0.92, 0.32, 0.04]} radius={0.01}>
        <meshStandardMaterial {...blackPlastic} />
      </Block>
      <mesh position={[0.18, 0.55, 1.2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.13, 0.13, 0.02, 32]} />
        <meshStandardMaterial color="#1b1c1f" roughness={0.6} />
      </mesh>
      <Engine />
      <Underside />
    </group>
  );
}

function Engine() {
  return (
    <group>
      <RigPart id="engine">
        {/* block, head, valve cover, plastic engine cover */}
        <Block center={[-0.1, 0.45, 0.785]} size={[0.56, 0.3, 0.33]} radius={0.02}>
          <meshStandardMaterial {...aluminium} />
        </Block>
        <Block center={[-0.1, 0.645, 0.785]} size={[0.55, 0.09, 0.29]} radius={0.015}>
          <meshStandardMaterial {...aluminium} />
        </Block>
        <Block center={[-0.1, 0.72, 0.785]} size={[0.53, 0.06, 0.25]} radius={0.02}>
          <meshStandardMaterial color="#3b3f45" roughness={0.45} metalness={0.3} />
        </Block>
        <Block center={[-0.12, 0.775, 0.785]} size={[0.46, 0.05, 0.24]} radius={0.022}>
          <meshStandardMaterial color="#202226" roughness={0.5} metalness={0.1} />
        </Block>
        {/* ignition coils peeking through */}
        {[-0.3, -0.18, -0.06, 0.06].map((x) => (
          <mesh key={x} position={[x, 0.802, 0.86]}>
            <cylinderGeometry args={[0.014, 0.014, 0.01, 16]} />
            <meshStandardMaterial color="#3d4148" roughness={0.5} />
          </mesh>
        ))}
        {/* intake manifold toward the firewall */}
        <Block center={[-0.1, 0.62, 0.565]} size={[0.5, 0.17, 0.13]} radius={0.04}>
          <meshStandardMaterial color="#26282c" roughness={0.6} />
        </Block>
        {[-0.28, -0.16, -0.04, 0.08].map((x) => (
          <Tube key={x} points={[[x, 0.6, 0.6], [x, 0.69, 0.6], [x, 0.69, 0.66]]} radius={0.022}>
            <meshStandardMaterial color="#26282c" roughness={0.6} />
          </Tube>
        ))}
        <mesh position={[0.18, 0.66, 0.58]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.04, 0.04, 0.06, 24]} />
          <meshStandardMaterial {...aluminium} />
        </mesh>
        {/* exhaust heat shield on the front */}
        <Block center={[-0.03, 0.565, 0.975]} size={[0.34, 0.23, 0.05]} radius={0.015}>
          <meshStandardMaterial color="#c3c7cc" metalness={0.75} roughness={0.35} />
        </Block>
        {/* accessory pulleys and belt on the passenger end */}
        {[
          [0.36, 0.86, 0.07],
          [0.56, 0.98, 0.04],
          [0.62, 0.8, 0.035],
        ].map(([y, z, radius]) => (
          <mesh key={`${y}${z}`} position={[-0.395, y, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[radius, radius, 0.025, 28]} />
            <meshStandardMaterial color="#5d6268" metalness={0.6} roughness={0.4} />
          </mesh>
        ))}
        {/* transmission on the driver side */}
        <Block center={[0.37, 0.41, 0.75]} size={[0.36, 0.26, 0.32]} radius={0.05}>
          <meshStandardMaterial {...aluminium} />
        </Block>
        <mesh position={[0.21, 0.43, 0.76]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.16, 0.17, 0.06, 32]} />
          <meshStandardMaterial {...aluminium} />
        </mesh>
      </RigPart>
      <OilFill />
      <Dipstick />
      <OilFilter />
      <Battery />
      <FuseBox />
      <AirBox />
      <Fluids />
    </group>
  );
}

function OilFill() {
  const spout: Vec3 = [fillNeck[0] + 0.0, fillNeck[1] + 0.25, fillNeck[2]];
  return (
    <group>
      {/* filler neck opening, seen once the cap is off */}
      <mesh position={[fillNeck[0], fillNeck[1] - 0.001, fillNeck[2]]}>
        <cylinderGeometry args={[0.024, 0.024, 0.004, 24]} />
        <meshStandardMaterial color="#0d0e10" roughness={0.9} />
      </mesh>
      <RigPart id="oil_fill_cap" position={fillNeck}>
        <Drift part="oil_fill_cap" offset={[0.1, -0.06, 0.06]} after={0.7}>
          <mesh position={[0, 0.011, 0]} castShadow>
            <cylinderGeometry args={[0.03, 0.031, 0.022, 32]} />
            <meshStandardMaterial color="#1b1c1f" roughness={0.45} />
          </mesh>
          <Block center={[0, 0.027, 0]} size={[0.05, 0.014, 0.012]} radius={0.005}>
            <meshStandardMaterial color="#1b1c1f" roughness={0.45} />
          </Block>
          <mesh position={[0, 0.0225, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.02, 0.026, 32]} />
            <meshStandardMaterial color="#e2b22c" roughness={0.5} />
          </mesh>
        </Drift>
      </RigPart>
      <ShowFromBeat ids={["new_oil"]}>
        {/* funnel in the neck */}
        <mesh position={[fillNeck[0], fillNeck[1] + 0.07, fillNeck[2]]}>
          <cylinderGeometry args={[0.06, 0.012, 0.1, 32, 1, true]} />
          <meshStandardMaterial color="#e8e4da" roughness={0.5} side={THREE.DoubleSide} />
        </mesh>
        <RigPart id="new_oil" position={spout}>
          <mesh position={[0, -0.01, 0]}>
            <cylinderGeometry args={[0.012, 0.014, 0.025, 20]} />
            <meshStandardMaterial color="#1c1d20" roughness={0.5} />
          </mesh>
          <Block center={[0.115, -0.13, 0]} size={[0.1, 0.2, 0.065]} radius={0.018}>
            <meshStandardMaterial color="#1c1d20" roughness={0.45} />
          </Block>
          <Block center={[0.115, -0.14, 0.033]} size={[0.08, 0.1, 0.002]} radius={0.0005}>
            <meshStandardMaterial color="#d6a32a" roughness={0.5} />
          </Block>
        </RigPart>
      </ShowFromBeat>
    </group>
  );
}

/** Shows the oil line on the dipstick tip once it's been wiped and dipped again. */
function DipstickReading() {
  const rig = useRig();
  const bandRef = useRef<THREE.Mesh>(null);
  const dippedRef = useRef(false);
  useFrame(() => {
    const amounts = rig.amounts.current;
    const wiped = (amounts.dipstick_oil ?? 0) > 0.99;
    if (!wiped) dippedRef.current = false;
    else if ((amounts.dipstick ?? 0) < 0.04) dippedRef.current = true;
    if (bandRef.current) bandRef.current.visible = wiped && dippedRef.current;
  });
  return (
    <mesh ref={bandRef} position={[0, -0.453, 0]} visible={false}>
      <boxGeometry args={[0.0075, 0.036, 0.003]} />
      <meshStandardMaterial color="#b9832a" roughness={0.2} />
    </mesh>
  );
}

function Dipstick() {
  const oilFilm = useMemo(() => blotchTexture("car-dipstick-oil", ["rgba(150,104,32,0.95)", "rgba(110,76,24,0.9)"], { blobs: 30, spread: 1.4, minRadius: 14, maxRadius: 30, seed: 8 }), []);
  const tubeBottom: Vec3 = [dipstickTop[0], 0.45, dipstickTop[2] - 0.067];
  return (
    <group>
      <Tube points={[tubeBottom, dipstickTop]} radius={0.006} segments={4}>
        <meshStandardMaterial color="#5a5f66" metalness={0.6} roughness={0.4} />
      </Tube>
      <RigPart id="dipstick" position={dipstickTop}>
        <group rotation={[dipstickTilt, 0, 0]}>
          {/* yellow loop handle */}
          <mesh position={[0, 0.024, 0]}>
            <torusGeometry args={[0.017, 0.0045, 10, 28]} />
            <meshStandardMaterial color="#f2c230" roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.003, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 0.012, 16]} />
            <meshStandardMaterial color="#f2c230" roughness={0.45} />
          </mesh>
          {/* blade with low and full dots at the tip */}
          <mesh position={[0, -0.235, 0]}>
            <boxGeometry args={[0.005, 0.47, 0.0012]} />
            <meshStandardMaterial color="#c9ced4" metalness={0.85} roughness={0.25} />
          </mesh>
          {[-0.465, -0.44].map((y) => (
            <mesh key={y} position={[0, y, 0.0007]}>
              <circleGeometry args={[0.0018, 12]} />
              <meshStandardMaterial color="#3a3d42" />
            </mesh>
          ))}
          <DipstickReading />
          <RigPart id="dipstick_oil" position={[0, -0.42, 0]}>
            <mesh>
              <boxGeometry args={[0.0066, 0.1, 0.0024]} />
              <meshStandardMaterial map={oilFilm} color="#a87a2c" roughness={0.2} transparent alphaTest={0.05} />
            </mesh>
          </RigPart>
        </group>
      </RigPart>
    </group>
  );
}

/**
 * The 2AR-FE's cartridge filter: a housing on the front of the block pointing straight down, next to the oil pan.
 * The cap (64 mm, 14 flutes) unscrews and comes down with the paper element inside it.
 */
function OilFilter() {
  const pleats = useMemo(() => pleatTexture(), []);
  return (
    <group>
      {/* the housing on the block */}
      <mesh position={[filterBase[0], filterBase[1] + 0.012, filterBase[2]]}>
        <cylinderGeometry args={[0.044, 0.044, 0.024, 32]} />
        <meshStandardMaterial {...aluminium} />
      </mesh>
      <RigPart id="oil_filter" position={filterBase}>
        {/* the paper element, up inside the housing until the cap comes down */}
        <mesh position={[0, 0.028, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.052, 28]} />
          <meshStandardMaterial map={pleats} color="#e8dcc0" roughness={0.9} />
        </mesh>
        {/* cap with its fluted wrench end and the drain-tool port */}
        <mesh position={[0, -0.03, 0]} castShadow>
          <cylinderGeometry args={[0.038, 0.038, 0.06, 40]} />
          <meshStandardMaterial color="#2a2d32" roughness={0.45} metalness={0.4} />
        </mesh>
        <mesh position={[0, -0.066, 0]}>
          <cylinderGeometry args={[0.032, 0.035, 0.012, 14]} />
          <meshStandardMaterial color="#3a3e44" roughness={0.4} metalness={0.5} />
        </mesh>
        <mesh position={[0, -0.074, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.006, 16]} />
          <meshStandardMaterial color="#c9ced4" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* the O-ring that gets replaced */}
        <mesh position={[0, 0.0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.037, 0.003, 8, 32]} />
          <meshStandardMaterial color="#1b1c1f" roughness={0.7} />
        </mesh>
      </RigPart>
    </group>
  );
}

function Battery() {
  const corrosion = useMemo(() => blotchTexture("car-terminal-crust", ["#e9efe4", "#bfe0c9", "#d8e8d0", "#9fd1b4"], { blobs: 40, spread: 0.9, minRadius: 10, maxRadius: 26, seed: 17 }), []);
  const crust = (position: Vec3) => (
    <mesh key={position.join()} position={position} scale={[1, 0.55, 1]}>
      <sphereGeometry args={[0.017, 16, 10]} />
      <meshStandardMaterial map={corrosion} color="#e3eee0" roughness={0.95} />
    </mesh>
  );
  const top = 0.78;
  return (
    <group>
      <RigPart id="battery">
        <Block center={[0.46, 0.6675, 0.37]} size={[0.23, 0.225, 0.175]} radius={0.01}>
          <meshStandardMaterial color="#202225" roughness={0.65} />
        </Block>
        <Block center={[0.46, top + 0.002, 0.35]} size={[0.2, 0.006, 0.08]} radius={0.002}>
          <meshStandardMaterial color="#2c2f33" roughness={0.6} />
        </Block>
        <Block center={[0.46, 0.55, 0.37]} size={[0.26, 0.02, 0.2]} radius={0.004}>
          <meshStandardMaterial color="#2a2c30" roughness={0.7} />
        </Block>
        {/* hold-down bar */}
        <Block center={[0.46, top + 0.006, 0.37]} size={[0.24, 0.008, 0.02]} radius={0.003}>
          <meshStandardMaterial color="#5a5f66" metalness={0.5} roughness={0.4} />
        </Block>
        {[0.38, 0.54].map((x) => (
          <mesh key={x} position={[x, top + 0.01, 0.42]}>
            <cylinderGeometry args={[0.008, 0.009, 0.02, 16]} />
            <meshStandardMaterial color="#9b9fa4" metalness={0.6} roughness={0.4} />
          </mesh>
        ))}
      </RigPart>
      {/* positive: clamp and red cable under a flip-up red cover */}
      <Tube points={[[0.38, top + 0.012, 0.42], [0.35, top + 0.01, 0.47], [0.3, 0.7, 0.5], [0.22, 0.6, 0.52]]} radius={0.009}>
        <meshStandardMaterial color="#b3261e" roughness={0.55} />
      </Tube>
      <RigPart id="positive_terminal_cover" position={[0.38, top + 0.006, 0.395]}>
        <Block center={[0, 0.016, 0.026]} size={[0.045, 0.03, 0.055]} radius={0.01}>
          <meshStandardMaterial color="#cf2f25" roughness={0.5} />
        </Block>
      </RigPart>
      {/* negative: clamp with its bolt and a black cable to the body */}
      <Tube points={[[0.58, top + 0.012, 0.42], [0.61, top + 0.0, 0.44], [0.64, 0.7, 0.46], [0.66, 0.66, 0.46]]} radius={0.009}>
        <meshStandardMaterial color="#1b1c1f" roughness={0.6} />
      </Tube>
      <RigPart id="negative_terminal" position={[0.54, top + 0.012, 0.42]}>
        <mesh>
          <cylinderGeometry args={[0.014, 0.014, 0.018, 20]} />
          <meshStandardMaterial color="#b8bcc1" metalness={0.7} roughness={0.35} />
        </mesh>
        <Block center={[0.025, 0, 0]} size={[0.03, 0.016, 0.022]} radius={0.004}>
          <meshStandardMaterial color="#b8bcc1" metalness={0.7} roughness={0.35} />
        </Block>
        <Tube points={[[0.035, 0, 0], [0.042, 0, 0]]} radius={0.009} segments={2}>
          <meshStandardMaterial color="#1b1c1f" roughness={0.6} />
        </Tube>
        <RigPart id="terminal_nut" position={[0.012, 0.0, 0.016]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.0065, 0.0065, 0.006, 6]} />
            <meshStandardMaterial color="#d3d7dc" metalness={0.85} roughness={0.25} />
          </mesh>
        </RigPart>
      </RigPart>
      <ShowFromBeat ids={["terminal_corrosion"]}>
        <RigPart id="terminal_corrosion">
          {crust([0.38, top + 0.022, 0.42])}
          {crust([0.54, top + 0.026, 0.42])}
          {crust([0.555, top + 0.015, 0.432])}
        </RigPart>
      </ShowFromBeat>
    </group>
  );
}

function FuseBox() {
  const colors = ["#d33a2c", "#2f6fdb", "#e8c33a", "#3aa35b", "#d33a2c", "#e8c33a", "#2f6fdb", "#9aa0a6"];
  return (
    <group>
      <Block center={[0.415, 0.65, 0.56]} size={[0.17, 0.1, 0.16]} radius={0.008}>
        <meshStandardMaterial {...blackPlastic} />
      </Block>
      {colors.map((color, index) =>
        index === 2 ? null : (
          <mesh key={index} position={[0.36 + (index % 4) * 0.034, 0.705, 0.53 + Math.floor(index / 4) * 0.05]}>
            <boxGeometry args={[0.018, 0.012, 0.006]} />
            <meshStandardMaterial color={color} roughness={0.4} />
          </mesh>
        ),
      )}
      <RigPart id="fuse" position={[0.428, 0.705, 0.53]}>
        <mesh>
          <boxGeometry args={[0.018, 0.012, 0.006]} />
          <meshStandardMaterial color="#e8c33a" roughness={0.4} />
        </mesh>
      </RigPart>
      <RigPart id="fuse_box_lid" position={[0.415, 0.7, 0.56]}>
        <Block center={[0, 0.016, 0]} size={[0.176, 0.032, 0.166]} radius={0.01}>
          <meshStandardMaterial color="#2a2c30" roughness={0.55} />
        </Block>
        <Block center={[0.09, 0.012, 0]} size={[0.008, 0.02, 0.03]} radius={0.003}>
          <meshStandardMaterial color="#2a2c30" roughness={0.55} />
        </Block>
      </RigPart>
    </group>
  );
}

function AirBox() {
  const pleats = useMemo(() => pleatTexture(), []);
  const inner = { center: [0.46, 0.615, 1.04] as Vec3, width: 0.32, height: 0.13, depth: 0.32 };
  return (
    <group>
      <RigPart id="air_filter_box">
        {/* open-topped lower box so the element shows when the lid is up */}
        <Block center={[inner.center[0], 0.556, inner.center[2]]} size={[inner.width, 0.012, inner.depth]} radius={0.004}>
          <meshStandardMaterial {...blackPlastic} />
        </Block>
        {[-1, 1].map((side) => (
          <group key={side}>
            <Block center={[inner.center[0] + side * (inner.width / 2 - 0.006), inner.center[1], inner.center[2]]} size={[0.012, inner.height, inner.depth]} radius={0.004}>
              <meshStandardMaterial {...blackPlastic} />
            </Block>
            <Block center={[inner.center[0], inner.center[1], inner.center[2] + side * (inner.depth / 2 - 0.006)]} size={[inner.width, inner.height, 0.012]} radius={0.004}>
              <meshStandardMaterial {...blackPlastic} />
            </Block>
          </group>
        ))}
        <Tube points={[[0.32, 0.63, 0.95], [0.25, 0.72, 0.85], [0.24, 0.74, 0.7], [0.21, 0.67, 0.58]]} radius={0.034}>
          <meshStandardMaterial color="#1e1f22" roughness={0.7} />
        </Tube>
        <Tube points={[[0.46, 0.6, 1.2], [0.46, 0.64, 1.26], [0.4, 0.68, 1.29]]} radius={0.03}>
          <meshStandardMaterial color="#1e1f22" roughness={0.7} />
        </Tube>
      </RigPart>
      <RigPart id="air_filter" position={[0.46, 0.66, 1.04]}>
        <Block center={[0, 0, 0]} size={[0.29, 0.04, 0.29]} radius={0.006}>
          <meshStandardMaterial color="#3b3f45" roughness={0.8} />
        </Block>
        <mesh position={[0, 0.0205, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.26, 0.26]} />
          <meshStandardMaterial map={pleats} roughness={0.9} />
        </mesh>
      </RigPart>
      <RigPart id="air_filter_cover" position={[0.3, 0.68, 1.04]}>
        <Block center={[0.16, 0.03, 0]} size={[0.33, 0.06, 0.33]} radius={0.02}>
          <meshStandardMaterial color="#26282c" roughness={0.6} />
        </Block>
        {[-0.1, 0, 0.1].map((z) => (
          <Block key={z} center={[0.16, 0.061, z]} size={[0.26, 0.004, 0.012]} radius={0.002}>
            <meshStandardMaterial color="#303338" roughness={0.6} />
          </Block>
        ))}
      </RigPart>
      <RigPart id="air_filter_clips" position={[0.625, 0.645, 0.96]}>
        <Block center={[0.004, 0.03, 0]} size={[0.008, 0.06, 0.03]} radius={0.003}>
          <meshStandardMaterial color="#c9ced4" metalness={0.8} roughness={0.3} />
        </Block>
      </RigPart>
      <Twin of="air_filter_clips" position={[0.625, 0.645, 1.12]}>
        <Block center={[0.004, 0.03, 0]} size={[0.008, 0.06, 0.03]} radius={0.003}>
          <meshStandardMaterial color="#c9ced4" metalness={0.8} roughness={0.3} />
        </Block>
      </Twin>
    </group>
  );
}

function Fluids() {
  const symbol = useMemo(() => labelTexture("WASHER", "#ffffff", 40), []);
  return (
    <group>
      {/* coolant overflow tank, pink between MIN and MAX */}
      <RigPart id="coolant_reservoir">
        <Block center={[-0.57, 0.64, 0.89]} size={[0.14, 0.18, 0.18]} radius={0.02}>
          <meshStandardMaterial {...translucentTank} />
        </Block>
        <Block center={[-0.57, 0.6, 0.89]} size={[0.125, 0.09, 0.165]} radius={0.015}>
          <meshStandardMaterial color="#e46aa0" roughness={0.3} transparent opacity={0.85} />
        </Block>
        {[0.585, 0.69].map((y) => (
          <mesh key={y} position={[-0.57, y, 0.981]}>
            <boxGeometry args={[0.07, 0.004, 0.001]} />
            <meshStandardMaterial color="#3a3d42" />
          </mesh>
        ))}
        <Tube points={[[-0.57, 0.56, 0.98], [-0.5, 0.5, 1.1], [-0.42, 0.62, 1.22]]} radius={0.008}>
          <meshStandardMaterial color="#1b1c1f" roughness={0.6} />
        </Tube>
      </RigPart>
      <RigPart id="coolant_cap" position={[-0.57, 0.73, 0.89]}>
        <mesh position={[0, 0.012, 0]}>
          <cylinderGeometry args={[0.028, 0.028, 0.024, 28]} />
          <meshStandardMaterial color="#3a3d42" roughness={0.5} />
        </mesh>
        <Block center={[0, 0.026, 0]} size={[0.045, 0.01, 0.01]} radius={0.004}>
          <meshStandardMaterial color="#3a3d42" roughness={0.5} />
        </Block>
      </RigPart>
      {/* brake fluid reservoir on the master cylinder at the firewall */}
      <RigPart id="brake_fluid_reservoir">
        <Block center={[0.22, 0.79, 0.32]} size={[0.09, 0.06, 0.06]} radius={0.01}>
          <meshStandardMaterial {...translucentTank} />
        </Block>
        <Block center={[0.22, 0.778, 0.32]} size={[0.08, 0.03, 0.05]} radius={0.008}>
          <meshStandardMaterial color="#d8b54a" roughness={0.3} transparent opacity={0.8} />
        </Block>
        <mesh position={[0.22, 0.83, 0.32]}>
          <cylinderGeometry args={[0.02, 0.02, 0.02, 24]} />
          <meshStandardMaterial color="#e3c13b" roughness={0.5} />
        </mesh>
        <mesh position={[0.22, 0.72, 0.32]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.14, 20]} />
          <meshStandardMaterial {...castIron} />
        </mesh>
      </RigPart>
      {/* washer tank low in the corner, with a long filler neck */}
      <RigPart id="washer_reservoir">
        <Block center={[-0.58, 0.42, 1.14]} size={[0.16, 0.22, 0.17]} radius={0.02}>
          <meshStandardMaterial color="#e9eef2" roughness={0.45} transparent opacity={0.85} />
        </Block>
        <mesh position={[washerNeck[0], 0.62, washerNeck[2]]}>
          <cylinderGeometry args={[0.018, 0.018, 0.2, 20]} />
          <meshStandardMaterial color="#e9eef2" roughness={0.45} />
        </mesh>
      </RigPart>
      <RigPart id="washer_fluid_cap" position={washerNeck}>
        <Drift part="washer_fluid_cap" offset={[-0.03, -0.03, 0.08]} after={0.6}>
          <mesh position={[0, 0.012, 0]}>
            <cylinderGeometry args={[0.026, 0.026, 0.024, 28]} />
            <meshStandardMaterial color="#2f7fd6" roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.0245, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.04, 0.02]} />
            <meshStandardMaterial map={symbol} transparent />
          </mesh>
        </Drift>
      </RigPart>
      <ShowFromBeat ids={["washer_fluid_jug"]}>
        <RigPart id="washer_fluid_jug" position={[washerNeck[0], washerNeck[1] + 0.25, washerNeck[2]]}>
          <mesh position={[0, -0.01, 0]}>
            <cylinderGeometry args={[0.014, 0.016, 0.03, 20]} />
            <meshStandardMaterial color="#2f7fd6" roughness={0.5} />
          </mesh>
          <Block center={[0.075, -0.14, 0]} size={[0.13, 0.22, 0.085]} radius={0.02}>
            <meshStandardMaterial color="#6fb6ea" roughness={0.3} transparent opacity={0.85} />
          </Block>
        </RigPart>
      </ShowFromBeat>
    </group>
  );
}

/* ---------- underside ---------- */

function Underside() {
  return (
    <group>
      <RigPart id="oil_pan">
        <Block center={[-0.1, 0.26, 0.775]} size={[0.48, 0.11, 0.31]} radius={0.02}>
          <meshStandardMaterial color="#8d9399" metalness={0.55} roughness={0.45} />
        </Block>
        <Block center={[-0.1, 0.312, 0.775]} size={[0.52, 0.012, 0.35]} radius={0.004}>
          <meshStandardMaterial color="#9ba1a7" metalness={0.55} roughness={0.45} />
        </Block>
        {[-0.25, -0.1, 0.05].map((x) => (
          <Block key={x} center={[x, 0.206, 0.775]} size={[0.012, 0.012, 0.24]} radius={0.004}>
            <meshStandardMaterial color="#858b91" metalness={0.55} roughness={0.45} />
          </Block>
        ))}
      </RigPart>
      <RigPart id="drain_plug" position={drainPlugAt}>
        <mesh position={[0, 0.006, 0]}>
          <cylinderGeometry args={[0.006, 0.006, 0.014, 12]} />
          <meshStandardMaterial color="#b9bec4" metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh position={[0, -0.0015, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.003, 24]} />
          <meshStandardMaterial color="#c58a52" metalness={0.7} roughness={0.35} />
        </mesh>
        <mesh position={[0, -0.009, 0]}>
          <cylinderGeometry args={[0.0095, 0.0095, 0.012, 6]} />
          <meshStandardMaterial color="#d3d7dc" metalness={0.85} roughness={0.25} />
        </mesh>
      </RigPart>
      {/* crossmember, control arms, axles */}
      <Block center={[0, 0.25, 0.45]} size={[1.24, 0.05, 0.08]} radius={0.01}>
        <meshStandardMaterial color="#2e3135" metalness={0.4} roughness={0.55} />
      </Block>
      {[-1, 1].map((side) => (
        <group key={side}>
          <Tube points={[[side * 0.35, 0.25, 0.45], [side * 0.55, 0.26, 0.55], [side * 0.7, 0.27, 0.6]]} radius={0.018}>
            <meshStandardMaterial color="#2e3135" metalness={0.4} roughness={0.55} />
          </Tube>
          <Tube points={[[side > 0 ? 0.4 : 0.2, 0.33, 0.62], [side * 0.5, 0.325, 0.605], [side * 0.7, 0.315, 0.6]]} radius={0.016}>
            <meshStandardMaterial color="#3a3d42" metalness={0.5} roughness={0.45} />
          </Tube>
        </group>
      ))}
      {/* exhaust: down pipe, catalyst, run under the floor to the muffler */}
      <Tube points={[[0.0, 0.47, 1.0], [0.08, 0.32, 1.03], [0.2, 0.25, 0.92], [0.2, 0.24, 0.4], [0.2, 0.24, -2.5]]} radius={0.026} segments={80}>
        <meshStandardMaterial color="#8f8a84" metalness={0.6} roughness={0.5} />
      </Tube>
      <Block center={[0.3, 0.3, -2.75]} size={[0.32, 0.16, 0.4]} radius={0.05}>
        <meshStandardMaterial color="#8f8a84" metalness={0.6} roughness={0.5} />
      </Block>
      {/* rear axle beam and fuel tank */}
      <mesh position={[0, 0.3, rearAxleZ]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.03, 0.03, 1.4, 16]} />
        <meshStandardMaterial color="#2e3135" metalness={0.4} roughness={0.55} />
      </mesh>
      <Block center={[-0.1, 0.24, -1.55]} size={[0.8, 0.12, 0.5]} radius={0.04}>
        <meshStandardMaterial color="#2a2c30" roughness={0.7} />
      </Block>
      {/* jack point on the driver-side pinch weld, just behind the front wheel */}
      <RigPart id="jack_point" position={[0.86, 0.19, 0.02]}>
        <Block center={[0, 0, 0]} size={[0.02, 0.012, 0.11]} radius={0.003}>
          <meshStandardMaterial color="#4a4e55" metalness={0.4} roughness={0.5} />
        </Block>
        {[-0.045, 0.045].map((z) => (
          <Block key={z} center={[0, -0.004, z]} size={[0.024, 0.01, 0.012]} radius={0.003}>
            <meshStandardMaterial color="#d8dbdf" roughness={0.5} />
          </Block>
        ))}
        <mesh position={[0.0125, 0.03, 0]} rotation={[0, Math.PI / 2, 0]}>
          <circleGeometry args={[0.012, 3]} />
          <meshStandardMaterial color="#f2f3f5" />
        </mesh>
      </RigPart>
    </group>
  );
}

/* ---------- on the floor: ramps, chocks, drain pan, the oil stream ---------- */

function Ramp({ x }: { x: number }) {
  const shape = useMemo(() => {
    const [contactY, contactZ] = [carToWorld([0, 0, frontAxleZ])[1], carToWorld([0, 0, frontAxleZ])[2]];
    return profile([
      [contactZ - 0.75, 0],
      [contactZ - 0.16, contactY],
      [contactZ + 0.18, contactY],
      [contactZ + 0.2, contactY + 0.07],
      [contactZ + 0.26, contactY + 0.07],
      [contactZ + 0.27, 0],
    ]);
  }, []);
  return (
    <SideExtrusion shape={shape} outerX={x + 0.14} width={0.28} bevel={0.01}>
      <meshStandardMaterial color="#2f3540" roughness={0.7} />
    </SideExtrusion>
  );
}

/** The oil stream, the filling pan and the drips are catalog effects (see `effects` in car_oil_change.json). */
function Floor() {
  const hole = carToWorld(drainPlugAt);
  const panFloor = 0.012;
  const streamLength = hole[1] - 0.06;
  const rearContact = carToWorld([0, 0, rearAxleZ]);
  const panColor = "#e0702e";
  return (
    <group>
      <RigPart id="ramps">
        <Ramp x={trackHalf} />
        <Ramp x={-trackHalf} />
      </RigPart>
      <RigPart id="wheel_chocks">
        {[trackHalf, -trackHalf].map((x) => (
          <SideExtrusion
            key={x}
            shape={profile([
              [rearContact[2] - 0.34, 0],
              [rearContact[2] - 0.2, 0],
              [rearContact[2] - 0.3, 0.13],
              [rearContact[2] - 0.34, 0.13],
            ])}
            outerX={x + 0.08}
            width={0.16}
            bevel={0.008}
          >
            <meshStandardMaterial color="#e2b22c" roughness={0.6} />
          </SideExtrusion>
        ))}
      </RigPart>
      <RigPart id="drain_pan" position={[hole[0], 0, hole[2]]}>
        <mesh position={[0, 0.05, 0]} castShadow>
          <cylinderGeometry args={[0.22, 0.2, 0.1, 48, 1, true]} />
          <meshStandardMaterial color={panColor} roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, panFloor / 2, 0]}>
          <cylinderGeometry args={[0.2, 0.2, panFloor, 48]} />
          <meshStandardMaterial color="#b9541f" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.22, 0.008, 8, 48]} />
          <meshStandardMaterial color={panColor} roughness={0.6} />
        </mesh>
      </RigPart>
      {/* the space the old oil falls through, so the camera can frame it */}
      <RigPart id="old_oil" position={[hole[0], hole[1] - 0.02, hole[2]]}>
        <mesh position={[0, -streamLength / 2, 0]} visible={false}>
          <boxGeometry args={[0.1, streamLength, 0.1]} />
          <meshBasicMaterial />
        </mesh>
      </RigPart>
    </group>
  );
}

export function CarOilChangeModel() {
  const wheels: Vec3[] = [
    [trackHalf, wheelRadius, frontAxleZ],
    [-trackHalf, wheelRadius, frontAxleZ],
    [trackHalf, wheelRadius, rearAxleZ],
    [-trackHalf, wheelRadius, rearAxleZ],
  ];
  return (
    <group>
      <group position={[0, 0, rearAxleZ + worldShiftZ]} rotation={[pitch, 0, 0]}>
        <group position={[0, 0, -rearAxleZ]}>
          <Body />
          <Doors />
          <Interior />
          <Hood />
          <PropRod />
          <Wipers />
          <EngineBay />
          <RigPart id="front_wheel" position={wheels[0]}>
            <Wheel position={[0, 0, 0]} />
          </RigPart>
          {wheels.slice(1).map((position) => (
            <Wheel key={position.join()} position={position} mirrored={position[0] < 0} />
          ))}
        </group>
      </group>
      <Floor />
      {/* a shop light under the car, so the underside reads instead of going black */}
      <directionalLight position={[0.5, -1.6, 1.4]} intensity={0.9} color="#fff4e6" />
    </group>
  );
}

const openHood: Beat[] = [
  { part: "driver_door", action: "open", caption: "Open the driver's door" },
  { part: "hood_release_lever", action: "press", caption: "Pull the hood release" },
  { part: "driver_door", action: "close", caption: "Close the door" },
  { part: "hood", action: "open", caption: "Lift latch, raise the hood" },
  { part: "prop_rod", action: "open", caption: "Prop it in the slot" },
];
const closeHood: Beat[] = [
  { part: "prop_rod", action: "close", caption: "Clip the prop rod down" },
  { part: "hood", action: "close", caption: "Drop it, press it shut" },
];

const sampleSteps: { instruction: string; beats: Beat[] }[] = [
  {
    instruction: "Check the engine oil level",
    beats: [
      { part: "engine", action: "look", caption: "Park level, wait five minutes" },
      ...openHood,
      { part: "dipstick", action: "remove", caption: "Pull the yellow dipstick" },
      { part: "dipstick_oil", action: "clean", caption: "Wipe it clean" },
      { part: "dipstick", action: "insert", caption: "Push it all the way in" },
      { part: "dipstick", action: "remove", caption: "Pull it out again" },
      { part: "dipstick", action: "look", caption: "Oil between the two dots" },
      { part: "dipstick", action: "insert", caption: "Put it back in" },
      ...closeHood,
    ],
  },
  // The 2015 Camry 2.5L oil change, the same beats as the library fix (backend/library/car-oil-change.json).
  {
    instruction: "Drive onto ramps, chock the wheels",
    beats: [
      { part: "ramps", action: "look", caption: "Drive up, engine off" },
      { part: "wheel_chocks", action: "look", caption: "Chock both rear wheels" },
    ],
  },
  {
    instruction: "Open the hood, loosen the fill cap",
    beats: [...openHood, { part: "oil_fill_cap", action: "unlock", caption: "Loosen the cap, air in" }],
  },
  {
    instruction: "Drain the oil from the 14 mm plug",
    beats: [
      { part: "drain_pan", action: "insert", caption: "Pan under the plug" },
      { part: "drain_plug", action: "unlock", caption: "14 mm wrench, turn left" },
      { part: "drain_plug", action: "remove", caption: "Pull it away fast" },
      { part: "old_oil", action: "clean", caption: "Let it drain out" },
      { part: "drain_plug", action: "insert", caption: "New gasket, plug in" },
      { part: "drain_plug", action: "lock", caption: "Snug to 27 ft-lb" },
    ],
  },
  {
    instruction: "Swap the cartridge filter",
    beats: [
      { part: "oil_filter", action: "unlock", caption: "64 mm cap wrench, left" },
      { part: "oil_filter", action: "remove", caption: "Lower the cap, it drips" },
      { part: "oil_filter", action: "insert", caption: "New element and O-ring" },
      { part: "oil_filter", action: "lock", caption: "Snug to 18 ft-lb" },
      { part: "drain_pan", action: "remove", caption: "Slide the pan out" },
    ],
  },
  {
    instruction: "Pour in 4.4 quarts of 0W-20",
    beats: [
      { part: "oil_fill_cap", action: "remove", caption: "Lift off the fill cap" },
      { part: "new_oil", action: "turn", caption: "Pour 0W-20 slowly" },
      { part: "oil_fill_cap", action: "insert", caption: "Cap back on" },
      { part: "oil_fill_cap", action: "lock", caption: "Twist it tight" },
    ],
  },
  {
    instruction: "Run it one minute, check for drips",
    beats: [
      { part: "driver_door", action: "open", caption: "Open the driver's door" },
      { part: "start_button", action: "press", caption: "Start, idle one minute" },
      { part: "start_button", action: "press", caption: "Engine off" },
      { part: "driver_door", action: "close", caption: "Close the door" },
      { part: "drain_plug", action: "look", caption: "No drips at the plug" },
      { part: "oil_filter", action: "look", caption: "None at the filter" },
    ],
  },
  {
    instruction: "Check the dipstick, top up to F",
    beats: [
      { part: "dipstick", action: "remove", caption: "Pull the yellow loop" },
      { part: "dipstick_oil", action: "clean", caption: "Wipe it clean" },
      { part: "dipstick", action: "insert", caption: "Push it all the way in" },
      { part: "dipstick", action: "remove", caption: "Pull it out again" },
      { part: "dipstick_oil", action: "look", caption: "Oil between L and F" },
      { part: "dipstick", action: "insert", caption: "Put it back" },
      ...closeHood,
    ],
  },
  {
    instruction: "Top up the washer fluid",
    beats: [
      ...openHood,
      { part: "washer_reservoir", action: "look", caption: "Find the windshield-symbol cap" },
      { part: "washer_fluid_cap", action: "open", caption: "Pull the cap up" },
      { part: "washer_fluid_jug", action: "turn", caption: "Pour washer fluid in" },
      { part: "washer_fluid_cap", action: "close", caption: "Press the cap down" },
      ...closeHood,
      { part: "wiper_blades", action: "look", caption: "Pull the stalk, test spray" },
    ],
  },
  {
    instruction: "Check and clean the battery terminals",
    beats: [
      ...openHood,
      { part: "battery", action: "look", caption: "Look for crust, loose clamps" },
      { part: "terminal_nut", action: "turn", caption: "Loosen the negative clamp bolt" },
      { part: "negative_terminal", action: "remove", caption: "Lift the negative clamp off" },
      { part: "positive_terminal_cover", action: "open", caption: "Flip up the red cover" },
      { part: "terminal_corrosion", action: "clean", caption: "Scrub crust, baking soda water" },
      { part: "positive_terminal_cover", action: "close", caption: "Close the red cover" },
      { part: "negative_terminal", action: "insert", caption: "Push the clamp fully down" },
      { part: "terminal_nut", action: "turn", caption: "Tighten the clamp bolt" },
      ...closeHood,
      { part: "engine", action: "look", caption: "Try starting the engine" },
    ],
  },
];

export const rig: RigModule = { catalog: carOilChangeCatalog, Model: CarOilChangeModel, sampleSteps };
