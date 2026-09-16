# Spike findings — FishPin video ads (2026-09-16)

Verified against the live APIs with the throwaway workflow `SPIKE FishPin video (delete after)`
(`cyTxSa4PCTRoagAR`), four runs. Executions 2982–2985 on https://n8n.srv1193790.hstgr.cloud.

## Veo 3.1 Lite (`veo-3.1-lite-generate-preview:predictLongRunning`)

Three request-shape errors were found and fixed before the first clip generated. All three are
now encoded in `lib/video-prompt.js` (`buildVeoRequest`) and pinned by tests:

| What the plan assumed | What the API requires | Evidence |
|---|---|---|
| `image: { inlineData: { mimeType, data } }` | `image: { bytesBase64Encoded, mimeType }` | exec 2982: HTTP 400 ``\`inlineData\` isn't supported by this model`` |
| `durationSeconds: "6"` (string, per the docs) | a JSON **number** | exec 2983: HTTP 400 "The value type for `durationSeconds` needs to be a number" |
| `resolution "1080p"` with 6s | 1080p exists **only at 8s** (4s/6s are 720p-only) | exec 2984: HTTP 400 "1080p is not supported for a duration of 6 seconds" |

Owner decision (2026-09-16): keep 1080p and pay for 8 seconds (`veoSeconds: 8`, $0.64/clip,
~$0.81/video), rather than 720p upscaled. The hook uses ~3s of the clip.

Verified working request (exec 2985):

```json
{"instances":[{"prompt":"…","image":{"bytesBase64Encoded":"<png b64>","mimeType":"image/png"}}],
 "parameters":{"aspectRatio":"9:16","resolution":"1080p","durationSeconds":8,"personGeneration":"allow_adult"}}
```

- Start response: `{"name":"models/veo-3.1-lite-generate-preview/operations/eux5yl5lc88d"}`
- Poll by GET on `https://generativelanguage.googleapis.com/v1beta/` + that `name`.
- Latency: **5 polls × 15s ≈ 75 seconds** (well inside the 8-minute cap).
- Done payload path to the file: `response.generateVideoResponse.generatedSamples[0].video.uri`
  → `https://generativelanguage.googleapis.com/v1beta/files/<id>:download?alt=media`
- **The n8n `googlePalmApi` credential authenticates that download** — no extra header needed.
  Downloaded 10,381,938 bytes, `video/mp4`, for an 8s 1080p 9:16 clip (~10 MB).

## Slack video delivery

The build-06 external-upload pattern works unchanged for video:

1. `files.getUploadURLExternal` (filename + length) → `ok:true`, `upload_url`, `file_id`.
2. POST the bytes to `upload_url` → `OK - 10381938`.
3. `files.completeUploadExternal` with `files:[{id,title}]` and **no `channel_id`** → `ok:true`.
4. Wait 5s, then `chat.postMessage` → `ok:true`, `ts:"1789532930.810719"`, channel `C0C1WS8PAAJ`.

- Permalink field is `files[0].permalink` (as the plan assumed), e.g.
  `https://slackautomati-d1s5139.slack.com/files/U0BC94JPLH1/F0C29HSKU4C/spike-hook.mp4`.
- A 10 MB MP4 upload needed no chunking and no special content type.

## Gemini TTS (`gemini-3.1-flash-tts-preview`)

- Output mime: `audio/l16; rate=24000; channels=1` (raw 16-bit PCM mono @ 24 kHz), wrapped into a
  WAV header in the Code node exactly as `nodes/voice-wav.js` does it.
- All three Filipino voices returned usable audio for the same 24-word line:

| Voice | Seconds | WAV bytes |
|---|---|---|
| Gacrux | 9.92 | 476,204 |
| Algenib | 11.12 | 533,804 |
| Achird | 10.40 | 499,244 |

- Owner's chosen `ttsVoice`: **Algenib** (owner, 2026-09-16); rejected: Gacrux and Achird

## Costs observed

Three failed starts cost only the hook still each (~$0.04). The successful run cost the still plus
an 8s 1080p Veo clip ≈ $0.68. Total spike spend ≈ $0.80.

## Corrections applied to `build-spike.js` during the spike

1. `bytesBase64Encoded` image shape (above).
2. `durationSeconds` as a number.
3. `durationSeconds: 8` with `resolution: '1080p'`.
4. Fail-fast guard in `Poll Guard`: if `Veo Start` returned no operation `name`, throw immediately
   instead of polling a nonexistent operation for 8 minutes (run 1 wasted 33 polls).
