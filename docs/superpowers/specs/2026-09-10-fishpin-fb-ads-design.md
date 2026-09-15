# FishPin Facebook Ad Engine — Design Spec

**Date:** 2026-09-10
**Owner:** Robert
**Build slot:** `n8n-control/builds/06-fishpin-fb-ads/
  build.js                  assembles fishpin-fb-ads.workflow.json (+ base64s the logo in)
  build-insights.js         assembles fishpin-insights.workflow.json
  lib/                      pure, dependency-free, no n8n globals, guarded module.exports
    brand.js                brand bible, prompt builders, COPY_SCHEMA (image_prompts 1..5)
    copy-rules.js           validateCopy: every deterministic copy rule
    image-rules.js          PALETTE / STYLE_SUFFIX / LOGO_INSTRUCTION / promptsOf /
                            buildImagePrompt (per image) / validateImage
    flow-rules.js           normalizeDecision, routeApproval, DECLINE_NOTE, loopGuard
    sheet-rules.js          QUEUE_HEADERS, ATTEMPT_HEADERS, row selection + shaping
  nodes/                    thin n8n glue; build.js inlines a lib ahead of each
    load-queue.js           fetch next ready row, or a specific row on re-entry
    build-copy-prompt.js    the Gemini copy request
    validate-copy.js        parse + run every copy rule
    reuse-copy.js           the dormant keep-the-copy branch
    build-image-prompt.js   FAN-OUT: one Gemini image request per image_prompt
    validate-image.js       bytes, MIME, dimensions; ALL-OR-NOTHING across the set
    collect-photos.js       JOIN: N uploads -> one album (attached_media, urls, ok)
    log-attempt.js          the Attempts row
    route-decision.js       approve / decline / timeout via routeApproval
    loop-guard.js           attempt + copy_retry budgets, re-invoke payload
    map-writeback.js        Queue row shaping after publish
    select-due.js           insights: which posted rows are due for metrics
    map-metrics.js          insights: Graph responses -> row columns
  assets/
    BRAND.md                the FishPin palette + personality (source of STYLE_SUFFIX)
    logo.png                the real logo, inlined into the image request at build time
  fishpin-fb-ads.workflow.json      generated, 45 nodes, do not hand-edit
  fishpin-insights.workflow.json    generated, 11 nodes, do not hand-edit
  queue-seed.csv            10 starter rows covering all 7 pillars
  README.md
  test.js                   802 offline checks + the --live Gemini copy test
```
Schedule Trigger (09:00 daily, Asia/Manila)                 |
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
        Build Image Prompt   FAN-OUT, one item per image_prompt (1 to 5)  [REVISED 2026-09-11]
                             logo PNG inline + bottom-left brand lockup +
                             scene + brand colour grade +
                             negatives; EXACT headline on image 1 only
                             |
        Generate Image       gemini-2.5-flash-image, one call per image  [retry 2, continue]
                             |
        Validate Image  --ANY image fails--> Slack fail + status=failed, STOP
             |                               (all-or-nothing: never a partial album)
        Upload Photo (published=false) x N  --> media_fbid each
        Get Photo URL (?fields=images) x N  --> public CDN url each
             |
        Collect Photos       JOIN, N -> 1: attached_media, urls, all-or-nothing ok flag
             |
        Log Attempt  (Sheets -> Attempts tab; urls joined into the one image_url cell)
             |
        Slack Review  sendAndWait / approvalType double, 6h timeout   [REVISED 2026-09-11]
                     two native buttons in-channel: Approve | Decline
             |
        Route Decision
             |-- approve --> Publish Post (/feed + attached_media[1..5] + message)
             |                   --> Write Back (Queue row) --> Slack success
             |-- timeout --> status=expired + Slack, no post, NO attempt consumed
             \-- decline --> 'both': new copy AND new images
                             Loop Guard --> re-invoke webhook (attempt+1) or needs_manual
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
writes `status = in_review`. Without this, the next day's 09:00 run would pick up a row
that is still sitting in an unanswered Slack review. Terminal statuses (`posted`,
`measured`, `needs_manual`, `expired`, `failed`, `blocked_needs_asset`) are never
re-selected; only a human returning a row to `ready` puts it back in rotation.
| `caption` | workflow | the approved caption as published |
| `image_url` | workflow | FB CDN URL of the approved creative |
| `fb_post_id` | workflow | from the publish response |
| `posted_at` | workflow | ISO 8601 |
| `likes` `comments` `shares` `reach` | workflow B | backfilled at 24h |

