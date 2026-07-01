import { cn } from "@/lib/utils";

/** Decorative HUD corner brackets — wrap content for a futuristic "instrument" feel. */
export function HudFrame({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  const corner = "pointer-events-none absolute h-4 w-4 border-gold/50";
  return (
    <div className={cn("relative", className)}>
      <span className={cn(corner, "left-0 top-0 border-l border-t rounded-tl")} aria-hidden />
      <span className={cn(corner, "right-0 top-0 border-r border-t rounded-tr")} aria-hidden />
      <span className={cn(corner, "bottom-0 left-0 border-b border-l rounded-bl")} aria-hidden />
      <span className={cn(corner, "bottom-0 right-0 border-b border-r rounded-br")} aria-hidden />
      {label && (
        <span className="hud-label absolute -top-2 left-1/2 -translate-x-1/2 bg-deep px-2">
          {label}
        </span>
      )}
      {children}
    </div>
  );
}
