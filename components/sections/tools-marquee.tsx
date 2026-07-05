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
    <section className="relative overflow-hidden py-8">
      <div className="relative mx-auto max-w-7xl px-4">
        <p className="mb-5 text-center font-mono text-xs uppercase tracking-[0.25em] text-white/50">
          The stack behind the systems
        </p>
        <Marquee items={TOOLS} />
      </div>
    </section>
  );
}
