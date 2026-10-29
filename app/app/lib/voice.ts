"use client";

import { useEffect, useRef, useState } from "react";

/** What you can say while your hands are busy. */
export type VoiceCommand = "next" | "back" | "repeat" | "show" | "check" | "ask";

// Whole words only, so "next" inside a longer sentence still counts but "nextdoor" doesn't. Order matters:
// "show me again" is a repeat, not a show.
const commandWords: [VoiceCommand, RegExp][] = [
  ["repeat", /\b(repeat|again|say that again|what was that|pardon|come again)\b/i],
  ["back", /\b(back|go back|previous|undo)\b/i],
  ["show", /\b(show me|show|camera|hologram)\b/i],
  ["check", /\b(check|check it|check my work|did i do it)\b/i],
  ["next", /\b(next|done|okay|ok|got it|finished|continue|ready)\b/i],
];

// A question for Helpa ("which way does it turn?") rather than a command, even if it says "next" or "show".
const question = /^\s*(hey\s+)?(helpa\W+)?(what|what's|how|why|which|where|when|who|can|could|should|would|is|are|do|does|did|will|wait)\b/i;
export const isQuestion = (text: string) => question.test(text) || text.trim().endsWith("?");

export function commandFrom(text: string): VoiceCommand | null {
  return commandWords.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
};

function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export const voiceSupported = () => recognitionClass() !== null;

/**
 * Listens for short commands while `enabled`, using the phone's own speech recognition. Helpa's voice would hear
 * itself, so anything heard while `muted` (Helpa talking) or just after is ignored. Recognition stops on its own
 * after a quiet spell; it restarts until it's turned off or the microphone is refused.
 */
export function useVoiceCommands(enabled: boolean, muted: boolean, onCommand: (command: VoiceCommand, heard: string) => void) {
  const [state, setState] = useState<"off" | "listening" | "denied">("off");
  const onCommandRef = useRef(onCommand);
  const mutedUntilRef = useRef(0);

  useEffect(() => {
    onCommandRef.current = onCommand;
  });

  useEffect(() => {
    if (muted) mutedUntilRef.current = Infinity;
    else if (mutedUntilRef.current === Infinity) mutedUntilRef.current = performance.now() + 700;
  }, [muted]);

  useEffect(() => {
    const Speech = recognitionClass();
    if (!enabled || !Speech) return;
    let alive = true;
    let lastFired = 0;
    const recognition = new Speech();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (resultEvent) => {
      if (performance.now() < mutedUntilRef.current) return;
      for (let index = resultEvent.resultIndex; index < resultEvent.results.length; index++) {
        const heard = resultEvent.results[index][0]?.transcript ?? "";
        // A question waits for the whole sentence, then goes to Helpa instead of driving the steps.
        if (isQuestion(heard)) {
          if (resultEvent.results[index].isFinal && heard.trim().split(/\s+/).length >= 3) {
            lastFired = performance.now();
            onCommandRef.current("ask", heard.trim());
          }
          continue;
        }
        const command = commandFrom(heard);
        // Interim results make it feel instant; the gap stops one word firing twice as it firms up.
        if (command && performance.now() - lastFired > 1500) {
          lastFired = performance.now();
          onCommandRef.current(command, heard.trim());
          return;
        }
      }
    };
    recognition.onerror = (errorEvent) => {
      if (errorEvent.error === "not-allowed" || errorEvent.error === "service-not-allowed") {
        alive = false;
        setState("denied");
      }
    };
    recognition.onend = () => {
      if (!alive) return;
      try {
        recognition.start();
      } catch {
        // already restarting
      }
    };
    try {
      recognition.start();
      queueMicrotask(() => alive && setState("listening"));
    } catch {
      queueMicrotask(() => setState("denied"));
    }
    return () => {
      alive = false;
      recognition.onend = null;
      recognition.abort();
      setState("off");
    };
  }, [enabled]);

  return state;
}
