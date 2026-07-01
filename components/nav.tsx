"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "./logo";
import { SearchBar } from "./search-bar";
import { cn } from "@/lib/utils";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4">
      <nav
        className={cn(
          "mx-auto flex max-w-7xl items-center gap-4 rounded-full px-4 py-3 transition-all duration-500",
          scrolled
            ? "border border-white/10 bg-white/[0.07] shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-2xl"
            : "border border-transparent bg-transparent",
        )}
      >
        <Logo className="shrink-0" />

        {/* Center search — hidden on small screens */}
        <SearchBar className="mx-auto hidden w-full max-w-md md:block" />

        <Link
          href="/contact"
          className="group ml-auto inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full gold-gradient px-5 text-sm font-medium text-black transition-all hover:brightness-110 active:scale-95"
        >
          Book a call
          <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </nav>
    </header>
  );
}
