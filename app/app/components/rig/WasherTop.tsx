"use client";

import { RoundedBox } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { Beat, RigCatalog } from "../../lib/rig/types";
import catalogJson from "./catalogs/washer_top_load.json";
import type { RigModule } from "./registry";
import { RigPart } from "./RigRuntime";
import { perforatedTexture, screenMeshTexture } from "./textures";
import { BackWall, canvasTexture, chrome, circle, ClothesHeap, enamel, grimeTexture, LevelingFeet, OutletAndPlug, PanelWithHoles, ribbedTexture, Tube, WallTap } from "./WasherFront";

/** Whirlpool top-load washer (WTW5000 series, 2-in-1 removable agitator, built-in faucet). Metres, origin at the floor centre, +z toward the user. */
const width = 0.699;
const depth = 0.7;
const front = depth / 2;
const cabinetBottom = 0.03;
const deckTop = 0.92;
const deckThickness = 0.012;
const consoleFront = -0.245;
const consoleTop = 1.067;
const openingZ = 0.055;
const openingRadius = 0.225;
const basketRadius = 0.265;
const basketBottom = 0.33;
const basketTop = 0.85;
const lidHingeZ = -0.17;
const lidDepth = 0.485;
const wallZ = -0.64;
const inlets = [
  { x: 0.13, band: "#c8402f", tap: "hot_water_tap" },
  { x: 0.23, band: "#2f6fc8", tap: "cold_water_tap" },
];
const inletY = 0.98;
const tapY = 1.2;

const catalog = catalogJson as RigCatalog;
const plastic = { color: "#eef0f2", roughness: 0.45 };

function consoleTexture() {
  // The sloped face is 0.659 wide and 0.12 tall; x and y are in the face's own frame.
  return canvasTexture("wtw-console", 1024, 186, (context) => {
    const toX = (x: number) => ((x + 0.3295) / 0.659) * 1024;
    const toY = (y: number) => ((0.06 - y) / 0.12) * 186;
    const gradient = context.createLinearGradient(0, 0, 0, 186);
    gradient.addColorStop(0, "#eef0f3");
    gradient.addColorStop(1, "#dde1e6");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1024, 186);
    context.fillStyle = "#3b4048";
    context.font = "600 15px sans-serif";
    context.textAlign = "center";
    // cycle names fanned round the big knob
    const cycles = ["Heavy Duty", "Whites", "Normal", "Quick", "Delicates", "Rinse & Spin", "Drain & Spin", "Clean Washer"];
    const knobX = toX(0);
    const knobY = toY(-0.005);
    cycles.forEach((label, index) => {
      const angle = Math.PI * 1.08 + (index / (cycles.length - 1)) * Math.PI * 0.84;
      const x = knobX + Math.cos(angle) * 128;
      const y = knobY + Math.sin(angle) * 72 + 6;
      context.fillText(label, x, y);
      context.beginPath();
      context.arc(knobX + Math.cos(angle) * 78, knobY + Math.sin(angle) * 54, 3, 0, Math.PI * 2);
      context.fill();
    });
    context.fillText("Water Level", toX(-0.17), toY(0.042));
    context.fillText("Faucet", toX(-0.28), toY(-0.032));
    context.fillText("Power", toX(0.16), toY(-0.032));
    context.fillText("Start/Pause", toX(0.255), toY(-0.032));
    // lid locked light and status lights
    context.fillStyle = "#c5cad0";
    context.fillRect(toX(0.135), toY(0.04), toX(0.29) - toX(0.135), 22);
    context.fillStyle = "#e0a12a";
    context.beginPath();
    context.arc(toX(0.15), toY(0.04) + 11, 5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#3b4048";
    context.textAlign = "left";
    context.font = "600 13px sans-serif";
    context.fillText("Lid Locked · Sensing · Wash · Rinse", toX(0.158), toY(0.04) + 16);
    context.font = "700 22px sans-serif";
    context.fillStyle = "#8a9099";
    context.fillText("Whirlpool", toX(-0.31), toY(0.035));
  });
}

