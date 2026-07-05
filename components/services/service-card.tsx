import Link from "next/link";
import Image, { type StaticImageData } from "next/image";
import { ChevronRight, Check } from "lucide-react";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { Service } from "@/content/site";
import blob from "@/src/images/svg/blob.svg";
import aiAutomation from "@/src/images/ai_automation.jpg";
import contentCreation from "@/src/images/content_creation.jpg";
import webDevelopment from "@/src/images/web_development.jpg";
import systemDevelopment from "@/src/images/system_development.jpg";
import uiUx from "@/src/images/ui_ux.jpg";
import graphicsDesign from "@/src/images/graphics_design.jpg";

/* Optional per-service image, keyed by slug. Add more as they're designed. */
const SERVICE_IMAGES: Record<string, StaticImageData> = {
  "ai-automation": aiAutomation,
  "content-creation": contentCreation,
  "web-mobile-development": webDevelopment,
  "system-development": systemDevelopment,
  "ui-ux-design": uiUx,
  "graphics-design": graphicsDesign,
};

/* Each panel gets a distinct blob position/size/rotation so no two look alike.
   Deterministic per-index (not Math.random) to keep SSR + client markup in sync. */
const BLOB_VARIANTS = [
  "left-[42%] top-[35%] h-[230%] w-[230%] -rotate-12",
  "left-[60%] top-[46%] h-[245%] w-[245%] rotate-[20deg] -scale-x-100",
  "left-[46%] top-[52%] h-[220%] w-[220%] rotate-6",
  "left-[56%] top-[38%] h-[255%] w-[255%] -rotate-[22deg]",
  "left-[38%] top-[48%] h-[235%] w-[235%] rotate-[28deg] -scale-x-100",
  "left-[58%] top-[42%] h-[240%] w-[240%] -rotate-[8deg] -scale-y-100",
];

/* Expanding-accordion panel. In a flex row every panel starts equal; on hover
   the hovered panel grows to fill the row (flex-grow) while siblings shrink to
   strips — smooth in and out. Collapsed shows a vertical label; expanded shows
   the full detail on the left with an image on the right. */
export function ServiceCard({ service, index }: { service: Service; index: number }) {
  const num = String(index + 1).padStart(2, "0");
  const image = SERVICE_IMAGES[service.slug];

  return (
    <Link
      href={`/services/${service.slug}`}
      className="group relative w-full overflow-hidden rounded-3xl border border-white/15 bg-white/[0.04] backdrop-blur-xl transition-[flex-grow,border-color] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-white/30 lg:h-full lg:w-auto lg:basis-0 lg:grow lg:hover:grow-[7]"
    >
      {/* blob background — position varies per panel */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -z-0 -translate-x-1/2 -translate-y-1/2 bg-contain bg-center bg-no-repeat opacity-90",
          BLOB_VARIANTS[index % BLOB_VARIANTS.length],
        )}
        style={{ backgroundImage: `url(${blob.src})` }}
      />

      {/* COLLAPSED view — only on lg, fades out on hover.
          Number, icon and title are positioned independently so the icon stays
          centered on the whole panel (not pushed by the vertical label). */}
      <div className="pointer-events-none absolute inset-0 hidden transition-opacity duration-300 group-hover:opacity-0 lg:block">
        <span className="absolute left-7 top-7 font-mono text-sm tracking-widest text-white">
          {num}
        </span>
        <div className="absolute inset-0 flex items-center justify-center pb-24">
          <Icon
            name={service.icon}
            className="h-16 w-16 text-white drop-shadow-[0_16px_30px_rgba(0,0,0,0.55)] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/row:h-10 group-hover/row:w-10"
          />
        </div>
        <h3 className="absolute bottom-7 left-7 font-display text-sm font-medium uppercase tracking-[0.15em] text-white [writing-mode:vertical-rl] [transform:rotate(180deg)]">
          {service.title}
        </h3>
      </div>

      {/* FULL view — always visible on mobile; on lg it fades in on hover */}
      <div className="relative flex min-h-[24rem] w-full flex-col lg:absolute lg:inset-0 lg:min-h-0 lg:flex-row lg:opacity-0 lg:transition-opacity lg:duration-500 lg:group-hover:opacity-100 lg:group-hover:delay-150">
        {/* content — right on lg */}
        <div className="flex flex-col justify-center p-8 sm:p-10 lg:order-2 lg:w-[55%]">
          <span className="font-mono text-sm tracking-widest text-white">{num}</span>
          <h3 className="mt-4 font-display text-3xl font-medium uppercase tracking-[0.15em] text-white">
            {service.title}
          </h3>
          <p className="mt-4 max-w-md leading-relaxed text-white/60">{service.summary}</p>

          <ul className="mt-6 grid gap-3">
            {service.outcomes.map((o) => (
              <li key={o} className="flex items-start gap-2.5 text-sm text-white/85">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden />
                {o}
              </li>
            ))}
          </ul>

          <span className="mt-8 inline-flex items-center gap-3 font-mono text-sm uppercase tracking-wider text-white">
            More details
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/40 text-white">
              <ChevronRight className="h-5 w-5" strokeWidth={2} />
            </span>
          </span>
        </div>

        {/* image — left on lg (falls back to a placeholder if none yet) */}
        <div className="p-6 pt-0 sm:p-10 sm:pt-0 lg:order-1 lg:w-[45%] lg:p-6">
          <div className="relative flex h-56 w-full items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white/[0.03] lg:h-full">
            {image ? (
              <Image
                src={image}
                alt={service.title}
                fill
                sizes="(max-width: 1024px) 100vw, 30vw"
                className="object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-white/40">
                <Icon name={service.icon} className="h-16 w-16" />
                <span className="font-mono text-xs uppercase tracking-widest">Image</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
