import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Check, ArrowLeft } from "lucide-react";
import { services, getService, featuredCaseStudies } from "@/content/site";
import { PageHeader } from "@/components/page-header";
import { Reveal, RevealGroup, RevealItem } from "@/components/reveal";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { CaseCard } from "@/components/work/case-card";
import { process } from "@/content/site";

export function generateStaticParams() {
  return services.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const service = getService(slug);
  if (!service) return { title: "Service" };
  return { title: service.title, description: service.summary };
}

export default async function ServicePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const service = getService(slug);
  if (!service) notFound();

  const isAutomation = service.slug === "ai-automation";

  return (
    <>
      <PageHeader eyebrow={service.tier === "primary" ? "Core service" : "Service"} title={service.title} desc={service.summary}>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-gold/30 bg-gold-glow">
            <Icon name={service.icon} className="h-6 w-6 text-gold" />
          </span>
          <p className="font-mono text-sm text-gold">{service.tagline}</p>
        </div>
      </PageHeader>

      <section className="px-4 pb-8">
        <div className="mx-auto max-w-7xl">
          <Link
            href="/#services"
            className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> All services
          </Link>

          {/* Outcomes + deliverables */}
          <div className="mt-12 grid gap-10 lg:grid-cols-2">
            <Reveal>
              <h2 className="font-mono text-xs uppercase tracking-widest text-gold">
                What you get out of it
              </h2>
              <ul className="mt-6 space-y-4">
                {service.outcomes.map((o) => (
                  <li key={o} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gold-glow">
                      <Check className="h-4 w-4 text-gold" />
                    </span>
                    <span className="text-lg leading-relaxed text-foreground/90">{o}</span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal>
              <h2 className="font-mono text-xs uppercase tracking-widest text-gold">
                What I can build
              </h2>
              <div className="mt-6 grid gap-3">
                {service.deliverables.map((d) => (
                  <div
                    key={d}
                    className="glass rounded-xl px-5 py-4 text-foreground/90 transition-colors hover:border-line-strong"
                  >
                    {d}
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          {/* Process reminder */}
          <RevealGroup className="mt-20 grid gap-4 md:grid-cols-3">
            {process.map((step) => (
              <RevealItem key={step.no}>
                <div className="glass h-full rounded-2xl p-6">
                  <span className="font-display text-sm font-bold text-gold">{step.no}</span>
                  <h3 className="mt-2 font-display text-lg font-bold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{step.desc}</p>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>

          {/* Related work — only on the automation page */}
          {isAutomation && (
            <div className="mt-20">
              <Reveal>
                <h2>
                  Automations I&apos;ve <span className="text-gradient-gold">already shipped</span>
                </h2>
              </Reveal>
              <RevealGroup className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {featuredCaseStudies.map((study) => (
                  <RevealItem key={study.slug}>
                    <CaseCard study={study} />
                  </RevealItem>
                ))}
              </RevealGroup>
            </div>
          )}

          {/* CTA */}
          <Reveal className="mt-20">
            <div className="glass relative overflow-hidden rounded-3xl p-8 text-center sm:p-12">
              <div className="pointer-events-none absolute inset-0 -z-10 bg-gold-glow opacity-30 blur-3xl" />
              <h2 className="mx-auto max-w-2xl">
                Curious what {service.title.toLowerCase()} could do for your business?
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-muted">
                Book a free call. I&apos;ll give you a straight answer on what&apos;s worth doing — no
                pressure, no jargon.
              </p>
              <div className="mt-7 flex justify-center">
                <Button href="/contact" size="lg">
                  Book a free call
                  <ArrowUpRight className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
