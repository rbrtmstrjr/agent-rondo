import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Tilt } from "@/components/visual/tilt";
import { cn } from "@/lib/utils";
import type { CaseStudy } from "@/content/site";

export function CaseCard({ study, className }: { study: CaseStudy; className?: string }) {
  return (
    <Tilt max={6} className={cn("group h-full overflow-hidden rounded-2xl border border-line bg-base/60", className)}>
      <Link href={`/work/${study.slug}`} className="flex h-full flex-col p-7 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full border border-line bg-surface px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-muted">
            {study.category}
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-gold">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            {study.status}
          </span>
        </div>

        <h3 className="mt-5 font-display text-2xl font-bold tracking-tight">{study.title}</h3>
        <p className="mt-1 text-xs text-faint">{study.client}</p>
        <p className="mt-4 leading-relaxed text-muted">{study.oneLiner}</p>

        {/* metrics */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          {study.metrics.map((m) => (
            <div key={m.label} className="rounded-xl border border-line bg-surface px-3 py-2.5">
              <p className="font-display text-sm font-bold text-gold">{m.value}</p>
              <p className="mt-0.5 text-[11px] leading-tight text-faint">{m.label}</p>
            </div>
          ))}
        </div>

        {/* stack */}
        <div className="mt-5 flex flex-wrap gap-1.5">
          {study.stack.slice(0, 4).map((t) => (
            <span key={t} className="rounded-md bg-surface px-2 py-0.5 font-mono text-[10px] text-muted">
              {t}
            </span>
          ))}
        </div>

        <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-medium text-foreground">
          Read the case study
          <ArrowUpRight className="h-4 w-4 text-gold transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </span>
      </Link>
    </Tilt>
  );
}
