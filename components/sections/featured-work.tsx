import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { RevealGroup, RevealItem, Reveal } from "@/components/reveal";
import { CaseCard } from "@/components/work/case-card";
import { featuredCaseStudies } from "@/content/site";

export function FeaturedWork() {
  return (
    <section className="relative px-4 py-24 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeading
            eyebrow="Proof, not promises"
            title={
              <>
                Real systems,{" "}
                <span className="text-gradient-gold">running in production.</span>
              </>
            }
            desc="Not mockups or tutorials — automations built to a production standard, error-handled and tested, including a live deployment for a real client."
          />
          <Reveal>
            <Link
              href="/work"
              className="group inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-5 py-2.5 text-sm text-foreground transition-colors hover:border-gold/50"
            >
              View all work
              <ArrowUpRight className="h-4 w-4 text-gold transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </Reveal>
        </div>

        <RevealGroup className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {featuredCaseStudies.map((study) => (
            <RevealItem key={study.slug}>
              <CaseCard study={study} />
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
