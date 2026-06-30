"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { Aurora } from "@/components/visual/aurora";
import { WorkflowGraph } from "@/components/visual/workflow-graph";
import { Button } from "@/components/ui/button";
import { site } from "@/content/site";
import { EASE } from "@/lib/motion";

const TOOLS = ["n8n", "Gemini", "Next.js", "Airtable", "Slack", "WhatsApp"];

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden px-4 pb-20 pt-36 sm:pt-44">
      <Aurora />

      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        {/* Left: copy */}
        <div>
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
            </span>
            <span className="text-muted">{site.availability}</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.05 }}
            className="mt-6 font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl"
          >
            Stop running your
            <br />
            business on{" "}
            <span className="relative whitespace-nowrap">
              <span className="text-gradient-gold">busywork.</span>
              <svg
                className="absolute -bottom-2 left-0 w-full"
                viewBox="0 0 300 12"
                fill="none"
                aria-hidden
              >
                <path
                  d="M2 9C60 3 120 3 180 6C220 8 260 8 298 4"
                  stroke="var(--color-gold)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  opacity="0.6"
                />
              </svg>
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.15 }}
            className="mt-7 max-w-xl text-lg leading-relaxed text-muted"
          >
            I&apos;m Robert — I build <span className="text-foreground">AI systems</span> that answer
            your customers, qualify your leads, and handle your paperwork{" "}
            <span className="text-foreground">24/7, while you sleep.</span> Production-grade
            automation, live in weeks.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.25 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Button href="/contact" size="lg">
              Book a free automation audit
              <ArrowUpRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Button>
            <Button href="/work" variant="outline" size="lg">
              <Sparkles className="h-4 w-4 text-gold" />
              See the systems
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mt-10"
          >
            <p className="font-mono text-xs uppercase tracking-widest text-faint">
              Built with
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {TOOLS.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-line bg-surface px-3 py-1 font-mono text-xs text-muted"
                >
                  {t}
                </span>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Right: the live automation diagram */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.2 }}
          className="relative"
        >
          <div className="glass rounded-3xl p-6 sm:p-8">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono text-xs text-muted">automation.live</span>
              <span className="inline-flex items-center gap-1.5 font-mono text-xs text-gold">
                <span className="h-1.5 w-1.5 rounded-full bg-gold" /> running
              </span>
            </div>
            <WorkflowGraph />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
