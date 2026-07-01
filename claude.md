# AI Automation Portfolio — Build Roadmap

**Goal:** Build a portfolio of production-ready AI automations (the kind clients actually hire for on Upwork & OnlineJobs.ph), then launch as an AI Automation freelancer. Build them ONE BY ONE. After all are done → assemble portfolio (Loom demo + README per build) → start freelancing.

**Stack (free-first):** self-hosted n8n on Hostinger VPS + Gemini + Slack + Google Sheets + VPS render service. Paid swaps documented where a real client would plug one in.

**Owner:** Robert · 8 months AI-automation experience · going all-in on freelancing.

---

## Production-Ready Definition of Done (EVERY automation must meet this)

Not a test/demo — each build must be client-deliverable:

- [ ] **Error handling** — `onError` on every external call; retries (3x) on network nodes; linked to the `[Ops] Error Handler -> Slack` workflow (`660Xkpo164VSNTDZ`).
- [ ] **Input validation** — guard against bad/empty/malformed inputs; fail with a clear message, never a silent crash.
- [ ] **Idempotency / dedup** — no duplicate sends/posts/rows on re-run (use Sheet/static-data dedup where relevant).
- [ ] **Credentials** — use n8n credential store (never hardcoded keys); note token expiry where applicable.
- [ ] **Human-in-the-loop gate** where money/public-posting/irreversible actions happen (Slack approve/reject).
- [ ] **Config node** at the top — all tunables (IDs, prompts, thresholds) in one place so it's reusable per client.
- [ ] **Logging/notification** — success + failure visibility in Slack.
- [ ] **README** — business problem, what it does, setup steps, the swap-in points, and a 1-line ROI pitch.
- [ ] **Demo data** — a realistic sample business/dataset so it looks like a real client deliverable.
- [ ] **Tested end-to-end** — proven on a real run, not just wired.

---

## Build Order & Checklist

### Phase 1 — Core Portfolio (build these 6 first; covers all 4 top-demand buckets)

- [x] **1. AI Support Chatbot (RAG)** — *flagship, #1 most-requested* ✅ DONE
  Answers from a company's FAQ/docs/PDFs on website widget / WhatsApp / Messenger. Vector store over docs → retrieval → Gemini answer → escalate to human on low confidence.
  *Problem:* 24/7 instant answers, deflects repetitive tickets.
  Built: workflow `BIuxpp8CAEnCpp6c`, webhook `POST /webhook/chat-northwind`, demo = "Northwind Home Services". Files in `n8n-control/builds/01-support-chatbot/`. Embeds via Gemini `gemini-embedding-001` (batch), chat via `gemini-2.5-flash`. **Upgraded to v2 engine** (warm reasoning persona + rolling-summary memory + contextual warm hand-off + Markdown-rendering widget). Unit tests: `node test.js` → 37/37 across 8 conversations.

- [x] **2. Lead Capture → Enrich → CRM/Sheet → Instant Follow-up** — *highest-$ category* ✅ DONE
  Webhook/form → validate → AI enrich & score → Google Sheet/CRM → instant personalized email/Slack alert.
  *Problem:* ~60% of leads lost to slow follow-up.
  Built: workflow `d0N1ppVG1xrq99gO`, webhook `POST /webhook/lead-northwind`, demo = Northwind. Files in `n8n-control/builds/02-lead-capture/`. AI enrich+score via `gemini-2.5-flash` (structured JSON), Google Sheet CRM (auto-provisioned tab+headers), Slack hot/warm/cold alert, AI-drafted homeowner email. Tested live (Hot 95 / Warm 60 / Cold-out-of-area / 422 invalid). Wired to the Northwind website quote form (`/api/lead`). Gmail SMTP send LIVE (from robertmaestro09@gmail.com, confirmed sending). Leads write to a DEDICATED "Northwind Leads" Google Sheet (id `1tz1m4g5tvTxBunlVjD_GEIfPF_Ghxs5WC0ihMn_qWS0`, user-owned, shared to SA), "Leads" tab auto-created with headers.

