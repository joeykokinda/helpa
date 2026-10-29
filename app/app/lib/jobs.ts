"use client";

import { API_URL, type Plan } from "./api";

/** Jobs: every fix from "it's broken" to "it works again", kept on the server so Helpa's agents can work on it. */

export type JobLog = { at: number; kind: string; text: string };
export type BuyOption = { store: string; url: string; price: string; in_stock: boolean };
export type JobPart = {
  id: string;
  name: string;
  part_number: string;
  fits: string;
  confidence: "high" | "medium" | "low";
  buy: BuyOption[];
  status: "found" | "ordered" | "shipped" | "out_for_delivery" | "delivered";
  store?: string;
  tracking?: string;
  carrier?: string;
  eta?: string;
  last_note?: string;
};
export type JobPro = { name: string; trade: string; rating: number; reviews: number; phone: string; website: string; address: string; why: string; hours: string; contacted?: number };
export type JobFollowUp = { id: string; label: string; due: number; done: boolean };
export type JobStatus = "fixing" | "needs_part" | "waiting_part" | "part_arrived" | "needs_pro" | "pro_booked" | "done";
export type Job = {
  id: string;
  title: string;
  appliance: string;
  brand: string;
  model: string;
  status: JobStatus;
  diagnosis: string;
  ruled_out: string[];
  tried: string[];
  parts_needed: string[];
  parts: JobPart[];
  pros: JobPro[];
  location?: string;
  appointment?: { pro: string; phone?: string; at: number };
  follow_ups: JobFollowUp[];
  log: JobLog[];
  created_at: number;
  updated_at: number;
};

const deviceKey = "helpa-device";

/** An anonymous id for this phone, made once: it's the only key to your jobs, so nobody else can read them. */
export function deviceId() {
  try {
    let id = localStorage.getItem(deviceKey);
    if (!id || !/^[a-f0-9]{32}$/.test(id)) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(deviceKey, id);
    }
    return id;
  } catch {
    return "";
  }
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}/api/jobs${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Helpa-Device": deviceId() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error((await response.text()).trim() || "Something went wrong. Try again?");
  return response.json();
}

export const listJobs = () => call<Job[]>("GET", "");

/** Starts a job from a plan: what's wrong, what was tried, the parts it may need. */
export function createJob(plan: Plan, options: { title: string; ruledOut: string[]; status: JobStatus }) {
  return call<Job>("POST", "", {
    title: options.title,
    appliance: plan.appliance,
    brand: plan.brand,
    model: plan.model_number,
    diagnosis: plan.diagnosis,
    status: options.status,
    ruledOut: options.ruledOut,
    tried: plan.steps.map((step) => step.instruction),
    partsNeeded: plan.replacement_parts,
  });
}

export const setJobStatus = (id: string, status: JobStatus | "", note = "", update: { diagnosis?: string; partsNeeded?: string[]; ruledOut?: string[] } = {}) =>
  call<Job>("POST", `/${id}/status`, { status, note, ...update });
export const addFollowUp = (id: string, label: string, due: number) => call<Job>("POST", `/${id}/follow-ups`, { label, due });
export const finishFollowUp = (id: string, followUp: string) => call<Job>("POST", `/${id}/follow-ups`, { done: followUp });
export const findPart = (id: string, part: string) => call<{ job: Job; sample: boolean }>("POST", `/${id}/parts/find`, { part });
export const markOrdered = (id: string, part: string, order: { store: string; tracking: string; carrier?: string; orderURL?: string }) =>
  call<Job>("POST", `/${id}/parts/${part}/ordered`, order);
export const findPros = (id: string, location: string) => call<{ job: Job; sample: boolean }>("POST", `/${id}/pros/find`, { location });
export const markContacted = (id: string, pro: string) => call<Job>("POST", `/${id}/appointment`, { contacted: pro });
export const bookPro = (id: string, pro: JobPro, at: number) => call<Job>("POST", `/${id}/appointment`, { pro: pro.name, phone: pro.phone, at });
export const deleteJob = (id: string) => call<Job>("POST", `/${id}/delete`, {});

