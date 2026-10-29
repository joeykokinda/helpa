"use client";

import { useEffect, useRef, useState } from "react";

export type Scene = { at: number; caption: string };

/**
 * The story of one fix, filmed from the real app: a video in a phone with a caption for each moment under it, and a
 * bar per moment that jumps there when tapped.
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
  const end = (index: number) => scenes[index + 1]?.at ?? (duration || scenes[index].at + 3);

  return (
    <figure className="lp-story">
      <div className="lp-phone">
        <div className="lp-phone-screen">
          <video ref={video} src={src} poster={poster} autoPlay muted loop playsInline preload="auto" onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} aria-label={label} />
        </div>
      </div>
      <div className="lp-story-bars" role="tablist" aria-label="Moments in the fix">
        {scenes.map((scene, index) => {
          const fill = index < current ? 1 : index > current ? 0 : Math.min(1, (time - scene.at) / Math.max(0.1, end(index) - scene.at));
          return (
            <button
              key={scene.caption}
              role="tab"
              aria-selected={index === current}
              aria-label={scene.caption}
              onClick={() => {
                if (!video.current) return;
                video.current.currentTime = scene.at + 0.01;
                video.current.play().catch(() => {});
              }}
            >
              <span style={{ transform: `scaleX(${fill})` }} />
            </button>
          );
        })}
      </div>
      <figcaption className="lp-story-caption" aria-live="polite">
        <span key={current}>{scenes[current]?.caption}</span>
      </figcaption>
    </figure>
  );
}
