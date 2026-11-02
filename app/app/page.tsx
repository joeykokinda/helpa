import type { Metadata } from "next";
import Link from "next/link";
import Helpa, { type HelpaMood } from "./components/Helpa";
import QrCode from "./components/landing/QrCode";
import StoryPlayer, { type Scene } from "./components/landing/StoryPlayer";
import { story } from "./components/landing/story";
import "./landing.css";

export const metadata: Metadata = {
  title: "Helpa: fix anything in your home",
  description:
    "Snap what's broken. Helpa finds your exact machine, shows every move in 3D, checks your work, and when it's beyond you, finds the exact part or a fair-priced pro.",
};

const scenes: Scene[] = story;

type Shot = { src: string; alt: string };
type Stage = { kicker: string; title: string; body: string; points: string[]; shots: Shot[]; mood: HelpaMood };

/** The whole fix, in the order you live it. Every picture is the live app on a phone. */
const stages: Stage[] = [
  {
    kicker: "Show it or say it",
    title: "Snap it, say it, or pick it.",
    body: "Point your phone at the broken thing or its model sticker, hold to talk, or pick from 16 everyday things. Picking still asks for a photo, because every dryer is different and the fix should be for yours.",
    points: ["Reads model stickers and VINs", "Circle the problem on your photo", "Hold to talk, or type"],
    shots: [
      { src: "/landing/shots/camera.webp", alt: "Helpa's camera pointed at a front-load dryer" },
      { src: "/landing/shots/describe.webp", alt: "The photo added and the problem typed in" },
    ],
    mood: "listening",
  },
  {
    kicker: "Agents at work",
    title: "A team works on it at once.",
    body: "Identifying the machine, researching its manual on the web, building its 3D model, spotting the parts on your photo and writing your steps all run in parallel. A known fix is ready in about 4 seconds; a researched one in about 20.",
    points: ["Muse Spark identifies and plans", "Muse Wonder searches the web for the manual", "SAM 3.1 finds the parts on your photo"],
    shots: [{ src: "/landing/shots/working.webp", alt: "Helpa working: figuring out what it is, finding the fix, building the 3D model" }],
    mood: "searching",
  },
  {
    kicker: "Your plan",
    title: "What's wrong, in one line. Drawn on your own photo.",
    body: "Helpa tells you why it broke before telling you what to do, links the maker's manual, and Muse Image redraws your photo as a repair diagram with the part circled. Safety comes first, every time.",
    points: ["Cause in one sentence", "Your photo, redrawn as a diagram", "Safety first, in yellow"],
    shots: [
      { src: "/landing/shots/plan.webp", alt: "Plan: your lint screen is choking the airflow" },
      { src: "/landing/shots/drawn.webp", alt: "The dryer photo redrawn with the lint screen circled, and the safety card" },
    ],
    mood: "explaining",
  },
  {
    kicker: "Every move in 3D",
    title: "A 3D twin of your machine, with real joints.",
    body: "Each step plays on a model of your machine: lint screens slide, filters twist then lift, drain plugs unscrew. You see what's happening inside, like hot air backing up at a clogged screen. Every step is read out loud; say “next” when your hands are full.",
    points: ["Real joints and moves", "See inside: airflow, oil, water", "Hands-free: next, back, repeat"],
    shots: [
      { src: "/landing/shots/step-airflow.webp", alt: "3D dryer showing hot air stuck at the lint screen" },
      { src: "/landing/shots/step-lint.webp", alt: "3D dryer with the lint screen sliding up" },
    ],
    mood: "pointing",
  },
  {
    kicker: "I'm stuck",
    title: "Stuck? Ask, or show Helpa what you did.",
    body: "Ask Helpa anything about this exact step on your exact machine, typed or out loud. Or snap what you did, and it tells you whether you got it right, with a specific correction if you didn't. The animation ending never counts as you finishing.",
    points: ["Answers about this step, out loud", "Checks your work from a photo", "Or hand it to a pro"],
    shots: [
      { src: "/landing/shots/stuck.webp", alt: "I'm stuck: Ask Helpa, Check what I did, Hand it to a pro" },
      { src: "/landing/shots/ask.webp", alt: "Ask Helpa: which way does it go? Straight up, by the tab." },
    ],
    mood: "explaining",
  },
  {
    kicker: "Still broken?",
    title: "It doesn't give up. It goes to the next cause.",
    body: "Test it. If it's still broken, Helpa rules that cause out and moves to the next most likely one: lint screen, then the vent, then the thermal fuse. When the fix means 240-volt wiring, gas or refrigerant, it stops and says this one's for a pro.",
    points: ["Branches to the next likely cause", "Remembers what you ruled out", "Stops for anything dangerous"],
    shots: [
      { src: "/landing/shots/next-cause.webp", alt: "Not a clogged lint screen. Next most likely: the vent hose" },
      { src: "/landing/shots/safety.webp", alt: "Thermal fuse, with a safety-first card about 240-volt wiring" },
    ],
    mood: "worried",
  },
];