/** A plan's wording ("Thermal fuse for your model (match it...)") as the part's name ("Thermal fuse"); same rule as the backend. */
export function shortPart(name: string) {
  let short = name;
  for (const cut of [" (", ", only if", ", if ", " only if", " for your", ", the same", " if "]) {
    const index = short.toLowerCase().indexOf(cut);
    if (index > 3) short = short.slice(0, index);
  }
  return short.replace(/^(A new |New )/, "").trim();
}

/** What a pro needs to know before they come, so you aren't charged to diagnose it twice. */
export function jobSummary(job: Job) {
  const machine = [job.brand, job.model, job.appliance].filter(Boolean).join(" ");
  const lines = [`${machine}: ${job.title}`];
  if (job.diagnosis) lines.push(`Likely cause: ${job.diagnosis}`);
  if (job.ruled_out.length) lines.push(`Already ruled out: ${job.ruled_out.join("; ")}`);
  for (const part of job.parts) if (part.part_number) lines.push(`Part: ${part.name} (${part.part_number})`);
  return lines.join("\n");
}

/** Next few days, morning and afternoon, for "I'm free..." in the message to a pro. */
export function timeSlots(now = new Date()) {
  const slots: { label: string; at: number }[] = [];
  for (let offset = 1; slots.length < 8; offset++) {
    const day = new Date(now);
    day.setDate(now.getDate() + offset);
    if (day.getDay() === 0) continue;
    const name = offset === 1 ? "Tomorrow" : day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    for (const [part, hour] of [["morning", 9], ["afternoon", 13]] as const) {
      const at = new Date(day);
      at.setHours(hour, 0, 0, 0);
      slots.push({ label: `${name} ${part}`, at: at.getTime() });
    }
  }
  return slots;
}

/** An .ics file for the appointment, so it lands in whatever calendar the phone uses. */
export function calendarFile(job: Job) {
  if (!job.appointment) return null;
  const stamp = (time: number) => new Date(time).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const escape = (text: string) => text.replace(/[\\;,]/g, (character) => `\\${character}`).replace(/\n/g, "\\n");
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Helpa//Jobs//EN",
    "BEGIN:VEVENT",
    `UID:${job.id}@helpa`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(job.appointment.at)}`,
    `DTEND:${stamp(job.appointment.at + 2 * 3600_000)}`,
    `SUMMARY:${escape(`${job.appointment.pro}: ${job.appliance}`)}`,
    `DESCRIPTION:${escape(jobSummary(job))}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Pro visit",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return new Blob([body], { type: "text/calendar" });
}

/** Turns on push notifications: registers the service worker and hands the subscription to the backend. */
export async function enableNotifications(): Promise<"on" | "denied" | "unsupported"> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const { key } = (await (await fetch(`${API_URL}/api/push/key`)).json()) as { key: string };
  const padded = key.replace(/-/g, "+").replace(/_/g, "/");
  const applicationServerKey = Uint8Array.from(atob(padded + "=".repeat((4 - (padded.length % 4)) % 4)), (character) => character.charCodeAt(0));
  const subscription = (await registration.pushManager.getSubscription()) ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey }));
  const response = await fetch(`${API_URL}/api/push/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Helpa-Device": deviceId() },
    body: JSON.stringify(subscription.toJSON()),
  });
  return response.ok ? "on" : "unsupported";
}

export function notificationsOn() {
  return typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted";
}

/** What Helpa suggests doing next on a job, in a few words, for the job cards. */
export function nextUp(job: Job): string {
  const part = job.parts.find((candidate) => candidate.status !== "delivered") ?? job.parts[0];
  switch (job.status) {
    case "needs_part":
      return part ? `Order the ${part.name.toLowerCase()}` : `Find the ${job.parts_needed[0] ?? "part"}`;
    case "waiting_part":
      return part?.status === "out_for_delivery" ? "Part arriving today" : part?.eta ? `Part arriving ${part.eta}` : "Part on its way";
    case "part_arrived":
      return "Part's here: install it";
    case "needs_pro":
      return job.pros.length ? "Pick a pro to call" : "Find a pro near you";
    case "pro_booked":
      return job.appointment ? `${job.appointment.pro}, ${new Date(job.appointment.at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}` : "Pro booked";
    case "done": {
      const due = job.follow_ups.find((followUp) => !followUp.done);
      return due ? `Check ${new Date(due.due).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "Fixed";
    }
    default:
      return "In progress";
  }
}
