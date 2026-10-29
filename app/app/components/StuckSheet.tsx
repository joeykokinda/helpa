"use client";

import { AnimatePresence, motion } from "motion/react";
import Icon, { type IconName } from "./Icons";

export type StuckChoice = "live" | "ask" | "check" | "pro";

type StuckSheetProps = {
  open: boolean;
  /** What they're fixing, for "Show me on my dryer". */
  thing: string;
  /** False when there's no job to hand to a pro (it couldn't be saved). */
  canGetPro: boolean;
  onChoose: (choice: StuckChoice) => void;
  onClose: () => void;
};

/**
 * "I'm stuck": the 3D guide didn't do it, so Helpa offers the next level of help, starting with the strongest one,
 * the move shown on their own machine through the camera.
 */
export default function StuckSheet({ open, thing, canGetPro, onChoose, onClose }: StuckSheetProps) {
  const choices: { id: StuckChoice; icon: IconName; title: string; detail: string }[] = [
    { id: "live", icon: "live", title: `Show me on my ${thing}`, detail: "Point your camera at it. I'll find the part and show the move right on it." },
    { id: "ask", icon: "help", title: "Ask Helpa", detail: "Ask anything about this step, by typing or out loud." },
    { id: "check", icon: "camera", title: "Check what I did", detail: "Snap a photo and I'll tell you if it's right." },
  ];
  if (canGetPro) choices.push({ id: "pro", icon: "wrench", title: "Hand it to a pro", detail: "I'll find the best-reviewed ones near you and write the message." });
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="ask-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div className="ask-sheet stuck-sheet" role="dialog" aria-label="Help with this step" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 36 }}>
            <div className="ask-head">
              <strong>Stuck? Let&apos;s get you through it.</strong>
              <button className="icon-button press" onClick={onClose} aria-label="Close">
                <Icon name="close" size={20} />
              </button>
            </div>
            <ul className="stuck-list">
              {choices.map((choice, index) => (
                <li key={choice.id}>
                  <button className={`stuck-choice press ${index === 0 ? "stuck-choice-main" : ""}`} onClick={() => onChoose(choice.id)}>
                    <span className="stuck-icon" aria-hidden="true">
                      <Icon name={choice.icon} size={22} />
                    </span>
                    <span>
                      <strong>{choice.title}</strong>
                      <span>{choice.detail}</span>
                    </span>
                    <Icon name="next" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
