"use client";

import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type RefObject } from "react";
import { locatePart, readLabel, type LabelReading } from "../lib/api";
import { drawLockOn } from "../lib/arHud";
import { canvasBlob, cropAndEnlarge, displayRect, frameCanvas, fullResolutionStill, pickMask, type Box } from "../lib/live";
import { parseMasks } from "../lib/masks";
import type { Beat } from "../lib/rig/types";
import type { HelpaMood } from "./Helpa";
import Icon from "./Icons";

const RigStep = dynamic(() => import("./rig/RigStep"), { ssr: false });

type Place = { key: string; label: string; hint: string; rig?: string; beats: Beat[]; vin?: boolean };

/** Where the model sticker (or VIN) lives on each kind of machine, shown on its 3D model. */
const places: Place[] = [
  { key: "dryer", label: "Dryer", hint: "Open the door. The sticker is on the rim of the opening.", rig: "dryer_top_vent", beats: [{ part: "dryer_door", action: "open", caption: "Open the door" }, { part: "dryer_door", action: "look", caption: "Sticker on the rim" }] },
  { key: "washer", label: "Top-load washer", hint: "Lift the lid. It's under the lid or on the back of the control panel.", rig: "washer_top_load", beats: [{ part: "lid", action: "open", caption: "Lift the lid" }, { part: "model_and_serial_tag", action: "look", caption: "Sticker here" }] },
  { key: "front", label: "Front-load washer", hint: "Open the door. It's on the frame around the door.", rig: "washer_front_load", beats: [{ part: "washer_door", action: "open", caption: "Open the door" }, { part: "washer_door", action: "look", caption: "Sticker on the frame" }] },
  { key: "dishwasher", label: "Dishwasher", hint: "Open the door. It's on the edge of the door or the side of the tub.", rig: "dishwasher", beats: [{ part: "door", action: "open", caption: "Open the door" }, { part: "door", action: "look", caption: "Sticker on the edge" }] },
  { key: "disposal", label: "Disposal", hint: "Under the sink, on the bottom or side of the disposal.", rig: "garbage_disposal", beats: [{ part: "model_label", action: "look", caption: "Label on the side" }] },
  { key: "oven", label: "Oven", hint: "Pull out the bottom drawer. It's on the frame behind it.", rig: "range_electric", beats: [{ part: "storage_drawer", action: "open", caption: "Pull the drawer out" }, { part: "storage_drawer", action: "look", caption: "Sticker on the frame" }] },
  { key: "microwave", label: "Microwave", hint: "Open the door. It's on the frame inside.", rig: "microwave_otr", beats: [{ part: "microwave_door", action: "open", caption: "Open the door" }, { part: "microwave_door", action: "look", caption: "Sticker on the frame" }] },
  { key: "car", label: "Car (VIN)", hint: "Look through the windshield at the driver's side corner of the dashboard, or on the driver's door frame.", rig: "car_oil_change", vin: true, beats: [{ part: "driver_door", action: "open", caption: "Open the driver's door" }, { part: "driver_door", action: "look", caption: "VIN on the door frame" }] },
];

const stickerNames = ["model number sticker", "label sticker", "sticker", "label"];
const vinNames = ["vin sticker", "vin plate", "label sticker", "sticker"];

type FindModelProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  trackRef: RefObject<MediaStreamTrack | null>;
  say: (text: string, mood?: HelpaMood, aloud?: boolean) => void;
  onUse: (identity: string) => void;
};

/** Describes what Helpa read, for the description it sends with the fix. */
export function identityText(reading: LabelReading) {
  if (reading.vin) return `VIN ${reading.vin}${reading.description ? ` (${reading.description})` : ""}`;
  return [reading.brand, reading.model_number && `model ${reading.model_number}`, reading.serial && `serial ${reading.serial}`].filter(Boolean).join(", ");
}

/**
 * "Find my model number": shows where the sticker lives, spots it on the live camera, and reads it. Helpa zooms
 * on its own full-resolution copy of the frame; the viewfinder never changes.
 */
