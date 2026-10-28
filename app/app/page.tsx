"use client";

import ThemeToggle from "./components/ThemeToggle";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Capture from "./components/Capture";
import CheckMoment, { type CheckState } from "./components/CheckMoment";
import Helpa, { type HelpaMood } from "./components/Helpa";
import Icon from "./components/Icons";
import Onboarding, { hasOnboarded } from "./components/Onboarding";
import PartPhoto from "./components/PartPhoto";
import { rigLoaders } from "./components/rig/registry";
import { answerQuestion, checkStep, describeSearch, streamFix, type AgentEvent, type Plan, type Scene } from "./lib/api";
import { shrinkPhoto, speak, stopSpeaking } from "./lib/media";
import type { Beat } from "./lib/rig/types";

const RigStep = dynamic(() => import("./components/rig/RigStep"), { ssr: false });
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
/** Rows with a state are parallel tracks (model, research, parts) that stay visible until the plan lands. */
type ProgressRow = { key: string; title: string; detail: string; state?: "active" | "done" };
type Question = { session: string; question: string; choices: string[] };

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
  // A built-in appliance model with beats per step; preferred over the generated scene when present.
  // A generated model (rig "generated") carries its recipe and catalog inline for RigStep to render.
  const [rig, setRig] = useState<{ id: string; stepBeats: Beat[][]; recipe?: unknown; catalog?: unknown } | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const identified = useRef(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [view, setView] = useState<"3d" | "photo">("3d");
  const [check, setCheck] = useState<CheckState | null>(null);
  const checkInputRef = useRef<HTMLInputElement>(null);
  const checkToken = useRef(0);

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
        ? current.map((existing) => (existing.key === row.key ? { ...row, detail: row.detail || existing.detail } : existing))
        : [...current, row],
    );

  const handleEvent = (agentEvent: AgentEvent) => {
    switch (agentEvent.type) {
      case "say":
        say(agentEvent.text, "thinking");
        addRow({ key: "identify", title: "Figured out what it is", detail: "" });
        break;
      case "identify": {
        const name = [known(agentEvent.brand), known(agentEvent.appliance)].filter(Boolean).join(" ");
        if (!name) break;
        addRow({ key: "identify", title: "Figured out what it is", detail: capitalize(name) });
        if (!identified.current) say(`That looks like ${/^[aeiou]/i.test(name) ? "an" : "a"} ${name}.`, "found");
        identified.current = true;
        break;
      }
      case "track":
        addRow({ key: `track-${agentEvent.track}`, title: agentEvent.title, detail: agentEvent.detail, state: agentEvent.state });
        break;
      case "question":
        setQuestion({ session: agentEvent.session, question: agentEvent.question, choices: agentEvent.choices });
        stopSpeaking();
        say(agentEvent.question, "explaining");
        // The question is short; show all of it rather than the bubble's first sentence.
        setBubble(tidy(agentEvent.question));
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
          addRow({
            key: `part-${agentEvent.phrase}`,
            title: `Spotted the ${agentEvent.phrase}`,
            detail: agentEvent.size_cm ? `About ${Math.round(agentEvent.size_cm)} cm, highlighted on your photo` : "Highlighted on your photo",
          });
        }
        break;
      case "plan":
        setQuestion(null);
        setPlan(agentEvent.plan);
        setStage("plan");
        say(agentEvent.plan.diagnosis);
        if (agentEvent.plan.safety.length) setTimeout(() => setMood("worried"), 400);
        break;
      case "rig":
        setRig({ id: agentEvent.rig, stepBeats: agentEvent.step_beats, recipe: agentEvent.recipe, catalog: agentEvent.catalog });
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
        setQuestion(null);
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
    setRig(null);
    setQuestion(null);
    identified.current = false;
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

  const answer = async (text: string) => {
    const asked = question;
    const reply = text.trim();
    if (!asked || !reply) return;
    setQuestion(null);
    addRow({ key: `answer-${asked.question}`, title: "You told me", detail: `"${firstSentence(reply)}"` });
    stopSpeaking();
    say("Got it, thanks!", "found");
    try {
      await answerQuestion(asked.session, reply);
    } catch {
      setQuestion(asked);
      say("I missed that. Can you answer again?", "worried");
    }
  };

  // Only models the app can draw count: a built-in rig, or a generated one that brought its recipe.
  const playableRig = rig && (rig.id in rigLoaders || (rig.id === "generated" && rig.recipe)) ? rig : null;
  const sceneMissing = sceneFailed || (rig !== null && !playableRig);

  const step = plan?.steps[stepIndex];
  const stepPhoto = step && step.photo >= 0 ? photoUrls[step.photo] : undefined;

  const enterStep = (index: number) => {
    if (!plan) return;
    const next = plan.steps[index];
    setStepIndex(index);
    setStage("step");
    closeCheck();
    setView(playableRig ? ((playableRig.stepBeats[index]?.length ?? 0) > 0 ? "3d" : "photo") : next.show_3d && !sceneMissing ? "3d" : "photo");
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

  const showCheck = (next: CheckState | null) =>
    setCheck((current) => {
      if (current && current.photoUrl !== next?.photoUrl) URL.revokeObjectURL(current.photoUrl);
      return next;
    });

  const closeCheck = () => {
    checkToken.current++;
    showCheck(null);
  };

  const runCheck = async (file: File | undefined) => {
    if (!file || !step) return;
    const token = ++checkToken.current;
    const photoUrl = URL.createObjectURL(file);
    stopSpeaking();
    showCheck({ phase: "checking", photoUrl, feedback: "" });
    say("Let me look…", "searching");
    let next: CheckState;
    try {
      const result = await checkStep(await shrinkPhoto(file), step);
      next = { phase: result.done ? "done" : "retry", photoUrl, feedback: tidy(result.feedback) };
    } catch (error) {
      next = { phase: "error", photoUrl, feedback: error instanceof Error ? error.message : "I couldn't check that. Can you try again?" };
    }
    // The person may have gone back or moved on while Helpa was looking.
    if (token !== checkToken.current) return;
    showCheck(next);
    stopSpeaking();
    say(next.feedback, next.phase === "done" ? "celebrate" : "worried");
  };

  const backToStep = () => {
    closeCheck();
    stopSpeaking();
    setMood("pointing");
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
    screen = (
      <Working
        rows={rows}
        libraryHit={libraryHit}
        photoUrl={photoUrls[activePhoto]}
        masks={partMasks[activePhoto] ?? []}
        mood={mood}
        speaking={speaking}
        bubble={bubble}
        question={question}
        onAnswer={answer}
      />
    );
  else if (stage === "plan" && plan)
    screen = <PlanScreen plan={plan} mood={mood} speaking={speaking} onStart={() => enterStep(0)} onRestart={restart} onHelp={openTutorial} />;
  else if (stage === "step" && plan && step) {
    const rigBeats = playableRig?.stepBeats[stepIndex] ?? [];
    const has3d = playableRig ? rigBeats.length > 0 : step.show_3d && !sceneMissing;
    const guide3d = playableRig ? (
      <RigStep rigId={playableRig.id} stepBeats={playableRig.stepBeats} stepIndex={stepIndex} recipe={playableRig.recipe} />
    ) : scene ? (
      <Scene3D scene={scene} stepIndex={stepIndex} />
    ) : null;
    const lastStep = stepIndex + 1 === plan.steps.length;
    const stepMask = stepMasks[stepIndex] ? [stepMasks[stepIndex]] : [];
    let visual: ReactNode = null;
    if (view === "3d" && has3d) visual = guide3d ?? <SceneSkeleton text="Building your 3D model" />;
    else if (stepPhoto) visual = <PartPhoto photoUrl={stepPhoto} samTexts={stepMask} label={step.target_part} />;
    else if (step.target_part)
      visual = (
        <div className="visual-target">
          <span className="visual-target-icon" aria-hidden="true">
            <Icon name="scan" size={34} />
          </span>
          <p>
            Look for the <strong>{tidy(step.target_part)}</strong>
          </p>
        </div>
      );
    // Only one 3D view at a time: while checking, the guide moves into the comparison.
    let guide: ReactNode = null;
    if (has3d && guide3d) guide = guide3d;
    else if (stepPhoto) guide = <PartPhoto photoUrl={stepPhoto} samTexts={stepMask} />;

    const retake = () => checkInputRef.current?.click();
    let actions: ReactNode;
    if (!check)
      actions = (
        <div className="bottom-bar bottom-bar-row">
          <button className="btn-square press" onClick={() => goToStep(stepIndex - 1)} disabled={stepIndex === 0} aria-label="Back">
            <Icon name="back" />
          </button>
          <button className="btn btn-secondary press" onClick={retake}>
            <Icon name="camera" size={20} />
            Check my work
          </button>
          <button className="btn btn-primary press" onClick={() => goToStep(stepIndex + 1)}>
            {lastStep ? "All done" : "Next"}
          </button>
        </div>
      );
    else if (check.phase === "checking")
      actions = (
        <div className="bottom-bar">
          <button className="btn btn-secondary press" onClick={backToStep}>
            Cancel
          </button>
        </div>
      );
    else if (check.phase === "done")
      actions = (
        <div className="bottom-bar bottom-bar-pair">
          <button className="btn btn-secondary press" onClick={backToStep}>
            Stay here
          </button>
          <button className="btn btn-primary press" onClick={() => goToStep(stepIndex + 1)}>
            {lastStep ? "Finish" : "Next step"}
            <Icon name="next" size={20} />
          </button>
        </div>
      );
    else
      actions = (
        <div className="bottom-bar bottom-bar-pair">
          {check.phase === "retry" ? (
            <button className="btn btn-secondary press" onClick={() => goToStep(stepIndex + 1)}>
              Skip, it&apos;s fine
            </button>
          ) : (
            <button className="btn btn-secondary press" onClick={backToStep}>
              Back to step
            </button>
          )}
          <button className="btn btn-primary press" onClick={retake}>
            <Icon name="camera" size={20} />
            Try again
          </button>
        </div>
      );

    screen = (
      <section key="step" className="screen step" aria-label={`Step ${stepIndex + 1}`}>
        {check?.phase === "done" && <Confetti />}
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
            {check ? (
              <motion.div key="check" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.25, ease: "easeOut" }}>
                <CheckMoment check={check} speaking={speaking} doneLooksLike={tidy(step.check ?? "")} guide={guide} onBack={backToStep} />
              </motion.div>
            ) : (
              <motion.div key={stepIndex} className="step-content" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25, ease: "easeOut" }}>
                <div className="step-head">
                  <button className="step-helpa press" onClick={() => say(step.instruction, "pointing")} aria-label="Hear this step again">
                    <Helpa mood={mood} speaking={speaking} size={56} />
                    <span className="step-helpa-badge" aria-hidden="true">
                      <Icon name="speaker" size={12} />
                    </span>
                  </button>
                  <div>
                    <p className="eyebrow">
                      Step {stepIndex + 1} of {plan.steps.length}
                    </p>
                    <p className="step-hint" aria-hidden="true">
                      {speaking ? "Reading it out loud" : "Tap me to hear it again"}
                    </p>
                  </div>
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
                {visual && <div className="visual-card">{visual}</div>}

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
            )}
          </AnimatePresence>
        </div>

        {actions}
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
  question: Question | null;
  onAnswer: (answer: string) => void;
};

