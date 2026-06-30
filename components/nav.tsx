"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { nav, site } from "@/content/site";
import { Logo } from "./logo";
import { cn } from "@/lib/utils";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4">
      <nav
        className={cn(
          "mx-auto flex max-w-6xl items-center justify-between rounded-2xl px-4 py-3 transition-all duration-500",
          scrolled
            ? "glass shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)]"
            : "border border-transparent bg-transparent",
        )}
      >
        <Logo />

        <div className="hidden items-center gap-1 md:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-4 py-2 text-sm text-muted transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:block">
          <Link
            href="/contact"
            className="group inline-flex h-10 items-center gap-1.5 rounded-full bg-gold px-5 text-sm font-medium text-black transition-all hover:bg-gold-bright active:scale-95"
          >
            Book a call
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-foreground md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="fixed inset-0 top-0 z-40 mt-20 px-4 md:hidden">
          <div className="glass animate-[fadeIn_.2s_ease] rounded-2xl p-4">
            <div className="flex flex-col">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-4 py-3 text-base text-foreground transition-colors hover:bg-surface-strong"
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href="/contact"
                onClick={() => setOpen(false)}
                className="mt-2 inline-flex h-12 items-center justify-center gap-1.5 rounded-xl bg-gold text-base font-medium text-black"
              >
                Book a call <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
            <p className="mt-4 px-4 font-mono text-xs text-faint">{site.email}</p>
          </div>
        </div>
      )}
    </header>
  );
}
