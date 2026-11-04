"use client";

import { useState } from "react";
import { isMuted, setMuted } from "../lib/media";
import Icon from "./Icons";

/** Turns Helpa's spoken voice off or on; the words still show on screen. */
export default function MuteToggle({ className = "icon-button press" }: { className?: string }) {
  const [muted, setMutedState] = useState(isMuted);
  const toggle = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };
  return (
    <button className={className} onClick={toggle} aria-label={muted ? "Turn Helpa's voice on" : "Mute Helpa's voice"} aria-pressed={muted}>
      <Icon name={muted ? "speaker-off" : "speaker"} size={19} />
    </button>
  );
}
