"use client";

import type { RigCatalog } from "../../lib/rig/types";
import catalogJson from "./catalogs/washer_front_load.json";
import type { RigModule } from "./registry";

// Placeholder until this appliance is modelled; see Dryer.tsx for the reference implementation.
const catalog = catalogJson as RigCatalog;

function Model() {
  return (
    <mesh position={[0, 0.45, 0]}>
      <boxGeometry args={[0.6, 0.9, 0.6]} />
      <meshStandardMaterial color="#e9ebee" />
    </mesh>
  );
}

export const rig: RigModule = { catalog, Model, sampleSteps: [] };
