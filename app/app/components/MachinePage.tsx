"use client";

import { motion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { askHelpa, transcribe } from "../lib/api";
import { careFor, isDue, putMachine, statusOf, type ChatLine, type Machine } from "../lib/home";
import { speak, stopSpeaking, toWav } from "../lib/media";
import { tidy } from "../lib/text";
import Helpa, { type HelpaMood } from "./Helpa";
import Icon from "./Icons";
import { capitalize, identityLine, MachineThumb } from "./MyHome";

const RigStep = dynamic(() => import("./rig/RigStep"), { ssr: false });

type MachinePageProps = {
  machine: Machine;
  onChange: (machine: Machine) => void;
  onBack: () => void;
  /** Starts the normal fix flow for this machine, with the problem already written. */
  onFix: (identity: string, complaint: string) => void;
};

function PhotoThumb({ photo }: { photo: Blob }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" /> : null;
}

const noBeats = [[]];

/** One machine: its 3D twin, what it is, what was fixed, its care, and a chat with Helpa about it. */
export default function MachinePage({ machine, onChange, onBack, onFix }: MachinePageProps) {
  const status = statusOf(machine);
  const identity = identityLine(machine);
  const cares = careFor(machine);
  const save = (next: Machine) => {
    onChange(next);
    putMachine(next).catch(() => {});
  };

  return (
    <section className="screen machine" aria-label={capitalize(tidy(machine.name))}>
      <div className="topbar">
        <button className="icon-button press" onClick={onBack} aria-label="Back to My Home">
          <Icon name="back" />
        </button>
        <span className="topbar-title">{capitalize(tidy(machine.name))}</span>
      </div>
      <div className="screen-body">
        <div className="visual-card machine-twin">
          {machine.rig ? <RigStep rigId={machine.rig.id} stepBeats={noBeats} stepIndex={0} recipe={machine.rig.recipe} /> : <MachineThumb machine={machine} />}
        </div>

        <div className="card">
          <div className="machine-id-row">
            <div>
              <p className="label">This machine</p>
              <h1 className="machine-title">{identity || capitalize(tidy(machine.name))}</h1>
            </div>
            <span className={`status-pill status-${status.tone}`}>{status.label}</span>
          </div>
          {machine.sample && <p className="machine-note">Added from a sample fix.</p>}
          {machine.manualUrl && (
            <a className="machine-link" href={machine.manualUrl} target="_blank" rel="noreferrer">
              <Icon name="book" size={18} />
              Owner&apos;s manual
            </a>
          )}
          {machine.parts.length > 0 && (
            <>
              <p className="label label-spaced">Parts used</p>
              <ul className="machine-parts">
                {machine.parts.map((part) => (
                  <li key={part}>
                    <Icon name="bolt" size={16} />
                    {tidy(part)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {cares.length > 0 && (
          <div className="card">
            <p className="card-title">
              <Icon name="sparkle" size={20} />
              Keep it healthy
            </p>
            <ul className="care-list">
              {cares.map((care) => {
                const due = isDue(machine, care);
                return (
                  <li key={care.id} className={due ? "care-due" : ""}>
                    <div>
                      <strong>{care.label}</strong>
                      <span>{due ? `Due now · ${care.every.toLowerCase()}` : care.every}</span>
                    </div>
                    {care.days > 0 && (
                      <button className={`chip press ${due ? "chip-due" : ""}`} onClick={() => save({ ...machine, care: { ...machine.care, [care.id]: Date.now() } })}>
                        {due ? "Done" : "Did it"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <AskHelpa machine={machine} onSave={save} onFix={(complaint) => onFix(identity, complaint)} />

        {machine.fixes.length > 0 && (
          <div className="card">
            <p className="card-title">
              <Icon name="clock" size={20} />
              History
            </p>
            <ul className="history-list">
              {machine.fixes.map((fix) => (
                <li key={fix.date}>
                  <span className="history-date">{new Date(fix.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                  <strong>{tidy(fix.problem)}</strong>
                  <span className="history-steps">
                    {fix.steps.length} steps{fix.sample ? " · sample" : ""}
                  </span>
                  {fix.photos.length > 0 && (
                    <div className="history-photos">
                      {fix.photos.map((photo, index) => (
                        <PhotoThumb key={index} photo={photo} />
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="bottom-bar">
        <button className="btn btn-primary press" onClick={() => onFix(identity, "")}>
          <Icon name="wrench" size={20} />
          Fix something on it
        </button>
      </div>
    </section>
  );
}

/** A follow-up chat that already knows this machine: its identity, past fixes and care. */
function AskHelpa({ machine, onSave, onFix }: { machine: Machine; onSave: (machine: Machine) => void; onFix: (complaint: string) => void }) {
  const [question, setQuestion] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [mood, setMood] = useState<HelpaMood>("idle");
  const [speaking, setSpeaking] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const ask = async (text: string) => {
    const asked = text.trim();
    if (!asked || thinking) return;
    setQuestion("");
    setError("");
    setThinking(true);
    setMood("thinking");
    const withQuestion: Machine = { ...machine, chat: [...machine.chat, { role: "you", text: asked }] };
    onSave(withQuestion);
    // Photos stay on the phone; Helpa only needs the words.
    const context = {
      name: machine.name,
      appliance: machine.appliance,
      brand: machine.brand,
      model: machine.model,
      manual: machine.manualUrl,
      parts: machine.parts,
      fixes: machine.fixes.slice(0, 5).map((fix) => ({ date: new Date(fix.date).toDateString(), problem: fix.problem, steps: fix.steps })),
      care: careFor(machine).map((care) => ({ task: care.label, every: care.every, last_done: machine.care[care.id] ? new Date(machine.care[care.id]).toDateString() : "never" })),
    };
    try {
      const reply = await askHelpa(context, machine.chat.slice(-10), asked);
      const line: ChatLine = { role: "helpa", text: reply.answer, complaint: reply.start_fix ? reply.complaint : undefined };
      onSave({ ...withQuestion, chat: [...withQuestion.chat, line] });
      setMood("explaining");
      speak(tidy(reply.answer), setSpeaking);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "I couldn't answer that right now.");
      setMood("worried");
    } finally {
      setThinking(false);
    }
  };

  const startTalking = async () => {
    if (recording) return;
    try {
      stopSpeaking();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (dataEvent) => chunks.push(dataEvent.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        try {
          const heard = await transcribe(await toWav(new Blob(chunks, { type: recorder.mimeType })));
          if (heard.trim()) ask(heard);
        } catch {
          setError("I couldn't hear that, try again?");
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setMood("listening");
    } catch {
      setError("I need the microphone to hear you. You can type instead.");
    }
  };

  const stopTalking = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const suggestions = [`Is my ${tidy(machine.name).toLowerCase()} due for anything?`, "It's acting up again", "What did I do last time?"];

  return (
    <div className="card ask-card">
      <div className="ask-head">
        <Helpa mood={mood} speaking={speaking} size={48} />
        <div>
          <p className="card-title ask-title">Ask Helpa</p>
          <p className="ask-sub">I remember everything about this one.</p>
        </div>
      </div>
      {machine.chat.length > 0 && (
        <ul className="chat" aria-live="polite">
          {machine.chat.map((line, index) => (
            <motion.li key={index} className={`chat-line chat-${line.role}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <p>{tidy(line.text)}</p>
              {line.complaint && index === machine.chat.length - 1 && (
                <button className="btn btn-small btn-primary press chat-fix" onClick={() => onFix(line.complaint ?? "")}>
                  <Icon name="wrench" size={16} />
                  Start a fix
                </button>
              )}
            </motion.li>
          ))}
          {thinking && (
            <li className="chat-line chat-helpa">
              <span className="dots" aria-label="Helpa is thinking">
                <i />
                <i />
                <i />
              </span>
            </li>
          )}
        </ul>
      )}
      {machine.chat.length === 0 && !thinking && (
        <ul className="suggestions" aria-label="Suggestions">
          {suggestions.map((suggestion) => (
            <li key={suggestion}>
              <button className="chip press" onClick={() => ask(suggestion)}>
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}
      {machine.chat.length === 0 && thinking && (
        <p className="field-status">
          <span className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          Thinking
        </p>
      )}
      {error && <p className="ask-error">{error}</p>}
      <form
        className="ask-form"
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          ask(question);
        }}
      >
        <input className="ask-input" value={question} onChange={(changeEvent) => setQuestion(changeEvent.target.value)} placeholder="Ask about this machine" aria-label="Ask Helpa about this machine" />
        <button
          type="button"
          className={`icon-button press ${recording ? "ask-mic-live" : ""}`}
          onPointerDown={startTalking}
          onPointerUp={stopTalking}
          onPointerLeave={() => recording && stopTalking()}
          aria-label="Hold to talk"
        >
          <Icon name="mic" />
        </button>
        <button type="submit" className="icon-button ask-send press" disabled={!question.trim() || thinking} aria-label="Send">
          <Icon name="send" />
        </button>
      </form>
    </div>
  );
}
