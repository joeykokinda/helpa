import type { Metadata } from "next";
import Link from "next/link";
import QrCode from "./components/landing/QrCode";
import StoryPlayer, { type Scene } from "./components/landing/StoryPlayer";
import { story } from "./components/landing/story";
import "./landing.css";

export const metadata: Metadata = {
  title: "Helpa: fix what's broken at home",
  description:
    "Snap what's broken. Helpa works out your machine, shows each step on a 3D model, checks your work from a photo, and finds the exact part or a fair-priced pro when it's beyond you.",
};

const scenes: Scene[] = story;

type Shot = { src: string; alt: string };
type Stage = { kicker: string; title: string; body: string; shots: Shot[] };

/** The whole fix, in the order you live it. Every picture is the live app on a phone. */
const stages: Stage[] = [
  {
    kicker: "Show it or say it",
    title: "Snap it, say it, or pick it.",
    body: "Point your phone at the broken thing or its model sticker, hold to talk, or pick it from a list. You can circle the problem on your photo. Picking from the list still asks for a photo, because the fix should be for your machine, but you can skip it and get the general fix.",
    shots: [
      { src: "/landing/shots/camera.webp", alt: "Helpa's camera pointed at a front-load dryer" },
      { src: "/landing/shots/describe.webp", alt: "The photo added and the problem typed in: the clothes come out still wet" },
    ],
  },
  {
    kicker: "Agents at work",
    title: "Several agents work on it at once.",
    body: "Muse Spark works out what the machine is. Then the rest runs side by side: Muse Wonder searches the web for the manual and writes your steps (unless Helpa's library already has the fix), the 3D model is built and animated, and SAM 3.1 finds the parts on your photo. Median time to a plan: 4.5 seconds from the library, 22.5 seconds when researched.",
    shots: [{ src: "/landing/shots/working.webp", alt: "Helpa is on it: figuring out what it is, finding the fix, building your 3D model, spotting parts on your photo" }],
  },
  {
    kicker: "Your plan",
    title: "What's wrong, in one line.",
    body: "Helpa tells you why it broke before telling you what to do, and links the maker's manual. Muse Image redraws your photo as a repair diagram with the part circled. Safety notes come before the first step.",
    shots: [
      { src: "/landing/shots/plan.webp", alt: "Plan: your lint screen is choking the airflow" },
      { src: "/landing/shots/drawn.webp", alt: "The dryer photo redrawn with the lint screen circled, and the safety card" },
    ],
  },
  {
    kicker: "Every move in 3D",
    title: "Each step plays on a 3D model.",
    body: "Lint screens slide out, filters twist off, drain plugs unscrew. You can see inside too, like hot air backing up behind a clogged lint screen. Helpa reads each step out loud. Turn on hands-free and say \u201cnext\u201d, \u201cback\u201d or \u201crepeat\u201d when your hands are full.",
    shots: [
      { src: "/landing/shots/step-airflow.webp", alt: "3D dryer showing hot air stuck at the lint screen" },
      { src: "/landing/shots/step-lint.webp", alt: "3D dryer with the lint screen sliding up" },
    ],
  },
  {
    kicker: "I'm stuck",
    title: "Stuck? Ask, or send a photo.",
    body: "Ask about the step you're on, typed or out loud, and Helpa answers for your machine. Or snap what you did and it tells you if it's right, and what to change if it isn't. If it's too much, hand it to a pro.",
    shots: [{ src: "/landing/shots/stuck.webp", alt: "I'm stuck: Ask Helpa, Check what I did, Hand it to a pro" }],
  },
  {
    kicker: "Still broken?",
    title: "Still broken? It tries the next cause.",
    body: "Test it. If it still doesn't work, Helpa crosses that cause off and moves to the next most likely one: for a dryer, the lint screen, then the vent, then the thermal fuse. When the fix means 240-volt wiring, gas or refrigerant, it stops and tells you to call a pro.",
    shots: [
      { src: "/landing/shots/next-cause.webp", alt: "Not a clogged lint screen. Next most likely: lint packed in the vent hose" },
      { src: "/landing/shots/safety.webp", alt: "Thermal fuse, with a safety card: the back panel is near 240-volt wiring, leave it to a pro" },
    ],
  },
];

type Track = { title: string; steps: string[]; shots: Shot[]; note: string };

const tracks: Track[] = [
  {
    title: "Needs a part?",
    steps: [
      "Finds the part number for your model, marked exact match or likely match.",
      "Shows stores that sell it, with prices and links, from a live web search.",
      "Tracks the order until it arrives, then opens the 3D guide to install it.",
    ],
    shots: [
      { src: "/landing/shots/part.webp", alt: "Toyota oil filter element 04152-YZZA1, exact match, with store prices" },
      { src: "/landing/shots/arrived.webp", alt: "Ordered, shipped, out for delivery, arrived. Your part is here. Install it now." },
    ],
    note: "Buying is a demo: the order tracker plays through in about five seconds.",
  },
  {
    title: "Needs a pro?",
    steps: [
      "Finds well-reviewed local shops for the repair, with ratings and why each one fits.",
      "Looks up what the repair should cost near you, with sources and red flags.",
      "Writes the message for you: what's wrong, what you ruled out, the part, the fair price.",
      "After the visit, tell Helpa what the tech said. It updates the job and checks the quote.",
    ],
    shots: [
      { src: "/landing/shots/pros.webp", alt: "Four local appliance repair shops with ratings" },
      { src: "/landing/shots/fair-price.webp", alt: "Fair price: $75 to $350, with what it covers" },
    ],
    note: "The shops, ratings and prices are real. You text or call them from your phone. Helpa sending the message for you is a demo with a sample reply.",
  },
];

