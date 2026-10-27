export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8095";

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
  target_part: string;
  photo: number;
  motion: Motion;
  check: string;
};

export type Plan = {
  brand: string;
  model_number: string;
  manual_url: string;
  diagnosis: string;
  tools: string[];
  replacement_parts: string[];
  safety: string[];
  steps: PlanStep[];
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
  | { type: "status"; text: string }
  | { type: "search"; action: SearchAction }
  | { type: "parts"; photo: number; phrase: string; found: number; sam: string }
  | { type: "plan"; plan: Plan }
  | { type: "model"; scene: Scene }
  | { type: "model_error"; message: string }
  | { type: "step_parts"; step: number; photo: number; found: number; sam: string }
  | { type: "error"; message: string }
  | { type: "done" };

/** Posts photos and a description to the agent and calls onEvent for every streamed event. */
export async function streamFix(photos: Blob[], complaint: string, onEvent: (event: AgentEvent) => void) {
  const form = new FormData();
  photos.forEach((photo, index) => form.append("photos", photo, `photo-${index}.jpg`));
  form.append("complaint", complaint);
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

export async function transcribe(wav: Blob): Promise<string> {
  const form = new FormData();
  form.append("audio", wav, "speech.wav");
  const response = await fetch(`${API_URL}/api/transcribe`, { method: "POST", body: form });
  if (!response.ok) throw new Error("I couldn't hear that, try again?");
  return ((await response.json()) as { text: string }).text;
}

export async function checkStep(photo: Blob, step: PlanStep): Promise<{ done: boolean; feedback: string }> {
  const form = new FormData();
  form.append("photo", photo, "check.jpg");
  form.append("instruction", step.instruction);
  form.append("check", step.check);
  const response = await fetch(`${API_URL}/api/check`, { method: "POST", body: form });
  if (!response.ok) throw new Error("I couldn't check that photo, try again?");
  return response.json();
}

export function describeSearch(action: SearchAction): string {
  if (action.type === "open_page" && action.url) return `Reading ${new URL(action.url).hostname}`;
  if (action.type === "find_in_page") return `Looking for "${action.pattern ?? ""}" in the manual`;
  return `Searching "${action.query ?? action.queries?.[0] ?? ""}"`;
}
