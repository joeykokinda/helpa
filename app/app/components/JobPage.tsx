"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { transcribe } from "../lib/api";
import {
  addFollowUp,
  bookPro,
  calendarFile,
  checkFairPrice,
  deleteJob,
  enableNotifications,
  findPart,
  findPros,
  finishFollowUp,
  jobSummary,
  listJobs,
  markContacted,
  markOrdered,
  notificationsOn,
  priceRange,
  proMessage,
  reachOut,
  setJobStatus,
  shortPart,
  unfoundParts,
  tellProSaid,
  timeSlots,
  type Job,
  type JobPart,
  type JobPro,
  type ProUpdate,
} from "../lib/jobs";
import { toWav } from "../lib/media";
import Icon, { type IconName } from "./Icons";

type JobPageProps = {
  job: Job;
  onChange: (job: Job) => void;
  onBack: () => void;
  /** Walks the person through putting the new part in. */
  onInstall: (job: Job, part: JobPart) => void;
  /** Starts a fix with Helpa from what the pro said, when it's something you can do yourself. */
  onFix: (job: Job, complaint: string) => void;
  onDeleted: (id: string) => void;
};

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const statusLabel: Record<Job["status"], string> = {
  fixing: "In progress",
  needs_part: "Needs a part",
  waiting_part: "Part on the way",
  part_arrived: "Part arrived",
  needs_pro: "Needs a pro",
  pro_booked: "Pro booked",
  done: "Fixed",
};

const logIcon: Record<string, IconName> = {
  diagnosed: "scan",
  part_found: "tag",
  part_ordered: "send",
  part_shipped: "send",
  part_arrived: "check",
  pros_found: "wrench",
  contacted: "speaker",
  booked: "clock",
  fixed: "check",
  reminder: "clock",
  note: "pen",
};