### Tab `Attempts`

`ts`, `row_id`, `attempt`, `pillar`, `headline`, `caption`, `image_url`, `decision`,
`revision_note`, `aspect`

**REVISED 2026-09-11:** still one `image_url` column after the 1-to-5 album change. A
post's image urls share that cell, joined by ` | `, so the number of entries is also the
image count and neither `ATTEMPT_HEADERS`, the sheet, nor `queue-seed.csv` had to change.

Every attempt is logged, approved or not. Over a month this is the record of what keeps
getting rejected, which is the fastest way to improve the copy system prompt.

---

## 5. Copy generation

### System prompt

Sections 1 to 4 of the source prompt (product facts, audience, brand voice, content
pillars) are embedded verbatim in `lib/brand.js`. That file is the single source
of truth for brand voice; it is a real `.js` file so it is diffable and reviewable.

**REVISED 2026-09-11 (owner) — the voice is one Filipino talking to a local Filipino.**
The first live runs came back as correct but slightly translated-sounding Taglish. The
BRAND VOICE section now asks for the way people actually speak in a coastal barangay: the
natural particles (`na`, `pa`, `lang`, `po`, `kasi`, `talaga`, `yung`, `ganun`), the everyday
word over the formal one (`bangka` not `sasakyang-dagat`, `laot` not `karagatan`, `huli` not
`nahuling isda`), short sentences, an opening fragment or direct question, and `po`/`kayo`
kept for respect without stiffness. It closes with four **stiff/natural rewrite pairs**,
because a model follows examples far more reliably than adjectives. Every earlier rule
(Taglish with Tagalog carrying the sentence, the English words fishermen say out loud, max
3 emoji, no all-caps run, no em dash, no banned words, no price figure, problem-first hook)
is unchanged.

**REVISED 2026-09-11 (owner) — every caption carries both links.** ~~The caption must end
with `www.fishpin.app` and the Play Store listing, after the CTA, each on its own line.~~
**SUPERSEDED the same day by the caption-format revision below.** What survives from it is
that both urls come from the Config node (`websiteUrl`, `playStoreUrl`), and that the Play
Store package id was **corrected** here: Config carried `id=app.fishpin`, which is not the
app; the real listing is `id=com.fishpin.app`.

**REVISED 2026-09-11 (owner, after the first live post) — the caption is PROSE ONLY and the
post is assembled in code.** The first published post read as one unbroken ~110-word block,
then the CTA, then the links, then the CTA **again**, then the hashtags. Two defects: the
system prompt told the model to end the caption with the CTA and both links while
`Publish Post` independently appended the CTA and the hashtags (a duplicate CTA in every
post), and nothing asked for paragraphs (an unscannable wall on a phone).

The fix makes the published post deterministic instead of model-formatted:

- **`caption` is body text only.** `buildSystemPrompt()` now instructs that the caption must
  contain no CTA, no url and no hashtag, and states that all three are appended
  automatically afterwards. It takes **no urls at all** — a url named in the prompt is a url
  the model can copy into the prose — while every voice rule (spoken Filipino, Taglish,
  problem-first hook, no price figure, no em dash, no banned words, max 3 emoji) is
  unchanged.
- **Shape:** 2 to 4 paragraphs separated by a blank line, each 1 to 3 sentences, the first
  paragraph the hook and the shortest (Facebook truncates after a few lines behind
  "See more"). The prompt carries a short delimited `CAPTION_EXAMPLE` so the model copies a
  shape rather than a description of one.
- **Word band back to 80 to 150** words of prose: the two urls no longer live in the
  caption, so the +2 allowance for them is gone.
