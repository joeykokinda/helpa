"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import type { Beat, RigCatalog, Vec3 } from "../../lib/rig/types";
import catalogJson from "./catalogs/garbage_disposal.json";
import { blotchTexture, brushedTexture, chrome, GlowWith, labelTexture, Twin } from "./Range";
import type { RigModule } from "./registry";
import { RigPart, useRig } from "./RigRuntime";

/**
 * InSinkErator Badger 5 style disposal hung under a single-bowl drop-in sink in a 36" sink base, with the
 * dishwasher hose, the discharge tube and P-trap, the plug-in cord, and the wall switch above the counter.
 * The front of the grinding chamber is cut away so the turntable and the jam show. Metres, origin at the floor
 * under the cabinet centre, +z toward the user.
 */
const counterTop = 0.914;
const cabinetHalfWidth = 0.457;
const cabinetFront = 0.3;
const wallZ = -0.3;
const floorTop = 0.118;
const basinFloor = 0.72;
const basinHalfWidth = 0.29;
const basinHalfDepth = 0.2;
const rimTop = counterTop + 0.006;
// Disposal stack, top to bottom, all on the drain axis (x = 0, z = 0).
const flangeLip = basinFloor + 0.003;
const mountRingY = 0.7;
const lugRingY = 0.682;
const hopperTop = 0.672;
const hopperBottom = 0.548;
const hopperRadius = 0.078;
const linerRadius = 0.07;
const motorRadius = 0.083;
const unitBottom = 0.36;
const turntableTop = 0.558;
const inletY = 0.645;
const outletY = 0.575;
const trapX = 0.21;
const windowHalfAngle = 0.85;
const deckZ = -0.24;

export const garbageDisposalCatalog = catalogJson as RigCatalog;

const darkPlastic = { color: "#34373d", roughness: 0.55, metalness: 0.1 };
const stainlessInside = { color: "#b7bdc4", roughness: 0.35, metalness: 0.75 };
const pvc = { color: "#f3f2ee", roughness: 0.45 };
const rubber = { color: "#1d1f22", roughness: 0.85 };
const carcass = { color: "#f2eee8", roughness: 0.55 };
const cabinetInside = { color: "#e7e0d5", roughness: 0.7 };

function roundedRect<T extends THREE.Path>(path: T, left: number, bottom: number, right: number, top: number, radius: number) {
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

/** A flat outline with holes, extruded upward by `thickness` once laid flat (shape y is world -z). */
function flatPlate(outline: THREE.Shape, holes: THREE.Path[], thickness: number) {
  outline.holes.push(...holes);
  const geometry = new THREE.ExtrudeGeometry(outline, { depth: thickness, bevelEnabled: false, curveSegments: 32 });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** A ring with a rectangular cross-section (washer, nut, flange), lathed around y, bottom at 0. */
function ringGeometry(inner: number, outer: number, height: number, segments = 48, phiStart = 0, phiLength = Math.PI * 2) {
  const profile = [new THREE.Vector2(inner, 0), new THREE.Vector2(outer, 0), new THREE.Vector2(outer, height), new THREE.Vector2(inner, height), new THREE.Vector2(inner, 0)];
  return new THREE.LatheGeometry(profile, segments, phiStart, phiLength);
}

function Ring({ inner, outer, height, y = 0, segments = 48, children }: { inner: number; outer: number; height: number; y?: number; segments?: number; children: ReactNode }) {
  const geometry = useMemo(() => ringGeometry(inner, outer, height, segments), [inner, outer, height, segments]);
  return (
    <mesh geometry={geometry} position={[0, y, 0]} castShadow receiveShadow>
      {children}
    </mesh>
  );
}

function Tube({ points, radius, segments = 48, children }: { points: Vec3[]; radius: number; segments?: number; children: ReactNode }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)), false, "centripetal"), [points]);
  return (
    <mesh castShadow>
      <tubeGeometry args={[curve, segments, radius, 18, false]} />
      {children}
    </mesh>
  );
}

/** Things that only belong to one problem (ice, a leak, a bucket): hidden until one of their beats starts. */
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

/** Things you bring and put away again (the wrench, the stopper): shown while in use or while their beat runs. */
function ShowWhileOut({ id, focusIds = [id], children }: { id: string; focusIds?: string[]; children: ReactNode }) {
  const rig = useRig();
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (groupRef.current) groupRef.current.visible = focusIds.includes(rig.focus.current ?? "") || (rig.amounts.current[id] ?? 1) < 0.985;
  });
  return (
    <group ref={groupRef} visible={false}>
      {children}
    </group>
  );
}

/* ---------- the room: wall, cabinet, counter ---------- */

function Cabinet() {
  const counterGeometry = useMemo(() => {
    const outline = roundedRect(new THREE.Shape(), -0.48, -0.335, 0.48, 0.3, 0.004);
    return flatPlate(outline, [roundedRect(new THREE.Path(), -0.3, -0.21, 0.3, 0.21, 0.05)], 0.03);
  }, []);
  const sideHole = useMemo(() => circlePath(0.2, 0.42, 0.022), []);
  const leftSide = useMemo(() => {
    const outline = roundedRect(new THREE.Shape(), -0.3, 0, 0.3, counterTop - 0.03, 0.002);
    outline.holes.push(sideHole);
    return new THREE.ExtrudeGeometry(outline, { depth: 0.018, bevelEnabled: false, curveSegments: 24 });
  }, [sideHole]);
  return (
    <group>
      <mesh position={[0, 1.1, wallZ]} receiveShadow>
        <planeGeometry args={[3.2, 2.2]} />
        <meshStandardMaterial color="#f1ece5" roughness={0.95} />
      </mesh>
      {/* backsplash tile strip above the counter */}
      <mesh position={[0, counterTop + 0.22, wallZ + 0.002]}>
        <planeGeometry args={[0.98, 0.44]} />
        <meshStandardMaterial color="#e6ebee" roughness={0.4} />
      </mesh>
      {/* left side has a hole where the dishwasher hose comes through; right side is plain */}
      <mesh geometry={leftSide} rotation={[0, Math.PI / 2, 0]} position={[-cabinetHalfWidth, 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial {...carcass} />
      </mesh>
      <mesh position={[cabinetHalfWidth - 0.009, (counterTop - 0.03) / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.018, counterTop - 0.03, 0.6]} />
        <meshStandardMaterial {...carcass} />
      </mesh>
      <mesh position={[0, 0.5, wallZ + 0.008]}>
        <boxGeometry args={[0.88, 0.8, 0.012]} />
        <meshStandardMaterial {...cabinetInside} />
      </mesh>
      <mesh position={[0, floorTop - 0.009, 0]} receiveShadow>
        <boxGeometry args={[0.88, 0.018, 0.59]} />
        <meshStandardMaterial {...cabinetInside} />
      </mesh>
      {/* recessed toe kick */}
      <mesh position={[0, 0.05, 0.225]}>
        <boxGeometry args={[0.9, 0.1, 0.018]} />
        <meshStandardMaterial color="#d8d2c8" roughness={0.7} />
      </mesh>
      {/* face frame, doors off */}
      <mesh position={[0, 0.83, cabinetFront]} castShadow>
        <boxGeometry args={[0.914, 0.108, 0.02]} />
        <meshStandardMaterial {...carcass} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (cabinetHalfWidth - 0.022), 0.45, cabinetFront]}>
          <boxGeometry args={[0.044, 0.7, 0.02]} />
          <meshStandardMaterial {...carcass} />
        </mesh>
      ))}
      <mesh position={[0, 0.115, cabinetFront]}>
        <boxGeometry args={[0.914, 0.03, 0.02]} />
        <meshStandardMaterial {...carcass} />
      </mesh>
      <mesh geometry={counterGeometry} position={[0, counterTop - 0.03, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#5a5f66" roughness={0.35} metalness={0.05} />
      </mesh>
    </group>
  );
}

