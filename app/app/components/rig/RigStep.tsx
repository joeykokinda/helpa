"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { Beat } from "../../lib/rig/types";
import { rigLoaders, type RigModule } from "./registry";

const RigScene = dynamic(() => import("./RigScene"), { ssr: false });

/** Loads a built-in appliance model on demand and plays the current step's beats on it. */
export default function RigStep({ rigId, stepBeats, stepIndex }: { rigId: string; stepBeats: Beat[][]; stepIndex: number }) {
  const [rig, setRig] = useState<RigModule | null>(null);
  useEffect(() => {
    let current = true;
    rigLoaders[rigId]?.().then((loaded) => current && setRig(loaded));
    return () => {
      current = false;
    };
  }, [rigId]);
  if (!rig) return <div className="scene-3d rig-scene scene-loading">Loading your appliance…</div>;
  return <RigScene catalog={rig.catalog} Model={rig.Model} stepBeats={stepBeats} stepIndex={stepIndex} />;
}
