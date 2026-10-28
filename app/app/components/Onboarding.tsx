"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import Icon, { type IconName } from "./Icons";
import Helpa, { type HelpaMood } from "./Helpa";

const slides: { mood: HelpaMood; title: string; body: string; tags?: { icon: IconName; label: string }[] }[] = [
  { mood: "celebrate", title: "Hi, I'm Helpa", body: "I help you fix things around your home. No experience needed." },
  {
    mood: "listening",
    title: "Show me or tell me",
    body: "Snap a photo of what's broken or its model sticker, or just tell me what's wrong.",
    tags: [
      { icon: "camera", label: "Photo" },
      { icon: "mic", label: "Talk" },
      { icon: "keyboard", label: "Type" },
    ],
  },
  { mood: "searching", title: "I do the homework", body: "I find your exact manual, spot the parts, and make a simple plan." },
  {
    mood: "pointing",
    title: "Fix it step by step",
    body: "I show you each move on a 3D model of your machine, read every step out loud, and check your work.",
    tags: [
      { icon: "cube", label: "3D guide" },
      { icon: "speaker", label: "Read aloud" },
      { icon: "check", label: "Checks your work" },
    ],
  },
];

const storageKey = "helpa-onboarded";

export function hasOnboarded() {
  try {
    return localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

/** First-run tutorial: four Helpa moods, swipe or tap through, remembered in localStorage. */
export default function Onboarding({ onFinish }: { onFinish: () => void }) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const slide = slides[index];
  const last = index === slides.length - 1;

  const finish = () => {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // private mode: the tutorial just shows again next time
    }
    onFinish();
  };

  const go = (next: number) => {
    if (next >= slides.length) return finish();
    if (next < 0) return;
    setDirection(next > index ? 1 : -1);
    setIndex(next);
  };

  return (
    <div className="screen onboarding" role="dialog" aria-modal="true" aria-label="Welcome to Helpa">
      <div className="topbar">
        <div className="segments" role="progressbar" aria-valuemin={1} aria-valuemax={slides.length} aria-valuenow={index + 1} aria-label={`Page ${index + 1} of ${slides.length}`}>
          {slides.map((_, dot) => (
            <span key={dot} className="segment">
              <motion.span className="segment-fill" initial={false} animate={{ scaleX: dot <= index ? 1 : 0 }} transition={{ duration: 0.35 }} />
            </span>
          ))}
        </div>
        <button className="text-button press" onClick={finish}>
          Skip
        </button>
      </div>

      <motion.div
        className="onboarding-body"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.25}
        onDragEnd={(_, info) => {
          if (info.offset.x < -60) go(index + 1);
          else if (info.offset.x > 60) go(index - 1);
        }}
      >
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={index}
            className="onboarding-slide"
            custom={direction}
            initial={{ opacity: 0, x: direction * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -40 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            <div className="hero-stage">
              <div className="hero-blob" aria-hidden="true" />
              <Helpa mood={slide.mood} size={200} />
            </div>
            <h1 className="display">{slide.title}</h1>
            <p className="lede">{slide.body}</p>
            {slide.tags && (
              <ul className="tag-row">
                {slide.tags.map((tag) => (
                  <li key={tag.label}>
                    <Icon name={tag.icon} size={17} />
                    {tag.label}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      <div className="bottom-bar">
        <button className="btn btn-primary press" onClick={() => go(index + 1)}>
          {last ? "Let's fix something" : "Continue"}
        </button>
      </div>
    </div>
  );
}
