import type { Metadata } from "next";
import Link from "next/link";
import QrCode from "./components/landing/QrCode";
import StoryPlayer, { type Scene } from "./components/landing/StoryPlayer";
import { story } from "./components/landing/story";
import "./landing.css";

export const metadata: Metadata = {
  title: "Helpa: fix anything in your home",
  description: "Snap what's broken. Helpa shows every move on a 3D model of your machine, then on the machine itself through your camera, and handles the part and the pro.",
};

const scenes: Scene[] = story;

const models = [
  ["Muse Spark 1.3", "works out what's wrong, writes the steps and checks your work from the camera"],
  ["Muse Wonder 1.0 + web search", "finds your exact model, the right part and where to buy it, and pros near you"],
  ["SAM 3.1", "finds the part in your camera so the hologram lands on it"],
  ["Muse Image 1.0", "draws the fix on your own photo"],
  ["Muse Voice Transcribe", "lets you just say what's wrong, and talk to Helpa hands-free"],
  ["Muse Spark Open", "the open-weights model, checks each step"],
];

const proof = [
  ["49/50", "real problems matched to the right machine"],
  ["8/8", "dangerous ones (gas, live wiring, airbags) sent to a pro"],
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
            <h1>
              Fix anything in your home. <span>Even if you know nothing.</span>
            </h1>
            <p className="lp-lede">Snap what&apos;s broken. Helpa shows you every move on a 3D model of your machine, then on the machine itself through your camera, and checks you got it right.</p>
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
            <p className="lp-fine">Free, no account, no app store.</p>
          </div>
          <StoryPlayer src="/landing/story.mp4" poster="/landing/story-poster.jpg" scenes={scenes} label="A dryer that won't dry, fixed with Helpa: a photo, the steps in pictures, the move in 3D, the move on the real dryer, and Helpa checking the work" />
        </section>

        <section className="lp-section lp-split">
          <div className="lp-split-copy">
            <h2>Can&apos;t fix it yourself? Helpa still gets it done.</h2>
            <p>If it needs a part, Helpa finds the exact one for your model, and once you&apos;ve ordered it, watches the delivery and tells you when it lands.</p>
            <p>If it needs a pro, Helpa finds the best-reviewed ones near you, texts them the times you&apos;re free, and hands them everything it knows so you don&apos;t pay to diagnose it twice.</p>
          </div>
          <div className="lp-phone lp-phone-side">
            <div className="lp-phone-screen">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/landing/job.webp" alt="A dryer job in Helpa: the part is on its way and Helpa is watching the delivery" loading="lazy" />
            </div>
          </div>
        </section>

        <section className="lp-section lp-facts">
          <div>
            <h2>Built on Meta&apos;s models</h2>
            <ul className="lp-models">
              {models.map(([name, role]) => (
                <li key={name}>
                  <strong>{name}</strong> {role}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Tested on 50 real problems</h2>
            <ul className="lp-proof">
              {proof.map(([value, label]) => (
                <li key={label}>
                  <strong>{value}</strong>
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-section lp-try">
          <div>
            <h2>Try it in a minute</h2>
            <ol>
              <li>
                Open Helpa, tap <strong>Dryer</strong> under <strong>Or pick it</strong>, then <strong>Spins but no heat</strong>.
              </li>
              <li>
                Tap <strong>Let&apos;s start</strong>. Point your camera at any dryer and tap <strong>Show me on my camera</strong>.
              </li>
              <li>
                Tap <strong>Still broken</strong> until Helpa calls for a part, open the job, and order it with tracking number <strong>DEMO</strong>. It arrives in 90 seconds.
              </li>
            </ol>
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