const day = 86_400_000;
const when = (time: number) => new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const whenFull = (time: number) => new Date(time).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** One job, start to finish: Helpa's next step on top, then the part, the pro, reminders, and everything that happened. */
export default function JobPage({ job, onChange, onBack, onInstall, onFix, onDeleted }: JobPageProps) {
  const [busy, setBusy] = useState<string>();
  const [demoBuying, setDemoBuying] = useState(false);
  const [error, setError] = useState("");
  const [sample, setSample] = useState(false);
  const [notify, setNotify] = useState<"on" | "off" | "denied" | "unsupported">(() => (notificationsOn() ? "on" : "off"));

  // A typed DEMO order moves on the server's clock; poll while it's on the way so the card moves without a reload.
  const moving = job.parts.some((item) => item.tracking?.toUpperCase() === "DEMO" && item.status !== "found" && item.status !== "delivered");
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    if (!moving) return;
    const timer = window.setInterval(async () => {
      const fresh = (await listJobs().catch(() => [])).find((candidate) => candidate.id === job.id);
      if (fresh) onChangeRef.current(fresh);
    }, 4000);
    return () => clearInterval(timer);
  }, [moving, job.id]);

  const run = async (label: string, work: () => Promise<Job | { job: Job; sample: boolean }>) => {
    setBusy(label);
    setError("");
    try {
      const result = await work();
      if ("job" in result) {
        setSample(result.sample);
        onChange(result.job);
      } else onChange(result);
      return true;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Something went wrong. Try again?";
      setError(message);
      setTimeout(() => setError((current) => (current === message ? "" : current)), 6000);
      return false;
    } finally {
      setBusy(undefined);
    }
  };

  const turnOnNotifications = async () => setNotify(await enableNotifications().catch(() => "unsupported" as const));

  const part = job.parts.find((candidate) => candidate.status !== "delivered") ?? job.parts[job.parts.length - 1];
  // The newest plan's parts come last; that's the one that matters now. Parts already found aren't asked again.
  const unfound = unfoundParts(job);
  const neededPart = unfound[unfound.length - 1];
  const machine = [job.brand, job.model].filter(Boolean).join(" ") || job.appliance;

  // The one thing to do now, as a big card: the autopilot for people who just want it fixed.
  let next: { title: string; detail: string; action?: ReactNode } = { title: statusLabel[job.status], detail: "" };
  // While a demo order plays on the part card, the big card waits for it to land.
  if (demoBuying) next = { title: "Your part is on its way", detail: "Helpa is watching the delivery for you." };
  else if (job.status === "part_arrived" && part)
    next = {
      title: "Your part is here",
      detail: `Helpa walks you through putting the new ${shortPart(part.name).split(" - ")[0].toLowerCase()} in, step by step.`,
      action: (
        <button className="btn btn-light press" onClick={() => onInstall(job, part)}>
          <Icon name="wrench" size={20} /> Install it now
        </button>
      ),
    };
  else if (job.status === "waiting_part" && part)
    next = {
      title: part.status === "out_for_delivery" ? "Arriving today" : "Your part is on the way",
      detail: notify === "on" ? "Helpa is watching the delivery and will tell you the moment it arrives." : "Helpa is watching the delivery. Turn on notifications so it can tell you when it arrives.",
      action:
        notify === "on" ? undefined : (
          <button className="btn btn-light press" onClick={turnOnNotifications}>
            <Icon name="speaker" size={20} /> Tell me when it arrives
          </button>
        ),
    };
  else if (job.status === "needs_part" && part)
    next = { title: `Order the ${shortPart(part.name).toLowerCase()}`, detail: "Tap a store below, then come back and tap “I ordered it”. Helpa takes it from there." };
  else if (job.status === "needs_pro")
    next = job.pros.length
      ? { title: "Call one of these pros", detail: "They're the best reviewed near you. Your message already says what's wrong and what you tried." }
      : { title: "Let's get a pro", detail: "Helpa finds the best-reviewed people near you who fix this, and writes the message for you." };
  else if (!job.parts.length && neededPart && job.status !== "done" && job.status !== "pro_booked")
    next = {
      title: `Get the ${shortPart(neededPart).toLowerCase()}`,
      detail: `Helpa finds the exact part for your ${machine} and where to buy it.`,
      action: (
        <button className="btn btn-light press" onClick={() => run(`part-${neededPart}`, () => findPart(job.id, neededPart))} disabled={Boolean(busy)}>
          <Icon name="tag" size={20} /> {busy === `part-${neededPart}` ? "Searching stores…" : "Find the part"}
        </button>
      ),
    };
  else if (job.status === "pro_booked" && job.appointment)
    next = { title: `${job.appointment.pro} is coming`, detail: `${whenFull(job.appointment.at)}. Show them the summary below so you don't pay to diagnose it twice.` };
  else if (job.status === "done") {
    const due = job.follow_ups.find((followUp) => !followUp.done);
    next = { title: "Fixed", detail: due ? `Helpa will remind you on ${when(due.due)}: ${due.label.toLowerCase()}.` : "Nice work. Helpa keeps this in your home's history." };
  } else
    next = {
      title: "Still on it",
      detail: "Did the fix work?",
      action: (
        <div className="job-next-pair">
          <button className="btn btn-light press" onClick={() => run("done", () => setJobStatus(job.id, "done", "Fixed it."))}>
            <Icon name="check" size={20} /> Fixed it
          </button>
          <button className="btn job-ghost press" onClick={() => run("pro", () => setJobStatus(job.id, "needs_pro", "Needs a pro."))}>
            Get a pro
          </button>
        </div>
      ),
    };

  return (
    <section className="screen job" aria-label={`Job: ${job.title}`}>
      <div className="topbar">
        <button className="icon-button press" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
        <span className="topbar-title">{job.appliance ? job.appliance.charAt(0).toUpperCase() + job.appliance.slice(1) : "Job"}</span>
      </div>
      <div className="screen-body">
        <div className="job-head">
          <span className={`status-pill job-status job-status-${job.status}`}>{statusLabel[job.status]}</span>
          <h1 className="title">{job.title}</h1>
          {(job.brand || job.model) && <p className="job-machine">{machine}</p>}
        </div>

        <motion.article key={job.status + next.title} className="job-next" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <p className="job-next-label">
            <Icon name="play" size={14} /> Helpa&apos;s next step
          </p>
          <h2>{next.title}</h2>
          {next.detail && <p>{next.detail}</p>}
          {next.action}
        </motion.article>

        <AnimatePresence>
          {error && (
            <motion.p className="job-error" role="alert" onClick={() => setError("")} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}>
              {error}
            </motion.p>
          )}
        </AnimatePresence>
        {sample && <p className="job-sample">Offline mode: these results are samples, not real stores or businesses.</p>}

        {job.contact && job.status !== "done" && <ProThread job={job} busy={busy} run={run} />}
        {(job.contact || job.appointment) && job.status !== "done" && <ProSaid job={job} busy={busy} run={run} onFix={onFix} />}

        {job.parts.map((item) => (
          <PartCard key={item.id} job={job} part={item} busy={busy} run={run} onInstall={onInstall} onDemo={setDemoBuying} />
        ))}

        {job.status !== "done" && (job.fair_price || job.pros.length > 0 || job.parts.length > 0) && <FairPriceCard job={job} busy={busy} run={run} />}

        {unfound.length > 0 && job.status !== "done" && (
          <article className="card job-card">
            <h2 className="card-title">
              <Icon name="tag" size={20} /> {job.parts.length ? "Other parts it may need" : "Parts it may need"}
            </h2>
            <p className="job-muted">Only if the steps show it&apos;s worn or broken. Helpa finds the exact one for your machine.</p>
            <ul className="job-buy">
              {unfound.map((name) => (
                <li key={name}>
                  <button className="job-buy-row press" onClick={() => run(`part-${name}`, () => findPart(job.id, name))} disabled={Boolean(busy)}>
                    <span>
                      <strong>{shortPart(name)}</strong>
                    </span>
                    <span className="job-muted">{busy === `part-${name}` ? "Searching…" : "Find it"}</span>
                    <Icon name="next" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          </article>
        )}


        {(job.status === "needs_pro" || job.pros.length > 0) && job.status !== "pro_booked" && !job.appointment && <ProFinder job={job} busy={busy} run={run} />}

        {job.appointment && (
          <article className="card job-card">
            <h2 className="card-title">
              <Icon name="clock" size={20} /> Appointment
            </h2>
            <p className="job-strong">{job.appointment.pro}</p>
            <p className="job-muted">{whenFull(job.appointment.at)}</p>
            <div className="job-actions">
              <button
                className="btn btn-secondary press"
                onClick={() => {
                  const file = calendarFile(job);
                  if (!file) return;
                  const link = document.createElement("a");
                  link.href = URL.createObjectURL(file);
                  link.download = "helpa-appointment.ics";
                  link.click();
                }}
              >
                Add to calendar
              </button>
              {job.appointment.phone && (
                <a className="btn btn-secondary press" href={`tel:${job.appointment.phone.replace(/[^\d+]/g, "")}`}>
                  Call
                </a>
              )}
            </div>
          </article>
        )}

        <article className="card job-card">
          <h2 className="card-title">
            <Icon name="book" size={20} /> For a pro
          </h2>
          <p className="job-muted">Everything you know, ready to show or send, so nobody charges you to figure it out again.</p>
          <pre className="job-summary">{jobSummary(job)}</pre>
          <button
            className="btn btn-secondary press"
            onClick={async () => {
              const text = jobSummary(job);
              try {
                if (navigator.share) await navigator.share({ title: job.title, text });
                else await navigator.clipboard.writeText(text);
              } catch {
                // the share sheet was closed
              }
            }}
          >
            <Icon name="share" size={18} /> Share summary
          </button>
        </article>

        <article className="card job-card">
          <h2 className="card-title">
            <Icon name="clock" size={20} /> Reminders
          </h2>
          {job.follow_ups.length > 0 && (
            <ul className="job-followups">
              {job.follow_ups.map((followUp) => (
                <li key={followUp.id} className={followUp.done ? "job-followup-done" : ""}>
                  <button className="job-check press" onClick={() => !followUp.done && run("follow", () => finishFollowUp(job.id, followUp.id))} aria-label={`Mark done: ${followUp.label}`}>
                    {followUp.done && <Icon name="check" size={14} strokeWidth={3} />}
                  </button>
                  <span>{followUp.label}</span>
                  <span className="job-muted">{when(followUp.due)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="job-muted">Remind me to check it&hellip;</p>
          <div className="job-chips">
            {[
              ["In a week", 7],
              ["In a month", 30],
              ["In 3 months", 90],
            ].map(([label, days]) => (
              <button key={label} className="chip press" onClick={() => run("follow", () => addFollowUp(job.id, `Check the ${job.appliance} is still working well`, Date.now() + Number(days) * day))}>
                {label}
              </button>
            ))}
          </div>
          {notify !== "on" && (
            <button className="text-button press" onClick={turnOnNotifications}>
              {notify === "denied" ? "Notifications are blocked in your browser settings" : notify === "unsupported" ? "Add Helpa to your home screen to get notifications" : "Turn on notifications"}
            </button>
          )}
        </article>

        <article className="card job-card">
          <h2 className="card-title">
            <Icon name="replay" size={20} /> What happened
          </h2>
          <ol className="job-log">
            {[...job.log].reverse().map((entry, index) => (
              <li key={index}>
                <span className="job-log-icon" aria-hidden="true">
                  <Icon name={logIcon[entry.kind] ?? "pen"} size={15} />
                </span>
                <span>{entry.text}</span>
                <span className="job-muted">{when(entry.at)}</span>
              </li>
            ))}
          </ol>
        </article>

        <div className="job-footer">
          {job.status !== "done" && (
            <button className="btn btn-secondary press" onClick={() => run("done", () => setJobStatus(job.id, "done", "Marked fixed."))}>
              <Icon name="check" size={18} /> Mark fixed
            </button>
          )}
          <button
            className="text-button press"
            onClick={async () => {
              if (!confirm("Delete this job and its history?")) return;
              await deleteJob(job.id).catch(() => undefined);
              onDeleted(job.id);
            }}
          >
            Delete job
          </button>
        </div>
      </div>
    </section>
  );
}

type RunProps = { job: Job; busy?: string; run: (label: string, work: () => Promise<Job | { job: Job; sample: boolean }>) => Promise<boolean> };

const deliverySteps: [JobPart["status"], string][] = [
  ["ordered", "Ordered"],
  ["shipped", "Shipped"],
  ["out_for_delivery", "Out for delivery"],
  ["delivered", "Arrived"],
];

function PartCard({ job, part, busy, run, onInstall, onDemo }: RunProps & { part: JobPart; onInstall: (job: Job, part: JobPart) => void; onDemo: (moving: boolean) => void }) {
  const [ordering, setOrdering] = useState(false);
  const [store, setStore] = useState(part.buy[0]?.store ?? "");
  const [tracking, setTracking] = useState("");
  // Buy it (demo): nothing is bought; the delivery plays through in about five seconds, then the part is here.
  const [demoStep, setDemoStep] = useState(-1);
  const buyDemo = (from: string) =>
    run("buy", async () => {
      setDemoStep(0);
      onDemo(true);
      try {
        const [result] = await Promise.all([markOrdered(job.id, part.id, { store: from, demo: true }), wait(1200)]);
        for (const step of [1, 2, 3]) {
          await wait(1300);
          setDemoStep(step);
        }
        await wait(600);
        return result;
      } finally {
        setDemoStep(-1);
        onDemo(false);
      }
    });
  const reached = demoStep >= 0 ? demoStep : deliverySteps.findIndex(([status]) => status === part.status);
  const arrived = demoStep < 0 && part.status === "delivered" && job.status === "part_arrived";
  return (
    <article className="card job-card">
      <h2 className="card-title">
        <Icon name="tag" size={20} /> {shortPart(part.name)}
      </h2>
      {part.part_number && (
        <p className="job-part-number">
          Part # <strong>{part.part_number}</strong>
          <span className={`job-confidence job-confidence-${part.confidence}`}>{part.confidence === "high" ? "Exact match" : part.confidence === "medium" ? "Likely match" : "Check it matches"}</span>
        </p>
      )}
      {part.fits && <p className="job-muted">{part.fits}</p>}

      {part.status === "found" && demoStep < 0 ? (
        <>
          <ul className="job-buy">
            {part.buy.map((option) => (
              <li key={option.url}>
                <a className="job-buy-row press" href={option.url} target="_blank" rel="noreferrer" onClick={() => setStore(option.store)}>
                  <span>
                    <strong>{option.store}</strong>
                    <span className="job-muted">{option.in_stock ? "In stock" : "Check stock"}</span>
                  </span>
                  <span className="job-price">{option.price || "See price"}</span>
                  <Icon name="next" size={18} />
                </a>
              </li>
            ))}
          </ul>
          <button className="btn btn-primary press" onClick={() => buyDemo(store || part.buy[0]?.store || "the store")} disabled={Boolean(busy)}>
            <Icon name="tag" size={20} /> Buy it{store ? ` from ${store}` : ""} (demo)
          </button>
          <p className="job-demo-note">Demo: nothing is bought. Real checkout and auto-ordering can be connected later (store APIs).</p>
          {ordering ? (
            <form
              className="job-form"
              onSubmit={(submitEvent) => {
                submitEvent.preventDefault();
                run("order", () => markOrdered(job.id, part.id, { store, tracking }));
              }}
            >
              <label>
                Where from
                <input value={store} onChange={(changeEvent) => setStore(changeEvent.target.value)} placeholder="Store" maxLength={60} />
              </label>
              <label>
                Tracking number (if you have it)
                <input value={tracking} onChange={(changeEvent) => setTracking(changeEvent.target.value)} placeholder="From the shipping email" maxLength={40} inputMode="text" autoCapitalize="characters" />
              </label>
              <button type="button" className="job-demo-link" onClick={() => setTracking("DEMO")}>
                Just trying Helpa? Use DEMO and watch it arrive in 90 seconds
              </button>
              <button className="btn btn-primary press" type="submit" disabled={busy === "order"}>
                {busy === "order" ? "Saving…" : "Save. Helpa will watch it"}
              </button>
            </form>
          ) : (
            <button className="text-button press" onClick={() => setOrdering(true)}>
              I ordered it myself
            </button>
          )}
        </>
      ) : (
        <>
          <ol className="job-delivery" aria-label="Delivery">
            {deliverySteps.map(([status, label], index) => (
              <li key={status} className={index <= reached ? "job-delivery-done" : ""}>
                <span aria-hidden="true">{index <= reached && <Icon name="check" size={12} strokeWidth={3} />}</span>
                {label}
              </li>
            ))}
          </ol>
          {(part.last_note || part.eta) && (
            <p className="job-muted">
              {part.last_note}
              {part.eta && part.status !== "delivered" ? ` Expected ${part.eta}.` : ""}
            </p>
          )}
          {part.store && <p className="job-muted">From {part.store}{part.tracking ? `, tracking ${part.tracking}` : ""}</p>}
        </>
      )}
      <AnimatePresence>
        {arrived && (
          <motion.div className="job-arrived" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 320, damping: 22 }}>
            <p className="job-arrived-title">
              <Icon name="check" size={20} strokeWidth={3} /> Your part is here
            </p>
            <p>Helpa walks you through putting the new {shortPart(part.name).split(" - ")[0].toLowerCase()} in, step by step on the 3D model.</p>
            <button className="btn btn-primary press" onClick={() => onInstall(job, part)}>
              <Icon name="wrench" size={20} /> Install it now
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}

function FairPriceCard({ job, busy, run }: RunProps) {
  const fair = job.fair_price;
  if (!fair)
    return (
      <article className="card job-card">
        <h2 className="card-title">
          <Icon name="shield" size={20} /> Fair price
        </h2>
        <p className="job-muted">Helpa checks what this repair usually costs near you, so nobody overcharges you.</p>
        <button className="btn btn-secondary press" onClick={() => run("fair", () => checkFairPrice(job.id, job.location ?? ""))} disabled={Boolean(busy)}>
          {busy === "fair" ? "Checking prices…" : "What should this cost?"}
        </button>
      </article>
    );
  return (
    <article className="card job-card job-fair">
      <h2 className="card-title">
        <Icon name="shield" size={20} /> Fair price
      </h2>
      {fair.high > 0 ? <p className="job-fair-range">{priceRange(fair.low, fair.high)}</p> : null}
      <p>{fair.summary}</p>
      {fair.includes && <p className="job-muted">Covers {fair.includes}.</p>}
      {fair.service_call && <p className="job-muted">Service call: {fair.service_call}.</p>}
      {fair.red_flags.length > 0 && (
        <ul className="job-flags">
          {fair.red_flags.map((flag) => (
            <li key={flag}>{flag}</li>
          ))}
        </ul>
      )}
      {fair.sources.length > 0 && <p className="job-sources">From {fair.sources.join(", ")}{fair.sample ? " (sample)" : ""}</p>}
    </article>
  );
}

/** The demo conversation with a shop: Helpa's message, then the shop's (generated) reply with a quote and a time. */
function ProThread({ job, busy, run }: RunProps) {
  const contact = job.contact!;
  // The reply shows after a short "typing" beat, like a real text coming in.
  const [typing, setTyping] = useState(() => Date.now() - contact.sent_at < 15_000);
  const [priceNote, setPriceNote] = useState(false);
  useEffect(() => {
    if (!typing) return;
    const timer = window.setTimeout(() => setTyping(false), 2200);
    return () => clearTimeout(timer);
  }, [typing]);
  const fair = job.fair_price;
  const quoted = contact.quote_high || contact.quote_low;
  const high = fair && fair.high > 0 && quoted > fair.high;
  const booked = job.appointment?.pro === contact.pro;
  return (
    <article className="card job-card">
      <h2 className="card-title">
        <Icon name="send" size={20} /> {contact.pro}
      </h2>
      <div className="job-thread">
        <p className="job-bubble job-bubble-you">{contact.message}</p>
        <p className="job-delivered">Sent by Helpa{contact.demo ? " (demo)" : ""}</p>
        {typing ? (
          <p className="job-bubble job-bubble-them job-typing" aria-label={`${contact.pro} is typing`}>
            <span />
            <span />
            <span />
          </p>
        ) : (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <p className="job-bubble job-bubble-them">{contact.reply}</p>
            {contact.demo && <p className="job-demo-note">Demo reply: calling or texting for you can be connected later (phone service + your permission).</p>}
            {quoted > 0 && (
              <p className={`job-quote ${high ? "job-quote-high" : ""}`}>
                Quote {priceRange(contact.quote_low, contact.quote_high)}
                {fair && fair.high > 0 ? (high ? ` · above the fair ${priceRange(fair.low, fair.high)}` : ` · within the fair ${priceRange(fair.low, fair.high)}`) : ""}
              </p>
            )}
            {contact.slot_label && <p className="job-muted">{booked ? "Booked" : "They can come"} {contact.slot_label.toLowerCase()}.</p>}
            {priceNote && (
              <p className="job-muted">
                {high
                  ? `That's more than this repair usually costs (${priceRange(fair!.low, fair!.high)}). Ask what's included, and whether a cheaper part was ruled out first.`
                  : fair && fair.high > 0
                    ? `That's a fair price for this repair (usually ${priceRange(fair.low, fair.high)}).`
                    : "Helpa hasn't checked a fair price yet. Tap “What should this cost?” below."}
              </p>
            )}
            {!booked && (
              <div className="job-actions">
                <button className="btn btn-primary btn-small press" onClick={() => run("book", () => bookPro(job.id, { name: contact.pro, phone: contact.phone ?? "" } as JobPro, contact.slot_at))} disabled={Boolean(busy)}>
                  Accept
                </button>
                <button className="btn btn-secondary btn-small press" onClick={() => setPriceNote(true)}>
                  Ask about the price
                </button>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </article>
  );
}

/** "What did the pro say?": typed or spoken, Helpa turns it into the job's new diagnosis, parts, price and next step. */
function ProSaid({ job, busy, run, onFix }: RunProps & { onFix: (job: Job, complaint: string) => void }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ update: ProUpdate; aboveFair: boolean } | null>(null);
  const [recording, setRecording] = useState(false);
  const [heardError, setHeardError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);

  const send = (said: string) =>
    run("said", async () => {
      const reply = await tellProSaid(job.id, said);
      setResult({ update: reply.update, aboveFair: reply.above_fair });
      setText("");
      return reply.job;
    });

  const toggleTalk = async () => {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    setHeardError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (dataEvent) => chunks.push(dataEvent.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        try {
          const heard = await transcribe(await toWav(new Blob(chunks, { type: recorder.mimeType })));
          if (heard.trim()) setText(heard.trim());
        } catch {
          setHeardError("I couldn't hear that, try again or type it.");
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setHeardError("I need the microphone to hear you. You can type instead.");
    }
  };

  const update = result?.update;
  const fair = job.fair_price;
  const newPart = update?.parts.find((part) => part.name);
  const partLabel = newPart ? `${newPart.name}${newPart.part_number ? ` (part number ${newPart.part_number})` : ""}` : "";
  const alreadyFound = newPart && job.parts.some((part) => part.name.toLowerCase().startsWith(newPart.name.toLowerCase()));
  return (
    <article className="card job-card">
      <h2 className="card-title">
        <Icon name="ear" size={20} /> What did the pro say?
      </h2>
      <p className="job-muted">Tell Helpa in your own words. It updates the job: what&apos;s wrong, the part, the price.</p>
      <form
        className="job-said"
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          if (text.trim()) send(text.trim());
        }}
      >
        <textarea value={text} onChange={(changeEvent) => setText(changeEvent.target.value)} placeholder="e.g. It's the thermal fuse, part 279973, $140" aria-label="What the pro said" rows={2} maxLength={1200} />
        <div className="job-actions">
          <button type="button" className={`btn btn-secondary btn-small press ${recording ? "job-mic-live" : ""}`} onClick={toggleTalk} aria-pressed={recording}>
            <Icon name="mic" size={18} /> {recording ? "Stop" : "Say it"}
          </button>
          <button type="submit" className="btn btn-primary btn-small press" disabled={!text.trim() || Boolean(busy)}>
            {busy === "said" ? "Updating…" : "Update the job"}
          </button>
        </div>
      </form>
      {heardError && <p className="job-muted">{heardError}</p>}
      {update && (
        <motion.div className="job-said-result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {update.diagnosis && <p className="job-strong">{update.diagnosis}</p>}
          {newPart && (
            <p>
              Part: <strong>{newPart.name}</strong>
              {newPart.part_number && <> #{newPart.part_number}</>}
            </p>
          )}
          {update.quoted_price > 0 && (
            <p className={`job-quote ${result?.aboveFair ? "job-quote-high" : ""}`}>
              Quoted ${update.quoted_price}
              {fair && fair.high > 0
                ? result?.aboveFair
                  ? ` · above the fair ${priceRange(fair.low, fair.high)}, ask why`
                  : update.quoted_price < fair.low
                    ? ` · below the usual ${priceRange(fair.low, fair.high)}, a good price`
                    : ` · fair (usually ${priceRange(fair.low, fair.high)})`
                : ""}
            </p>
          )}
          <p className="job-muted">{update.next_step}</p>
          <div className="job-actions">
            {newPart && !alreadyFound && (
              <button className="btn btn-primary btn-small press" onClick={() => run(`part-${partLabel}`, () => findPart(job.id, partLabel))} disabled={Boolean(busy)}>
                <Icon name="tag" size={18} /> {busy === `part-${partLabel}` ? "Searching stores…" : "Find this part"}
              </button>
            )}
            {(update.status === "diy" || update.status === "needs_part") && (
              <button className="btn btn-secondary btn-small press" onClick={() => onFix(job, `${update.diagnosis} ${partLabel ? `I need to replace the ${partLabel}.` : ""} Show me how to do it on my ${[job.brand, job.model, job.appliance].filter(Boolean).join(" ")}.`)}>
                <Icon name="cube" size={18} /> Show me how
              </button>
            )}
          </div>
        </motion.div>
      )}
    </article>
  );
}

function stars(rating: number) {
  return rating > 0 ? `${rating.toFixed(1)} ★` : "";
}

const locationKey = "helpa-location";

function savedLocation() {
  try {
    return localStorage.getItem(locationKey) ?? "";
  } catch {
    return "";
  }
}

function ProFinder({ job, busy, run }: RunProps) {
  const [location, setLocation] = useState(() => job.location ?? savedLocation());
  // Typing a ZIP is the fallback: first Helpa asks the phone where you are, only when you need a pro.
  const [typing, setTyping] = useState(false);
  const [locating, setLocating] = useState(false);
  const [slots, setSlots] = useState<number[]>([]);
  const [booking, setBooking] = useState<JobPro | null>(null);
  const [bookAt, setBookAt] = useState("");
  const options = timeSlots().slice(0, 6);

  const search = (where: string) => {
    try {
      localStorage.setItem(locationKey, where);
    } catch {
      // private mode: asked again next time
    }
    // The pros first, then what the job should cost, so the message can say it and a quote can be checked.
    run("pros", () => findPros(job.id, where)).then((found) => {
      if (found && !job.fair_price) run("fair", () => checkFairPrice(job.id, where));
    });
  };

  const nearMe = () => {
    if (location.trim()) return search(location.trim());
    if (!navigator.geolocation) return setTyping(true);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const where = `${position.coords.latitude.toFixed(3)}, ${position.coords.longitude.toFixed(3)}`;
        setLocation(where);
        search(where);
      },
      () => {
        setLocating(false);
        setTyping(true);
      },
      { timeout: 10000, maximumAge: 3600_000 },
    );
  };

  // Coordinates from the phone are only for the search; on screen they're just "you".
  const nearYou = /^-?\d+\.\d+, -?\d+\.\d+$/.test(location.trim());

  const [contacting, setContacting] = useState<JobPro | null>(null);
  // The times offered: what the person picked, or the next two if they didn't.
  const freeSlots = (slots.length ? options.filter((option) => slots.includes(option.at)) : options.slice(0, 2)).map((option) => ({ label: option.label.replace(/, \w+ \d+/, ""), at: option.at }));

  return (
    <article className="card job-card">
      <h2 className="card-title">
        <Icon name="wrench" size={20} /> Find a pro
      </h2>
      {nearYou && !typing && job.pros.length > 0 ? (
        <div className="job-near">
          <span>
            <Icon name="globe" size={18} /> Near you
          </span>
          <button
            className="text-button press"
            onClick={() => {
              setLocation("");
              setTyping(true);
            }}
          >
            Change
          </button>
        </div>
      ) : typing || (location && job.pros.length > 0) ? (
        <form
          className="job-location"
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            if (location.trim()) search(location.trim());
          }}
        >
          <input value={location} onChange={(changeEvent) => setLocation(changeEvent.target.value)} placeholder="ZIP code or town" aria-label="Your ZIP code or town" maxLength={80} autoFocus={typing} />
          <button className="btn btn-primary btn-small press" type="submit" disabled={!location.trim() || Boolean(busy)}>
            {busy === "pros" ? "Searching…" : job.pros.length ? "Search again" : "Find pros"}
          </button>
        </form>
      ) : (
        <>
          <button className="btn btn-primary press" onClick={nearMe} disabled={Boolean(busy) || locating}>
            <Icon name="globe" size={20} />
            {busy === "pros" ? "Finding the best-reviewed pros…" : locating ? "Finding you…" : location && !nearYou ? `Find pros near ${location}` : "Find pros near me"}
          </button>
          <button className="text-button press" onClick={() => setTyping(true)}>
            Type a ZIP code instead
          </button>
        </>
      )}

      {job.pros.length > 0 && (
        <>
          <p className="job-muted">When are you free? Helpa adds it to the message.</p>
          <div className="job-chips job-slots">
            {options.map((option) => (
              <button
                key={option.at}
                className={`chip press ${slots.includes(option.at) ? "chip-on" : ""}`}
                aria-pressed={slots.includes(option.at)}
                onClick={() => setSlots((current) => (current.includes(option.at) ? current.filter((at) => at !== option.at) : [...current, option.at].slice(-3)))}
              >
                {option.label.replace(/, \w+ \d+/, "")}
              </button>
            ))}
          </div>
          <ul className="job-pros">
            {job.pros.map((pro) => {
              return (
                <li key={pro.name} className="job-pro">
                  <div className="job-pro-head">
                    <strong>{pro.name}</strong>
                    <span className="job-rating">
                      {stars(pro.rating)}
                      {pro.reviews > 0 && <span className="job-muted"> ({pro.reviews})</span>}
                    </span>
                  </div>
                  {pro.why && <p className="job-muted">{pro.why}</p>}
                  {pro.hours && <p className="job-muted">{pro.hours}</p>}
                  <div className="job-actions">
                    <button className="btn btn-primary btn-small press" onClick={() => setContacting(pro)}>
                      Contact
                    </button>
                    {pro.website && (
                      <a className="btn btn-secondary btn-small press" href={pro.website} target="_blank" rel="noreferrer">
                        Website
                      </a>
                    )}
                    <button className="btn btn-secondary btn-small press" onClick={() => setBooking(booking?.name === pro.name ? null : pro)} aria-expanded={booking?.name === pro.name}>
                      I booked them
                    </button>
                  </div>
                  {booking?.name === pro.name && (
                    <form
                      className="job-form"
                      onSubmit={(submitEvent) => {
                        submitEvent.preventDefault();
                        const at = bookAt ? new Date(bookAt).getTime() : slots[0];
                        if (at) run("book", () => bookPro(job.id, pro, at));
                      }}
                    >
                      <label>
                        When are they coming?
                        <input type="datetime-local" value={bookAt} onChange={(changeEvent) => setBookAt(changeEvent.target.value)} />
                      </label>
                      <button className="btn btn-primary press" type="submit" disabled={!bookAt && !slots.length}>
                        Save the appointment
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <AnimatePresence>{contacting && <ContactSheet job={job} pro={contacting} slots={freeSlots} busy={busy} run={run} onClose={() => setContacting(null)} />}</AnimatePresence>
    </article>
  );
}

/** Contact a pro: the exact message, editable; text or call from your own phone, or let Helpa reach out (demo). */
function ContactSheet({ job, pro, slots, busy, run, onClose }: RunProps & { pro: JobPro; slots: { label: string; at: number }[]; onClose: () => void }) {
  const [message, setMessage] = useState(() => proMessage(job, slots.map((slot) => slot.label)));
  const [allowed, setAllowed] = useState(false);
  const digits = pro.phone.replace(/[^\d+]/g, "");
  const contacted = () => run("contact", () => markContacted(job.id, pro.name));
  return (
    <>
      <motion.div className="job-sheet-scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div className="job-sheet" role="dialog" aria-label={`Contact ${pro.name}`} initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 300, damping: 32 }}>
        <div className="sheet-head">
          <div>
            <p className="card-title">Contact {pro.name}</p>
            <p className="sheet-sub">This is exactly what they get. Change anything.</p>
          </div>
          <button className="icon-button press" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <textarea className="job-message" value={message} onChange={(changeEvent) => setMessage(changeEvent.target.value)} aria-label="Message to the pro" rows={9} maxLength={1500} />
        {digits && (
          <div className="job-actions">
            <a className="btn btn-secondary btn-small press" href={`sms:${digits}?&body=${encodeURIComponent(message)}`} onClick={contacted}>
              <Icon name="send" size={18} /> Text from my phone
            </a>
            <a className="btn btn-secondary btn-small press" href={`tel:${digits}`} onClick={contacted}>
              <Icon name="speaker" size={18} /> Call
            </a>
          </div>
        )}
        {digits && <p className="job-muted">Calling? Read them the message above.</p>}
        <label className="job-permission">
          <input type="checkbox" checked={allowed} onChange={(changeEvent) => setAllowed(changeEvent.target.checked)} />
          Helpa may contact this business for me
        </label>
        <button className="btn btn-primary press" disabled={!allowed || !message.trim() || Boolean(busy)} onClick={() => run("reach", () => reachOut(job.id, pro.name, message, slots)).then((sent) => sent && onClose())}>
          <Icon name="sparkle" size={20} /> {busy === "reach" ? "Sending…" : "Let Helpa reach out (demo)"}
        </button>
        <p className="job-demo-note">Demo: Helpa shows a sample reply. Calling or texting for you can be connected later (phone service + your permission).</p>
      </motion.div>
    </>
  );
}
