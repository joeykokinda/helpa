"use client";

import { useSyncExternalStore } from "react";

/** The person's choices that outlive a visit, like hands-free voice. Kept on the phone. */
export type Prefs = { handsFree: boolean };

const storageKey = "helpa-prefs";
const listeners = new Set<() => void>();
let cached: Prefs | null = null;

export function getPrefs(): Prefs {
  if (cached) return cached;
  let saved: Partial<Prefs> = {};
  try {
    saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
  } catch {
    // private mode or a bad value: defaults
  }
  cached = { handsFree: saved.handsFree === true };
  return cached;
}

const serverPrefs: Prefs = { handsFree: false };

export function setPrefs(change: Partial<Prefs>) {
  cached = { ...getPrefs(), ...change };
  try {
    localStorage.setItem(storageKey, JSON.stringify(cached));
  } catch {
    // private mode: the choice just lasts this visit
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getPrefs, () => serverPrefs);
}
