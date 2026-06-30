import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { Tilt } from "@/components/visual/tilt";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { Service } from "@/content/site";

export function ServiceCard({ service }: { service: Service }) {
  const featured = service.tier === "primary";

  return (
    <Tilt
      max={featured ? 5 : 7}
      className={cn(
        "group h-full overflow-hidden rounded-2xl border bg-base/60",
        featured ? "border-gold/30" : "border-line",
      )}
    >
      <Link
        href={`/services/${service.slug}`}
        className={cn(
          "relative flex h-full flex-col p-7 sm:p-8",
          featured && "min-h-[20rem]",
        )}
      >
        {featured && (
          <span className="absolute right-6 top-6 rounded-full border border-gold/30 bg-gold-glow px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-gold">
            Core service
          </span>
        )}

        <div
          className={cn(
            "flex items-center justify-center rounded-xl border border-line bg-surface",
            featured ? "h-14 w-14" : "h-12 w-12",
          )}
        >
          <Icon name={service.icon} className={cn("text-gold", featured ? "h-7 w-7" : "h-6 w-6")} />
        </div>

        <h3
          className={cn(
            "mt-5 font-display font-bold tracking-tight",
            featured ? "text-2xl sm:text-3xl" : "text-xl",
          )}
        >
          {service.title}
        </h3>
        <p className="mt-1 font-mono text-xs text-gold">{service.tagline}</p>
        <p className="mt-4 max-w-md leading-relaxed text-muted">{service.summary}</p>

        {featured && (
          <ul className="mt-6 grid gap-2 sm:grid-cols-2">
            {service.outcomes.map((o) => (
              <li key={o} className="flex items-start gap-2 text-sm text-foreground/90">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
                {o}
              </li>
            ))}
          </ul>
        )}

        <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-medium text-foreground">
          Explore {service.title}
          <ArrowUpRight className="h-4 w-4 text-gold transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </span>
      </Link>
    </Tilt>
  );
}
