# FishPin Support Chatbot (RAG) — LIVE client deployment

The build-#1 RAG chatbot engine, deployed for a **real production site**:
[fishpin.app](https://www.fishpin.app) — FishPin, an offline marine navigation app
for Filipino fishermen.

This is the portfolio-grade "real client" version: same engine as
`../01-support-chatbot/`, but with a knowledge base built from FishPin's actual
website content and integrated into the live Next.js site.

## Two parts

### 1. n8n RAG workflow (this folder)
- Workflow: `pjKVS9qnWredkoBv` — "FishPin Support Chatbot (RAG) — Live"
- Webhook: `POST https://n8n.srv1193790.hstgr.cloud/webhook/chat-fishpin`
- Knowledge base: 21 chunks drawn faithfully from the site's source of truth
  (`fishpin-web/lib/site.ts`, `faqs.ts`, `features.ts`, `comparison.ts`).
- Logs + escalates to Slack `#chatbot-automation` (`C0BDSV5RB5G`).
- Same engine: batch-embed (`gemini-embedding-001`) → cosine retrieval → grounded
  answer (`gemini-2.5-flash`). **Answers in English or Filipino/Tagalog** (matched to
  the user's language).
- **Smart, intent-based escalation with a warm hand-off** (not score-based). The bot
  handles its own identity & small talk ("who are you", "hi"), politely redirects
  off-topic questions, and **only escalates genuine support/business matters** it can't
  resolve (billing/refund, can't-download, bugs, wrong GPS, account help,
  partnership/investor/sponsorship). Crucially, on a hand-off it **answers the question
  helpfully first, then connects the user to the team** — it never cold-deflects. The
  model writes the contextual reply and appends a `[[HANDOFF]]` marker that `decide.js`
  strips (keeping the prose) while flagging your Slack. Persona + rules in `retrieve.js`.
- **Warm, reasoning persona.** Talks like a helpful person (kuya/ate), not a robotic
  FAQ — uses the user's name, shows empathy, connects features to the user's situation
  (e.g. recommends SOS/trail for someone fishing alone at night), asks a clarifying
  question when unsure. Persona + style + rules live in `retrieve.js`.
- **Conversation memory with a rolling summary (effectively unlimited).** Keeps the
  last ~24 verbatim turns per visitor AND a running **MEMORY NOTE** that durable facts
  (name, location, boat, concerns) are folded into once the chat gets long — so it
  never forgets who you are even in a very long conversation. Stored in the workflow's
  persistent static data, keyed by `sessionId`, auto-expiring (`memoryTtlMin`).
  Summarization runs **after** the reply is sent (a Gemini call in
  `Memory Maintenance` → `Needs Summary?` → `Summarize Memory` → `Apply Summary`), so
  it never adds user-facing latency. Recent turns also sharpen retrieval. Verified
  isolated per session. For very high traffic, swap static data for Redis/DB — same logic.
  Knobs in the `Config` node: `memoryMaxTurns`, `memorySummarizeAt`, `memoryKeep`,
  `memoryTtlMin`, `chatTemperature`.

## Automated tests

`test.js` runs **9 multi-turn conversations** against the live webhook and asserts on
behaviour (memory recall incl. the rolling summary, pronoun resolution, reasoning,
identity, off-topic redirect, escalation, pricing accuracy, Tagalog). Latest run:
**41/41 checks passed.**

```bash
cd n8n-control/builds/fishpin-chatbot
node test.js                 # exits non-zero if any check fails (CI-friendly)
```

Files: `prepare.js` (KB), `retrieve.js` (retrieval), `decide.js` (answer/escalate),
`build.js` (assembles `fishpin-chatbot.workflow.json`).

### 2. Website integration (in the `fishpin-web` repo — NOT yet deployed)
Three changes were made as **new files + one tiny layout edit**; nothing has been
committed or deployed — review and ship when ready.

| File | What |
|---|---|
| `app/api/chat/route.ts` | **New.** Same-origin proxy → n8n webhook. Hides the n8n URL, validates input, 30s timeout, graceful fallback. |
| `components/chat/ChatWidget.tsx` | **New.** Branded floating chat widget (Persian-blue theme, lucide icons, `cn` helper). Posts to `/api/chat`. |
| `app/(site)/layout.tsx` | **+2 lines.** Imports and mounts `<ChatWidget />`. |

## Tested (all live)
| Question | Result |
|---|---|
| "How much does FishPin cost and is there a subscription?" | ✅ ₱499 once, no subscription |
| "Does it work without internet at sea?" | ✅ Yes, offline-first via GPS chip |
| "Is there an iPhone version?" | ✅ Android-first, iOS planned later |
| "Magkano ang FishPin at paano i-download?" (Tagalog) | ✅ Answered in Tagalog, correct |
| "Can it predict the exact fish I'll catch tomorrow?" | 🤝 Escalated (not a real feature) |
| Full chain via `npm run dev` → `/api/chat` | ✅ Grounded answer returned to the page |

Verified: `npm run typecheck` ✅ · `npx eslint` on new files ✅.

## Preview it locally
```bash
cd fishpin-web
npm run dev
# open http://localhost:3000 — click the chat bubble (bottom-right)
```

## Deploy to production (when you're happy)
1. (Optional but recommended) In Vercel → Project → Settings → Environment Variables,
   add `N8N_CHAT_WEBHOOK_URL = https://n8n.srv1193790.hstgr.cloud/webhook/chat-fishpin`.
   (If you skip it, the route uses that same URL as a built-in default.)
2. Commit the 3 files and push your normal way — Vercel auto-deploys.
3. Make sure the n8n workflow `pjKVS9qnWredkoBv` stays **Active**.

## Keeping the bot accurate
The knowledge base lives in `prepare.js`. When you change site copy in
`fishpin-web/lib/*.ts` (price, features, FAQs), mirror the change in `prepare.js`,
then `node build.js` and `../../n8n.ps1 update pjKVS9qnWredkoBv fishpin-chatbot.workflow.json`.
(Future upgrade: auto-sync the KB from the site content so it never drifts.)
