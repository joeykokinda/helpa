import type { Plan } from "./api";
import { shrinkPhoto } from "./media";

/** My Home: every machine Helpa has helped with, kept on the phone (IndexedDB), no account. */

export type Fix = { date: number; problem: string; steps: string[]; photos: Blob[]; sample: boolean };
export type ChatLine = { role: "you" | "helpa"; text: string; complaint?: string };
export type Machine = {
  id: string;
  name: string;
  appliance: string;
  brand: string;
  model: string;
  manualUrl: string;
  parts: string[];
  rig?: { id: string; recipe?: unknown };
  sample: boolean;
  fixes: Fix[];
  /** When each care reminder was last done, by reminder id. */
  care: Record<string, number>;
  chat: ChatLine[];
  createdAt: number;
};

export type Care = { id: string; label: string; every: string; days: number; matches: RegExp };

const day = 86_400_000;

/** Routine care per kind of machine; days 0 means "every time you use it", a tip that is never overdue. */
const careByKind: [RegExp, Care[]][] = [
  [
    /dryer/,
    [
      { id: "lint", label: "Clean the lint screen", every: "Every load", days: 0, matches: /lint/i },
      { id: "vent", label: "Clean the dryer vent", every: "Once a year", days: 365, matches: /vent/i },
    ],
  ],
  [/dishwasher/, [{ id: "filter", label: "Rinse the filter", every: "Once a month", days: 30, matches: /filter/i }]],
  [/disposal/, [{ id: "freshen", label: "Freshen the disposal with ice and cold water", every: "Once a month", days: 30, matches: /clean|rinse|ice|jam/i }]],
  [/washer/, [{ id: "clean", label: "Run a clean-washer cycle", every: "Once a month", days: 30, matches: /clean|affresh|filter/i }]],
  [/microwave/, [{ id: "grease", label: "Wash the grease filters", every: "Once a month", days: 30, matches: /grease|filter/i }]],
  [/car|truck|suv|vehicle|camry|sedan/, [{ id: "oil", label: "Change the oil", every: "Every 10,000 miles or 12 months", days: 365, matches: /oil/i }]],
];

export function careFor(machine: Pick<Machine, "appliance" | "rig">): Care[] {
  const kind = `${machine.rig?.id ?? ""} ${machine.appliance}`.toLowerCase();
  return careByKind.find(([pattern]) => pattern.test(kind))?.[1] ?? [];
}

export function isDue(machine: Machine, care: Care, now = Date.now()) {
  return care.days > 0 && now - (machine.care[care.id] ?? machine.createdAt) > care.days * day;
}

export type Status = { label: string; tone: "ok" | "repaired" | "due" };

export function statusOf(machine: Machine, now = Date.now()): Status {
  if (careFor(machine).some((care) => isDue(machine, care, now))) return { label: "Maintenance due", tone: "due" };
  const last = machine.fixes[0];
  if (last && now - last.date < 30 * day) return { label: `Repaired ${new Date(last.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`, tone: "repaired" };
  return { label: "Healthy", tone: "ok" };
}

const unknown = /unknown|not visible|n\/a/i;
const clean = (value: string) => (value && !unknown.test(value) ? value.trim() : "");

/** Same machine across fixes: brand and model when known, otherwise the kind of appliance. */
export function machineKey(plan: Pick<Plan, "brand" | "model_number" | "appliance">) {
  const exact = [clean(plan.brand), clean(plan.model_number)].filter(Boolean).join(" ");
  return (clean(plan.model_number) ? exact : `${exact} ${plan.appliance}`).toLowerCase().replace(/\s+/g, " ").trim();
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("helpa", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("machines", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await open();
  return new Promise((resolve, reject) => {
    const request = work(database.transaction("machines", mode).objectStore("machines"));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listMachines(): Promise<Machine[]> {
  try {
    const machines = await run<Machine[]>("readonly", (store) => store.getAll());
    return machines.sort((a, b) => (b.fixes[0]?.date ?? b.createdAt) - (a.fixes[0]?.date ?? a.createdAt));
  } catch {
    // Private mode or blocked storage: My Home is simply empty.
    return [];
  }
}

export const putMachine = (machine: Machine) => run("readwrite", (store) => store.put(machine));

/** Saves a finished fix, adding the machine the first time; care the fix covered counts as done today. */
export async function saveFix(
  plan: Plan,
  options: { rig?: { id: string; recipe?: unknown }; photos: Blob[]; sample: boolean },
): Promise<Machine> {
  const id = machineKey(plan);
  const now = Date.now();
  const existing = (await listMachines()).find((machine) => machine.id === id);
  const isCar = /^(car|truck|suv|vehicle)$/i.test(plan.appliance.trim());
  const machine: Machine = existing ?? {
    id,
    name: isCar ? "car" : plan.appliance,
    appliance: plan.appliance,
    brand: clean(plan.brand),
    model: clean(plan.model_number),
    manualUrl: plan.manual_url,
    parts: [],
    sample: options.sample,
    fixes: [],
    care: {},
    chat: [],
    createdAt: now,
  };
  if (options.rig) machine.rig = options.rig;
  if (!options.sample) machine.sample = false;
  machine.manualUrl ||= plan.manual_url;
  machine.parts = [...new Set([...machine.parts, ...plan.replacement_parts])];
  const thumbnails = await Promise.all(options.photos.slice(0, 3).map((photo) => shrinkPhoto(photo, 320).catch(() => photo)));
  machine.fixes = [{ date: now, problem: plan.library_problem || plan.diagnosis, steps: plan.steps.map((step) => step.instruction), photos: thumbnails, sample: options.sample }, ...machine.fixes];
  const done = [plan.diagnosis, plan.library_problem, ...plan.steps.map((step) => step.instruction)].join(" ");
  for (const care of careFor(machine)) if (care.matches.test(done)) machine.care[care.id] = now;
  await putMachine(machine);
  return machine;
}
