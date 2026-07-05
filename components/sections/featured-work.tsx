"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import { SectionHeading } from "@/components/section-heading";
import { RevealGroup, RevealItem, Reveal } from "@/components/reveal";
import { CaseCard } from "@/components/work/case-card";
import { caseStudies } from "@/content/site";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  "AI Automation",
  "Web & Mobile Development",
  "UI/UX",
  "Graphic Design",
] as const;
const PER_CATEGORY = 3;

export function FeaturedWork() {
  const [active, setActive] = useState<(typeof CATEGORIES)[number]>(CATEGORIES[0]);

  const items = caseStudies.filter((s) => s.category === active).slice(0, PER_CATEGORY);

  return (
    <section className="relative px-4 py-24 sm:py-28">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="Proof, not promises"
          title={
            <>
              Systems <span className="text-gradient-gold">running live.</span>
            </>
          }
          desc="Not mockups or tutorials — automations built to a production standard, error-handled and tested, including a live deployment for a real client."
        />

        {/* category tab bar */}
        <Reveal className="mt-10">
          <div className="inline-flex flex-wrap gap-1 rounded-full border border-white/15 bg-white/5 p-1 backdrop-blur-xl">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setActive(c)}
                className={cn(
                  "relative rounded-full px-5 py-2 font-mono text-xs uppercase tracking-wider transition-colors duration-200 sm:text-sm",
                  active === c ? "text-black" : "text-white/60 hover:text-white",
                )}
              >
                {active === c && (
                  <motion.span
                    layoutId="workTab"
                    className="absolute inset-0 rounded-full bg-white"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{c}</span>
              </button>
            ))}
          </div>
        </Reveal>

        {/* gallery — keyed by tab so it re-animates on switch */}
        {items.length > 0 ? (
          <RevealGroup
            key={active}
            className="mt-8 grid auto-rows-fr gap-4 md:grid-cols-2 lg:grid-cols-3"
          >
            {items.map((study) => (
              <RevealItem key={study.slug} className="h-full">
                <CaseCard study={study} />
              </RevealItem>
            ))}
          </RevealGroup>
        ) : (
          <Reveal key={active} className="mt-8">
            <div className="flex min-h-[16rem] items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/[0.02] text-center">
              <p className="font-mono text-sm uppercase tracking-widest text-white/40">
                Sample work coming soon
              </p>
            </div>
          </Reveal>
        )}

        {/* more → specific category */}
        <Reveal className="mt-10 flex justify-center">
          <Link
            href={`/work?category=${encodeURIComponent(active)}`}
            className="group inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/5 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
          >
            More {active} work
            <ArrowUpRight className="h-4 w-4 text-gold transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
