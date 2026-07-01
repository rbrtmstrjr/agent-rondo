"use client";

import { useRef } from "react";
import { motion, useMotionTemplate, useMotionValue } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Glass card with a cursor-tracking spotlight + a border that lights up under
 * the pointer. No 3D tilt (use <Tilt> for that) — this is the flatter, faster
 * "bento" card treatment. Give it `group` if children use group-hover.
 */
export function SpotlightCard({
  children,
  className,
  spotlight = "var(--color-gold-glow)",
}: {
  children: React.ReactNode;
  className?: string;
  spotlight?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(-200);
  const my = useMotionValue(-200);

  const bg = useMotionTemplate`radial-gradient(340px circle at ${mx}px ${my}px, ${spotlight}, transparent 70%)`;
  const border = useMotionTemplate`radial-gradient(220px circle at ${mx}px ${my}px, rgba(255,255,255,0.35), transparent 70%)`;

  function onMove(e: React.MouseEvent) {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    mx.set(e.clientX - r.left);
    my.set(e.clientY - r.top);
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-line bg-base/60",
        className,
      )}
    >
      {/* lit border */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: border, WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)", WebkitMaskComposite: "xor", maskComposite: "exclude", padding: 1 }}
      />
      {/* spotlight fill */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: bg }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
