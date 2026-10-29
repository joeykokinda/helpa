"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { statusOf, type Machine } from "../lib/home";
import { tidy } from "../lib/text";
import Helpa, { type HelpaMood } from "./Helpa";
import Icon from "./Icons";
import FixPicker from "./FixPicker";
import { nextUp, type Job } from "../lib/jobs";
import { SampleCards, samplePhoto, type Sample } from "./Samples";
import ThemeToggle from "./ThemeToggle";

type MyHomeProps = {
  machines: Machine[];
  /** Jobs still in motion (a part on order, a pro to book) show first. */
  jobs: Job[];
  onOpenJob: (job: Job) => void;
  mood: HelpaMood;
  speaking: boolean;
  onOpen: (machine: Machine) => void;
  /** Show me: the camera. */
  onFix: () => void;
  /** Tell me: talk or type it. */
  onTell: () => void;
  /** A problem picked from the list, straight to its ready fix. */
  onPickFix: (fix: string, says: string) => void;
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

/** The first screen: show it, tell it, or pick it from the list; then the machines Helpa remembers. */
export default function MyHome({ machines, jobs, onOpenJob, mood, speaking, onOpen, onFix, onTell, onPickFix, onSample, onHelp }: MyHomeProps) {
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
  const openJobs = jobs.filter((job) => job.status !== "done");

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
          <h1 className="title home-title">What needs fixing?</h1>
          <Helpa mood={mood} speaking={speaking} size={64} />
        </div>

        <div className="start-actions">
          <button className="start-action start-action-primary press" onClick={onFix}>
            <span className="start-action-icon" aria-hidden="true">
              <Icon name="camera" size={26} />
            </span>
            <strong>Show me</strong>
            <span>Snap or scan it with your camera</span>
          </button>
          <button className="start-action press" onClick={onTell}>
            <span className="start-action-icon" aria-hidden="true">
              <Icon name="mic" size={26} />
            </span>
            <strong>Tell me</strong>
            <span>Say or type what&apos;s wrong</span>
          </button>
        </div>


        {openJobs.length > 0 && (
          <section className="home-section" aria-labelledby="jobs-heading">
            <h2 id="jobs-heading" className="section-title">
              Open jobs
              <span className="section-count">Helpa is on {openJobs.length === 1 ? "it" : `all ${openJobs.length}`}</span>
            </h2>
            <ul className="job-list">
              {openJobs.map((job) => (
                <li key={job.id}>
                  <button className={`job-row press job-row-${job.status}`} onClick={() => onOpenJob(job)}>
                    <span className="job-row-dot" aria-hidden="true" />
                    <span className="job-row-text">
                      <strong>{job.title}</strong>
                      <span>{nextUp(job)}</span>
                    </span>
                    <Icon name="next" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {machines.length > 0 && (
          <section className="home-section" aria-labelledby="home-heading">
            <h2 id="home-heading" className="section-title">
              My Home
              <span className="section-count">
                {machines.length} {machines.length === 1 ? "machine" : "machines"}
                {due > 0 && ` · ${due} need${due === 1 ? "s" : ""} care`}
              </span>
            </h2>
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
          </section>
        )}

        <section className="home-section" aria-labelledby="pick-heading">
          <h2 id="pick-heading" className="section-title">
            Or pick it
          </h2>
          <FixPicker onPick={(fix, says) => onPickFix(fix, says)} />
        </section>

        <section className="home-section sample-block" aria-labelledby="sample-heading">
          <h2 id="sample-heading" className="section-title">
            Nothing broken? Watch a fix
          </h2>
          <SampleCards onPick={trySample} busy={loadingSample} />
        </section>
      </div>
    </section>
  );
}
