import { cn } from "@/lib/utils";

/* Infinite horizontal marquee of futuristic "HUD tag" chips — chamfered
   corners, gold inset ring, gold LED. On hover each chip fills with the same
   gold gradient used on the hero button. Duplicates items for a seamless loop. */
export function Marquee({
  items,
  className,
}: {
  items: string[];
  className?: string;
}) {
  const chamfer =
    "polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)";

  return (
    <div
      className={cn(
        "group relative flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]",
        className,
      )}
    >
      <div className="flex shrink-0 animate-marquee items-center gap-4 pr-4 group-hover:[animation-play-state:paused]">
        {[...items, ...items].map((t, i) => (
          <span
            key={i}
            className="group/chip relative inline-flex shrink-0 items-center px-5 py-2.5 font-mono text-sm uppercase tracking-wider text-foreground/80 transition-colors duration-300 hover:text-black"
            style={{
              clipPath: chamfer,
              backgroundImage:
                "linear-gradient(135deg, rgba(245,194,75,0.14), rgba(255,255,255,0.02) 60%)",
              boxShadow: "inset 0 0 0 1px rgba(245,194,75,0.28)",
            }}
          >
            {/* gold gradient fill on hover (same as hero button) */}
            <span
              aria-hidden
              className="gold-gradient absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/chip:opacity-100"
            />
            {/* top sheen */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-3 top-0 h-px"
              style={{ background: "linear-gradient(90deg, transparent, rgba(255,226,154,0.7), transparent)" }}
            />
            {/* content above the fill */}
            <span className="relative z-10 flex items-center gap-2.5">
              <span
                aria-hidden
                className="h-1.5 w-1.5 bg-gold transition-colors duration-300 group-hover/chip:bg-black"
                style={{ boxShadow: "0 0 10px var(--color-gold)" }}
              />
              {t}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
