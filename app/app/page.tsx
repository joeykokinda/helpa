import type { Metadata } from "next";
import Link from "next/link";
import Icon, { type IconName } from "./components/Icons";
import QrCode from "./components/landing/QrCode";
import "./landing.css";

export const metadata: Metadata = {
  title: "Helpa: fix anything in your home",
  description: "Snap what's broken. Helpa shows every move on a 3D model of your machine, then on the machine itself through your camera, and handles the part and the pro.",
};

const steps = [
  {
    image: "/landing/plan.webp",
    title: "See the whole fix first",
    text: "Helpa works out what's wrong and draws every step from a 3D model of your machine. The part you touch is always orange.",
  },
  {
    image: "/landing/step.webp",
    title: "Follow it in 3D",
    text: "Each move plays on the model: lift, twist, pull. Spin it, replay it, slow it down. Helpa reads it out so your hands stay free.",
  },
  {
    image: "/landing/ar.webp",
    title: "Then on your real machine",
    text: "Point your camera. Helpa finds the part and plays the move right on it, then watches you do it and tells you if it's done.",
  },
  {
    image: "/landing/job.webp",
    title: "Helpa handles the rest",
    text: "Needs a part? It finds the exact one and tracks it to your door. Needs a pro? It finds the best-reviewed ones near you.",
  },
];

const things: { icon: IconName; label: string }[] = [
  { icon: "washer_front", label: "Washer" },
  { icon: "dryer", label: "Dryer" },
  { icon: "dishwasher", label: "Dishwasher" },
  { icon: "fridge", label: "Fridge" },
  { icon: "range", label: "Oven and stove" },
  { icon: "microwave", label: "Microwave" },
  { icon: "disposal", label: "Disposal" },
  { icon: "sink", label: "Sink" },
  { icon: "toilet", label: "Toilet" },
  { icon: "shower", label: "Shower" },
  { icon: "hvac", label: "Heat and AC" },
  { icon: "outlet", label: "Outlets and breakers" },
  { icon: "smoke_alarm", label: "Smoke alarm" },
  { icon: "door", label: "Doors" },
  { icon: "car", label: "Car oil change" },
  { icon: "sparkle", label: "Anything else" },
];

const afterwards: { icon: IconName; title: string; text: string }[] = [
  { icon: "tag", title: "The right part", text: "Matched to your model number, with where to buy it. Tell Helpa you ordered it and it watches the delivery and pings you when it lands." },
  { icon: "wrench", title: "A good pro", text: "The best-reviewed pros near you, open now. Call or text in one tap with times you're free, and it goes on your calendar." },
  { icon: "book", title: "A record of it all", text: "What's wrong, what you ruled out, the part number. Show it to the pro so nobody charges you to figure it out again." },
];

const models = [
  { name: "Muse Spark 1.3", role: "Works out what's wrong, writes the plan, checks each step from a photo, reads your tracking updates." },
  { name: "Muse Wonder 1.0 + web search", role: "Finds your exact model, the right part and where to buy it, and the best pros near you." },
  { name: "SAM 3.1", role: "Finds the part in your camera, so the hologram lands on the real thing." },
  { name: "Muse Image 1.0", role: "Draws the fix on your own photo of the machine." },
  { name: "Muse Voice Transcribe", role: "Lets you just say what's wrong, and talk to Helpa hands-free." },
  { name: "Muse Spark Open", role: "The open-weights model checks your work, on Baseten." },
];

const proof = [
  { value: "49/50", label: "real problems matched to the right machine" },
  { value: "8/8", label: "dangerous cases (gas, live wiring, airbags) sent to a pro" },
  { value: "0", label: "unsafe instructions in 50 runs" },
  { value: "3×", label: "less to read than asking a chatbot" },
];

