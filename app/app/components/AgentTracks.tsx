"use client";

import { motion } from "motion/react";
import Icon, { type IconName } from "./Icons";

/** A progress row from the agent stream; rows with a state are parallel tracks. */
export type ProgressRow = { key: string; title: string; detail: string; state?: "active" | "done" };

type LaneState = "waiting" | "active" | "done";
type Lane = { id: string; icon: IconName; title: string; detail: string; state: LaneState };

const researchKeys = ["search", "read", "find"];

/** Folds the agent's event rows into fixed lanes, so the parallel work reads as a few things ticking off. */
export function lanesFrom(rows: ProgressRow[], hasPhoto: boolean): Lane[] {
  const byKey = (key: string) => rows.find((row) => row.key === key);
  const identify = byKey("identify");
  const library = byKey("library");
  const research = byKey("track-research");
  const model = byKey("track-model");
  const measure = byKey("track-measure");
  const lastLookup = rows.filter((row) => researchKeys.includes(row.key)).at(-1);
  const identified = Boolean(identify?.detail || library);
  const researched = research?.state === "done" || Boolean(library);

  const lanes: Lane[] = [
    {
      id: "identify",
      icon: "scan",
      title: identified ? "Figured out what it is" : "Figuring out what it is",
      detail: identify?.detail ?? "",
      state: identified ? "done" : "active",
    },
    {
      id: "research",
      icon: "book",
      title: library ? "Found a ready fix" : researched ? "Read the manual" : lastLookup?.title ?? "Finding the fix",
      detail: library?.detail || research?.detail || lastLookup?.detail || "",
      state: researched ? "done" : research || lastLookup ? "active" : "waiting",
    },
    {
      id: "model",
      icon: "cube",
      title: model?.title ?? "Building your 3D model",
      detail: model?.detail ?? "",
      state: model?.state ?? "waiting",
    },
  ];
  if (hasPhoto)
    lanes.push({ id: "parts", icon: "image", title: measure?.title ?? "Spotting parts on your photo", detail: "", state: measure?.state ?? "waiting" });
  lanes.push({ id: "plan", icon: "check", title: "Writing your steps", detail: "", state: researched ? "active" : "waiting" });
  return lanes;
}

export default function AgentTracks({ rows, hasPhoto, paused }: { rows: ProgressRow[]; hasPhoto: boolean; paused: boolean }) {
  const lanes = lanesFrom(rows, hasPhoto);
  return (
    <ol className="lanes" aria-live="polite">
      {lanes.map((lane) => {
        const state = paused && lane.state === "active" ? "waiting" : lane.state;
        return (
          <motion.li key={lane.id} layout className={`lane lane-${state}`} transition={{ type: "spring", stiffness: 300, damping: 26 }}>
            <span className="lane-icon" aria-hidden="true">
              {state === "done" ? (
                <motion.span key="done" initial={{ scale: 0.3 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 16 }}>
                  <Icon name="check" size={15} strokeWidth={3.2} />
                </motion.span>
              ) : (
                <Icon name={lane.icon} size={16} />
              )}
              {state === "active" && <span className="lane-ring" />}
            </span>
            <span className="lane-text">
              {lane.title}
              {lane.detail && <small>{lane.detail}</small>}
            </span>
            <span className="visually-hidden">{state === "done" ? "done" : state === "active" ? "working" : "waiting"}</span>
          </motion.li>
        );
      })}
    </ol>
  );
}
