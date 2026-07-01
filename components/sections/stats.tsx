import Image from "next/image";
import { stats } from "@/content/site";
import { CountUp } from "@/components/visual/count-up";
import { SectionHeading } from "@/components/section-heading";
import { Reveal } from "@/components/reveal";
import profile from "@/src/images/profile.png";

/* Desktop: cards + connector lines share ONE coordinate space (1000×600 viewBox
   mapped onto the lg:aspect-[5/3] box) so a card's edge ring and its line align. */
const NODE = [
  { cx: "25%", cy: "20%", tx: "-100%", a: [250, 120], t: [372, 250] },
  { cx: "25%", cy: "78%", tx: "-100%", a: [250, 468], t: [388, 380] },
  { cx: "76%", cy: "25%", tx: "0%", a: [760, 150], t: [628, 250] },
  { cx: "76%", cy: "78%", tx: "0%", a: [760, 468], t: [620, 380] },
] as const;

/* Mobile/tablet: scattered floating labels around the photo. */
const MPOS = ["left-0 top-2", "right-0 top-20", "left-1 bottom-20", "right-0 bottom-2"] as const;
const MROT = [-5, 5, 4, -4] as const;

function Stat({ s }: { s: (typeof stats)[number] }) {
  return (
    <div
      className="gold-gradient rounded-xl px-3 py-2 text-center sm:px-3.5"
      style={{ boxShadow: "0 0 28px -2px var(--color-gold-glow)" }}
    >
      <p className="font-display text-xl font-bold text-black sm:text-2xl">
        <CountUp to={s.value} suffix={s.suffix} />
      </p>
      <p className="mx-auto mt-0.5 max-w-[8rem] text-[11px] font-medium leading-tight text-black/70">
        {s.label}
      </p>
    </div>
  );
}

export function Stats() {
  return (
    <section className="relative px-4 py-24 sm:py-28">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          align="center"
          eyebrow="Track record"
          title={
            <>
              Real work, <span className="text-gradient-gold">real results.</span>
            </>
          }
          desc="Years of building — and a growing list of automations running in production."
        />

        <Reveal className="relative mx-auto mt-16 aspect-[4/5] max-w-sm sm:max-w-lg lg:aspect-[5/3] lg:max-w-5xl">
          {/* photo (centered) */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl sm:h-96 sm:w-96"
              style={{ background: "radial-gradient(circle, var(--color-gold-glow), transparent 70%)" }}
              aria-hidden
            />
            <Image src={profile} alt="Robert Maestro" className="relative h-auto w-52 sm:w-72 lg:w-96" />
          </div>

          {/* mobile / tablet: scattered floating labels */}
          <div className="absolute inset-0 lg:hidden">
            {stats.map((s, i) => (
              <div key={s.label} className={`absolute ${MPOS[i]}`}>
                <div style={{ transform: `rotate(${MROT[i]}deg)` }}>
                  <div style={{ animation: `floaty ${5 + i}s ease-in-out ${i * 0.4}s infinite` }}>
                    <Stat s={s} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* desktop: connector lines + labels in a shared coordinate space */}
          <div className="absolute inset-0 hidden lg:block">
            <svg
              viewBox="0 0 1000 600"
              className="pointer-events-none absolute inset-0 h-full w-full"
              fill="none"
              aria-hidden
            >
              {NODE.map((n, i) => (
                <g key={i} stroke="var(--color-gold)" vectorEffect="non-scaling-stroke">
                  <line
                    x1={n.a[0]}
                    y1={n.a[1]}
                    x2={n.t[0]}
                    y2={n.t[1]}
                    strokeWidth="2"
                    strokeDasharray="5 6"
                    strokeOpacity="0.6"
                    strokeLinecap="round"
                  />
                  <circle cx={n.a[0]} cy={n.a[1]} r="7" strokeWidth="2" />
                  <circle cx={n.t[0]} cy={n.t[1]} r="3.5" fill="var(--color-gold)" stroke="none" />
                </g>
              ))}
            </svg>

            {NODE.map((n, i) => (
              <div
                key={stats[i].label}
                className="absolute"
                style={{ left: n.cx, top: n.cy, transform: `translate(${n.tx}, -50%)` }}
              >
                <Stat s={stats[i]} />
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
