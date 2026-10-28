"use client";

import { motion } from "motion/react";

const confettiColors = ["#e8775a", "#ffc94d", "#a3b47f", "#f79a86", "#7cb6f0", "#c9a7f5"];

/** A party-popper burst: pieces shoot up and out from behind Helpa, then flutter down. Deterministic, no randomness. */
export default function Confetti({ originY = "30%" }: { originY?: string }) {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 56 }, (_, index) => {
        const angle = ((index * 137.5) % 180) - 90;
        const power = 0.55 + ((index * 61) % 45) / 100;
        const outX = Math.sin((angle * Math.PI) / 180) * 210 * power;
        const upY = -Math.cos((angle * Math.PI) / 180) * 260 * power;
        const sway = ((index * 53) % 50) - 25;
        return (
          <motion.span
            key={index}
            style={{
              left: "50%",
              top: originY,
              width: index % 4 === 0 ? 7 : 9,
              height: index % 4 === 0 ? 7 : 14,
              background: confettiColors[index % confettiColors.length],
              borderRadius: index % 4 === 0 ? "50%" : 2,
            }}
            initial={{ x: 0, y: 0, rotate: 0, opacity: 0, scale: 0.4 }}
            animate={{
              x: [0, outX, outX + sway, outX - sway / 2],
              y: [0, upY, upY + 260, upY + 700],
              rotate: [0, 180, 420, ((index * 97) % 720) + 360],
              opacity: [1, 1, 1, 0],
              scale: [0.4, 1, 1, 0.9],
            }}
            transition={{ duration: 2.8 + (index % 5) * 0.3, delay: (index % 8) * 0.03, times: [0, 0.18, 0.55, 1], ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}
