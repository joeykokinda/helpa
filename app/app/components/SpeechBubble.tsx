"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

type SpeechBubbleProps = {
  text: string;
  /** Milliseconds per character while typing. */
  typingSpeed?: number;
  className?: string;
};

function TypedText({ text, typingSpeed }: { text: string; typingSpeed: number }) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisibleCount((count) => {
        if (count >= text.length) clearInterval(timer);
        return Math.min(count + 1, text.length);
      });
    }, typingSpeed);
    return () => clearInterval(timer);
  }, [text, typingSpeed]);

  return (
    <>
      <span aria-hidden="true">{text.slice(0, visibleCount)}</span>
      <span aria-hidden="true" className="speech-bubble-ghost">
        {text.slice(visibleCount)}
      </span>
    </>
  );
}

export default function SpeechBubble({ text, typingSpeed = 28, className }: SpeechBubbleProps) {
  const reduced = useReducedMotion() ?? false;

  return (
    <motion.div
      key={text}
      className={`speech-bubble ${className ?? ""}`}
      style={{ originX: 0.2, originY: 1 }}
      initial={{ opacity: 0, scale: reduced ? 1 : 0.6, y: reduced ? 0 : 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 18 }}
    >
      <p aria-live="polite">
        <span className="visually-hidden">{text}</span>
        {reduced ? <span aria-hidden="true">{text}</span> : <TypedText text={text} typingSpeed={typingSpeed} />}
      </p>
    </motion.div>
  );
}
