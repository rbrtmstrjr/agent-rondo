import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { nav, services, site } from "@/content/site";
import { Logo } from "./logo";
import { Icon } from "./icons";

export function Footer() {
  return (
    <footer className="relative mt-32 pb-24 sm:pb-28">
      {/* Big CTA band */}
      <div className="relative isolate overflow-hidden">
        {/* pointed gradient dome — crisp original + bigger blurred copy behind it for a glow */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0" aria-hidden>
          <div className="relative mx-auto flex justify-center">
            {/* blurred halo (bigger, behind, shifted down) */}
            <svg
              viewBox="0 0 100 40"
              preserveAspectRatio="none"
              className="absolute bottom-0 left-1/2 h-48 -translate-x-1/2 translate-y-8 blur-2xl sm:h-[19rem]"
              style={{ width: "min(1950px, 160%)", opacity: 0.6 }}
            >
              <defs>
                <linearGradient id="domeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-gold-bright)" />
                  <stop offset="14%" stopColor="var(--color-gold)" />
                  <stop offset="30%" stopColor="var(--color-gold-deep)" />
                  <stop offset="44%" stopColor="#7a3400" />
                  <stop offset="58%" stopColor="#4a2000" />
                  <stop offset="70%" stopColor="#2a1409" />
                  <stop offset="82%" stopColor="#1a0d07" />
                  <stop offset="96%" stopColor="var(--color-deep)" />
                </linearGradient>
              </defs>
              <path d="M0 40 C 15 -8 85 -8 100 40 Z" fill="url(#domeGrad)" />
            </svg>
            {/* crisp dome (front) */}
            <svg
              viewBox="0 0 100 40"
              preserveAspectRatio="none"
              className="relative h-40 sm:h-64"
              style={{ width: "min(1800px, 150%)", opacity: 0.95 }}
            >
              <path d="M0 40 C 15 -8 85 -8 100 40 Z" fill="url(#domeGrad)" />
            </svg>
          </div>
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 pb-56 pt-20 text-center sm:pb-80">
          <p className="eyebrow">Let&apos;s build something that runs itself</p>
        <h2 className="mx-auto mt-4 max-w-3xl">
          Ready to put your busywork{" "}
          <span className="text-gradient-gold">on autopilot?</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-muted">
          Tell me what&apos;s eating your team&apos;s hours. I&apos;ll show you what to automate
          first — for free.
        </p>
        <Link
          href="/contact"
          className="group mt-8 inline-flex h-13 items-center gap-2 rounded-full bg-white px-8 text-base font-medium text-black transition-all hover:bg-white/90 active:scale-95"
        >
          Book a free automation audit
          <ArrowUpRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
        </div>
      </div>

      <div>
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-muted">{site.tagline}</p>
            <p className="mt-4 inline-flex items-center gap-2 font-mono text-xs text-gold">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
              </span>
              {site.availability}
            </p>
          </div>

          <div>
            <h3 className="font-mono text-xs uppercase tracking-widest text-faint">Navigate</h3>
            <ul className="mt-4 space-y-2.5">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-sm text-muted hover:text-foreground">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-mono text-xs uppercase tracking-widest text-faint">Services</h3>
            <ul className="mt-4 space-y-2.5">
              {services.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/services/${s.slug}`}
                    className="text-sm text-muted hover:text-foreground"
                  >
                    {s.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-mono text-xs uppercase tracking-widest text-faint">Connect</h3>
            <a
              href={`mailto:${site.email}`}
              className="mt-4 block text-sm text-muted hover:text-foreground"
            >
              {site.email}
            </a>
            <p className="mt-1 text-sm text-faint">{site.location}</p>
            <div className="mt-4 flex gap-2">
              {site.socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-muted transition-colors hover:border-gold/50 hover:text-gold"
                >
                  <Icon name={s.icon} className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 border-t border-line px-4 py-6 text-xs text-faint sm:flex-row">
          <p>
            © {new Date().getFullYear()} {site.name}. Built with Next.js + automation in mind.
          </p>
          <p className="font-mono">Portfolio v2 — 2026</p>
        </div>
      </div>
    </footer>
  );
}
