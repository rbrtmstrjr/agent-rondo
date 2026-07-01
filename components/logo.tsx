import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Agent Rondo — home"
      className={cn(
        "group inline-flex items-center gap-2 font-display text-lg font-bold tracking-tight",
        className,
      )}
    >
      <span className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-sm">
        <span className="text-gradient-gold">R</span>
        <span className="absolute inset-0 rounded-lg opacity-0 transition-opacity duration-300 group-hover:opacity-100 glow-gold" />
      </span>
      <span>
        Agent Rondo<span className="text-gold">.</span>
      </span>
    </Link>
  );
}
