import type { Scene } from "./StoryPlayer";

/** What Helpa says over public/landing/story.mp4, each from the second its moment starts (times from the filming run). */
export const story: Scene[] = [
  { at: 0, caption: "Dryer stopped drying? Let's fix it.", mood: "worried" },
  { at: 4.8, caption: "Snap a photo and tell me what's wrong.", mood: "listening" },
  { at: 9.2, caption: "I find your exact model…", mood: "searching" },
  { at: 13, caption: "…and draw you every step.", mood: "explaining" },
  { at: 16.7, caption: "Each move, in 3D. Just copy it.", mood: "pointing" },
  { at: 24.4, caption: "Stuck? Tap \u201cI'm stuck.\u201d", mood: "explaining" },
  { at: 26, caption: "I'll show you on your real dryer.", mood: "pointing" },
  { at: 31, caption: "Fixed! You did it.", mood: "celebrate" },
];