- [~] **3. AI Email Triage + Draft Replies (Gmail)** — *universal pain point / retainer work* — ⏸️ DEFERRED
  Gmail trigger → classify & summarize → draft reply in owner's tone → label/route → Slack digest.
  *Problem:* inbox overload; never miss/forget an email.
  Decision (2026-06-30): built as a proof, then descoped & removed. For the Northwind lead use-case the owner handles lead replies manually (the instant auto-acknowledgment already covers speed-to-lead, and a human is better for the booking/quote conversation). Can revisit later as a standalone email-triage portfolio piece (IMAP-read worked via the Gmail app password; needs an external test email to validate the trigger).

- [x] **4. Document/Invoice/Receipt Extraction → Airtable** — *high-value "boring" ops work* ✅ DONE
  PDF/image in → Gemini Vision extracts structured fields → validate (math/confidence trust gate) → Airtable → flag low-confidence.
  *Problem:* saves ~500 finance hrs/yr; kills manual data entry.
  Built: workflow `QTng0Fx0Q4EE1ONu`, webhook `POST /webhook/invoice-northwind`, demo = Northwind supplier invoices. Files in `n8n-control/builds/04-invoice-extraction/`. Gemini Vision (`gemini-2.5-flash`, structured JSON) reads PDFs/images → math+confidence trust gate (OK / Needs Review) → **Airtable** (base `appug80MzHJWdeZNU` "Northwind Ops" → table `Invoices`) + Slack. Upload page `upload.html`. Tested live with 3 generated PDFs (2 OK + 1 deliberate-error correctly flagged "subtotal+tax≠total"). NEW TOOL: Airtable (n8n cred `sSLblszJWxpUr8fl`). v2 ADDED: **dedup** (Airtable filterByFormula lookup on Vendor+Invoice# → reject duplicates) + **unit test harness** `test.js` (11/11 pass: clean→logged, same→Duplicate, math-mismatch→Needs Review, junk→422). PENDING (phase 2, user wants): switch channel to **WhatsApp** (image in via WhatsApp trigger + reply with status), replacing Slack — needs WhatsApp Business API credentials.

- [x] **5. Content Repurposing Engine** — *agency/creator favorite* ✅ DONE
  One input (blog/YouTube transcript) → LinkedIn + X + FB + IG captions + image → approval → schedule/post.
  *Problem:* one input → every channel; saves hours.
  Built: workflow `drQcyEBifshkPu3o`, webhook `POST /webhook/content-northwind`, demo = Northwind. Files in `n8n-control/builds/05-content-repurposing/`. Flexible input (text/URL-scrape/topic) → Gemini (`gemini-2.5-flash`) 4 platform drafts + hashtags → Gemini image (`gemini-3.1-flash-image`) → **Airtable "Content" board** (`tblURbYKPLR5CWWHk`, image attached via uploadAttachment) → **Slack Send & Wait approval** → status Approved/Rejected. Trigger page `trigger.html`. Tested live (furnace topic → 4 native drafts + 536KB image + record). Approval click is manual.

- [ ] **6. Meeting/Call Notes → Action Items → CRM/Tasks** — *easy, impressive, common*
  Transcript in → Gemini summary + decisions + action items → push to tasks/CRM + email recap.
  *Problem:* no manual notes; nothing falls through.

### Phase 2 — Breadth Expanders (build after Phase 1)

- [ ] **7. Cold Outreach Personalizer** — scrape/list → AI writes custom email/DM per lead → send/queue.
- [ ] **8. CRM Data Entry & Sync** — form/email → CRM/Sheets, dedup, enrichment.
- [ ] **9. Helpdesk Ticket Triage + Auto-Draft** — categorize, prioritize, suggest reply, escalate.
- [ ] **10. Social Media Auto-Poster / Scheduler** — AI captions + scheduled multi-platform posting.
- [ ] **11. SEO Content Pipeline** — brief → research → draft → human review → publish WordPress.
- [ ] **12. Automated Reporting Digest** — pull data → AI summary → Slack/email KPI digest.
- [ ] **13. Appointment Booking + Reminders** — booking → confirmations → reminder sequence (cut no-shows).
- [ ] **14. Client Onboarding Autopilot** — contract → intake form → file collection → welcome sequence.
- [ ] **15. Internal Knowledge-Base Q&A Bot** — Slack bot, RAG over company docs.
- [ ] **16. Resume Screening + Scoring** — applications → AI evaluate → ranked sheet.
- [ ] **17. Review / Reputation Management** — request reviews, alert on negative ones.

### Phase 3 — Paid-API Showcases (require client-side budget; build/document later)

- [ ] **18. Missed-Call → Auto SMS Text-Back** (Twilio) — local-services lead saver.
- [ ] **19. AI Voice Agent** (VAPI/Retell) — inbound/outbound call qualification & booking.
- [ ] **20. AI Reels/Video Generation** — *ALREADY BUILT* (`QRTDCJmM6JBFv9h0`) — repackage as portfolio piece.

---

## Already Built (repackage as portfolio samples)

- `QRTDCJmM6JBFv9h0` Educational Reel pipeline (script → voice → images → VPS render) — = #20.
- `sv91rOvu8Bec8sLc` FB Multi-Image Auto Post (Gemini + approval gate) — content/social sample.
- `p67MKEN01puV0M16` Job Feed → Slack (multi-source scrape + AI scoring) — = lead-gen/aggregator sample.
- `KMD9inXz4SK3PkRo` Messenger Auto-Reply (Gemini) — partial chatbot sample (#5 overlaps).
- `660Xkpo164VSNTDZ` [Ops] Error Handler → Slack — reusable error workflow for ALL builds.

---

## Workflow / Progress Log

(Update as we complete each. Format: `#N Name — id — status — notes`)

- #1 AI Support Chatbot (RAG) — `BIuxpp8CAEnCpp6c` — ✅ DONE & tested live (Northwind demo). Folder: `builds/01-support-chatbot/`.
- #1b FishPin Support Chatbot (RAG) — `pjKVS9qnWredkoBv` — ✅ DONE & tested live. REAL client deployment of #1 for fishpin.app. Webhook `/webhook/chat-fishpin`. KB from fishpin-web/lib content. Answers EN + Tagalog. Website integration (Next.js proxy `/api/chat` + `ChatWidget`) added to `fishpin-web` repo, typecheck+lint pass, NOT yet deployed (user reviews+ships). Folder: `builds/fishpin-chatbot/`.
- #2 Lead Capture → Enrich → CRM/Sheet → Instant Follow-up — `d0N1ppVG1xrq99gO` — ✅ DONE & tested live (Northwind). Webhook `/webhook/lead-northwind`. Folder: `builds/02-lead-capture/`. Wired to Northwind website quote form. Pending user: Gmail SMTP cred + dedicated leads Sheet.
- ALSO BUILT: Northwind marketing **website** (`../northwind-home-services`, Next.js, premium dark) — front-end for #1 chatbot + #2 lead form. See memory [[northwind-website]].
- #3 AI Email Triage + Draft Replies — ⏸️ DEFERRED 2026-06-30 (built+removed; user keeps lead replies manual/owner-handled). 
- #4 Document/Invoice Extraction → Airtable — `QTng0Fx0Q4EE1ONu` — ✅ DONE & tested live. Webhook `/webhook/invoice-northwind`. Folder: `builds/04-invoice-extraction/`. Gemini Vision → trust gate → Airtable (Northwind Ops base). First Airtable build.
- #5 Content Repurposing → Airtable + Approve — `drQcyEBifshkPu3o` — ✅ DONE & tested live. Webhook `/webhook/content-northwind`. Folder: `builds/05-content-repurposing/`. Gemini text+image → Airtable Content board → Slack approval gate.
- PHASE-1 CORE COMPLETE (#1,#2,#4,#5 done; #3 deferred; #6 optional). All 4 demand buckets covered: Support, Lead Gen, Ops, Content.
- _next: user's choice — #6 Meeting Notes, WhatsApp phase-2 for #4, or SHIP (Vercel deploy site + Loom demos + portfolio writeups → start freelancing)._

---

## Reference

- Control via `n8n-control/n8n.ps1` (`list` | `get <id>` | `create <file>` | `update <id> <file>`). Defs saved in `n8n-control/new/`, exports in `n8n-control/export/`.
- Research backing this list: Upwork In-Demand Skills 2026 (AI skills +109% YoY), AI-agency niche reports, live OLJ n8n/Make/Zapier postings ($750–$1,400/mo). Pricing signal: $500–$2,000 setup + $500–$5,000/mo retainers.
</content>
</invoke>