- **`buildPostMessage(copy, cfg)` in `lib/copy-rules.js` is the ONE place a post is
  assembled**, in exactly this order: `caption`, blank line, `cta`, blank line, `websiteUrl`
  and `playStoreUrl` on consecutive lines, blank line, hashtags joined by a space.
  `Collect Photos` — the single-item join that both `Publish Post` and `Post Preview` read
  from — calls it once and puts the result on `message`; `Publish Post` sends
  `$json.message` and the Slack preview shows the same field, so the reviewer approves
  character-for-character what is published. Neither node builds a message string of its
  own any more; that duplication is how the two drifted apart.

**REVISED 2026-09-11 (owner) — never repeat a topic exactly.** `Pick Row` collects the
`topic` and published `caption` of every Queue row whose status is `posted` or `measured`
and carries them forward as `prior_posts`. `buildUserPrompt` lists the most recent 15
(`PRIOR_POSTS_LIMIT`, so the prompt cannot grow with the sheet) under "ALREADY PUBLISHED"
and instructs the model that it may cover a similar subject but must take a different
angle, must not reuse a hook, and must not repeat sentences. See §6 rule 10 for the
matching validator rule.

Temperature 0.8. On a regeneration, `revision_note` is injected:

> Your previous attempt was rejected for this reason: {revision_note}. Write a different
> angle. Do not repeat the rejected headline.

### Response schema (enforced by Gemini, not parsed hopefully)

```
headline      STRING  max 7 words, Taglish, rendered into the FIRST image
subhead       STRING  max 12 words, optional
caption       STRING  80 to 150 words of PROSE ONLY, 2 to 4 paragraphs (blank-line
                      separated), 1 to 3 sentences each. No cta, no url, no hashtags:
                      buildPostMessage appends those. REVISED 2026-09-11.
cta           STRING  one short line
hashtags      ARRAY of STRING, 3 to 5
image_prompts ARRAY of STRING, 1 to 5   <- REVISED 2026-09-11, was one image_prompt
alt_text      STRING
```

**REVISED 2026-09-11 — the model chooses the image count.** `image_prompt` (one string)
became `image_prompts` (an array of 1 to 5), because the right number of pictures is a
property of the topic, not of the pipeline: a feature spotlight lands in one frame, while a
tip/how-to wants one image per step and a fish-guide post wants the species from several
angles. The system prompt states the budget and how to spend it (1 for a single idea, 2 for
a before/after or the cost-comparison pillar, 3 to 5 for a how-to or fish guide), and
requires the set to tell ONE story in order rather than being variations of one frame.

The 1-to-5 bound is enforced deterministically in `validateCopy`, not in the responseSchema,
for the same reason `hashtags`' 3-to-5 bound is: the schema is kept to types only so an
unrecognised schema keyword can never 400 the whole generation. A count outside the range,
or any blank entry, is a copy-validation rejection with its own reason string and goes down
the existing machine-retry path.

### Hard product facts injected

Live features only, per section 1 of the source prompt. Price is **PHP 499, one-time,
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
5. `caption` outside **80 to 150** words (`CAPTION_MIN_WORDS` / `CAPTION_MAX_WORDS` in
   `lib/copy-rules.js`). REVISED 2026-09-11: the ceiling was 152 while the two links lived
   inside the caption and counted as one word each; with the links appended by
   `buildPostMessage` the band is simply the prose band the prompt asks for, and
   `CAPTION_PROSE_MAX_WORDS` is gone as a distinct concept.
