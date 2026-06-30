import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Check, PlayCircle, MessageSquare } from "lucide-react";
import { caseStudies, getCaseStudy } from "@/content/site";
import { PageHeader } from "@/components/page-header";
import { Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";

export function generateStaticParams() {
  return caseStudies.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const study = getCaseStudy(slug);
  if (!study) return { title: "Case study" };
  return {
    title: study.title,
    description: study.oneLiner,
  };
}

export default async function CaseStudyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const study = getCaseStudy(slug);
  if (!study) notFound();

  const idx = caseStudies.findIndex((c) => c.slug === slug);
  const next = caseStudies[(idx + 1) % caseStudies.length];

  return (
    <>
      <PageHeader
        eyebrow={study.category}
        title={study.title}
        desc={study.oneLiner}
      >
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold-glow px-3 py-1.5 font-mono text-xs text-gold">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            {study.status}
          </span>
          <span className="rounded-full border border-line bg-surface px-3 py-1.5 font-mono text-xs text-muted">
            {study.client}
          </span>
        </div>
      </PageHeader>

      <article className="px-4 pb-8">
        <div className="mx-auto max-w-6xl">
          <Link
            href="/work"
            className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> All work
          </Link>

          <div className="mt-10 grid gap-10 lg:grid-cols-[1.6fr_1fr]">
            {/* Main column */}
            <div className="space-y-10">
              <Reveal>
                <h2 className="font-mono text-xs uppercase tracking-widest text-gold">The problem</h2>
                <p className="mt-4 text-lg leading-relaxed text-foreground/90">{study.problem}</p>
              </Reveal>

              <Reveal>
                <h2 className="font-mono text-xs uppercase tracking-widest text-gold">
                  The solution
                </h2>
                <p className="mt-4 text-lg leading-relaxed text-foreground/90">{study.solution}</p>
              </Reveal>

              <Reveal>
                <h2 className="font-mono text-xs uppercase tracking-widest text-gold">
                  What makes it production-grade
                </h2>
                <ul className="mt-5 grid gap-3">
                  {study.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-gold-glow">
                        <Check className="h-3.5 w-3.5 text-gold" />
                      </span>
                      <span className="leading-relaxed text-muted">{h}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>

              {/* Demo placeholder */}
              <Reveal>
                <h2 className="font-mono text-xs uppercase tracking-widest text-gold">Demo</h2>
                <div className="glass mt-4 flex aspect-video flex-col items-center justify-center gap-3 rounded-2xl text-center">
                  {study.demo.type === "live" ? (
                    <MessageSquare className="h-10 w-10 text-gold/70" />
                  ) : (
                    <PlayCircle className="h-10 w-10 text-gold/70" />
                  )}
                  <p className="font-medium text-foreground">{study.demo.note}</p>
                  <p className="max-w-xs text-sm text-faint">
                    {study.demo.type === "live"
                      ? "An interactive demo will be embedded here so you can try it live."
                      : "A short walkthrough video will live here."}
                  </p>
                </div>
              </Reveal>
            </div>

            {/* Sidebar */}
            <aside className="space-y-6 lg:sticky lg:top-28 lg:self-start">
              <div className="glass rounded-2xl p-6">
                <h3 className="font-mono text-xs uppercase tracking-widest text-faint">The result</h3>
                <p className="mt-3 leading-relaxed text-foreground">{study.roi}</p>
              </div>

              <div className="glass rounded-2xl p-6">
                <h3 className="font-mono text-xs uppercase tracking-widest text-faint">
                  By the numbers
                </h3>
                <div className="mt-4 space-y-3">
                  {study.metrics.map((m) => (
                    <div key={m.label} className="flex items-baseline justify-between gap-4">
                      <span className="text-sm text-muted">{m.label}</span>
                      <span className="font-display font-bold text-gold">{m.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass rounded-2xl p-6">
                <h3 className="font-mono text-xs uppercase tracking-widest text-faint">Built with</h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  {study.stack.map((t) => (
                    <span
                      key={t}
                      className="rounded-md border border-line bg-surface px-2.5 py-1 font-mono text-xs text-muted"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              <Button href="/contact" className="w-full" size="lg">
                Want one like this?
                <ArrowUpRight className="h-5 w-5" />
              </Button>
            </aside>
          </div>

          {/* Next case study */}
          <Reveal className="mt-20 border-t border-line pt-10">
            <Link
              href={`/work/${next.slug}`}
              className="group flex flex-wrap items-center justify-between gap-4"
            >
              <div>
                <p className="font-mono text-xs uppercase tracking-widest text-faint">Next case study</p>
                <p className="mt-2 font-display text-2xl font-bold tracking-tight group-hover:text-gold">
                  {next.title}
                </p>
              </div>
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface text-gold transition-all group-hover:border-gold/50 group-hover:translate-x-1">
                <ArrowUpRight className="h-5 w-5" />
              </span>
            </Link>
          </Reveal>
        </div>
      </article>
    </>
  );
}
