"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { fetchFixes, type PickerEntry } from "../lib/api";
import Icon, { type IconName } from "./Icons";

const tileIcons = new Set<string>(["washer_top", "washer_front", "dryer", "dishwasher", "range", "microwave", "disposal", "car", "sink", "toilet", "fridge", "smoke_alarm", "outlet", "hvac", "shower", "door"]);

// Most homes have these, so they lead; the rest follow alphabetically as the backend sends them.
const firstUp = ["toilet", "sink", "washer_top", "washer_front", "dryer", "dishwasher", "fridge", "smoke_alarm", "outlet", "hvac"];

function iconOf(entry: PickerEntry): IconName {
  return (tileIcons.has(entry.icon) ? entry.icon : "toolbox") as IconName;
}

function ordered(entries: PickerEntry[]) {
  const rank = (entry: PickerEntry) => (firstUp.includes(entry.icon) ? firstUp.indexOf(entry.icon) : firstUp.length);
  return [...entries].filter((entry) => entry.problems.length).sort((first, second) => rank(first) - rank(second));
}

/**
 * "What needs fixing?": a tile for every thing Helpa knows, then its common problems as big rows.
 * Picking one goes straight to the ready fix, no typing and no photo needed.
 */
export default function FixPicker({ onPick }: { onPick: (fix: string, says: string, category: string) => void }) {
  const [entries, setEntries] = useState<PickerEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<PickerEntry | null>(null);

  useEffect(() => {
    let alive = true;
    fetchFixes()
      .then((list) => alive && setEntries(ordered(list)))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  if (failed) return null;
  return (
    <>
      <ul className="picker-grid" aria-label="What needs fixing">
        {(entries ?? Array.from({ length: 8 }, () => null)).map((entry, index) => (
          <motion.li key={entry?.id ?? index} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.025 * index }}>
            {entry ? (
              <button className="picker-tile press" onClick={() => setOpen(entry)}>
                <span className="picker-icon" aria-hidden="true">
                  <Icon name={iconOf(entry)} size={30} strokeWidth={1.8} />
                </span>
                <span className="picker-name">{entry.category}</span>
              </button>
            ) : (
              <span className="picker-tile picker-tile-loading skeleton" aria-hidden="true" />
            )}
          </motion.li>
        ))}
      </ul>

      <AnimatePresence>
        {open && (
          <>
            <motion.div className="sheet-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(null)} aria-hidden="true" />
            <motion.div
              className="sheet picker-sheet"
              role="dialog"
              aria-label={`${open.category}: what's wrong?`}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
            >
              <div className="sheet-head">
                <span className="picker-icon picker-icon-large" aria-hidden="true">
                  <Icon name={iconOf(open)} size={34} strokeWidth={1.8} />
                </span>
                <div>
                  <h2 className="card-title">{open.category}</h2>
                  <p className="sheet-sub">What&apos;s going on?</p>
                </div>
                <button className="icon-button press" onClick={() => setOpen(null)} aria-label="Close">
                  <Icon name="close" />
                </button>
              </div>
              <ul className="picker-problems">
                {open.problems.map((problem) => (
                  <li key={problem.id}>
                    <button
                      className="picker-problem press"
                      onClick={() => {
                        setOpen(null);
                        onPick(problem.id, problem.says || problem.title, open.category);
                      }}
                    >
                      <span>{problem.title}</span>
                      <Icon name="next" size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