6. More than 3 emoji in the caption.
7. All-caps run longer than one word.
8. Compliance breach: a rescue guarantee ("hindi ka mamamatay", "will save your life"),
   a fish-safety absolute (must read "generally considered safe to eat", not "safe to eat"),
   a named competitor brand, a fabricated review or user count, or any peso figure at all
   (never FishPin's own price, never a comparison figure — see §6a).

9. **The caption is not prose only** (revised 2026-09-11, replacing "the caption is missing
   either required link"). Rejected if the caption contains a link (`http`, `www.`, or
   either configured url), a `#hashtag`, or the CTA string (normalised for case and
   whitespace). All three are appended by `buildPostMessage`, so writing them into the
   caption publishes them **twice** — the duplicate CTA observed on the first live post.

9a. **The caption is the wrong shape** (added 2026-09-11). Rejected if it is not 2 to 4
   paragraphs separated by a blank line, or if any paragraph runs past 3 sentences.
   `captionParagraphs` treats one or more blank lines (LF or CRLF) as the break and drops
   leading/trailing blanks; `sentenceCount` splits on `.`, `!`, `?` and the ellipsis. Both
   are exported, so the prompt's own worked example is checked against them in the suite.

9b. **The ASSEMBLED MESSAGE is missing either required link** (revised 2026-09-11 — the old
   rule 9, moved rather than deleted; a post with no links gives the reader no way to act).
   The check runs against `buildPostMessage(copy, opts)`, or against an already-composed
   `opts.message` when the caller supplies one, and it is what catches a regression in the
   composer itself. The urls still arrive through `opts`, never hardcoded in the lib,
   exactly as `bannedWords` and `competitors` do — so a caller that supplies neither simply
   does not get the check.
10. **The caption or headline is an EXACT repeat of an already-published post** (added
   2026-09-11). Compared against `opts.priorPosts` (from `Pick Row`) after normalising:
   trim, collapse whitespace, lowercase. **Exact match only** — deliberately no fuzzy
   similarity scoring: it is deterministic, it is what the owner asked for, and it cannot
   reject a legitimate second post about the same feature. Near-duplicates are therefore
   allowed by design; the prompt's different-angle instruction and the human approval gate
   are what separate those. The Queue tab has no `headline` column, so for published rows
   the caption is what is actually compared; the headline check fires only when a prior
   headline is supplied.

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

- One of the model's own `image_prompts` entries (scene, composition, negative space) per
  image — REVISED 2026-09-11, was a single `image_prompt`.
- The exact headline text, with strict rendering instructions: reproduce this text
  character for character, correct spelling, one line, bold sans-serif, placed in the
  reserved negative space.
- Style suffix, appended to every prompt. **REVISED 2026-09-11.** It used to read
  `photographic, natural Philippine coastal light, documentary style, deep navy and warm
  gold palette, single clear subject, generous negative space in the upper third`. The
  owner's verdict on the first live images was "the generated image doesnt have a branded
  feels in our venture": "deep navy and warm gold" is a mood, and the model was free to read
  it as any blue and any yellow, so nothing tied the output to FishPin. It is now a
  deliberate colour grade naming the real brand colours by name AND hex, from the app's own
  brand spec (staged at `assets/BRAND.md`): Persian Blue `#0A2461` as the dominant dark,
  Accent Blue `#147DFF` as the one saturated blue, Amber `#FFC857` as the single warm
  accent, Off White `#EEF4FB` as the light end, plus an explicit "no other hue competes with
  these four" instruction and the brand personality words (reliable, calm, resilient,
  observant, local, steady). The documentary photography of Filipino fishermen and bangkas
  is unchanged — this grades that photography, it does not replace it with an illustration.
- **The real logo, composited as a bottom-left LOCKUP (REVISED 2026-09-11, owner).**
  `assets/logo.png` (7.5 KB) is base64'd into the Build Image Prompt Code node by
  `build.js` at build time and sent to Gemini as an `inline_data` part ahead of the text
  part — the request shape proven in `builds/brand-photoshoot-variations`. That mechanism is
  unchanged; what is asked for changed. `logoInstruction(websiteUrl)` (was the constant
  `LOGO_INSTRUCTION`) now asks for the mark in the **bottom LEFT** corner as part of a
  lockup: the attached mark reproduced pixel for pixel and unaltered, then the wordmark
  `FishPin` as newly drawn text in a clean bold sans-serif at the same optical height,
  then `Config.websiteUrl` directly beneath it at roughly half the wordmark's height. The
  whole lockup must stay small and unobtrusive, a signature and not a banner, and must not
  compete with the headline. It is on **every** image of an album, not just the cover, so
  the "images 2..N render no text" rule became "no text **except** the lockup".

  This composition mirrors the web app's own `fishpin-web/components/ui/Logo.tsx` (icon,
  then "Fish" medium + "Pin" extra-bold on one line). **There is no wordmark asset on
  disk** — that component composes icon + live text in code — so the model must draw the
  wordmark and the url itself. It has already rendered a flawless Tagalog headline into
  these images, so this is the same job, and a one-word Latin-script wordmark is an easier
  one; but it is generation, not compositing, and a misspelled wordmark or url is a
  realistic outcome. The fallback, if live runs show it garbled, is to export a real lockup
  PNG (mark + wordmark + url) from the web app and use THAT as the reference image, which
  keeps this mechanism and removes the drawing entirely. The url is passed in from Config
  so it can never drift from the url the caption must carry.
  `NEGATIVES` previously contained a flat `no logo`, which directly contradicted this; it
  was replaced by `no watermark and no logo other than the supplied FishPin logo`, which is
  what that rule was always for. **Unverified against a live image call** — image models are
  unreliable at reproducing a specific mark, and the human approval gate is the backstop.
  See the README's Known limitations for the fallback.
