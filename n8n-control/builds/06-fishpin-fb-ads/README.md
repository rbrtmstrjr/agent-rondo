# FishPin Facebook Ad Engine — Portfolio Build #6

An AI creative pipeline that turns a one-line idea into a **reviewed, published Facebook
Page post** — brand-safe copy, a matching image, a human approval gate, and 24-hour
engagement tracking — with almost no manual work between "here's an idea" and "it's live
on the Page." Built on **n8n + Gemini (text + image) + Google Sheets + Slack + the
Facebook Graph API**. Demo: **FishPin**, a paid, offline-first marine navigation Android
app for Filipino fishermen.

> **The business problem.** A small app or local-services business knows it should post
> to Facebook regularly, but writing on-brand copy, making an image, and remembering to
> actually publish it eats an owner's evening every single time — so it stops after two
> weeks. This queues ideas once, and turns each one into a fully-drafted, brand-checked,
> human-approved post automatically, on a schedule, for the cost of a Gemini API call.

**The pitch:** *"Queue a list of post ideas once. Three times a week, this drafts the
copy and image, checks it against your brand rules automatically, and pings you on Slack
to approve with one click — no more forgetting to post, no more a launch getting delayed
because the flyer never got made."*

---

## How it works

### A. `FishPin Ad Creative -> FB (Approve)` — the main pipeline

```
Schedule Trigger (05:30 / 18:30, Mon/Wed/Fri, Asia/Manila)   |
Manual Trigger                                               |--> Config --> Load Queue Row
Webhook  POST /webhook/fishpin-ad   (loop re-entry)          |                    |
                                                 Queue empty? --yes--> Slack ops, stop
                                                             | no
         Claim Row            status = in_review  (prevents double pickup / dedup)
                              |
         Build Copy Prompt    brand bible + revision_note (on a retry)
                              |
         Generate Copy        Gemini gemini-2.5-flash + responseSchema   [retry 3x, continue]
                              |
         Validate Copy        em dash / banned words / compliance / fields / length / price
                              |
         Copy OK? --no--> Loop Guard (machine retry, budget 1) --> re-invoke, else needs_manual + Slack
              | yes
         Build Image Prompt   scene + EXACT headline + style suffix + negatives
                              |
         Generate Image       Gemini gemini-2.5-flash-image                [retry 2x, continue]
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
              \-- regen   --> Loop Guard (human retry, budget 3) --> re-invoke (attempt+1) or needs_manual
```

### B. `FishPin Ad Insights (24h)` — the hourly scanner

```
Schedule Trigger (hourly)
   --> Config
   --> Read Queue (all rows)
   --> Select Due (Code): status = posted AND reach empty AND posted_at older than 24h
   --> Any due? --no--> stop silently
        | yes
   --> Split Posts (one item per due row)
   --> Get Insights   GET /{post_id}/insights?metric=post_impressions,post_engaged_users,post_reactions_by_type_total
   --> Get Engagement GET /{post_id}?fields=comments.summary(true),shares,reactions.summary(true)
   --> Map Metrics (Code)
   --> Update Row (likes, comments, shares, reach, status)
   --> Notify Digest (Slack, one message per measured row)
```

Two Graph calls are needed because the `insights` edge doesn't return comment/share
counts, and the object-fields edge doesn't return impressions. This runs as its own
schedule-triggered workflow (not a 24h `Wait` node tacked onto the main flow) because a
`Wait` that long does not reliably survive an n8n restart.

**Why self re-invocation instead of a real loop.** n8n is a DAG; `$('Node').first()`
inside a true cycle resolves unpredictably across iterations. Instead, `Loop Guard`
increments the attempt counter and HTTP-POSTs the row id + decision back to the
workflow's own webhook (`POST /webhook/fishpin-ad`). Each retry is therefore its own
execution in the n8n log — attempt 3 is fully debuggable on its own — and it composes
cleanly with a 6-hour `sendAndWait`. The same webhook and payload shape serves both the
human regeneration loop (budget 3) and the machine copy-validation retry (budget 1); only
`decision` and which counter moved tells them apart.

---

## Production-readiness (Definition of Done)

Checked against the repo's Definition of Done in the root `CLAUDE.md`.

