# FishPin Video Ads → Slack — Design Spec

**Date:** 2026-09-15
**Owner:** Robert
**Build slot:** `n8n-control/builds/07-fishpin-video-ads/`
**Status:** approved in brainstorming, pending owner review of this document
**Sibling build:** `n8n-control/builds/06-fishpin-fb-ads/` (image albums, live, 882 checks)

---

## 1. Goal

A manually-triggered n8n pipeline that turns a one-line topic into a ~22–25 second vertical
FishPin video ad and posts the finished MP4 to Slack, with a ready-to-paste Facebook caption and
hashtags. The owner reviews it, re-edits it if needed, and uploads it to Facebook by hand.

**Scope change (2026-09-15, owner):** the workflow does not publish to Facebook and has no
approval step or regenerate loop. One run makes one video. Another version = another run.

### Owner decisions (brainstorming, 2026-09-15)

| Decision | Choice |
|---|---|
| Budget | ~$1 per video. Animated images + ONE real AI video clip for the hook |
| Cadence | Manual only. No schedule |
| Topic input | Trigger page with one text box. Blank = the AI picks a fresh angle |
| Sound | Spoken Filipino voiceover, "local fisherman" voice |
| Editing | Extend the existing VPS render service (approach A) |
| Delivery | Slack `C0C1WS8PAAJ` only: the MP4 to download plus a ready-to-paste caption and hashtags. No buttons |
| Log | One row per video in the `Videos` tab (topic, hook, voiceover, cost, Slack link); also feeds "do not repeat" |

### Non-goals (v1)

- No Facebook or Instagram publishing, no approval gate, no regenerate loop. The owner uploads manually.
- No schedule, no queue rows. Manual trigger only.
- No paid Meta ad campaigns.
- No behaviour changes to the image-album workflow (`UdSI0tFfYVuakPrK`). The one permitted edit
  to `builds/06-fishpin-fb-ads/lib/copy-rules.js` is an **extract-and-export refactor**: the prose
  rule checks (§4.2) are currently written inline inside `validateCopy` (verified — only
  `wordCount`, `captionParagraphs`, `sentenceCount`, `normalizeForRepeat`, `buildPostMessage` and
  `validateCopy` exist as named functions). They move into named exported helpers that
  `validateCopy` then calls, with `validateCopy`'s results unchanged and build 06's full test suite
  still passing. Two fixes
  discovered here are recorded in §12 as follow-ups for that workflow.

---

## 2. Research facts this design rests on

| Fact | Value | Source |
|---|---|---|
| Ad length that performs | 6–15s for ads; Reels sweet spot under 30s; hook decided in the first 3s; hook rate 30%+ is top-performing | Hootsuite, QuickFrame, AdStellar 2026 spec guides |
| Silent viewing | ~85% of Facebook video plays silent; captions lift view time | same |
| Reels file spec (the MP4 is made upload-ready) | 3–90s, 9:16, 1080×1920 recommended, 24–60fps, H.264/H.265, AAC-LC 48kHz stereo 128k+, closed GOP 2–5s | Meta "Publish a Reel" guide |
| Veo 3.1 pricing (1080p, audio included, no free tier) | Lite `veo-3.1-lite-generate-preview` $0.08/s · Fast $0.12/s · Standard $0.40/s | ai.google.dev pricing |
| Veo 3.1 API | `…/models/{model}:predictLongRunning`; `parameters.aspectRatio "9:16"`, `resolution "1080p"`, `durationSeconds "4"/"6"/"8"`; image-to-video via `instances[0].image.inlineData`; image input requires `personGeneration "allow_adult"`; poll the operation until `done`; video at `response.generateVideoResponse.generatedSamples[0].video.uri`, downloaded with `x-goog-api-key`; kept 2 days; audio cannot be disabled; latency 11s–6min | ai.google.dev Veo guide |
| Gemini Omni Flash | ~$0.10/s at 720p, 1080p is upscaled — not cheaper than Veo Lite | therundown.ai, eesel.ai |
| Gemini TTS | Filipino (`fil`) supported; models `gemini-3.1-flash-tts-preview`, `gemini-2.5-flash-preview-tts`; output 24kHz mono 16-bit PCM; tone/pace steerable by natural-language prompt | ai.google.dev speech generation |
| Slack file delivery from n8n | `files.getUploadURLExternal` → POST bytes → `files.completeUploadExternal` (no `channel_id`) → wait ~5s → `chat.postMessage`. Sharing via `channel_id` can return `ok:true` and never appear | proven in workflow `xmBD3loDGu09i4Sf` |
| VPS render service | Up (`/health` 200). systemd `reel-render`, `/opt/reel-render/render.py`, venv with faster-whisper `base.en` (English only). Reachable from the public internet on port 8088 with no auth | live probe + memory |

