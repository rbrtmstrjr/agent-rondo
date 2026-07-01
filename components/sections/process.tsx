import Image from "next/image";
import { SectionHeading } from "@/components/section-heading";
import { Reveal, RevealGroup, RevealItem } from "@/components/reveal";
import { process } from "@/content/site";
import armWithApple from "@/src/images/arm-with-apple.png";

export function Process() {
  return (
    <section id="process" className="relative scroll-mt-24 px-4 py-24 sm:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <SectionHeading
            eyebrow="How we work together"
            title={
              <>
                Autopilot in <span className="text-gradient-gold">three steps.</span>
              </>
            }
            desc="No jargon, no months-long projects with nothing to show. A clear path from 'this is eating our time' to 'this runs itself.'"
          />
          <Reveal className="flex justify-center lg:justify-end">
            <Image
              src={armWithApple}
              alt="Agent Rondo handing over a finished result"
              className="mx-auto h-auto w-52 sm:w-72 lg:w-full lg:max-w-md"
            />
          </Reveal>
        </div>

        <RevealGroup className="mt-14 grid gap-4 md:grid-cols-3">
          {process.map((step) => (
            <RevealItem key={step.no}>
              <div className="glass relative h-full rounded-2xl p-7">
                <div className="flex items-center gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-gold/30 bg-gold-glow font-display text-lg font-bold text-gold">
                    {step.no}
                  </span>
                  <h3 className="font-display text-xl font-bold">{step.title}</h3>
                </div>
                <p className="mt-5 leading-relaxed text-muted">{step.desc}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