const models: { name: string; does: string }[] = [
  { name: "Muse Spark", does: "Works out the machine, reads model stickers and VINs, builds and animates the 3D model, answers your questions, checks your work from a photo, and reads what the pro said." },
  { name: "Muse Wonder + web search", does: "Researches the manual and writes the steps, finds the part and the stores, finds local pros, and looks up a fair price." },
  { name: "SAM 3.1", does: "Finds the parts on your photo, and the model sticker on the live camera." },
  { name: "Muse Image", does: "Redraws your photo as a repair diagram with the part circled." },
  { name: "Muse Voice Transcribe", does: "Hold to talk: the problem, your questions, and what the tech told you." },
];

const stats: { value: string; label: string }[] = [
  { value: "49/50", label: "named the right appliance" },
  { value: "8/8", label: "dangerous cases sent to a pro" },
  { value: "3×", label: "fewer words than a plain chatbot" },
  { value: "4.5 s", label: "median to a plan from the library" },
];

const honest: { real: string; demo: string }[] = [
  { real: "Machine, manual, plan, 3D model and photo checks", demo: "" },
  { real: "Part numbers, stores and prices", demo: "Buying: the order tracker plays through in about 5 seconds" },
  { real: "Local pros, ratings and fair prices", demo: "Helpa messaging a pro for you: a sample reply" },
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
              Fix what&apos;s broken. <span>Even if you know nothing.</span>
            </h1>
            <p className="lp-lede">Snap it and follow each step in 3D. If it&apos;s too much, Helpa finds the part or a pro at a fair price.</p>
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
          <p className="lp-stats-note">50 household problems typed into the live pipeline (no photos); the chatbot comparison uses 10 of them. Method and raw runs are in the repo.</p>
        </section>

        <section className="lp-section" id="how">
          <div className="lp-heading">
            <p className="lp-kicker">How it works</p>
            <h2>From &ldquo;it&apos;s broken&rdquo; to fixed.</h2>
            <p>Helpa&apos;s library has ready fixes for 16 everyday things, from toilets and dryers to your car&apos;s oil. For anything else, it researches the fix on the web and builds a 3D model as it goes.</p>
          </div>
          <ol className="lp-stages">
            {stages.map((stage, index) => (
              <li key={stage.title} className="lp-stage">
                <div className="lp-stage-copy">
                  <div className="lp-stage-head">
                    <span className="lp-level-number">{index + 1}</span>
                    <p className="lp-kicker">{stage.kicker}</p>
                  </div>
                  <h3>{stage.title}</h3>
                  <p>{stage.body}</p>
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
            <h2>The right part, or a pro at a fair price.</h2>
            <p>Each fix becomes a job that keeps what&apos;s wrong, what you ruled out, the part, the pro and the price, so you don&apos;t have to explain it twice.</p>
          </div>
          <div className="lp-tracks">
            {tracks.map((track) => (
              <article key={track.title} className="lp-track">
                <h3>{track.title}</h3>
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
            <p className="lp-kicker">Your car</p>
            <h2>Works on your car too.</h2>
            <p>Snap the VIN plate and Helpa reads it. For an oil change on a 2015 Toyota Camry 2.5L, that means 4.6 US quarts of 0W-20 with the filter, a 14 mm drain plug and filter element 04152-YZZA1. The 3D car shows where the oil drains out.</p>
          </div>
          <div className="lp-stage-shots lp-shots-2">
            <Phone shot={{ src: "/landing/shots/car-plan.webp", alt: "Plan for a 2015 Toyota Camry 2.5L oil change: 4.6 quarts of 0W-20 with the filter" }} />
            <Phone shot={{ src: "/landing/shots/car-drain.webp", alt: "3D Camry: drain the oil from the 14 mm plug" }} />
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-heading">
            <p className="lp-kicker">My Home</p>
            <h2>Helpa remembers your machines.</h2>
            <p>Each machine you fix is saved with its model, past fixes, your photos and care reminders, like cleaning the dryer vent once a year. Later you can ask about it: &ldquo;What oil did I use?&rdquo; There&apos;s no account. Machines stay on your phone; open jobs are kept on Helpa&apos;s server under an anonymous ID.</p>
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
            <p className="lp-band-note">
              A Go backend identifies the machine, then runs research, the 3D model and finding the parts on your photo in parallel, streaming each one&apos;s progress to the phone. Library fixes with hand-built 3D rigs need no model calls; anything else is researched live. The public demo has rate limits and a daily spending cap. Once the cap is hit, it plays recorded runs until the next day.
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
                  <td>{row.demo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="lp-section lp-try">
          <div>
            <h2>Try it in a minute</h2>
            <p className="lp-path">
              <strong>Dryer</strong> → <strong>Clothes still damp</strong> → snap your dryer (or <strong>No photo? Show the general fix</strong>) →{" "}
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
