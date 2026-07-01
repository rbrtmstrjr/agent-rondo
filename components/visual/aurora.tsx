import { cn } from "@/lib/utils";

/**
 * Ambient aurora background: drifting gold + cyan glow blobs over a faint grid.
 * Pure CSS (GPU transforms only) so it's cheap; drift pauses under reduced-motion.
 */
export function Aurora({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)} aria-hidden>
      {/* faint grid texture for depth */}
      <div className="absolute inset-0 grid-texture opacity-60 [mask-image:radial-gradient(70%_60%_at_50%_30%,black,transparent)]" />

      {/* drifting glow blobs */}
      <div
        className="absolute -left-32 -top-24 h-[34rem] w-[34rem] rounded-full opacity-40 blur-[90px]"
        style={{
          background: "radial-gradient(circle, var(--color-gold-glow), transparent 65%)",
          animation: "drift 22s ease-in-out infinite",
        }}
      />
      <div
        className="absolute -right-24 top-10 h-[30rem] w-[30rem] rounded-full opacity-35 blur-[90px]"
        style={{
          background: "radial-gradient(circle, var(--color-cyan-glow), transparent 65%)",
          animation: "drift 28s ease-in-out infinite reverse",
        }}
      />
      <div
        className="absolute left-1/3 top-1/2 h-[26rem] w-[26rem] rounded-full opacity-25 blur-[100px]"
        style={{
          background: "radial-gradient(circle, rgba(255,199,0,0.14), transparent 65%)",
          animation: "drift 34s ease-in-out infinite",
        }}
      />

      {/* horizontal tech beam sweeping across */}
      <div
        className="absolute left-0 top-1/3 h-px w-full opacity-40"
        style={{
          background: "linear-gradient(90deg, transparent, var(--color-cyan), transparent)",
          animation: "beam 9s ease-in-out infinite",
        }}
      />

      {/* film grain */}
      <div className="noise absolute inset-0 opacity-[0.15] mix-blend-soft-light" />

      {/* top + bottom fades to seat content */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-deep to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-deep to-transparent" />
    </div>
  );
}
