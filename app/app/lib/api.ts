import type { Beat } from "./rig/types";
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export type Motion =
  | "none"
  | "twist_ccw"
  | "twist_cw"
  | "lift"
  | "pull_out"
  | "push_in"
  | "press"
  | "unscrew"
  | "screw_in"
  | "rinse";

export type PlanStep = {
  instruction: string;
  /** 0 to 3 extra lines shown under a "More help" disclosure. */
  details: string[];
  target_part: string;
  photo: number;
  motion: Motion;
  show_3d: boolean;
  check: string;
};

export type Plan = {
  brand: string;
  model_number: string;
  appliance: string;
  manual_url: string;
  diagnosis: string;
  tools: string[];
  replacement_parts: string[];
  safety: string[];
  steps: PlanStep[];
  library_id: string;
  library_problem: string;
  /** Typical cost of a technician for this fix; 0 when nobody would call one. Missing on older plans. */
  pro_visit_cost?: number;
  aftercare?: string;
};

export type ScenePart = {
  id: string;
  label: string;
  shape: "box" | "rounded_box" | "cylinder" | "tube" | "sphere" | "cone" | "torus" | "capsule";
  size: number[];
  position: number[];
  rotation: number[];
  color: string;
  opacity: number;
};

export type StepAnimation = {
  step: number;
  part_ids: string[];
  motion: Motion;
  axis: "x" | "y" | "z";
  distance: number;
  caption: string;
};

export type Scene = { parts: ScenePart[]; step_animations: StepAnimation[] };

export type SearchAction = { type: string; query?: string; queries?: string[]; url?: string; pattern?: string };

export type AgentEvent =
  | { type: "say"; text: string }
  /** The fast first look, before research; it can come twice when a question's answer sharpens it. */
  | { type: "identify"; appliance: string; brand: string; model_number: string; confidence: number; symptom: string }
  /** Progress of one parallel track: the 3D model, the research, or spotting parts on the photos. */
  | { type: "track"; track: "model" | "research" | "measure"; state: "active" | "done"; title: string; detail: string }
  | { type: "status"; text: string }
  | { type: "search"; action: SearchAction }
  | { type: "library"; brand: string; appliance: string; model_family: string }
  | { type: "parts"; photo: number; phrase: string; found: number; sam: string; size_cm?: number }
  | { type: "plan"; plan: Plan }
  /** A built-in model by id, or rig "generated" with an on-demand recipe and its catalog inline. */
  | { type: "rig"; rig: string; step_beats: Beat[][]; recipe?: unknown; catalog?: unknown }
  /** The agent needs an answer before it can continue; reply with POST /api/answer. */
  | { type: "question"; session: string; question: string; choices: string[] }
  | { type: "model"; scene: Scene }
  | { type: "model_error"; message: string }
  | { type: "step_parts"; step: number; photo: number; found: number; sam: string }
  | { type: "error"; message: string }
  | { type: "done" };

/** Posts photos and a description to the agent and calls onEvent for every streamed event. */
export async function streamFix(photos: Blob[], complaint: string, onEvent: (event: AgentEvent) => void, sample?: string) {
  const form = new FormData();
  photos.forEach((photo, index) => form.append("photos", photo, `photo-${index}.jpg`));
  form.append("complaint", complaint);
  // A sample id makes the backend replay that sample's recorded run instead of calling the models.
  if (sample) form.append("sample", sample);
  const response = await fetch(`${API_URL}/api/fix`, { method: "POST", body: form });
  if (!response.ok || !response.body) {
    throw new Error((await response.text()) || `request failed (${response.status})`);
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += value;
    const chunks = buffered.split("\n\n");
    buffered = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk.split("\n").find((candidate) => candidate.startsWith("data: "));
      if (line) onEvent(JSON.parse(line.slice(6)) as AgentEvent);
    }
  }
}

/** Answers a question the agent asked; the original fix stream carries on. */
export async function answerQuestion(session: string, answer: string) {
  const response = await fetch(`${API_URL}/api/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session, answer }),
  });
  if (!response.ok) throw new Error((await response.text()) || "I missed that, try again?");
}

export async function transcribe(wav: Blob): Promise<string> {
  const form = new FormData();
  form.append("audio", wav, "speech.wav");
  const response = await fetch(`${API_URL}/api/transcribe`, { method: "POST", body: form });
  if (!response.ok) throw new Error("I couldn't hear that, try again?");
  return ((await response.json()) as { text: string }).text;
}

export type CheckResult = {
  /** Older replies only carry done. */
  status?: "COMPLETED" | "INCOMPLETE" | "UNCERTAIN";
  done: boolean;
  evidence?: string;
  feedback: string;
  mistake?: string;
};

/** Judges a photo of a step. Live frames come from the camera mid-step, so only clear results and mistakes count. */
export async function checkStep(photo: Blob, step: PlanStep, options: { part?: string; live?: boolean } = {}): Promise<CheckResult> {
  const form = new FormData();
  form.append("photo", photo, "check.jpg");
  form.append("instruction", step.instruction);
  form.append("check", step.check);
  if (options.part) form.append("part", options.part);
  if (options.live) form.append("live", "1");
  const response = await fetch(`${API_URL}/api/check`, { method: "POST", body: form });
  if (!response.ok) throw new Error("I couldn't check that photo, try again?");
  return response.json();
}

/** Finds a part on a camera frame with SAM 3.1, trying each name in turn; sam is empty when nothing matched. */
export async function locatePart(frame: Blob, phrases: string[], kind: "part" | "label" = "part"): Promise<{ sam: string; phrase: string }> {
  const form = new FormData();
  form.append("photo", frame, "frame.jpg");
  phrases.forEach((phrase) => form.append("phrase", phrase));
  form.append("kind", kind);
  const response = await fetch(`${API_URL}/api/locate`, { method: "POST", body: form });
  if (!response.ok) throw new Error("locate failed");
  return response.json();
}

export type LabelReading = { found: boolean; brand: string; model_number: string; serial: string; vin: string; description: string };

/** Reads the brand, model number and serial (or a VIN) off a close crop of a sticker. */
export async function readLabel(crop: Blob): Promise<LabelReading> {
  const form = new FormData();
  form.append("photo", crop, "label.jpg");
  const response = await fetch(`${API_URL}/api/read-label`, { method: "POST", body: form });
  if (!response.ok) throw new Error("I couldn't read that label.");
  return response.json();
}

function hostname(url: string | undefined) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

/** Turns a raw web action into a friendly progress row; the key folds repeats into one row. */
export function describeSearch(action: SearchAction): { key: string; title: string; detail: string } {
  if (action.type === "open_page") return { key: "read", title: "Reading the manual", detail: hostname(action.url) };
  if (action.type === "find_in_page") return { key: "find", title: "Finding the right section", detail: action.pattern ? `Looking for "${action.pattern}"` : "" };
  return { key: "search", title: "Looking up your model", detail: "Searching official guides" };
}
