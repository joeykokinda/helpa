"use client";

import ThemeToggle from "./ThemeToggle";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { transcribe } from "../lib/api";
import { captureFrame, shrinkPhoto, toWav } from "../lib/media";
import Helpa, { type HelpaMood } from "./Helpa";
import Icon from "./Icons";

type CaptureProps = {
  onSubmit: (photos: Blob[], description: string) => void;
  say: (text: string, mood?: HelpaMood, aloud?: boolean) => void;
  onListening: (listening: boolean) => void;
  onHelp: () => void;
  bubble: string;
  mood: HelpaMood;
  speaking: boolean;
};

const maxPhotos = 4;
const scanFrames = 3;
const suggestions = ["Dishwasher leaves grit", "Washer won't drain", "Dryer takes forever", "Garbage disposal hums", "Fridge is leaking", "Toilet keeps running"];

/** Full-bleed camera first; falls back to (or switches to) a describe screen with text and hold-to-talk. */
export default function Capture({ onSubmit, say, onListening, onHelp, bubble, mood, speaking }: CaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [camera, setCamera] = useState<"starting" | "ready" | "failed">("starting");
  const [screen, setScreen] = useState<"camera" | "describe">("camera");
  const [captureMode, setCaptureMode] = useState<"photo" | "scan">("photo");
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([]);
  const [description, setDescription] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    let stream: MediaStream | undefined;
    const noCamera = () => {
      setCamera("failed");
      setScreen("describe");
      say("Tell me what's going on. You can add a photo too.", "idle", false);
    };
    if (!navigator.mediaDevices?.getUserMedia) {
      queueMicrotask(noCamera);
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 } }, audio: false })
      .then((granted) => {
        stream = granted;
        if (videoRef.current) {
          videoRef.current.srcObject = granted;
          setCamera("ready");
        }
      })
      .catch(noCamera);
    return () => stream?.getTracks().forEach((track) => track.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addPhotos = (blobs: Blob[]) =>
    setPhotos((current) => [...current, ...blobs.map((blob) => ({ blob, url: URL.createObjectURL(blob) }))].slice(-maxPhotos));

  const upload = async (files: FileList | null) => {
    const shrunk = await Promise.all([...(files ?? [])].map((file) => shrinkPhoto(file)));
    if (shrunk.length) {
      addPhotos(shrunk);
      say("Got it! Tell me a little about what's wrong.", "found", false);
      setScreen("describe");
    }
  };

  const shoot = async () => {
    if (!videoRef.current || camera !== "ready" || scanning) return;
    if (captureMode === "photo") {
      setFlash((count) => count + 1);
      addPhotos([await captureFrame(videoRef.current)]);
      say("Nice shot! Add another angle, or tap Next.", "found", false);
      return;
    }
    setScanning(true);
    say("Slowly move around it so I can see it from a few sides.", "searching");
    const frames: Blob[] = [];
    for (let index = 0; index < scanFrames; index++) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      frames.push(await captureFrame(videoRef.current));
      setFlash((count) => count + 1);
    }
    addPhotos(frames);
    setScanning(false);
    say("Got all sides! Tap Next when you're ready.", "found", false);
  };

  const startTalking = async () => {
    if (recording || transcribing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (dataEvent) => chunks.push(dataEvent.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setTranscribing(true);
        try {
          const heard = await transcribe(await toWav(new Blob(chunks, { type: recorder.mimeType })));
          if (heard.trim()) setDescription((current) => `${current} ${heard}`.trim());
        } catch (error) {
          say(error instanceof Error ? error.message : "I couldn't hear that, try again?", "worried");
        } finally {
          setTranscribing(false);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      onListening(true);
    } catch {
      say("I need the microphone to hear you. You can type instead.", "worried");
    }
  };

  const stopTalking = () => {
    if (!recorderRef.current) return;
    recorderRef.current.stop();
    recorderRef.current = null;
    setRecording(false);
    onListening(false);
  };

  const talkKeys = (keyEvent: KeyboardEvent, down: boolean) => {
    if (keyEvent.key !== " " && keyEvent.key !== "Enter") return;
    keyEvent.preventDefault();
    if (down && !keyEvent.repeat) startTalking();
    if (!down) stopTalking();
  };

  const openDescribe = () => {
    say(photos.length ? "Anything else I should know? Or tap Help me fix it." : "Tell me what's going on. Type it, or hold the mic and talk.", "idle", false);
    setScreen("describe");
  };

  const openCamera = () => {
    say("Point me at the broken thing, or its model sticker.", "idle", false);
    setScreen("camera");
  };

  const canSubmit = photos.length > 0 || description.trim().length > 0;
  const uploadInput = (
    <input type="file" accept="image/*" multiple hidden onChange={(changeEvent) => upload(changeEvent.target.files)} />
  );

  return (
    <>
      <section className={`screen camera ${screen === "camera" ? "" : "camera-hidden"}`} aria-label="Show Helpa the problem" aria-hidden={screen !== "camera"}>
        <video ref={videoRef} className="camera-video" autoPlay playsInline muted aria-label="Camera preview" />
        <div className="camera-shade" aria-hidden="true" />
        {camera === "starting" && <div className="camera-starting skeleton" aria-hidden="true" />}
        <AnimatePresence>
          {flash > 0 && (
            <motion.div key={flash} className="camera-flash" initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} transition={{ duration: 0.35 }} aria-hidden="true" />
          )}
        </AnimatePresence>

        <div className="topbar camera-top">
          <div className="camera-helpa">
            <Helpa mood={mood} speaking={speaking} size={84} />
            <motion.p key={bubble} className="hint-pill" aria-live="polite" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
              {bubble}
            </motion.p>
          </div>
          <ThemeToggle className="icon-button glass press" />
          <button className="icon-button glass press" onClick={onHelp} aria-label="How Helpa works">
            <Icon name="help" />
          </button>
        </div>

        <div className={`brackets ${scanning ? "brackets-scanning" : ""}`} aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          {scanning && <div className="scan-sweep" />}
        </div>

        <div className="camera-bottom">
          {photos.length > 0 && (
            <div className="tray">
              <ul className="thumbs">
                {photos.map((photo, index) => (
                  <motion.li key={photo.url} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt={`Photo ${index + 1}`} />
                  </motion.li>
                ))}
              </ul>
              <button className="btn btn-light btn-small press" onClick={openDescribe}>
                Next
                <Icon name="next" size={18} />
              </button>
            </div>
          )}
          <div className="mode-switch" role="radiogroup" aria-label="Capture mode">
            {(["photo", "scan"] as const).map((option) => (
              <button key={option} role="radio" aria-checked={captureMode === option} className="press" onClick={() => setCaptureMode(option)} disabled={scanning}>
                {option === "photo" ? "Photo" : "Scan around"}
              </button>
            ))}
          </div>
          <div className="camera-controls">
            <label className="round-button glass press" aria-label="Upload a photo">
              <Icon name="image" />
              {uploadInput}
            </label>
            <button
              className={`shutter press ${captureMode === "scan" ? "shutter-scan" : ""}`}
              onClick={shoot}
              disabled={camera !== "ready" || scanning}
              aria-label={captureMode === "photo" ? "Snap photo" : scanning ? "Scanning" : "Start scan"}
            >
              <span />
            </button>
            <button className="round-button glass press" onClick={openDescribe} aria-label="Describe it instead">
              <Icon name="keyboard" />
            </button>
          </div>
        </div>
      </section>

      {screen === "describe" && (
        <motion.section className="screen describe" aria-label="Describe the problem" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: "easeOut" }}>
          <div className="topbar">
            {camera === "ready" ? (
              <button className="icon-button press" onClick={openCamera} aria-label="Back to camera">
                <Icon name="back" />
              </button>
            ) : (
              <span className="wordmark">helpa</span>
            )}
            <ThemeToggle />
            <button className="icon-button press" onClick={onHelp} aria-label="How Helpa works">
              <Icon name="help" />
            </button>
          </div>

          <div className="screen-body">
            <div className="helpa-row">
              <Helpa mood={mood} speaking={speaking} size={96} />
              <motion.p key={bubble} className="bubble" aria-live="polite" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                {bubble}
              </motion.p>
            </div>
            <h1 className="title">What&apos;s going on?</h1>

            <div className={`field ${recording ? "field-live" : ""}`}>
              <textarea
                rows={3}
                aria-label="Describe the problem"
                placeholder="e.g. My dishwasher leaves gritty bits on the dishes"
                value={description}
                onChange={(changeEvent) => setDescription(changeEvent.target.value)}
              />
              {transcribing && (
                <p className="field-status">
                  <span className="dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  Writing that down
                </p>
              )}
            </div>

            {!description.trim() && (
              <ul className="suggestions" aria-label="Suggestions">
                {suggestions.map((suggestion) => (
                  <li key={suggestion}>
                    <button className="chip press" onClick={() => setDescription(suggestion)}>
                      {suggestion}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <ul className="photo-strip" aria-label="Your photos">
              {photos.map((photo, index) => (
                <li key={photo.url} className="photo-tile">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={`Photo ${index + 1}`} />
                  <button aria-label={`Remove photo ${index + 1}`} className="photo-remove press" onClick={() => setPhotos((current) => current.filter((candidate) => candidate !== photo))}>
                    <Icon name="close" size={14} strokeWidth={3} />
                  </button>
                </li>
              ))}
              {photos.length < maxPhotos && (
                <li>
                  {camera === "ready" ? (
                    <button className="photo-add press" onClick={openCamera}>
                      <Icon name="camera" />
                      <span>{photos.length ? "Add" : "Add photo"}</span>
                    </button>
                  ) : (
                    <label className="photo-add press">
                      <Icon name="plus" />
                      <span>{photos.length ? "Add" : "Add photo"}</span>
                      {uploadInput}
                    </label>
                  )}
                </li>
              )}
            </ul>
          </div>

          <div className="talk-zone">
            <button
              className={`talk press ${recording ? "talk-live" : ""}`}
              aria-label="Hold to talk"
              aria-pressed={recording}
              onPointerDown={startTalking}
              onPointerUp={stopTalking}
              onPointerLeave={stopTalking}
              onPointerCancel={stopTalking}
              onKeyDown={(keyEvent) => talkKeys(keyEvent, true)}
              onKeyUp={(keyEvent) => talkKeys(keyEvent, false)}
              onContextMenu={(menuEvent) => menuEvent.preventDefault()}
              disabled={transcribing}
            >
              <span className="ring" aria-hidden="true" />
              <span className="ring ring-late" aria-hidden="true" />
              <Icon name="mic" size={28} />
            </button>
            <p className="talk-label" aria-live="polite">
              {recording ? "Listening… let go when you're done" : transcribing ? "Got it" : "Hold to talk"}
            </p>
          </div>

          <div className="bottom-bar">
            <button className="btn btn-primary press" disabled={!canSubmit} onClick={() => onSubmit(photos.map((photo) => photo.blob), description.trim())}>
              Help me fix it
            </button>
          </div>
        </motion.section>
      )}
    </>
  );
}
