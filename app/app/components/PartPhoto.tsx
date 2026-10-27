"use client";

import { useEffect, useRef, useState } from "react";
import { paintMasks, parseMasks } from "../lib/masks";

type PartPhotoProps = {
  photoUrl: string;
  samTexts: string[];
  label?: string;
};

const glowColor: [number, number, number] = [255, 170, 60];

/** The user's own photo with SAM's masks glowing on top. */
export default function PartPhoto({ photoUrl, samTexts, label }: PartPhotoProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const joinedSam = samTexts.join("\n");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !naturalSize) return;
    canvas.width = naturalSize.width;
    canvas.height = naturalSize.height;
    try {
      paintMasks(canvas, joinedSam.split("\n").filter(Boolean).flatMap(parseMasks), glowColor);
    } catch {
      // a malformed mask just means no glow for that part
    }
  }, [joinedSam, naturalSize]);

  return (
    <figure className="part-photo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoUrl}
        alt={label ? `Your photo, with the ${label} highlighted` : "Your photo"}
        onLoad={(loadEvent) =>
          setNaturalSize({ width: loadEvent.currentTarget.naturalWidth, height: loadEvent.currentTarget.naturalHeight })
        }
      />
      <canvas ref={canvasRef} className="part-photo-glow" aria-hidden="true" />
      {label && joinedSam.includes("<|mask") && <figcaption className="part-photo-label">{label}</figcaption>}
    </figure>
  );
}