---

## 3. The ad (creative specification)

**Format:** Facebook Reel, 1080×1920, 30fps. Target 22–25s, hard bounds 18–30s.

**Structure:** problem → stakes → real demo → relief → call to action.

| Time | Beat | Visual | Rule |
|---|---|---|---|
| 0–3s | Hook | The Veo clip, animated from a branded still | Motion and caption from frame 1. No logo intro |
| 3–8s | Stakes | 2 AI images, fast cuts | Concrete fear: the lost spot, the waiting family |
| 8–16s | Real demo | 1–2 genuine app screens with gentle zoom | Never an AI-drawn app UI |
| 16–21s | Relief | 1 AI image | Emotional payoff |
| last ~3.5s | CTA end card | Rendered by code | Lockup + "I-download sa Play Store" + www.fishpin.app on Persian Blue `#0A2461` |

**Voiceover:** 45–70 words of spoken Filipino (target ~60 ≈ 24s), calm and trustworthy, "a kuya
on the pier talking to fellow fishermen". Voice rules are the build-06 `buildSystemPrompt`
voice rules (spoken barangay Filipino, `po`/`kayo`, problem-first, no price figure, no em dash,
no banned words, compliance rules).

**Captions:** word-by-word, Poppins, white with the active word in Amber `#FFC857`, black
outline, max 2 lines, centred vertically inside the middle 60% of the frame (clear of the Reels
UI, which covers the bottom ~20% and the right edge).

**Logo during the video:** small lockup top-left, from 1.0s until the end card. Never
bottom-left in a Reel — that is where Facebook overlays the Page name and caption.

**Audio:** voiceover on top; Veo's generated ambient sound at low volume under the hook only;
music bed from `/opt/reel-render/music` at low volume if a track exists (owner is responsible for
music licensing; no track = voice only).

### 3.1 Real app screen allowlist

Screens are fetched from the public website. The script may reference ONLY these ids.

| id | URL | Use for |
|---|---|---|
| `offline` | `https://www.fishpin.app/images/onboarding/onboarding1.png` | offline, no signal |
| `spots` | `https://www.fishpin.app/images/onboarding/onboarding2.png` | saving fishing spots |
| `path` | `https://www.fishpin.app/images/onboarding/onboarding3.png` | path recording, family safety |
| `navigate` | `https://www.fishpin.app/images/onboarding/onboarding4.png` | compass, distance, ETA |
| `dashboard` | `https://www.fishpin.app/images/features/features1.jpg` | weather, sea conditions, fishing score |
| `smarter` | `https://www.fishpin.app/images/onboarding/onboarding5.png` | closing, general |

**Excluded:** `onboarding6.png` (Sign In) contains placeholder "lorem ipsum dummy text" and the
tagline "Free, offline-first", which contradicts FishPin being a paid one-time purchase.

**No real screen exists** for SOS, the fish guide, AI fish scan, or the catch log. For those
topics the demo beat uses an AI image of the moment (a fisherman using his phone, screen not
visible) and never a drawn UI. Real screenshots from the owner can be added to the allowlist
later.

---

## 4. Architecture

New build `n8n-control/builds/07-fishpin-video-ads/`, same workflow-as-code pattern as build 06
(pure `lib/`, thin `nodes/` glue, `build.js` emits JSON, plain-assertion `test.js`).

