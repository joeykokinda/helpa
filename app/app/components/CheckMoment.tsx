"use client";

import { motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import Helpa, { type HelpaMood } from "./Helpa";
import Icon from "./Icons";
import SpeechBubble from "./SpeechBubble";

export type CheckPhase = "checking" | "done" | "retry" | "error";
export type CheckState = { phase: CheckPhase; photoUrl: string; feedback: string; model?: string };

const moodFor: Record<CheckPhase, HelpaMood> = { checking: "searching", done: "celebrate", retry: "worried", error: "worried" };
const titleFor: Record<CheckPhase, string> = { checking: "Checking your work", done: "Looks done!", retry: "Almost there", error: "I couldn't check that" };

type CheckMomentProps = {
  check: CheckState;
  speaking: boolean;
  /** What "done" should look like: the step's check text. */
  doneLooksLike: string;
  /** The step's own guide (3D or highlighted photo), shown next to the user's photo when it's not done yet. */
  guide: ReactNode;
  onBack: () => void;
};

function AnimatedCheck() {
  return (
    <motion.svg className="check-badge" viewBox="0 0 52 52" aria-hidden="true" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 320, damping: 14, delay: 0.15 }}>
      <circle cx="26" cy="26" r="24" />
      <motion.path d="M15 27l7.5 7.5L37.5 18" fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, delay: 0.35, ease: "easeOut" }} />
    </motion.svg>
  );
}

/** "Check my work" as a moment with Helpa: looking at the photo, then cheering or gently saying what to change. */
export default function CheckMoment({ check, speaking, doneLooksLike, guide, onBack }: CheckMomentProps) {
  const { phase, photoUrl, feedback, model } = check;
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [phase]);

  const bubble = phase === "checking" ? "Let me look…" : feedback;
  const yourPhoto = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photoUrl} alt="The photo you just took" />
  );

  return (
    <div className={`check-moment check-${phase}`}>
      {model === "muse-spark-open" && phase !== "checking" && <p className="checked-by">Checked by Muse Spark Open, Meta&apos;s open-weight model</p>}
      <h2 ref={titleRef} tabIndex={-1} className={`check-title check-title-${phase}`}>
        {titleFor[phase]}
      </h2>

      <div className="check-stage">
        <SpeechBubble key={bubble} text={bubble} className="speech-bubble-center" typingSpeed={22} typed={phase === "checking" || phase === "done"} />
        <Helpa mood={moodFor[phase]} speaking={speaking} lookAt={{ x: 0, y: 1 }} size={phase === "checking" || phase === "done" ? 132 : 104} />
      </div>

      {phase === "retry" ? (
        <>
          <div className="compare">
            <figure className="compare-tile">
              {yourPhoto}
              <figcaption className="tile-label">Yours</figcaption>
            </figure>
            <figure className={`compare-tile ${guide ? "" : "compare-tile-text"}`}>
              {guide ?? (
                <p>
                  <Icon name="check" size={20} strokeWidth={3} />
                  {doneLooksLike}
                </p>
              )}
              <figcaption className="tile-label tile-label-ok">Done looks like</figcaption>
            </figure>
          </div>
          {guide && doneLooksLike && (
            <p className="done-looks">
              <span className="done-looks-icon" aria-hidden="true">
                <Icon name="check" size={16} strokeWidth={3} />
              </span>
              <span>
                <strong>Done looks like</strong>
                {doneLooksLike}
              </span>
            </p>
          )}
          <button className="text-button press check-back" onClick={onBack}>
            Show me the step again
          </button>
        </>
      ) : (
        <motion.figure className={`check-photo ${phase === "done" ? "check-photo-done" : ""}`} layout>
          {yourPhoto}
          {phase === "checking" && <div className="scan-sweep" aria-hidden="true" />}
          {phase === "done" && <AnimatedCheck />}
        </motion.figure>
      )}
    </div>
  );
}
