import { SectionHeading } from "@/components/section-heading";
import { RevealGroup, RevealItem } from "@/components/reveal";
import { Placeholder } from "@/components/visual/placeholder";

/* Secondary proof: the web/design breadth behind the automation focus.
   Placeholder tiles now; drop in real screenshots later. */
const TILES = [
  { label: "SaaS landing", span: "md:col-span-2", ratio: "aspect-[16/10]" },
  { label: "E-commerce", span: "", ratio: "aspect-[4/5]" },
  { label: "Dashboard", span: "", ratio: "aspect-[4/5]" },
  { label: "Brand site", span: "md:col-span-2", ratio: "aspect-[16/10]" },
  { label: "Mobile app", span: "", ratio: "aspect-[4/5]" },
  { label: "Portfolio", span: "", ratio: "aspect-[4/5]" },
];

export function DesignGrid() {
  return (
    <section className="px-4 py-24 sm:py-28">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="Beyond automation"
          title={
            <>
              <span className="text-gradient-gold">119+ sites</span> shipped.
            </>
          }
          desc="Automation is the focus — but the design and development chops are real. A glimpse of the web and brand work behind the systems."
        />
        <RevealGroup className="mt-12 grid auto-rows-fr gap-4 sm:grid-cols-2 md:grid-cols-3">
          {TILES.map((t, i) => (
            <RevealItem key={i} className={t.span}>
              <Placeholder label={t.label} ratio={t.ratio} className="h-full transition-transform duration-500 hover:scale-[1.01]" />
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
