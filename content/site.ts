/* ============================================================================
   Central content layer. Everything copy/data driven so the site scales:
   add a service or case study here and the pages pick it up automatically.
   Later this can be swapped for a CMS / DB with no UI changes.
   ========================================================================== */

export const site = {
  name: "Robert Maestro",
  role: "AI Automation Specialist",
  tagline: "I build AI systems that run the busywork — so you don't have to.",
  email: "robertmaestro09@gmail.com",
  location: "Oriental Mindoro, Philippines",
  availability: "Available for new projects",
  socials: [
    { label: "GitHub", href: "https://github.com/rbrtmstrjr", icon: "github" },
    { label: "LinkedIn", href: "#", icon: "linkedin" },
    { label: "Facebook", href: "#", icon: "facebook" },
    { label: "Instagram", href: "#", icon: "instagram" },
  ],
} as const;

export const nav = [
  { label: "Work", href: "/work" },
  { label: "Services", href: "/#services" },
  { label: "Process", href: "/#process" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
] as const;

/* ---- Proof stats (mono numerals, count-up on view) ---------------------- */
export const stats = [
  { value: 4, suffix: "", label: "Production AI automations shipped" },
  { value: 1, suffix: "", label: "Live client deployment (FishPin)" },
  { value: 119, suffix: "+", label: "Websites designed & built" },
  { value: 8, suffix: " yrs", label: "Building on the web" },
] as const;

/* ---- The "plan" — how working together works (removes risk) ------------- */
export const process = [
  {
    no: "01",
    title: "Audit",
    desc: "We map the repetitive, manual work eating your team's hours — and pinpoint exactly what to automate first for the fastest return.",
  },
  {
    no: "02",
    title: "Build",
    desc: "I design and build the automation end-to-end: validated, error-handled, with a human-in-the-loop wherever money or trust is on the line.",
  },
  {
    no: "03",
    title: "Automate",
    desc: "It goes live and runs 24/7. You get the dashboard, the docs, and the time back. We measure the lift and expand from there.",
  },
] as const;

/* ---- Services (tiered: AI automation leads, 80% of the focus) ----------- */
export type Service = {
  slug: string;
  icon: string;
  title: string;
  tier: "primary" | "secondary";
  tagline: string;
  summary: string;
  outcomes: string[];
  deliverables: string[];
};

export const services: Service[] = [
  {
    slug: "ai-automation",
    icon: "bot",
    title: "AI Automation",
    tier: "primary",
    tagline: "Your business, on autopilot.",
    summary:
      "Custom AI workflows that answer customers, qualify leads, and kill manual data entry.",
    outcomes: [
      "Reply to every lead in seconds, 24/7",
      "Deflect repetitive support tickets",
      "Kill manual data entry",
      "Turn one input into content for every channel",
    ],
    deliverables: [
      "AI support chatbots (RAG over your docs)",
      "Lead capture → enrich → score → CRM pipelines",
      "Document / invoice extraction with a trust gate",
      "Content & video repurposing engines",
      "Custom AI agents wired into Slack, Sheets, Airtable, WhatsApp",
    ],
  },
  {
    slug: "content-creation",
    icon: "pen",
    title: "Content Creation",
    tier: "secondary",
    tagline: "One idea, every channel.",
    summary:
      "On-brand posts, captions, and short-form video, produced fast with an AI pipeline.",
    outcomes: [
      "A steady, consistent posting cadence",
      "One input repurposed into every format",
      "Content that sounds like you, not a robot",
    ],
    deliverables: [
      "Social posts & captions",
      "Short-form video & reels",
      "Content calendars & batching",
      "AI repurposing pipelines",
    ],
  },
  {
    slug: "web-mobile-development",
    icon: "code",
    title: "Web & Mobile Development",
    tier: "secondary",
    tagline: "The product your automation runs on.",
    summary:
      "Fast, modern websites and cross-platform apps built with Next.js, React, and TypeScript.",
    outcomes: [
      "Conversion-focused, lightning-fast sites",
      "Native-feeling apps on iOS and Android",
      "Clean, scalable code with SEO built in",
    ],
    deliverables: [
      "Marketing sites & landing pages",
      "Web apps & dashboards",
      "iOS & Android apps",
      "API & automation integrations",
    ],
  },
  {
    slug: "system-development",
    icon: "server",
    title: "System Development",
    tier: "secondary",
    tagline: "The engine under the hood.",
    summary:
      "Custom backends, APIs, and internal tools that unify your data and automations.",
    outcomes: [
      "A single source of truth for your data",
      "Reliable, scalable infrastructure",
      "Internal tools that fit how you work",
    ],
    deliverables: [
      "REST & webhook APIs",
      "Databases & data pipelines",
      "Admin panels & internal dashboards",
      "Integrations between your tools",
    ],
  },
  {
    slug: "ui-ux-design",
    icon: "layout",
    title: "UI / UX Design",
    tier: "secondary",
    tagline: "Interfaces people actually want to use.",
    summary:
      "Clear, premium interfaces and design systems built to convert, not just follow trends.",
    outcomes: [
      "Higher engagement & conversion",
      "Consistent, reusable design systems",
      "Accessible by default",
    ],
    deliverables: [
      "Web & app UI design",
      "Design systems & component libraries",
      "Wireframes & prototypes",
      "UX audits & redesigns",
    ],
  },
  {
    slug: "graphics-design",
    icon: "palette",
    title: "Graphics Design",
    tier: "secondary",
    tagline: "A brand that looks the part.",
    summary:
      "Logos, brand kits, and creative that keep your brand credible and consistent.",
    outcomes: ["A cohesive visual identity", "Assets ready for any channel", "Fast turnaround"],
    deliverables: [
      "Logos & brand kits",
      "Social media graphics",
      "Marketing & ad creative",
      "Photo editing & retouching",
    ],
  },
];

/* ---- Case studies (the proof). Add one object = one new case study. ----- */
export type CaseStudy = {
  slug: string;
  category:
    | "AI Automation"
    | "Web & Mobile Development"
    | "UI/UX"
    | "Graphic Design";
  featured: boolean;
  title: string;
  client: string;
  status: string;
  oneLiner: string;
  problem: string;
  solution: string;
  roi: string;
  metrics: { label: string; value: string }[];
  stack: string[];
  highlights: string[];
  demo: { type: "video" | "live" | "none"; note: string };
};

export const caseStudies: CaseStudy[] = [
  {
    slug: "ai-support-chatbot",
    category: "AI Automation",
    featured: true,
    title: "AI Support Chatbot (RAG)",
    client: "FishPin (live) · Northwind demo",
    status: "Live in production",
    oneLiner:
      "A 24/7 support agent that answers only from a company's own knowledge base — and warmly hands off to a human when it can't.",
    problem:
      "Small businesses field the same questions over and over — hours, pricing, service area — after hours and on weekends, and lose customers when nobody replies fast enough.",
    solution:
      "A retrieval-augmented chatbot grounded in the client's docs. It never invents prices or policies, remembers the conversation with a rolling memory, and escalates anything out of scope to staff with full context.",
    roi: "Instant 24/7 answers that deflect repetitive tickets and capture after-hours leads.",
    metrics: [
      { label: "Availability", value: "24/7" },
      { label: "Accuracy checks passed", value: "37/37" },
      { label: "Languages", value: "EN + Tagalog" },
    ],
    stack: ["n8n", "Gemini", "RAG / embeddings", "Slack", "Next.js widget"],
    highlights: [
      "Anti-hallucination: answers restricted to retrieved knowledge, with a confidence + escalation gate",
      "Rolling-summary memory remembers names and context across a long chat",
      "Warm human hand-off — answers first, then connects to staff",
      "Deployed live for a real client (FishPin) and embeddable on any site",
    ],
    demo: { type: "live", note: "Live chat demo coming soon" },
  },
  {
    slug: "lead-capture-pipeline",
    category: "AI Automation",
    featured: true,
    title: "Lead Capture → Enrich → CRM",
    client: "Northwind Home Services (demo)",
    status: "Built & tested live",
    oneLiner:
      "Turns a website quote form into an instant, AI-qualified lead engine — validated, scored, logged, and followed up in seconds.",
    problem:
      "Around 60% of leads die from slow follow-up, and ~50% of sales go to whoever responds first. A quote form that just sits in an inbox is lost money.",
    solution:
      "A pipeline that validates the lead, uses AI to enrich and score it Hot/Warm/Cold, logs it to a CRM, emails the customer an instant personalized reply, and pings the team in Slack with a prioritized card.",
    roi: "Every lead gets an instant reply and the team jumps on the hot ones first — no more lost jobs to slow follow-up.",
    metrics: [
      { label: "Response time", value: "Seconds" },
      { label: "Lead scoring", value: "Hot/Warm/Cold" },
      { label: "Spam + dup guard", value: "Built in" },
    ],
    stack: ["n8n", "Gemini", "Google Sheets CRM", "Gmail", "Slack"],
    highlights: [
      "AI enrichment with structured JSON output and a graceful fallback so a lead is never lost",
      "Service-area aware: honest decline for out-of-area instead of a false promise",
      "Idempotent — no duplicate sends on re-run",
      "Wired directly into a live marketing site's quote form",
    ],
    demo: { type: "video", note: "Loom walkthrough coming soon" },
  },
  {
    slug: "invoice-extraction",
    category: "AI Automation",
    featured: true,
    title: "Invoice / Receipt Extraction",
    client: "Northwind Home Services (demo)",
    status: "Built & tested live",
    oneLiner:
      "Drop an invoice or receipt — AI reads it, checks the math, and files it to a database. Anything that doesn't add up gets flagged for a human.",
    problem:
      "Every business hand-types vendor invoices into a spreadsheet or accounting tool — slow, tedious, and error-prone. A classic ~500 finance-hours-a-year time sink.",
    solution:
      "Gemini Vision reads PDFs and photos into structured fields, then a trust gate verifies the math (line items → subtotal → total) and confidence before anything is saved to Airtable.",
    roi: "Eliminates manual invoice entry and never silently logs a wrong number — saving hundreds of finance hours a year.",
    metrics: [
      { label: "Reads", value: "PDF + images" },
      { label: "Trust gate", value: "Math + confidence" },
      { label: "Test pass", value: "11/11" },
    ],
    stack: ["n8n", "Gemini Vision", "Airtable", "Slack"],
    highlights: [
      "Trust gate catches bad math before it reaches the books",
      "Duplicate detection on vendor + invoice number",
      "Human-in-the-loop review for anything uncertain",
      "Tested on real PDFs including a deliberately broken one (correctly flagged)",
    ],
    demo: { type: "video", note: "Loom walkthrough coming soon" },
  },
  {
    slug: "content-reel-engine",
    category: "AI Automation",
    featured: false,
    title: "AI Reel / Video Engine",
    client: "Internal product",
    status: "Built",
    oneLiner:
      "A pipeline that turns a script into a finished vertical video — AI voiceover, images, and auto-synced captions — rendered automatically.",
    problem:
      "Producing short-form video by hand is slow: scripting, voiceover, sourcing images, timing captions, editing. It doesn't scale.",
    solution:
      "An automated render service (ffmpeg + Whisper) that takes scenes and audio and outputs a 9:16 video with Ken Burns motion and word-by-word karaoke captions synced to the voice.",
    roi: "One input becomes a finished, on-brand reel — hours of editing collapsed into an automated render.",
    metrics: [
      { label: "Format", value: "9:16 vertical" },
      { label: "Captions", value: "Auto-synced" },
      { label: "Render", value: "Automated" },
    ],
    stack: ["n8n", "Gemini", "ffmpeg", "faster-whisper", "VPS"],
    highlights: [
      "Word-level caption sync via Whisper timestamps",
      "Cinematic zoompan + optional film-grain look",
      "Self-hosted render service with a permanent output archive",
    ],
    demo: { type: "video", note: "Sample reel coming soon" },
  },
];

export const featuredCaseStudies = caseStudies.filter((c) => c.featured);

export function getCaseStudy(slug: string) {
  return caseStudies.find((c) => c.slug === slug);
}

export function getService(slug: string) {
  return services.find((s) => s.slug === slug);
}

/* ---- Pricing -------------------------------------------------------------- */
export type Plan = {
  name: string;
  price: string;
  priceNote: string;
  tagline: string;
  features: string[];
  cta: string;
  featured?: boolean;
};

export const pricing: Plan[] = [
  {
    name: "Basic Automation",
    price: "$500",
    priceNote: "one-time setup",
    tagline: "One focused automation, built to a production standard.",
    features: [
      "1 automation workflow",
      "Input validation + error handling",
      "Human-in-the-loop where it matters",
      "Tested end-to-end + setup docs",
    ],
    cta: "Book a call",
  },
  {
    name: "Custom Automation",
    price: "$1,000–$4,000",
    priceNote: "scoped by complexity",
    tagline: "Multi-step AI systems tailored to how your business runs.",
    features: [
      "Multiple workflows & integrations",
      "AI chatbot, lead, document or content engines",
      "Wired into your tools (CRM, Sheets, Airtable, Slack, WhatsApp)",
      "Dashboards, testing & revisions",
    ],
    cta: "Book a call",
    featured: true,
  },
  {
    name: "Everything else",
    price: "Let's talk",
    priceNote: "priced after a call",
    tagline: "Web, mobile, UI/UX, graphics — or a bespoke package.",
    features: [
      "Web & mobile development",
      "UI/UX & graphic design",
      "Ongoing maintenance & retainers",
      "Custom scope — quoted together",
    ],
    cta: "Create a custom quote",
  },
];
