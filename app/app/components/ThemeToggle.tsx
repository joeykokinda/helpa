"use client";

import { useState } from "react";
import Icon from "./Icons";
import MuteToggle from "./MuteToggle";

const storageKey = "helpa-theme";

/** Light by default; this flips to dark and remembers the choice. */
export default function ThemeToggle({
  className = "icon-button press",
}: {
  className?: string;
}) {
  const [dark, setDark] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.dataset.theme === "dark",
  );
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem(storageKey, next ? "dark" : "light");
    } catch {
      // private mode: the choice just lasts this visit
    }
  };
  // The mute button rides along everywhere the theme toggle sits, top right.
  return (
    <>
      <MuteToggle className={className} />
      <button
        className={`${className} theme-toggle`}
        onClick={toggle}
        aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
        aria-pressed={dark}
      >
        <Icon name={dark ? "sun" : "moon"} size={19} />
      </button>
    </>
  );
}
