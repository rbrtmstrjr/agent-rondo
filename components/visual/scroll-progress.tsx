"use client";

import { useState } from "react";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  useMotionTemplate,
  useMotionValueEvent,
} from "framer-motion";

/* Futuristic HUD scroll indicator — a vertical rail pinned to the right-center
   with tick marks, a glowing gold fill, a moving thumb, and a live percentage.
   Purely decorative; hidden on small screens and for reduced-motion users. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const smooth = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    mass: 0.35,
  });

  const thumbTop = useTransform(smooth, (v) => `${v * 100}%`);

  // white when low → gold when high
  const color = useTransform(smooth, [0, 0.55, 1], ["#ffffff", "#ffffff", "#ff9e1b"]);
  const glowColor = useTransform(
    smooth,
    [0, 0.55, 1],
    ["rgba(255,255,255,0.6)", "rgba(255,255,255,0.6)", "rgba(255,158,27,0.75)"],
  );
  const thumbGlow = useMotionTemplate`0 0 14px 3px ${glowColor}`;

  const [pct, setPct] = useState(0);
  useMotionValueEvent(smooth, "change", (v) => setPct(Math.round(v * 100)));

  return (
    <div
      className="pointer-events-none fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-center gap-3 lg:flex"
      aria-hidden
    >
      {/* percentage readout */}
      <motion.span className="font-mono text-xs tracking-[0.2em]" style={{ color }}>
        {String(pct).padStart(3, "0")}
      </motion.span>

      {/* rail */}
      <div className="relative h-72 w-0.5 bg-white/10">
        {/* tick marks */}
        {[0, 20, 40, 60, 80, 100].map((t) => (
          <span
            key={t}
            className="absolute left-1/2 h-px w-2.5 -translate-x-1/2 bg-white/25"
            style={{ top: `${t}%` }}
          />
        ))}

        {/* fill */}
        <motion.div
          className="absolute inset-x-0 top-0 h-full origin-top"
          style={{ scaleY: smooth, backgroundColor: color }}
        />

        {/* thumb */}
        <motion.span
          className="absolute left-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ top: thumbTop, backgroundColor: color, boxShadow: thumbGlow }}
        />
      </div>

      {/* vertical label */}
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/40 [writing-mode:vertical-rl]">
        Scroll
      </span>
    </div>
  );
}
