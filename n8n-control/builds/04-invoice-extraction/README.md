# Invoice / Receipt Extraction → Airtable — Portfolio Build #4

Drop an invoice or receipt (PDF or photo) and it's **read by AI, validated, and filed
to a database automatically** — no manual data entry. Built on **n8n + Gemini Vision +
Airtable + Slack**. Demo: **Northwind Home Services** logging supplier invoices.

> **The business problem.** Every business hand-types vendor invoices and receipts into
> a spreadsheet or accounting tool — slow, tedious, and error-prone (a classic
> ~500 finance-hours/year time sink). This reads them automatically and only asks a
> human when the numbers don't add up.

## How it works

```
 Upload a PDF/image (upload.html, or POST to the webhook)
        │  { filename, mimeType, data(base64) }
   Validate Input — file type/size check
        │
   Gemini Vision — reads the document, extracts structured fields:
        │   vendor, invoice #, dates, line items[], subtotal, tax, total, currency, category, confidence
   Map & Validate — THE TRUST GATE:
        │   • do the line items sum to the subtotal?
        │   • does subtotal + tax = total?
        │   • is AI confidence above threshold?
        │   → status = OK  or  Needs Review (+ reasons)
   Create Airtable Record — files it in the Invoices table with the status
        │
   Slack Alert — "✅ Invoice logged" or "⚠️ Needs review: subtotal + tax ≠ total"
        │
   Respond — extracted summary back to the upload page
```

The **trust gate** is the point: this is *money data*, so the bot never silently logs a
wrong number. If the math doesn't add up or it's unsure, the record is marked
**Needs Review** and the team is pinged — a human stays in the loop.

## Production-readiness (Definition of Done — met)

- ✅ **Gemini Vision** reads PDFs *and* images directly (structured `responseSchema` JSON).
- ✅ **Validation / trust gate** — math checks (line items → subtotal → total) + confidence threshold.
- ✅ **Input validation** — file type + size; 422 on bad input.
- ✅ **Database** — Airtable `Invoices` table, every field mapped, `Status` = OK / Needs Review.
- ✅ **Human-in-the-loop** — anything uncertain is flagged, not silently trusted.
- ✅ **Config node** — company, model, base/table IDs, thresholds — reusable per client.
- ✅ **Error handling** — Gemini/Airtable/Slack retry + `onError: continue`; linked error workflow.
- ✅ **Tested end-to-end** (3 real PDFs, incl. a deliberately broken one — see below).

## Tested (live)

| Invoice (PDF) | Result |
|---|---|
| Cascade HVAC Supply — $623, 4 items | ✅ OK · 98% · "HVAC parts" |
| Rose City Plumbing — $928.40, 5 items | ✅ OK · 95% · "Plumbing supplies" |
| Pacific Electrical — **bad total** | ⚠️ Needs Review — caught "subtotal + tax ≠ total" |

All three filed to Airtable with the correct status.

## Files

`validate-input.js` (validate + build Vision request) · `map-validate.js` (parse + trust gate +
Airtable/Slack payloads) · `build.js` (assembles the workflow) · `upload.html` (drag-drop demo page) ·
`samples/` (3 generated sample invoices) · the generator lives in scratchpad.

Live workflow `QTng0Fx0Q4EE1ONu` · webhook `POST /webhook/invoice-northwind`.
Airtable: base `appug80MzHJWdeZNU` (Northwind Ops) → table `Invoices` `tbldFhqjuFOPJsD7G`.

## Demo it

Open `upload.html` in a browser and drop one of the PDFs from `samples/`. You'll see the
extracted fields + status, and a new row appears in your Airtable Invoices table.

## Adapting for a client (swap-in points)

- **Intake:** the same webhook works from an email-attachment trigger or a Google Drive
  watch instead of the upload page.
- **Destination:** swap Airtable for QuickBooks / Xero / a Google Sheet (change the
  "Create Record" node).
- **Fields/categories:** edit the extraction schema + the Airtable table for the client's
  chart of accounts.
- **Attachments:** store the original file on the record (upload to storage → Airtable
  attachment field) — a nice next upgrade.

## The pitch

> "Stop typing invoices. Forward them (or drop them in) and they're read, checked, and
> filed to your books automatically — and anything that doesn't add up gets flagged for
> a human instead of silently going wrong. Typical setup $750–$2,000 + a monthly plan."
