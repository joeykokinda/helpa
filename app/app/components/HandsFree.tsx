"use client";

import { AnimatePresence, motion } from "motion/react";
import { useSyncExternalStore } from "react";
import { setPrefs, usePrefs } from "../lib/prefs";
import { voiceSupported } from "../lib/voice";
import Icon from "./Icons";

const noSubscription = () => () => {};

/** The hands-free switch: off, it offers voice; on, it shows Helpa is listening and what it last heard. */
export default function HandsFree({ state, heard, glass = false }: { state: "off" | "listening" | "denied"; heard?: string; glass?: boolean }) {
  const { handsFree } = usePrefs();
  const supported = useSyncExternalStore(noSubscription, voiceSupported, () => false);
  if (!supported) return null;
  const className = `hands-free press ${glass ? "hands-free-glass" : ""} ${handsFree && state === "listening" ? "hands-free-on" : ""}`;
  return (
    <div className="hands-free-row">
      <button className={className} onClick={() => setPrefs({ handsFree: !handsFree })} aria-pressed={handsFree}>
        {handsFree && state === "listening" ? <span className="hands-free-dot" aria-hidden="true" /> : <Icon name="mic" size={17} />}
        <span>{!handsFree ? "Hands-free" : state === "denied" ? "Mic is blocked" : "Listening · say \u201cnext\u201d"}</span>
      </button>
      <AnimatePresence>
        {heard && (
          <motion.span key={heard} className={`hands-free-heard ${glass ? "hands-free-glass" : ""}`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} role="status">
            “{heard}”
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
