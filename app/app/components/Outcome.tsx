"use client";

import { motion } from "motion/react";
import type { Plan } from "../lib/api";
import { tidy } from "../lib/text";
import Helpa, { type HelpaMood } from "./Helpa";
import Icon from "./Icons";

type OutcomeProps = {
  plan: Plan;
  /** Causes already ruled out before this plan. */
  ruledOut: string[];
  mood: HelpaMood;
  speaking: boolean;
  onFixed: () => void;
  onStillBroken: () => void;
  onBack: () => void;
};

/** The outcome check: the plan ended with a test run, so ask whether it really worked before celebrating. */
export default function Outcome({ plan, ruledOut, mood, speaking, onFixed, onStillBroken, onBack }: OutcomeProps) {
  const test = plan.steps[plan.steps.length - 1];
  const checked = [...ruledOut, ...(plan.cause ? [plan.cause] : [])].map(tidy);
  return (
    <section className="screen outcome" aria-label="Did it work?">
      <div className="topbar">
        <button className="icon-button press" onClick={onBack} aria-label="Back to the last step">
          <Icon name="back" />
        </button>
        <span className="topbar-title">Test it</span>
      </div>
      <div className="screen-body done-body">
        <div className="hero-stage">
          <div className="hero-blob" aria-hidden="true" />
          <Helpa mood={mood} speaking={speaking} size={140} />
        </div>
        <motion.div className="done-headline" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <h1 className="display">Did that fix it?</h1>
          {test?.check && <p className="lede">Working means: {tidy(test.check).replace(/\.$/, "")}.</p>}
        </motion.div>
        {checked.length > 0 && (
          <motion.div className="card tip-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <span className="tip-icon" aria-hidden="true">
              <Icon name="check" size={20} strokeWidth={3} />
            </span>
            <div>
              <strong>What we&apos;ve checked</strong>
              <p>{checked.map((cause) => cause.charAt(0).toUpperCase() + cause.slice(1)).join(", then ")}.</p>
            </div>
          </motion.div>
        )}
      </div>
      <div className="bottom-bar bottom-bar-pair">
        <button className="btn btn-secondary press" onClick={onStillBroken}>
          Still broken
        </button>
        <button className="btn btn-primary press" onClick={onFixed}>
          <Icon name="check" size={20} strokeWidth={3} />
          Fixed it!
        </button>
      </div>
    </section>
  );
}
