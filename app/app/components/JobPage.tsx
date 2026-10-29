"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import {
  addFollowUp,
  bookPro,
  calendarFile,
  deleteJob,
  enableNotifications,
  findPart,
  findPros,
  finishFollowUp,
  jobSummary,
  markContacted,
  markOrdered,
  notificationsOn,
  setJobStatus,
  shortPart,
  timeSlots,
  type Job,
  type JobPart,
  type JobPro,
} from "../lib/jobs";
import Icon, { type IconName } from "./Icons";

type JobPageProps = {
  job: Job;
  onChange: (job: Job) => void;
  onBack: () => void;
  /** Walks the person through putting the new part in. */
  onInstall: (job: Job, part: JobPart) => void;
  onDeleted: (id: string) => void;
};

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
export default function JobPage({ job, onChange, onBack, onInstall, onDeleted }: JobPageProps) {
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState("");
  const [sample, setSample] = useState(false);
  const [notify, setNotify] = useState<"on" | "off" | "denied" | "unsupported">(() => (notificationsOn() ? "on" : "off"));

  const run = async (label: string, work: () => Promise<Job | { job: Job; sample: boolean }>) => {
    setBusy(label);
    setError("");
    try {
      const result = await work();
      if ("job" in result) {
        setSample(result.sample);
        onChange(result.job);
      } else onChange(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong. Try again?");
    } finally {
      setBusy(undefined);
    }
  };

  const turnOnNotifications = async () => setNotify(await enableNotifications().catch(() => "unsupported" as const));

  const part = job.parts.find((candidate) => candidate.status !== "delivered") ?? job.parts[job.parts.length - 1];
  // The newest plan's parts come last; that's the one that matters now. Parts already found aren't asked again.
  const unfound = job.parts_needed.filter((name) => !job.parts.some((found) => found.name.toLowerCase() === shortPart(name).toLowerCase()));
  const neededPart = unfound[unfound.length - 1];
  const machine = [job.brand, job.model].filter(Boolean).join(" ") || job.appliance;

  // The one thing to do now, as a big card: the autopilot for people who just want it fixed.
  let next: { title: string; detail: string; action?: ReactNode } = { title: statusLabel[job.status], detail: "" };
  if (job.status === "part_arrived" && part)
    next = {
      title: "Your part is here",
      detail: `Helpa walks you through putting the new ${part.name.toLowerCase()} in, step by step.`,
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
    next = { title: `Order the ${part.name.toLowerCase()}`, detail: "Tap a store below, then come back and tap “I ordered it”. Helpa takes it from there." };
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
          <p className="job-machine">{machine}</p>
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
            <motion.p className="job-error" role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {error}
            </motion.p>
          )}
        </AnimatePresence>
        {sample && <p className="job-sample">Offline mode: these results are samples, not real stores or businesses.</p>}

        {unfound.length > 0 && job.status !== "done" && (
          <article className="card job-card">
            <h2 className="card-title">
              <Icon name="tag" size={20} /> Parts it may need
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

        {job.parts.map((item) => (
          <PartCard key={item.id} job={job} part={item} busy={busy} run={run} />
        ))}

        {(job.status === "needs_pro" || job.pros.length > 0) && job.status !== "pro_booked" && <ProFinder job={job} busy={busy} run={run} />}

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

type RunProps = { job: Job; busy?: string; run: (label: string, work: () => Promise<Job | { job: Job; sample: boolean }>) => void };

const deliverySteps: [JobPart["status"], string][] = [
  ["ordered", "Ordered"],
  ["shipped", "Shipped"],
  ["out_for_delivery", "Out for delivery"],
  ["delivered", "Arrived"],
];

function PartCard({ job, part, busy, run }: RunProps & { part: JobPart }) {
  const [ordering, setOrdering] = useState(false);
  const [store, setStore] = useState(part.buy[0]?.store ?? "");
  const [tracking, setTracking] = useState("");
  const reached = deliverySteps.findIndex(([status]) => status === part.status);
  return (
    <article className="card job-card">
      <h2 className="card-title">
        <Icon name="tag" size={20} /> {part.name}
      </h2>
      {part.part_number && (
        <p className="job-part-number">
          Part # <strong>{part.part_number}</strong>
          <span className={`job-confidence job-confidence-${part.confidence}`}>{part.confidence === "high" ? "Exact match" : part.confidence === "medium" ? "Likely match" : "Check it matches"}</span>
        </p>
      )}
      {part.fits && <p className="job-muted">{part.fits}</p>}

      {part.status === "found" ? (
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
              <button className="btn btn-primary press" type="submit" disabled={busy === "order"}>
                {busy === "order" ? "Saving…" : "Save. Helpa will watch it"}
              </button>
            </form>
          ) : (
            <button className="btn btn-primary press" onClick={() => setOrdering(true)}>
              <Icon name="check" size={20} /> I ordered it
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
    </article>
  );
}

function stars(rating: number) {
  return rating > 0 ? `${rating.toFixed(1)} ★` : "";
}

function ProFinder({ job, busy, run }: RunProps) {
  const [location, setLocation] = useState(job.location ?? "");
  const [slots, setSlots] = useState<number[]>([]);
  const [booking, setBooking] = useState<JobPro | null>(null);
  const [bookAt, setBookAt] = useState("");
  const options = timeSlots().slice(0, 6);

  const useMyLocation = () =>
    navigator.geolocation?.getCurrentPosition(
      (position) => setLocation(`${position.coords.latitude.toFixed(3)}, ${position.coords.longitude.toFixed(3)}`),
      () => undefined,
      { timeout: 8000 },
    );

  const message = () => {
    const free = slots.length ? `\nI'm free ${slots.map((at) => options.find((option) => option.at === at)?.label.toLowerCase()).join(", or ")}.` : "";
    return `Hi! Could you take a look at my ${job.appliance}?\n\n${jobSummary(job)}${free}\n\nThanks!`;
  };

  return (
    <article className="card job-card">
      <h2 className="card-title">
        <Icon name="wrench" size={20} /> Find a pro
      </h2>
      <form
        className="job-location"
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          if (location.trim()) run("pros", () => findPros(job.id, location.trim()));
        }}
      >
        <input value={location} onChange={(changeEvent) => setLocation(changeEvent.target.value)} placeholder="ZIP code or town" aria-label="Your ZIP code or town" maxLength={80} />
        <button className="icon-button press" type="button" onClick={useMyLocation} aria-label="Use my location">
          <Icon name="globe" size={20} />
        </button>
        <button className="btn btn-primary btn-small press" type="submit" disabled={!location.trim() || Boolean(busy)}>
          {busy === "pros" ? "Searching…" : job.pros.length ? "Search again" : "Find pros"}
        </button>
      </form>

      {job.pros.length > 0 && (
        <>
          <p className="job-muted">When are you free? Helpa adds it to the message.</p>
          <div className="job-chips">
            {options.map((option) => (
              <button
                key={option.at}
                className={`chip press ${slots.includes(option.at) ? "chip-on" : ""}`}
                aria-pressed={slots.includes(option.at)}
                onClick={() => setSlots((current) => (current.includes(option.at) ? current.filter((at) => at !== option.at) : [...current, option.at].slice(-3)))}
              >
                {option.label}
              </button>
            ))}
          </div>
          <ul className="job-pros">
            {job.pros.map((pro) => {
              const digits = pro.phone.replace(/[^\d+]/g, "");
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
                    {digits && (
                      <a className="btn btn-secondary btn-small press" href={`tel:${digits}`} onClick={() => run("contact", () => markContacted(job.id, pro.name))}>
                        Call
                      </a>
                    )}
                    {digits && (
                      <a className="btn btn-secondary btn-small press" href={`sms:${digits}?&body=${encodeURIComponent(message())}`} onClick={() => run("contact", () => markContacted(job.id, pro.name))}>
                        Text
                      </a>
                    )}
                    {pro.website && (
                      <a className="btn btn-secondary btn-small press" href={pro.website} target="_blank" rel="noreferrer">
                        Website
                      </a>
                    )}
                    <button className="btn btn-primary btn-small press" onClick={() => setBooking(pro)}>
                      Booked
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
    </article>
  );
}
