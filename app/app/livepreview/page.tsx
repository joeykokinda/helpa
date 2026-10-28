"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { Plan } from "../lib/api";
import type { Beat, RigAction } from "../lib/rig/types";

const LiveGuide = dynamic(() => import("../components/LiveGuide"), { ssr: false });

/**
 * Dev page: the Live Guide on one step without running a fix, e.g.
 * /livepreview?rig=dryer_top_vent&beats=lint_screen:remove,lint:clean,lint_screen:insert&say=Clean+the+lint+screen
 */
export default function LivePreview() {
  const [query] = useState(() => (typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search)));
  const [done, setDone] = useState(0);
  const beats: Beat[] = (query.get("beats") ?? "")
    .split(",")
    .filter(Boolean)
    .map((pair) => {
      const [part, action] = pair.split(":");
      return { part, action: action as RigAction, caption: `${action} ${part.replace(/_/g, " ")}` };
    });
  const instruction = query.get("say") ?? "Do the step";
  const plan: Plan = {
    brand: "",
    model_number: "",
    appliance: "",
    manual_url: "",
    diagnosis: "",
    tools: [],
    replacement_parts: [],
    safety: [],
    library_id: "",
    library_problem: "",
    steps: [{ instruction, details: [], target_part: query.get("target") ?? "", photo: -1, motion: "none", show_3d: true, check: query.get("check") ?? instruction }],
  };
  const rigId = query.get("rig");
  return (
    <main className="app" data-done={done}>
      <LiveGuide
        plan={plan}
        stepIndex={0}
        rig={rigId ? { id: rigId, stepBeats: [beats] } : null}
        mood="pointing"
        speaking={false}
        say={(text) => console.log("[helpa]", text)}
        onDone={() => setDone((count) => count + 1)}
        onNext={() => setDone((count) => count + 1)}
        onClose={() => undefined}
      />
    </main>
  );
}
