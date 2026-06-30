import { Aurora } from "@/components/visual/aurora";
import { Reveal } from "@/components/reveal";

export function PageHeader({
  eyebrow,
  title,
  desc,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  desc?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative isolate overflow-hidden px-4 pb-10 pt-36 sm:pt-44">
      <Aurora />
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-4 max-w-4xl font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl">
            {title}
          </h1>
          {desc && <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">{desc}</p>}
          {children}
        </Reveal>
      </div>
    </section>
  );
}
