"use client";

import ThemeToggle from "./components/ThemeToggle";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import AgentTracks, { lanesFrom, type ProgressRow } from "./components/AgentTracks";
import Capture, { cameraPrompt } from "./components/Capture";
import CheckMoment, { type CheckState } from "./components/CheckMoment";
import Confetti from "./components/Confetti";
import Done, { needsPro } from "./components/Done";
import Outcome from "./components/Outcome";
import MachinePage from "./components/MachinePage";
import MyHome from "./components/MyHome";
import JobPage from "./components/JobPage";
import { addFollowUp, createJob, listJobs, setJobStatus, type Job, type JobPart } from "./lib/jobs";
import Helpa, { type HelpaMood } from "./components/Helpa";
import Icon, { type IconName } from "./components/Icons";
import Onboarding, { hasOnboarded } from "./components/Onboarding";
import PartPhoto from "./components/PartPhoto";
import { rigLoaders } from "./components/rig/registry";
import { listMachines, saveFix, type Machine } from "./lib/home";
import { answerQuestion, checkStep, describeSearch, illustrateStep, streamFix, type AgentEvent, type Attempt, type Plan, type Scene } from "./lib/api";
import { requestMotionPermission } from "./lib/live";
import { usePrefs } from "./lib/prefs";
import { useVoiceCommands, type VoiceCommand } from "./lib/voice";
import HandsFree from "./components/HandsFree";
import { shrinkPhoto, speak, stopSpeaking } from "./lib/media";
import { tidy } from "./lib/text";
import type { Beat } from "./lib/rig/types";

const RigStep = dynamic(() => import("./components/rig/RigStep"), { ssr: false });
const LiveGuide = dynamic(() => import("./components/LiveGuide"), { ssr: false });
const Storyboard = dynamic(() => import("./components/Storyboard"), { ssr: false });
const Scene3D = dynamic(() => import("./components/Scene3D"), {
  ssr: false,
  loading: () => <SceneSkeleton text="Building your 3D model" />,
});


/** The bubble stays short; the full text is on the page and spoken aloud. */
function firstSentence(text: string) {
  const sentence = text.match(/^.+?[.!?](\s|$)/)?.[0]?.trim() ?? text;
  return sentence.length > 90 ? `${sentence.slice(0, 87).trimEnd()}…` : sentence;
}

function minutesSince(start: number) {
  return Math.round((Date.now() - start) / 60000);
}

function known(value: string | undefined) {
  return value && !/unknown|not visible|n\/a/i.test(value) ? tidy(value) : "";
}

