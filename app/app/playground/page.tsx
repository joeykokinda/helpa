"use client";

import { useRef, useState, type PointerEvent } from "react";
import Helpa, { HELPA_MOODS, type HelpaMood } from "../components/Helpa";
import SpeechBubble from "../components/SpeechBubble";

const moodLines: Record<HelpaMood, string> = {
  idle: "Hi, I'm Helpa! What needs fixing today?",
  listening: "I'm listening. Tell me what's going on.",
  thinking: "Hmm, let me think about that for a second.",
  searching: "Looking for your manual now...",
  found: "Found it! Here's the manual for your dishwasher.",
  explaining: "First, turn the dial to off and unplug it.",
  pointing: "This round cap is the filter. Twist it to the left.",
  worried: "Careful! Switch off the power before you touch that.",
  celebrate: "You did it! Everything is fixed.",
};

type Point = { x: number; y: number };

export default function Playground() {
  const [mood, setMood] = useState<HelpaMood>("idle");
  const [speaking, setSpeaking] = useState(false);
  const [size, setSize] = useState(240);
  const [lookAt, setLookAt] = useState<Point | undefined>(undefined);
  const [targetDot, setTargetDot] = useState<Point | undefined>(undefined);
  const stageRef = useRef<HTMLDivElement>(null);
  const helpaRef = useRef<HTMLDivElement>(null);

  const aimAt = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" && event.buttons === 0) return;
    const stage = stageRef.current?.getBoundingClientRect();
    const helpa = helpaRef.current?.getBoundingClientRect();
    if (!stage || !helpa) return;
    const reach = Math.max(helpa.width, 120);
    setLookAt({
      x: (event.clientX - (helpa.left + helpa.width / 2)) / reach,
      y: (event.clientY - (helpa.top + helpa.height / 2)) / reach,
    });
    setTargetDot({ x: event.clientX - stage.left, y: event.clientY - stage.top });
  };

  const forgetAim = () => {
    setLookAt(undefined);
    setTargetDot(undefined);
  };

  return (
    <main className="page">
      <header className="page-header">
        <h1>Helpa</h1>
        <p>Mascot playground. Tap or drag on the stage to set where Helpa looks and points.</p>
      </header>

      <section
        ref={stageRef}
        className="card stage"
        onPointerDown={aimAt}
        onPointerMove={aimAt}
        onPointerLeave={forgetAim}
        aria-label="Helpa stage"
      >
        <SpeechBubble text={moodLines[mood]} />
        {targetDot && <span className="look-target" style={{ left: targetDot.x, top: targetDot.y }} />}
        <div ref={helpaRef} className="stage-helpa">
          <Helpa mood={mood} speaking={speaking} lookAt={lookAt} size={size} />
        </div>
      </section>

      <section className="card controls" aria-label="Controls">
        <div className="control-group">
          <span className="label">Mood</span>
          <div className="pill-row">
            {HELPA_MOODS.map((moodOption) => (
              <button
                key={moodOption}
                type="button"
                className="pill"
                aria-pressed={mood === moodOption}
                onClick={() => setMood(moodOption)}
              >
                {moodOption}
              </button>
            ))}
          </div>
        </div>

        <div className="control-group">
          <span className="label">Voice</span>
          <div className="pill-row">
            <button type="button" className="pill" aria-pressed={speaking} onClick={() => setSpeaking(!speaking)}>
              {speaking ? "Speaking" : "Quiet"}
            </button>
          </div>
        </div>

        <label className="control-group">
          <span className="label">Size</span>
          <span className="slider-row">
            <input
              type="range"
              min={64}
              max={300}
              step={4}
              value={size}
              onChange={(event) => setSize(Number(event.target.value))}
            />
            <output>{size}px</output>
          </span>
        </label>
      </section>

      <section className="card control-group" aria-label="All moods at 64 pixels">
        <span className="label">Every mood at 64px</span>
        <div className="mood-grid">
          {HELPA_MOODS.map((moodOption) => (
            <button
              key={moodOption}
              type="button"
              className="mood-tile"
              aria-pressed={mood === moodOption}
              onClick={() => setMood(moodOption)}
            >
              <Helpa mood={moodOption} size={64} />
              {moodOption}
            </button>
          ))}
        </div>
        <p className="hint">Small Helpas run their own mood loop so you can check readability at app icon size.</p>
      </section>
    </main>
  );
}
