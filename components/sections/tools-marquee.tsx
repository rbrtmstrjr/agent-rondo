import { Marquee } from "@/components/visual/marquee";

const TOOLS = [
  "n8n",
  "Google Gemini",
  "Next.js",
  "Airtable",
  "Slack",
  "WhatsApp API",
  "Google Sheets",
  "Gmail",
  "RAG / Embeddings",
  "Gemini Vision",
  "Webhooks",
  "TypeScript",
];

export function ToolsMarquee() {
  return (
    <section className="relative overflow-hidden border-y border-gold/15 py-8">
      {/* gold gradient background wash */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(180deg, rgba(245,194,75,0.14), rgba(3,0,28,0) 78%)" }}
        />
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(70% 140% at 50% -20%, var(--color-gold-glow), transparent 70%)" }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-4">
        <p className="mb-5 text-center font-mono text-xs uppercase tracking-[0.25em] text-gold/80">
          The stack behind the systems
        </p>
        <Marquee items={TOOLS} />
      </div>
    </section>
  );
}
