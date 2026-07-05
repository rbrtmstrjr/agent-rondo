"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft } from "lucide-react";
import { services, caseStudies } from "@/content/site";
import { cn } from "@/lib/utils";

type Item = { label: string; href: string; kind: string };

const INDEX: Item[] = [
  { label: "Work", href: "/work", kind: "Page" },
  { label: "About", href: "/about", kind: "Page" },
  { label: "Contact", href: "/contact", kind: "Page" },
  ...services.map((s) => ({ label: s.title, href: `/services/${s.slug}`, kind: "Service" })),
  ...caseStudies.map((c) => ({ label: c.title, href: `/work/${c.slug}`, kind: "Case study" })),
];

export function SearchBar({ className }: { className?: string }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return INDEX.filter((i) => i.label.toLowerCase().includes(term)).slice(0, 6);
  }, [q]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(href: string) {
    setOpen(false);
    setQ("");
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active].href);
    }
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <div className="flex items-center gap-2 rounded-full border border-white/70 bg-surface px-4 transition-colors focus-within:border-white">
        <Search className="h-4 w-4 shrink-0 text-white/30" aria-hidden />
        <input
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => q && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search work, services…"
          aria-label="Search the site"
          className="w-full bg-transparent py-2.5 text-sm text-foreground placeholder:text-white/30 focus:outline-none"
        />
      </div>

      {open && results.length > 0 && (
        <div className="glass absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-xl p-1.5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)]">
          {results.map((r, i) => (
            <button
              key={r.href}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => go(r.href)}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                i === active ? "bg-surface-strong" : "hover:bg-surface",
              )}
            >
              <span className="text-sm text-foreground">{r.label}</span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-widest text-faint">
                  {r.kind}
                </span>
                {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-gold" />}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