**Shared brand source of truth:** `build.js` inlines `../06-fishpin-fb-ads/lib/brand.js` and
`../06-fishpin-fb-ads/lib/copy-rules.js` directly. Brand voice, compliance and banned words must
never be copied into build 07.

### 4.1 Flow

```
Trigger page POST /webhook/fishpin-video-ad (topic, shared secret)  ┐
Manual Trigger (n8n)                                                ┴─► Config
  → Load Videos history (Sheet tab "Videos") → append this run's row (status generating)
  → Write Script (Gemini gemini-2.5-flash, responseSchema)
  → Validate Script ──invalid──► retry (max 3) ──► needs_manual + Slack
  → [assets, all before any render]
       Voiceover  : Gemini TTS, fil, Config.ttsVoice  → PCM → WAV
       AI images  : gemini-2.5-flash-image, brand grade, NO lockup (renderer adds it)
       Hook still : gemini-2.5-flash-image, 9:16
       Hook clip  : Veo Lite image-to-video from the hook still
                    → poll every 15s, max 8 min → download (googlePalmApi credential)
                    → on failure/timeout: hook falls back to the still
       Screens    : allowlist URLs only
  → Render (POST http://172.18.0.1:8090/render-ad, header X-Render-Token) → MP4
  → Slack delivery in C0C1WS8PAAJ (external upload pattern): the MP4 + hook, topic, voiceover,
    scene list, ready-to-paste caption and hashtags, estimated cost
  → Sheet row delivered (script fields, Slack file link, cost)
```

### 4.2 Script contract (Gemini `responseSchema`, enforced by `validateScript`)

| Field | Rule |
|---|---|
| `pillar` | one of build 06's 7 pillars; `social proof` is rejected (never machine-generated) |
| `topic` | one line |
| `hook` | ≤ 8 words, spoken Filipino |
| `voiceover` | 45–70 words; must pass the **shared prose rule checks** extracted into exported helpers in build-06 `copy-rules.js` (§1) (no peso figure, no em dash, banned words, all-caps, emoji budget, compliance, forbidden claims, competitor names, fabricated counts). It is NOT run through `validateCopy` as a whole, whose 80–150 word band and 2–4 paragraph rules are specific to image captions |
| `scenes` | 5–6 items `{ beat, type, seconds, prompt?, screen? }` |
| `scenes[0]` | `beat = "hook"`, `type = "veo"`; exactly one `veo` scene in the whole list |
| `type = "screen"` | 1–2 total; `screen` ∈ allowlist ids |
| `type = "image"` | `prompt` required, no text or UI in the scene |
| planned total | sum of `seconds` 18–28 (end card excluded) |
| `description` | 20–60 words of prose, 1–2 short paragraphs, no links, no hashtags, no CTA line; same shared prose rule checks as `voiceover`. The ready-to-paste caption in Slack is composed by build-06 `buildPostMessage` (description + CTA + both links + hashtags) |
| `hashtags` | 3–5 |
| repeat check | exact normalised match of `hook` or `voiceover` against delivered `Videos` rows = rejection; the 15 most recent delivered hooks/topics are passed to the prompt as "do not repeat" |

### 4.3 Config keys

`sheetId` `1tdud2e5BKy7IQ7wpYy8Iavl_hOK8vUBrUs1oYj1Cp3E` · `videosTab` `Videos` ·
`deliveryChannel` / `opsChannel` `C0C1WS8PAAJ` · `scriptModel` `gemini-2.5-flash` ·
`scriptTemperature` `0.9` · `imageModel` `gemini-2.5-flash-image` ·
`veoModel` `veo-3.1-lite-generate-preview` · `veoSeconds` `6` · `veoResolution` `1080p` ·
`veoMaxWaitMinutes` `8` · `ttsModel` `gemini-3.1-flash-tts-preview` · `ttsVoice` `Gacrux`
(proven in this repo; §9 auditions `Algenib` and `Achird` against it) · `maxScriptRetries` `3` ·
`renderUrl` `http://172.18.0.1:8090/render-ad` · `websiteUrl` `www.fishpin.app` ·
`playStoreUrl` `https://play.google.com/store/apps/details?id=com.fishpin.app` ·
`endCardCta` `I-download sa Play Store` · `endCardSeconds` `3.5` ·
`postCta` `I-download ang FishPin sa Play Store.` ·
`renderToken` and `triggerSecret` injected from env at deploy time (`FISHPIN_RENDER_TOKEN`,
`FISHPIN_VIDEO_TRIGGER_SECRET`), placeholders in committed JSON, same mechanism as build 06's
`FISHPIN_LOOP_SECRET`.

