# FishPin Facebook Ad Engine — Design Spec

**Date:** 2026-09-10
**Owner:** Robert
**Build slot:** `n8n-control/builds/06-fishpin-fb-ads/`
**Status:** approved, ready for implementation plan

---

## 1. Goal

A scheduled n8n pipeline that generates organic Facebook Page creatives for **FishPin**
(a paid, offline-first marine navigation Android app for Filipino fishermen), routes each
one through a Slack approval loop, publishes approved posts to the FishPin Page, and
backfills engagement metrics 24 hours later.

Purpose: grow Page followers and drive Play Store installs.

### Non-goals

- No Marketing API, no paid ad campaigns. Organic Page posts only.
- No video. Static image creatives only; a video-ad pipeline is a separate future workflow.
- No separate text-overlay/compositing step. The headline is rendered by the image model
  as part of the image (owner decision, 2026-09-10).

---

## 2. Alignment decisions

The source prompt (`fishpin-n8n-ad-workflow-prompt.md`) specified several tools that
conflict with established conventions in this repo. Per the owner's instruction, repo
convention wins. Resolutions:

| Source prompt | Repo convention | Decision |
|---|---|---|
| LLM = OpenAI or Anthropic | Gemini everywhere, with `generationConfig.responseSchema` | **Gemini `gemini-2.5-flash` + responseSchema.** Structurally valid JSON is guaranteed, so the prompt's fence-stripping and JSON-repair retry are unnecessary. |
| Imagen via `:predict`, `personGeneration` | `gemini-*-flash-image` via `generateContent` (proven in `sv91rOvu8Bec8sLc`) | **Gemini image model.** No `personGeneration` region gate, no retired-model-ID risk, already proven publishing to a Facebook Page. |
| Supabase Storage archive | No Supabase anywhere in the repo | **Facebook unpublished-photo upload.** `POST /{page}/photos?published=false` returns a `media_fbid`; `GET /{id}?fields=images` returns a public CDN URL. One upload serves as archive, Slack preview, and publish token. |
| Google Sheets queue | Both Sheets (build #2) and Airtable (#4, #5) exist | **Google Sheets.** The prompt's column list is Sheets-shaped, build #2's Sheets pattern is proven, the service account already has access, and no attachment storage is needed because the archive is a FB CDN URL. Airtable would require re-scoping its PAT to a new base for a different venture. |
| Four approval buttons + free text | Slack `sendAndWait` `approvalType: double` gives two buttons only | **`sendAndWait` with `responseType: customForm`** — a decision dropdown (Approve / Regenerate copy / Regenerate image / Regenerate both) plus a reason textarea. One node, all four outcomes, plus the typed reason. |
| Deterministic SVG/HTML text overlay | No precedent | **Dropped.** Headline text goes into the image prompt. Garbled Tagalog is caught by the human approval gate and fixed via "Regenerate image". |
| `Continue on Fail = false` on FB/image nodes | `onError: continueRegularOutput` + explicit Code gate | **Continue on fail, then route to an explicit failure branch** that alerts Slack, marks the row `failed`, and terminates before publish. Same guarantee ("never a half-finished post"), repo mechanism. |
| Insights via a 24h `Wait` node | — | **Separate hourly scanner workflow.** A 24h `Wait` does not reliably survive an n8n restart; a scanner does. |
| Publish via `POST /{page}/photos` with the binary | sv91's two-step upload-then-publish | **Two-step.** Reuse the `media_fbid` already uploaded for the preview via `POST /{page}/feed` with `attached_media`. Avoids uploading the same image twice. |

---

## 3. Architecture

Two workflows, both with `settings.errorWorkflow = 660Xkpo164VSNTDZ`.

### A. `FishPin Ad Creative -> FB (Approve)`

```
Schedule Trigger (05:30 / 18:30, Mon Wed Fri, Asia/Manila)  |
Manual Trigger                                              |--> Config --> Load Queue Row
Webhook  POST /webhook/fishpin-ad   (loop re-entry)         |                    |
                                                Queue empty? --yes--> Slack ops, stop
                                                            | no
        Claim Row            status = in_review  (prevents double pickup)
                             |
        Build Copy Prompt   (brand bible + revision_note)
                             |
        Generate Copy        Gemini 2.5-flash + responseSchema   [retry 3, continue]
                             |
        Validate Copy        em dash / banned words / compliance / fields / length
                             |
        Copy OK? --no--> Copy Retry Guard --> re-invoke once, else needs_manual + Slack
             | yes
        Build Image Prompt   scene + EXACT headline + style suffix + negatives
                             |
        Generate Image       gemini-2.5-flash-image             [retry 2, continue]
                             |
        Validate Image  --fail--> Slack fail + status=failed, STOP
             |
        Upload Photo (published=false)  --> media_fbid
        Get Photo URL (?fields=images)  --> public CDN url
             |
        Log Attempt  (Sheets -> Attempts tab)
             |
        Slack Review  sendAndWait / customForm, 6h timeout
             |
        Route Decision
             |-- approve --> Publish Post (/feed + attached_media + message)
             |                   --> Write Back (Queue row) --> Slack success
             |-- timeout --> status=expired + Slack, no post
             \-- regen   --> Loop Guard --> re-invoke webhook (attempt+1) or needs_manual
```

### B. `FishPin Ad Insights (24h)`

```
Schedule Trigger (hourly)
   --> Config
   --> Read Queue (all rows)
   --> Select Due (Code): status = posted AND reach empty AND posted_at older than 24h
   --> Any due? --no--> stop silently
        | yes
   --> Split Out (one item per post)
   --> Get Insights   GET /{post_id}/insights?metric=post_impressions,post_engaged_users,post_reactions_by_type_total
   --> Get Engagement GET /{post_id}?fields=comments.summary(true),shares,reactions.summary(true)
   --> Map Metrics (Code)
   --> Update Row (reach, likes, comments, shares, status=measured)
   --> Slack digest (one summary message per run, only if rows were updated)
```

Two Graph calls are required: the `insights` edge does not return comment and share
counts, and the object-fields edge does not return impressions.

---

## 4. Data model — Google Sheet `FishPin Ad Queue`

Owner creates the Sheet and shares it (Editor) with
`n8n-sheets@gen-lang-client-0754500282.iam.gserviceaccount.com`. Sheet ID goes in `Config.sheetId`.

### Tab `Queue`

| Column | Written by | Notes |
|---|---|---|
| `id` | human | stable row key, e.g. `FP-001` |
| `pillar` | human | one of the 7 content pillars |
| `topic` | human | the idea, one line |
| `key_message` | human | the single point the post must land |
| `cta` | human | e.g. `I-download sa Play Store` |
| `notes` | human | constraints, asset links, anything the LLM must respect |
| `status` | workflow | `ready` / `in_review` / `posted` / `measured` / `needs_manual` / `expired` / `failed` / `blocked_needs_asset` |
| `scheduled_for` | human | optional, reserved; the scheduler currently takes the first `ready` row |

**Row claiming.** The scheduler selects the first row with `status = ready` and immediately
writes `status = in_review`. Without this, the 18:30 run would pick up the same row the
05:30 run is still holding in a 6-hour Slack review. Terminal statuses (`posted`,
`measured`, `needs_manual`, `expired`, `failed`, `blocked_needs_asset`) are never
re-selected; only a human returning a row to `ready` puts it back in rotation.
| `caption` | workflow | the approved caption as published |
| `image_url` | workflow | FB CDN URL of the approved creative |
| `fb_post_id` | workflow | from the publish response |
| `posted_at` | workflow | ISO 8601 |
| `likes` `comments` `shares` `reach` | workflow B | backfilled at 24h |

### Tab `Attempts`

`ts`, `row_id`, `attempt`, `pillar`, `headline`, `caption`, `image_url`, `decision`, `revision_note`

Every attempt is logged, approved or not. Over a month this is the record of what keeps
getting rejected, which is the fastest way to improve the copy system prompt.

---

## 5. Copy generation

### System prompt

Sections 1 to 4 of the source prompt (product facts, audience, brand voice, content
pillars) are embedded verbatim in `build-copy-prompt.js`. That file is the single source
of truth for brand voice; it is a real `.js` file so it is diffable and reviewable.

Temperature 0.8. On a regeneration, `revision_note` is injected:

> Your previous attempt was rejected for this reason: {revision_note}. Write a different
> angle. Do not repeat the rejected headline.

### Response schema (enforced by Gemini, not parsed hopefully)

```
headline     STRING  max 7 words, Taglish, rendered into the image
subhead      STRING  max 12 words, optional
caption      STRING  80 to 150 words, Taglish, first line is the hook
cta          STRING  one short line
hashtags     ARRAY of STRING, 3 to 5
image_prompt STRING  English, describes composition and where negative space sits
alt_text     STRING
```

### Hard product facts injected

Live features only, per section 1 of the source prompt. Price is **PHP 500, one-time,
no subscription** — corrected 2026-09-10 from an earlier PHP 499 figure that came from a
stale copy of the FishPin chatbot knowledge base (`builds/fishpin-chatbot/`), which is the
established source of truth for this venture. The figure is a product fact only: the
owner does not want it (or any peso amount) appearing in generated ad copy — see §6.

Forbidden claims, encoded as prompt rules AND as validator checks: iPhone support, live
tracking of other boats, typhoon warnings, government or BFAR endorsement, guaranteed
rescue, any price or peso amount at all.

---

## 6. Copy validation (`validate-copy.js`)

Deterministic, no model in the loop. Rejects on any of:

1. Missing or empty required field.
2. Em dash present anywhere in `headline`, `subhead`, `caption`, or `cta`.
3. Any banned word: revolutionary, game-changer, seamless, cutting-edge, unlock, elevate,
   empower, "in today's fast-paced world", "we are excited to announce".
4. `headline` longer than 7 words; `subhead` longer than 12 words.
5. `caption` outside 80 to 150 words.
6. More than 3 emoji in the caption.
7. All-caps run longer than one word.
8. Compliance breach: a rescue guarantee ("hindi ka mamamatay", "will save your life"),
   a fish-safety absolute (must read "generally considered safe to eat", not "safe to eat"),
   a named competitor brand, a fabricated review or user count, or any peso figure at all
   (never FishPin's own price, never a comparison figure — see §6a).

### 6a. Price rule (revised 2026-09-10)

The owner does not want ads to lead with, or even mention, price. Ads must instead lead
with the problem FishPin solves — losing track of the good fishing spot, getting lost when
fog or night comes, a dead engine with no way to call for help, or signal disappearing
offshore. This replaces a defect in the original price rule: it tried to tell FishPin's own
price apart from a legitimate comparison figure by reading the text immediately around a
peso figure for context words (a recurring cost, a device, "kada buwan", vs. FishPin's own
price context). A review proved that approach both rejected legitimate copy AND let a wrong
app price through disguised as a comparison, e.g. "Halagang P999 lang, at wala nang bayad
kada buwan" used to pass because "kada buwan" read as a comparison label.

The fix is simpler and strictly safer: any peso figure detected anywhere in `headline`,
`subhead`, `caption`, or `cta` is a rejection, full stop, regardless of whose cost it claims
to be. Detection stays scoped to peso notations (a number adjacent to ₱, PHP/Php/php, a bare
capital P prefix, or a trailing pesos/piso) so an ordinary count ("200 species", "3 to 5
contacts") still passes. The rejection reason never restates the offending figure, since
doing so invites the regeneration to echo that number straight back. The cost-comparison
pillar (§10, queue row FP-008 in §15) still contrasts a one-time purchase against a
recurring monthly load cost — just without quoting a figure for either side.

Failure path: one automatic regeneration with the validator's own reason as
`revision_note`. If the second attempt also fails, set `status = needs_manual` and alert
Slack with the failing rules and the raw model output. Never proceeds to image generation
on invalid copy.

**This machine retry is counted separately from the human `attempt` counter.** It uses its
own `copy_retry` flag, capped at 1, carried in the re-invoke payload. A validator failure
must never consume one of the reviewer's three review attempts, and vice versa.

---

## 7. Image generation

Model in `Config.imageModel`, default `gemini-2.5-flash-image` (proven publishing to a
Facebook Page in `sv91rOvu8Bec8sLc`). `gemini-3.1-flash-image` is the documented upgrade
but is not on the Gemini free tier.

`build-image-prompt.js` composes:

- The model's own `image_prompt` (scene, composition, negative space).
- The exact headline text, with strict rendering instructions: reproduce this text
  character for character, correct spelling, one line, bold sans-serif, placed in the
  reserved negative space.
- Style suffix, appended to every prompt: `photographic, natural Philippine coastal light,
  documentary style, deep navy and warm gold palette, single clear subject, generous
  negative space in the upper third`.
- Negatives: no watermarks, no app UI, no extra fingers, no western yacht, no western
  fishing rods on a bangka, no exaggerated poverty imagery, no comedic or pitiful framing,
  no imagery that reads as a real distress event.

Aspect ratio is requested via `generationConfig.imageConfig.aspectRatio` — `4:5` for
standard posts, `1:1` for fish-fact posts. `validate-image.js` reads back the actual
dimensions. If the model ignores the request, the build falls back to `1:1` for all posts
and this is recorded in the README as a known limitation. This must be verified during
implementation, not assumed.

`validate-image.js` also rejects: no image part in the response, decoded bytes under
20 KB, or a non-image MIME type. Any rejection alerts Slack, sets `status = failed`, and
stops. A post is never published without a verified image.

---

## 8. Approval loop

Slack node, `operation: sendAndWait`, `responseType: customForm`, timeout 6 hours.

Form fields:
- `decision` — dropdown: `Approve`, `Regenerate copy`, `Regenerate image`, `Regenerate both`
- `reason` — textarea, optional on approve, required in spirit on regenerate

The image preview and the full caption, CTA, hashtags, headline, pillar, row id and
`attempt N of 3` are posted to the review channel immediately before the form, using the
archived FB CDN URL.

### Loop mechanics — self re-invocation

Chosen over a true n8n cycle. `loop-guard.js` increments `attempt` and HTTP-POSTs
`{row_id, attempt, copy_retry, decision, revision_note, caption, headline}` back to the
workflow's own webhook `POST /webhook/fishpin-ad`. The same webhook and payload shape
serves both the human regeneration loop and the machine copy-validation retry; only
`decision` and which counter moved distinguish them.

Rationale: n8n is a DAG, and `$('Node').first()` inside a cycle resolves unpredictably
across iterations. Self re-invocation is stateless, each attempt is its own execution in
the log (so attempt 3 is debuggable), and it composes cleanly with a 6h `sendAndWait`.

On re-entry the webhook payload carries the row id, so `load-queue.js` fetches that
specific row rather than the next `ready` one. One idea therefore consumes exactly one
queue entry regardless of attempt count.

Branch targets:
- `Regenerate copy` — re-enter at Build Copy Prompt with `revision_note` injected.
- `Regenerate image` — re-enter keeping the approved caption, appending `revision_note`
  to the image prompt, skipping copy generation.
- `Regenerate both` — re-enter at Build Copy Prompt.

**Loop guard:** at `attempt` 3, stop (there is never an "attempt 4 of 3"). Set
`status = needs_manual`, post to Slack "3 attempts rejected, needs a human. Row id {id}".
No further re-invocation.

**Timeout:** on a 6h no-response, set `status = expired`, alert Slack, do not post.

---

## 9. Publishing

1. `POST /{graphVersion}/{pageId}/photos` with `published=false` and the image binary,
   during the preview step. Returns `media_fbid`.
2. On approval, `POST /{graphVersion}/{pageId}/feed` with
   `message = caption + "\n\n" + cta + "\n\n" + hashtags.join(" ")` and
   `attached_media = [{"media_fbid": "..."}]`.
3. If the response contains an `error` object, alert Slack with the full error and do
   **not** mark the row as posted. Otherwise capture `id` as `fb_post_id`.

`graphVersion` lives in Config, default `v21.0`, matching the existing FB workflow.

---

## 10. Content pillars and the social-proof rule

Seven pillars rotate: feature spotlight, safety, fish fact, tip or how-to, cost
comparison, social proof, behind the scenes.

**Social proof is never machine-generated.** The seed queue ships that row with
`status = blocked_needs_asset` and a note requiring a real screenshot, review, or user
quote supplied by the owner. The copy validator additionally rejects any fabricated
testimonial, name, rating, or user count on every pillar.

Cost comparison compares against "a GPS device" generically, contrasting a one-time
purchase against a recurring monthly load cost without quoting a figure for either side
(see §6a). Naming a competitor brand in the caption is a validator failure.

---

## 11. Error handling

- Every external call: `retryOnFail` with backoff, `onError: continueRegularOutput`.
- Each failure class routes to an explicit branch that alerts Slack, writes a terminal
  status to the Queue row, and stops short of publish.
- `settings.errorWorkflow = 660Xkpo164VSNTDZ` on both workflows for uncaught failures.

Known instance issue to fix before go-live: `660Xkpo164VSNTDZ` is currently **inactive**,
so the fleet-wide error handler alerts nowhere. Activating it is a prerequisite.

---

## 12. Credentials and configuration

| Credential | Status | Action |
|---|---|---|
| Facebook Graph API — FishPin Page | **missing** | Owner creates. System User in Meta Business Suite, long-lived Page token, scopes `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`. Verify expiry in the Access Token Debugger. Stored as an n8n credential, never inline. |
| Google Gemini | exists | `S0qfsjLzQfKC04iG` ("Gemini - Brand Variations"). The `epic catch api` key `0eINQFptxG4T1uH7` used by `sv91rOvu8Bec8sLc` is dead and is deliberately not cloned. |
| Google Sheets | exists | `AYzUUEYWUCPKxHFI`, service account `n8n-sheets@gen-lang-client-0754500282.iam.gserviceaccount.com`. New Sheet must be shared with it. |
| Slack | exists | `DnfgaCSu303JPlI3` ("Slack - n8n Bot"). |

Slack channels are Config values. Default `reviewChannel` and `opsChannel` both point at
`C0BDSV5RB5G` (`#chatbot-automation`) so the build is testable on day one; the intended
end state is a dedicated `#fishpin-ads` channel, which is a one-line Config edit once the
channel exists and the bot is invited.

`sendAndWait` requires n8n's `WEBHOOK_URL` to be publicly reachable. It is
(`https://n8n.srv1193790.hstgr.cloud`), and the existing FB workflow already relies on it.

### Config node keys

`pageId`, `graphVersion`, `sheetId`, `queueTab`, `attemptsTab`, `copyModel`,
`imageModel`, `copyTemperature`, `maxAttempts`, `reviewTimeoutHours`, `reviewChannel`,
`opsChannel`, `playStoreUrl`, `selfWebhookUrl`, `insightsDelayHours`.
(`appPrice` was removed 2026-09-10: the price rule no longer reads the app's price to
decide validity — see §6a — so nothing consumed the tunable any more.)

---

## 13. Testing

`test.js`, runnable before the Facebook token exists.

Offline (pure Code-node assertions, no network):
- Copy validator rejects an em dash, each banned word, an over-length headline, a
  short/long caption, a 4-emoji caption, a rescue guarantee, a fish-safety absolute, a
  named competitor, a fabricated review count, any peso figure at all (see §6a).
- Copy validator accepts a known-good sample.
- Loop guard increments correctly and hard-stops at attempt 3 (there is never an
  "attempt 4 of 3").
- Route decision maps all four dropdown values plus timeout to the right branch.
- Image validator rejects an empty response, an undersized payload, and a wrong MIME type.
- Image prompt builder includes the exact headline and every negative constraint.

Live (requires the Gemini credential only):
- Generate copy for one seed row per pillar; assert schema validity and that the output
  passes the validator unmodified.

Pre-first-live-post manual checklist (in the README):
1. Error handler `660Xkpo164VSNTDZ` is active.
2. Sheet shared with the service account; both tabs created with headers.
3. Slack bot present in the review channel; a `sendAndWait` form renders and returns.
4. One end-to-end dry run ending at `Regenerate copy`, proving the loop re-enters the
   same row and increments `attempt`.
5. One end-to-end run approved against the real Page, checked on the Page itself.
6. Insights workflow run manually against that post after 24h.

---

## 14. File layout

```
n8n-control/builds/06-fishpin-fb-ads/
  build.js                  assembles fishpin-fb-ads.workflow.json
  build-insights.js         assembles fishpin-insights.workflow.json
  load-queue.js             fetch next ready row, or a specific row on re-entry
  build-copy-prompt.js      brand bible sections 1-4, verbatim; single source of truth
  validate-copy.js          all deterministic copy rules
  build-image-prompt.js     scene + exact headline + style suffix + negatives
  validate-image.js         bytes, MIME, dimensions
  route-decision.js         approve / regen copy / regen image / regen both / timeout
  loop-guard.js             attempt counter, hard stop at 3, re-invoke payload
  map-writeback.js          Queue and Attempts row shaping
  select-due.js             insights: which posted rows are due for metrics
  map-metrics.js            insights: Graph responses -> row columns
  fishpin-fb-ads.workflow.json
  fishpin-insights.workflow.json
  queue-seed.csv            10 starter rows covering all 7 pillars
  README.md
  test.js
```

Deploy loop, per repo convention:
`node build.js` -> `../../n8n.ps1 create fishpin-fb-ads.workflow.json` -> `node test.js`.

---

## 15. Seed queue (10 rows, all 7 pillars)

| id | pillar | topic |
|---|---|---|
| FP-001 | feature spotlight | Offline maps work with zero signal offshore |
| FP-002 | feature spotlight | Save a fishing spot and navigate back to it exactly |
| FP-003 | safety | SOS sends your exact coordinates to saved contacts by SMS |
| FP-004 | safety | Tell family when you will be back, record your path |
| FP-005 | fish fact | Species of the day from the 200+ fish guide |
| FP-006 | fish fact | Local name, season and habitat of a common catch |
| FP-007 | tip or how-to | How to mark a spot properly so you can find it again |
| FP-008 | cost comparison | One-time purchase versus a handheld GPS device |
| FP-009 | social proof | **blocked_needs_asset** — requires a real screenshot or quote |
| FP-010 | behind the scenes | Built in the Philippines, by a Filipino developer |

---

## 16. Open items carried into implementation

1. Verify `generationConfig.imageConfig.aspectRatio` is honoured by
   `gemini-2.5-flash-image`. If not, fall back to `1:1` and document it.
2. Confirm the Slack `sendAndWait` `customForm` response shape (field naming) against the
   installed n8n version before wiring `route-decision.js`.
3. Confirm which Meta permissions work in Development mode for a Page admin versus which
   need App Review, and record it in the README.
