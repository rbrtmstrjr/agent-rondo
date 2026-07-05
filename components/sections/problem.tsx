import { Clock, MailX, FileWarning, MoonStar } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { RevealGroup, RevealItem } from "@/components/reveal";
import { SpotlightCard } from "@/components/visual/spotlight-card";
import blob from "@/src/images/svg/blob.svg";

const PAINS = [
  {
    icon: Clock,
    stat: "~60%",
    title: "Leads lost to slow follow-up",
    desc: "Half of all sales go to whoever replies first. A quote form sitting in an inbox is money walking out the door.",
  },
  {
    icon: FileWarning,
    stat: "~500 hrs",
    title: "A year on manual data entry",
    desc: "Hand-typing invoices, copying form fields, updating spreadsheets — slow, tedious, and quietly error-prone.",
  },
  {
    icon: MailX,
    stat: "24/7",
    title: "Questions that never get answered",
    desc: "The same questions, over and over, after hours and on weekends — while customers quietly move on to a competitor.",
  },
  {
    icon: MoonStar,
    stat: "0",
    title: "Hours back in your day",
    desc: "Every repetitive task you do by hand is time you'll never get back — and it doesn't scale as you grow.",
  },
];

export function Problem() {
  return (
    <section className="relative isolate px-4 py-24 sm:py-28">
      {/* static blob SVG (blur baked in) on both sides */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-x-clip" aria-hidden>
        {/* left — large, dominant */}
        <div
          className="absolute bottom-[-38%] left-[-20%] h-[195%] w-[74rem] bg-contain bg-left-bottom bg-no-repeat"
          style={{ backgroundImage: `url(${blob.src})` }}
        />
        {/* right — smaller, top-right corner only */}
        <div
          className="absolute -right-[7%] -top-[16%] h-[72%] w-[34rem] -scale-x-100 bg-contain bg-top bg-no-repeat"
          style={{ backgroundImage: `url(${blob.src})` }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="The hidden cost of doing it by hand"
          title={
            <>
              Work a <span className="text-gradient-gold">machine</span>
              <br />
              <span className="text-gradient-gold">should do.</span>
            </>
          }
          desc="Most businesses don't have a sales or staffing problem. They have a busywork problem — and it's quietly costing them customers, hours, and money every single day."
        />

        <RevealGroup className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PAINS.map((p) => (
            <RevealItem key={p.title}>
              <SpotlightCard className="h-full border-white/15 bg-white/5 backdrop-blur-xl">
                <div className="p-6">
                  <div className="gold-gradient flex h-10 w-10 items-center justify-center rounded-lg">
                    <p.icon className="h-5 w-5 text-black" strokeWidth={2.25} aria-hidden />
                  </div>
                  <p className="mt-5 font-display text-5xl font-bold text-foreground sm:text-6xl">{p.stat}</p>
                  <h3 className="mt-1 font-display text-base font-semibold text-foreground">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{p.desc}</p>
                </div>
              </SpotlightCard>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
