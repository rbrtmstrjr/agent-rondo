import { SectionHeading } from "@/components/section-heading";
import { Reveal, RevealGroup, RevealItem } from "@/components/reveal";
import { WorkflowGraph } from "@/components/visual/workflow-graph";
import { process } from "@/content/site";

export function Process() {
  return (
    <section id="process" className="relative scroll-mt-24 px-4 py-24 sm:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* left — heading + the grouped steps */}
          <div>
            <SectionHeading
              eyebrow="How we work together"
              title={
                <>
                  Autopilot in <span className="text-gradient-gold">three steps.</span>
                </>
              }
              desc="No jargon, no months-long projects with nothing to show. A clear path from 'this is eating our time' to 'this runs itself.'"
            />

            <RevealGroup className="mt-10 grid gap-4">
              {process.map((step) => (
                <RevealItem key={step.no}>
                  <div className="glass relative rounded-2xl p-6">
                    <div className="flex items-center gap-4">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gold/30 bg-gold-glow font-display text-lg font-bold text-gold">
                        {step.no}
                      </span>
                      <h3 className="font-display text-xl font-bold">{step.title}</h3>
                    </div>
                    <p className="mt-4 leading-relaxed text-muted">{step.desc}</p>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>

          {/* right — automation diagram */}
          <Reveal className="flex justify-center lg:justify-end">
            <WorkflowGraph />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
