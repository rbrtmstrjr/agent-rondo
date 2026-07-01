import { Check, ArrowUpRight, Info } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { RevealGroup, RevealItem, Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";
import { pricing } from "@/content/site";
import { cn } from "@/lib/utils";

export function Pricing() {
  return (
    <section id="pricing" className="relative scroll-mt-24 px-4 py-24 sm:py-28">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          align="center"
          eyebrow="Pricing"
          title={
            <>
              Simple, <span className="text-gradient-gold">honest pricing.</span>
            </>
          }
          desc="Start at a fixed price or scope something bigger together — you'll always know the cost before we build."
        />

        <RevealGroup className="mt-14 grid items-stretch gap-4 md:grid-cols-3">
          {pricing.map((p) => (
            <RevealItem key={p.name} className="h-full">
              <div
                className={cn(
                  "flex h-full flex-col rounded-2xl border p-7 sm:p-8",
                  p.featured
                    ? "border-gold/40 bg-base/70 glow-gold"
                    : "border-line bg-base/60",
                )}
              >
                {p.featured && (
                  <span className="mb-4 inline-flex w-fit rounded-full border border-gold/30 bg-gold-glow px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-gold">
                    Most popular
                  </span>
                )}

                <h3 className="font-display text-xl font-bold">{p.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{p.tagline}</p>

                <div className="mt-6">
                  <span className="font-display text-4xl font-bold text-gradient-gold">
                    {p.price}
                  </span>
                  <span className="ml-2 font-mono text-xs text-faint">{p.priceNote}</span>
                </div>

                <ul className="mt-6 grid gap-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/90">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-gold-glow">
                        <Check className="h-3.5 w-3.5 text-gold" />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-8">
                  <Button
                    href="/contact"
                    variant={p.featured ? "primary" : "outline"}
                    className="w-full"
                  >
                    {p.cta}
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>

        {/* what's scoped on the call */}
        <Reveal className="mt-6">
          <div className="glass flex items-start gap-3 rounded-2xl p-5 text-sm text-muted">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden />
            <p>
              <span className="text-foreground">Ongoing costs are scoped on our call, not baked in.</span>{" "}
              Hosting (self-hosted n8n / VPS), domains, and API usage — plus whether{" "}
              <span className="text-foreground">I maintain it or hand it to your team</span> — depend
              on your setup, so you only pay for what fits. Web, mobile, UI/UX, and graphics are
              quoted after a quick discussion too.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
