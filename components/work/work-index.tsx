"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CaseCard } from "./case-card";
import { caseStudies } from "@/content/site";
import { cn } from "@/lib/utils";
import { EASE } from "@/lib/motion";

const FILTERS = ["All", "AI Automation", "Content", "Web"] as const;

export function WorkIndex() {
  const [active, setActive] = useState<(typeof FILTERS)[number]>("All");

  const filtered = useMemo(
    () => (active === "All" ? caseStudies : caseStudies.filter((c) => c.category === active)),
    [active],
  );

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count =
            f === "All" ? caseStudies.length : caseStudies.filter((c) => c.category === f).length;
          if (count === 0) return null;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setActive(f)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm transition-all active:scale-95",
                active === f
                  ? "border-gold/40 bg-gold-glow text-gold"
                  : "border-line bg-surface text-muted hover:text-foreground",
              )}
            >
              {f}
              <span className="ml-1.5 font-mono text-xs opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      <motion.div layout className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {filtered.map((study) => (
            <motion.div
              key={study.slug}
              layout
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              <CaseCard study={study} />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
