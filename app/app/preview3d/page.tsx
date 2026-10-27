"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { API_URL, type Scene } from "../lib/api";

const Scene3D = dynamic(() => import("../components/Scene3D"), { ssr: false });

type LibraryEntry = {
  id: string;
  model_family: string;
  scene: { parts: Scene["parts"] };
  problems: { id: string; plan: { steps: { instruction: string }[] }; step_animations: Scene["step_animations"] }[];
};

/** Dev page: plays a library appliance's 3D steps, e.g. /preview3d?id=whirlpool-dishwasher&problem=0&step=1 */
export default function Preview3D() {
  const [entry, setEntry] = useState<LibraryEntry | null>(null);
  const [query] = useState(() =>
    typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search),
  );
  const problemIndex = Number(query.get("problem") ?? 0);
  const [stepIndex, setStepIndex] = useState(Number(query.get("step") ?? 0));

  useEffect(() => {
    fetch(`${API_URL}/api/library/${query.get("id") ?? "whirlpool-dishwasher"}`)
      .then((response) => response.json())
      .then(setEntry);
  }, [query]);

  const problem = entry?.problems[problemIndex];
  if (!entry || !problem) return <main className="app">Loading…</main>;
  const steps = problem.plan.steps;
  return (
    <main className="app">
      <p className="eyebrow">
        {entry.model_family} · {problem.id}
      </p>
      <h2 className="step-instruction">
        {stepIndex + 1}. {steps[stepIndex]?.instruction}
      </h2>
      <Scene3D scene={{ parts: entry.scene.parts, step_animations: problem.step_animations }} stepIndex={stepIndex} />
      <div className="step-actions">
        {steps.map((step, index) => (
          <button key={index} className="pill" aria-pressed={index === stepIndex} onClick={() => setStepIndex(index)}>
            {index + 1}
          </button>
        ))}
      </div>
    </main>
  );
}
