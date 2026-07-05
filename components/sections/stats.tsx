import Link from "next/link";
import { site, stats } from "@/content/site";
import { CountUp } from "@/components/visual/count-up";
import { HudFrame } from "@/components/visual/hud-frame";
import { Icon } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { ProfileReveal } from "@/components/visual/profile-reveal";
import profile from "@/src/images/profile.jpg";
import profileHover from "@/src/images/profile_hover.jpg";

/* Futuristic "operator profile" dossier — framed scanning portrait + identity +
   a HUD data grid of the track record. */
export function Stats() {
  return (
    <section className="relative flex min-h-dvh items-center px-4 py-20">
      <div className="mx-auto w-full max-w-7xl">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-white/12 bg-white/[0.03] p-6 backdrop-blur-xl sm:p-8 lg:p-10">
            {/* grid texture + ambient glow */}
            <div className="grid-texture pointer-events-none absolute inset-0 opacity-40" aria-hidden />
            <div
              className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-gold-glow blur-3xl"
              aria-hidden
            />
            {/* corner brackets */}
            <span className="pointer-events-none absolute left-3 top-3 h-5 w-5 rounded-tl border-l-2 border-t-2 border-gold/40" aria-hidden />
            <span className="pointer-events-none absolute right-3 top-3 h-5 w-5 rounded-tr border-r-2 border-t-2 border-gold/40" aria-hidden />
            <span className="pointer-events-none absolute bottom-3 left-3 h-5 w-5 rounded-bl border-b-2 border-l-2 border-gold/40" aria-hidden />
            <span className="pointer-events-none absolute bottom-3 right-3 h-5 w-5 rounded-br border-b-2 border-r-2 border-gold/40" aria-hidden />

            {/* top HUD bar */}
            <div className="relative flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">
              <span>{"// Operator Profile"}</span>
              <span className="inline-flex items-center gap-2 text-gold">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
                </span>
                Online
              </span>
            </div>

            <div className="relative mt-6 grid gap-8 lg:grid-cols-[24rem_1fr] lg:items-stretch lg:gap-12">
              {/* portrait — image fills the whole frame */}
              <HudFrame className="mx-auto w-full max-w-[24rem] lg:mx-0 lg:h-full">
                <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-white/10 bg-black/40 lg:aspect-auto lg:h-full">
                  <ProfileReveal
                    base={profile}
                    hover={profileHover}
                    alt={site.name}
                    className="absolute inset-0"
                  />
                  {/* scan line */}
                  <span
                    className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-gold/30 to-transparent"
                    style={{ animation: "scan 4.5s linear infinite" }}
                    aria-hidden
                  />
                  {/* id strip */}
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between rounded-b-2xl bg-black/60 px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest text-white/60 backdrop-blur-sm">
                    <span>ID · RM-01</span>
                    <span className="text-gold">◈ Verified</span>
                  </div>
                </div>
              </HudFrame>

              {/* identity + stats */}
              <div className="flex flex-col justify-center">
                <p className="font-mono text-xs uppercase tracking-[0.25em] text-gold">
                  {site.role}
                </p>
                <h2 className="mt-3">Agent Rondo</h2>
                <p className="mt-4 max-w-md leading-relaxed text-white/60">{site.tagline}</p>

                {/* socials */}
                <div className="mt-6 flex gap-2.5">
                  {site.socials.map((s) => {
                    const external = s.href.startsWith("http");
                    return (
                      <Link
                        key={s.label}
                        href={s.href}
                        aria-label={s.label}
                        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/12 bg-white/[0.03] text-white/70 transition-colors hover:border-gold/50 hover:text-gold"
                      >
                        <Icon name={s.icon} className="h-5 w-5" />
                      </Link>
                    );
                  })}
                </div>

                {/* HUD stat grid */}
                <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10">
                  {stats.map((s, i) => (
                    <div
                      key={s.label}
                      className="relative bg-deep/70 p-4 sm:p-5"
                    >
                      <span className="font-mono text-[10px] tracking-widest text-white/30">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <p className="mt-1 font-display text-3xl font-bold text-white sm:text-4xl">
                        <CountUp to={s.value} suffix={s.suffix} />
                      </p>
                      <p className="mt-1.5 text-[11px] leading-tight text-white/45">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