### 4.4 Sheet tab `Videos`

Same spreadsheet as the image ads. Append once, then update by `_rowNumber` (never append to
change a row — the build-06 lesson).

`id, created_at, topic_input, pillar, topic, hook, voiceover, status, video_url, est_cost_usd`
(columns A–J; `video_url` is the Slack file permalink).

`status`: `generating` / `delivered` / `needs_manual` / `failed`.

---

## 5. Render service: `/render-ad`

`/render` and `/videos` behaviour is unchanged. New code shares existing helpers in the same
`render.py`.

### 5.1 Request

```json
{
  "width": 1080, "height": 1920, "fps": 30,
  "audio_b64": "<WAV>",
  "script": "<voiceover text>",
  "language": "tl",
  "scenes": [
    { "type": "video",  "b64": "<mp4>", "seconds": 3.0, "ambient": true },
    { "type": "image",  "b64": "<png>", "seconds": 2.5 },
    { "type": "screen", "url": "https://www.fishpin.app/images/onboarding/onboarding4.png", "seconds": 4.0 },
    { "type": "image",  "b64": "<png>", "seconds": 3.0 }
  ],
  "end_card": { "cta": "I-download sa Play Store", "url": "www.fishpin.app", "seconds": 3.5 }
}
```

Header `X-Render-Token` must equal the service's `RENDER_AD_TOKEN` (systemd `Environment=`), else
`401`. `screen` URLs must start with `https://www.fishpin.app/`, else `400`. Response: `video/mp4`
bytes; errors as JSON `{error}` with status 4xx/5xx.

### 5.2 Processing

1. Download-and-cache on first use to `/opt/reel-render/assets/`: `Poppins-Bold.ttf`,
   `Poppins-SemiBold.ttf` (google/fonts GitHub raw), logo mark
   `https://www.fishpin.app/favicon/apple-icon.png`.
2. Veo clip: scale/crop to 1080×1920, resample to 30fps, trim to its scene `seconds`, keep its
   audio at low volume for the hook only when `ambient`.
3. Scene durations: scale planned `seconds` so video length = voiceover length + 0.4s tail, with
   the end card occupying the final `end_card.seconds`.
4. Motion: still hook → hard zoom-punch; images → slow push-in; screens → gentle zoom that keeps
   UI legible. Scenes change on hard cuts (the norm for short ads), so each scene is encoded once
   as its own segment and the segments are joined by a stream-copy concat.
5. Captions: faster-whisper **multilingual `small`** (int8), `language="tl"`,
   `initial_prompt=script`, word timestamps. Displayed words are the **script's** words, aligned to
   recognised timings by sequence alignment; unmatched words get interpolated times. If
   transcription fails, words are spread proportionally across the audio. ASS style: Poppins,
   white, active word `#FFC857`, outline, max 2 lines, middle 60% of frame.
6. Overlays: logo lockup (mark + "FishPin" Poppins) top-left from 1.0s; end card drawn with
   `drawtext`/`overlay` on `#0A2461`.
7. Audio: voiceover resampled to **48kHz stereo**; music bed mixed low if present.
8. Encode: `libx264`, `yuv420p`, 30fps, `-g 60 -keyint_min 60 -sc_threshold 0` (2s closed GOP),
   `-maxrate 8M -bufsize 16M`, AAC-LC 48kHz stereo 160k, `+faststart`.

### 5.3 Security