type Track = { title: string; mood: HelpaMood; steps: string[]; shots: Shot[]; note: string };

const tracks: Track[] = [
  {
    title: "Needs a part?",
    mood: "found",
    steps: [
      "Finds the exact part number for your model, marked exact match or likely match.",
      "Real stores, real prices, real links, searched live on the web.",
      "Buy it, and Helpa tracks the order: ordered, shipped, out for delivery, here.",
      "The moment it lands: “Your part is here” and Install it now opens the 3D guide.",
    ],
    shots: [
      { src: "/landing/shots/part.webp", alt: "Toyota oil filter element 04152-YZZA1, exact match, with store prices" },
      { src: "/landing/shots/arrived.webp", alt: "Ordered, shipped, out for delivery, arrived. Your part is here. Install it now." },
    ],
    note: "Buying is a demo: the tracker plays through in five seconds. Store checkout can be connected later.",
  },
  {
    title: "Needs a pro?",
    mood: "celebrate",
    steps: [
      "Finds the best-reviewed local shops for the right trade, with ratings and why each one fits.",
      "Checks what the repair should cost near you, with sources and red flags, so nobody overcharges you.",
      "Writes the message: what's wrong, what you already ruled out, the part, when you're free, the fair price.",
      "With your permission it reaches out, checks the quote against the fair price, and books the visit.",
      "After the visit, tell Helpa what the tech said. It updates the job and checks the price.",
    ],
    shots: [
      { src: "/landing/shots/pros.webp", alt: "Four local appliance repair shops with ratings" },
      { src: "/landing/shots/fair-price.webp", alt: "Fair price: $75 to $350, with what it covers" },
      { src: "/landing/shots/reply.webp", alt: "The shop's quote, within the fair range, with Accept" },
      { src: "/landing/shots/pro-said.webp", alt: "What did the pro say: thermal fuse #279973, quoted $140, fair" },
    ],
    note: "The shops and prices are real. Texting or calling from your phone works today; Helpa reaching out for you is a demo reply.",
  },
];

const models: { name: string; does: string }[] = [
  { name: "Muse Spark", does: "Identifies the machine, reads stickers and VINs, writes the plan, answers your questions, checks your work from a photo, and reads what the pro said." },
  { name: "Muse Wonder + web search", does: "Researches the manual, finds the exact part with live store prices, finds local pros, and checks what a repair should cost." },
  { name: "SAM 3.1", does: "Finds the parts on your photo and the model sticker on the live camera." },
  { name: "Muse Image", does: "Redraws your own photo as a repair diagram with the part circled." },
  { name: "Muse Voice Transcribe", does: "Hold to talk: the problem, your questions, and what the tech told you." },
];

const stats: { value: string; label: string }[] = [
  { value: "49/50", label: "real problems identified right" },
  { value: "8/8", label: "dangerous cases sent to a pro" },
  { value: "3×", label: "less to read than a chatbot" },
  { value: "~4 s", label: "to a plan for a known fix" },
];

const honest: { real: string; demo: string }[] = [
  { real: "Machine, manual, plan, 3D model and photo checks", demo: "" },
  { real: "Exact part numbers, stores and prices", demo: "Buying: the delivery plays through in 5 seconds" },
  { real: "Local pros, ratings and fair prices", demo: "Helpa reaching out for you: a sample reply" },
  { real: "Texting or calling a pro from your phone", demo: "" },
];