/* ---------- the sink, faucet and what happens in the bowl ---------- */

function Sink() {
  const brushed = useMemo(() => brushedTexture(), []);
  const { rim, walls, bowlFloor } = useMemo(() => {
    const rimShape = roundedRect(new THREE.Shape(), -0.33, -0.24, 0.33, 0.28, 0.03);
    const rimGeometry = flatPlate(rimShape, [roundedRect(new THREE.Path(), -basinHalfWidth, -basinHalfDepth, basinHalfWidth, basinHalfDepth, 0.05)], 0.006);
    const wallShape = roundedRect(new THREE.Shape(), -basinHalfWidth - 0.002, -basinHalfDepth - 0.002, basinHalfWidth + 0.002, basinHalfDepth + 0.002, 0.052);
    const wallGeometry = flatPlate(wallShape, [roundedRect(new THREE.Path(), -basinHalfWidth, -basinHalfDepth, basinHalfWidth, basinHalfDepth, 0.05)], counterTop - basinFloor);
    const floorShape = roundedRect(new THREE.Shape(), -basinHalfWidth, -basinHalfDepth, basinHalfWidth, basinHalfDepth, 0.05);
    const floorGeometry = flatPlate(floorShape, [circlePath(0, 0, 0.045)], 0.0015);
    return { rim: rimGeometry, walls: wallGeometry, bowlFloor: floorGeometry };
  }, []);
  return (
    <RigPart id="sink_basin">
      <mesh geometry={rim} position={[0, counterTop, 0]} castShadow receiveShadow>
        <meshStandardMaterial map={brushed} color="#dfe3e8" metalness={0.65} roughness={0.3} />
      </mesh>
      <mesh geometry={walls} position={[0, basinFloor, 0]} receiveShadow>
        <meshStandardMaterial map={brushed} color="#c9cfd5" metalness={0.65} roughness={0.32} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={bowlFloor} position={[0, basinFloor - 0.0015, 0]} receiveShadow>
        <meshStandardMaterial map={brushed} color="#bcc3ca" metalness={0.65} roughness={0.34} side={THREE.DoubleSide} />
      </mesh>
    </RigPart>
  );
}

function FlangeAndGuard() {
  const throat = useMemo(() => ringGeometry(0.043, 0.046, 0.055, 48), []);
  const lip = useMemo(() => ringGeometry(0.044, 0.058, 0.004, 48), []);
  const gunk = useMemo(() => blotchTexture("disposal-guard-gunk", ["rgba(92,70,40,0.85)", "rgba(60,48,30,0.8)", "rgba(120,98,60,0.7)"], { blobs: 46, spread: 0.95, minRadius: 8, maxRadius: 22, seed: 23 }), []);
  const flaps = 8;
  return (
    <group>
      <RigPart id="sink_flange">
        <mesh geometry={lip} position={[0, basinFloor, 0]} castShadow>
          <meshStandardMaterial {...chrome} />
        </mesh>
        <mesh geometry={throat} position={[0, flangeLip - 0.055, 0]}>
          <meshStandardMaterial {...chrome} side={THREE.DoubleSide} />
        </mesh>
      </RigPart>
      {/* rubber splash guard: a ring of flaps around a small centre hole, with a skirt that sits in the throat */}
      <RigPart id="splash_guard" position={[0, flangeLip - 0.006, 0]}>
        <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.04, 0.0455, 48]} />
          <meshStandardMaterial {...rubber} side={THREE.DoubleSide} />
        </mesh>
        {Array.from({ length: flaps }, (_, index) => {
          const gap = 0.07;
          return (
            <mesh key={index} position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.012, 0.0405, 6, 1, (index / flaps) * Math.PI * 2 + gap / 2, (Math.PI * 2) / flaps - gap]} />
              <meshStandardMaterial {...rubber} side={THREE.DoubleSide} />
            </mesh>
          );
        })}
        <mesh position={[0, -0.012, 0]}>
          <cylinderGeometry args={[0.043, 0.04, 0.026, 40, 1, true]} />
          <meshStandardMaterial {...rubber} side={THREE.DoubleSide} />
        </mesh>
        <RigPart id="splash_guard_gunk" position={[0, 0.0035, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.013, 0.044, 40]} />
            <meshStandardMaterial map={gunk} transparent alphaTest={0.05} roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, -0.0045, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.013, 0.044, 40]} />
            <meshStandardMaterial map={gunk} transparent alphaTest={0.05} roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
        </RigPart>
      </RigPart>
    </group>
  );
}

function Faucet() {
  const spoutPoints = useMemo<Vec3[]>(() => [[0, rimTop + 0.04, deckZ], [0, rimTop + 0.27, deckZ], [0, rimTop + 0.34, deckZ + 0.07], [0, rimTop + 0.3, deckZ + 0.18], [0, rimTop + 0.245, deckZ + 0.215]], []);
  return (
    <group>
      <mesh position={[0, rimTop + 0.025, deckZ]} castShadow>
        <cylinderGeometry args={[0.024, 0.03, 0.05, 32]} />
        <meshStandardMaterial {...chrome} />
      </mesh>
      <Tube points={spoutPoints} radius={0.0115}>
        <meshStandardMaterial {...chrome} />
      </Tube>
      <mesh position={[0, rimTop + 0.238, deckZ + 0.216]}>
        <cylinderGeometry args={[0.014, 0.012, 0.022, 24]} />
        <meshStandardMaterial {...chrome} />
      </mesh>
      {/* side lever: lifts to run water */}
      <RigPart id="faucet_handle" position={[0.026, rimTop + 0.035, deckZ]}>
        <mesh position={[0.008, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.011, 0.011, 0.016, 20]} />
          <meshStandardMaterial {...chrome} />
        </mesh>
        <RoundedBox args={[0.085, 0.012, 0.018]} radius={0.005} position={[0.055, 0.008, 0]} rotation={[0, 0, 0.12]}>
          <meshStandardMaterial {...chrome} />
        </RoundedBox>
      </RigPart>
      <WaterStream from={[0, rimTop + 0.226, deckZ + 0.216]} />
    </group>
  );
}