- `X-Render-Token` on `/render-ad` (above).
- Firewall: allow TCP 8090 from the Docker network only, deny it publicly. n8n reaches the new
  service at the Docker gateway (normally `172.18.0.1:8090`). The existing reel service on 8088 is
  left exactly as it is — its exposure is a separate decision, out of scope for this build.

### 5.4 Deployment (owner runs; Claude has no SSH access)

**Separate service (owner decision, 2026-09-16).** The live `/opt/reel-render/render.py` turned
out to be a different, older variant (md5 `70f5623a…`, 284 lines: film-grain vintage, scanlines,
DejaVu-Sans phrase captions) from the repo's v4 base the new file was built on. Rather than merge
or overwrite the code the owner's reels depend on, `/render-ad` ships as its own service:

1. Prerequisites only (no change to the reel service): ffmpeg has `drawtext`, `ass`, `zoompan`,
   `amix`; note `reel-render`'s `User=` and venv; discover the n8n container, subnet and gateway.
2. Install the new `render.py` and `smoke_render_ad.sh` under `/opt/reel-render-ad/` (own
   `output/`, `music/`, `assets/`; music copied from the reel service), verify both md5s,
   `py_compile` with the existing venv.
3. Pre-download faster-whisper `small` as the service user.
4. Stage-test on `127.0.0.1:8089` with `RENDER_ROOT=/opt/reel-render-ad` and a throwaway token;
   STOP on any failure — nothing has been installed as a service yet.
5. Create the `reel-render-ad` systemd unit (port from `RENDER_AD_PORT=8090`, own `RENDER_ROOT`,
   `Environment=RENDER_AD_TOKEN=…`), enable it, check `/health`.
6. Smoke-test the live service on 8090; its own `RENDER_ROOT` means the cleanup can never touch
   the reel service's output.
7. Firewall: allow 8090 from the Docker subnet, deny it publicly; leave the 8088 rules untouched;
   confirm n8n reaches `/health` and that n8n itself is still reachable.

Rollback is `systemctl disable --now reel-render-ad`: the reel service was never modified.

---

## 6. Slack delivery

1. `files.getUploadURLExternal` → POST MP4 bytes → `files.completeUploadExternal` (files array
   only, no `channel_id`) → Wait 5s.
2. `chat.postMessage` to `C0C1WS8PAAJ`: pillar, hook, topic, full voiceover, scene list (and a
   note when Veo fell back to the still), the ready-to-paste caption (build-06 `buildPostMessage`:
   description + `postCta` + both links + hashtags), estimated cost, and the video file link.
   Delivery is verified from `completeUploadExternal`'s `ok` and the message's `ok`/`ts`.
3. Only then: Sheet row `delivered` with pillar, topic, hook, voiceover, `video_url` (Slack file
   permalink) and `est_cost_usd`. There are no buttons and nothing waits.

---

## 7. Failure handling

| Failure | Behaviour |
|---|---|
| Script invalid | retry with the validator's reasons, max 3, then `needs_manual` + Slack |
| Veo error, content filter, or > `veoMaxWaitMinutes` | hook uses the still with zoom-punch; run continues; Slack preview notes the fallback |
| TTS failure | stop before image/Veo spend; `failed` + Slack |
| AI image failure | stop before Veo spend; `failed` + Slack |
| Render 4xx/5xx or timeout (600s) | `failed` + Slack with the service error |
| Slack upload/post not `ok` | `failed` + ops alert with Slack's error; the row is never marked delivered |
| Trigger with a wrong or placeholder secret | rejected before any spend + Slack; no row written |
| Uncaught | `settings.errorWorkflow = 660Xkpo164VSNTDZ` |

Ordering rule: cheap steps before paid ones, and every paid step gated on the previous step's
success.

---

## 8. Cost and timing

| Item | Cost |
|---|---|
| Veo 3.1 Lite, 6s, 1080p | $0.48 |
| Hook still + 3 scene images | ~$0.15 |
| Script + voiceover | ~$0.01 |
| VPS render | $0 |
| **Per video** | **~$0.65** (≈ $0.17 when Veo falls back to the still) |

Wall time per video: ~3–8 min (Veo 11s–6min, caption timing 30–60s, encode 1–2 min).

