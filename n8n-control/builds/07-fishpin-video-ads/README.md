# FishPin Video Ads → Slack — Portfolio Build #7

Type a topic, or leave it blank, and a 25-second branded video ad in spoken Filipino arrives in Slack a few minutes later, with a caption ready to paste. Download it, review or re-edit it, and upload it to Facebook yourself.

**ROI pitch:** replaces a script writer, voice actor and video editor for about $0.81 of AI spend per video, and hands a human a finished draft instead of a blank page.

## The business problem

Short vertical video is the cheapest reach on Facebook, but one good ad needs a script, a voice, footage, captions and an edit. For a one-person app business that is a day of work per video, so it does not happen.

## What one ad looks like

| Time | Beat | Made from |
|---|---|---|
| 0–3s | Hook: the problem, spoken and shown | One Veo 3.1 Lite clip animated from an AI still |
| 3–8s | Stakes | AI photographs in the FishPin brand grade |
| 8–16s | Demo | 1–2 real FishPin app screens from fishpin.app |
| 16–21s | Relief | AI photograph |
| last 3.5s | End card | Code-drawn on Persian Blue: logo, "FishPin", CTA, www.fishpin.app |

Word-by-word captions in Poppins with the spoken word in Amber, the FishPin lockup top-left, a calm Filipino voiceover, encoded to Facebook's Reels file spec (1080×1920, 30fps, H.264, AAC 48 kHz stereo) so it uploads as-is.

## How it works

`FishPin Video Ad -> Slack`

1. **Trigger**: `trigger.html` (topic + shared secret) or the n8n Manual Trigger.
2. **Row**: a `Videos` row is appended at `generating`.
3. **Script**: Gemini writes pillar, topic, hook, voiceover, caption, hashtags and 5–6 scenes against a JSON schema. `validateScript` checks it with build 06's brand and compliance rules. Up to 3 tries, then `needs_manual`.
4. **Assets, cheapest first**: voiceover (Gemini TTS) → pictures (hook still + scene images, all-or-nothing) → one Veo clip from the hook still, polled every 15s for up to 8 minutes. If Veo fails, the hook uses the still with a zoom punch and the Slack message says so.
5. **Render**: `POST /render-ad` on the VPS render service (token-protected, Docker network only) returns the MP4.
6. **Delivery**: the MP4 is uploaded to Slack `C0C1WS8PAAJ` with the hook, topic, voiceover, scene list, the caption to paste (with the CTA, www.fishpin.app, the Play Store link and hashtags) and the cost. The row becomes `delivered` with the Slack file link.
7. **Any failure** → one `Stop` node records the status on the row and posts the exact reason to Slack.

Nothing is published to Facebook and nothing waits for a click. Another version = another run.

## Cost and timing

Veo 3.1 Lite only offers 1080p at an 8-second clip length, so every clip is 8s @ 1080p.

| Item | Cost |
|---|---|
| Veo 3.1 Lite, 8s, 1080p | $0.64 |
| Hook still + 3 scene images | ~$0.16 |
| Script + voiceover | ~$0.01 |
| VPS render | $0 |
| **Per video** | **~$0.81** (≈ $0.17 when Veo falls back) |

3–8 minutes from trigger to Slack.

## Files

| Path | What |
|---|---|
| `lib/script-rules.js` | `validateScript` and the script limits |
| `lib/scene-plan.js` | app screen allowlist, `/render-ad` payload, Veo fallback |
| `lib/video-prompt.js` | script schema and prompts, still, Veo and TTS requests |
| `lib/video-sheet-rules.js` | `Videos` tab rows, updates, cost |
| `nodes/*.js` | Code-node glue, one file per Code node |
| `node-libs.js` | which libs each glue file gets; shared by build and tests |
| `build.js` | emits `fishpin-video-ads.workflow.json` |
| `test.js` | offline suite, including every glue body run against a fake n8n |
| `trigger.html` | local trigger page |
| `spike/` | the live verification run that fixed the API details |
| `../06-fishpin-fb-ads/lib/` | brand voice, prose rules and caption composer, shared, never copied |
| `../../vps-render/` | `render.py` `/render-ad`, its unit tests, smoke test and deploy runbook |

## Setup

