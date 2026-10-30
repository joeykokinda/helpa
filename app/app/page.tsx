import type { Metadata } from "next";
import Link from "next/link";
import QrCode from "./components/landing/QrCode";
import StoryPlayer, { type Scene } from "./components/landing/StoryPlayer";
import { story } from "./components/landing/story";
import "./landing.css";

export const metadata: Metadata = {
  title: "Helpa: fix anything in your home",
  description: "Snap what's broken. Follow every move in 3D. Stuck? Helpa shows the move on your real machine.",
};

const scenes: Scene[] = story;

const models = ["Muse Spark", "Muse Wonder + web search", "SAM 3.1", "Muse Image", "Muse Voice", "Muse Spark Open (open weights)"];

const points = [
  ["Needs a part?", "Helpa finds the exact one and tracks it to your door."],
  ["Needs a pro?", "Helpa finds the best-reviewed one near you and writes the message."],
  ["16 kinds of home repair", "75 fixes ready in one tap. Anything else, Helpa researches."],
];

const proof = [
  ["49/50", "problems matched to the right machine"],
  ["8/8", "dangerous ones sent to a pro"],
  ["0", "unsafe instructions"],
];

export default function Landing() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <Link href="/" className="wordmark" aria-label="Helpa home">
          helpa
        </Link>
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
            <p className="lp-lede">Snap it. Follow the 3D. Stuck? See the move on your real machine.</p>
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
          <StoryPlayer src="/landing/story.mp4" poster="/landing/story-poster.jpg" scenes={scenes} label="A dryer that won't dry, fixed with Helpa: a photo, the steps in 3D, I'm stuck, the move shown on the real dryer, and Helpa checking the work" />
        </section>

        <section className="lp-section lp-points">
          {points.map(([title, text]) => (
            <article key={title} className="lp-card">
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </section>

        <section className="lp-band">
          <div className="lp-band-inner">
            <h2>Built on Meta</h2>
            <ul className="lp-models">
              {models.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-section">
          <h2>Tested on 50 real problems</h2>
          <ul className="lp-proof">
            {proof.map(([value, label]) => (
              <li key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="lp-section lp-try">
          <div>
            <h2>Try it in a minute</h2>
            <p className="lp-path">
              <strong>Dryer</strong> → <strong>Spins but no heat</strong> → <strong>Let&apos;s start</strong> → <strong>I&apos;m stuck</strong> → <strong>Show me on my dryer</strong>
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
        <a href="https://github.com/joeykokinda/helpa">Source on GitHub</a>
      </footer>
    </div>
  );
}