function tagTexture() {
  return canvasTexture("wtw-tag", 128, 48, (context) => {
    context.fillStyle = "#f8f8f4";
    context.fillRect(0, 0, 128, 48);
    context.fillStyle = "#222";
    context.font = "700 9px sans-serif";
    context.fillText("MOD WTW5057LW", 6, 12);
    context.fillText("SER C91234567", 6, 23);
    for (let bar = 0; bar < 50; bar++) context.fillRect(6 + bar * 2.3, 30, bar % 3 ? 1 : 1.8, 13);
  });
}

function Cabinet() {
  const deckCenterZ = (consoleFront + front) / 2;
  const deckLength = front - consoleFront;
  const deckHoles = useMemo(() => [circle(0, -(openingZ - deckCenterZ), openingRadius)], [deckCenterZ]);
  const ringProfile = useMemo(() => [[openingRadius, 0.002], [openingRadius + 0.004, -0.02], [openingRadius + 0.016, -0.045], [basketRadius + 0.008, -0.06]].map(([radius, y]) => new THREE.Vector2(radius, y)), []);
  const panelHeight = deckTop - deckThickness - cabinetBottom;
  return (
    <group>
      {/* top deck with the round tub opening, lying flat */}
      <group position={[0, deckTop - deckThickness, deckCenterZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <PanelWithHoles panelWidth={width} panelHeight={deckLength} thickness={deckThickness} holes={deckHoles} />
      </group>
      {/* the tub ring that slopes down into the basket */}
      <mesh position={[0, deckTop - deckThickness, openingZ]}>
        <latheGeometry args={[ringProfile, 96]} />
        <meshStandardMaterial {...plastic} side={THREE.DoubleSide} />
      </mesh>
      {/* front, sides and back */}
      <RoundedBox args={[width, panelHeight, 0.014]} radius={0.006} position={[0, cabinetBottom + panelHeight / 2, front - 0.007]} castShadow receiveShadow>
        <meshStandardMaterial {...enamel} />
      </RoundedBox>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[(side * (width - 0.012)) / 2, cabinetBottom + panelHeight / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.012, panelHeight, depth]} />
          <meshStandardMaterial {...enamel} />
        </mesh>
      ))}
      <mesh position={[0, cabinetBottom + panelHeight / 2, -front + 0.006]}>
        <boxGeometry args={[width - 0.02, panelHeight, 0.012]} />
        <meshStandardMaterial color="#eceef1" roughness={0.5} />
      </mesh>
      {/* toe strip */}
      <mesh position={[0, cabinetBottom + 0.03, front + 0.001]}>
        <boxGeometry args={[width - 0.04, 0.05, 0.002]} />
        <meshStandardMaterial color="#e3e6ea" roughness={0.4} />
      </mesh>
    </group>
  );
}

/** The raised back console: a wedge whose front face slopes back at the face tilt. */
const faceTilt = 0.28;
const faceCenter: [number, number, number] = [0, 0.9935 + 0.0015 * Math.sin(faceTilt), -0.257 + 0.0015 * Math.cos(faceTilt)];

