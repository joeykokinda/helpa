import type { Scene } from "./StoryPlayer";

/** What Helpa says over public/landing/story.mp4, each from the second its moment starts (times from the cut). */
export const story: Scene[] = [
  { at: 0, caption: "Dryer stopped drying? Let's fix it.", mood: "worried" },
  { at: 5.0, caption: "Snap a photo and tell me what's wrong.", mood: "listening" },
  { at: 8.75, caption: "I find your exact model…", mood: "searching" },
  { at: 16.65, caption: "…and tell you why it broke.", mood: "explaining" },
  { at: 20.55, caption: "Each move, in 3D. Just copy it.", mood: "pointing" },
  { at: 30.9, caption: "Fixed! You did it.", mood: "celebrate" },
];
