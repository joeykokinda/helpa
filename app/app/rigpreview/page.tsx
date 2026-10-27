"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { rigLoaders, type RigModule } from "../components/rig/registry";

const RigScene = dynamic(() => import("../components/rig/RigScene"), { ssr: false });

/** Dev page: plays a rig's sample fix, e.g. /rigpreview?rig=dryer_top_vent&step=0. No API calls. */
export default function RigPreview() {
  const [query] = useState(() => (typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search)));
  const [rig, setRig] = useState<RigModule | null>(null);
  const [stepIndex, setStepIndex] = useState(Number(query.get("step") ?? 0));

  useEffect(() => {
    (rigLoaders[query.get("rig") ?? "dryer_top_vent"] ?? rigLoaders.dryer_top_vent)().then(setRig);
  }, [query]);

  if (!rig) return <main className="app">Loading…</main>;
  return (
    <main className="app">
      <p className="eyebrow">Rig preview · {rig.catalog.name}</p>
      <h2 className="step-instruction">
        {stepIndex + 1}. {rig.sampleSteps[stepIndex]?.instruction ?? "Overview"}
      </h2>
      <RigScene catalog={rig.catalog} Model={rig.Model} stepBeats={rig.sampleSteps.map((step) => step.beats)} stepIndex={stepIndex} />
      <div className="step-actions">
        {rig.sampleSteps.map((step, index) => (
          <button key={index} className="pill" aria-pressed={index === stepIndex} onClick={() => setStepIndex(index)}>
            {index + 1}
          </button>
        ))}
      </div>
    </main>
  );
}