- **Only image 1 renders the headline (REVISED 2026-09-11).** Repeating one rendered
  headline across five album frames reads as five drafts of one poster, and every extra
  rendered word is another chance to garble Tagalog. Images 2 to N are told to render no
  text at all.
- Negatives: no watermarks, no app UI, no extra fingers, no western yacht, no western
  fishing rods on a bangka, no exaggerated poverty imagery, no comedic or pitiful framing,
  no imagery that reads as a real distress event.

Each of the 1 to 5 images is its own `generateContent` call; `Build Image Prompt` is the
fan-out node and `Collect Photos` is the join. Aspect ratio is requested via
`generationConfig.imageConfig.aspectRatio` — `4:5` for
standard posts, `1:1` for fish-fact posts. `validate-image.js` reads back the actual
dimensions. If the model ignores the request, the build falls back to `1:1` for all posts
and this is recorded in the README as a known limitation. This must be verified during
implementation, not assumed.

`validate-image.js` also rejects: no image part in the response, decoded bytes under
20 KB, or a non-image MIME type. Any rejection alerts Slack, sets `status = failed`, and
stops. A post is never published without a verified image.

**REVISED 2026-09-11 — all-or-nothing across the set.** With 1 to 5 images, validation is
per-image but the verdict is for the whole post: if ANY image fails, `validate-image.js`
returns a single rejection item instead of the good ones, so the run takes the existing
failure branch and nothing is uploaded. A partial album is worse than no post — a how-to
missing step 3 is not the ad the reviewer was asked to approve. The same all-or-nothing rule
covers the public-URL lookup: `Collect Photos` checks every photo has both a `media_fbid`
and an `images[0].source` and reduces that to one flag, because the old per-item test of
`images[0].source` would have sent the good photos down the true branch and published a
partial album.

---

## 8. Approval loop

**REVISED 2026-09-11.** Slack node, `operation: sendAndWait`,
`approvalOptions.values.approvalType: 'double'`, timeout 6 hours. Two native buttons, in
the channel, no browser tab:

- **Approve** — publish the album to the Page.
- **Decline** — throw it away and regenerate BOTH the copy and the images for the same
  queue row (internally the `both` decision).

The original design was a `customForm` with a 4-option dropdown plus a free-text reason.
The owner wanted the decision made in Slack itself, which `customForm` cannot do. The three
consequences, each handled:

1. **The payload shape is `{data: {approved: true|false}}`.** `approved: true` maps to
   `approve`. `approved: false` is a DECLINE and maps to `both`. It previously mapped to
   `timeout`, which would have expired the row on a decline instead of regenerating it.
2. **Timeout must stay distinguishable from a decline**, because a timeout must consume no
   human attempt and trigger no regeneration. A `limitWaitTime` expiry resumes the execution
   without the node's webhook ever firing, so the node's output is still the input it passed
   through when it went to wait — carrying no `approved` key at all. `routeApproval` encodes
   exactly that: an `approved` boolean present means a human clicked and its value says
   which button; none present means nobody did, which is a timeout. Anything else
   unrecognisable is also read as a timeout rather than as a rejection, deliberately —
   `expired` alerts Slack and stops without publishing and without burning an attempt, which
   is the safe reading of "no decision was recorded". `normalizeDecision` still returns
   `unknown` for that case so the distinction stays available. **This is reasoned from n8n's
   resume semantics, not yet observed on a live expiry**; the README checklist has a
   three-minute-timeout step that confirms it.