export default function FindModel({ videoRef, trackRef, say, onUse }: FindModelProps) {
  const [place, setPlace] = useState<Place | null>(null);
  const [state, setState] = useState<"looking" | "reading" | "read" | "unreadable">("looking");
  const [reading, setReading] = useState<LabelReading | null>(null);
  const [zoomUrl, setZoomUrl] = useState("");
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<{ box: Box; at: number; lockedAt: number } | null>(null);
  const stateRef = useRef(state);
  const sayRef = useRef(say);

  useEffect(() => {
    stateRef.current = state;
    sayRef.current = say;
  });

  useEffect(() => () => URL.revokeObjectURL(zoomUrl), [zoomUrl]);

  // The lock-on brackets over the sticker.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d")!;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const video = videoRef.current;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== Math.round(width * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const found = boxRef.current;
      if (!video?.videoWidth || !found || performance.now() - found.at > 3500) return;
      const shown = displayRect(video);
      const rect = { left: shown.left + found.box.x * shown.width, top: shown.top + found.box.y * shown.height, width: found.box.width * shown.width, height: found.box.height * shown.height };
      drawLockOn(context, rect, (performance.now() - found.lockedAt) / 420, 1, place?.vin ? "VIN" : "Model sticker", stateRef.current === "reading" ? "READING" : stateRef.current === "read" ? "GOT IT" : "FOUND");
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoRef, place]);

  // Look for the sticker about once a second; once it's found and steady, read it.
  useEffect(() => {
    if (!place) return;
    let alive = true;
    let busy = false;
    let hits = 0;
    let lastRead = 0;
    const timer = window.setInterval(async () => {
      const video = videoRef.current;
      if (!alive || busy || !video?.videoWidth || stateRef.current === "reading" || stateRef.current === "read") return;
      busy = true;
      try {
        const frame = frameCanvas(video, 960);
        const { sam } = await locatePart(await canvasBlob(frame, 0.8), place.vin ? vinNames : stickerNames, "label");
        if (!alive) return;
        const masks = sam ? parseMasks(sam) : [];
        const mask = pickMask(masks, frame, boxRef.current?.box ?? null);
        if (!mask) {
          hits = 0;
          return;
        }
        const toBox = (found: typeof mask) => ({ x: found.left / frame.width, y: found.top / frame.height, width: found.width / frame.width, height: found.height / frame.height });
        const box = toBox(mask);
        const now = performance.now();
        boxRef.current = { box, at: now, lockedAt: boxRef.current && now - boxRef.current.at < 3500 ? boxRef.current.lockedAt : now };
        hits++;
        if (hits < 2 || now - lastRead < 3000) return;
        lastRead = now;
        setState("reading");
        sayRef.current("Found it! Hold still while I read it.", "searching", false);
        // Helpa's zoom: one full-resolution still, cropped to each label SAM saw (a warning sticker often sits
        // next to the model sticker) and enlarged for Muse; the first one with a model number wins.
        const still = await fullResolutionStill(video, trackRef.current);
        const candidates = [mask, ...masks.filter((other) => other !== mask).sort((a, b) => b.width * b.height - a.width * a.height)].slice(0, 3);
        const crops = await Promise.all(candidates.map((candidate) => canvasBlob(cropAndEnlarge(still, toBox(candidate)), 0.9)));
        setZoomUrl(URL.createObjectURL(crops[0]));
        const results = await Promise.all(crops.map((crop) => readLabel(crop).catch(() => null)));
        if (!alive) return;
        const winner = results.findIndex((result) => result?.found && (result.model_number || result.vin));
        const result = winner >= 0 ? results[winner] : null;
        if (result) {
          boxRef.current = { box: toBox(candidates[winner]), at: performance.now(), lockedAt: performance.now() };
          setZoomUrl(URL.createObjectURL(crops[winner]));
          setReading(result);
          setState("read");
          sayRef.current(`Got it! ${identityText(result)}.`, "found");
        } else {
          setState("unreadable");
          sayRef.current("I can see it but can't read it yet. Move a little closer.", "worried", false);
          setTimeout(() => alive && setState("looking"), 2500);
        }
      } catch {
        if (alive) setState("looking");
      } finally {
        busy = false;
      }
    }, 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [place, videoRef, trackRef]);

  const choose = (next: Place) => {
    setPlace(next);
    setState("looking");
    setReading(null);
    boxRef.current = null;
    say(next.hint, "pointing", false);
  };

  const again = () => {
    setReading(null);
    setState("looking");
    boxRef.current = null;
  };

  return (
    <div className="find-model">
      <canvas ref={canvasRef} className="live-layer" aria-hidden="true" />
      <div className="find-panel">
        {!place ? (
          <>
            <p className="find-title">What are we looking at?</p>
            <ul className="find-chips">
              {places.map((option) => (
                <li key={option.key}>
                  <button className="chip chip-glass press" onClick={() => choose(option)}>
                    {option.label}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="find-where">
            {place.rig && (
              <div className="find-model-3d" aria-label={`Where the ${place.vin ? "VIN" : "sticker"} is on a ${place.label.toLowerCase()}`}>
                <RigStep rigId={place.rig} stepBeats={[place.beats]} stepIndex={0} />
              </div>
            )}
            <div className="find-hint">
              <button className="find-change press" onClick={() => setPlace(null)}>
                {place.label} <Icon name="chevronDown" size={14} />
              </button>
              <p>{place.hint}</p>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {(state === "reading" || state === "read" || state === "unreadable") && zoomUrl && (
          <motion.div className="find-result" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="find-zoom" src={zoomUrl} alt="Helpa's close-up of the sticker" />
            {state === "read" && reading ? (
              <div className="find-read">
                <span className="find-label">{reading.vin ? "VIN" : "Model number"}</span>
                <strong>{reading.vin || reading.model_number}</strong>
                <span className="find-detail">{reading.description || reading.brand}</span>
                <div className="find-actions">
                  <button className="btn btn-secondary btn-small press" onClick={again}>
                    Try again
                  </button>
                  <button className="btn btn-primary btn-small press" onClick={() => onUse(identityText(reading))}>
                    Use this
                  </button>
                </div>
              </div>
            ) : (
              <p className="find-reading">{state === "reading" ? "Zooming in and reading…" : "Too small to read. Move a little closer."}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {place && state !== "read" && (
        <div className="find-type">
          {typing ? (
            <form
              className="field find-type-field"
              onSubmit={(submitEvent) => {
                submitEvent.preventDefault();
                if (typed.trim()) onUse(`${place.vin ? "VIN" : "model"} ${typed.trim()}`);
              }}
            >
              <input autoFocus value={typed} maxLength={40} onChange={(changeEvent) => setTyped(changeEvent.target.value.toUpperCase())} placeholder={place.vin ? "17-character VIN" : "e.g. WED5000DW0"} aria-label={place.vin ? "VIN" : "Model number"} />
              <button className="question-send press" type="submit" disabled={!typed.trim()} aria-label="Use this number">
                <Icon name="next" size={20} />
              </button>
            </form>
          ) : (
            <button className="question-other find-type-open press" onClick={() => setTyping(true)}>
              <Icon name="keyboard" size={16} /> Type it instead
            </button>
          )}
        </div>
      )}
    </div>
  );
}
