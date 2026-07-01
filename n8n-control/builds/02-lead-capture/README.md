# Lead Capture → Enrich → Sheet + Instant Follow-up — Portfolio Build #2

Turns a website "Get a Quote" form into an instant, AI-qualified lead engine: it
validates the lead, uses AI to **enrich + score** it (Hot/Warm/Cold), logs it to a
**Google Sheet CRM**, emails the homeowner an **instant personalized acknowledgment**,
and pings the team in **Slack** with a prioritized hot-lead card — all in seconds.

Demo client: **Northwind Home Services** (same brand as the chatbot + website). The
website's quote form already posts here.

> **The business problem.** ~50% of sales go to whoever responds *first*, and ~60% of
> leads die from slow follow-up. This replies instantly, qualifies automatically, and
> makes sure the team jumps on the hot ones.

## Flow

```
Website quote form ──▶ Lead Webhook (POST /webhook/lead-northwind)
                          │
                       Config (company, models, sheet, channel, thresholds)
                          │
                       Validate & Prepare ── required fields · email format ·
                          │                   spam honeypot · dedup (idempotent)
                       Valid? ──no──▶ Respond 422
                          │yes
                       New? ──no(spam/dup)──▶ Respond 200 (silently accepted)
                          │yes
                       AI Enrich + Score (Gemini, structured JSON) ──┐
                          │  summary · serviceType · urgency · inArea │
                          │  valueBand · leadScore · Hot/Warm/Cold    │
                       Parse AI                                       │
                          │                                           │
                       Ensure Sheet Tab → Set Headers → Append Lead (Google Sheet CRM)
                          │
                       Email Homeowner (Gmail/SMTP — instant personalized acknowledgment)
                          │
                       Slack Alert (🔥/🌤️/❄️ prioritized card + suggested next step)
                          │
                       Respond 200 { ok: true }
```

## Production-readiness (Definition of Done — met)

- ✅ **Input validation** — name + a contact method required; email format checked; 422 on bad input.
- ✅ **Spam honeypot** — hidden `company` field; bots are silently dropped.
- ✅ **Idempotency / dedup** — identical re-submits within `dedupMinutes` are ignored (static-data window).
- ✅ **AI enrich + score** — Gemini with a structured `responseSchema` (reliable JSON), graceful fallback if AI fails so a lead is never lost.
- ✅ **CRM storage** — Google Sheet, tab + header row auto-provisioned.
- ✅ **Instant follow-up** — AI-drafted email to the lead + prioritized Slack alert to the team.
- ✅ **Service-area aware** — in-area leads get a "specialist will follow up" reply; **out-of-area leads get an honest, polite decline** (no false promise), and Slack marks them "no dispatch needed".
- ✅ **Config node** — company, phone, models, sheet id/tab, service areas, hot threshold, channel — reusable per client.
- ✅ **Error handling** — Gemini/Sheet/Slack/Email nodes retry + `onError: continue`; linked to `[Ops] Error Handler → Slack`.

## Tested (live)

| Lead | Result |
|---|---|
| "Water heater burst, water in garage, ASAP!" (Beaverton) | 🔥 Hot · 95 · Plumbing/Emergency · in-area |
| "Quote to replace my 18-yr furnace" (Tigard) | 🌤️ Warm · 60 · HVAC/Planning · in-area |
| "Do you work in Seattle? outlet broken" | ❄️ Cold · 5 · Electrical · **out-of-area flagged** |
| Empty name + bad email | ⛔ 422 rejected |

Sheet rows written, Slack alerts posted, emails drafted (sending pending the Gmail credential).

## Files

`validate.js` (validate + dedup + builds AI request) · `parse-ai.js` (parse + build row/email/alert) ·
`build.js` (assembles `lead-capture.workflow.json`).

Live workflow `d0N1ppVG1xrq99gO` · webhook `POST /webhook/lead-northwind`.

## Two setup steps for production

1. **Connect Gmail (to actually send the email).** Easiest: a Gmail **App Password**.
   - In the Google account: enable 2-Step Verification → create an **App Password**.
   - In n8n: create an **SMTP** credential (host `smtp.gmail.com`, port `465`, SSL on,
     user = your Gmail, password = the app password), then open the **Email Homeowner**
     node and select it. Set `Config.fromEmail` to that Gmail address.
   - (Alternative: the n8n **Gmail** OAuth2 node if you prefer OAuth.)
2. **Dedicated leads Sheet (recommended).** The service account can't create files, so
   create a Google Sheet "Northwind Leads", share it (Editor) with
   `n8n-sheets@gen-lang-client-0754500282.iam.gserviceaccount.com`, and put its ID in
   `Config.sheetId`. (For testing it writes to a `Leads` tab in the existing shared sheet.)

## Wire the website

Set `N8N_LEAD_WEBHOOK_URL=https://n8n.srv1193790.hstgr.cloud/webhook/lead-northwind`
in the `northwind-home-services` env (local `.env.local` or Vercel). The quote form then
flows straight into this pipeline.

## The pitch

> "Your quote form becomes a 24/7 sales rep: every lead gets an instant, personalized
> reply, is automatically scored and logged to your CRM, and your team gets pinged the
> moment a hot one comes in — so you stop losing jobs to slow follow-up. ~$1,000 setup,
> with an optional monthly plan."