function Phone({ shot, className = "" }: { shot: Shot; className?: string }) {
  return (
    <figure className={`lp-phone lp-shot ${className}`}>
      <div className="lp-phone-screen">
        {/* Static screenshots of the live app; next/image adds nothing for these. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shot.src} alt={shot.alt} loading="lazy" decoding="async" />
      </div>
    </figure>
  );
}

export default function Landing() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <Link href="/" className="wordmark" aria-label="Helpa home">
          helpa
        </Link>
        <nav className="lp-links" aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#parts-pros">Parts and pros</a>
          <a href="#meta">Built on Meta</a>
        </nav>
        <Link href="/app" className="lp-btn lp-btn-dark lp-btn-sm">
          Open Helpa
        </Link>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow">
              <span className="lp-pulse" aria-hidden="true" /> Your home repair helper
            </p>
            <h1>
              Fix anything in your home. <span>Even if you know nothing.</span>
            </h1>
            <p className="lp-lede">Snap it. Follow every move in 3D. Too much? Helpa gets you the exact part or a fair-priced pro.</p>
            <div className="lp-cta">
              <Link href="/app" className="lp-btn lp-btn-primary lp-btn-lg">
                Try it now
              </Link>
              <div className="lp-qr">
                <QrCode size={76} />
                <span>
                  <strong>On your phone</strong>
                  Scan to open Helpa
                </span>
              </div>
            </div>
          </div>
          <StoryPlayer src="/landing/story.mp4" poster="/landing/story-poster.jpg" scenes={scenes} label="A dryer that won't dry, fixed with Helpa: a photo, the plan, each step in 3D, fixed" />
        </section>

        <section className="lp-section lp-stats-wrap" aria-label="Tested on real problems">
          <ul className="lp-stats">
            {stats.map((stat) => (
              <li key={stat.label}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </li>
            ))}
          </ul>
          <p className="lp-stats-note">From 50 real household problems run through the live app. Method and raw runs in the repo.</p>
        </section>

        <section className="lp-section" id="how">
          <div className="lp-heading">
            <p className="lp-kicker">How it works</p>
            <h2>From &ldquo;it&apos;s broken&rdquo; to fixed, one step at a time.</h2>
            <p>Washers, dryers, dishwashers, fridges, sinks, toilets, furnaces, outlets, your car&apos;s oil, and anything else: if it&apos;s not in the library, Helpa researches it and builds the 3D model on the spot.</p>
          </div>
          <ol className="lp-stages">
            {stages.map((stage, index) => (
              <li key={stage.title} className="lp-stage">
                <div className="lp-stage-copy">
                  <div className="lp-stage-head">
                    <span className="lp-level-number">{index + 1}</span>
                    <p className="lp-kicker">{stage.kicker}</p>
                    <Helpa mood={stage.mood} size={52} />
                  </div>
                  <h3>{stage.title}</h3>
                  <p>{stage.body}</p>
                  <ul className="lp-points">
                    {stage.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </div>
                <div className={`lp-stage-shots lp-shots-${stage.shots.length}`}>
                  {stage.shots.map((shot) => (
                    <Phone key={shot.src} shot={shot} />
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-section" id="parts-pros">
          <div className="lp-heading">
            <p className="lp-kicker">When it&apos;s beyond you</p>
            <h2>The right part, or the right pro at a fair price.</h2>
            <p>Every fix becomes a job that Helpa keeps moving: what&apos;s wrong, what you ruled out, the part, the pro, the price. Nobody charges you to figure it out twice.</p>
          </div>
          <div className="lp-tracks">
            {tracks.map((track) => (
              <article key={track.title} className="lp-track">
                <div className="lp-track-head">
                  <h3>{track.title}</h3>
                  <Helpa mood={track.mood} size={60} />
                </div>
                <ol className="lp-track-steps">
                  {track.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <div className={`lp-track-shots lp-shots-${track.shots.length}`}>
                  {track.shots.map((shot) => (
                    <Phone key={shot.src} shot={shot} />
                  ))}
                </div>
                <p className="lp-track-note">{track.note}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-section lp-split">
          <div className="lp-split-copy">
            <p className="lp-kicker">Your exact machine</p>
            <h2>Works on your car too.</h2>
            <p>Snap the VIN or the engine bay and Helpa knows it&apos;s a 2015 Toyota Camry 2.5L: 0W-20, 4.6 quarts with the filter, a 14 mm drain plug, cartridge filter 04152-YZZA1. The 3D car shows where the oil drains and the filter drips.</p>
          </div>
          <div className="lp-stage-shots lp-shots-3">
            <Phone shot={{ src: "/landing/shots/car-plan.webp", alt: "Plan for a 2015 Toyota Camry 2.5L oil change" }} />
            <Phone shot={{ src: "/landing/shots/car-drain.webp", alt: "3D Camry: drain the oil from the 14 mm plug" }} />
            <Phone shot={{ src: "/landing/shots/car-filter.webp", alt: "3D Camry: swap the cartridge filter" }} />
          </div>
        </section>

        <section className="lp-section lp-split lp-split-flip">
          <div className="lp-split-copy">
            <p className="lp-kicker">My Home</p>
            <h2>Helpa remembers your home.</h2>
            <p>Every machine you fix is saved with its model, its history, your photos and care reminders. Open jobs show what Helpa is waiting on. Come back months later and ask: &ldquo;What oil did I use?&rdquo; No account; it lives on your phone.</p>
          </div>
          <div className="lp-stage-shots lp-shots-2">
            <Phone shot={{ src: "/landing/shots/home.webp", alt: "Home: what needs fixing, open jobs, and the pick-it grid" }} />
            <Phone shot={{ src: "/landing/shots/outcome.webp", alt: "Did that fix it? What we've checked" }} />
          </div>
        </section>

        <section className="lp-band" id="meta">
          <div className="lp-band-inner">
            <p className="lp-kicker">Under the hood</p>
            <h2>Built on Meta</h2>
            <ul className="lp-model-cards">
              {models.map((model) => (
                <li key={model.name}>
                  <strong>{model.name}</strong>
                  <span>{model.does}</span>
                </li>
              ))}
            </ul>
            <ol className="lp-pipeline" aria-label="How a fix is made">
              <li>Photo, words or sticker</li>
              <li>Identify</li>
              <li>Manual, 3D model, parts on the photo, in parallel</li>
              <li>Plan with steps and safety</li>
              <li>3D guide, questions, photo checks</li>
              <li>Next cause, part or pro</li>
            </ol>
            <p className="lp-band-note">
              A Go backend runs the agents in parallel and streams each one&apos;s progress to the phone. A library of hand-built fixes and 3D rigs answers common problems with no model calls; anything else is researched live. Rate limits and a daily budget keep the public demo up, and a set of recorded real runs plays when it rests.
            </p>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-heading">
            <p className="lp-kicker">Straight answers</p>
            <h2>What&apos;s real, and what&apos;s a demo.</h2>
          </div>
          <table className="lp-honest">
            <thead>
              <tr>
                <th scope="col">Real, live today</th>
                <th scope="col">Demo, can be connected later</th>
              </tr>
            </thead>
            <tbody>
              {honest.map((row) => (
                <tr key={row.real}>
                  <td>{row.real}</td>
                  <td>{row.demo || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="lp-section lp-try">
          <div>
            <h2>Try it in a minute</h2>
            <p className="lp-path">
              <strong>Dryer</strong> → <strong>Spins but no heat</strong> → snap your dryer (or <strong>No photo? Show the general fix</strong>) →{" "}
              <strong>Let&apos;s start</strong> → <strong>I&apos;m stuck</strong> → <strong>Hand it to a pro</strong>
            </p>
            <Link href="/app" className="lp-btn lp-btn-primary lp-btn-lg">
              Try it now
            </Link>
          </div>
          <div className="lp-try-qr">
            <QrCode size={168} />
            <span>Scan to open on your phone</span>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <span className="wordmark">helpa</span>
        <span className="lp-footer-note">Built solo for the Meta Global AI Developer Hackathon</span>
        <a href="https://github.com/joeykokinda/helpa">Source on GitHub</a>
      </footer>
    </div>
  );
}