/** Water from the spout down into the drain, as tall as the faucet is open. */
function WaterStream({ from }: { from: Vec3 }) {
  const rig = useRig();
  const groupRef = useRef<THREE.Group>(null);
  const length = from[1] - basinFloor;
  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const open = THREE.MathUtils.clamp((rig.amounts.current.faucet_handle ?? 0) * 1.6, 0, 1);
    group.visible = open > 0.02;
    group.scale.set(0.4 + open * 0.6 + Math.sin(clock.elapsedTime * 30) * 0.04, open, 0.4 + open * 0.6);
  });
  return (
    <group ref={groupRef} position={from} visible={false}>
      <mesh position={[0, -length / 2, 0]}>
        <cylinderGeometry args={[0.0055, 0.0075, length, 16, 1, true]} />
        <meshStandardMaterial color="#9fd3f5" transparent opacity={0.6} roughness={0.05} />
      </mesh>
    </group>
  );
}

function SinkExtras() {
  const iceCubes: [number, number, number, number][] = [
    [0.03, 0.012, 0.02, 0.4],
    [-0.025, 0.012, 0.03, 1.1],
    [0.0, 0.012, -0.03, 2.0],
    [0.045, 0.012, -0.02, 0.2],
    [-0.04, 0.012, -0.015, 2.6],
    [0.012, 0.03, 0.005, 1.6],
  ];
  return (
    <group>
      {/* stopper, brought over the drain and pushed in */}
      <ShowWhileOut id="sink_stopper">
        <RigPart id="sink_stopper" position={[0, flangeLip + 0.002, 0]}>
          <mesh position={[0, 0.002, 0]}>
            <cylinderGeometry args={[0.056, 0.054, 0.006, 40]} />
            <meshStandardMaterial {...chrome} />
          </mesh>
          <mesh position={[0, -0.012, 0]}>
            <cylinderGeometry args={[0.04, 0.036, 0.024, 32]} />
            <meshStandardMaterial {...rubber} />
          </mesh>
          <mesh position={[0, 0.016, 0]}>
            <cylinderGeometry args={[0.009, 0.012, 0.022, 20]} />
            <meshStandardMaterial {...chrome} />
          </mesh>
        </RigPart>
      </ShowWhileOut>
      {/* water held in the bowl by the stopper; rises in, drains away */}
      <ShowWhileOut id="sink_water">
        <RigPart id="sink_water" position={[0, basinFloor + 0.1, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[basinHalfWidth * 2 - 0.01, basinHalfDepth * 2 - 0.01]} />
            <meshStandardMaterial color="#8cc4e8" transparent opacity={0.55} roughness={0.05} metalness={0.1} />
          </mesh>
          <mesh position={[0, -0.05, 0]}>
            <boxGeometry args={[basinHalfWidth * 2 - 0.01, 0.1, basinHalfDepth * 2 - 0.01]} />
            <meshStandardMaterial color="#9fd0ef" transparent opacity={0.22} roughness={0.05} depthWrite={false} />
          </mesh>
        </RigPart>
      </ShowWhileOut>
      <ShowFromBeat ids={["ice_cubes"]}>
        <RigPart id="ice_cubes" position={[0, basinFloor + 0.004, 0.0]}>
          {iceCubes.map(([x, y, z, spin], index) => (
            <RoundedBox key={index} args={[0.022, 0.02, 0.022]} radius={0.004} position={[x, y, z]} rotation={[spin * 0.3, spin, spin * 0.2]}>
              <meshStandardMaterial color="#e6f4fb" transparent opacity={0.8} roughness={0.08} />
            </RoundedBox>
          ))}
        </RigPart>
      </ShowFromBeat>
      <ShowFromBeat ids={["citrus_peels"]}>
        <RigPart id="citrus_peels" position={[0, basinFloor + 0.01, 0]}>
          {[
            [0.025, 0, 0.015, 0.3, "#f4c430"],
            [-0.02, 0.004, -0.02, 2.1, "#f4c430"],
            [0.03, 0.006, -0.03, 4.0, "#f08a24"],
          ].map(([x, y, z, spin, color], index) => (
            <group key={index} position={[x as number, y as number, z as number]} rotation={[0.2, spin as number, 0]}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <sphereGeometry args={[0.022, 20, 10, 0, Math.PI, 0, Math.PI / 2]} />
                <meshStandardMaterial color={color as string} roughness={0.6} side={THREE.DoubleSide} />
              </mesh>
              <mesh rotation={[Math.PI / 2, 0, 0]} scale={0.94}>
                <sphereGeometry args={[0.022, 20, 10, 0, Math.PI, 0, Math.PI / 2]} />
                <meshStandardMaterial color="#fbf3d9" roughness={0.8} side={THREE.BackSide} />
              </mesh>
            </group>
          ))}
        </RigPart>
      </ShowFromBeat>
    </group>
  );
}

/* ---------- the disposal ---------- */

function MountingAssembly() {
  const screwAngles = [Math.PI / 2, (Math.PI * 7) / 6, (Math.PI * 11) / 6];
  const lugAngles = [Math.PI / 6, (Math.PI * 5) / 6, (Math.PI * 3) / 2];
  const screwPosition = (angle: number): Vec3 => [Math.sin(angle) * 0.066, mountRingY - 0.012, Math.cos(angle) * 0.066];
  return (
    <group>
      {/* fiber gasket and backup ring tight under the sink */}
      <Ring inner={0.046} outer={0.068} height={0.004} y={basinFloor - 0.006}>
        <meshStandardMaterial color="#8b7b62" roughness={0.9} />
      </Ring>
      <Ring inner={0.046} outer={0.072} height={0.006} y={basinFloor - 0.012}>
        <meshStandardMaterial {...stainlessInside} />
      </Ring>
      {/* upper mounting ring the screws push up against the backup ring */}
      <Ring inner={0.046} outer={0.08} height={0.008} y={mountRingY - 0.004}>
        <meshStandardMaterial color="#c3c8ce" metalness={0.8} roughness={0.3} />
      </Ring>
      <RigPart id="mounting_screws" position={screwPosition(screwAngles[0])}>
        <MountingScrew />
      </RigPart>
      {screwAngles.slice(1).map((angle) => (
        <Twin key={angle} of="mounting_screws" position={screwPosition(angle)}>
          <MountingScrew />
        </Twin>
      ))}
      {/* the twist-lock ring the disposal hangs from */}
      <RigPart id="mounting_ring" position={[0, lugRingY, 0]}>
        <Ring inner={0.06} outer={0.084} height={0.012}>
          <meshStandardMaterial color="#9aa1a9" metalness={0.75} roughness={0.32} />
        </Ring>
        {lugAngles.map((angle) => (
          <group key={angle} rotation={[0, angle, 0]}>
            <RoundedBox args={[0.014, 0.016, 0.03]} radius={0.003} position={[0, 0.006, 0.094]}>
              <meshStandardMaterial color="#9aa1a9" metalness={0.75} roughness={0.32} />
            </RoundedBox>
          </group>
        ))}
      </RigPart>
    </group>
  );
}

function MountingScrew() {
  return (
    <group>
      <mesh position={[0, 0.012, 0]}>
        <cylinderGeometry args={[0.003, 0.003, 0.024, 10]} />
        <meshStandardMaterial color="#c9ced4" metalness={0.85} roughness={0.25} />
      </mesh>
      <mesh position={[0, -0.002, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 0.004, 20]} />
        <meshStandardMaterial color="#c9ced4" metalness={0.85} roughness={0.25} />
      </mesh>
      <mesh position={[0, -0.0041, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.009, 0.0014]} />
        <meshStandardMaterial color="#3a3d42" />
      </mesh>
    </group>
  );
}

function DisposalBody() {
  const cutStart = windowHalfAngle;
  const cutLength = Math.PI * 2 - windowHalfAngle * 2;
  const hopperShell = useMemo(() => {
    const height = hopperTop - hopperBottom;
    const profile = [new THREE.Vector2(linerRadius, height), new THREE.Vector2(hopperRadius + 0.004, height), new THREE.Vector2(hopperRadius + 0.004, height - 0.012), new THREE.Vector2(hopperRadius, height - 0.016), new THREE.Vector2(hopperRadius, 0)];
    return new THREE.LatheGeometry(profile, 64, cutStart, cutLength);
  }, [cutStart, cutLength]);
  const liner = useMemo(() => new THREE.CylinderGeometry(linerRadius, linerRadius, hopperTop - hopperBottom, 64, 1, true, cutStart, cutLength), [cutStart, cutLength]);
  const motor = useMemo(() => {
    const top = hopperBottom - unitBottom;
    const profile = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.06, 0),
      new THREE.Vector2(0.075, 0.006),
      new THREE.Vector2(motorRadius, 0.022),
      new THREE.Vector2(motorRadius, top - 0.012),
      new THREE.Vector2(hopperRadius + 0.006, top - 0.004),
      new THREE.Vector2(hopperRadius, top),
      new THREE.Vector2(0, top),
    ];
    return new THREE.LatheGeometry(profile, 64);
  }, []);
  const label = useMemo(() => labelTexture("FOOD WASTE\nDISPOSER  1/2 HP", "#2b2e33", 30), []);
  const cutEdge = (angle: number) => (
    <mesh key={angle} position={[Math.sin(angle) * (linerRadius + hopperRadius) * 0.5, (hopperTop + hopperBottom) / 2, Math.cos(angle) * (linerRadius + hopperRadius) * 0.5]} rotation={[0, angle - Math.PI / 2, 0]}>
      <boxGeometry args={[hopperRadius - linerRadius + 0.004, hopperTop - hopperBottom, 0.0015]} />
      <meshStandardMaterial color="#d9dce0" roughness={0.6} />
    </mesh>
  );
  return (
    <group>
      <RigPart id="disposal_body">
        <mesh geometry={hopperShell} position={[0, hopperBottom, 0]} castShadow>
          <meshStandardMaterial {...darkPlastic} side={THREE.DoubleSide} />
        </mesh>
        {cutEdge(windowHalfAngle)}
        {cutEdge(-windowHalfAngle)}
        <mesh geometry={motor} position={[0, unitBottom, 0]} castShadow receiveShadow>
          <meshStandardMaterial {...darkPlastic} />
        </mesh>
        {/* cooling ribs and the seam between hopper and motor */}
        <Ring inner={hopperRadius - 0.002} outer={motorRadius + 0.003} height={0.008} y={hopperBottom - 0.012}>
          <meshStandardMaterial color="#2a2c31" roughness={0.6} />
        </Ring>
        {Array.from({ length: 14 }, (_, index) => {
          const angle = (index / 14) * Math.PI * 2 + 0.2;
          return (
            <mesh key={index} position={[Math.sin(angle) * (motorRadius + 0.002), unitBottom + 0.05, Math.cos(angle) * (motorRadius + 0.002)]} rotation={[0, angle, 0]}>
              <boxGeometry args={[0.006, 0.05, 0.004]} />
              <meshStandardMaterial color="#2a2c31" roughness={0.6} />
            </mesh>
          );
        })}
        {/* top collar the lugs lock onto */}
        <Ring inner={hopperRadius - 0.004} outer={hopperRadius + 0.008} height={0.01} y={hopperTop - 0.01}>
          <meshStandardMaterial {...darkPlastic} />
        </Ring>
        {/* discharge boss on the right */}
        <mesh position={[hopperRadius + 0.008, outletY, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.026, 0.026, 0.02, 32]} />
          <meshStandardMaterial {...darkPlastic} />
        </mesh>
        {/* hex socket boss, cord plate on the bottom */}
        <mesh position={[0, unitBottom - 0.003, 0]}>
          <cylinderGeometry args={[0.016, 0.016, 0.006, 32]} />
          <meshStandardMaterial color="#5a5e65" metalness={0.5} roughness={0.4} />
        </mesh>
        <RoundedBox args={[0.045, 0.008, 0.04]} radius={0.003} position={[-0.038, unitBottom - 0.003, -0.032]}>
          <meshStandardMaterial color="#4a4e55" roughness={0.5} />
        </RoundedBox>
      </RigPart>
      <RigPart id="model_label" position={[0, unitBottom + 0.12, 0]}>
        <mesh>
          <cylinderGeometry args={[motorRadius + 0.0015, motorRadius + 0.0015, 0.07, 64, 1, true, -0.75, 1.5]} />
          <meshStandardMaterial color="#c8ccd2" metalness={0.6} roughness={0.35} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[motorRadius + 0.0025, motorRadius + 0.0025, 0.06, 64, 1, true, -0.6, 1.2]} />
          <meshStandardMaterial map={label} transparent roughness={0.5} />
        </mesh>
      </RigPart>
      <RigPart id="hex_socket" position={[0, unitBottom - 0.0062, 0]}>
        <mesh>
          <cylinderGeometry args={[0.0075, 0.0075, 0.0015, 6]} />
          <meshStandardMaterial color="#0f1012" roughness={0.9} />
        </mesh>
      </RigPart>
      <RigPart id="reset_button" position={[0.042, unitBottom - 0.006, 0.03]}>
        <mesh>
          <cylinderGeometry args={[0.0085, 0.0085, 0.008, 28]} />
          <meshStandardMaterial color="#d7322b" roughness={0.45} />
        </mesh>
      </RigPart>
      <RigPart id="grinding_chamber" position={[0, 0, 0]}>
        <mesh geometry={liner} position={[0, (hopperTop + hopperBottom) / 2, 0]}>
          <meshStandardMaterial {...stainlessInside} side={THREE.DoubleSide} />
        </mesh>
        {/* grind ring with its teeth */}
        <mesh position={[0, turntableTop + 0.012, 0]}>
          <cylinderGeometry args={[linerRadius - 0.001, linerRadius - 0.001, 0.024, 48, 1, true, windowHalfAngle, Math.PI * 2 - windowHalfAngle * 2]} />
          <meshStandardMaterial color="#8e959d" metalness={0.8} roughness={0.35} side={THREE.DoubleSide} />
        </mesh>
        {Array.from({ length: 22 }, (_, index) => {
          const angle = windowHalfAngle + 0.08 + (index / 22) * (Math.PI * 2 - windowHalfAngle * 2 - 0.16);
          return (
            <mesh key={index} position={[Math.sin(angle) * (linerRadius - 0.004), turntableTop + 0.012, Math.cos(angle) * (linerRadius - 0.004)]} rotation={[0, angle, 0]}>
              <boxGeometry args={[0.004, 0.022, 0.006]} />
              <meshStandardMaterial color="#7b828a" metalness={0.8} roughness={0.35} />
            </mesh>
          );
        })}
      </RigPart>
    </group>
  );
}

