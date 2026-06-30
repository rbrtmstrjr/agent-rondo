import { SectionHeading } from "@/components/section-heading";
import { RevealGroup, RevealItem } from "@/components/reveal";
import { ServiceCard } from "@/components/services/service-card";
import { services } from "@/content/site";

export function Services() {
  const primary = services.filter((s) => s.tier === "primary");
  const secondary = services.filter((s) => s.tier === "secondary");

  return (
    <section id="services" className="relative scroll-mt-24 px-4 py-24 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="What I do"
          title={
            <>
              Automation first.{" "}
              <span className="text-gradient-gold">Full-stack second.</span>
            </>
          }
          desc="My focus is AI automation — but I can also build the website, app, and brand it all runs on. One person, the whole system."
        />

        <RevealGroup className="mt-14 grid gap-4 lg:grid-cols-3">
          {/* Primary spans full width on top */}
          {primary.map((s) => (
            <RevealItem key={s.slug} className="lg:col-span-3">
              <ServiceCard service={s} />
            </RevealItem>
          ))}
          {/* Secondary services */}
          {secondary.map((s) => (
            <RevealItem key={s.slug}>
              <ServiceCard service={s} />
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
