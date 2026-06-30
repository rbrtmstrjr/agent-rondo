"use client";

import { useRef } from "react";
import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * 3D tilt card with a cursor-tracking gold glow. Wraps any content.
 * Tilt is subtle (premium = restraint); disabled feel under reduced-motion
 * because the springs settle to 0 and the glow simply doesn't move.
 */
export function Tilt({
  children,
  className,
  max = 7,
}: {
  children: React.ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);

  const rotX = useSpring(useTransform(py, [0, 1], [max, -max]), { stiffness: 150, damping: 18 });
  const rotY = useSpring(useTransform(px, [0, 1], [-max, max]), { stiffness: 150, damping: 18 });

  const glowX = useTransform(px, [0, 1], ["0%", "100%"]);
  const glowY = useTransform(py, [0, 1], ["0%", "100%"]);
  const glow = useMotionTemplate`radial-gradient(420px circle at ${glowX} ${glowY}, var(--color-gold-glow), transparent 60%)`;

  function onMove(e: React.MouseEvent) {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  }
  function onLeave() {
    px.set(0.5);
    py.set(0.5);
  }

  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} style={{ perspective: 1000 }}>
      <motion.div
        style={{ rotateX: rotX, rotateY: rotY, transformStyle: "preserve-3d" }}
        className={cn("relative", className)}
      >
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 [will-change:opacity] group-hover:opacity-100"
          style={{ background: glow }}
        />
        {children}
      </motion.div>
    </div>
  );
}