/** The turntable follows the motor shaft: the wrench turns it by hand, the motor spins it once the jam is out. */
function Turntable() {
  const rig = useRig();
  const shaftRef = useRef<THREE.Group>(null);
  const spinRef = useRef(0);
  useFrame((_, delta) => {
    const amounts = rig.amounts.current;
    const running = (amounts.wall_switch ?? 0) > 0.5 && (amounts.jammed_object ?? 0) > 0.99;
    if (running) spinRef.current += delta * 18;
    if (shaftRef.current) shaftRef.current.rotation.y = spinRef.current + (amounts.hex_wrench_turn ?? 0) * 1.4;
  });
  return (
    <RigPart id="turntable" position={[0, turntableTop, 0]}>
      <group ref={shaftRef}>
        <mesh position={[0, -0.003, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[linerRadius - 0.003, linerRadius - 0.003, 0.006, 48]} />
          <meshStandardMaterial color="#cfd4da" metalness={0.8} roughness={0.28} />
        </mesh>
        {/* drain slots around the rim */}
        {Array.from({ length: 8 }, (_, index) => {
          const angle = (index / 8) * Math.PI * 2 + 0.2;
          return (
            <mesh key={index} position={[Math.sin(angle) * 0.058, 0.0004, Math.cos(angle) * 0.058]} rotation={[-Math.PI / 2, 0, -angle]}>
              <planeGeometry args={[0.006, 0.012]} />
              <meshStandardMaterial color="#2a2d31" />
            </mesh>
          );
        })}
        <mesh position={[0, 0.003, 0]}>
          <cylinderGeometry args={[0.011, 0.012, 0.006, 24]} />
          <meshStandardMaterial color="#a9b0b8" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* two swivel impeller lugs */}
        {[0.5, 0.5 + Math.PI].map((angle) => (
          <group key={angle} rotation={[0, angle, 0]}>
            <mesh position={[0, 0.003, 0.044]}>
              <cylinderGeometry args={[0.004, 0.004, 0.006, 12]} />
              <meshStandardMaterial color="#8e959d" metalness={0.8} roughness={0.3} />
            </mesh>
            <RoundedBox args={[0.012, 0.009, 0.026]} radius={0.002} position={[0.004, 0.008, 0.047]} rotation={[0, 0.5, 0]}>
              <meshStandardMaterial color="#9ba2aa" metalness={0.85} roughness={0.25} />
            </RoundedBox>
          </group>
        ))}
      </group>
    </RigPart>
  );
}

