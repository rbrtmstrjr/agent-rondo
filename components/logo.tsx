import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Agent Rondo — home"
      className={cn(
        "group inline-flex items-center font-display text-2xl font-bold tracking-wide",
        className,
      )}
    >
      Agent Rondo<span className="text-gold">.</span>
    </Link>
  );
}
