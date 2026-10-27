"use client";

import ThemeToggle from "./components/ThemeToggle";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Capture from "./components/Capture";
import Helpa, { type HelpaMood } from "./components/Helpa";
import Icon from "./components/Icons";
import Onboarding, { hasOnboarded } from "./components/Onboarding";
import PartPhoto from "./components/PartPhoto";
import { checkStep, describeSearch, streamFix, type AgentEvent, type Plan, type Scene } from "./lib/api";
import { shrinkPhoto, speak, stopSpeaking } from "./lib/media";

const Scene3D = dynamic(() => import("./components/Scene3D"), {
  ssr: false,
  loading: () => <SceneSkeleton text="Building your 3D model" />,
});

/** Backend text sometimes carries em dashes; the UI reads better with commas. */
function tidy(text: string) {
  return text.replace(/\s*—\s*/g, ", ");
}

/** The bubble stays short; the full text is on the page and spoken aloud. */
function firstSentence(text: string) {
  const sentence = text.match(/^.+?[.!?](\s|$)/)?.[0]?.trim() ?? text;
  return sentence.length > 90 ? `${sentence.slice(0, 87).trimEnd()}…` : sentence;
}

function known(value: string | undefined) {
  return value && !/unknown|not visible|n\/a/i.test(value) ? tidy(value) : "";
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ponytail: static ballpark per appliance, swap for real regional pricing if it ever matters
const repairVisitCost: [RegExp, number][] = [
  [/fridge|refrigerator|freezer/i, 200],
  [/water heater|furnace|hvac|air condition/i, 250],
  [/washer|washing/i, 150],
  [/dishwasher/i, 150],
  [/dryer/i, 140],
  [/oven|range|stove|cooktop/i, 160],
  [/toilet|faucet|sink|drain|plumb/i, 175],
  [/disposal|disposer/i, 125],
  [/microwave|hood/i, 110],
];

function savedEstimate(plan: Plan | null) {
  const label = `${plan?.appliance ?? ""} ${plan?.diagnosis ?? ""}`;
  return repairVisitCost.find(([pattern]) => pattern.test(label))?.[1] ?? 120;
}

const toolEmoji: [RegExp, string][] = [
  [/screwdriver/i, "🪛"],
  [/wrench|hex|allen|key|pliers/i, "🔧"],
  [/flashlight|torch|light/i, "🔦"],
  [/towel|rag|cloth/i, "🧻"],
  [/bucket|bowl|pan|tray|container/i, "🪣"],
  [/glove/i, "🧤"],
  [/brush|toothbrush/i, "🪥"],
  [/sponge|soap|vinegar|clean/i, "🧽"],
  [/tong|tweezer/i, "🥢"],
  [/tape|measure/i, "📏"],
  [/phone|camera/i, "📱"],
];

function emojiFor(tool: string) {
  return toolEmoji.find(([pattern]) => pattern.test(tool))?.[1] ?? "🧰";
}

type Stage = "start" | "working" | "plan" | "step" | "done";
type ProgressRow = { key: string; title: string; detail: string };

const noSubscription = () => () => {};

export default function Home() {
  const firstRun = useSyncExternalStore(noSubscription, () => !hasOnboarded(), () => null);
  const [tutorial, setTutorial] = useState<"auto" | "open" | "closed">("auto");
  const [stage, setStage] = useState<Stage>("start");
  const [mood, setMood] = useState<HelpaMood>("idle");
  const [speaking, setSpeaking] = useState(false);
  const [bubble, setBubble] = useState("Point me at the broken thing, or its model sticker.");
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [libraryHit, setLibraryHit] = useState<{ brand: string; appliance: string; model_family: string } | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [activePhoto, setActivePhoto] = useState(0);
  const [partMasks, setPartMasks] = useState<Record<number, string[]>>({});
  const [stepMasks, setStepMasks] = useState<Record<number, string>>({});
  const [plan, setPlan] = useState<Plan | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [view, setView] = useState<"3d" | "photo">("3d");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{ done: boolean; feedback: string } | null>(null);
  const checkInputRef = useRef<HTMLInputElement>(null);

  const showTutorial = tutorial === "open" || (tutorial === "auto" && firstRun === true);

  const say = (text: string, nextMood: HelpaMood = "explaining", aloud = true) => {
    const clean = tidy(text);
    setBubble(firstSentence(clean));
    setMood(nextMood);
    if (aloud) speak(clean, setSpeaking);
  };

  const addRow = (row: ProgressRow) =>
    setRows((current) =>
      current.some((existing) => existing.key === row.key)
        ? current.map((existing) => (existing.key === row.key ? { ...existing, detail: row.detail || existing.detail } : existing))
        : [...current, row],
    );

  const handleEvent = (agentEvent: AgentEvent) => {
    switch (agentEvent.type) {
      case "say":
        say(agentEvent.text, "thinking");
        addRow({ key: "identify", title: "Figured out what it is", detail: "" });
        break;
      case "library":
        setLibraryHit({ brand: agentEvent.brand, appliance: agentEvent.appliance, model_family: agentEvent.model_family });
        addRow({ key: "library", title: "Found it in my library", detail: [agentEvent.brand, agentEvent.model_family].filter(Boolean).join(" ") });
        say(`I know this one! ${agentEvent.brand} ${agentEvent.appliance}.`, "found");
        break;
      case "search":
        setMood("searching");
        addRow(describeSearch(agentEvent.action));
        break;
      case "parts":
        if (agentEvent.found > 0) {
          setMood("found");
          setActivePhoto(agentEvent.photo);
          setPartMasks((current) => ({ ...current, [agentEvent.photo]: [...(current[agentEvent.photo] ?? []), agentEvent.sam] }));
          addRow({ key: `part-${agentEvent.phrase}`, title: `Spotted the ${agentEvent.phrase}`, detail: "Highlighted on your photo" });
        }
        break;
      case "plan":
        setPlan(agentEvent.plan);
        setStage("plan");
        say(agentEvent.plan.diagnosis);
        if (agentEvent.plan.safety.length) setTimeout(() => setMood("worried"), 400);
        break;
      case "model":
        setScene(agentEvent.scene);
        break;
      case "model_error":
        setSceneFailed(true);
        break;
      case "step_parts":
        if (agentEvent.found > 0) setStepMasks((current) => ({ ...current, [agentEvent.step]: agentEvent.sam }));
        break;
      case "error":
        say("Hmm, something went wrong on my end. Can we try that again?", "worried");
        setStage("start");
        break;
    }
  };

  const start = async (photos: Blob[], description: string) => {
    stopSpeaking();
    setStage("working");
    setRows([{ key: "look", title: photos.length ? "Looking at your photo" : "Understanding the problem", detail: description ? `"${firstSentence(description)}"` : "" }]);
    setLibraryHit(null);
    setActivePhoto(0);
    setPartMasks({});
    setStepMasks({});
    setPlan(null);
    setScene(null);
    setSceneFailed(false);
    setPhotoUrls(photos.map((photo) => URL.createObjectURL(photo)));
    say("Okay, let me take a look!", "thinking");
    try {
      await streamFix(photos, description, handleEvent);
    } catch {
      say("I couldn't reach my workshop. Check your connection and try again?", "worried");
      setStage("start");
    }
  };

  const step = plan?.steps[stepIndex];
  const stepPhoto = step && step.photo >= 0 ? photoUrls[step.photo] : undefined;

  const enterStep = (index: number) => {
    if (!plan) return;
    const next = plan.steps[index];
    setStepIndex(index);
    setStage("step");
    setCheckResult(null);
    setView(next.show_3d ? "3d" : "photo");
    stopSpeaking();
    say(next.instruction, "pointing");
  };

  const goToStep = (index: number) => {
    if (!plan) return;
    if (index >= plan.steps.length) {
      setStage("done");
      stopSpeaking();
      say("You did it! That's fixed. I'm proud of you.", "celebrate");
      return;
    }
    enterStep(Math.max(0, index));
  };

  const runCheck = async (file: File | undefined) => {
    if (!file || !step) return;
    setChecking(true);
    setCheckResult(null);
    say("Let me see…", "thinking", false);
    try {
      const result = await checkStep(await shrinkPhoto(file), step);
      setCheckResult(result);
      say(result.feedback, result.done ? "found" : "worried");
    } catch (error) {
      say(error instanceof Error ? error.message : "I couldn't check that, try again?", "worried");
    } finally {
      setChecking(false);
    }
  };

  const restart = () => {
    stopSpeaking();
    setStage("start");
    say("What else can I help with? Point me at it, or tell me.", "idle", false);
  };

  const openTutorial = () => {
    stopSpeaking();
    setTutorial("open");
  };

  let screen: ReactNode = null;
  if (firstRun === null) screen = null;
  else if (showTutorial) screen = <Onboarding key="tutorial" onFinish={() => setTutorial("closed")} />;
  else if (stage === "start")
    screen = (
      <Capture
        onSubmit={start}
        say={say}
        onListening={(listening) => setMood(listening ? "listening" : "idle")}
        onHelp={openTutorial}
        bubble={bubble}
        mood={mood}
        speaking={speaking}
      />
    );
  else if (stage === "working")
    screen = <Working rows={rows} libraryHit={libraryHit} photoUrl={photoUrls[activePhoto]} masks={partMasks[activePhoto] ?? []} mood={mood} speaking={speaking} bubble={bubble} />;
  else if (stage === "plan" && plan)
    screen = <PlanScreen plan={plan} mood={mood} speaking={speaking} onStart={() => enterStep(0)} onRestart={restart} onHelp={openTutorial} />;
  else if (stage === "step" && plan && step) {
    const has3d = step.show_3d && !sceneFailed;
    let visual: ReactNode;
    if (view === "3d" && has3d) visual = scene ? <Scene3D scene={scene} stepIndex={stepIndex} /> : <SceneSkeleton text="Building your 3D model" />;
    else if (stepPhoto) visual = <PartPhoto photoUrl={stepPhoto} samTexts={stepMasks[stepIndex] ? [stepMasks[stepIndex]] : []} label={step.target_part} />;
    else
      visual = (
        <div className="visual-helpa">
          <div className="hero-blob" aria-hidden="true" />
          <Helpa mood={checking ? "thinking" : "explaining"} size={150} />
          {step.target_part && <p className="visual-helpa-label">Look for the {step.target_part}</p>}
        </div>
      );

    screen = (
      <section key="step" className="screen step" aria-label={`Step ${stepIndex + 1}`}>
        <div className="topbar">
          <button className="icon-button press" onClick={() => setStage("plan")} aria-label="Back to the plan">
            <Icon name="close" />
          </button>
          <div className="progress" role="progressbar" aria-label="Steps done" aria-valuemin={0} aria-valuemax={plan.steps.length} aria-valuenow={stepIndex + 1}>
            <motion.span className="progress-fill" initial={false} animate={{ width: `${((stepIndex + 1) / plan.steps.length) * 100}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
          </div>
          <span className="progress-count">
            {stepIndex + 1}/{plan.steps.length}
          </span>
        </div>

        <div className="screen-body">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={stepIndex} className="step-content" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25, ease: "easeOut" }}>
              <div className="step-head">
                <p className="eyebrow">
                  Step {stepIndex + 1} of {plan.steps.length}
                </p>
                <button className="corner-helpa press" onClick={() => say(step.instruction, "pointing")} aria-label="Hear this step again">
                  <Helpa mood={mood} speaking={speaking} size={64} />
                  <span className="corner-helpa-badge" aria-hidden="true">
                    <Icon name="speaker" size={14} />
                  </span>
                </button>
              </div>
              <h1 className="step-text">{tidy(step.instruction)}</h1>

              {has3d && stepPhoto && (
                <div className="segmented" role="tablist" aria-label="View">
                  <button role="tab" aria-selected={view === "3d"} className="press" onClick={() => setView("3d")}>
                    <Icon name="cube" size={16} /> 3D guide
                  </button>
                  <button role="tab" aria-selected={view === "photo"} className="press" onClick={() => setView("photo")}>
                    <Icon name="image" size={16} /> Your photo
                  </button>
                </div>
              )}
              <div className="visual-card">
                {visual}
                {checking && (
                  <div className="checking-overlay" aria-live="polite">
                    <div className="scan-sweep" aria-hidden="true" />
                    <span>Helpa is looking…</span>
                  </div>
                )}
              </div>

              <AnimatePresence>
                {checkResult && (
                  <motion.div
                    ref={(node) => node?.scrollIntoView({ behavior: "smooth", block: "nearest" })}
                    className={`check ${checkResult.done ? "check-ok" : "check-retry"}`}
                    role="status"
                    initial={{ opacity: 0, y: 12, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <span className="check-icon" aria-hidden="true">
                      {checkResult.done ? <Icon name="check" size={20} strokeWidth={3} /> : "!"}
                    </span>
                    <div>
                      <strong>{checkResult.done ? "Looks done!" : "Not quite yet"}</strong>
                      <p>{tidy(checkResult.feedback)}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {step.details?.length > 0 && (
                <details className="more-help">
                  <summary className="press">
                    More help
                    <Icon name="chevronDown" size={18} />
                  </summary>
                  <ul>
                    {step.details.map((line) => (
                      <li key={line}>{tidy(line)}</li>
                    ))}
                  </ul>
                </details>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="bottom-bar bottom-bar-row">
          <button className="btn-square press" onClick={() => goToStep(stepIndex - 1)} disabled={stepIndex === 0} aria-label="Back">
            <Icon name="back" />
          </button>
          <button className="btn btn-secondary press" onClick={() => checkInputRef.current?.click()} disabled={checking}>
            <Icon name="camera" size={20} />
            {checking ? "Checking" : "Check my work"}
          </button>
          <button className="btn btn-primary press" onClick={() => goToStep(stepIndex + 1)}>
            {stepIndex + 1 === plan.steps.length ? "All done" : "Next"}
          </button>
          <input
            ref={checkInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(changeEvent) => {
              runCheck(changeEvent.target.files?.[0]);
              changeEvent.target.value = "";
            }}
          />
        </div>
      </section>
    );
  } else if (stage === "done") screen = <Done plan={plan} mood={mood} speaking={speaking} onRestart={restart} />;

  return (
    <MotionConfig reducedMotion="user">
      <main className="app">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={showTutorial ? "tutorial" : stage}
            className="stage-frame"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {screen}
          </motion.div>
        </AnimatePresence>
      </main>
    </MotionConfig>
  );
}

function SceneSkeleton({ text }: { text: string }) {
  return (
    <div className="scene-skeleton skeleton" role="status">
      <Icon name="cube" size={36} strokeWidth={1.6} />
      <span>{text}</span>
    </div>
  );
}

function BubbleRow({ mood, speaking, bubble, size = 88 }: { mood: HelpaMood; speaking: boolean; bubble: string; size?: number }) {
  return (
    <div className="helpa-row">
      <Helpa mood={mood} speaking={speaking} size={size} />
      <motion.p key={bubble} className="bubble" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}>
        {bubble}
      </motion.p>
    </div>
  );
}

type WorkingProps = {
  rows: ProgressRow[];
  libraryHit: { brand: string; appliance: string; model_family: string } | null;
  photoUrl?: string;
  masks: string[];
  mood: HelpaMood;
  speaking: boolean;
  bubble: string;
};

function Working({ rows, libraryHit, photoUrl, masks, mood, speaking, bubble }: WorkingProps) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed((seconds) => seconds + 0.5), 500);
    return () => clearInterval(timer);
  }, []);
  // ponytail: progress is a feel-good estimate (time plus milestones), not real completion
  const progress = Math.min(0.94, 0.06 + rows.length * 0.07 + (1 - Math.exp(-elapsed / 50)) * 0.55);

  return (
    <section className="screen working" aria-label="Helpa is working">
      <div className="topbar">
        <span className="wordmark">helpa</span>
        <span className="pill-status">
          <span className="live-dot" aria-hidden="true" /> Working
        </span>
      </div>
      <div className="screen-body">
        {photoUrl ? (
          <>
            <div className="working-photo">
              <PartPhoto photoUrl={photoUrl} samTexts={masks} />
              <div className="scan-sweep" aria-hidden="true" />
            </div>
            <BubbleRow mood={mood} speaking={speaking} bubble={bubble} size={92} />
          </>
        ) : (
          <div className="working-hero">
            <div className="hero-stage">
              <div className="hero-blob hero-blob-pulse" aria-hidden="true" />
              <Helpa mood={mood} speaking={speaking} size={190} />
            </div>
            <motion.p key={bubble} className="bubble bubble-center" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              {bubble}
            </motion.p>
          </div>
        )}

        <AnimatePresence>
          {libraryHit && (
            <motion.div className="library-card" initial={{ opacity: 0, scale: 0.85, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 16 }}>
              <span className="library-icon" aria-hidden="true">
                <Icon name="sparkle" />
              </span>
              <div>
                <strong>I know this one!</strong>
                <p>
                  {[libraryHit.brand, libraryHit.appliance].filter(Boolean).join(" ")}
                  {libraryHit.model_family ? `, ${libraryHit.model_family}` : ""}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="card progress-card">
          <div className="progress-head">
            <strong>Helpa is on it</strong>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="progress">
            <motion.span className="progress-fill" animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.6 }} />
          </div>
          <ol className="checklist" aria-live="polite">
            {rows.slice(-4).map((row, index, visible) => {
              const active = index === visible.length - 1;
              return (
                <motion.li key={row.key} className={active ? "row-active" : "row-done"} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <span className="row-mark" aria-hidden="true">
                    {active ? <span className="spinner" /> : <Icon name="check" size={14} strokeWidth={3.2} />}
                  </span>
                  <span className="row-text">
                    {row.title}
                    {row.detail && <small>{row.detail}</small>}
                  </span>
                </motion.li>
              );
            })}
            <li className="row-pending" aria-hidden="true">
              <span className="row-mark" />
              <span className="row-text">
                Making your plan
                <small className="skeleton skeleton-line" />
              </span>
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
}

type PlanProps = { plan: Plan; mood: HelpaMood; speaking: boolean; onStart: () => void; onRestart: () => void; onHelp: () => void };

function PlanScreen({ plan, mood, speaking, onStart, onRestart, onHelp }: PlanProps) {
  const diagnosis = tidy(plan.diagnosis);
  const headline = diagnosis.match(/^.+?[.!?](\s|$)/)?.[0]?.trim() ?? diagnosis;
  const rest = diagnosis.slice(headline.length).trim();
  const identity = [known(plan.brand), known(plan.model_number)].filter(Boolean);
  const manualHost = (() => {
    try {
      return plan.manual_url ? new URL(plan.manual_url).hostname.replace(/^www\./, "") : "";
    } catch {
      return "";
    }
  })();

  return (
    <section className="screen plan" aria-label="Your plan">
      <div className="topbar">
        <button className="icon-button press" onClick={onRestart} aria-label="Start over">
          <Icon name="back" />
        </button>
        <span className="topbar-title">Your plan</span>
        <ThemeToggle />
            <button className="icon-button press" onClick={onHelp} aria-label="How Helpa works">
          <Icon name="help" />
        </button>
      </div>
      <div className="screen-body">
        <BubbleRow mood={mood} speaking={speaking} bubble={plan.safety.length ? "Good news, you can fix this! Read the safety bits first." : "Good news, you can fix this! Here's your plan."} />

        <motion.article className="card hero-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          {identity.length > 0 && (
            <ul className="tag-row tag-row-left">
              {identity.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          )}
          <h1 className="title">{capitalize(known(plan.appliance) || "Your appliance")}</h1>
          <p className="label">What&apos;s going on</p>
          <p className="diagnosis">{headline}</p>
          {rest && <p className="diagnosis-more">{rest}</p>}
          {(plan.library_id || manualHost) && (
            <div className="source-row">
              {plan.library_id && (
                <span className="badge">
                  <Icon name="sparkle" size={14} /> From Helpa&apos;s library
                </span>
              )}
              {manualHost && (
                <a className="source" href={plan.manual_url} target="_blank" rel="noreferrer">
                  <Icon name="book" size={16} /> Manual from {manualHost}
                </a>
              )}
            </div>
          )}
        </motion.article>

        {plan.safety.length > 0 && (
          <motion.article className="card safety-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
            <h2 className="card-title">
              <span className="safety-icon" aria-hidden="true">
                <Icon name="shield" size={18} />
              </span>
              Safety first
            </h2>
            <ul className="safety-list">
              {plan.safety.map((line) => (
                <li key={line}>{tidy(line)}</li>
              ))}
            </ul>
          </motion.article>
        )}

        {(plan.tools.length > 0 || plan.replacement_parts.length > 0) && (
          <motion.article className="card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
            <h2 className="card-title">What you need</h2>
            <ul className="icon-chips">
              {plan.tools.map((tool) => (
                <li key={tool}>
                  <span aria-hidden="true">{emojiFor(tool)}</span>
                  {tidy(tool)}
                </li>
              ))}
            </ul>
            {plan.replacement_parts.length > 0 && (
              <>
                <p className="label label-spaced">Only if a part needs replacing</p>
                <ul className="icon-chips icon-chips-soft">
                  {plan.replacement_parts.map((part) => (
                    <li key={part}>
                      <span aria-hidden="true">🔩</span>
                      {tidy(part)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </motion.article>
        )}

        <motion.article className="card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}>
          <h2 className="card-title">
            {plan.steps.length} simple steps
          </h2>
          <ol className="step-list">
            {plan.steps.map((planStep, index) => (
              <li key={index}>
                <span className="step-number">{index + 1}</span>
                <span>{firstSentence(tidy(planStep.instruction))}</span>
              </li>
            ))}
          </ol>
        </motion.article>
      </div>
      <div className="bottom-bar">
        <button className="btn btn-primary press" onClick={onStart}>
          Let&apos;s start
          <Icon name="next" size={20} />
        </button>
      </div>
    </section>
  );
}

const confettiColors = ["#e8775a", "#ffc94d", "#a3b47f", "#f79a86", "#7cb6f0", "#c9a7f5"];

function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 48 }, (_, index) => {
        const left = (index * 37) % 100;
        const drift = ((index * 53) % 60) - 30;
        return (
          <motion.span
            key={index}
            style={{ left: `${left}%`, background: confettiColors[index % confettiColors.length], borderRadius: index % 3 === 0 ? "50%" : 2 }}
            initial={{ y: -40, x: 0, rotate: 0, opacity: 1 }}
            animate={{ y: 900, x: drift, rotate: ((index * 97) % 720) - 360, opacity: [1, 1, 0] }}
            transition={{ duration: 2.6 + (index % 7) * 0.25, delay: (index % 12) * 0.08, ease: "easeIn" }}
          />
        );
      })}
    </div>
  );
}

function Done({ plan, mood, speaking, onRestart }: { plan: Plan | null; mood: HelpaMood; speaking: boolean; onRestart: () => void }) {
  const saved = savedEstimate(plan);
  const appliance = known(plan?.appliance) || "appliance";
  return (
    <section className="screen done" aria-label="All done">
      <Confetti />
      <div className="screen-body done-body">
        <div className="hero-stage">
          <div className="hero-blob" aria-hidden="true" />
          <Helpa mood={mood} speaking={speaking} size={200} />
        </div>
        <h1 className="display">You fixed it!</h1>
        <p className="lede">That was all you. Helpa is very proud.</p>
        <motion.div className="card saved-card" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4, type: "spring", stiffness: 220, damping: 18 }}>
          <span className="saved-label">You saved about</span>
          <strong className="saved-amount">${saved}</strong>
          <span className="saved-note">Estimate based on a typical repair visit for a {appliance}. Real prices vary by area.</span>
        </motion.div>
        {plan && (
          <div className="stat-row">
            <div className="card stat">
              <strong>{plan.steps.length}</strong>
              <span>steps done</span>
            </div>
            <div className="card stat">
              <strong>0</strong>
              <span>repair visits</span>
            </div>
          </div>
        )}
      </div>
      <div className="bottom-bar">
        <button className="btn btn-primary press" onClick={onRestart}>
          Fix something else
        </button>
      </div>
    </section>
  );
}
