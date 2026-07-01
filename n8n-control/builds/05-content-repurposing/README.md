# Content Repurposing Engine — Portfolio Build #5

One input → ready-to-post content for **every channel** + a matching image, queued
for human approval. Built on **n8n + Gemini (text + image) + Airtable + Slack**.
Demo: **Northwind Home Services**.

> **The business problem.** You make one thing (a blog post, a video, a topic) and to
> get reach you're supposed to manually rewrite it for LinkedIn, X, Facebook, and
> Instagram — each totally different — plus make a graphic. It's an hour+ of tedious
> work per piece, so it usually doesn't happen. This does it in ~20 seconds, then a
> human approves before anything is published.

## How it works

```
 Input: a topic, pasted text, or a URL (auto-scraped)
        │
   Gemini — one structured call → platform-native drafts in your brand voice:
        │   LinkedIn · X/Twitter · Facebook · Instagram (+ hashtags) + an image prompt
   Gemini image — generates a matching on-brand graphic
        │
   Airtable "Content" board — files the drafts + image as a record (Pending Approval)
        │
   Slack "Send & Wait" — Approve / Reject buttons (the human gate)
        ├─ Approve → record Status = Approved (ready to post)
        └─ Reject  → record Status = Rejected
```

The **approval gate** matters — public posting is irreversible, so nothing is marked
ready until a human reviews the drafts + image in Airtable and approves in Slack.

## Production-readiness (Definition of Done — met)

- ✅ **One input, every channel** — LinkedIn, X, Facebook, Instagram, in-brand, native to each.
- ✅ **URL scraping** — give it an article link and it pulls the text (plain `httpRequest` in a Code node).
- ✅ **AI image** — generates + attaches a graphic to the Airtable record (handles 0-byte image failures gracefully).
- ✅ **Review board** — all drafts + image in an Airtable "Content" table.
- ✅ **Human approval gate** — Slack Approve/Reject; status written back to Airtable.
- ✅ **Config node** — brand voice, models, base/table/field IDs, channel — reusable per client.
- ✅ **Error handling** — Gemini/Airtable/Slack retry + `onError: continue`; linked error workflow.
- ✅ **Tested end-to-end** — generated 4 native drafts + a 536 KB image, filed to Airtable.

## Tested (live)

Input *"5 warning signs your furnace is about to fail this winter"* →
- ✅ LinkedIn (professional hook + value), X (punchy, ~280 + hashtags), Facebook (conversational + question), Instagram (emoji caption) + 15 hashtags
- ✅ AI image generated and attached to the Airtable record
- ✅ Record created as **Pending Approval**; Slack Approve/Reject posted

## Files

`get-source.js` (input → scrape URL → build generation request) · `parse-content.js`
(drafts → Airtable + image request) · `validate-image.js` (image extraction) ·
`build.js` (assembles the workflow) · `trigger.html` (demo page).

Live workflow `drQcyEBifshkPu3o` · webhook `POST /webhook/content-northwind`.
Airtable: base `appug80MzHJWdeZNU` → table `Content` `tblURbYKPLR5CWWHk`.

## Demo it

Open `trigger.html`, paste a topic / blog text / URL, hit **Generate** → see the drafts;
a record appears in Airtable → **Content** with the image, and a Slack approval message
posts. Approve/Reject from Slack to set the status.

## Adapting for a client

- **Auto-publish:** on Approve, post to the platforms' APIs (Facebook is already wired in
  your stack; LinkedIn/X/IG each need that platform's API) or push to a scheduler
  (Buffer / Later / Metricool).
- **Brand voice / platforms:** edit the `Config` node + the generation prompt.
- **Input:** add a YouTube-transcript fetch, or trigger from a "new blog post" RSS/webhook.

## The pitch

> "Give me one idea, blog post, or video and I'll turn it into ready-to-post content for
> every channel — in your voice, with a graphic — for you to approve in one click. Stop
> letting your best content reach one platform. ~$750–$1,500 setup + a content retainer."
