"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icons";

type Stroke = { x: number; y: number }[];

const ink = "#ff5b2e";

/**
 * Circle the problem: draw on your own photo with a finger. Done bakes the marks into a new JPEG, so the
 * model sees exactly what you mean ("this leak, here").
 */
export default function PhotoMarkup({ photo, onDone, onCancel }: { photo: Blob; onDone: (marked: Blob) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<ImageBitmap | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef(false);
  const [count, setCount] = useState(0);

  const redraw = () => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const width = Math.max(6, canvas.width / 90);
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const stroke of strokesRef.current) {
      if (stroke.length < 2) continue;
      // A dark edge under the marker keeps it readable on a bright orange or red machine.
      for (const [color, size] of [["rgba(14, 14, 15, 0.45)", width + 4], [ink, width]] as const) {
        context.strokeStyle = color;
        context.lineWidth = size;
        context.beginPath();
        stroke.forEach((point, index) => (index ? context.lineTo(point.x * canvas.width, point.y * canvas.height) : context.moveTo(point.x * canvas.width, point.y * canvas.height)));
        context.stroke();
      }
    }
  };

  useEffect(() => {
    let alive = true;
    createImageBitmap(photo).then((bitmap) => {
      if (!alive || !canvasRef.current) return;
      imageRef.current = bitmap;
      canvasRef.current.width = bitmap.width;
      canvasRef.current.height = bitmap.height;
      redraw();
    });
    return () => {
      alive = false;
    };
  }, [photo]);

  const pointOf = (pointerEvent: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = pointerEvent.currentTarget.getBoundingClientRect();
    return { x: (pointerEvent.clientX - bounds.left) / bounds.width, y: (pointerEvent.clientY - bounds.top) / bounds.height };
  };

  const finish = () => {
    canvasRef.current?.toBlob((blob) => blob && onDone(blob), "image/jpeg", 0.88);
  };

  return (
    <motion.section className="screen markup" aria-label="Circle the problem" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="topbar markup-top">
        <button className="icon-button glass press" onClick={onCancel} aria-label="Cancel">
          <Icon name="close" />
        </button>
        <span className="markup-title">Circle the problem</span>
        <button
          className="icon-button glass press"
          onClick={() => {
            strokesRef.current.pop();
            setCount(strokesRef.current.length);
            redraw();
          }}
          disabled={count === 0}
          aria-label="Undo"
        >
          <Icon name="undo" />
        </button>
      </div>
      <div className="markup-stage">
        <canvas
          ref={canvasRef}
          className="markup-canvas"
          aria-label="Your photo. Draw on it with your finger."
          onPointerDown={(pointerEvent) => {
            pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
            drawingRef.current = true;
            strokesRef.current.push([pointOf(pointerEvent)]);
            setCount(strokesRef.current.length);
          }}
          onPointerMove={(pointerEvent) => {
            if (!drawingRef.current) return;
            strokesRef.current[strokesRef.current.length - 1].push(pointOf(pointerEvent));
            redraw();
          }}
          onPointerUp={() => (drawingRef.current = false)}
          onPointerCancel={() => (drawingRef.current = false)}
        />
        {count === 0 && (
          <p className="markup-hint" aria-hidden="true">
            <Icon name="pen" size={18} /> Draw a circle around what&apos;s wrong
          </p>
        )}
      </div>
      <div className="bottom-bar markup-bottom">
        <button className="btn btn-primary press" onClick={finish} disabled={count === 0}>
          <Icon name="check" size={20} />
          Use this photo
        </button>
      </div>
    </motion.section>
  );
}
