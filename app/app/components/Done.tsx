"use client";

import { motion } from "motion/react";
import { useState } from "react";
import type { Plan } from "../lib/api";
import Confetti from "./Confetti";
import Helpa, { type HelpaMood } from "./Helpa";
import Icon from "./Icons";
import { tidy } from "../lib/text";

type DoneProps = { plan: Plan | null; /** Muse Image's drawing of the fix on their photo, for the share card. */ drawing?: string; /** Opens this fix's job: the pro finder, the part, the reminder. */ onJob?: () => void; minutes: number; mood: HelpaMood; speaking: boolean; onRestart: () => void; savedName?: string; ruledOut?: string[] };

/** Little stars that pop out from behind Helpa once, like a party popper. */
function Burst() {
  return (
    <div className="burst" aria-hidden="true">
      {Array.from({ length: 10 }, (_, index) => {
        const angle = (index / 10) * Math.PI * 2;
        return (
          <motion.span
            key={index}
            initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
            animate={{ x: Math.cos(angle) * 120, y: Math.sin(angle) * 100, scale: [0, 1.2, 0.8], opacity: [0, 1, 0] }}
            transition={{ duration: 1.1, delay: 0.15 + (index % 3) * 0.05, ease: "easeOut" }}
          >
            <Icon name="plus" size={index % 2 ? 16 : 22} />
          </motion.span>
        );
      })}
    </div>
  );
}

const proStep = /\b(call|contact|hire|book|schedule)\b.*\b(pro|technician|professional|plumber|electrician|mechanic|repair (service|person|shop)|service)\b/i;

/** The plan hands the repair to a professional, so there's nothing for the person to test or celebrate fixing. */
export const needsPro = (plan: Plan | null) => Boolean(plan?.stop_for_pro || plan?.steps.some((step) => proStep.test(step.instruction)));

