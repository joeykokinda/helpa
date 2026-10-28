"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import samples from "../lib/samples.json";
import Icon from "./Icons";

export type Sample = (typeof samples)[number];

/** Loads a sample's photo so it goes through the same flow as a real one. */
export async function samplePhoto(sample: Sample) {
  const response = await fetch(`/samples/${sample.id}.webp`);
  if (!response.ok) throw new Error("sample photo missing");
  return response.blob();
}

/** A row of broken-thing samples, for judges and anyone without a broken appliance on hand. */
export function SampleCards({ onPick, busy }: { onPick: (sample: Sample) => void; busy?: string }) {
  return (
    <ul className="sample-cards" aria-label="Try a sample">
      {samples.map((sample) => (
        <li key={sample.id}>
          <button className="sample-card press" onClick={() => onPick(sample)} disabled={Boolean(busy)} aria-label={`Try a sample: ${sample.complaint}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/samples/${sample.id}-thumb.webp`} alt="" />
            <span>{sample.title}</span>
            {busy === sample.id && <span className="sample-card-busy spinner" aria-hidden="true" />}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** "No broken thing?" pill that opens the samples as a bottom sheet over the camera. */
export function SampleSheetButton({ onPick }: { onPick: (sample: Sample) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="sample-pill glass press" onClick={() => setOpen(true)}>
        <Icon name="play" size={16} />
        Nothing broken? Try a sample
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div className="sheet-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} aria-hidden="true" />
            <motion.div
              className="sheet"
              role="dialog"
              aria-label="Try a sample"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
            >
              <div className="sheet-head">
                <div>
                  <h2 className="card-title">Try a sample</h2>
                  <p className="sheet-sub">No broken appliance needed. Pick one and Helpa walks you through the whole fix.</p>
                </div>
                <button className="icon-button press" onClick={() => setOpen(false)} aria-label="Close">
                  <Icon name="close" />
                </button>
              </div>
              <SampleCards
                onPick={(sample) => {
                  setOpen(false);
                  onPick(sample);
                }}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