---

## 9. Testing and rollout

1. **Spike first** (before full build): one real Veo Lite image-to-video call end to end
   (generate, poll, download, verify 9:16/duration), and one Slack video-file preview in
   `C0C1WS8PAAJ`. Also render three 5-second TTS samples in Filipino (`Gacrux`, `Algenib`,
   `Achird`) for the owner to choose `ttsVoice`.
2. **Offline tests** (`node test.js`): `validateScript` rules (hook length, word band, first-scene
   Veo, single Veo, screen allowlist, planned seconds band, social-proof rejection, repeat check),
   build-06 rule reuse, every Code node body run against a fake n8n, Veo polling and fallback
   wiring, the row marked delivered only after a delivered Slack message, no `.first()` on fan-out
   nodes, every Code node parses under `AsyncFunction`, no secrets in committed JSON.
3. **Render tests**: ffmpeg and faster-whisper are not installed locally, so the pure helpers
   (token check, payload validation, Filipino script-to-timing alignment, duration scaling, ASS
   captions, encode arguments) are Python `unittest`s run locally, and a smoke script on the VPS
   checks the real encode with `ffprobe` (1080×1920, 30fps, H.264 yuv420p, keyframes every 2s,
   AAC 48kHz stereo, total duration), token rejection, non-allowlisted screen rejection and that
   `/health` still answers.
4. **Live:** one run with a typed topic and one with a blank topic, each delivered to Slack; the
   owner downloads and watches both.

---

## 10. Files

```
n8n-control/builds/07-fishpin-video-ads/
  lib/script-rules.js     validateScript, scene/allowlist rules, planned-duration checks
  lib/scene-plan.js       render payload shaping, Veo fallback (pure)
  lib/video-prompt.js     script schema, prompts, still/Veo/TTS requests (pure)
  lib/video-sheet-rules.js  Videos tab rows and updates, cost (pure)
  nodes/*.js              n8n glue
  build.js                inlines ../06-fishpin-fb-ads/lib/{brand,copy-rules,image-rules}.js + lib/
  test.js
  trigger.html            topic box; opened locally by the owner, never hosted. The shared
                          secret is typed into a password field and kept in the browser's
                          localStorage — it is never written into the committed HTML
  README.md
n8n-control/vps-render/render.py   adds /render-ad; /render unchanged
```

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Slack does not deliver or play the MP4 | spike (§9.1) before building; the file link still downloads even if inline playback fails |
| Whisper `small` misaligns Tagalog | display script words, not recognised words; proportional fallback |
| Live `render.py` differs from the repo copy | §5.4 step 1 fingerprints the live file before editing |
| Veo rejects a scene (people/content filter) | still-image fallback; prompts avoid minors and distress imagery |

---

## 12. Follow-ups for the image-album workflow (not part of this build)

1. `Slack Review` passes `limitWaitTime` as a flat boolean, which n8n ignores; drafts never
   expire. Fix with the fixedCollection shape in §6.1.
2. `maxCopyRetries = 1` loses whole days to near-miss formatting rejections (FP-008). Raise to 3.

---

## Sources

- [Meta — Publish a Reel](https://developers.facebook.com/docs/video-api/guides/reels-publishing/)
- [Google — Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Google — Veo 3.1 guide](https://ai.google.dev/gemini-api/docs/veo)
- [Google — Speech generation (TTS)](https://ai.google.dev/gemini-api/docs/speech-generation)
- [Hootsuite — Facebook ad sizes 2026](https://blog.hootsuite.com/facebook-ad-sizes/)
- [QuickFrame — Facebook video ad specs 2026](https://quickframe.mountain.com/blog/facebook-video-ad-specs/)
- [AdStellar — Facebook video ad specifications 2026](https://www.adstellar.ai/blog/facebook-video-ad-specifications)
- [The Rundown — Gemini Omni Flash](https://www.therundown.ai/tools/gemini-omni)
- [eesel AI — Gemini Omni Flash pricing](https://www.eesel.ai/blog/gemini-omni-flash-pricing)
