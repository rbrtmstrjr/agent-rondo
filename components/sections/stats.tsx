import { stats } from "@/content/site";
import { CountUp } from "@/components/visual/count-up";
import { RevealGroup, RevealItem } from "@/components/reveal";

export function Stats() {
  return (
    <section className="relative px-4 py-12">
      <div className="mx-auto max-w-6xl">
        <RevealGroup className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
          {stats.map((s) => (
            <RevealItem key={s.label}>
              <div className="h-full bg-base p-6 text-center sm:p-8">
                <p className="font-display text-4xl font-bold text-gradient-gold sm:text-5xl">
                  <CountUp to={s.value} suffix={s.suffix} />
                </p>
                <p className="mt-2 text-sm text-muted">{s.label}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