function Phone({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`lp-phone ${className}`}>
      <div className="lp-phone-screen">{children}</div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <Link href="/" className="wordmark" aria-label="Helpa home">
          helpa
        </Link>
        <nav className="lp-nav-links" aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#fixes">What it fixes</a>
          <a href="#meta">Built with Meta</a>
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
            <p className="lp-lede">
              Snap what&apos;s broken. Helpa shows every move on a 3D model of your machine, then right on the machine itself through your camera. If it needs a part or a pro, Helpa finds them and keeps track.
            </p>
            <div className="lp-cta">
              <Link href="/app" className="lp-btn lp-btn-primary lp-btn-lg">
                Try it now <Icon name="next" size={22} strokeWidth={2.4} />
              </Link>
              <div className="lp-qr">
                <QrCode size={84} />
                <span>
                  <strong>On your phone</strong>
                  Scan to open Helpa
                </span>
              </div>
            </div>
            <p className="lp-fine">Free. No account, no app store. Works in your phone&apos;s browser.</p>
          </div>

          <div className="lp-hero-visual">
            <Phone className="lp-phone-hero">
              <video src="/landing/clip.mp4" poster="/landing/clip-poster.jpg" autoPlay muted loop playsInline preload="auto" aria-label="Helpa shows a step on a 3D dryer, then plays it as a hologram on a real dryer through the camera" />
            </Phone>
            <div className="lp-float lp-float-a">
              <Icon name="cube" size={20} /> The move, in 3D
            </div>
            <div className="lp-float lp-float-b">
              <Icon name="scan" size={20} /> Then on your real dryer
            </div>
          </div>
        </section>

        <section id="how" className="lp-section">
          <div className="lp-heading">
            <p className="lp-kicker">How it works</p>
            <h2>From broken to fixed, one picture at a time.</h2>
          </div>
          <ol className="lp-steps">
            {steps.map((step, index) => (
              <li key={step.title} className="lp-step">
                <Phone>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={step.image} alt="" loading="lazy" />
                </Phone>
                <span className="lp-step-number">{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="fixes" className="lp-section">
          <div className="lp-heading">
            <p className="lp-kicker">What it fixes</p>
            <h2>16 things around the house, 75 fixes ready in one tap.</h2>
            <p>Anything else, describe it or snap it and Helpa researches your exact model.</p>
          </div>
          <ul className="lp-things">
            {things.map((thing) => (
              <li key={thing.label}>
                <Icon name={thing.icon} size={30} />
                {thing.label}
              </li>
            ))}
          </ul>
        </section>

        <section className="lp-section">
          <div className="lp-heading">
            <p className="lp-kicker">After the fix</p>
            <h2>Can&apos;t do it yourself? Helpa still gets it done.</h2>
          </div>
          <div className="lp-cards">
            {afterwards.map((card) => (
              <article key={card.title} className="lp-card">
                <span className="lp-card-icon">
                  <Icon name={card.icon} size={26} />
                </span>
                <h3>{card.title}</h3>
                <p>{card.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="meta" className="lp-band">
          <div className="lp-band-inner">
            <div className="lp-heading">
              <p className="lp-kicker">Built with Meta</p>
              <h2>Six Meta models, working together on one fix.</h2>
            </div>
            <ul className="lp-models">
              {models.map((model) => (
                <li key={model.name}>
                  <span className="lp-model-name">{model.name}</span>
                  <span className="lp-model-role">{model.role}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-heading">
            <p className="lp-kicker">Tested on 50 real problems</p>
            <h2>Knows the fix. Knows when to stop.</h2>
          </div>
          <ul className="lp-proof">
            {proof.map((item) => (
              <li key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="lp-section lp-try">
          <div className="lp-try-copy">
            <p className="lp-kicker">Try it in a minute</p>
            <h2>Nothing broken right now? Use our dryer.</h2>
            <ol>
              <li>
                Open Helpa and under <strong>Or pick it</strong>, tap <strong>Dryer</strong>, then <strong>Spins but no heat</strong>.
              </li>
              <li>
                Look over the pictures, tap <strong>Let&apos;s start</strong>, and watch a move in 3D. Point your camera at any dryer and tap <strong>Show me on my camera</strong>.
              </li>
              <li>
                Tap <strong>Still broken</strong> until Helpa calls for a part, then <strong>Find a pro near me</strong> to open the job. Find the thermal fuse, tap <strong>I ordered it</strong> and use the tracking number <strong>DEMO</strong>. It arrives in 90 seconds.
              </li>
            </ol>
            <Link href="/app" className="lp-btn lp-btn-primary lp-btn-lg">
              Try it now <Icon name="next" size={22} strokeWidth={2.4} />
            </Link>
          </div>
          <div className="lp-try-qr">
            <QrCode size={180} />
            <span>Scan to open on your phone</span>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <span className="wordmark">helpa</span>
        <span>Made with Meta&apos;s Muse models.</span>
        <a href="https://github.com/joeykokinda/helpa">Source on GitHub</a>
      </footer>
    </div>
  );
}