/** "Whirlpool WED5050LW", "2015 Toyota Camry 2.5L": the exact machine, so it's clearly theirs. */
function identityOf(plan: { brand: string; model_number: string }) {
  const brand = known(plan.brand);
  const model = known(plan.model_number);
  if (!model) return brand;
  if (brand && model.toLowerCase().includes(brand.toLowerCase())) return model;
  const year = model.match(/^((?:19|20)\d\d)\s+(.+)$/);
  return (year ? `${year[1]} ${brand} ${year[2]}` : `${brand} ${model}`).replace(/\s+/g, " ").trim();
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const toolIcons: [RegExp, IconName][] = [
  [/screwdriver/i, "screwdriver"],
  [/wrench|hex|allen|key|pliers|socket/i, "wrench"],
  [/flashlight|torch|light/i, "flashlight"],
  [/towel|rag|cloth|bucket|bowl|pan|tray|container|water|vinegar/i, "droplet"],
  [/glove/i, "hand"],
  [/brush|toothbrush|sponge|soap|clean/i, "brush"],
  [/tape|measure|ruler/i, "ruler"],
  [/phone|camera/i, "camera"],
];

function iconFor(tool: string): IconName {
  return toolIcons.find(([pattern]) => pattern.test(tool))?.[1] ?? "toolbox";
}

type Stage = "home" | "machine" | "job" | "start" | "working" | "plan" | "step" | "outcome" | "done";
type Question = { session: string; question: string; choices: string[] };

const noSubscription = () => () => {};

export default function Home() {
  const firstRun = useSyncExternalStore(noSubscription, () => !hasOnboarded(), () => null);
  const [tutorial, setTutorial] = useState<"auto" | "open" | "closed">("auto");
  // Everyone starts at home: show it, tell it, or pick it.
  const [stage, setStage] = useState<Stage>("home");
  const [mood, setMood] = useState<HelpaMood>("idle");
  const [speaking, setSpeaking] = useState(false);
  const [bubble, setBubble] = useState(cameraPrompt);
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [libraryHit, setLibraryHit] = useState<{ brand: string; appliance: string; model_family: string } | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [activePhoto, setActivePhoto] = useState(0);
  const [partMasks, setPartMasks] = useState<Record<number, string[]>>({});
  const [stepMasks, setStepMasks] = useState<Record<number, string>>({});
  const [plan, setPlan] = useState<Plan | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  // A built-in appliance model with beats per step; preferred over the generated scene when present.
  // A generated model (rig "generated") carries its recipe and catalog inline for RigStep to render.
  const [rig, setRig] = useState<{ id: string; stepBeats: Beat[][]; recipe?: unknown; catalog?: unknown } | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const identified = useRef(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  // "auto" picks 3D when this step has it; the 3D model can arrive a moment after the plan.
  const [view, setView] = useState<"auto" | "3d" | "photo">("auto");
  // Live Guide: the step played as holograms on the camera, then watched while you do it.
  const [live, setLive] = useState(false);
  const [check, setCheck] = useState<CheckState | null>(null);
  const checkInputRef = useRef<HTMLInputElement>(null);
  const checkToken = useRef(0);
  const startedAt = useRef(0);
  const [fixMinutes, setFixMinutes] = useState(0);
  // My Home: the machines Helpa remembers, kept on the phone.
  const [machines, setMachines] = useState<Machine[]>([]);
  // Hold the first screen until My Home is read, so returning people don't flash the camera first.
  const [homeLoaded, setHomeLoaded] = useState(false);
  const [machineId, setMachineId] = useState<string>();
  const [prefill, setPrefill] = useState<{ identity: string; description: string }>();
  const [savedName, setSavedName] = useState("");
  const runRef = useRef<{ photos: Blob[]; sample?: string; description: string; attempts: Attempt[]; fix?: string }>({ photos: [], description: "", attempts: [] });
  // Hands-free: spoken commands drive the steps while your hands are busy.
  const { handsFree } = usePrefs();
  const [heard, setHeard] = useState("");
  const heardTimer = useRef(0);
  const [liveCommand, setLiveCommand] = useState<{ command: VoiceCommand; at: number } | null>(null);
  // Jobs: every fix carried through to working again (the part, the pro, the reminder), worked on by Helpa's agents.
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobId, setJobId] = useState<string>();
  const runJob = useRef<string | undefined>(undefined);
  // The same id as state, for the screens to show "find a pro" / "get the part" (refs can't be read while rendering).
  const [currentJob, setCurrentJob] = useState<string>();
  const trackRunJob = (id: string | undefined) => {
    runJob.current = id;
    setCurrentJob(id);
  };
  const rememberJob = (job: Job) => setJobs((current) => [job, ...current.filter((other) => other.id !== job.id)]);
  // Muse Image's drawing of the fix on the person's own photo: requested once the plan is known.
  const [drawing, setDrawing] = useState<{ state: "drawing" | "ready"; url?: string } | null>(null);
  const drawingRun = useRef(0);
  // Fixes already tried this time that didn't work ("Still broken"), shown as what we've ruled out.
  const [attempts, setAttempts] = useState<Attempt[]>([]);

  useEffect(() => {
    listMachines().then((list) => {
      setMachines(list);
      setHomeLoaded(true);
    });
    listJobs()
      .then((list) => {
        setJobs(list);
        // A tapped notification opens its job (?job=...).
        const opened = new URLSearchParams(window.location.search).get("job");
        if (opened && list.some((job) => job.id === opened)) {
          setJobId(opened);
          setStage("job");
          window.history.replaceState(null, "", "/");
        }
      })
      .catch(() => {});
  }, []);

  // While a job or home is on screen, pick up what Helpa's agents did in the background (a part shipped, arrived).
  useEffect(() => {
    if (stage !== "job" && stage !== "home") return;
    const timer = window.setInterval(() => {
      if (!document.hidden) listJobs().then(setJobs).catch(() => {});
    }, 15000);
    return () => window.clearInterval(timer);
  }, [stage]);

  const rememberMachine = (machine: Machine) => setMachines((current) => [machine, ...current.filter((other) => other.id !== machine.id)]);

  const showTutorial = tutorial === "open" || (tutorial === "auto" && firstRun === true);

  const say = (text: string, nextMood: HelpaMood = "explaining", aloud = true) => {
    const clean = tidy(text);
    setBubble(firstSentence(clean));
    setMood(nextMood);
    if (aloud) speak(clean, setSpeaking);
  };

  const addRow = (row: ProgressRow) =>
    setRows((current) =>
      current.some((existing) => existing.key === row.key)
        ? current.map((existing) => (existing.key === row.key ? { ...row, detail: row.detail || existing.detail } : existing))
        : [...current, row],
    );

  const handleEvent = (agentEvent: AgentEvent) => {
    switch (agentEvent.type) {
      case "say":
        say(agentEvent.text, "thinking");
        addRow({ key: "identify", title: "Figured out what it is", detail: "" });
        break;
      case "identify": {
        // Cars read better by make and model ("Toyota Camry"), appliances by brand and kind ("Whirlpool dryer").
        const isCar = /^(car|truck|suv|vehicle)$/i.test(agentEvent.appliance.trim());
        const name = [known(agentEvent.brand), isCar ? known(agentEvent.model_number) || known(agentEvent.appliance) : known(agentEvent.appliance)].filter(Boolean).join(" ");
        if (!name) break;
        addRow({ key: "identify", title: "Figured out what it is", detail: capitalize(name) });
        if (!identified.current) say(`That looks like ${/^[aeiou]/i.test(name) ? "an" : "a"} ${name}.`, "found");
        identified.current = true;
        break;
      }
      case "track":
        addRow({ key: `track-${agentEvent.track}`, title: agentEvent.title, detail: agentEvent.detail, state: agentEvent.state });
        break;
      case "question":
        setQuestion({ session: agentEvent.session, question: agentEvent.question, choices: agentEvent.choices });
        stopSpeaking();
        say(agentEvent.question, "explaining");
        // The question is short; show all of it rather than the bubble's first sentence.
        setBubble(tidy(agentEvent.question));
        break;
      case "library":
        setLibraryHit({ brand: agentEvent.brand, appliance: agentEvent.appliance, model_family: agentEvent.model_family });
        addRow({ key: "library", title: "Found it in my library", detail: [agentEvent.brand, agentEvent.model_family].filter(Boolean).join(" ") });
        // The library card says it on screen; Helpa only says it out loud.
        speak(tidy(`I know this one! ${agentEvent.brand} ${agentEvent.appliance}.`), setSpeaking);
        setMood("found");
        break;
      case "search":
        setMood("searching");
        addRow(describeSearch(agentEvent.action));
        break;
      case "parts":
        if (agentEvent.found > 0) {
          setMood("found");
          setActivePhoto(agentEvent.photo);
          setPartMasks((current) => ({ ...current, [agentEvent.photo]: [...(current[agentEvent.photo] ?? []), agentEvent.sam] }));
          addRow({
            key: `part-${agentEvent.phrase}`,
            title: `Spotted the ${agentEvent.phrase}`,
            detail: agentEvent.size_cm ? `About ${Math.round(agentEvent.size_cm)} cm, highlighted on your photo` : "Highlighted on your photo",
          });
        }
        break;
      case "plan":
        setQuestion(null);
        setPlan(agentEvent.plan);
        setStage("plan");
        {
          const tried = runRef.current.attempts.map((attempt) => attempt.cause);
          say(tried.length ? `Okay, so it wasn't ${tried[tried.length - 1]}. ${agentEvent.plan.diagnosis}` : agentEvent.plan.diagnosis);
        }
        if (agentEvent.plan.safety.length) setTimeout(() => setMood("worried"), 400);
        drawFix(agentEvent.plan);
        trackJob(agentEvent.plan);
        break;
      case "rig":
        setRig({ id: agentEvent.rig, stepBeats: agentEvent.step_beats, recipe: agentEvent.recipe, catalog: agentEvent.catalog });
        break;
      case "model":
        setScene(agentEvent.scene);
        break;
      case "model_error":
        setSceneFailed(true);
        break;
      case "step_parts":
        if (agentEvent.found > 0) setStepMasks((current) => ({ ...current, [agentEvent.step]: agentEvent.sam }));
        break;
      case "error":
        setQuestion(null);
        say("Hmm, something went wrong on my end. Can we try that again?", "worried");
        setStage("start");
        break;
    }
  };

  /** Runs a fix: from photos and words, a recorded sample, a "Still broken" follow-up, or a fix picked from the list. */
  /** Asks Muse Image to draw the main move on the person's own photo; recorded samples and safety stops get none. */
  const drawFix = (fixPlan: Plan) => {
    const { photos, sample } = runRef.current;
    if (!photos.length || sample || fixPlan.stop_for_pro) return;
    const main = fixPlan.steps.find((candidate) => candidate.target_part && candidate.motion !== "none") ?? fixPlan.steps.find((candidate) => candidate.target_part);
    if (!main) return;
    const run = ++drawingRun.current;
    setDrawing({ state: "drawing" });
    illustrateStep(photos[main.photo >= 0 && main.photo < photos.length ? main.photo : 0], fixPlan.appliance, main.target_part, main.instruction).then((blob) => {
      if (run !== drawingRun.current) return;
      setDrawing(blob ? { state: "ready", url: URL.createObjectURL(blob) } : null);
    });
  };

  /** Every plan is a job: a new one for a new problem, a note on the same job when the first fix didn't work. */
  const trackJob = (fixPlan: Plan) => {
    const ruledOut = runRef.current.attempts.map((attempt) => attempt.cause);
    const proNeeded = needsPro(fixPlan);
    if (runJob.current) {
      const id = runJob.current;
      // A follow-up after "Still broken", or the install guide for a part that arrived.
      const note = ruledOut.length ? `Ruled out ${ruledOut[ruledOut.length - 1]}. Next most likely: ${firstSentence(tidy(fixPlan.diagnosis))}` : `Install guide ready: ${fixPlan.steps.length} steps.`;
      setJobStatus(id, proNeeded ? "needs_pro" : "", note, { diagnosis: fixPlan.diagnosis, partsNeeded: fixPlan.replacement_parts, ruledOut })
        .then(rememberJob)
        .catch(() => {});
      return;
    }
    const title = capitalize(firstSentence(tidy(runRef.current.description || fixPlan.diagnosis)).replace(/\.$/, "")).slice(0, 90);
    createJob(fixPlan, { title, ruledOut, status: proNeeded ? "needs_pro" : "fixing" })
      .then((job) => {
        trackRunJob(job.id);
        rememberJob(job);
      })
      .catch(() => {});
  };

  const openJob = (id?: string) => {
    if (!id) return;
    stopSpeaking();
    setJobId(id);
    setStage("job");
  };

  /** The part arrived: Helpa researches how to put it in on this exact machine and walks through it. */
  const installPart = (job: Job, part: JobPart) => {
    const number = part.part_number ? ` (part number ${part.part_number})` : "";
    const machine = [job.brand, job.model, job.appliance].filter(Boolean).join(" ");
    start([], `My new ${part.name}${number} arrived. Show me how to install it on my ${machine}. The problem was: ${job.title}. ${job.diagnosis}`);
    trackRunJob(job.id);
  };

  const start = async (photos: Blob[], description: string, sample?: string, tried: Attempt[] = [], fix?: string) => {
    stopSpeaking();
    setStage("working");
    // A follow-up keeps counting from the first try.
    if (!tried.length) startedAt.current = Date.now();
    runRef.current = { photos, sample, description, attempts: tried, fix };
    if (!tried.length) trackRunJob(undefined);
    drawingRun.current++;
    setDrawing(null);
    setAttempts(tried);
    const followUp = tried.length && plan ? { attempts: tried, brand: plan.brand, model_number: plan.model_number } : undefined;
    setSavedName("");
    setLive(false);
    setRows([{ key: "look", title: photos.length ? "Looking at your photo" : "Understanding the problem", detail: description ? `"${firstSentence(description)}"` : "" }]);
    setLibraryHit(null);
    setActivePhoto(0);
    setPartMasks({});
    setStepMasks({});
    setPlan(null);
    setScene(null);
    setRig(null);
    setQuestion(null);
    identified.current = false;
    setSceneFailed(false);
    setPhotoUrls(photos.map((photo) => URL.createObjectURL(photo)));
    say(tried.length ? "Okay, let's find the next most likely cause." : "Okay, let me take a look!", "thinking");
    let received = 0;
    let finished = false;
    const onEvent = (agentEvent: AgentEvent) => {
      received++;
      if (agentEvent.type === "plan" || agentEvent.type === "error") finished = true;
      handleEvent(agentEvent);
    };
    for (let attempt = 0; ; attempt++) {
      try {
        // A follow-up isn't the sample's recorded run any more, so it goes to the real pipeline.
        await streamFix(photos, description, onEvent, followUp ? undefined : sample, followUp, followUp ? undefined : fix);
        break;
      } catch {
        // Retrying is only safe before anything arrived; mid-run it would repeat the work and the questions.
        if (received > 0 || attempt > 0) break;
        say("My connection blinked. Trying again…", "thinking", false);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
    if (!finished) {
      say(received ? "I lost the connection partway through. Can we try that again?" : "I couldn't reach my workshop. Check your connection and try again?", "worried");
      setStage("start");
    }
  };

  const answer = async (text: string) => {
    const asked = question;
    const reply = text.trim();
    if (!asked || !reply) return;
    setQuestion(null);
    addRow({ key: `answer-${asked.question}`, title: "You told me", detail: `"${firstSentence(reply)}"` });
    stopSpeaking();
    say("Got it, thanks!", "found");
    try {
      await answerQuestion(asked.session, reply);
    } catch {
      setQuestion(asked);
      say("I missed that. Can you answer again?", "worried");
    }
  };

  // Only models the app can draw count: a built-in rig, or a generated one that brought its recipe.
  const playableRig = rig && (rig.id in rigLoaders || (rig.id === "generated" && rig.recipe)) ? rig : null;
  const sceneMissing = sceneFailed || (rig !== null && !playableRig);

  const step = plan?.steps[stepIndex];
  const stepPhoto = step && step.photo >= 0 ? photoUrls[step.photo] : undefined;

  const enterStep = (index: number) => {
    if (!plan) return;
    const next = plan.steps[index];
    setStepIndex(index);
    setStage("step");
    closeCheck();
    setView("auto");
    stopSpeaking();
    say(next.instruction, "pointing");
  };

  const finish = () => {
    if (!plan) return;
    setStage("done");
    setFixMinutes(minutesSince(startedAt.current));
    stopSpeaking();
    const name = /^(car|truck|suv|vehicle)$/i.test(plan.appliance.trim()) ? "car" : tidy(plan.appliance).toLowerCase();
    say(needsPro(plan) ? `Good call. Let a pro take it from here. I'll remember your ${name}.` : `You did it! That's fixed. I'll remember your ${name}.`, "celebrate");
    // Close the job, or hand it to the pro finder; a fixed job gets a check-up reminder in three months.
    if (runJob.current) {
      const id = runJob.current;
      const handedOff = needsPro(plan);
      setJobStatus(id, handedOff ? "needs_pro" : "done", handedOff ? "Helpa says this one needs a pro." : `Fixed it: ${tidy(plan.cause || firstSentence(plan.diagnosis))}.`)
        .then((job) => (handedOff ? job : addFollowUp(id, `Check the ${tidy(plan.appliance).toLowerCase()} is still working well`, Date.now() + 90 * 86_400_000)))
        .then(rememberJob)
        .catch(() => {});
    }
    saveFix(plan, {
      rig: playableRig ? { id: playableRig.id, recipe: playableRig.recipe } : undefined,
      photos: runRef.current.photos,
      sample: Boolean(runRef.current.sample),
      ruledOut: attempts.map((attempt) => attempt.cause),
    })
      .then((machine) => {
        rememberMachine(machine);
        setSavedName(name);
      })
      .catch(() => {});
  };

  const goToStep = (index: number) => {
    if (!plan) return;
    if (index >= plan.steps.length) {
      // The last step is a test run: ask whether it worked before celebrating. A hand-off to a pro has nothing to test.
      if (needsPro(plan)) return finish();
      setStage("outcome");
      stopSpeaking();
      say("Did that fix it?", "explaining");
      return;
    }
    enterStep(Math.max(0, index));
  };

  const stillBroken = () => {
    if (!plan) return;
    const tried = [...attempts, { id: plan.library_id && plan.library_problem ? `${plan.library_id}/${plan.library_problem}` : "", cause: plan.cause || firstSentence(tidy(plan.diagnosis)).replace(/\.$/, "") }];
    start(runRef.current.photos, runRef.current.description, runRef.current.sample, tried);
  };

  const showCheck = (next: CheckState | null) =>
    setCheck((current) => {
      if (current && current.photoUrl !== next?.photoUrl) URL.revokeObjectURL(current.photoUrl);
      return next;
    });

  const closeCheck = () => {
    checkToken.current++;
    showCheck(null);
  };

  const runCheck = async (file: File | undefined) => {
    if (!file || !step) return;
    const token = ++checkToken.current;
    const photoUrl = URL.createObjectURL(file);
    stopSpeaking();
    showCheck({ phase: "checking", photoUrl, feedback: "" });
    say("Let me look…", "searching");
    let next: CheckState;
    try {
      const result = await checkStep(await shrinkPhoto(file), step);
      next = { phase: result.done ? "done" : "retry", photoUrl, feedback: tidy(result.feedback), model: result.model };
    } catch (error) {
      next = { phase: "error", photoUrl, feedback: error instanceof Error ? error.message : "I couldn't check that. Can you try again?" };
    }
    // The person may have gone back or moved on while Helpa was looking.
    if (token !== checkToken.current) return;
    showCheck(next);
    stopSpeaking();
    say(next.feedback, next.phase === "done" ? "celebrate" : "worried");
  };

  const backToStep = () => {
    closeCheck();
    stopSpeaking();
    setMood("pointing");
  };

  const restart = () => {
    stopSpeaking();
    setPrefill(undefined);
    setStage("home");
    setMood("idle");
  };

  const openTutorial = () => {
    stopSpeaking();
    setTutorial("open");
  };

  const openLive = () => {
    requestMotionPermission();
    stopSpeaking();
    setLive(true);
  };

  const voiceState = useVoiceCommands(handsFree && stage === "step", speaking, (command, words) => {
    setHeard(words);
    window.clearTimeout(heardTimer.current);
    heardTimer.current = window.setTimeout(() => setHeard(""), 2200);
    // On the camera, the Live Guide acts on it (show again, check now); on the step page, the page does.
    if (live) return setLiveCommand({ command, at: Date.now() });
    if (!plan || !step) return;
    if (command === "next") goToStep(stepIndex + 1);
    else if (command === "back") goToStep(stepIndex - 1);
    else if (command === "repeat") say(step.instruction, "pointing");
    else {
      openLive();
      if (command === "check") setLiveCommand({ command, at: Date.now() });
    }
  });

  let screen: ReactNode = null;
  if (firstRun === null || !homeLoaded) screen = null;
  else if (showTutorial) screen = <Onboarding key="tutorial" onFinish={() => setTutorial("closed")} />;
  else if (stage === "home")
    screen = (
      <MyHome
        machines={machines}
        jobs={jobs}
        onOpenJob={(job) => openJob(job.id)}
        mood={mood}
        speaking={speaking}
        onOpen={(machine) => {
          stopSpeaking();
          setMachineId(machine.id);
          setStage("machine");
        }}
        onFix={() => {
          setPrefill(undefined);
          setBubble(cameraPrompt);
          setStage("start");
        }}
        onTell={() => {
          stopSpeaking();
          setPrefill({ identity: "", description: "" });
          setBubble("Tell me what's going on. Type it, or hold the mic and talk.");
          setStage("start");
        }}
        onPickFix={(fix, says) => start([], says, undefined, [], fix)}
        onSample={(photo, sample) => start([photo], sample.complaint, sample.id)}
        onHelp={openTutorial}
      />
    );
  else if (stage === "job" && jobs.some((job) => job.id === jobId))
    screen = (
      <JobPage
        job={jobs.find((job) => job.id === jobId) as Job}
        onChange={rememberJob}
        onBack={() => setStage("home")}
        onInstall={installPart}
        onDeleted={(id) => {
          setJobs((current) => current.filter((job) => job.id !== id));
          setStage("home");
        }}
      />
    );
  else if (stage === "machine" && machines.some((machine) => machine.id === machineId))
    screen = (
      <MachinePage
        machine={machines.find((machine) => machine.id === machineId) as Machine}
        onChange={rememberMachine}
        onBack={() => {
          stopSpeaking();
          setStage("home");
        }}
        onFix={(identity, complaint) => {
          stopSpeaking();
          setPrefill({ identity, description: complaint });
          setBubble(complaint ? "I wrote down what you told me. Add a photo if you can." : "What's going on with it?");
          setStage("start");
        }}
      />
    );
  else if (stage === "start")
    screen = (
      <Capture
        prefill={prefill}
        onHome={() => {
          stopSpeaking();
          setStage("home");
        }}
        onSubmit={start}
        say={say}
        onListening={(listening) => setMood(listening ? "listening" : "idle")}
        onHelp={openTutorial}
        bubble={bubble}
        mood={mood}
        speaking={speaking}
      />
    );
  else if (stage === "working")
    screen = (
      <Working
        rows={rows}
        libraryHit={libraryHit}
        photoUrl={photoUrls[activePhoto]}
        masks={partMasks[activePhoto] ?? []}
        mood={mood}
        speaking={speaking}
        bubble={bubble}
        question={question}
        onAnswer={answer}
      />
    );
  else if (stage === "plan" && plan)
    screen = (
      <PlanScreen
        plan={plan}
        drawing={drawing}
        onGetPart={currentJob ? () => openJob(currentJob) : undefined}
        storyRig={playableRig}
        onOpenStep={enterStep}
        ruledOut={attempts.map((attempt) => attempt.cause)}
        mood={mood}
        speaking={speaking}
        onStart={() => enterStep(0)}
        onRestart={restart}
        onHelp={openTutorial}
      />
    );
  else if (stage === "step" && plan && step && live)
    screen = (
      <LiveGuide
        plan={plan}
        stepIndex={stepIndex}
        rig={playableRig}
        mood={mood}
        speaking={speaking}
        say={say}
        onDone={() => goToStep(stepIndex + 1)}
        onNext={() => goToStep(stepIndex + 1)}
        onClose={() => setLive(false)}
        command={liveCommand}
        handsFree={<HandsFree state={voiceState} heard={heard} glass />}
      />
    );
  else if (stage === "step" && plan && step) {
    const rigBeats = playableRig?.stepBeats[stepIndex] ?? [];
    const has3d = playableRig ? rigBeats.length > 0 : step.show_3d && !sceneMissing;
    const guide3d = playableRig ? (
      <RigStep rigId={playableRig.id} stepBeats={playableRig.stepBeats} stepIndex={stepIndex} recipe={playableRig.recipe} />
    ) : scene ? (
      <Scene3D scene={scene} stepIndex={stepIndex} />
    ) : null;
    const lastStep = stepIndex + 1 === plan.steps.length;
    const stepMask = stepMasks[stepIndex] ? [stepMasks[stepIndex]] : [];
    let visual: ReactNode = null;
    const shownView = view === "auto" ? (has3d ? "3d" : "photo") : view;
    if (shownView === "3d" && has3d) visual = guide3d ?? <SceneSkeleton text="Building your 3D model" />;
    else if (stepPhoto) visual = <PartPhoto photoUrl={stepPhoto} samTexts={stepMask} label={step.target_part} />;
    else if (step.target_part)
      visual = (
        <div className="visual-target">
          <span className="visual-target-icon" aria-hidden="true">
            <Icon name="scan" size={34} />
          </span>
          <p>
            Look for the <strong>{tidy(step.target_part)}</strong>
          </p>
        </div>
      );
    // Only one 3D view at a time: while checking, the guide moves into the comparison.
    let guide: ReactNode = null;
    if (has3d && guide3d) guide = guide3d;
    else if (stepPhoto) guide = <PartPhoto photoUrl={stepPhoto} samTexts={stepMask} />;

    const retake = () => checkInputRef.current?.click();
    let actions: ReactNode;
    if (!check)
      actions = (
        <div className="bottom-bar bottom-bar-row">
          <button className="btn-square press" onClick={() => goToStep(stepIndex - 1)} disabled={stepIndex === 0} aria-label="Back">
            <Icon name="back" />
          </button>
          <button className="btn btn-secondary press" onClick={retake}>
            <Icon name="camera" size={20} />
            Check my work
          </button>
          <button className="btn btn-primary press" onClick={() => goToStep(stepIndex + 1)}>
            {lastStep ? "All done" : "Next"}
          </button>
        </div>
      );
    else if (check.phase === "checking")
      actions = (
        <div className="bottom-bar">
          <button className="btn btn-secondary press" onClick={backToStep}>
            Cancel
          </button>
        </div>
      );
    else if (check.phase === "done")
      actions = (
        <div className="bottom-bar bottom-bar-pair">
          <button className="btn btn-secondary press" onClick={backToStep}>
            Stay here
          </button>
          <button className="btn btn-primary press" onClick={() => goToStep(stepIndex + 1)}>
            {lastStep ? "Finish" : "Next step"}
            <Icon name="next" size={20} />
          </button>
        </div>
      );
    else
      actions = (
        <div className="bottom-bar bottom-bar-pair">
          {check.phase === "retry" ? (
            <button className="btn btn-secondary press" onClick={() => goToStep(stepIndex + 1)}>
              Skip, it&apos;s fine
            </button>
          ) : (
            <button className="btn btn-secondary press" onClick={backToStep}>
              Back to step
            </button>
          )}
          <button className="btn btn-primary press" onClick={retake}>
            <Icon name="camera" size={20} />
            Try again
          </button>
        </div>
      );

    screen = (
      <section key="step" className="screen step" aria-label={`Step ${stepIndex + 1}`}>
        {check?.phase === "done" && <Confetti />}
        <div className="topbar">
          <button className="icon-button press" onClick={() => setStage("plan")} aria-label="Back to the plan">
            <Icon name="close" />
          </button>
          <div className="progress" role="progressbar" aria-label="Steps done" aria-valuemin={0} aria-valuemax={plan.steps.length} aria-valuenow={stepIndex + 1}>
            <motion.span className="progress-fill" initial={false} animate={{ width: `${((stepIndex + 1) / plan.steps.length) * 100}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
          </div>
          <span className="progress-count">
            {stepIndex + 1}/{plan.steps.length}
          </span>
        </div>

        <div className="screen-body">
          <AnimatePresence mode="wait" initial={false}>
            {check ? (
              <motion.div key="check" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.25, ease: "easeOut" }}>
                <CheckMoment check={check} speaking={speaking} doneLooksLike={tidy(step.check ?? "")} guide={guide} onBack={backToStep} />
              </motion.div>
            ) : (
              <motion.div key={stepIndex} className="step-content" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25, ease: "easeOut" }}>
                <div className="step-head">
                  <button className="step-helpa press" onClick={() => say(step.instruction, "pointing")} aria-label="Hear this step again">
                    <Helpa mood={mood} speaking={speaking} size={56} />
                    <span className="step-helpa-badge" aria-hidden="true">
                      <Icon name="speaker" size={12} />
                    </span>
                  </button>
                  <div>
                    <p className="eyebrow">
                      Step {stepIndex + 1} of {plan.steps.length}
                      {identityOf(plan) && <span className="eyebrow-identity"> · {identityOf(plan)}</span>}
                    </p>
                    <p className="step-hint" aria-hidden="true">
                      {speaking ? "Reading it out loud" : "Tap me to hear it again"}
                    </p>
                  </div>
                </div>
                <HandsFree state={voiceState} heard={heard} />
                <h1 className="step-text">{tidy(step.instruction)}</h1>

                {has3d && stepPhoto && (
                  <div className="segmented" role="tablist" aria-label="View">
                    <button role="tab" aria-selected={shownView === "3d"} className="press" onClick={() => setView("3d")}>
                      <Icon name="cube" size={16} /> 3D guide
                    </button>
                    <button role="tab" aria-selected={shownView === "photo"} className="press" onClick={() => setView("photo")}>
                      <Icon name="image" size={16} /> Your photo
                    </button>
                  </div>
                )}
                {visual && <div className="visual-card">{visual}</div>}
                <button className="btn btn-secondary press live-open" onClick={openLive}>
                  <Icon name="live" size={20} />
                  Show me on my camera
                </button>

                {step.details?.length > 0 && (
                  <details className="more-help">
                    <summary className="press">
                      More help
                      <Icon name="chevronDown" size={18} />
                    </summary>
                    <ul>
                      {step.details.map((line) => (
                        <li key={line}>{tidy(line)}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {actions}
        <input
          ref={checkInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(changeEvent) => {
            runCheck(changeEvent.target.files?.[0]);
            changeEvent.target.value = "";
          }}
        />
      </section>
    );
  } else if (stage === "outcome" && plan)
    screen = (
      <Outcome
        plan={plan}
        ruledOut={attempts.map((attempt) => attempt.cause)}
        mood={mood}
        speaking={speaking}
        onFixed={finish}
        onStillBroken={stillBroken}
        onBack={() => enterStep(plan.steps.length - 1)}
      />
    );
  else if (stage === "done")
    screen = <Done plan={plan} drawing={drawing?.url} onJob={currentJob ? () => openJob(currentJob) : undefined} minutes={fixMinutes} mood={mood} speaking={speaking} onRestart={restart} savedName={savedName} ruledOut={attempts.map((attempt) => attempt.cause)} />;

  return (
    <MotionConfig reducedMotion="user">
      <main className="app">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={showTutorial ? "tutorial" : stage}
            className="stage-frame"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {screen}
          </motion.div>
        </AnimatePresence>
      </main>
    </MotionConfig>
  );
}

function SceneSkeleton({ text }: { text: string }) {
  return (
    <div className="scene-skeleton skeleton" role="status">
      <Icon name="cube" size={36} strokeWidth={1.6} />
      <span>{text}</span>
    </div>
  );
}

function BubbleRow({ mood, speaking, bubble, size = 88 }: { mood: HelpaMood; speaking: boolean; bubble: string; size?: number }) {
  return (
    <div className="helpa-row">
      <Helpa mood={mood} speaking={speaking} size={size} />
      <motion.p key={bubble} className="bubble" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}>
        {bubble}
      </motion.p>
    </div>
  );
}

type WorkingProps = {
  rows: ProgressRow[];
  libraryHit: { brand: string; appliance: string; model_family: string } | null;
  photoUrl?: string;
  masks: string[];
  mood: HelpaMood;
  speaking: boolean;
  bubble: string;
  question: Question | null;
  onAnswer: (answer: string) => void;
};

function QuestionCard({ question, onAnswer }: { question: Question; onAnswer: (answer: string) => void }) {
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  return (
    <motion.div className="question-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ type: "spring", stiffness: 280, damping: 22 }}>
      <div className="question-chips" role="group" aria-label={question.question}>
        {question.choices.map((choice) => (
          <button key={choice} className="question-chip press" onClick={() => onAnswer(choice)}>
            {tidy(choice)}
          </button>
        ))}
      </div>
      {typing ? (
        <form
          className="field question-field"
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            onAnswer(draft);
          }}
        >
          <input autoFocus value={draft} maxLength={300} onChange={(changeEvent) => setDraft(changeEvent.target.value)} placeholder="Type your answer" aria-label="Your answer" />
          <button className="question-send press" type="submit" disabled={!draft.trim()} aria-label="Send answer">
            <Icon name="next" size={20} />
          </button>
        </form>
      ) : (
        <button className="question-other press" onClick={() => setTyping(true)}>
          <Icon name="keyboard" size={16} /> Type an answer
        </button>
      )}
    </motion.div>
  );
}

function Working({ rows, libraryHit, photoUrl, masks, mood, speaking, bubble, question, onAnswer }: WorkingProps) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed((seconds) => seconds + 0.5), 500);
    return () => clearInterval(timer);
  }, []);
  const lanes = lanesFrom(rows, Boolean(photoUrl));
  const lanesDone = lanes.filter((lane) => lane.state === "done").length;
  // ponytail: progress is a feel-good estimate (time plus finished lanes), not real completion
  const progress = Math.min(0.94, 0.05 + (lanesDone / lanes.length) * 0.5 + (1 - Math.exp(-elapsed / 40)) * 0.4);

  return (
    <section className="screen working" aria-label="Helpa is working">
      <div className="topbar">
        <span className="wordmark">helpa</span>
        <span className="pill-status">
          <span className="live-dot" aria-hidden="true" /> Working
        </span>
      </div>
      <div className="screen-body">
        {photoUrl ? (
          <>
            <div className="working-photo">
              <PartPhoto photoUrl={photoUrl} samTexts={masks} />
              <div className="scan-sweep" aria-hidden="true" />
            </div>
            <BubbleRow mood={mood} speaking={speaking} bubble={bubble} size={88} />
          </>
        ) : (
          <div className="working-hero">
            <div className="hero-stage">
              <div className="hero-blob hero-blob-pulse" aria-hidden="true" />
              <Helpa mood={mood} speaking={speaking} size={180} />
            </div>
            <motion.p key={bubble} className="bubble bubble-center" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              {bubble}
            </motion.p>
          </div>
        )}

        <AnimatePresence>{question && <QuestionCard key={question.session + question.question} question={question} onAnswer={onAnswer} />}</AnimatePresence>

        <AnimatePresence>
          {libraryHit && (
            <motion.div className="library-card" initial={{ opacity: 0, scale: 0.85, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 16 }}>
              <span className="library-icon" aria-hidden="true">
                <Icon name="sparkle" />
              </span>
              <div>
                <strong>I know this one!</strong>
                <p>
                  {libraryHit.model_family.toLowerCase().includes(libraryHit.brand.toLowerCase())
                    ? libraryHit.model_family
                    : `${[libraryHit.brand, libraryHit.appliance].filter(Boolean).join(" ")}${libraryHit.model_family ? `, ${libraryHit.model_family}` : ""}`}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="card progress-card">
          <div className="progress-head">
            <strong>{question ? "Waiting for your answer" : "Helpa is on it"}</strong>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="progress">
            <motion.span className="progress-fill" animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.6 }} />
          </div>
          <AgentTracks rows={rows} hasPhoto={Boolean(photoUrl)} paused={question !== null} />
        </div>
      </div>
    </section>
  );
}

type PlanProps = {
  plan: Plan;
  drawing: { state: "drawing" | "ready"; url?: string } | null;
  /** Opens the job, where Helpa finds the exact part and where to buy it. */
  onGetPart?: () => void;
  /** The 3D model and its beats, when there is one: the steps are drawn as pictures from it. */
  storyRig: { id: string; stepBeats: Beat[][]; recipe?: unknown } | null;
  onOpenStep: (index: number) => void;
  ruledOut: string[];
  mood: HelpaMood;
  speaking: boolean;
  onStart: () => void;
  onRestart: () => void;
  onHelp: () => void;
};

function PlanScreen({ plan, drawing, onGetPart, storyRig, onOpenStep, ruledOut, mood, speaking, onStart, onRestart, onHelp }: PlanProps) {
  const diagnosis = tidy(plan.diagnosis);
  const headline = diagnosis.match(/^.+?[.!?](\s|$)/)?.[0]?.trim() ?? diagnosis;
  const rest = diagnosis.slice(headline.length).trim();
  const identity = identityOf(plan);
  const manualHost = (() => {
    try {
      return plan.manual_url ? new URL(plan.manual_url).hostname.replace(/^www\./, "") : "";
    } catch {
      return "";
    }
  })();

  return (
    <section className="screen plan" aria-label="Your plan">
      <div className="topbar">
        <button className="icon-button press" onClick={onRestart} aria-label="Start over">
          <Icon name="back" />
        </button>
        <span className="topbar-title">Your plan</span>
        <div className="topbar-actions">
          <ThemeToggle />
          <button className="icon-button press" onClick={onHelp} aria-label="How Helpa works">
            <Icon name="help" />
          </button>
        </div>
      </div>
      <div className="screen-body">
        <motion.article className="card hero-card hero-card-peek" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <div className="peek-helpa" aria-hidden="true">
            <Helpa mood={mood} speaking={speaking} size={76} />
          </div>
          {identity && (
            <ul className="tag-row tag-row-left">
              <li>{identity}</li>
            </ul>
          )}
          <h1 className="title">{capitalize(known(plan.appliance) || "Your appliance")}</h1>
          {ruledOut.length > 0 && (
            <ul className="ruled-out" aria-label="Already ruled out">
              {ruledOut.map((cause) => (
                <li key={cause}>
                  <Icon name="check" size={14} strokeWidth={3} /> Not {tidy(cause)}
                </li>
              ))}
            </ul>
          )}
          <p className="label">{ruledOut.length ? "Next most likely" : "What's going on"}</p>
          <p className="diagnosis">{headline}</p>
          {rest && <p className="diagnosis-more">{rest}</p>}
          {(plan.library_id || manualHost) && (
            <div className="source-row">
              {plan.library_id && (
                <span className="badge">
                  <Icon name="sparkle" size={14} /> From Helpa&apos;s library
                </span>
              )}
              {manualHost && (
                <a className="source" href={plan.manual_url} target="_blank" rel="noreferrer">
                  <Icon name="book" size={16} /> Manual from {manualHost}
                </a>
              )}
            </div>
          )}
        </motion.article>

        {drawing && (
          <motion.figure className="drawing-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            {drawing.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={drawing.url} alt={`Your ${tidy(plan.appliance)} with the part to fix circled`} />
            ) : (
              <div className="drawing-pending skeleton" role="status">
                <Icon name="pen" size={26} />
                <span>Drawing the fix on your photo…</span>
              </div>
            )}
            <figcaption>
              <Icon name="pen" size={14} /> Drawn on your photo by Muse Image
            </figcaption>
          </motion.figure>
        )}

        {plan.safety.length > 0 && (
          <motion.article className="card safety-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
            <h2 className="card-title">
              <span className="safety-icon" aria-hidden="true">
                <Icon name="shield" size={18} />
              </span>
              Safety first
            </h2>
            <ul className="safety-list">
              {plan.safety.map((line) => (
                <li key={line}>{tidy(line)}</li>
              ))}
            </ul>
          </motion.article>
        )}

        {(plan.tools.length > 0 || plan.replacement_parts.length > 0) && (
          <motion.article className="card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
            <h2 className="card-title">What you need</h2>
            <ul className="icon-chips">
              {plan.tools.map((tool) => (
                <li key={tool}>
                  <span aria-hidden="true">
                    <Icon name={iconFor(tool)} size={17} />
                  </span>
                  {tidy(tool)}
                </li>
              ))}
            </ul>
            {plan.replacement_parts.length > 0 && (
              <>
                <p className="label label-spaced">Only if a part needs replacing</p>
                <ul className="icon-chips icon-chips-soft">
                  {plan.replacement_parts.map((part) => (
                    <li key={part}>
                      <span aria-hidden="true">
                        <Icon name="bolt" size={17} />
                      </span>
                      {tidy(part)}
                    </li>
                  ))}
                </ul>
                {onGetPart && (
                  <button className="text-button press get-part" onClick={onGetPart}>
                    <Icon name="tag" size={16} /> Find the exact part and where to buy it
                  </button>
                )}
              </>
            )}
          </motion.article>
        )}

        <motion.article className="card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}>
          <h2 className="card-title">
            {plan.steps.length} simple steps
          </h2>
          {storyRig ? (
            // Every step as a picture from the 3D model of their machine; tap one to start there.
            <Storyboard rig={storyRig} steps={plan.steps} onOpen={onOpenStep} />
          ) : (
            <ol className="step-list">
              {plan.steps.map((planStep, index) => (
                <li key={index}>
                  <span className="step-number">{index + 1}</span>
                  <span>{firstSentence(tidy(planStep.instruction))}</span>
                </li>
              ))}
            </ol>
          )}
        </motion.article>
      </div>
      <div className="bottom-bar">
        <button className="btn btn-primary press" onClick={onStart}>
          Let&apos;s start
          <Icon name="next" size={20} />
        </button>
      </div>
    </section>
  );
}
