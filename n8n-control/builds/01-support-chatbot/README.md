# AI Customer-Support Chatbot (RAG) — Portfolio Build #1

A 24/7 AI support assistant that answers customer questions **only** from a
business's own knowledge base (FAQ, policies, services), and **hands off to a
human** when it can't — so it never makes up prices, policies, or hours.

Built end-to-end on self-hosted **n8n + Google Gemini + Slack**. Demoed here for a
fictional home-services company, **Northwind Home Services** (HVAC / plumbing /
electrical, Portland OR).

> **The business problem.** Small businesses get the same questions over and over
> ("what are your hours?", "do you service my area?", "how much is a callout?"),
> after hours and on weekends, and lose leads when nobody replies fast enough.
> This bot answers instantly, 24/7, accurately — and routes the rest to staff.

---

## What it does

- Answers customer questions grounded in the company's knowledge base (RAG).
- **Never hallucinates** — answers are restricted to the retrieved KB facts.
- **Warm, reasoning persona** — talks like a friendly, professional rep (not a robotic
  FAQ): uses the customer's name, shows empathy for urgent problems (no heat, burst
  pipe), and connects services to their situation.
- **Conversation memory with a rolling summary** — remembers names, where the customer
  lives, and what they asked, even across a long chat (durable facts are folded into a
  running MEMORY NOTE once the chat grows). Per-session, auto-expiring, isolated.
- **Warm human hand-off** — for billing/refunds, booking a specific time, complaints,
  warranty claims, or anything it can't resolve, it **answers helpfully first, then
  connects the customer to staff** (via a `[[HANDOFF]]` marker stripped before display),
  and alerts the team in Slack. Never a cold deflection.
- **Logs every conversation** to Slack for review/QA.
- Drops into any **website** via a small embeddable chat widget (`widget.html`, which
  renders Markdown safely); the same webhook works for WhatsApp / Messenger / Telegram.

## Automated tests

`test.js` runs **8 multi-turn conversations** against the live webhook and asserts on
behaviour (memory recall incl. rolling summary, pronoun resolution, urgent-situation
reasoning, identity, off-topic redirect, contextual hand-off, fee accuracy). Latest
run: **37/37 checks passed.**

```bash
cd n8n-control/builds/01-support-chatbot
node test.js                 # exits non-zero if any check fails (CI-friendly)
```

This is the same v2 engine as the live FishPin deployment (`builds/fishpin-chatbot/`).
Config knobs live in the `Config` node: `chatTemperature`, `memoryMaxTurns`,
`memorySummarizeAt`, `memoryKeep`, `memoryTtlMin`, `topK`.

## How it works (architecture)

```
 Website widget ──HTTP POST──▶  Chat Webhook (n8n)
                                     │
                                  Config  (company name, models, thresholds)
                                     │
                                  Prepare (Code) ── builds KB + one batch-embed request
                                     │
                                  Batch Embed (Gemini gemini-embedding-001)
                                     │            ← embeds all KB chunks + the question in ONE call
                                  Retrieve (Code) ── cosine similarity → top-K chunks → grounded prompt
                                     │
                                  Gemini Chat (gemini-2.5-flash) ── answers ONLY from retrieved context
                                     │
                                  Decide (Code) ── answer? or escalate? (model said ESCALATE / weak match)
                                     │
                                  Log to Slack ──▶  Escalate? ──true──▶ Notify Support (Slack)
                                     │                   │false                 │
                                     └─────────────▶ Respond to Widget ◀────────┘
```

- **Retrieval-augmented generation (RAG):** the question and every KB chunk are
  embedded; the most similar chunks are retrieved and given to the LLM as the only
  allowed source. This is what keeps answers accurate and on-brand.
- **One embedding call:** `batchEmbedContents` embeds the whole KB + question in a
  single request — fast and cheap.

## Production-readiness (Definition of Done — all met)

- ✅ **No hallucination:** answers restricted to retrieved context; `ESCALATE` token +
  similarity threshold (`minScore`) trigger human handoff.
- ✅ **Error handling:** Gemini calls retry 3× and never crash the chat; a top-level
  try/catch returns a graceful "please call us" instead of an error.
- ✅ **Human-in-the-loop:** Slack escalation for anything out of scope.
- ✅ **Logging:** every conversation posted to Slack for QA.
- ✅ **Config node:** company name, phone, models, `topK`, `minScore`, channels all in
  one place — reused per client by editing one node.
- ✅ **Linked error workflow:** `[Ops] Error Handler → Slack`.
- ✅ **CORS enabled** on the webhook so the widget works from any site.
- ✅ **Tested end-to-end** (see test matrix below).

## Tested behaviour

| Question | Result |
|---|---|
| "How much is the diagnostic fee and is it ever waived?" | ✅ Accurate ($89, waived for Care Club) |
| "Do you service Beaverton and what are your hours?" | ✅ Accurate (yes; Mon–Sat 7–7, 24/7 emergency) |
| "What's in the Care Club and how much?" | ✅ Accurate ($19/mo, perks listed) |
| "Can I pay with Amex? Any financing?" | ✅ Accurate (yes; 0% APR option) |
| "My pipe burst at 2am — emergencies + extra fee?" | ✅ Reasoned ($75 after-hours fee, waived for members) |
| "Do you install swimming pools?" | 🤝 Escalated to human (not in KB) |
| "What's the CEO's home address?" | 🤝 Escalated to human (not in KB) |

## Files

| File | Purpose |
|---|---|
| `support-chatbot.workflow.json` | The deployable n8n workflow (generated). |
| `build.js` | Assembles the workflow JSON from the parts below. |
| `prepare.js` | Code node: KB + batch-embed request builder. |
| `retrieve.js` | Code node: cosine retrieval + grounded prompt builder. |
| `decide.js` | Code node: answer-vs-escalate decision. |
| `knowledge-base.md` | Human-readable copy of the demo KB (source of truth lives in `prepare.js`). |
| `widget.html` | Embeddable demo chat widget — open in a browser to try it live. |

## Run / deploy

```bash
# 1. Build the workflow JSON from the parts
node build.js

# 2. Push to n8n (create new, or update existing)
../../n8n.ps1 create support-chatbot.workflow.json
../../n8n.ps1 update <workflowId> support-chatbot.workflow.json

# 3. Activate it (webhook goes live), then open widget.html to chat.
```

Live workflow: `BIuxpp8CAEnCpp6c` · webhook `POST /webhook/chat-northwind`.

## Adapting for a real client (the swap-in points)

1. **Knowledge base:** replace the `KB` array in `prepare.js` with the client's FAQ /
   policies. For a large KB, swap the inline array + batch-embed for a real vector DB
   (Qdrant / Supabase pgvector / Pinecone) ingested once — the retrieval logic in
   `retrieve.js` is unchanged.
2. **Channel:** point WhatsApp / Messenger / Telegram at the same webhook, or embed
   `widget.html` on their site.
3. **Branding & escalation:** edit the `Config` node (company name, phone, Slack
   channels). Route escalations to their support inbox / CRM instead of Slack if
   preferred.
4. **Model:** `gemini-2.5-flash` (fast, cheap) is the default; swap to a stronger model
   in `Config` for complex domains.

## The pitch (for a proposal)

> "I'll build you a 24/7 AI support agent trained on *your* FAQ and policies. It
> answers customers instantly on your website (and WhatsApp), never invents an
> answer, and automatically hands anything it's unsure about to your team — so you
> capture after-hours leads and cut repetitive questions. Typical setup: $500–$2,000,
> with an optional monthly plan to keep the knowledge base current."
