import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CaseStudy } from "@/content/site";
import blob from "@/src/images/svg/blob.svg";

/* Distinct blob position per card so no two look alike (deterministic by slug). */
const BLOB_VARIANTS = [
  "left-[42%] top-[38%] h-[210%] w-[210%] -rotate-12",
  "left-[60%] top-[46%] h-[220%] w-[220%] rotate-[20deg] -scale-x-100",
  "left-[46%] top-[52%] h-[200%] w-[200%] rotate-6",
  "left-[56%] top-[40%] h-[225%] w-[225%] -rotate-[22deg]",
];

function blobIndex(slug: string) {
  return [...slug].reduce((n, c) => n + c.charCodeAt(0), 0) % BLOB_VARIANTS.length;
}

/* Clean work card — matches the services card style: blob glow, glass, a minimal
   title + one-line summary, and a chevron-in-circle. Deliberately light on data. */
export function CaseCard({ study, className }: { study: CaseStudy; className?: string }) {
  return (
    <Link
      href={`/work/${study.slug}`}
      className={cn(
        "group relative flex h-full min-h-[17rem] flex-col overflow-hidden rounded-3xl border border-white/15 bg-white/[0.04] p-7 backdrop-blur-xl transition-colors duration-300 hover:border-white/30",
        className,
      )}
    >
      {/* blob background */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -z-0 -translate-x-1/2 -translate-y-1/2 bg-contain bg-center bg-no-repeat opacity-90",
          BLOB_VARIANTS[blobIndex(study.slug)],
        )}
        style={{ backgroundImage: `url(${blob.src})` }}
      />

      {/* status */}
      <span className="relative inline-flex w-fit items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-gold">
        <span className="h-1.5 w-1.5 rounded-full bg-gold" />
        {study.status}
      </span>

      {/* title + one-liner */}
      <h3 className="relative mt-5 text-xl tracking-[0.05em] text-white">{study.title}</h3>
      <p className="relative mt-3 line-clamp-2 text-sm leading-relaxed text-white/50">
        {study.oneLiner}
      </p>

      {/* footer — read + chevron */}
      <div className="relative mt-auto flex items-center justify-between gap-4 pt-8">
        <span className="font-mono text-xs uppercase tracking-wider text-white">
          Read case study
        </span>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/30 text-white transition-colors duration-300 group-hover:border-white/60 group-hover:bg-white/10">
          <ChevronRight className="h-5 w-5" strokeWidth={2} />
        </span>
      </div>
    </Link>
  );
}
