import { SectionHeading } from "@/components/section-heading";
import { Reveal } from "@/components/reveal";
import { ServiceCard } from "@/components/services/service-card";
import { services } from "@/content/site";

export function Services() {
  return (
    <section id="services" className="relative scroll-mt-24 px-4 py-24 sm:py-28">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="What I do"
          title={
            <>
              Automation <span className="text-gradient-gold">first.</span>
            </>
          }
          desc="My focus is AI automation — but I can also build the website, app, and brand it all runs on. One person, the whole system."
        />

        {/* Expanding accordion — panels flex; hover one to grow it to full width */}
        <Reveal className="group/row mt-14 flex flex-col gap-4 lg:h-[30rem] lg:flex-row">
          {services.map((s, i) => (
            <ServiceCard key={s.slug} service={s} index={i} />
          ))}
        </Reveal>
      </div>
    </section>
  );
}
