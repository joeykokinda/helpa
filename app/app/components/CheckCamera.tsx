"use client";

import { useEffect, useRef, useState } from "react";
import { captureFrame } from "../lib/media";
import Icon from "./Icons";

type CheckCameraProps = {
  onShot: (photo: Blob) => void;
  onClose: () => void;
};

/** The same live camera as the first screen, for "Check what I did": a file picker opened from script is unreliable on iOS. */
export default function CheckCamera({ onShot, onClose }: CheckCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stream: MediaStream | undefined;
    if (!navigator.mediaDevices?.getUserMedia) {
      queueMicrotask(() => setFailed(true));
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 } }, audio: false })
      .then((granted) => {
        stream = granted;
        if (videoRef.current) {
          videoRef.current.srcObject = granted;
          setReady(true);
        }
      })
      .catch(() => setFailed(true));
    return () => stream?.getTracks().forEach((track) => track.stop());
  }, []);

  const shoot = async () => {
    if (!videoRef.current || !ready) return;
    onShot(await captureFrame(videoRef.current));
  };

  return (
    <div className="check-camera" role="dialog" aria-label="Snap what you did">
      <video ref={videoRef} autoPlay playsInline muted />
      <p className="check-camera-hint">{failed ? "I can't open the camera. Pick a photo instead." : "Show me what you did."}</p>
      <div className="camera-controls">
        <button className="round-button glass press" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
        {failed ? (
          <label className="shutter press" aria-label="Pick a photo">
            <span />
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(changeEvent) => {
                const file = changeEvent.target.files?.[0];
                if (file) onShot(file);
              }}
            />
          </label>
        ) : (
          <button className="shutter press" onClick={shoot} disabled={!ready} aria-label="Snap photo">
            <span />
          </button>
        )}
        <span className="round-button" aria-hidden="true" />
      </div>
    </div>
  );
}