- ✅ **Error handling** — every external HTTP call (`Load Queue Row`, `Claim Row`,
  `Generate Copy`, `Generate Image`, `Upload Photo`, `Get Photo URL`, `Write Attempt`,
  `Publish Post`, `Write Back Row`, `Mark Terminal`, both Graph calls in the insights
  workflow) is built with `retryOnFail: true` (`maxTries: 3` on network/Sheets/Graph
  calls, 2 on the image call) and `onError: 'continueRegularOutput'`, so a failed call
  falls through to an explicit Slack-alert-and-terminate branch instead of aborting the
  whole run silently. Both workflows set `settings.errorWorkflow = 660Xkpo164VSNTDZ`
  (`[Ops] Error Handler -> Slack`) for anything that still escapes those branches.
  **Caveat:** that error workflow needs to be *active* in the n8n instance for this to
  actually alert — verify it before go-live (see the checklist below).
- ✅ **Input validation** — `Pick Row` fails soft (`found: false`, a clear reason)
  instead of throwing when the queue is empty or a re-invoked row id doesn't exist;
  `Validate Copy` and `Validate Image` are deterministic gates that reject malformed or
  missing model output field-by-field with a reason string, never a silent pass.
- ✅ **Idempotency / dedup** — `Claim Row` flips a row to `in_review` the instant it's
  picked, in a single targeted-cell Sheets write, before any generation happens. That
  prevents the 18:30 run from picking up the same row the 05:30 run is still holding in
  a 6-hour Slack review. Only a human manually resetting a row's `status` back to `ready`
  returns it to rotation, and terminal statuses (`posted`, `measured`, `needs_manual`,
  `expired`, `failed`, `blocked_needs_asset`) are never re-selected.
- ✅ **Credentials** — Gemini, Google Sheets, Slack, and Facebook Graph all go through
  n8n's credential store (`googlePalmApi`, `googleApi`, `slackApi`, `facebookGraphApi`
  node credential types); nothing is hardcoded in the workflow JSON. The Facebook Page
  token specifically needs expiry checked at setup time — see "Facebook token" below.
- ✅ **Human-in-the-loop** — every post is money-adjacent (drives paid-app installs) and
  irreversibly public once it hits the Page, so nothing publishes without an explicit
  Slack `Approve` on the `Slack Review` `sendAndWait` step. Rejections and timeouts never
  auto-publish.
- ✅ **Config node** — both workflows put every tunable (Sheet/Page/channel ids, model
  names, temperature, retry budgets, timeout, price, Play Store URL, webhook URL) in one
  `Config` node at the top of the workflow. See the Config table below.
- ✅ **Logging/notification** — success (`Notify Success`, `Notify Digest`) and every
  failure branch (`Notify Queue Empty`, `Notify Image Failed`, `Notify Publish Failed`,
  `Notify Stopped`) post to Slack. The `Attempts` Sheet tab additionally logs every
  generation attempt, approved or not, as a durable record.
- ✅ **README** — this file: business problem, ROI pitch, architecture, setup, swap-in
  points, config reference, test commands, and a pre-launch checklist.
- ✅ **Demo data** — `queue-seed.csv`, 10 rows covering all 7 content pillars for a real
  (if fictional-status) product, FishPin, including one row deliberately blocked because
  it would require a fabricated testimonial.
- **Tested end-to-end** — automated: `node test.js` is 401/401 green (every Code-node
  glue file's logic, both workflow assemblies, and the validator's full rule set,
  exercised offline with no network), and `node test.js --live` proves real Gemini output
  passes the unmodified validator once a `GEMINI_API_KEY` is supplied. What is **not**
  yet proven is the live network path end to end — an actual Slack `sendAndWait` round
  trip and an actual Facebook publish — because no `FB Page - FishPin` credential exists
  yet. That is exactly what the "Pre-first-live-post checklist" at the bottom of this
  README is for; treat this box as open until that checklist has been run once for real.

---

## Files