export default function Done({ plan, drawing, onJob, minutes, mood, speaking, onRestart, savedName, ruledOut = [] }: DoneProps) {
  const [shared, setShared] = useState(false);
  // Only claim savings when a technician or shop would really have been paid for this fix.
  // A plan that ends in "call a pro" may still need that visit, so it saved nothing we can claim.
  const handedOff = needsPro(plan);
  const saved = handedOff ? 0 : (plan?.pro_visit_cost ?? 0);
  const aftercare = plan?.aftercare ? tidy(plan.aftercare) : "";
  const thing = plan?.appliance ? tidy(plan.appliance).toLowerCase() : "appliance";
  const identity = [plan?.brand, plan?.model_number].filter((value) => value && !/unknown|not visible|n\/a/i.test(value)).join(" ");
  const time = minutes < 1 ? "under a minute" : `${minutes} min`;

  const share = async () => {
    const text = `I just fixed my ${thing} myself in ${time} with Helpa. It showed me every step on a 3D model.`;
    try {
      // Muse Image's drawing of their own machine makes the share card when there is one.
      const file = drawing ? new File([await (await fetch(drawing)).blob()], "helpa-fix.webp", { type: "image/webp" }) : null;
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ title: "Helpa", text: `${text} ${location.origin}`, files: [file] });
      else if (navigator.share) await navigator.share({ title: "Helpa", text, url: location.origin });
      else await navigator.clipboard.writeText(`${text} ${location.origin}`);
      setShared(true);
    } catch {
      // The share sheet was closed; nothing to do.
    }
  };

  return (
    <section className="screen done" aria-label="All done">
      {!handedOff && <Confetti originY="22%" />}
      <div className="screen-body done-body">
        <div className="hero-stage">
          <div className="hero-blob" aria-hidden="true" />
          {!handedOff && <Burst />}
          <motion.div initial={{ y: 30, scale: 0.6 }} animate={{ y: [30, -18, 0], scale: [0.6, 1.08, 1] }} transition={{ duration: 0.7, times: [0, 0.6, 1], ease: "easeOut" }}>
            <Helpa mood={mood} speaking={speaking} size={170} />
          </motion.div>
        </div>
        <motion.div className="done-headline" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          {handedOff ? (
            <>
              <h1 className="display">Good call</h1>
              <p className="lede">This one is a job for a pro, and you already know what to tell them{ruledOut.length ? `: you ruled out ${ruledOut.map(tidy).join(" and ")}` : ""}.</p>
            </>
          ) : (
            <>
              <h1 className="display">You fixed it!</h1>
              <p className="lede">
                Your {identity && /^(car|truck|suv|vehicle)$/.test(thing) ? identity : [identity, thing].filter(Boolean).join(" ")} is good to go, and you did it yourself.
                {ruledOut.length > 0 && ` You ruled out ${ruledOut.map(tidy).join(" and ")} on the way.`}
              </p>
            </>
          )}
        </motion.div>

        {drawing && !handedOff && (
          <motion.figure className="drawing-card drawing-postcard" initial={{ opacity: 0, y: 12, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: -1.5 }} transition={{ delay: 0.35 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={drawing} alt={`Your ${thing}, drawn with the fix`} />
            <figcaption>
              <Icon name="pen" size={14} /> Your fix, drawn by Muse Image. Tap Share to send it.
            </figcaption>
          </motion.figure>
        )}

        {plan && (
          <motion.div className="stat-row" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <div className="card stat">
              <span className="stat-icon" aria-hidden="true">
                <Icon name="check" size={16} strokeWidth={3} />
              </span>
              <strong>{plan.steps.length}</strong>
              <span>steps done</span>
            </div>
            <div className="card stat">
              <span className="stat-icon" aria-hidden="true">
                <Icon name="clock" size={16} />
              </span>
              <strong>{minutes < 1 ? "<1" : minutes}</strong>
              <span>{minutes <= 1 ? "minute" : "minutes"}, start to finish</span>
            </div>
          </motion.div>
        )}

        {savedName && (
          <motion.div className="card home-saved" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 220, damping: 20 }}>
            <span className="home-saved-icon" aria-hidden="true">
              <Icon name="home" size={20} />
            </span>
            <div>
              <strong>Saved to My Home</strong>
              <p>I&apos;ll remember your {savedName}, what you fixed, and when it needs care.</p>
            </div>
          </motion.div>
        )}

        {saved > 0 && (
          <motion.div className="card saved-card" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.55, type: "spring", stiffness: 220, damping: 18 }}>
            <span className="saved-label">Doing it yourself saved about</span>
            <strong className="saved-amount">${saved}</strong>
            <span className="saved-note">What a technician or shop typically charges for this. Prices vary by area.</span>
          </motion.div>
        )}

        {aftercare && (
          <motion.div className="card tip-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
            <span className="tip-icon" aria-hidden="true">
              <Icon name="heart" size={20} />
            </span>
            <div>
              <strong>Keep it this way</strong>
              <p>{aftercare}</p>
            </div>
          </motion.div>
        )}
      </div>
      {handedOff && onJob ? (
        // A job for a pro: Helpa finds the best-reviewed one near you and writes the message.
        <div className="bottom-bar bottom-bar-pair">
          <button className="btn btn-secondary press" onClick={onRestart}>
            Later
          </button>
          <button className="btn btn-primary press" onClick={onJob}>
            <Icon name="wrench" size={20} />
            Find a pro near me
          </button>
        </div>
      ) : (
        <div className="bottom-bar bottom-bar-pair">
          <button className="btn btn-secondary press" onClick={share}>
            <Icon name={shared ? "check" : "share"} size={20} />
            {shared ? "Shared" : "Share"}
          </button>
          <button className="btn btn-primary press" onClick={onRestart}>
            {savedName ? "Go to My Home" : "Fix another"}
          </button>
        </div>
      )}
    </section>
  );
}