/** The jam: a peach pit wedged against the grind ring, lifted out with tongs. */
function Jam() {
  const rig = useRig();
  const tongsRef = useRef<THREE.Group>(null);
  const restPosition: Vec3 = [-0.012, turntableTop + 0.014, 0.05];
  useFrame(() => {
    const tongs = tongsRef.current;
    const pit = rig.nodes.current.jammed_object?.children[0];
    if (!tongs || !pit) return;
    const amount = rig.amounts.current.jammed_object ?? 0;
    tongs.visible = rig.focus.current === "jammed_object" && amount < 0.62 && pit.visible;
    tongs.position.set(restPosition[0] + pit.position.x, restPosition[1] + pit.position.y, restPosition[2] + pit.position.z);
  });
  const pitGeometry = useMemo(() => {
    const geometry = new THREE.SphereGeometry(0.014, 24, 16);
    const position = geometry.attributes.position;
    const random = (seed: number) => Math.sin(seed * 12.9898) * 43758.5453 - Math.floor(Math.sin(seed * 12.9898) * 43758.5453);
    for (let index = 0; index < position.count; index++) {
      const wrinkle = 1 + (random(index) - 0.5) * 0.18;
      position.setXYZ(index, position.getX(index) * wrinkle * 0.85, position.getY(index) * wrinkle * 0.8, position.getZ(index) * wrinkle * 1.2);
    }
    geometry.computeVertexNormals();
    return geometry;
  }, []);
  // Tongs angle up and back through the drain opening.
  const tilt = Math.atan2(restPosition[2], flangeLip - restPosition[1]);
  return (
    <group>
      <RigPart id="jammed_object" position={restPosition}>
        <mesh geometry={pitGeometry} rotation={[0.3, 0.6, 0.2]} castShadow>
          <meshStandardMaterial color="#8a4f2c" roughness={0.85} />
        </mesh>
      </RigPart>
      <group ref={tongsRef} visible={false}>
        <group rotation={[-tilt, 0, 0]}>
          {[-1, 1].map((side) => (
            <group key={side} position={[side * 0.009, 0, 0]} rotation={[0, 0, side * -0.05]}>
              <mesh position={[0, 0.13, 0]}>
                <boxGeometry args={[0.004, 0.24, 0.012]} />
                <meshStandardMaterial color="#d6dbe0" metalness={0.85} roughness={0.25} />
              </mesh>
              <mesh position={[side * -0.002, 0.008, 0]}>
                <boxGeometry args={[0.006, 0.018, 0.016]} />
                <meshStandardMaterial color="#d6dbe0" metalness={0.85} roughness={0.25} />
              </mesh>
              <mesh position={[0, 0.2, 0]}>
                <boxGeometry args={[0.007, 0.09, 0.016]} />
                <meshStandardMaterial color="#2f3237" roughness={0.6} />
              </mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}

/** 1/4" hex jam wrench: short leg up into the socket, long arm toward you. */
function HexWrench() {
  const steel = { color: "#cfd4d9", metalness: 0.9, roughness: 0.22 };
  return (
    <group>
      <ShowWhileOut id="hex_wrench" focusIds={["hex_wrench", "hex_wrench_turn"]}>
        <RigPart id="hex_wrench" position={[0, unitBottom - 0.01, 0]}>
          <RigPart id="hex_wrench_turn">
            <mesh position={[0, 0.005, 0]}>
              <cylinderGeometry args={[0.0036, 0.0036, 0.04, 6]} />
              <meshStandardMaterial {...steel} />
            </mesh>
            <mesh position={[0, -0.015, 0.006]} rotation={[Math.PI / 4, 0, 0]}>
              <cylinderGeometry args={[0.0036, 0.0036, 0.018, 6]} />
              <meshStandardMaterial {...steel} />
            </mesh>
            <mesh position={[0, -0.021, 0.062]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.0036, 0.0036, 0.105, 6]} />
              <meshStandardMaterial {...steel} />
            </mesh>
          </RigPart>
        </RigPart>
      </ShowWhileOut>
      <GlowWith owners={["hex_wrench"]} target="hex_wrench_turn" />
    </group>
  );
}

/* ---------- plumbing and power under the sink ---------- */

function Plumbing() {
  const dishwasherHose = useMemo<Vec3[]>(() => [[-hopperRadius - 0.036, inletY, 0], [-0.15, inletY + 0.01, -0.01], [-0.24, 0.8, -0.12], [-0.3, 0.86, -0.24], [-0.37, 0.78, -0.27], [-0.41, 0.5, -0.22], [-cabinetHalfWidth + 0.01, 0.42, -0.2]], []);
  const dischargeTube = useMemo<Vec3[]>(() => [[hopperRadius + 0.02, outletY, 0], [0.16, outletY, 0], [0.195, outletY - 0.015, 0], [trapX, outletY - 0.05, 0], [trapX, 0.47, 0]], []);
  const jBend = useMemo<Vec3[]>(() => [[0, 0.47, 0], [0, 0.4, 0], [0, 0.36, -0.03], [0, 0.358, -0.07], [0, 0.4, -0.1], [0, 0.44, -0.1]], []);
  const trapArm = useMemo<Vec3[]>(() => [[trapX, 0.44, -0.1], [trapX, 0.46, -0.1], [trapX, 0.47, -0.13], [trapX, 0.47, wallZ + 0.03], [trapX, 0.47, wallZ]], []);
  return (
    <group>
      {/* dishwasher drain hose with a high loop up under the counter */}
      <Tube points={dishwasherHose} radius={0.011} segments={80}>
        <meshStandardMaterial color="#9ea5ac" roughness={0.6} />
      </Tube>
      <mesh position={[-0.27, 0.86, -0.2]} rotation={[0.6, 0, 0.3]}>
        <torusGeometry args={[0.014, 0.003, 8, 20]} />
        <meshStandardMaterial color="#b9bec4" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* inlet stub on the hopper (toward the dishwasher on the left) with the hose pushed over it */}
      <RigPart id="dishwasher_inlet">
        <mesh position={[-hopperRadius - 0.017, inletY, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.011, 0.012, 0.04, 24]} />
          <meshStandardMaterial {...darkPlastic} />
        </mesh>
        <mesh position={[-hopperRadius - 0.03, inletY, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.0125, 0.0125, 0.028, 24]} />
          <meshStandardMaterial color="#9ea5ac" roughness={0.6} />
        </mesh>
      </RigPart>
      <group position={[-hopperRadius - 0.03, inletY, 0]}>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.0128, 0.0022, 8, 32]} />
          <meshStandardMaterial color="#c9ced4" metalness={0.85} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0.015, 0]}>
          <boxGeometry args={[0.008, 0.006, 0.014]} />
          <meshStandardMaterial color="#c9ced4" metalness={0.85} roughness={0.25} />
        </mesh>
        <RigPart id="hose_clamp" position={[0, 0.0155, 0.009]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.0035, 0.0035, 0.004, 6]} />
            <meshStandardMaterial color="#d9dde2" metalness={0.85} roughness={0.25} />
          </mesh>
          <mesh position={[0, 0, 0.0021]}>
            <boxGeometry args={[0.005, 0.001, 0.0005]} />
            <meshStandardMaterial color="#2f3237" />
          </mesh>
        </RigPart>
      </group>
      {/* discharge tube from the side of the unit to the trap */}
      <RigPart id="discharge_tube">
        <Tube points={dischargeTube} radius={0.019}>
          <meshStandardMaterial color="#c9ced4" metalness={0.7} roughness={0.3} />
        </Tube>
        <RoundedBox args={[0.006, 0.07, 0.05]} radius={0.002} position={[hopperRadius + 0.021, outletY + 0.012, 0]}>
          <meshStandardMaterial color="#b3b9bf" metalness={0.75} roughness={0.3} />
        </RoundedBox>
      </RigPart>
      <RigPart id="discharge_bolt" position={[hopperRadius + 0.026, outletY + 0.034, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.0065, 0.0065, 0.006, 6]} />
          <meshStandardMaterial color="#d3d7dc" metalness={0.85} roughness={0.25} />
        </mesh>
      </RigPart>
      {/* fixed trap arm into the wall */}
      <Tube points={trapArm} radius={0.019}>
        <meshStandardMaterial {...pvc} />
      </Tube>
      <mesh position={[trapX, 0.47, wallZ + 0.003]}>
        <cylinderGeometry args={[0.036, 0.036, 0.004, 32]} />
        <meshStandardMaterial {...chrome} />
      </mesh>
      {/* removable J-bend with its two slip nuts and the clog inside */}
      <RigPart id="p_trap" position={[trapX, 0, 0]}>
        <Tube points={jBend} radius={0.019} segments={60}>
          <meshStandardMaterial {...pvc} />
        </Tube>
        <RigPart id="trap_slip_nuts" position={[0, 0.462, 0]}>
          <SlipNut />
        </RigPart>
        <Twin of="trap_slip_nuts" position={[0, 0.432, -0.1]}>
          <SlipNut />
        </Twin>
        <ShowFromBeat ids={["trap_clog"]}>
          <RigPart id="trap_clog" position={[0, 0.474, 0]}>
            <mesh scale={[1, 0.5, 1]}>
              <sphereGeometry args={[0.019, 20, 12]} />
              <meshStandardMaterial color="#6e5a3a" roughness={0.95} />
            </mesh>
          </RigPart>
        </ShowFromBeat>
      </RigPart>
      <ShowFromBeat ids={["p_trap", "trap_slip_nuts", "trap_clog"]}>
        <Bucket position={[trapX, floorTop, -0.05]} />
      </ShowFromBeat>
    </group>
  );
}

