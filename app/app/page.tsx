"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import Capture from "./components/Capture";
import Helpa, { type HelpaMood } from "./components/Helpa";
import PartPhoto from "./components/PartPhoto";
import SpeechBubble from "./components/SpeechBubble";
import { checkStep, describeSearch, streamFix, type AgentEvent, type Plan, type Scene } from "./lib/api";
import { shrinkPhoto, speak, stopSpeaking } from "./lib/media";

const Scene3D = dynamic(() => import("./components/Scene3D"), {
  ssr: false,
  loading: () => <div className="scene-3d scene-loading">Building your 3D model…</div>,
});

/** The bubble stays short; the full text is on the page and spoken aloud. */
function firstSentence(text: string) {
  const sentence = text.match(/^.+?[.!?](\s|$)/)?.[0]?.trim() ?? text;
  return sentence.length > 90 ? `${sentence.slice(0, 87).trimEnd()}…` : sentence;
}

type Stage = "start" | "working" | "plan" | "step" | "done";

export default function Home() {
  const [stage, setStage] = useState<Stage>("start");
  const [mood, setMood] = useState<HelpaMood>("idle");
  const [speaking, setSpeaking] = useState(false);
  const [bubble, setBubble] = useState("Hi, I'm Helpa! Show me what's broken, or just tell me.");
  const [trail, setTrail] = useState<string[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
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

  const say = (text: string, nextMood: HelpaMood = "explaining", aloud = true) => {
    setBubble(firstSentence(text));
    setMood(nextMood);
    if (aloud) speak(text, setSpeaking);
  };

  const handleEvent = (agentEvent: AgentEvent) => {
    switch (agentEvent.type) {
      case "say":
        say(agentEvent.text, "thinking");
        break;
      case "search":
        setMood("searching");
        setTrail((current) => [...current, describeSearch(agentEvent.action)]);
        break;
      case "parts":
        if (agentEvent.found > 0) {
          setMood("found");
          setPartMasks((current) => ({ ...current, [agentEvent.photo]: [...(current[agentEvent.photo] ?? []), agentEvent.sam] }));
          setTrail((current) => [...current, `Found the ${agentEvent.phrase}`]);
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
    setTrail([]);
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

  const enterStep = (index: number) => {
    if (!plan) return;
    setStepIndex(index);
    setStage("step");
    setCheckResult(null);
    stopSpeaking();
    say(plan.steps[index].instruction, "pointing");
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

  const stepPhoto = step && step.photo >= 0 ? photoUrls[step.photo] : undefined;
  const helpaSize = stage === "start" || stage === "done" ? 180 : 108;

  return (
    <main className="app">
      <header className={`helpa-header helpa-header-${stage}`}>
        <Helpa mood={mood} speaking={speaking} size={helpaSize} />
        <SpeechBubble text={bubble} />
      </header>

      {stage === "start" && (
        <Capture onSubmit={start} onListening={(listening) => setMood(listening ? "listening" : "idle")} onSay={(text) => say(text)} />
      )}

      {stage === "working" && (
        <section className="card working" aria-live="polite">
          <h2 className="section-title">Helpa is on it</h2>
          {photoUrls.map((url, index) => (
            <PartPhoto key={url} photoUrl={url} samTexts={partMasks[index] ?? []} />
          ))}
          <ol className="trail">
            {trail.slice(-6).map((line, index) => (
              <li key={`${line}-${index}`}>{line}</li>
            ))}
          </ol>
        </section>
      )}

      {stage === "plan" && plan && (
        <section className="plan">
          <div className="card">
            <p className="eyebrow">
              {plan.brand} {plan.model_number}
            </p>
            <h2 className="section-title">What&apos;s going on</h2>
            <p>{plan.diagnosis}</p>
            {plan.manual_url && (
              <a className="source" href={plan.manual_url} target="_blank" rel="noreferrer">
                From the manual: {new URL(plan.manual_url).hostname}
              </a>
            )}
          </div>
          {plan.safety.length > 0 && (
            <div className="card card-safety">
              <h2 className="section-title">Safety first</h2>
              <ul>
                {plan.safety.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="card">
            <h2 className="section-title">What you need</h2>
            <ul className="chips">
              {plan.tools.map((tool) => (
                <li key={tool}>{tool}</li>
              ))}
            </ul>
            {plan.replacement_parts.length > 0 && (
              <>
                <p className="label">If a part needs replacing</p>
                <ul className="chips chips-parts">
                  {plan.replacement_parts.map((part) => (
                    <li key={part}>{part}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <button
            className="pill pill-primary pill-wide"
            onClick={() => enterStep(0)}
          >
            Let&apos;s do it, {plan.steps.length} steps
          </button>
        </section>
      )}

      {stage === "step" && plan && step && (
        <section className="step">
          <div className="step-progress" aria-label={`Step ${stepIndex + 1} of ${plan.steps.length}`}>
            {plan.steps.map((_, index) => (
              <span key={index} className={index <= stepIndex ? "step-dot step-dot-on" : "step-dot"} />
            ))}
          </div>
          <p className="eyebrow">
            Step {stepIndex + 1} of {plan.steps.length}
          </p>
          <h2 className="step-instruction">{step.instruction}</h2>

          <div className="view-toggle" role="tablist">
            <button role="tab" aria-selected={view === "3d"} className="pill" onClick={() => setView("3d")}>
              3D guide
            </button>
            <button role="tab" aria-selected={view === "photo"} className="pill" onClick={() => setView("photo")} disabled={!stepPhoto}>
              Your photo
            </button>
          </div>

          {view === "3d" &&
            (scene ? (
              <Scene3D scene={scene} stepIndex={stepIndex} />
            ) : (
              <div className="scene-3d scene-loading">{sceneFailed ? "The 3D model didn't come out. Use your photo instead." : "Building your 3D model…"}</div>
            ))}
          {view === "photo" && stepPhoto && <PartPhoto photoUrl={stepPhoto} samTexts={stepMasks[stepIndex] ? [stepMasks[stepIndex]] : []} label={step.target_part} />}

          {checkResult && <p className={checkResult.done ? "check check-ok" : "check check-retry"}>{checkResult.feedback}</p>}

          <div className="step-actions">
            <button className="pill" onClick={() => goToStep(stepIndex - 1)} disabled={stepIndex === 0}>
              Back
            </button>
            <button className="pill" onClick={() => say(step.instruction, "pointing")}>
              Say it again
            </button>
            <button className="pill" onClick={() => checkInputRef.current?.click()} disabled={checking}>
              {checking ? "Checking…" : "Check my work"}
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
          <button className="pill pill-primary pill-wide" onClick={() => goToStep(stepIndex + 1)}>
            {stepIndex + 1 === plan.steps.length ? "All done" : "Done, next step"}
          </button>
        </section>
      )}

      {stage === "done" && (
        <button
          className="pill pill-primary pill-wide"
          onClick={() => {
            setStage("start");
            say("What else can I help with?", "idle");
          }}
        >
          Fix something else
        </button>
      )}
    </main>
  );
}

