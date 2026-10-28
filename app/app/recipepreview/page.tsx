"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { Recipe } from "../lib/rig/recipe";
import type { RigModule } from "../components/rig/registry";

const RigScene = dynamic(() => import("../components/rig/RigScene"), { ssr: false });

/**
 * Dev page: renders recipes/examples/<name>.json with one demo step per part, e.g. /recipepreview?recipe=garbage_disposal&step=2.
 * Step 0 is the overview with no beats. No API calls.
 */
export default function RecipePreview() {
  const [query] = useState(() => (typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search)));
  const [rig, setRig] = useState<RigModule | null>(null);
  const [error, setError] = useState("");
  const [stepIndex, setStepIndex] = useState(Number(query.get("step") ?? 0));
  const name = query.get("recipe") ?? "garbage_disposal";

  useEffect(() => {
    // Straight to RecipeModel rather than the registry, so built-in rigs being edited can't break this page.
    Promise.all([import(`../components/rig/recipes/examples/${name}.json`), import("../components/rig/RecipeModel")])
      .then(([json, model]) => model.recipeRig((json.default ?? json) as Recipe))
      .then(setRig)
      .catch((reason: unknown) => setError(String(reason)));
  }, [name]);

  if (error) return <main className="app">Could not load {name}: {error}</main>;
  if (!rig) return <main className="app">Loading…</main>;
  const steps = [{ instruction: "Overview", beats: [] }, ...rig.sampleSteps];
  return (
    <main className="app">
      <p className="eyebrow">Recipe preview · {rig.catalog.name}</p>
      <h2 className="step-instruction">
        {stepIndex}. {steps[stepIndex]?.instruction ?? "Overview"}
      </h2>
      <RigScene catalog={rig.catalog} Model={rig.Model} stepBeats={steps.map((step) => step.beats)} stepIndex={stepIndex} />
      <div className="step-actions" style={{ flexWrap: "wrap" }}>
        {steps.map((step, index) => (
          <button key={index} className="pill" aria-pressed={index === stepIndex} onClick={() => setStepIndex(index)} title={step.instruction}>
            {index}
          </button>
        ))}
      </div>
    </main>
  );
}