function SlipNut() {
  const geometry = useMemo(() => ringGeometry(0.019, 0.026, 0.02, 16), []);
  return (
    <mesh geometry={geometry} position={[0, -0.01, 0]}>
      <meshStandardMaterial color="#ecebe6" roughness={0.5} />
    </mesh>
  );
}

function Bucket({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.09, 0]}>
        <cylinderGeometry args={[0.12, 0.1, 0.18, 40, 1, true]} />
        <meshStandardMaterial color="#3e7fc4" roughness={0.55} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.002, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.004, 40]} />
        <meshStandardMaterial color="#336da9" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.18, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.12, 0.004, 8, 48]} />
        <meshStandardMaterial color="#3e7fc4" roughness={0.55} />
      </mesh>
    </group>
  );
}

function Power() {
  const cord = useMemo<Vec3[]>(() => [[-0.04, unitBottom - 0.008, -0.04], [-0.06, 0.3, -0.09], [-0.12, 0.22, -0.18], [-0.2, 0.22, -0.25], [-0.22, 0.255, -0.268]], []);
  return (
    <group>
      <Tube points={cord} radius={0.0035} segments={60}>
        <meshStandardMaterial color="#202226" roughness={0.6} />
      </Tube>
      {/* duplex outlet on the back wall of the cabinet */}
      <RoundedBox args={[0.07, 0.115, 0.008]} radius={0.003} position={[-0.22, 0.3, wallZ + 0.016]}>
        <meshStandardMaterial color="#f7f6f2" roughness={0.5} />
      </RoundedBox>
      <RoundedBox args={[0.035, 0.04, 0.006]} radius={0.004} position={[-0.22, 0.325, wallZ + 0.02]}>
        <meshStandardMaterial color="#ecebe6" roughness={0.5} />
      </RoundedBox>
      <RigPart id="power_plug" position={[-0.22, 0.28, wallZ + 0.032]}>
        <RoundedBox args={[0.03, 0.036, 0.024]} radius={0.006}>
          <meshStandardMaterial color="#26282c" roughness={0.6} />
        </RoundedBox>
        <mesh position={[0, -0.022, -0.002]}>
          <cylinderGeometry args={[0.0045, 0.0035, 0.012, 12]} />
          <meshStandardMaterial color="#202226" roughness={0.6} />
        </mesh>
      </RigPart>
    </group>
  );
}