1. **Sheet**: a `Videos` tab in "FishPin Ads Generator" with this header row: `id, created_at, topic_input, pillar, topic, hook, voiceover, status, video_url, est_cost_usd`.
2. **Render service**: follow `n8n-control/vps-render/DEPLOY-render-ad.md`. `/render-ad` runs as its own systemd service, `reel-render-ad`, on port 8090 from its own `/opt/reel-render-ad` — a completely separate deploy from the owner's existing `reel-render` service on port 8088 (an older code variant), which the runbook never touches. It ends with `FISHPIN_RENDER_TOKEN` in `n8n-control/.env` and port 8090 locked to the Docker network only, never exposed to the public internet.
3. **Secrets**: `FISHPIN_VIDEO_TRIGGER_SECRET` and `FISHPIN_RENDER_TOKEN` live only in `n8n-control/.env` (git-ignored). The committed JSON carries `FILL_IN_*` placeholders, which the workflow refuses to run with.
4. **Deploy or update** (PowerShell, from `n8n-control`):
   ```powershell
   $cfg = @{}; foreach ($l in Get-Content .env) { if ($l -match '^\s*([^=#]+?)\s*=\s*(.*)$') { $cfg[$matches[1]] = $matches[2].Trim() } }
   $env:FISHPIN_VIDEO_TRIGGER_SECRET = $cfg["FISHPIN_VIDEO_TRIGGER_SECRET"]; $env:FISHPIN_RENDER_TOKEN = $cfg["FISHPIN_RENDER_TOKEN"]
   node builds\07-fishpin-video-ads\build.js
   $env:FISHPIN_VIDEO_TRIGGER_SECRET = $null; $env:FISHPIN_RENDER_TOKEN = $null
   .\n8n.ps1 update <workflow id> builds\07-fishpin-video-ads\fishpin-video-ads.workflow.json
   node builds\07-fishpin-video-ads\build.js   # back to placeholders before any commit
   ```
5. **Run**: open `trigger.html` in a browser, paste the trigger secret once, type a topic or leave it blank.

## Config

| Key | Value | Notes |
|---|---|---|
| `sheetId` / `videosTab` | FishPin Ads Generator / `Videos` | |
| `deliveryChannel` / `opsChannel` | `C0C1WS8PAAJ` | video and failure messages |
| `scriptModel` / `scriptTemperature` | `gemini-2.5-flash` / `0.9` | |
| `imageModel` | `gemini-2.5-flash-image` | |
| `veoModel` / `veoSeconds` / `veoResolution` / `veoMaxWaitMinutes` | `veo-3.1-lite-generate-preview` / `8` / `1080p` / `8` | Veo 3.1 Lite only offers 1080p at 8s |
| `ttsModel` / `ttsVoice` | `gemini-3.1-flash-tts-preview` / `Algenib` | voice chosen by the owner from the live spike, 2026-09-16 |
| `maxScriptRetries` | `3` | script validation tries |
| `renderUrl` | `http://172.18.0.1:8090/render-ad` | Docker host address, the new `reel-render-ad` service |
| `websiteUrl` / `playStoreUrl` | `www.fishpin.app` / `…?id=com.fishpin.app` | |
| `endCardCta` / `endCardSeconds` / `postCta` | `I-download sa Play Store` / `3.5` / `I-download ang FishPin sa Play Store.` | |
| `triggerSecret` / `renderToken` | from `.env` at deploy | never committed |

## Tests

```bash
node build.js && node test.js           # offline: 178 checks, no network
node test.js --only=gen                 # one section: script, plan, prompt, sheet, gen, deliver, wf
cd ../../vps-render && python -m unittest test_render_ad -v   # 30 render helper tests
```

On the VPS after a render deploy: `RENDER_ROOT=/opt/reel-render-ad PORT=8090 RENDER_AD_TOKEN=<token> bash /opt/reel-render-ad/smoke_render_ad.sh`.

## Known limitations

- `../../vps-render/render.py` is the video-ad service's file (`reel-render-ad`, port 8090, `/opt/reel-render-ad`). Its `/render` half is the owner's v4 reel renderer and has never been deployed to the live reel service; the live `reel-render` service (port 8088) runs an older, untracked variant. Never copy `render.py` over `/opt/reel-render/render.py` without a separate, tested deploy — it would change how existing reels look (transitions, a music bed and karaoke captions would appear; film grain and scanlines would go).
- Veo 3.1 Lite is a preview model. When it fails, the video still ships with a still-image hook.
- Each run keeps the pictures and voiceover as base64 in n8n's execution history (roughly 15 MB per run).
- If the final `Videos` row update fails after delivery, the video is still in Slack; the row stays at `generating` and that hook is not remembered for "do not repeat".
- Captions show the script's own words. Their timing comes from Whisper `small` on Tagalog and falls back to even spacing if recognition fails.

## Adapting for a real client

- Brand voice, banned words and compliance: `../06-fishpin-fb-ads/lib/brand.js` and `copy-rules.js`.
- App screens: `SCREEN_URLS` in `lib/scene-plan.js` and `SCREEN_GUIDE` in `lib/video-prompt.js` (keep the ids in `lib/script-rules.js` in step).
- Voice: `Config.ttsVoice`. Channel and sheet: Config.
- End card colours and fonts: `render_ad` in `n8n-control/vps-render/render.py`.