3. **The free-text reason is gone**, so `extractReason` returns `''` on every decline. An
   empty `revision_note` reaches `brand.js` as no revision block at all, i.e. the
   regeneration would be given no steer and could hand back the same draft. `loopGuard` now
   falls back to a fixed `DECLINE_NOTE` on a reasonless human rejection: the reviewer
   rejected it, take a different angle, different hook, different problem to lead with,
   different image concept, and do not reuse the previous headline or image concept. A typed
   reason (still possible from the copy-validation retry path) always wins over it.

`normalizeDecision`'s `copy` and `image` decisions are deliberately kept: `image` is what
`Pick Row`'s `keep_copy` branch tests for, and `copy_invalid` shares `loopGuard`'s rejection
path. The keep-the-copy branch (below) is therefore **dormant rather than deleted** — a
reviewer can no longer select it, but it still works when the loop webhook is called by hand
with `decision: "image"`, and it stays covered by tests.

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

Branch targets (the internal decision values; only `both` is reachable from the two-button
gate as of 2026-09-11):
- `copy` — re-enter at Build Copy Prompt with `revision_note` injected.
- `image` — re-enter keeping the approved caption and the approved `image_prompts`,
  appending `revision_note` to every image prompt, skipping copy generation. Dormant: only
  reachable by calling the loop webhook by hand.
- `both` — re-enter at Build Copy Prompt. **This is what Decline produces.**

**Loop guard:** at `attempt` 3, stop (there is never an "attempt 4 of 3"). Set
`status = needs_manual`, post to Slack "3 attempts rejected, needs a human. Row id {id}".
No further re-invocation.

**Timeout:** on a 6h no-response, set `status = expired`, alert Slack, do not post, and do
not increment `attempt` — a timeout is not a rejection and must not spend the reviewer's
budget.

---

## 9. Publishing

1. `POST /{graphVersion}/{pageId}/photos` with `published=false` and the image binary,
   during the preview step. Returns `media_fbid`.
2. On approval, `POST /{graphVersion}/{pageId}/feed` with `message = $json.message` — the
   string `Collect Photos` composed with `buildPostMessage` and `Route Decision` carried
   through, identical to what the Slack preview showed (**REVISED 2026-09-11**; this step
   used to build `caption + "\n\n" + cta + "\n\n" + hashtags.join(" ")` itself while the
   prompt ALSO asked the model to end the caption with the cta and both links, which is why
   the first real post carried the cta twice) — and
   `attached_media = [{"media_fbid": "..."}, ...]` — **REVISED 2026-09-11**, 1 to 5 entries,
   built by `Collect Photos` and carried through `Route Decision`. One `/feed` call publishes
   the whole album. A single-image post takes the same path with a one-entry array;
   `sv91rOvu8Bec8sLc`'s "an album needs >= 2 photos" note is its own Code node refusing to
   build one from fewer, not the Graph API refusing a one-entry `attached_media`. Unverified
   against the live Page — if it is refused, the fallback is one extra branch on
   `image_count === 1` posting to `/photos`.
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

