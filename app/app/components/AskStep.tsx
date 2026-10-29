"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { askHelpa } from "../lib/api";
import Icon from "./Icons";

type Line = { role: "you" | "helpa"; text: string };

const starters = ["Which way does it go?", "What if it's stuck?", "Do I need a tool for this?"];

type AskStepProps = {
  open: boolean;
  /** What Helpa knows right now: the machine, what's wrong, and the step they're on. */
  context: Record<string, unknown>;
  /** A question heard hands-free, asked as soon as it arrives. */
  spoken?: { text: string; at: number };
  onClose: () => void;
  /** The answer, so the page can read it out. */
  onAnswer: (answer: string) => void;
};

/** Ask Helpa in the middle of a step: type or say a question, answered about this machine and this exact step. */
export default function AskStep({ open, context, spoken, onClose, onAnswer }: AskStepProps) {
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const asked = useRef(0);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setDraft("");
    setBusy(true);
    const history = lines.slice(-8);
    setLines((current) => [...current, { role: "you", text }]);
    try {
      const reply = await askHelpa(context, history, text);
      setLines((current) => [...current, { role: "helpa", text: reply.answer }]);
      onAnswer(reply.answer);
    } catch {
      setLines((current) => [...current, { role: "helpa", text: "I couldn't answer that just now. Try again in a moment?" }]);
    } finally {
      setBusy(false);
    }
  };

  // A question said out loud arrives here once.
  useEffect(() => {
    if (!spoken || spoken.at === asked.current) return;
    asked.current = spoken.at;
    queueMicrotask(() => void ask(spoken.text));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spoken]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [lines, busy]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="ask-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div className="ask-sheet" role="dialog" aria-label="Ask Helpa about this step" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 36 }}>
            <div className="ask-head">
              <strong>Ask Helpa</strong>
              <button className="icon-button press" onClick={onClose} aria-label="Close">
                <Icon name="close" size={20} />
              </button>
            </div>
            <div className="ask-lines" ref={listRef}>
              {lines.length === 0 && <p className="ask-empty">Stuck on this step? Ask me anything about it.</p>}
              {lines.map((line, index) => (
                <p key={index} className={`ask-line ask-${line.role}`}>
                  {line.text}
                </p>
              ))}
              {busy && <p className="ask-line ask-helpa ask-typing">Thinking…</p>}
            </div>
            {lines.length === 0 && (
              <div className="ask-starters">
                {starters.map((starter) => (
                  <button key={starter} className="chip press" onClick={() => ask(starter)}>
                    {starter}
                  </button>
                ))}
              </div>
            )}
            <form
              className="ask-form"
              onSubmit={(submitEvent) => {
                submitEvent.preventDefault();
                void ask(draft);
              }}
            >
              <input value={draft} onChange={(changeEvent) => setDraft(changeEvent.target.value)} placeholder="Type your question" aria-label="Your question" maxLength={300} enterKeyHint="send" />
              <button className="ask-send press" type="submit" disabled={!draft.trim() || busy} aria-label="Ask">
                <Icon name="send" size={20} />
              </button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
