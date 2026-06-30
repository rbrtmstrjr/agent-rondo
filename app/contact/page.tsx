import type { Metadata } from "next";
import { Mail, MapPin, Clock, Zap } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Reveal } from "@/components/reveal";
import { ContactForm } from "@/components/contact/contact-form";
import { Icon } from "@/components/icons";
import { site } from "@/content/site";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Book a free automation audit. Tell me what's eating your team's time and I'll show you what to automate first.",
};

const POINTS = [
  { icon: Zap, title: "Free automation audit", desc: "I'll tell you what's worth automating first — no pressure." },
  { icon: Clock, title: "Reply within 1 business day", desc: "You'll hear back fast, with a straight answer." },
  { icon: Mail, title: "Email", desc: site.email, href: `mailto:${site.email}` },
  { icon: MapPin, title: "Based in", desc: site.location },
];

export default function ContactPage() {
  return (
    <>
      <PageHeader
        eyebrow="Get in touch"
        title={
          <>
            Let&apos;s find what to{" "}
            <span className="text-gradient-gold">automate first.</span>
          </>
        }
        desc="Tell me about the repetitive work slowing your team down. I'll come back with a clear, honest take on what an automation could do — and what it'd take to build."
      />

      <section className="px-4 pb-8">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_1.1fr]">
          {/* Left: reassurance */}
          <Reveal>
            <div className="space-y-4">
              {POINTS.map((p) => (
                <div key={p.title} className="glass flex items-start gap-4 rounded-2xl p-5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface">
                    <p.icon className="h-5 w-5 text-gold" aria-hidden />
                  </span>
                  <div>
                    <h3 className="font-display font-semibold">{p.title}</h3>
                    {p.href ? (
                      <a href={p.href} className="text-sm text-muted hover:text-gold">
                        {p.desc}
                      </a>
                    ) : (
                      <p className="text-sm text-muted">{p.desc}</p>
                    )}
                  </div>
                </div>
              ))}

              <div className="flex gap-2 pt-2">
                {site.socials.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    aria-label={s.label}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface text-muted transition-colors hover:border-gold/50 hover:text-gold"
                  >
                    <Icon name={s.icon} className="h-5 w-5" />
                  </a>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Right: form */}
          <Reveal delay={0.1}>
            <ContactForm />
          </Reveal>
        </div>
      </section>
    </>
  );
}
