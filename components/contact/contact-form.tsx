"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Loader2, Send } from "lucide-react";
import { services } from "@/content/site";
import { EASE } from "@/lib/motion";

type Status = "idle" | "loading" | "success" | "error";

const inputCls =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-foreground placeholder:text-faint transition-colors focus:border-gold/50 focus:outline-none focus:ring-2 focus:ring-gold/20";

export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setError("");

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Something went wrong.");
      setStatus("success");
      form.reset();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (status === "success") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="glass flex flex-col items-center justify-center gap-4 rounded-2xl p-12 text-center"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gold-glow">
          <Check className="h-7 w-7 text-gold" />
        </span>
        <h3>Message sent.</h3>
        <p className="max-w-sm text-muted">
          Thanks for reaching out — I&apos;ll get back to you within one business day. For anything
          urgent, email me directly.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-2 text-sm text-gold hover:underline"
        >
          Send another message
        </button>
      </motion.div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="glass rounded-2xl p-6 sm:p-8" noValidate>
      {/* honeypot */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      <div className="grid gap-5">
        <div>
          <label htmlFor="name" className="mb-2 block text-sm font-medium text-foreground">
            Name <span className="text-gold">*</span>
          </label>
          <input id="name" name="name" required autoComplete="name" placeholder="Your name" className={inputCls} />
        </div>

        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium text-foreground">
            Email <span className="text-gold">*</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            className={inputCls}
          />
        </div>

        <div>
          <label htmlFor="service" className="mb-2 block text-sm font-medium text-foreground">
            What do you need?
          </label>
          <select id="service" name="service" defaultValue="" className={inputCls}>
            <option value="" disabled>
              Select a service
            </option>
            {services.map((s) => (
              <option key={s.slug} value={s.title}>
                {s.title}
              </option>
            ))}
            <option value="Not sure yet">Not sure yet — let&apos;s talk</option>
          </select>
        </div>

        <div>
          <label htmlFor="message" className="mb-2 block text-sm font-medium text-foreground">
            What&apos;s eating your time? <span className="text-gold">*</span>
          </label>
          <textarea
            id="message"
            name="message"
            required
            rows={5}
            placeholder="Tell me about the repetitive work you'd love to automate…"
            className={`${inputCls} resize-none`}
          />
        </div>

        {status === "error" && (
          <p role="alert" aria-live="polite" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={status === "loading"}
          className="group inline-flex h-13 items-center justify-center gap-2 rounded-full gold-gradient px-8 text-base font-medium text-black transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
        >
          {status === "loading" ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" /> Sending…
            </>
          ) : (
            <>
              Send message
              <Send className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </button>

        <p className="text-center text-xs text-faint">
          Prefer email? Reach me anytime — I reply within one business day.
        </p>
      </div>
    </form>
  );
}