| File | Purpose |
|---|---|
| `build.js` | Assembles `fishpin-fb-ads.workflow.json` (main pipeline). |
| `build-insights.js` | Assembles `fishpin-insights.workflow.json` (24h scanner). |
| `lib/brand.js` | Brand bible: product facts, banned words, competitors, the 7 pillars, the copy system/user prompt builders, `COPY_SCHEMA`. |
| `lib/copy-rules.js` | `validateCopy` — the deterministic trust gate on generated copy. |
| `lib/image-rules.js` | Image prompt shaping + `validateImage` (bytes/MIME/dimensions). |
| `lib/flow-rules.js` | `normalizeDecision`, `extractReason`, `loopGuard` — the approval routing and the two retry budgets. |
| `lib/sheet-rules.js` | `QUEUE_HEADERS`, `ATTEMPT_HEADERS`, row selection, Attempts/Queue row shaping, Graph metric mapping. |
| `nodes/*.js` | The 11 Code-node glue files each workflow inlines a lib into (see `build.js`'s `code()` helper). |
| `fishpin-fb-ads.workflow.json` / `fishpin-insights.workflow.json` | The deployable, generated workflow JSON — do not hand-edit; edit the builder and rebuild. |
| `queue-seed.csv` | 10 starter rows covering all 7 pillars, ready to import into the Queue tab. |
| `test.js` | Offline unit tests (401 checks) + the `--live` Gemini copy-generation test. |

---

## Setup

### 1. Google Sheet

1. Create a new Google Sheet — name it something like **FishPin Ad Queue**.
2. Share it (**Editor**) with the service account:
   `n8n-sheets@gen-lang-client-0754500282.iam.gserviceaccount.com`
3. Create two tabs, named exactly `Queue` and `Attempts`, and paste the header row into
   row 1 of each:
   - `Queue`: `id, pillar, topic, key_message, cta, notes, status, scheduled_for, caption, image_url, fb_post_id, posted_at, likes, comments, shares, reach`
   - `Attempts`: `ts, row_id, attempt, pillar, headline, caption, image_url, decision, revision_note`

   (These are `QUEUE_HEADERS` and `ATTEMPT_HEADERS` in `lib/sheet-rules.js` — the code
   reads columns by header name via the row built from row 1, so the header text and
   order must match exactly.)
4. Import `queue-seed.csv` into the `Queue` tab starting at row 2 (File → Import →
   Upload, "Append to current sheet", or paste it in directly — it's already headerless
   after the CSV's own header row, so either import mode works as long as it lands under
   the existing headers rather than replacing them).
5. Copy the Sheet's id (the long id in its URL) into `Config.sheetId` in both `build.js`
   and `build-insights.js`, then rebuild (`node build.js && node build-insights.js`).

### 2. Facebook token

The Facebook Graph credential (`FB Page - FishPin`) does not exist yet — this is the one
piece of setup that has to happen in Meta's own tooling before anything can publish.

1. In [Meta for Developers](https://developers.facebook.com/apps/), create an app of
   type **Business**.
2. Add the **Facebook Login for Business** product and the **Pages** product to it.
3. Request these permissions: `pages_manage_posts`, `pages_read_engagement`,
   `pages_show_list`.
4. **Development mode is enough to start** as long as the FishPin Page admin (i.e. you)
   is the one generating and using the token — an app in Development mode can act on
   behalf of pages its own admins/testers manage without App Review. App Review is only
   needed once someone *outside* the app's admin/tester list needs to use these
   permissions (e.g. a client's own Page, or Live mode for the public).
5. In **Meta Business Suite → Business Settings → Users → System Users**, create a
   System User, assign it the FishPin Page with the permissions above, and generate a
   token for it. A System User token doesn't expire on a 60-day cycle the way a personal
   long-lived token does — this is what "long-lived Page token" means in practice.
6. Paste the token into the
   [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/) and
   confirm the granted scopes and the expiry ("Expires" should read "Never" or a System
   User's typical long horizon, not a short-lived ~1-2h window).
7. In n8n, create a **Facebook Graph API** credential named exactly `FB Page - FishPin`
   and paste the token in.
8. Open `build.js` and `build-insights.js`, find the line
   `const FB = { id: 'FB_CRED_ID', name: 'FB Page - FishPin' };` in each, and replace
   `'FB_CRED_ID'` with the new credential's id from n8n (visible in the credential's URL
   or via the n8n API). Then rebuild both workflows:
   ```bash
   node build.js && node build-insights.js
   ```

### 3. Slack

1. The bot needs these OAuth scopes: `chat:write`, `files:write`, `channels:read`.
2. Invite the bot to both the review channel (`reviewChannel` in Config — where
   `Slack Review`'s approval form is posted) and the ops channel (`opsChannel` — success
   and failure notifications). By default both point at the same channel
   (`C0BDSV5RB5G`, `#chatbot-automation`) so the build is testable without creating a new
   channel first; point them at a dedicated `#fishpin-ads` channel later by editing the
   `Config` node.
3. `Slack Review` uses `operation: sendAndWait`, which needs n8n's own `WEBHOOK_URL` to
   be **publicly reachable** so Slack's "Approve" button click can reach it back — this
   instance's `WEBHOOK_URL` is `https://n8n.srv1193790.hstgr.cloud`, already relied on by
   the existing FB workflow, so no extra tunnel/ngrok setup should be needed.

---

## Config table

### `fishpin-fb-ads.workflow.json` (main pipeline)

| Key | Purpose | Default |
|---|---|---|
| `pageId` | FishPin Facebook Page id, target of Upload/Publish. | `FILL_IN_FISHPIN_PAGE_ID` |
| `graphVersion` | Facebook Graph API version for every FB call. | `v21.0` |
| `sheetId` | The Google Sheet id (Queue + Attempts tabs live here). | `FILL_IN_SHEET_ID` |
| `queueTab` | Tab name for the Queue sheet. | `Queue` |
| `attemptsTab` | Tab name for the Attempts log sheet. | `Attempts` |
| `copyModel` | Gemini model for copy generation. | `gemini-2.5-flash` |
| `imageModel` | Gemini model for image generation. | `gemini-2.5-flash-image` |
| `copyTemperature` | Sampling temperature for copy generation. | `0.8` |
| `maxAttempts` | Human review retry budget before `needs_manual`. | `3` |
| `maxCopyRetries` | Machine copy-validation retry budget before `needs_manual`. | `1` |
| `reviewTimeoutHours` | How long `Slack Review`'s `sendAndWait` waits before `expired`. | `6` |
| `reviewChannel` | Slack channel id the approval form is posted to. | `C0BDSV5RB5G` |
| `opsChannel` | Slack channel id for success/failure/empty-queue notifications. | `C0BDSV5RB5G` |
| `appPrice` | The one allowed peso figure; also injected into the copy prompt. | `499` |
| `playStoreUrl` | FishPin's Play Store listing, for reference in prompts. | `https://play.google.com/store/apps/details?id=app.fishpin` |
| `selfWebhookUrl` | This workflow's own webhook, used by `Loop Guard`'s re-invocation. | `https://n8n.srv1193790.hstgr.cloud/webhook/fishpin-ad` |

### `fishpin-insights.workflow.json` (24h scanner)

| Key | Purpose | Default |
|---|---|---|
| `sheetId` | Same Sheet as the main pipeline. | `FILL_IN_SHEET_ID` |
| `queueTab` | Tab name for the Queue sheet. | `Queue` |
| `graphVersion` | Facebook Graph API version. | `v21.0` |
| `opsChannel` | Slack channel id for the engagement digest. | `C0BDSV5RB5G` |
| `insightsDelayHours` | How old a post must be before it's scanned for metrics. | `24` |

---

## Test commands

```bash
# Rebuild both workflow JSONs from the current Config/nodes
node build.js
node build-insights.js

# Offline suite — 401 checks, no network, no credentials needed
node test.js

# One section only, e.g. just the copy-rules checks
node test.js --only=copy

# Live copy-generation test — calls Gemini for one seed row per pillar and
# asserts the output passes validateCopy UNMODIFIED. Skips gracefully with
# a clear message ("! set GEMINI_API_KEY to run the live test") and exits 0
# if GEMINI_API_KEY isn't set — it never fails the suite for a missing key.
GEMINI_API_KEY=... node test.js --live
```

Latest offline run: **401/401 passed.** `node test.js --live` with no key: offline
sections still all pass, then the live section prints the skip message and exits 0.

---

## Known limitations

Being honest about what's not finished, rather than hiding it:

- **The Attempts log never gets its outcome written back.** `Log Attempt` writes every
  attempt row with `decision: 'pending'` up front (before the Slack review even happens,
  so a timed-out or abandoned attempt is still on record) — but nothing later goes back
  and updates that row with what was actually decided. Every row in the `Attempts` tab
  will read `pending` forever. Treat that column as "an attempt was logged," not as a
  record of what happened to it; the real outcome lives on the `Queue` tab's `status`.
- **The "stopped" Slack alert can post empty.** When the review loop escalates after
  repeated rejections (`Loop Guard` returns `action: 'needs_manual'` with a real message
  like "3 attempts rejected, needs a human"), that message is supposed to reach
  `Notify Stopped` via `$json.message`. But `Notify Stopped` is fed through the `Mark
  Terminal` HTTP node, and by the time execution reaches `Notify Stopped`, `$json` is
  `Mark Terminal`'s own Sheets API response, not `Loop Guard`'s payload — so
  `$json.message` is typically empty and the alert posts as just ":octagonal_sign:" with
  no text. The row's `status` is still written correctly (that write happens before this
  bug bites); only the Slack notification's body is affected.
- **Copy validation doesn't gate every generated field.** `validateCopy` runs its full
  rule set (em dash, banned words, length, all-caps, compliance, competitor names, price)
  against `headline`, `subhead`, `caption`, and `cta` only. `hashtags` is checked for
  count (3-5) and `alt_text` for non-emptiness, but neither is checked for banned words,
  fabricated claims, or a wrong peso figure. In practice this means a bad word or a wrong
  price could slip through in a hashtag or the alt text without failing validation.
- **A peso figure that isn't 499 is always rejected, even a legitimate one.** The price
  check flags any number following `₱`/`PHP`/`pesos`/`P` that isn't exactly `499` — which
  is deliberately strict so the AI can never misquote FishPin's own price. But the "cost
  comparison" pillar's whole point is comparing FishPin's price against something else
  (a GPS device, a monthly phone-load top-up), and if the model writes out that other
  cost as a peso figure (e.g. "a load of ₱300 a month"), validation will reject the
  draft even though the number is correct and relevant. Expect cost-comparison rows to
  need an extra regeneration round where the model is nudged to describe the comparison
  qualitatively ("costs you every month") instead of quoting a second peso number.

---

## Pre-first-live-post checklist

Run this once, in order, before letting the schedule trigger post to the real Page:

1. Confirm `[Ops] Error Handler -> Slack` (`660Xkpo164VSNTDZ`) is **active** in n8n — it
   is the fleet-wide error workflow both `settings.errorWorkflow` entries point at, and
   it currently needs to be manually activated per instance.
2. Confirm the Sheet is shared with the service account and both tabs (`Queue`,
   `Attempts`) exist with their exact header rows in row 1.
3. Confirm the Slack bot is present in the review channel and that a `sendAndWait` form
   actually renders there and comes back (post a throwaway test message with the same
   credential if unsure).
4. Run one end-to-end dry run that ends at **"Regenerate copy"** — confirm the loop
   re-enters the same queue row (not a new one) and `attempt` increments in the Attempts
   log and in the next Slack preview.
5. Run one end-to-end run that gets **approved** against the real FishPin Page, and check
   the post on the Page itself — headline legible, image correct, caption/CTA/hashtags
   present, no placeholder text.
6. Run the Insights workflow (`fishpin-insights.workflow.json`) manually against that
   post after 24 hours have passed, and confirm `likes`/`comments`/`shares`/`reach` land
   correctly on the Queue row.

## Adapting for a real client (the swap-in points)

- **Product facts:** replace `PRODUCT`, `AUDIENCE`, `BANNED_WORDS`, `COMPETITORS`, and
  `PILLARS` in `lib/brand.js` with the client's own brand bible — this is the single
  source of truth for both the system prompt and the price/claim rules the validator
  enforces.
- **Content pillars:** the 7-pillar rotation is a FishPin-specific structure; a different
  client may want 4 pillars or 10 — edit `PILLARS` and reseed the Queue tab.
- **Destination:** swap the Facebook publish step for Instagram (same Graph API, a
  different node) or LinkedIn/X with a different HTTP call — the copy/image generation
  and approval loop are platform-agnostic.
- **Review cadence:** `maxAttempts`, `maxCopyRetries`, and `reviewTimeoutHours` are all
  Config values; tune them per client's tolerance for back-and-forth versus speed.
- **Scheduling:** the cron expression in `Schedule Trigger` is the only place posting
  frequency lives — change it for a client's preferred cadence.

---

Live workflow ids: `fishpin-fb-ads.workflow.json` → *(assign after first `n8n.ps1 create`)*,
`fishpin-insights.workflow.json` → *(assign after first `n8n.ps1 create`)*. Webhook:
`POST /webhook/fishpin-ad`.
