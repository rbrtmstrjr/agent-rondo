"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Layers, Workflow, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type DockItem = { label: string; href: string; icon: LucideIcon; match?: string };

const ITEMS: DockItem[] = [
  { label: "Work", href: "/work", icon: Briefcase, match: "/work" },
  { label: "Services", href: "/#services", icon: Layers, match: "/services" },
  { label: "Process", href: "/#process", icon: Workflow },
  { label: "About", href: "/about", icon: User, match: "/about" },
];

export function BottomNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 sm:bottom-10">
      <nav
        aria-label="Primary"
        className={cn(
          "pointer-events-auto flex items-center gap-1.5 rounded-full border px-3 py-2 transition-all duration-500",
          scrolled
            ? "gold-gradient border-gold-deep/50 shadow-[0_12px_50px_-12px_var(--color-gold-glow)]"
            : "border-line bg-base/70 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl",
        )}
      >
        {ITEMS.map((item) => {
          const active = item.match ? pathname.startsWith(item.match) : false;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group/dock relative flex items-center gap-2 overflow-hidden rounded-full px-3 py-2.5 text-sm transition-all hover:text-black active:scale-95 sm:px-4",
                active ? "font-medium text-black" : scrolled ? "text-black/70" : "text-muted",
              )}
            >
              {/* solid gold gradient fill — persistent when active, on hover otherwise */}
              <span
                aria-hidden
                className={cn(
                  "gold-gradient absolute inset-0 brightness-110 transition-opacity duration-300",
                  active ? "opacity-100" : "opacity-0 group-hover/dock:opacity-100",
                )}
                style={{ boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.18)" }}
              />
              <span className="relative z-10 flex items-center gap-2">
                <Icon className="h-5 w-5 shrink-0" strokeWidth={2.5} aria-hidden />
                <span className="hidden font-bold sm:inline">{item.label}</span>
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
