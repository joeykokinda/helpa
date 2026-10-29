"use client";

import { motion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { PlanStep } from "../lib/api";
import type { Recipe } from "../lib/rig/recipe";
import { pulseActions, type Beat } from "../lib/rig/types";
import { tidy } from "../lib/text";
import Icon from "./Icons";
import { loadGeneratedRig, rigLoaders, type RigModule } from "./rig/registry";
import type { StillMoment } from "./rig/RigScene";

const RigScene = dynamic(() => import("./rig/RigScene"), { ssr: false });

type StoryboardProps = {
  rig: { id: string; stepBeats: Beat[][]; recipe?: unknown };
  steps: PlanStep[];
  onOpen: (index: number) => void;
};

// Pictures already drawn for a plan, so coming back to it doesn't draw them again.
const drawn = new Map<string, (string | null)[]>();

/** The moment that tells a step best: its first real move, near the end of the move, with the guide still showing. */
function momentFor(beats: Beat[]): StillMoment {
  const moving = beats.findIndex((beat) => !pulseActions.includes(beat.action));
  // Cleaning carries the gunk away, so it's caught just as it lifts off, while you can still see it on the part.
  if (moving >= 0) return { beat: moving, progress: beats[moving].action === "clean" ? 0.2 : 0.82 };
  const acting = beats.findIndex((beat) => beat.action !== "look");
  return { beat: Math.max(0, acting), progress: 0.55 };
}

/**
 * The plan as pictures: every step drawn from the 3D model of their machine at the moment that shows it, the part
 * in orange and the move on it, like a page of assembly instructions. One hidden scene draws them one at a time.
 */
export default function Storyboard({ rig, steps, onOpen }: StoryboardProps) {
  const key = useMemo(() => `${rig.id}:${JSON.stringify(rig.stepBeats)}`, [rig]);
  const [module, setModule] = useState<RigModule | null>(null);
  const [shots, setShots] = useState<(string | null)[]>(() => drawn.get(key) ?? []);

  useEffect(() => {
    let alive = true;
    const load = rig.id === "generated" && rig.recipe ? () => loadGeneratedRig(rig.recipe as Recipe) : rigLoaders[rig.id];
    load?.().then((loaded) => alive && setModule(loaded));
    return () => {
      alive = false;
    };
  }, [rig]);

  // The next step that has a move to show and no picture yet.
  const drawing = steps.findIndex((_, index) => shots[index] === undefined && (rig.stepBeats[index]?.length ?? 0) > 0);
  const labelOf = (index: number) => {
    const beats = rig.stepBeats[index] ?? [];
    const beat = beats[momentFor(beats).beat];
    return beat ? (module?.catalog.parts.find((part) => part.id === beat.part)?.label ?? "") : "";
  };

  return (
    <>
      <ol className="storyboard">
        {steps.map((step, index) => {
          const shot = shots[index];
          const hasMove = (rig.stepBeats[index]?.length ?? 0) > 0;
          const label = labelOf(index);
          return (
            <motion.li key={index} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * index }}>
              <button className="story-card press" onClick={() => onOpen(index)} aria-label={`Step ${index + 1}: ${tidy(step.instruction)}`}>
                <span className="story-picture">
                  {shot ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={shot} alt="" />
                  ) : hasMove ? (
                    <span className="story-pending skeleton" aria-hidden="true" />
                  ) : (
                    <span className="story-none" aria-hidden="true">
                      <Icon name="hand" size={30} />
                    </span>
                  )}
                  <span className="story-number">{index + 1}</span>
                  {label && shot && <span className="story-label">{label}</span>}
                </span>
                <span className="story-text">{tidy(step.instruction)}</span>
              </button>
            </motion.li>
          );
        })}
      </ol>
      {module && drawing >= 0 && (
        <div className="storyboard-stage" aria-hidden="true">
          <RigScene
            key={drawing}
            catalog={module.catalog}
            Model={module.Model}
            stepBeats={rig.stepBeats}
            stepIndex={drawing}
            still={momentFor(rig.stepBeats[drawing])}
            onStill={(image) =>
              setShots((current) => {
                const next = [...current];
                next[drawing] = image;
                drawn.set(key, next);
                return next;
              })
            }
          />
        </div>
      )}
    </>
  );
}