function Console() {
  const texture = useMemo(() => consoleTexture(), []);
  const geometry = useMemo(() => {
    // Profile in (−z, y); extruded across the width.
    const profile = new THREE.Shape();
    const slope = Math.tan(faceTilt);
    const bottomZ = -0.2404 + (0.9358 - deckTop) * slope;
    const topZ = -0.2736 - (consoleTop - 1.0512) * slope;
    profile.moveTo(front, deckTop);
    profile.lineTo(-bottomZ, deckTop);
    profile.lineTo(-topZ, consoleTop - 0.008);
    profile.quadraticCurveTo(-topZ + 0.006, consoleTop, -topZ + 0.016, consoleTop);
    profile.lineTo(front, consoleTop);
    profile.closePath();
    return new THREE.ExtrudeGeometry(profile, { depth: width, bevelEnabled: false });
  }, []);
  return (
    <group>
      <mesh geometry={geometry} position={[-width / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
        <meshStandardMaterial {...enamel} />
      </mesh>
      <group position={faceCenter} rotation={[-faceTilt, 0, 0]}>
        <mesh>
          <planeGeometry args={[width - 0.04, 0.12]} />
          <meshStandardMaterial map={texture} roughness={0.4} />
        </mesh>
        <RigPart id="cycle_knob" position={[0, -0.005, 0.002]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.016]} castShadow>
            <cylinderGeometry args={[0.04, 0.043, 0.032, 56]} />
            <meshStandardMaterial color="#c5cbd2" metalness={0.85} roughness={0.28} />
          </mesh>
          <mesh position={[0, 0, 0.0325]}>
            <circleGeometry args={[0.034, 48]} />
            <meshStandardMaterial color="#e6e9ed" metalness={0.7} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.024, 0.034]}>
            <boxGeometry args={[0.006, 0.018, 0.002]} />
            <meshStandardMaterial color="#2f6fdb" />
          </mesh>
        </RigPart>
        <RigPart id="settings_knob" position={[-0.17, -0.005, 0.002]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.013]} castShadow>
            <cylinderGeometry args={[0.026, 0.028, 0.026, 40]} />
            <meshStandardMaterial color="#c5cbd2" metalness={0.85} roughness={0.28} />
          </mesh>
          <mesh position={[0, 0.016, 0.0265]}>
            <boxGeometry args={[0.005, 0.012, 0.002]} />
            <meshStandardMaterial color="#2f6fdb" />
          </mesh>
        </RigPart>
        {[
          { id: "faucet_button", x: -0.28, color: "#dbe8f8" },
          { id: "power_button", x: 0.16, color: "#ffffff" },
          { id: "start_pause_button", x: 0.255, color: "#e8f0ff" },
        ].map((button) => (
          <RigPart key={button.id} id={button.id} position={[button.x, -0.005, 0.002]}>
            <RoundedBox args={[button.id === "start_pause_button" ? 0.06 : 0.045, 0.022, 0.01]} radius={0.004} position={[0, 0, 0.005]}>
              <meshStandardMaterial color={button.color} roughness={0.35} />
            </RoundedBox>
            {button.id === "faucet_button" && (
              <mesh position={[0, 0, 0.0105]}>
                <circleGeometry args={[0.005, 16]} />
                <meshStandardMaterial color="#2f6fdb" />
              </mesh>
            )}
          </RigPart>
        ))}
      </group>
    </group>
  );
}

function Lid() {
  return (
    <RigPart id="lid" position={[0, deckTop + 0.003, lidHingeZ]}>
      <RoundedBox args={[0.62, 0.028, lidDepth]} radius={0.01} position={[0, 0.014, lidDepth / 2]} castShadow>
        <meshStandardMaterial {...enamel} />
      </RoundedBox>
      {/* recessed top panel and the finger lip at the front */}
      <RoundedBox args={[0.56, 0.004, lidDepth - 0.08]} radius={0.002} position={[0, 0.029, lidDepth / 2 - 0.01]}>
        <meshStandardMaterial color="#f1f2f4" roughness={0.22} />
      </RoundedBox>
      <mesh position={[0, 0.006, lidDepth + 0.002]}>
        <boxGeometry args={[0.2, 0.01, 0.006]} />
        <meshStandardMaterial color="#c3c8ce" roughness={0.4} />
      </mesh>
      {/* striker that drops into the lid lock */}
      <mesh position={[0, -0.006, lidDepth - 0.025]}>
        <boxGeometry args={[0.02, 0.014, 0.01]} />
        <meshStandardMaterial color="#8d939a" roughness={0.5} />
      </mesh>
      {/* two hinge barrels */}
      {[-0.22, 0.22].map((x) => (
        <mesh key={x} position={[x, 0.004, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.009, 0.009, 0.05, 16]} />
          <meshStandardMaterial color="#c9ced4" metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
    </RigPart>
  );
}

function UnderTheLid() {
  const crust = useMemo(() => grimeTexture([218, 214, 198]), []);
  const gunk = useMemo(() => grimeTexture([92, 78, 54]), []);
  const tag = useMemo(() => tagTexture(), []);
  return (
    <group>
      <RigPart id="lid_lock" position={[0, deckTop, 0.297]}>
        <RoundedBox args={[0.075, 0.014, 0.034]} radius={0.004} position={[0, 0.007, 0]}>
          <meshStandardMaterial color="#8d939a" roughness={0.5} />
        </RoundedBox>
        <mesh position={[0, 0.0145, -0.004]}>
          <boxGeometry args={[0.024, 0.002, 0.012]} />
          <meshStandardMaterial color="#1c1e22" roughness={0.6} />
        </mesh>
        <RigPart id="lid_lock_crust" position={[0, 0.0152, 0.004]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.1, 0.05]} />
            <meshStandardMaterial map={crust} transparent alphaTest={0.05} roughness={1} />
          </mesh>
        </RigPart>
      </RigPart>
      {[
        { id: "bleach_dispenser_cup", x: -0.25, rim: "#7fa6d6" },
        { id: "softener_dispenser", x: 0.25, rim: "#a9d0ef" },
      ].map((cup) => (
        <RigPart key={cup.id} id={cup.id} position={[cup.x, deckTop, 0.24]}>
          <mesh position={[0, 0.003, 0]}>
            <cylinderGeometry args={[0.038, 0.04, 0.006, 40]} />
            <meshStandardMaterial color={cup.rim} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.0062, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.026, 32]} />
            <meshStandardMaterial color="#2b3038" roughness={0.7} />
          </mesh>
          {cup.id === "bleach_dispenser_cup" && (
            <RigPart id="dispenser_gunk" position={[0, 0.0068, 0]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.022, 0.048, 40]} />
                <meshStandardMaterial map={gunk} transparent alphaTest={0.05} roughness={1} />
              </mesh>
            </RigPart>
          )}
        </RigPart>
      ))}
      <RigPart id="model_and_serial_tag" position={[-0.27, deckTop + 0.0035, -0.17]}>
        <mesh rotation={[-Math.PI / 2, 0, 0.26]}>
          <planeGeometry args={[0.08, 0.03]} />
          <meshStandardMaterial map={tag} roughness={0.6} />
        </mesh>
      </RigPart>
      {/* built-in faucet: a short chrome spout at the back of the opening */}
      <RigPart id="built_in_water_faucet" position={[0, deckTop - 0.02, openingZ - openingRadius + 0.012]}>
        <mesh rotation={[0.9, 0, 0]}>
          <cylinderGeometry args={[0.011, 0.014, 0.04, 20]} />
          <meshStandardMaterial {...chrome} />
        </mesh>
        <mesh position={[0, -0.012, 0.016]}>
          <sphereGeometry args={[0.009, 16, 12]} />
          <meshStandardMaterial {...chrome} />
        </mesh>
      </RigPart>
    </group>
  );
}

