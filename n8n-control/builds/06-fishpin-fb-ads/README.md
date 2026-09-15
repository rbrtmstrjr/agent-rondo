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
Schedule Trigger (09:00 daily, Asia/Manila)                  |
Manual Trigger                                               |--> Config --> Load Queue Row
Webhook  POST /webhook/fishpin-ad   (loop re-entry, shared secret)  |             |
                                                 Queue empty? --yes--> Slack ops (with the
                                                             |         actual refusal reason), stop
                                                             | no
         Claim Row            status = in_review  (prevents double pickup / dedup)
                              |
         Keep Copy?  --yes (decision = "image")--> Reuse Copy ----------------------,
              | no            replays the APPROVED copy, skips copy generation      |
              |                                                                    |
         Build Copy Prompt    brand bible (spoken-Filipino voice, both required     |
                              links) + every already-published topic and caption    |
                              (most recent 15, different-angle rule)                |
                              + revision_note (on a retry)                          |
                              |                                                     |
         Generate Copy        Gemini gemini-2.5-flash + responseSchema  [retry 3x]  |
                              |                                                     |
         Validate Copy        em dash / banned words / compliance / fields / length / price
                              / caption is PROSE ONLY (no cta, no link, no hashtag) / caption
                              is 2 to 4 paragraphs of at most 3 sentences / both links present
                              in the ASSEMBLED message / not an exact repeat of a published post
                              |                                                     |
         Copy OK? --no--> Loop Guard (machine retry, budget 1) --> re-invoke, else needs_manual
              | yes                                                                 |
              +<--------------------------------------------------------------------'
              |
         Build Image Prompt   FAN-OUT: one item per image_prompt (1 to 5).
                              Each carries the FishPin logo PNG as an inline
                              reference image + scene + brand colour grade +
                              negatives + the bottom-LEFT brand lockup (mark,
                              wordmark "FishPin", website underneath);
                              image 1 also renders the EXACT headline
                              (+ the reviewer's note, on a keep-copy pass)
                              |
         Generate Image       Gemini gemini-2.5-flash-image, ONE CALL PER IMAGE  [retry 2, continue]
                              |
         Validate Image  --any image fails--> Notify Image Failed --> Mark Terminal, STOP
              |                 (ALL-OR-NOTHING: never a partial album)
         Upload Photo (published=false)  x N  --> media_fbid each
         Get Photo URL (?fields=images)  x N  --> public CDN url each
              |
         Collect Photos       THE JOIN: N items -> 1. Builds attached_media,
                              collects every url, checks every photo has an id
                              AND a url, carries the shared copy.
              |
         Image URL OK?  --no--> Notify Image Failed --> Mark Terminal, STOP
              | yes                (fail-closed, all-or-nothing: one unusable
              |                     photo sinks the whole post, never a partial)
         Log Attempt  (Sheets -> Attempts tab; image_url holds every url joined
                       by ' | ', plus the observed aspect ratio)
              |
         Compose Message      (in Collect Photos) buildPostMessage puts the post together
                              ONCE: caption, blank line, cta, blank line, both links on
                              consecutive lines, blank line, hashtags. Publish Post and
                              Post Preview both send THAT string, so the reviewer approves
                              character-for-character what goes on the Page.
              |
         Post Preview (all N images + the count + the composed message)
              |
         Slack Review   sendAndWait, approvalType: double, 6h timeout
                        TWO NATIVE BUTTONS, IN CHANNEL: Approve | Decline
              |
         Route Decision   (routeApproval)
              |-- approve  (approved:true)  --> Publish Post
              |                 POST /{pageId}/feed + attached_media (JSON array
              |                 of every media_fbid) + the composed message = ONE album post
              |                   --> Write Back --> Write Back Row (Queue row)
              |                        --> Row Written? --yes--> Slack success
              |                                         \--no--> Slack "live but unrecorded"
              |                                                  --> Mark Terminal (needs_manual)
              |-- timeout  (no `approved` key at all: nobody clicked in 6h)
              |                 --> status=expired + Slack, no post, NO attempt consumed
              \-- decline  (approved:false) --> 'both': new copy AND new images
                                --> Loop Guard (human retry, budget 3) --> Re-invoke (attempt+1)
                                     --> Re-invoked? --no--> Slack + Mark Terminal
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
   --> Map Metrics (Code)   skips any row whose Graph call failed, so a transient
                            error is retried next hour instead of being written as reach 0
   --> Update Row (likes, comments, shares, reach, status)
   --> Notify Digest (Slack, one message per measured row; reads the numbers back
                      from Map Metrics by item index, not from Update Row's response)
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

`POST /webhook/fishpin-ad` is a public URL, so the payload also carries a shared secret
(`Config.loopSecret`) that `Pick Row` checks before doing anything else, and a re-entry
naming a row id is only honoured while that row is `in_review` — the one state a row can
legitimately be mid-loop in. Both refusals stop the run and say why in Slack. See
"Loop secret" under Setup.

**The keep-the-copy branch is dormant, not deleted.** `Keep Copy?` / `Reuse Copy` implement
spec §8's "regenerate the image but keep the approved words": the re-entry carries the
approved copy in its payload, `Reuse Copy` replays it in `Validate Copy`'s shape, and only
the image prompts change (they get the reviewer's note appended). Since the review gate
became two buttons, **a reviewer can no longer select it** — `Decline` always means
`both` (new copy and new images). The branch, its `decision: 'image'` value and its tests
all remain, and it is still reachable by POSTing the loop webhook by hand with
`decision: "image"` and the shared secret. Restoring it as a third button would mean
swapping the Slack node back to a custom form, which is exactly what the owner asked to
remove; a cleaner future option is a second `sendAndWait` shown only after a decline.

---

## How a post is composed (added 2026-09-11)

The model writes **prose only**. Everything else is added in code, by one pure function,
`buildPostMessage(copy, cfg)` in `lib/copy-rules.js`, which `Collect Photos` calls once:

```
{caption}            <- 2 to 4 paragraphs, blank line between, 1 to 3 sentences each

{cta}

{websiteUrl}
{playStoreUrl}       <- consecutive lines, no blank line between them

{hashtags joined by a space}
```

`Publish Post` sends `$json.message` and `Post Preview` shows
`$('Collect Photos').first().json.message` — the **same** string — so the reviewer approves
character-for-character what lands on the Page.

**Why.** The first real published post came out as one unbroken ~110-word block, then the
CTA, then the links, then the CTA **again**, then hashtags. Two separate faults: the copy
prompt told the model to end the caption with the CTA and both links, while `Publish Post`
independently appended the CTA and the hashtags; and nothing asked for paragraphs. Both are
now structural impossibilities rather than instructions — `validateCopy` rejects a caption
containing a link, a hashtag or the CTA, rejects anything that is not 2 to 4 blank-line
separated paragraphs of at most 3 sentences each, and the "both links must be present" rule
moved onto the **assembled message** (it was not dropped: a post with no links gives the
reader nothing to act on).

The `caption` column on the `Queue` tab still stores what the model wrote — the prose. That
is deliberate: it is what the no-exact-repeat check compares new drafts against, so both
sides of that comparison must be the same kind of text.

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
  Every call that can fail silently is followed by an explicit gate rather than a hopeful
  next step: `Copy Valid?`, `Image Valid?`, `Image URL OK?`, `Published?`, `Row Written?`
  and `Re-invoked?`. Nothing reports success, and nothing opens the human review gate, on
  the strength of a call that may not have succeeded.
- ✅ **Input validation** — `Pick Row` fails soft (`found: false`, a clear reason)
  instead of throwing when the queue is empty or a re-invoked row id doesn't exist;
  `Validate Copy` and `Validate Image` are deterministic gates that reject malformed or
  missing model output field-by-field with a reason string, never a silent pass. The loop
  webhook additionally rejects any call without the shared secret, and any re-entry naming
  a row that is not `in_review`.
- ✅ **Idempotency / dedup** — `Claim Row` flips a row to `in_review` the instant it's
  picked, in a single targeted-cell Sheets write, before any generation happens. That
  prevents the next day's 09:00 run from picking up a row that is still sitting in an
  unanswered Slack review. Only a human manually resetting a row's `status` back to `ready`
  returns it to rotation, and terminal statuses (`posted`, `measured`, `needs_manual`,
  `expired`, `failed`, `blocked_needs_asset`) are never re-selected.
- ✅ **Credentials** — Gemini, Google Sheets, Slack, and Facebook Graph all go through
  n8n's credential store (`googlePalmApi`, `googleApi`, `slackApi`, `facebookGraphApi`
  node credential types); nothing is hardcoded in the workflow JSON. The Facebook Page
  token specifically needs expiry checked at setup time — see "Facebook token" below.
- ✅ **Human-in-the-loop** — every post is money-adjacent (drives paid-app installs) and
  irreversibly public once it hits the Page, so nothing publishes without an explicit
  **Approve** click on the `Slack Review` `sendAndWait` step — two native Slack buttons,
  `approvalType: double`, decided in the channel with no browser tab. Declines and timeouts
  never auto-publish, and the two are told apart (a decline regenerates and spends an
  attempt; a 6-hour timeout expires the row and spends nothing). The gate is also **fail-closed and all-or-nothing**: if any photo of the
  set has no usable public URL, the preview message would have thrown and the reviewer
  would have been shown a bare approval prompt with no images and no copy — while perfectly
  valid `media_fbid`s stood ready to publish. `Collect Photos` reduces "are all N photos
  usable?" to one flag and `Image URL OK?` stops the run there instead. No images, no
  review, and never a partially-published album.
- ✅ **Config node** — both workflows put every tunable (Sheet/Page/channel ids, model
  names, temperature, retry budgets, timeout, website + Play Store URL, webhook URL) in one
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
- **Tested end-to-end** — automated: `node test.js` is 876/876 green (every Code-node
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
| `lib/brand.js` | Brand bible: product facts, banned words, competitors, the 7 pillars, the copy system/user prompt builders, `COPY_SCHEMA` (incl. the 1-to-5 `image_prompts` array and the rules for choosing the count). `buildSystemPrompt()` takes no urls: the caption is prose only and the links are appended in code (see `buildPostMessage`), so naming a url in the prompt would only invite the model to write one into the caption. It carries the CAPTION SHAPE rule (2 to 4 paragraphs, 1 to 3 sentences each, hook shortest) and a delimited `CAPTION_EXAMPLE` the model copies the shape of. `buildUserPrompt(row, note, rejectedHeadline, priorPosts)` lists the last `PRIOR_POSTS_LIMIT` (15) published posts back to the model and demands a different angle. |
| `lib/copy-rules.js` | `validateCopy` — the deterministic trust gate on generated copy — and **`buildPostMessage(copy, cfg)`, the one place a published post is assembled** (caption / cta / both links / hashtags, in that order). Also `captionParagraphs` and `sentenceCount`, the shape helpers the paragraph rules use. |
| `lib/image-rules.js` | `PALETTE` (the FishPin brand colours by name and hex), `STYLE_SUFFIX` (the colour grade), `logoInstruction(websiteUrl)` (the bottom-left brand lockup), `promptsOf`, per-image `buildImagePrompt`, `validateImage` (bytes/MIME/dimensions). |
| `lib/flow-rules.js` | `normalizeDecision`, `routeApproval` (the Slack gate's approve/decline/timeout mapper), `DECLINE_NOTE`, `extractReason`, `loopGuard` — the approval routing and the two retry budgets. |
| `lib/sheet-rules.js` | `QUEUE_HEADERS`, `ATTEMPT_HEADERS`, row selection, Attempts/Queue row shaping, Graph metric mapping. |
| `nodes/*.js` | The 13 Code-node glue files each workflow inlines a lib into (see `build.js`'s `code()` helper). `collect-photos.js` is the join that turns the per-image fan-out back into one album, and — because it is the single-item node BOTH `Publish Post` and `Post Preview` read — it is also where `buildPostMessage` composes the published message, once. |
| `fishpin-fb-ads.workflow.json` / `fishpin-insights.workflow.json` | The deployable, generated workflow JSON — do not hand-edit; edit the builder and rebuild. |
| `queue-seed.csv` | 10 starter rows covering all 7 pillars, ready to import into the Queue tab. Unchanged by the album work: the `Queue` tab is still 16 columns and its one `image_url` column now holds every image url joined by ` \| `. |
| `assets/BRAND.md` | The FishPin colour palette and personality, lifted from the app's own brand spec. The source of truth for `STYLE_SUFFIX`. |
| `assets/logo.png` | The real FishPin logo (7.5 KB). `build.js` base64s it into the Build Image Prompt Code node at build time and it is sent to Gemini as an inline reference image. |
| `test.js` | Offline unit tests (876 checks) + the `--live` Gemini copy-generation test. |

---

## Setup

### 1. Google Sheet

1. Create a new Google Sheet — name it something like **FishPin Ad Queue**.
2. Share it (**Editor**) with the service account:
   `n8n-sheets@gen-lang-client-0754500282.iam.gserviceaccount.com`
3. Create two tabs, named exactly `Queue` and `Attempts`, and paste the header row into
   row 1 of each:
   - `Queue`: `id, pillar, topic, key_message, cta, notes, status, scheduled_for, caption, image_url, fb_post_id, posted_at, likes, comments, shares, reach`
   - `Attempts`: `ts, row_id, attempt, pillar, headline, caption, image_url, decision, revision_note, aspect`
     (still 10 columns after the 1-to-5 album change: a post's image urls share the one
     `image_url` cell, joined by ` | `, so the number of entries is also the image count.)

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

### 3. Loop secret

`POST /webhook/fishpin-ad` is a public, unauthenticated URL. The only legitimate caller is
this workflow's own `Re-invoke` step, so the payload carries a shared secret and `Pick Row`
refuses anything else. Without it, anyone with the URL could resurrect the row that ships
as `blocked_needs_asset` (spec §10: social proof is never machine-generated), re-enter an
already-posted row, or hand the pipeline an arbitrary `revision_note`, which goes verbatim
into the Gemini prompt.

1. Generate a random string (e.g. `openssl rand -hex 24`).
2. Put it in `Config.loopSecret` — edit `build.js` and rebuild, or edit the `Config` node
   directly in the n8n UI.
3. Until you do, `Pick Row` refuses **every** webhook call with
   "Config.loopSecret is still the placeholder", so the regeneration loop will not work.
   Scheduled and manual runs are unaffected.

A re-entry naming a row id is additionally only honoured while that row's status is
`in_review` — the state `Claim Row` set on the way into the review that produced the loop.
Terminal statuses (`posted`, `measured`, `needs_manual`, `expired`, `failed`,
`blocked_needs_asset`) and unclaimed `ready` rows are refused, each with its own reason
string, which `Notify Queue Empty` prints to the ops channel.

### 4. Slack

1. The bot needs these OAuth scopes: `chat:write`, `files:write`, `channels:read`.
2. Invite the bot to both the review channel (`reviewChannel` in Config — where
   `Slack Review`'s approval form is posted) and the ops channel (`opsChannel` — success
   and failure notifications). Both point at the dedicated FishPin ads channel
   `C0C1WS8PAAJ` (moved off the shared `#chatbot-automation` on 2026-09-15), and the
   insights workflow's engagement digest posts there too. To move them again, edit
   `reviewChannel` / `opsChannel` in each workflow's `Config` node and invite the bot.
3. `Slack Review` uses `operation: sendAndWait` with `approvalOptions.values.approvalType
   = 'double'`, so the reviewer gets two buttons **in the channel** (Approve / Disapprove)
   and never leaves Slack. This needs n8n's own `WEBHOOK_URL` to be **publicly reachable**
   so the button click can reach it back — this
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
| `imageModel` | Gemini model for image generation. Called once per image, so a 5-image post is 5 calls. Must accept an inline reference image (the logo). | `gemini-2.5-flash-image` |
| `copyTemperature` | Sampling temperature for copy generation. | `0.8` |
| `maxAttempts` | How many times a reviewer may Decline before `needs_manual`. Each Decline regenerates the copy AND the images. | `3` |
| `maxCopyRetries` | Machine copy-validation retry budget before `needs_manual`. | `1` |
| `reviewTimeoutHours` | How long `Slack Review`'s two-button `sendAndWait` waits before the row goes `expired`. A timeout consumes no human attempt. | `6` |
| `reviewChannel` | Slack channel id the approval form is posted to. | `C0C1WS8PAAJ` |
| `opsChannel` | Slack channel id for success/failure/empty-queue notifications. | `C0C1WS8PAAJ` |
| `websiteUrl` | FishPin's website. Appended to **every** post by `buildPostMessage` (never written by the model), and set under the brand lockup in every image. | `www.fishpin.app` |
| `playStoreUrl` | FishPin's Play Store listing. Appended to **every** post, on the line under `websiteUrl`. (Corrected 2026-09-11: the package id was `app.fishpin`, which is not the app.) | `https://play.google.com/store/apps/details?id=com.fishpin.app` |
| `selfWebhookUrl` | This workflow's own webhook, used by `Loop Guard`'s re-invocation. | `https://n8n.srv1193790.hstgr.cloud/webhook/fishpin-ad` |
| `loopSecret` | Shared secret for the loop webhook. `Loop Guard` sends it; `Pick Row` refuses any webhook call without it. **Must be replaced before the loop works at all** — every webhook call is refused while it reads `FILL_IN_*`. | `FILL_IN_LOOP_SECRET` |

### `fishpin-insights.workflow.json` (24h scanner)

| Key | Purpose | Default |
|---|---|---|
| `sheetId` | Same Sheet as the main pipeline. | `FILL_IN_SHEET_ID` |
| `queueTab` | Tab name for the Queue sheet. | `Queue` |
| `graphVersion` | Facebook Graph API version. | `v21.0` |
| `opsChannel` | Slack channel id for the engagement digest. | `C0C1WS8PAAJ` |
| `insightsDelayHours` | How old a post must be before it's scanned for metrics. | `24` |

---

## Test commands

```bash
# Rebuild both workflow JSONs from the current Config/nodes
node build.js
node build-insights.js

# Offline suite — 876 checks, no network, no credentials needed
node test.js

# One section only, e.g. just the copy-rules checks
node test.js --only=copy

# Live copy-generation test — calls Gemini for one seed row per pillar and
# asserts the output passes validateCopy UNMODIFIED. Skips gracefully with
# a clear message ("! set GEMINI_API_KEY to run the live test") and exits 0
# if GEMINI_API_KEY isn't set — it never fails the suite for a missing key.
GEMINI_API_KEY=... node test.js --live
```

Latest offline run: **876/876 passed** (802/802 before the 2026-09-11 caption-format fix;
682/682 before the owner adjustments that preceded it: the spoken-Filipino voice, the two
required links, the bottom-left brand lockup and the no-exact-repeat rule). `node test.js --live` with no key: offline
sections still all pass, then the live section prints the skip message and exits 0.

---

## Known limitations

Being honest about what's not finished, rather than hiding it:

- **The timeout-vs-decline rule is reasoned, not yet observed on a live run.** With two
  native buttons the node emits `{data: {approved: true|false}}` on a click. On a
  `limitWaitTime` expiry no webhook ever fires, so the node's output is still the input it
  passed through when it put the execution to wait, and carries no `approved` key at all.
  `routeApproval` uses exactly that: an `approved` boolean present means a human clicked
  (and its value says which button), none present means nobody did. That reading follows
  from how n8n resumes a waiting node, and it fails safe either way: an unrecognisable
  payload is read as a timeout, which expires the row without publishing and without
  spending one of the three human attempts, rather than as a rejection. It has **not** been
  confirmed against a real expiry on this instance. Step 8 of the checklist below is what
  confirms it; until then treat it as the most likely open question in this build.
- **The brand lockup is drawn, not composited, and only the mark comes from a file.**
  `assets/logo.png` is still sent to the image model as an inline reference image, now with
  an instruction to place it **bottom LEFT** as part of a lockup: the mark, then the wordmark
  `FishPin` in a clean bold sans-serif, with the website `www.fishpin.app` in a noticeably
  smaller size directly underneath, the whole thing small enough to read as a signature
  rather than a banner. **There is no wordmark asset on disk** — `fishpin-web`'s own
  `components/ui/Logo.tsx` composes the icon plus live text in code ("Fish" medium, "Pin"
  extra-bold) — so the model has to *draw* those two strings. It already renders a Tagalog
  headline into these images correctly, so this is the same job it is doing anyway, and a
  one-word Latin-script wordmark is an easier one. But it is still generation: a misspelled
  `FishPin`, a wrong weight, or a mangled url are realistic outcomes, as is the mark itself
  being redrawn rather than reproduced. **Unverified — no live image call has been made since
  the change.** The human approval gate is what catches it; checklist step 11 is what proves
  it. If the wordmark or the url comes back garbled repeatedly, the honest fallback is to
  stop asking for drawn text and ship a real lockup PNG (mark + wordmark + url, exported from
  the web app) as the reference image instead, which keeps the current mechanism and removes
  the drawing entirely. If even the mark is redrawn, the remaining fallback is a deterministic
  compositing step this pipeline does not have today (spec section 1 explicitly ruled out a
  separate overlay step) — a real change of scope, not a toggle.
- **The caption-shape rules are structural, not stylistic.** `validateCopy` counts
  blank-line-separated paragraphs and counts sentences by splitting on `.`, `!`, `?` and
  `…`. That is deliberately crude: it can be fooled by an abbreviation with a full stop
  ("Dr. Cruz" reads as two sentences), and it cannot tell a well-written three-sentence
  paragraph from a badly-written one. What it does guarantee is that a wall of text never
  reaches the Page again, and that the hook stands alone above Facebook's "See more" fold.
  Whether the paragraphs are any *good* is still the reviewer's call at the Slack gate.
  The prompt additionally asks for the first paragraph to be the SHORTEST; that one is an
  instruction with a worked example, not a validator rule, because rejecting a draft for a
  hook two characters longer than paragraph two would burn regeneration attempts on nothing.
- **The no-repeat rule is exact-match only, on purpose.** `Pick Row` collects the topic and
  the published caption of every `posted`/`measured` Queue row, the prompt lists the most
  recent 15 back to the model as "already published, take a different angle", and
  `validateCopy` rejects a caption or headline that matches a published one **exactly**
  (whitespace collapsed, case folded). Near-duplicates are therefore **allowed by design**:
  there is no similarity score to tune and no risk of a legitimate second post about the same
  feature being rejected by a threshold. What stops a lazily-rewritten repeat is the prompt
  instruction and the human at the approval gate, not the validator. Note also that the Queue
  tab has no `headline` column, so for published rows the **caption** is what the repeat check
  actually compares; the headline check only fires when a prior headline is supplied.
- **Only the first image of an album carries the headline.** Repeating the same rendered
  headline across five album frames reads as five rejected drafts of one poster, and every
  extra rendered word is another chance for the model to garble Tagalog. So image 1 is the
  cover and renders the headline exactly as before; images 2 to N are explicitly told to
  render no text at all. A how-to post therefore has no per-step captions burned into the
  pictures; the steps live in the caption text.
- **A single-image post still goes through the album path.** `POST /{pageId}/feed` is sent
  `attached_media` with one entry rather than falling back to `POST /{pageId}/photos`, so
  one code path serves 1 to 5 images. `sv91rOvu8Bec8sLc`'s own notes say an album needs at
  least two photos, but that is its Code node refusing to build one from fewer, not the
  Graph API refusing a one-entry `attached_media`, which is accepted and renders as an
  ordinary single-photo post. **Unverified against the live Page.** If a one-image publish
  is rejected, the fix is one extra branch on `image_count === 1` posting to `/photos` with
  the `media_fbid` instead; nothing else changes.
- **Slack unfurls a limited number of links per message.** The preview posts the copy, the
  image count, and every image URL on its own line, relying on Slack to unfurl each into a
  visible picture. Slack caps how many links it will unfurl in one message, so a 5-image
  post may show fewer than 5 previews (the count and the raw URLs are always there). If
  that proves annoying in practice, the fix is sv91's pattern: a per-image Slack message
  branched off `Get Photo URL`, which costs one more node.

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
  fabricated claims, or a peso figure. In practice this means a bad word or a price
  mention could slip through in a hashtag or the alt text without failing validation.
- **The price rule is a flat ban, not a context check (as of this revision).** Earlier,
  the rule tried to tell FishPin's own price apart from a legitimate comparison figure by
  reading the ~70 characters around a peso figure for context words. A review proved that
  approach both rejected legitimate copy AND let a wrong app price slip through disguised
  as a comparison (e.g. "Halagang P999 lang, at wala nang bayad kada buwan" used to pass
  because "kada buwan" read as a comparison label). The owner decided the ads should never
  mention price at all, on either side of a comparison, and should lead with the problem
  instead — which removes the context-sniffing entirely: any peso figure detected in
  `headline`/`subhead`/`caption`/`cta` is now a rejection, full stop, with a reason that
  never echoes the offending figure back into the regeneration prompt.
- **The requested aspect ratio is observed, not enforced.** Spec §16 asked whether
  `generationConfig.imageConfig.aspectRatio` is actually honoured by
  `gemini-2.5-flash-image`. `validateImage` now reads the real dimensions out of the
  returned bytes, compares them against the requested ratio, and carries
  `aspect` / `aspectRequested` / `aspectMatches` forward; `Log Attempt` writes the
  observed value into the `Attempts` tab's `aspect` column, flagged
  `4:5 (requested 1:1, MISMATCH)` when they disagree. Per spec §7 a mismatch is **not** a
  rejection — the run continues and the post can still be approved and published.

  **Answered 2026-09-11 by the first two live runs** (executions 2965 and 2966, rows FP-001
  and FP-002): `gemini-2.5-flash-image` returned **896 x 1152 (7:9)** on both, against a
  requested `4:5`. The ratio is a hint, not a contract. The gap is small — 0.778 vs 0.800,
  both portrait, and Facebook accepts it without re-cropping — so no change was made. The
  `aspect` column will read `7:9 (requested 4:5, MISMATCH)` on standard posts; that is
  expected, not a fault. Revisit only if a fish-fact post (requested `1:1`) also returns
  portrait, which would crop badly in-feed.

---

## Pre-first-live-post checklist

Run this once, in order, before letting the schedule trigger post to the real Page:

1. Confirm `[Ops] Error Handler -> Slack` (`660Xkpo164VSNTDZ`) is **active** in n8n — it
   is the fleet-wide error workflow both `settings.errorWorkflow` entries point at, and
   it currently needs to be manually activated per instance.
2. Confirm the Sheet is shared with the service account and both tabs (`Queue`,
   `Attempts`) exist with their exact header rows in row 1 — note `Attempts` is now 10
   columns (`A:J`), with `aspect` as column J.
3. Replace `Config.loopSecret` with a real random string (see "Loop secret" above). The
   regeneration loop refuses every call until you do.
4. Confirm both workflows show **Asia/Manila** as their timezone in n8n's workflow
   settings, and that the Schedule Trigger previews the next run at 09:00 *Manila*
   time, not UTC.
5. Confirm the Slack bot is present in the review channel and that a `sendAndWait` form
   actually renders there and comes back (post a throwaway test message with the same
   credential if unsure).
6. Confirm the review prompt renders as **two buttons in the channel** (Approve /
   Disapprove), not as a link to a form in a browser tab.
7. Click **Decline** once and confirm: the loop re-enters the **same** queue row (not a new
   one), `attempt` increments in the Attempts log and in the next Slack preview, and the
   new draft has **both** different copy and different images.
8. **Confirm the timeout reading.** Temporarily set `Config.reviewTimeoutHours` to a
   fraction of an hour (e.g. `0.05`, three minutes), run one row, click nothing, and check
   that the row ends as `status = expired` with the "Review timed out" Slack message, and
   that `attempt` did **not** increment and no regeneration fired. This is the one
   behaviour in this build reasoned from n8n's resume semantics rather than observed (see
   Known limitations). Put `reviewTimeoutHours` back to 6 afterwards.
9. Decline three times in a row and confirm the run escalates on the **third** decline
   with "3 attempts rejected, needs a human" — there must never be an "attempt 4 of 3".
10. Queue a how-to or fish-guide row and confirm the copy model asks for **more than one**
    image, that all of them generate, and that the Slack preview states the count.
11. Check the images against the brand: the four palette colours dominate, the grade is
    consistent, and the **brand lockup is intact in the bottom-LEFT corner** — the mark
    reproduced unaltered, the wordmark reading exactly `FishPin` (one word, capital F and
    capital P), the website reading exactly `www.fishpin.app` underneath it in a smaller
    size, and the whole lockup small enough not to compete with the headline. If the mark is
    redrawn, or either string is misspelled, stop and read the lockup note in Known
    limitations.
11b. Read the caption out loud. It must sound like one fisherman talking to another (particles
    like `na`, `lang`, `kasi`, `yung`, short sentences, an opening question or fragment), not
    like translated marketing.
11c. **Check the shape of the Slack preview, because it is byte-for-byte what will be
    posted.** It must read: 2 to 4 short paragraphs with a blank line between them and the
    shortest one first, then a blank line, then the call to action ONCE, then a blank line,
    then `www.fishpin.app` and the `com.fishpin.app` Play Store url on consecutive lines,
    then a blank line, then the hashtags. If the call to action appears twice, or a link or a
    hashtag shows up inside the prose, something has reintroduced message assembly outside
    `buildPostMessage` — that combination is exactly the defect this build fixed on
    2026-09-11. A caption that breaks any of those rules never reaches Slack in the first
    place: `Validate Copy` rejects it and the machine retry regenerates.
12. Run one end-to-end run that gets **approved** against the real FishPin Page, and check
    the post on the Page itself: it must be ONE post carrying all the images, headline
    legible on the first, and the post text must match the Slack preview character for
    character — paragraphs intact, the CTA once, both links, hashtags last, no placeholder
    text. Then check the
    `Attempts` tab's `aspect` column and note whether the model honoured the requested
    ratio (see Known limitations), and that `image_url` holds every url joined by ` | `.
13. Run the Insights workflow (`fishpin-insights.workflow.json`) manually against that
    post after 24 hours have passed, and confirm `likes`/`comments`/`shares`/`reach` land
    correctly on the Queue row **and** that the Slack digest shows real numbers rather
    than a blank line.

## Adapting for a real client (the swap-in points)

- **Product facts:** replace `PRODUCT`, `AUDIENCE`, `BANNED_WORDS`, `COMPETITORS`, and
  `PILLARS` in `lib/brand.js` with the client's own brand bible — this is the single
  source of truth for both the system prompt and the price/claim rules the validator
  enforces.
- **Content pillars:** the 7-pillar rotation is a FishPin-specific structure; a different
  client may want 4 pillars or 10 — edit `PILLARS` and reseed the Queue tab.
- **Look:** `PALETTE`, `STYLE_SUFFIX` and `logoInstruction` in `lib/image-rules.js` are
  the whole visual identity — swap the four hexes and the personality words for the
  client's brand, drop their logo in at `assets/logo.png`, and rebuild. `NEGATIVES` is
  the do-not-generate list and is worth rereading per client.
- **Images per post:** the 1-to-5 range lives in two places that must agree — the
  HOW MANY IMAGES guidance in `buildSystemPrompt` and the count rule in `validateCopy`
  (plus the hard `.slice(0, 5)` in `promptsOf`). A client on a tighter image budget can be
  capped to 1 or 2 by editing those three.
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
