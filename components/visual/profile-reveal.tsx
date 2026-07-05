"use client";

import { useEffect, useRef } from "react";
import Image, { type StaticImageData } from "next/image";

/* Profile portrait with a "water trail" reveal: moving the cursor paints a soft
   path that exposes the second image, and the path fades back over time — like
   dragging a finger across water. The mask is repainted per frame only while a
   trail exists, so it's idle-free. Touch just shows the base image. */
export function ProfileReveal({
  base,
  hover,
  alt,
  className,
}: {
  base: StaticImageData;
  hover: StaticImageData;
  alt: string;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const points = useRef<{ x: number; y: number; t: number }[]>([]);
  const hovering = useRef(false);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    const LIFE = 850; // ms a stroke stays before fully fading
    const R = 52; // blob radius (px)

    const tick = (now: number) => {
      const pts = points.current;
      while (pts.length && now - pts[0].t > LIFE) pts.shift();

      const el = revealRef.current;
      if (el) {
        if (!pts.length) {
          el.style.opacity = "0";
          el.style.setProperty("-webkit-mask-image", "none");
          el.style.setProperty("mask-image", "none");
          if (!hovering.current) {
            rafId.current = null;
            return; // stop the loop until the next move
          }
        } else {
          el.style.opacity = "1";
          const layers = pts
            .map((p) => {
              const age = (now - p.t) / LIFE;
              const a = Math.max(0, 1 - age);
              const alpha = a * a; // ease-out fade
              return `radial-gradient(circle ${R}px at ${p.x}px ${p.y}px, rgba(0,0,0,${alpha}) 0%, rgba(0,0,0,${alpha * 0.85}) 45%, rgba(0,0,0,0) 72%)`;
            })
            .join(",");
          el.style.setProperty("-webkit-mask-image", layers);
          el.style.setProperty("mask-image", layers);
        }
      }
      rafId.current = requestAnimationFrame(tick);
    };

    const start = () => {
      if (rafId.current == null) rafId.current = requestAnimationFrame(tick);
    };

    const move = (e: PointerEvent) => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return;
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const pts = points.current;
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(x - last.x, y - last.y) > 5) {
        pts.push({ x, y, t: performance.now() });
        if (pts.length > 80) pts.shift();
        start();
      }
    };

    const enter = () => {
      hovering.current = true;
      start();
    };
    const leave = () => {
      hovering.current = false;
    };

    const node = wrapRef.current;
    node?.addEventListener("pointermove", move);
    node?.addEventListener("pointerenter", enter);
    node?.addEventListener("pointerleave", leave);
    return () => {
      node?.removeEventListener("pointermove", move);
      node?.removeEventListener("pointerenter", enter);
      node?.removeEventListener("pointerleave", leave);
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    };
  }, []);

  return (
    <div ref={wrapRef} className={className}>
      {/* base image */}
      <Image src={base} alt={alt} fill sizes="384px" className="object-cover" />

      {/* hover image — masked into a fading trail */}
      <div ref={revealRef} className="absolute inset-0 opacity-0 [mask-repeat:no-repeat] [-webkit-mask-repeat:no-repeat]">
        <Image src={hover} alt="" aria-hidden fill sizes="384px" className="object-cover" />
      </div>
    </div>
  );
}