/** Clothes heaped round the agitator, plus a blanket bunched on one side (the cause of off-balance thumping). */
const basketClothes = [0, 1, 2, 3, 4, 5, 6, 7].map((index) => {
  const angle = (index / 8) * Math.PI * 2 + 0.3;
  const colors = ["#3f5f8f", "#f1efe9", "#c0504d", "#7d8a74", "#e3c565", "#2f4a72", "#d9d4ea", "#3a3d42"];
  return {
    position: [Math.cos(angle) * 0.16, (index % 3) * 0.03, Math.sin(angle) * 0.16] as [number, number, number],
    scale: [0.11, 0.06, 0.085] as [number, number, number],
    color: colors[index],
    tilt: (index % 2 ? 0.3 : -0.3) + index * 0.05,
  };
});
const bunchedBlanket = [
  { position: [0, 0, 0] as [number, number, number], scale: [0.09, 0.11, 0.13] as [number, number, number], color: "#8c6bb1", tilt: 0.2 },
  { position: [0.03, 0.07, 0.05] as [number, number, number], scale: [0.07, 0.07, 0.09] as [number, number, number], color: "#8c6bb1", tilt: -0.4 },
];

function Basket() {
  const perforated = useMemo(() => perforatedTexture(), []);
  const basketHeight = basketTop - basketBottom;
  return (
    <group position={[0, 0, openingZ]}>
      <RigPart id="wash_basket">
        <mesh position={[0, basketBottom + basketHeight / 2, 0]}>
          <cylinderGeometry args={[basketRadius, basketRadius, basketHeight, 72, 1, true]} />
          <meshStandardMaterial map={perforated} side={THREE.BackSide} metalness={0.6} roughness={0.32} />
        </mesh>
        <mesh position={[0, basketBottom, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[basketRadius, 72]} />
          <meshStandardMaterial color="#b9bfc6" metalness={0.6} roughness={0.35} />
        </mesh>
        {/* balance ring round the top */}
        <mesh position={[0, basketTop, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[basketRadius - 0.006, 0.014, 12, 72]} />
          <meshStandardMaterial color="#d9dce0" roughness={0.45} />
        </mesh>
      </RigPart>
      <RigPart id="impeller_plate" position={[0, basketBottom + 0.01, 0]}>
        <mesh>
          <cylinderGeometry args={[0.21, 0.22, 0.02, 64]} />
          <meshStandardMaterial color="#cfd3d8" roughness={0.4} />
        </mesh>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <mesh key={index} position={[0, 0.016, 0]} rotation={[0, (index / 6) * Math.PI * 2, 0]}>
            <boxGeometry args={[0.4, 0.014, 0.018]} />
            <meshStandardMaterial color="#bfc4ca" roughness={0.4} />
          </mesh>
        ))}
      </RigPart>
      <RigPart id="removable_agitator" position={[0, basketBottom + 0.02, 0]}>
        <mesh position={[0, 0.08, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.09, 0.16, 48]} />
          <meshStandardMaterial color="#e9ebee" roughness={0.35} />
        </mesh>
        {[0, 1, 2, 3].map((index) => (
          <mesh key={index} position={[0, 0.06, 0]} rotation={[0, (index / 4) * Math.PI * 2, 0]}>
            <boxGeometry args={[0.24, 0.1, 0.014]} />
            <meshStandardMaterial color="#e3e6ea" roughness={0.35} />
          </mesh>
        ))}
        <mesh position={[0, 0.31, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.05, 0.3, 40]} />
          <meshStandardMaterial color="#eef0f2" roughness={0.35} />
        </mesh>
        {[0, 1, 2, 3, 4].map((index) => (
          <mesh key={index} position={[0, 0.2 + index * 0.05, 0]} rotation={[Math.PI / 2, 0, index * 0.6]}>
            <torusGeometry args={[0.048, 0.006, 8, 24, Math.PI * 1.1]} />
            <meshStandardMaterial color="#d7dbe0" roughness={0.35} />
          </mesh>
        ))}
        <mesh position={[0, 0.47, 0]}>
          <sphereGeometry args={[0.042, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#2f6fdb" roughness={0.3} />
        </mesh>
      </RigPart>
      <RigPart id="laundry" position={[0, basketBottom + 0.17, 0]}>
        <ClothesHeap blobs={basketClothes} />
      </RigPart>
      <RigPart id="laundry_extra" position={[-0.13, basketBottom + 0.27, 0.06]}>
        <ClothesHeap blobs={bunchedBlanket} />
      </RigPart>
    </group>
  );
}

function BehindTheWasher() {
  const ribbed = useMemo(() => ribbedTexture(), []);
  const screen = useMemo(() => screenMeshTexture(), []);
  const grit = useMemo(() => grimeTexture([120, 92, 58]), []);
  const hoses = useMemo(
    () =>
      inlets.map(
        (inlet) =>
          [
            [inlet.x, inletY, -0.47],
            [inlet.x, inletY, -0.52],
            [inlet.x + 0.01, 1.07, -0.575],
            [inlet.x, tapY - 0.07, wallZ + 0.055],
            [inlet.x, tapY - 0.05, wallZ + 0.055],
          ] as [number, number, number][],
      ),
    [],
  );
  const drainStatic = useMemo<[number, number, number][]>(() => [[-0.23, 0.15, -front], [-0.23, 0.15, -0.45], [-0.23, 0.3, -0.5], [-0.23, 0.86, -0.5]], []);
  const drainHook = useMemo<[number, number, number][]>(() => [[-0.23, 0.68, -0.5], [-0.23, 0.95, -0.5], [-0.23, 1.02, -0.515], [-0.23, 1.025, -0.56], [-0.23, 0.97, -0.58], [-0.23, 0.81, -0.58]], []);
  const coupling = (
    <>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.0125]}>
        <cylinderGeometry args={[0.018, 0.018, 0.025, 8]} />
        <meshStandardMaterial color="#c9a45c" metalness={0.85} roughness={0.3} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.07]}>
        <cylinderGeometry args={[0.011, 0.011, 0.09, 16]} />
        <meshStandardMaterial color="#1d1f22" roughness={0.6} />
      </mesh>
    </>
  );
  return (
    <group>
      <BackWall z={wallZ} />
      {inlets.map((inlet) => (
        <WallTap key={inlet.tap} id={inlet.tap} x={inlet.x} y={tapY} z={wallZ} handleColor={inlet.band} />
      ))}
      {/* inlet ports on the back of the console, each with its little screen */}
      {inlets.map((inlet) => (
        <group key={inlet.x} position={[inlet.x, inletY, -front]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.008]}>
            <cylinderGeometry args={[0.013, 0.013, 0.016, 20]} />
            <meshStandardMaterial color="#d9dcdf" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0, -0.012]}>
            <torusGeometry args={[0.009, 0.0018, 8, 20]} />
            <meshStandardMaterial color="#d9dcdf" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0, 0.002]}>
            <boxGeometry args={[0.04, 0.03, 0.004]} />
            <meshStandardMaterial color={inlet.band} roughness={0.5} />
          </mesh>
        </group>
      ))}
      <RigPart id="inlet_valve_screens" position={[inlets[0].x, inletY, -front - 0.0165]}>
        <mesh>
          <circleGeometry args={[0.0105, 24]} />
          <meshStandardMaterial map={screen} color="#9aa1a9" roughness={0.5} side={THREE.DoubleSide} />
        </mesh>
        <RigPart id="inlet_screen_debris" position={[0, 0, -0.001]}>
          <mesh rotation={[0, Math.PI, 0]}>
            <circleGeometry args={[0.0105, 24]} />
            <meshStandardMaterial map={grit} color="#a07a4a" transparent alphaTest={0.05} roughness={1} />
          </mesh>
        </RigPart>
      </RigPart>
      {/* the hot hose's coupling unscrews and backs off; the cold one stays put */}
      <RigPart id="inlet_hose_coupling" position={[inlets[0].x, inletY, -front - 0.018]}>
        {coupling}
      </RigPart>
      <group position={[inlets[1].x, inletY, -front - 0.018]}>{coupling}</group>
      <RigPart id="water_inlet_hoses">
        {hoses.map((points, index) => (
          <group key={index}>
            <Tube points={points} radius={0.011} />
            <mesh position={[points[1][0], points[1][1], points[1][2] + 0.03]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.0125, 0.0125, 0.02, 16]} />
              <meshStandardMaterial color={inlets[index].band} roughness={0.5} />
            </mesh>
          </group>
        ))}
      </RigPart>
      {/* drain standpipe and the grey drain hose hooked into it */}
      <mesh position={[-0.23, 0.46, -0.58]}>
        <cylinderGeometry args={[0.025, 0.025, 0.92, 32, 1, true]} />
        <meshStandardMaterial color="#f0f0ec" roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <Tube points={drainStatic} radius={0.016} map={ribbed} color="#c4c8cd" roughness={0.5} />
      <RigPart id="drain_hose">
        <Tube points={drainHook} radius={0.016} map={ribbed} color="#c4c8cd" roughness={0.5} />
        {/* the plastic U-form that holds the hook shape */}
        <mesh position={[-0.23, 1.0, -0.54]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.035, 0.006, 8, 20, Math.PI]} />
          <meshStandardMaterial color="#e8e8e2" roughness={0.5} />
        </mesh>
      </RigPart>
      <OutletAndPlug x={0.34} y={0.5} z={wallZ} cordTo={[0.3, 0.8, -front - 0.005]} />
    </group>
  );
}

