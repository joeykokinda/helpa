import type React from "react";
import { useRef, useState, type RefObject } from "react";

type ZoomCapabilities = MediaTrackCapabilities & { zoom?: { min: number; max: number }; torch?: boolean };

/**
 * The person's own camera controls: it starts at the widest zoom, pinch zooms with the camera's real zoom, and
 * the flashlight only turns on when they tap it. Helpa never changes these; it zooms on its own copy of a frame.
 */
export function useCameraControls(trackRef: RefObject<MediaStreamTrack | null>) {
  const zoomRangeRef = useRef<{ min: number; max: number; current: number } | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const [torch, setTorch] = useState<"unsupported" | "off" | "on">("unsupported");

  /** Call once the stream is granted. */
  const adopt = (track: MediaStreamTrack | undefined) => {
    trackRef.current = track ?? null;
    const capabilities = (track?.getCapabilities?.() ?? {}) as ZoomCapabilities;
    if (capabilities.torch) setTorch("off");
    if (track && capabilities.zoom) {
      zoomRangeRef.current = { min: capabilities.zoom.min, max: capabilities.zoom.max, current: capabilities.zoom.min };
      track.applyConstraints({ advanced: [{ zoom: capabilities.zoom.min } as MediaTrackConstraintSet] }).catch(() => {});
    }
  };

  const setTorchOn = async (on: boolean) => {
    try {
      await trackRef.current?.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      setTorch(on ? "on" : "off");
    } catch {
      setTorch("unsupported");
    }
  };

  const pinchDistance = (touches: React.TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  const pinchHandlers = {
    onTouchStart: (touchEvent: React.TouchEvent) => {
      if (touchEvent.touches.length === 2 && zoomRangeRef.current) pinchRef.current = { distance: pinchDistance(touchEvent.touches), zoom: zoomRangeRef.current.current };
    },
    onTouchMove: (touchEvent: React.TouchEvent) => {
      const range = zoomRangeRef.current;
      if (!pinchRef.current || !range || touchEvent.touches.length !== 2) return;
      const next = Math.min(range.max, Math.max(range.min, pinchRef.current.zoom * (pinchDistance(touchEvent.touches) / pinchRef.current.distance)));
      range.current = next;
      trackRef.current?.applyConstraints({ advanced: [{ zoom: next } as MediaTrackConstraintSet] }).catch(() => {});
    },
    onTouchEnd: () => {
      pinchRef.current = null;
    },
  };

  return { adopt, torch, setTorchOn, pinchHandlers };
}
