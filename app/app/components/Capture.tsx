"use client";

import { useEffect, useRef, useState } from "react";
import { transcribe } from "../lib/api";
import { captureFrame, shrinkPhoto, toWav } from "../lib/media";

type CaptureProps = {
  onSubmit: (photos: Blob[], description: string) => void;
  onListening: (listening: boolean) => void;
  onSay: (text: string) => void;
};

const maxPhotos = 4;
const scanFrames = 3;

/** Photo, live scan, voice and text input for describing what is broken. */
export default function Capture({ onSubmit, onListening, onSay }: CaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([]);
  const [description, setDescription] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let stream: MediaStream | undefined;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 } }, audio: false })
      .then((granted) => {
        stream = granted;
        if (videoRef.current) {
          videoRef.current.srcObject = granted;
          setCameraReady(true);
        }
      })
      .catch(() => setCameraError("No camera access. You can still upload a photo or just describe it."));
    return () => stream?.getTracks().forEach((track) => track.stop());
  }, []);

  const addPhotos = (blobs: Blob[]) =>
    setPhotos((current) => [...current, ...blobs.map((blob) => ({ blob, url: URL.createObjectURL(blob) }))].slice(-maxPhotos));

  const snap = async () => {
    if (videoRef.current && cameraReady) addPhotos([await captureFrame(videoRef.current)]);
  };

  const scan = async () => {
    if (!videoRef.current || !cameraReady) return;
    setScanning(true);
    onSay("Slowly move around it so I can see it from a few sides.");
    const frames: Blob[] = [];
    for (let index = 0; index < scanFrames; index++) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      frames.push(await captureFrame(videoRef.current));
    }
    addPhotos(frames);
    setScanning(false);
  };

  const startTalking = async () => {
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
          onSay(error instanceof Error ? error.message : "I couldn't hear that, try again?");
        } finally {
          setTranscribing(false);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      onListening(true);
    } catch {
      onSay("I need the microphone to hear you. You can type instead.");
    }
  };

  const stopTalking = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    onListening(false);
  };

  const canSubmit = photos.length > 0 || description.trim().length > 0;

  return (
    <section className="capture card" aria-label="Show Helpa the problem">
      <div className="viewfinder">
        <video ref={videoRef} autoPlay playsInline muted aria-label="Camera preview" />
        {!cameraReady && <p className="viewfinder-empty">{cameraError || "Opening camera…"}</p>}
        {scanning && <div className="scan-sweep" aria-hidden="true" />}
      </div>

      <div className="capture-actions">
        <button className="pill pill-primary" onClick={snap} disabled={!cameraReady || scanning}>
          Snap photo
        </button>
        <button className="pill" onClick={scan} disabled={!cameraReady || scanning}>
          {scanning ? "Scanning…" : "Scan around it"}
        </button>
        <label className="pill">
          Upload
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={async (changeEvent) => addPhotos(await Promise.all([...(changeEvent.target.files ?? [])].map((file) => shrinkPhoto(file))))}
          />
        </label>
      </div>

      {photos.length > 0 && (
        <ul className="thumbnails">
          {photos.map((photo, index) => (
            <li key={photo.url}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={`Photo ${index + 1}`} />
              <button aria-label={`Remove photo ${index + 1}`} onClick={() => setPhotos((current) => current.filter((candidate) => candidate !== photo))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">Tip: a photo of the model sticker helps me find the exact manual.</p>

      <div className="describe">
        <textarea
          rows={2}
          placeholder="What's going on? e.g. dishes come out gritty"
          value={description}
          onChange={(changeEvent) => setDescription(changeEvent.target.value)}
        />
        <button
          className={`talk ${recording ? "talk-on" : ""}`}
          aria-label="Hold to talk"
          aria-pressed={recording}
          onPointerDown={startTalking}
          onPointerUp={stopTalking}
          onPointerLeave={() => recording && stopTalking()}
          disabled={transcribing}
        >
          {transcribing ? "…" : recording ? "Listening" : "Hold to talk"}
        </button>
      </div>

      <button className="pill pill-primary pill-wide" disabled={!canSubmit} onClick={() => onSubmit(photos.map((photo) => photo.blob), description.trim())}>
        Help me fix it
      </button>
    </section>
  );
}