export function WasherTopModel() {
  return (
    <group>
      <directionalLight position={[-1.2, 1.6, -2.4]} intensity={0.7} />
      <Cabinet />
      <Console />
      <Basket />
      <UnderTheLid />
      <Lid />
      <BehindTheWasher />
      <LevelingFeet halfX={width / 2 - 0.055} halfZ={front - 0.06} bottom={cabinetBottom} />
    </group>
  );
}

const sampleSteps: { instruction: string; beats: Beat[] }[] = [
  {
    instruction: "Get the washer to start",
    beats: [
      { part: "lid", action: "open", caption: "Lift the lid" },
      { part: "laundry", action: "look", caption: "Keep clothes off the edge" },
      { part: "lid", action: "close", caption: "Close it until it clicks" },
      { part: "start_pause_button", action: "press", caption: "Hold Start 3 seconds" },
      { part: "power_cord", action: "remove", caption: "Unplug, wait five minutes" },
      { part: "power_cord", action: "insert", caption: "Plug it back in firmly" },
      { part: "power_button", action: "press", caption: "Press Power" },
      { part: "start_pause_button", action: "press", caption: "Hold Start again" },
    ],
  },
  {
    instruction: "Get the water to drain",
    beats: [
      { part: "drain_hose", action: "look", caption: "Check hose for kinks" },
      { part: "drain_hose", action: "remove", caption: "Lift the hose end out" },
      { part: "drain_hose", action: "insert", caption: "Push in only 4 inches" },
      { part: "lid", action: "open", caption: "Lift the lid" },
      { part: "laundry", action: "look", caption: "Spread clothes evenly around" },
      { part: "lid", action: "close", caption: "Close the lid" },
      { part: "cycle_knob", action: "turn", caption: "Turn to Drain and Spin" },
      { part: "start_pause_button", action: "press", caption: "Hold Start 3 seconds" },
    ],
  },
  {
    instruction: "Stop the shaking and banging",
    beats: [
      { part: "start_pause_button", action: "press", caption: "Pause, wait for tub" },
      { part: "lid", action: "open", caption: "Lift the lid" },
      { part: "laundry", action: "look", caption: "Spread clothes round the wall" },
      { part: "laundry_extra", action: "remove", caption: "Take a few items out" },
      { part: "lid", action: "close", caption: "Close the lid" },
      { part: "leveling_feet", action: "look", caption: "Rock opposite corners gently" },
      { part: "leveling_feet", action: "turn", caption: "Twist wobbly foot down" },
      { part: "foot_lock_nut", action: "turn", caption: "Snug the lock nut" },
      { part: "cycle_knob", action: "turn", caption: "Turn to Rinse and Spin" },
    ],
  },
  {
    instruction: "Fix slow or no filling",
    beats: [
      { part: "hot_water_tap", action: "open", caption: "Hot tap fully on" },
      { part: "cold_water_tap", action: "open", caption: "Cold tap fully on" },
      { part: "water_inlet_hoses", action: "look", caption: "Straighten any kinks" },
      { part: "hot_water_tap", action: "close", caption: "Now turn hot off" },
      { part: "cold_water_tap", action: "close", caption: "And turn cold off" },
      { part: "inlet_hose_coupling", action: "unlock", caption: "Unscrew the hose by hand" },
      { part: "inlet_screen_debris", action: "clean", caption: "Brush the screen, leave it in" },
      { part: "inlet_hose_coupling", action: "lock", caption: "Screw it back on snug" },
      { part: "hot_water_tap", action: "open", caption: "Hot tap back on" },
      { part: "cold_water_tap", action: "open", caption: "Cold on, check for drips" },
    ],
  },
  {
    instruction: "Clear a lid that won't lock",
    beats: [
      { part: "start_pause_button", action: "press", caption: "Pause, wait for tub" },
      { part: "lid", action: "open", caption: "Lift the lid" },
      { part: "laundry", action: "look", caption: "Push clothes off the edges" },
      { part: "lid_lock_crust", action: "clean", caption: "Wipe crust off lid lock" },
      { part: "lid", action: "close", caption: "Close it until it clicks" },
      { part: "power_cord", action: "remove", caption: "Unplug for five minutes" },
      { part: "power_cord", action: "insert", caption: "Plug it back in" },
      { part: "start_pause_button", action: "press", caption: "Hold Start, hear the click" },
    ],
  },
  {
    instruction: "Clean out a smelly washer",
    beats: [
      { part: "lid", action: "open", caption: "Lift the lid" },
      { part: "laundry", action: "clean", caption: "Take all clothes out" },
      { part: "wash_basket", action: "look", caption: "Drop a tablet in bottom" },
      { part: "dispenser_gunk", action: "clean", caption: "Wipe gunk off bleach cup" },
      { part: "lid", action: "close", caption: "Close the lid" },
      { part: "cycle_knob", action: "turn", caption: "Turn to Clean Washer" },
      { part: "start_pause_button", action: "press", caption: "Hold Start 3 seconds" },
      { part: "lid", action: "open", caption: "Leave lid open to dry" },
    ],
  },
];

export const rig: RigModule = { catalog, Model: WasherTopModel, sampleSteps };
