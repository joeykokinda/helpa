"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type RefObject } from "react";
import type { Recipe } from "../../lib/rig/recipe";
import type { Beat } from "../../lib/rig/types";
import type { PlayHead } from "./style/MotionGuide";
import { loadGeneratedRig, rigLoaders, type RigModule } from "./registry";

const RigScene = dynamic(() => import("./RigScene"), { ssr: false });

/** Loads a built-in appliance model on demand (or renders a generated recipe) and plays the current step's beats on it. */
type RigStepProps = { rigId: string; stepBeats: Beat[][]; stepIndex: number; recipe?: unknown; playHeadRef?: RefObject<PlayHead>; holo?: boolean };

export default function RigStep({ rigId, stepBeats, stepIndex, recipe, playHeadRef, holo }: RigStepProps) {
  const [rig, setRig] = useState<RigModule | null>(null);
  useEffect(() => {
    let current = true;
    const load = rigId === "generated" && recipe ? () => loadGeneratedRig(recipe as Recipe) : rigLoaders[rigId];
    load?.().then((loaded) => current && setRig(loaded));
    return () => {
      current = false;
    };
  }, [rigId, recipe]);
  if (!rig) return <div className="scene-3d rig-scene scene-loading">Loading your appliance…</div>;
  return <RigScene catalog={rig.catalog} Model={rig.Model} stepBeats={stepBeats} stepIndex={stepIndex} playHeadRef={playHeadRef} holo={holo} />;
}