function QuestionCard({ question, onAnswer }: { question: Question; onAnswer: (answer: string) => void }) {
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  return (
    <motion.div className="question-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ type: "spring", stiffness: 280, damping: 22 }}>
      <div className="question-chips" role="group" aria-label={question.question}>
        {question.choices.map((choice) => (
          <button key={choice} className="question-chip press" onClick={() => onAnswer(choice)}>
            {tidy(choice)}
          </button>
        ))}
      </div>
      {typing ? (
        <form
          className="field question-field"
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            onAnswer(draft);
          }}
        >
          <input autoFocus value={draft} maxLength={300} onChange={(changeEvent) => setDraft(changeEvent.target.value)} placeholder="Type your answer" aria-label="Your answer" />
          <button className="question-send press" type="submit" disabled={!draft.trim()} aria-label="Send answer">
            <Icon name="next" size={20} />
          </button>
        </form>
      ) : (
        <button className="question-other press" onClick={() => setTyping(true)}>
          <Icon name="keyboard" size={16} /> Type an answer
        </button>
      )}
    </motion.div>
  );
}

function Working({ rows, libraryHit, photoUrl, masks, mood, speaking, bubble, question, onAnswer }: WorkingProps) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed((seconds) => seconds + 0.5), 500);
    return () => clearInterval(timer);
  }, []);
  // ponytail: progress is a feel-good estimate (time plus milestones), not real completion
  const progress = Math.min(0.94, 0.06 + rows.length * 0.07 + (1 - Math.exp(-elapsed / 50)) * 0.55);
  // Parallel tracks stay pinned under the latest few steps so the fan-out stays visible.
  const recent = rows.filter((row) => !row.state).slice(-3);
  const tracks = rows.filter((row) => row.state);

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
            <BubbleRow mood={mood} speaking={speaking} bubble={bubble} size={88} />
          </>
        ) : (
          <div className="working-hero">
            <div className="hero-stage">
              <div className="hero-blob hero-blob-pulse" aria-hidden="true" />
              <Helpa mood={mood} speaking={speaking} size={180} />
            </div>
            <motion.p key={bubble} className="bubble bubble-center" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              {bubble}
            </motion.p>
          </div>
        )}

        <AnimatePresence>{question && <QuestionCard key={question.session + question.question} question={question} onAnswer={onAnswer} />}</AnimatePresence>

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
            {[...recent, ...tracks].map((row, index) => {
              const active = row.state ? row.state === "active" : index === recent.length - 1 && !question;
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
        <div className="topbar-actions">
          <ThemeToggle />
          <button className="icon-button press" onClick={onHelp} aria-label="How Helpa works">
            <Icon name="help" />
          </button>
        </div>
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
  // Only claim savings when a technician would really have been called for this fix.
  const saved = plan?.pro_visit_cost ?? 0;
  const aftercare = plan?.aftercare ? tidy(plan.aftercare) : "";
  return (
    <section className="screen done" aria-label="All done">
      <Confetti />
      <div className="screen-body done-body">
        <div className="hero-stage">
          <div className="hero-blob" aria-hidden="true" />
          <Helpa mood={mood} speaking={speaking} size={180} />
        </div>
        <div className="done-headline">
          <h1 className="display">You fixed it!</h1>
          <p className="lede">That was all you. Helpa is very proud.</p>
        </div>
        {saved > 0 && (
          <motion.div className="card saved-card" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4, type: "spring", stiffness: 220, damping: 18 }}>
            <span className="saved-label">You skipped a repair visit worth about</span>
            <strong className="saved-amount">${saved}</strong>
            <span className="saved-note">Typical technician cost for this fix. Real prices vary by area.</span>
          </motion.div>
        )}
        {plan && (
          <motion.div className="stat-row" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <div className="card stat">
              <strong>{plan.steps.length}</strong>
              <span>steps done</span>
            </div>
            <div className="card stat">
              <strong>0</strong>
              <span>repair visits</span>
            </div>
          </motion.div>
        )}
        {aftercare && (
          <motion.div className="card tip-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <span className="tip-icon" aria-hidden="true">
              <Icon name="sparkle" size={20} />
            </span>
            <div>
              <strong>Keep it this way</strong>
              <p>{aftercare}</p>
            </div>
          </motion.div>
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
