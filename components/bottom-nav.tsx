"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Home, Briefcase, User, Mail, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type DockItem = { label: string; href: string; icon: LucideIcon; match?: string; exact?: boolean };

const ITEMS: DockItem[] = [
  { label: "Home", href: "/", icon: Home, match: "/", exact: true },
  { label: "Work", href: "/work", icon: Briefcase, match: "/work" },
  { label: "About", href: "/about", icon: User, match: "/about" },
  { label: "Contact", href: "/contact", icon: Mail, match: "/contact" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 sm:bottom-10">
      <nav
        aria-label="Primary"
        className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/70 bg-white/10 p-2.5 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl"
      >
        {ITEMS.map((item) => {
          const active = item.match
            ? item.exact
              ? pathname === item.match
              : pathname.startsWith(item.match)
            : false;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="relative flex items-center gap-2 rounded-full px-4 py-2 font-mono text-sm font-semibold uppercase tracking-wider"
            >
              {active && (
                <motion.span
                  layoutId="dockActive"
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-white"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span
                className={cn(
                  "relative z-10 flex items-center gap-2 transition-colors duration-300",
                  active ? "text-black" : "text-white/70 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