Slack channels are Config values. `reviewChannel` and `opsChannel` (and the insights
workflow's `opsChannel`) all point at the dedicated FishPin ads channel `C0C1WS8PAAJ`,
moved off the shared `#chatbot-automation` (`C0BDSV5RB5G`) on 2026-09-15. The bot must be
a member of that channel or every Slack node fails with `not_in_channel`.

`sendAndWait` requires n8n's `WEBHOOK_URL` to be publicly reachable. It is
(`https://n8n.srv1193790.hstgr.cloud`), and the existing FB workflow already relies on it.

### Config node keys

`pageId`, `graphVersion`, `sheetId`, `queueTab`, `attemptsTab`, `copyModel`,
`imageModel`, `copyTemperature`, `maxAttempts`, `reviewTimeoutHours`, `reviewChannel`,
`opsChannel`, `websiteUrl`, `playStoreUrl`, `selfWebhookUrl`, `insightsDelayHours`.
(`websiteUrl` added 2026-09-11; `playStoreUrl` corrected the same day from the wrong
package id `app.fishpin` to `com.fishpin.app`. REVISED 2026-09-11: both are **appended to
every post** by `buildPostMessage` rather than written into the caption by the model, so
they are read by three places — `Collect Photos` (the composer), the validator's
assembled-message check, and the image prompt's lockup — and all three read Config. The
copy prompt no longer receives them at all.)
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
- Route decision maps approve / decline / timeout to the right branch, and the internal
  copy / image / both values too. A decline is not a timeout and a timeout is not a
  decline; a timeout consumes no attempt.
- A reasonless decline still produces a non-empty `revision_note`.
- `validateCopy` accepts 1, 3 and 5 image prompts and rejects 0, 6, a blank entry and a
  non-array.
- The image prompt names every brand colour by name and hex, keeps the negatives, renders
  the headline into image 1 only, and attaches the logo as an inline reference image.
- The image prompt asks for the lockup bottom LEFT (never bottom right), with the wordmark
  and `Config.websiteUrl` beneath it, on every image of the set; and the url in it comes
  from Config, proven by rebuilding the prompt with a different Config value.
- The system prompt carries the spoken-Filipino voice rules and at least two stiff/natural
  rewrite pairs, and still carries every earlier rule (Taglish, em dash, caps, emoji, banned
  words, problem-first).
- `validateCopy` accepts 80 to 150 words of prose and rejects 79 and 151, and rejects an
  exact repeat of a published caption or headline while allowing a near-duplicate.
- **Caption format (added 2026-09-11):** `validateCopy` rejects a caption containing a link,
  a hashtag or the CTA; rejects 1 and 5 paragraphs and accepts 2, 3 and 4; treats a blank
  line (LF or CRLF) as the only paragraph break and a single newline as none; rejects a
  4-sentence paragraph and accepts a 3-sentence one.
- **`buildPostMessage`:** asserts the exact assembled string (caption / blank / cta / blank /
  both urls on consecutive lines / blank / hashtags), that the CTA appears exactly once, that
  a missing block leaves no double blank line and no trailing newline, and that it survives a
  null copy and cfg. Structurally: `buildPostMessage(copy, {` appears exactly once in the
  whole built workflow, `Publish Post` sends `$json.message` and builds no string of its own,
  and `Post Preview` shows that same field.
- The prompt's own `CAPTION_EXAMPLE` is extracted back out of the generated system prompt and
  checked against the real `captionParagraphs` / `sentenceCount` — the example the model
  copies must itself obey the rules stated above it.
- Behavioural: `Pick Row` collects `prior_posts` from posted AND measured rows, never from
  ready/in_review/blocked rows, never lists the current row, and caps the list at 15 most
  recent.
- Behavioural, against the real assembled Code-node bodies: Build Image Prompt emits one
  DISTINCT item per image prompt; Validate Image sinks the whole set if any image fails;
  Collect Photos builds `attached_media` in order and refuses a partial album.
- Structural: no `$('Node').first()` on any of the four fan-out nodes.
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
2. ~~Confirm the Slack `sendAndWait` `customForm` response shape (field naming) against the
   installed n8n version before wiring `route-decision.js`.~~ Moot: the gate is
   `approvalType: 'double'` as of 2026-09-11, whose shape is the documented
   `{data:{approved:bool}}`. Superseded by item 4 below.
3. Confirm which Meta permissions work in Development mode for a Page admin versus which
   need App Review, and record it in the README.

**Added 2026-09-11, carried into the first live runs after the rework:**

4. Confirm on a real (shortened) expiry that a `limitWaitTime` timeout really does emit no
   `approved` key, i.e. that `routeApproval` reads it as `timeout` and not as a decline
   (§8 item 2). This is the highest-value unverified assumption in the build.
5. Confirm `POST /{pageId}/feed` accepts a one-entry `attached_media` (§9).
6. Confirm `gemini-2.5-flash-image` composites the supplied logo rather than redrawing it,
   **and** that it spells the drawn wordmark `FishPin` and the drawn url `www.fishpin.app`
   correctly underneath it, bottom left, small (§7). If the mark is redrawn or either
   string is garbled, the first fallback is a real lockup PNG as the reference image
   (mark + wordmark + url exported from `fishpin-web`), which changes no mechanism; only if
   even that is redrawn is a deterministic compositing step needed (a scope change, §1
   ruled out an overlay step).
