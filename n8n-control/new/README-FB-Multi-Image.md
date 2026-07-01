# Facebook Multi-Image Auto-Poster (Gemini AI) — n8n Workflow

Automatically generate and publish **multi-image Facebook Page posts** using Google
Gemini. Give it a topic; it writes the caption, generates several matching images,
and publishes them as a single album post — with automatic retries and Slack alerts.

---

## 📦 What's included

| Workflow | Purpose |
|---|---|
| **FB Multi-Image Auto Post (Gemini)** | The main automation (content → images → album post) |
| **[Ops] Error Handler → Slack** | Reusable failure-notifier for your whole n8n instance |

---

## 🔁 How it works

```
Trigger → Config → Gemini (caption + N prompts) → Parse & Split
   → Generate Image (per prompt) → Upload to FB (unpublished, per image)
   → Collect Photo IDs → Publish Album Post → ✅ Slack success
                                              ❌ any failure → Error Handler → Slack
```

1. **Config** – set `topic`, `numImages`, and your Facebook `pageId`.
2. **Gemini 2.5 Pro** – writes one caption + N image prompts as strict JSON.
3. **Parse & Split** – validates the JSON, emits one item per image.
4. **Gemini 2.5 Flash Image (Nano Banana)** – generates each image.
5. **Upload Photo (unpublished)** – uploads each image to the Page with
   `published=false`, receiving a `media_fbid` per image.
6. **Collect Photo IDs** – bundles all IDs into one `attached_media` array.
7. **Publish Album Post** – creates ONE Page post containing all images + caption.
8. **Notify Success (Slack)** – posts a summary (post ID, image count, caption).

> Facebook requires this two-step pattern (upload unpublished → publish feed post
> with `attached_media`) to create a true multi-image / album post.

---

## ⚙️ Setup (one-time)

### 1. Credentials
| Credential | Used by | Notes |
|---|---|---|
| **Google Gemini (PaLM) API** | the two Gemini nodes | Get an API key from Google AI Studio |
| **Facebook Graph API** | the two HTTP nodes | Page access token with `pages_manage_posts`, `pages_read_engagement` |
| **Slack** | the two Slack nodes | Bot token or OAuth; invite the bot to your alert channel |

### 2. Configure
- Open the **Config** node → set `topic`, `numImages` (e.g. 3), and `pageId`.
- On both Slack nodes → choose your alert channel (default name: `n8n-alerts`).

### 3. Link the error handler
Main workflow → **Settings → Error Workflow → [Ops] Error Handler → Slack**
(already linked in this package).

### 4. Test
Click **Execute workflow** and watch each node turn green. Check your Page + Slack.

### 5. Automate (optional)
Replace the **Manual Trigger** with a **Schedule Trigger** (e.g. daily at 09:00)
to post on autopilot.

---

## 🛡️ Production features
- **Auto-retry** (3× with 5s backoff) on every external call (Gemini + Facebook).
- **Input validation** — fails with a clear message if the model returns bad JSON,
  an empty caption, no prompts, or a photo upload returns no ID.
- **Success + failure notifications** via Slack.

---

## 🧰 Troubleshooting
| Symptom | Fix |
|---|---|
| Upload fails on the image | Check the binary field name out of *Generate Image* (default `data`) and match it in the *Upload Photo* node. |
| Facebook auth error | Ensure the Page token has the required scopes; confirm the credential is selected on both HTTP nodes. |
| `(#100) attached_media` error | The album needs ≥ 2 photos; make sure `numImages` ≥ 2. |
| Model returns invalid JSON | The validation node will report the raw output — usually a temporary model hiccup; retries handle most cases. |

---

## 🔧 Customization ideas
- Change `numImages` for more/fewer images per album.
- Edit the Gemini prompt to match a brand voice or add hashtags.
- Add an approval step (e.g. Telegram/Slack button) before publishing.
- Swap the trigger for a webhook to post on demand from another app.

---

*Built with n8n + Google Gemini. Requires an n8n instance (cloud or self-hosted).*
