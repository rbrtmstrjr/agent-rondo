import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Reveal, RevealGroup, RevealItem } from "@/components/reveal";
import { Placeholder } from "@/components/visual/placeholder";
import { Button } from "@/components/ui/button";
import { site } from "@/content/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "Robert Maestro — designer turned AI automation specialist. 8 years on the web, 119+ sites built, now focused on building AI systems that run the busywork.",
};

const TOOLKIT = [
  {
    group: "Automation & AI",
    items: ["n8n", "Gemini", "RAG / embeddings", "Airtable", "Google Sheets", "Slack", "WhatsApp API", "Webhooks"],
  },
  {
    group: "Development",
    items: ["Next.js", "React", "TypeScript", "Tailwind CSS", "Node.js", "Python", "REST APIs", "Git"],
  },
  {
    group: "Design",
    items: ["Figma", "Photoshop", "Illustrator", "UI systems", "Brand kits", "Photo editing"],
  },
];

const SOFT = ["Problem solver", "Clear communicator", "Reliable", "Detail-obsessed", "Adaptable", "Self-driven"];

const JOURNEY = [
  { year: "2017", title: "Started on the web", desc: "Began designing and building websites — the start of 100+ projects." },
  { year: "2023", title: "Went full-stack", desc: "Moved from design into React, Next.js, and TypeScript development." },
  { year: "2024", title: "Found automation", desc: "Started building with n8n and AI — and saw how much manual work it could erase." },
  { year: "2026", title: "All-in on AI automation", desc: "Shipped production automations and a live client deployment. This is the focus now." },
];

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="About me"
        title={
          <>
            I make businesses run on <span className="text-gradient-gold">systems, not stress.</span>
          </>
        }
      />

      <section className="px-4 pb-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-start gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <Reveal>
              <Placeholder label="Robert" ratio="aspect-[4/5]" />
              <div className="mt-4 glass rounded-2xl p-5">
                <p className="inline-flex items-center gap-2 font-mono text-xs text-gold">
                  <span className="h-2 w-2 rounded-full bg-gold" />
                  {site.availability}
                </p>
                <p className="mt-2 text-sm text-muted">{site.location}</p>
              </div>
            </Reveal>

            <Reveal>
              <div className="space-y-5 text-lg leading-relaxed text-foreground/90">
                <p>
                  Hi, I&apos;m Robert. I spent years as a web and graphic designer — over{" "}
                  <span className="text-gold">119 websites</span> and counting — learning how to make
                  things that look great and actually work.
                </p>
                <p>
                  But the more I built, the more I noticed the same thing: businesses weren&apos;t
                  short on tools. They were drowning in <span className="text-foreground">manual,
                  repetitive work</span> — answering the same questions, chasing leads, typing
                  invoices, copying data between apps.
                </p>
                <p>
                  So I went deep on <span className="text-gold">AI automation</span>. Now I build
                  systems that do that work automatically — answering customers 24/7, qualifying
                  leads in seconds, reading documents, creating content — wired into the tools a
                  business already uses, and built to a production standard.
                </p>
                <p>
                  Because I also design and develop, I don&apos;t just hand you a workflow — I can
                  build the website, app, and brand it lives in. One person, the whole system.
                </p>
              </div>

              <div className="mt-8">
                <Button href="/contact">
                  Let&apos;s work together <ArrowUpRight className="h-4 w-4" />
                </Button>
              </div>
            </Reveal>
          </div>

          {/* Journey */}
          <div className="mt-24">
            <Reveal>
              <p className="eyebrow">The path here</p>
              <h2 className="mt-4">
                From pixels to <span className="text-gradient-gold">pipelines.</span>
              </h2>
            </Reveal>
            <RevealGroup className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {JOURNEY.map((j) => (
                <RevealItem key={j.year}>
                  <div className="glass h-full rounded-2xl p-6">
                    <p className="font-mono text-sm text-gold">{j.year}</p>
                    <h3 className="mt-2 font-display text-lg font-bold">{j.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{j.desc}</p>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>

          {/* Toolkit */}
          <div className="mt-24">
            <Reveal>
              <p className="eyebrow">The toolkit</p>
              <h2 className="mt-4">
                What I build with.
              </h2>
            </Reveal>
            <RevealGroup className="mt-10 grid gap-4 md:grid-cols-3">
              {TOOLKIT.map((t) => (
                <RevealItem key={t.group}>
                  <div className="glass h-full rounded-2xl p-6">
                    <h3 className="font-mono text-xs uppercase tracking-widest text-gold">
                      {t.group}
                    </h3>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {t.items.map((i) => (
                        <span
                          key={i}
                          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-muted"
                        >
                          {i}
                        </span>
                      ))}
                    </div>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>

            <Reveal className="mt-6">
              <div className="flex flex-wrap gap-2">
                {SOFT.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-gold/20 bg-gold-glow px-3 py-1.5 text-sm text-gold"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}
