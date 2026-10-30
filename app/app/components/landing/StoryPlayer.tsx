"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import Helpa, { type HelpaMood } from "../Helpa";
import Icon from "../Icons";

export type Scene = { at: number; caption: string; mood: HelpaMood };

/**
 * The story of one fix, filmed from the real app, told by Helpa: the video plays in a phone and Helpa, beside it,
 * says what's happening in a speech bubble, his face changing with each moment. A bar per moment jumps there.
 */
export default function StoryPlayer({ src, poster, scenes, label }: { src: string; poster: string; scenes: Scene[]; label: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let frame = 0;
    const tick = () => {
      setTime(element.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  let current = 0;
  scenes.forEach((scene, index) => {
    if (time >= scene.at) current = index;
  });
  const scene = scenes[current];
  const end = (index: number) => scenes[index + 1]?.at ?? (duration || scenes[index].at + 3);
  // He talks for the first moment of each line, then listens to the video like you do.
  const speaking = time - scene.at < 1.4;

  return (
    <figure className="lp-story">
      <div className="lp-hero-visual">
        <div className="lp-phone lp-phone-hero">
          <div className="lp-phone-screen">
            <video ref={video} src={src} poster={poster} autoPlay muted loop playsInline preload="auto" onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} aria-label={label} />
          </div>
        </div>
        <div className="lp-float lp-float-a" aria-hidden="true">
          <Icon name="cube" size={20} /> Every move in 3D
        </div>
        <div className="lp-float lp-float-b" aria-hidden="true">
          <Icon name="live" size={20} /> On your real machine
        </div>
        <div className="lp-helpa">
          <AnimatePresence mode="wait">
            <motion.p key={current} className="lp-helpa-bubble" aria-live="polite" initial={{ opacity: 0, y: 8, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.96 }} transition={{ type: "spring", stiffness: 420, damping: 28 }}>
              {scene.caption}
            </motion.p>
          </AnimatePresence>
          <Helpa mood={scene.mood} speaking={speaking} lookAt={{ x: 0.8, y: -0.4 }} size={156} className="lp-helpa-face" />
        </div>
      </div>
      <div className="lp-story-bars" role="tablist" aria-label="Moments in the fix">
        {scenes.map((moment, index) => {
          const fill = index < current ? 1 : index > current ? 0 : Math.min(1, (time - moment.at) / Math.max(0.1, end(index) - moment.at));
          return (
            <button
              key={moment.caption}
              role="tab"
              aria-selected={index === current}
              aria-label={moment.caption}
              onClick={() => {
                if (!video.current) return;
                video.current.currentTime = moment.at + 0.01;
                video.current.play().catch(() => {});
              }}
            >
              <span style={{ transform: `scaleX(${fill})` }} />
            </button>
          );
        })}
      </div>
    </figure>
  );
}