/** Toggle switch above the counter; down is off. */
function WallSwitch() {
  return (
    <group position={[0.42, 1.12, wallZ]}>
      <RoundedBox args={[0.072, 0.116, 0.008]} radius={0.003} position={[0, 0, 0.004]}>
        <meshStandardMaterial color="#f7f6f2" roughness={0.45} />
      </RoundedBox>
      <mesh position={[0, 0, 0.009]}>
        <boxGeometry args={[0.012, 0.026, 0.004]} />
        <meshStandardMaterial color="#dddcd6" roughness={0.5} />
      </mesh>
      <RigPart id="wall_switch" position={[0, 0, 0.01]}>
        <group rotation={[0.45, 0, 0]}>
          <RoundedBox args={[0.009, 0.007, 0.024]} radius={0.003} position={[0, 0, 0.012]}>
            <meshStandardMaterial color="#f3f2ec" roughness={0.4} />
          </RoundedBox>
        </group>
      </RigPart>
    </group>
  );
}

/** A small breaker panel on the wall to the left, door open; the disposal breaker is tagged. */
function BreakerPanel() {
  const tag = useMemo(() => labelTexture("DISPOSAL", "#c0392b", 40), []);
  const rows = 6;
  return (
    <group position={[-0.78, 1.32, wallZ]}>
      <RoundedBox args={[0.28, 0.42, 0.04]} radius={0.006} position={[0, 0, 0.02]} castShadow>
        <meshStandardMaterial color="#b9bec4" metalness={0.4} roughness={0.45} />
      </RoundedBox>
      <mesh position={[0, 0, 0.041]}>
        <planeGeometry args={[0.22, 0.36]} />
        <meshStandardMaterial color="#d9dcdf" roughness={0.6} />
      </mesh>
      {/* open door swung to the left */}
      <group position={[-0.14, 0, 0.04]} rotation={[0, -1.9, 0]}>
        <RoundedBox args={[0.28, 0.42, 0.006]} radius={0.003} position={[0.14, 0, 0]}>
          <meshStandardMaterial color="#b4b9bf" metalness={0.4} roughness={0.45} />
        </RoundedBox>
      </group>
      {Array.from({ length: rows * 2 }, (_, index) => {
        const column = index % 2;
        const row = Math.floor(index / 2);
        if (column === 1 && row === 2) return null;
        return (
          <group key={index} position={[column ? 0.05 : -0.05, 0.14 - row * 0.056, 0.046]}>
            <mesh>
              <boxGeometry args={[0.07, 0.045, 0.01]} />
              <meshStandardMaterial color="#2c2f34" roughness={0.6} />
            </mesh>
            <mesh position={[0, 0.006, 0.01]} rotation={[-0.35, 0, 0]}>
              <boxGeometry args={[0.03, 0.012, 0.016]} />
              <meshStandardMaterial color="#1f2125" roughness={0.6} />
            </mesh>
          </group>
        );
      })}
      <group position={[0.05, 0.14 - 2 * 0.056, 0.046]}>
        <mesh>
          <boxGeometry args={[0.07, 0.045, 0.01]} />
          <meshStandardMaterial color="#2c2f34" roughness={0.6} />
        </mesh>
        <mesh position={[0.07, 0, 0.002]}>
          <planeGeometry args={[0.07, 0.035]} />
          <meshStandardMaterial map={tag} transparent color="#ffffff" />
        </mesh>
        <RigPart id="circuit_breaker" position={[0, 0, 0.006]}>
          <mesh position={[0, 0.006, 0.008]} rotation={[-0.35, 0, 0]}>
            <boxGeometry args={[0.03, 0.012, 0.018]} />
            <meshStandardMaterial color="#1f2125" roughness={0.6} />
          </mesh>
        </RigPart>
      </group>
    </group>
  );
}

