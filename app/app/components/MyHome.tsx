"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { statusOf, type Machine } from "../lib/home";
import { tidy } from "../lib/text";
import Helpa, { type HelpaMood } from "./Helpa";
import Icon from "./Icons";
import { SampleCards, samplePhoto, type Sample } from "./Samples";
import ThemeToggle from "./ThemeToggle";

type MyHomeProps = {
  machines: Machine[];
  mood: HelpaMood;
  speaking: boolean;
  onOpen: (machine: Machine) => void;
  onFix: () => void;
  onSample: (photo: Blob, sample: Sample) => void;
  onHelp: () => void;
};

export function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function identityLine(machine: Machine) {
  if (!machine.model) return machine.brand;
  if (machine.brand && machine.model.toLowerCase().includes(machine.brand.toLowerCase())) return machine.model;
  const year = machine.model.match(/^((?:19|20)\d\d)\s+(.+)$/);
  return year ? `${year[1]} ${machine.brand} ${year[2]}` : `${machine.brand} ${machine.model}`.trim();
}

/** A picture of the machine: a render of its built-in 3D model, or an icon for everything else. */
export function MachineThumb({ machine }: { machine: Machine }) {
  const [failed, setFailed] = useState(false);
  const rigId = machine.rig?.id;
  if (rigId && rigId !== "generated" && !failed)
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="machine-thumb" src={`/rigs/${rigId}.webp`} alt="" onError={() => setFailed(true)} />;
  return (
    <span className="machine-thumb machine-thumb-icon" aria-hidden="true">
      <Icon name="cube" size={30} />
    </span>
  );
}

/** The home screen: every machine Helpa remembers, with how it's doing, and a way to fix something new. */
export default function MyHome({ machines, mood, speaking, onOpen, onFix, onSample, onHelp }: MyHomeProps) {
  const [loadingSample, setLoadingSample] = useState<string>();
  const trySample = async (sample: Sample) => {
    setLoadingSample(sample.id);
    try {
      onSample(await samplePhoto(sample), sample);
    } finally {
      setLoadingSample(undefined);
    }
  };
  const due = machines.filter((machine) => statusOf(machine).tone === "due").length;

  return (
    <section className="screen home" aria-label="My Home">
      <div className="topbar">
        <span className="wordmark">helpa</span>
        <div className="topbar-actions">
          <ThemeToggle />
          <button className="icon-button press" onClick={onHelp} aria-label="How Helpa works">
            <Icon name="help" />
          </button>
        </div>
      </div>
      <div className="screen-body">
        <div className="home-head">
          <div>
            <h1 className="title">My Home</h1>
            <p className="home-sub">
              {machines.length} {machines.length === 1 ? "machine" : "machines"}
              {due > 0 && ` · ${due} need${due === 1 ? "s" : ""} care`}
            </p>
          </div>
          <Helpa mood={mood} speaking={speaking} size={64} />
        </div>

        <ul className="machine-grid">
          {machines.map((machine, index) => {
            const status = statusOf(machine);
            return (
              <motion.li key={machine.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * index }}>
                <button className="card machine-card press" onClick={() => onOpen(machine)}>
                  <MachineThumb machine={machine} />
                  <strong>{capitalize(tidy(machine.name))}</strong>
                  {identityLine(machine) && <span className="machine-identity">{identityLine(machine)}</span>}
                  <span className={`status-pill status-${status.tone}`}>{status.label}</span>
                </button>
              </motion.li>
            );
          })}
        </ul>

        <div className="sample-block">
          <p className="label">Nothing broken right now? Try a sample</p>
          <SampleCards onPick={trySample} busy={loadingSample} />
        </div>
      </div>
      <div className="bottom-bar">
        <button className="btn btn-primary press" onClick={onFix}>
          <Icon name="plus" size={20} />
          Fix something new
        </button>
      </div>
    </section>
  );
}