function LeakDrips() {
  const drop = (position: Vec3, scale = 1) => (
    <mesh key={position.join()} position={position} scale={[scale, scale * 1.5, scale]}>
      <sphereGeometry args={[0.005, 12, 10]} />
      <meshStandardMaterial color="#7fc3ee" transparent opacity={0.85} roughness={0.05} />
    </mesh>
  );
  return (
    <ShowFromBeat ids={["leak_drips"]}>
      <RigPart id="leak_drips" position={[0, 0, 0]}>
        {drop([0.05, basinFloor - 0.02, 0.05])}
        {drop([0.06, basinFloor - 0.045, 0.05], 0.8)}
        {drop([-hopperRadius - 0.03, inletY - 0.016, 0.006])}
        {drop([hopperRadius + 0.024, outletY - 0.03, 0.012])}
        {drop([hopperRadius + 0.024, outletY - 0.055, 0.012], 0.7)}
        <mesh position={[0.04, floorTop + 0.001, 0.04]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.4, 1, 1]}>
          <circleGeometry args={[0.05, 32]} />
          <meshStandardMaterial color="#8ccbf0" transparent opacity={0.5} roughness={0.05} />
        </mesh>
      </RigPart>
    </ShowFromBeat>
  );
}

export function GarbageDisposalModel() {
  return (
    <group>
      <Cabinet />
      <Sink />
      <FlangeAndGuard />
      <Faucet />
      <SinkExtras />
      <MountingAssembly />
      <DisposalBody />
      <Turntable />
      <Jam />
      <HexWrench />
      <Plumbing />
      <Power />
      <WallSwitch />
      <BreakerPanel />
      <LeakDrips />
    </group>
  );
}

const sampleSteps: { instruction: string; beats: Beat[] }[] = [
  {
    instruction: "Free a disposal that hums but won't spin",
    beats: [
      { part: "wall_switch", action: "close", caption: "Switch the disposal off" },
      { part: "power_plug", action: "remove", caption: "Unplug it under the sink" },
      { part: "hex_wrench", action: "insert", caption: "Wrench into the bottom hole" },
      { part: "hex_wrench_turn", action: "turn", caption: "Work it back and forth" },
      { part: "hex_wrench_turn", action: "turn", caption: "Until it turns freely" },
      { part: "hex_wrench", action: "remove", caption: "Pull the wrench out" },
      { part: "splash_guard", action: "remove", caption: "Lift out the splash guard" },
      { part: "jammed_object", action: "remove", caption: "Pull the jam out with tongs" },
      { part: "splash_guard", action: "insert", caption: "Push the guard back in" },
      { part: "power_plug", action: "insert", caption: "Plug it back in" },
      { part: "reset_button", action: "press", caption: "Press the red reset button" },
      { part: "faucet_handle", action: "open", caption: "Run cold water" },
      { part: "wall_switch", action: "open", caption: "Switch on and test" },
      { part: "wall_switch", action: "close", caption: "Switch off" },
      { part: "faucet_handle", action: "close", caption: "Turn the water off" },
    ],
  },
  {
    instruction: "Get a dead disposal to turn on",
    beats: [
      { part: "wall_switch", action: "close", caption: "Switch the disposal off" },
      { part: "power_plug", action: "insert", caption: "Push the plug in firmly" },
      { part: "disposal_body", action: "look", caption: "Let the motor cool down" },
      { part: "reset_button", action: "press", caption: "Press the red reset button" },
      { part: "circuit_breaker", action: "press", caption: "Flip breaker off, then on" },
      { part: "faucet_handle", action: "open", caption: "Run cold water" },
      { part: "wall_switch", action: "open", caption: "Switch on and test" },
      { part: "wall_switch", action: "close", caption: "Switch off" },
      { part: "faucet_handle", action: "close", caption: "Turn the water off" },
    ],
  },
  {
    instruction: "Clear a slow drain",
    beats: [
      { part: "faucet_handle", action: "open", caption: "Run cold water" },
      { part: "wall_switch", action: "open", caption: "Run the disposal a minute" },
      { part: "wall_switch", action: "close", caption: "Switch off" },
      { part: "faucet_handle", action: "close", caption: "Water off; still slow?" },
      { part: "trap_slip_nuts", action: "turn", caption: "Bucket under, loosen slip nuts" },
      { part: "p_trap", action: "remove", caption: "Drop the trap into bucket" },
      { part: "trap_clog", action: "clean", caption: "Clear out the sludge" },
      { part: "p_trap", action: "insert", caption: "Push the trap back up" },
      { part: "trap_slip_nuts", action: "turn", caption: "Hand-tighten both nuts" },
      { part: "faucet_handle", action: "open", caption: "Run water, check for drips" },
      { part: "faucet_handle", action: "close", caption: "Turn the water off" },
    ],
  },
  {
    instruction: "Get rid of a bad smell",
    beats: [
      { part: "wall_switch", action: "close", caption: "Make sure it's switched off" },
      { part: "splash_guard", action: "remove", caption: "Lift out the splash guard" },
      { part: "splash_guard_gunk", action: "clean", caption: "Scrub the slime off" },
      { part: "splash_guard", action: "insert", caption: "Push the guard back in" },
      { part: "ice_cubes", action: "clean", caption: "Drop in a cup of ice" },
      { part: "citrus_peels", action: "clean", caption: "Add a few citrus peels" },
      { part: "faucet_handle", action: "open", caption: "Run cold water" },
      { part: "wall_switch", action: "open", caption: "Grind until it sounds clear" },
      { part: "wall_switch", action: "close", caption: "Switch off" },
      { part: "faucet_handle", action: "close", caption: "Turn the water off" },
    ],
  },
  {
    instruction: "Find and stop a leak",
    beats: [
      { part: "wall_switch", action: "close", caption: "Switch the disposal off" },
      { part: "leak_drips", action: "clean", caption: "Dry everything with a towel" },
      { part: "sink_stopper", action: "insert", caption: "Put the stopper in" },
      { part: "sink_water", action: "insert", caption: "Fill the sink halfway" },
      { part: "mounting_ring", action: "look", caption: "Drips up top? Sink seal" },
      { part: "mounting_screws", action: "turn", caption: "Snug the three mount screws" },
      { part: "sink_stopper", action: "remove", caption: "Pull the stopper out" },
      { part: "sink_water", action: "remove", caption: "Let the water rush through" },
      { part: "dishwasher_inlet", action: "look", caption: "Check the dishwasher hose" },
      { part: "hose_clamp", action: "turn", caption: "Tighten the hose clamp" },
      { part: "discharge_tube", action: "look", caption: "Check the side drain pipe" },
      { part: "discharge_bolt", action: "turn", caption: "Tighten the flange bolt" },
    ],
  },
];

export const rig: RigModule = { catalog: garbageDisposalCatalog, Model: GarbageDisposalModel, sampleSteps };
