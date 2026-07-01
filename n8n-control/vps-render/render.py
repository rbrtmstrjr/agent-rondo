#!/usr/bin/env python3
# Reel render service: images + Gemini voiceover + auto-synced captions -> MP4 (vertical 9:16).
# Pure stdlib + ffmpeg CLI. POST /render {scenes:[{image_url,narration}], audio_b64, width, height} -> video/mp4
import json, base64, os, re, subprocess, tempfile, shutil, urllib.request, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

W_DEFAULT, H_DEFAULT, FPS = 1080, 1920, 30
OUTPUT_DIR = "/opt/reel-render/output"
os.makedirs(OUTPUT_DIR, exist_ok=True)

def prune_outputs(keep=50):
    try:
        files = sorted([os.path.join(OUTPUT_DIR, f) for f in os.listdir(OUTPUT_DIR) if f.endswith(".mp4")], key=os.path.getmtime)
        for f in files[:-keep]:
            os.remove(f)
    except Exception:
        pass

SCANLINES = "/opt/reel-render/scanlines.png"
def ensure_scanlines():
    # Build a faint horizontal-scanline overlay once (for the old-TV vintage look).
    if os.path.exists(SCANLINES):
        return
    try:
        import subprocess as sp
        sp.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=black:s=1080x1920",
                "-vf", "format=rgba,geq=r=0:g=0:b=0:a='if(lt(mod(Y,3),1),55,0)'",
                "-frames:v", "1", SCANLINES], stdout=sp.PIPE, stderr=sp.PIPE)
    except Exception:
        pass
ensure_scanlines()
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"

_WHISPER = None
def transcribe_words(audio_path):
    # Word-level timestamps via faster-whisper (loaded once, reused). Returns [(word, start, end), ...].
    global _WHISPER
    from faster_whisper import WhisperModel
    if _WHISPER is None:
        _WHISPER = WhisperModel("base.en", device="cpu", compute_type="int8")
    segments, _info = _WHISPER.transcribe(audio_path, language="en", word_timestamps=True, vad_filter=True)
    words = []
    for seg in segments:
        for w in (seg.words or []):
            t = (w.word or "").strip()
            if t:
                words.append((t, float(w.start), float(w.end)))
    return words

def run(cmd, cwd=None):
    p = subprocess.run(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if p.returncode != 0:
        raise RuntimeError(cmd[0] + " failed: " + p.stderr.decode("utf-8", "ignore")[-1500:])
    return p.stdout.decode("utf-8", "ignore")

def probe_duration(path):
    out = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path])
    try:
        return float(out.strip())
    except Exception:
        return 0.0

def ass_time(t):
    if t < 0:
        t = 0
    h = int(t // 3600); m = int((t % 3600) // 60); s = int(t % 60); cs = int(round((t - int(t)) * 100))
    if cs == 100:
        cs = 99
    return "%d:%02d:%02d.%02d" % (h, m, s, cs)

def words(s):
    return max(1, len((s or "").split()))

def wrap_caption(text, max_chars=16):
    # Break into short, punchy lines so captions never run off the frame.
    out = []
    cur = ""
    for w in text.split():
        if cur and len(cur) + 1 + len(w) > max_chars:
            out.append(cur); cur = w
        else:
            cur = (cur + " " + w).strip()
    if cur:
        out.append(cur)
    return "\\N".join(out)

def build_ass(scenes, durs, W, H):
    head = (
        "[Script Info]\nScriptType: v4.00+\nPlayResX: %d\nPlayResY: %d\nWrapStyle: 0\n\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV\n"
        "Style: Cap,DejaVu Sans,68,&H0000FFFF,&H00000000,&H00000000,1,0,1,6,3,8,80,80,240\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    ) % (W, H)
    lines = []
    t = 0.0
    for i, sc in enumerate(scenes):
        start = t; end = t + durs[i]; t = end
        txt = re.sub(r"\s+", " ", (sc.get("narration") or "").strip()).upper()
        txt = txt.replace("\\", "").replace("{", "").replace("}", "")
        if not txt:
            continue
        lines.append("Dialogue: 0,%s,%s,Cap,,0,0,0,,%s" % (ass_time(start), ass_time(end), wrap_caption(txt)))
    return head + "\n".join(lines) + "\n"

def _esc(t):
    return t.replace("\\", "").replace("{", "").replace("}", "").strip().upper()

def _group_words(words, max_words=4, max_chars=18):
    groups, cur, cur_chars = [], [], 0
    for w in words:
        wl = len(w[0])
        if cur and (len(cur) >= max_words or cur_chars + wl + 1 > max_chars):
            groups.append(cur); cur, cur_chars = [], 0
        cur.append(w); cur_chars += wl + 1
    if cur:
        groups.append(cur)
    return groups

def build_ass_karaoke(words, W, H):
    # TikTok/Reels style: whole short line shown, the currently-spoken word highlighted yellow.
    head = (
        "[Script Info]\nScriptType: v4.00+\nPlayResX: %d\nPlayResY: %d\nWrapStyle: 0\n\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV\n"
        "Style: Cap,DejaVu Sans,72,&H00FFFFFF,&H00000000,&H00000000,1,0,1,6,3,8,80,80,240\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    ) % (W, H)
    YELLOW, WHITE = "&H0000FFFF&", "&H00FFFFFF&"
    out = []
    for g in _group_words(words):
        for j in range(len(g)):
            start = g[j][1]
            end = g[j + 1][1] if j + 1 < len(g) else g[j][2]
            if end <= start:
                end = start + 0.06
            parts = []
            for k in range(len(g)):
                u = _esc(g[k][0])
                parts.append("{\\c%s}%s{\\c%s}" % (YELLOW, u, WHITE) if k == j else u)
            out.append("Dialogue: 0,%s,%s,Cap,,0,0,0,,%s" % (ass_time(start), ass_time(end), " ".join(parts)))
    return head + "\n".join(out) + "\n"

def render(payload, workdir):
    W = int(payload.get("width", W_DEFAULT)); H = int(payload.get("height", H_DEFAULT))
    scenes_in = payload.get("scenes") or []
    valid = []
    for sc in scenes_in:
        url = sc.get("image_url")
        if not url:
            continue
        dest = os.path.join(workdir, "img_%d.jpg" % len(valid))
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
                shutil.copyfileobj(r, f)
            if os.path.getsize(dest) < 1024:
                raise RuntimeError("tiny image")
            valid.append(sc)
        except Exception:
            if os.path.exists(dest):
                os.remove(dest)
    if len(valid) < 2:
        raise RuntimeError("need at least 2 valid images, got %d" % len(valid))
    scenes = valid
    K = len(scenes)

    audio_b64 = payload.get("audio_b64")
    audio_path = None; total = 0.0
    if audio_b64:
        audio_path = os.path.join(workdir, "audio.wav")
        with open(audio_path, "wb") as f:
            f.write(base64.b64decode(audio_b64))
        total = probe_duration(audio_path)
    if total <= 0:
        total = sum(min(4.0, max(2.0, words(s.get("narration")) / 2.5)) for s in scenes)
        audio_path = None

    wts = [words(s.get("narration")) for s in scenes]
    sw = sum(wts)
    durs = [max(1.2, total * w / sw) for w in wts]
    scale = total / sum(durs)
    durs = [d * scale for d in durs]

    # Captions: word-by-word highlight synced to the voice (Whisper). Fallback to per-phrase.
    wseg = []
    if audio_path:
        try:
            wseg = transcribe_words(audio_path)
        except Exception:
            wseg = []
    ass_text = build_ass_karaoke(wseg, W, H) if wseg else build_ass(scenes, durs, W, H)
    with open(os.path.join(workdir, "subs.ass"), "w", encoding="utf-8") as f:
        f.write(ass_text)

    UP = 3  # upscale factor before zoompan -> sub-pixel-smooth zoom (kills jitter)
    parts = []
    for i in range(K):
        fr = max(1, int(round(durs[i] * FPS)))
        parts.append(
            "[%d:v]scale=%d:%d:force_original_aspect_ratio=increase:flags=lanczos,crop=%d:%d,"
            "zoompan=z='min(zoom+0.0006,1.18)':d=%d:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=%dx%d:fps=%d,setsar=1[v%d]"
            % (i, UP * W, UP * H, UP * W, UP * H, fr, W, H, FPS, i)
        )
    parts.append("".join("[v%d]" % i for i in range(K)) + "concat=n=%d:v=1:a=0[vcat]" % K)
    vintage = bool(payload.get("vintage", False))
    if vintage:
        # Film-grain vintage (matches reference): clean grayscale, visible fine grain, very soft vignette.
        # No scanlines, no color tint. Grain is per-frame so it shimmers like real film grain.
        parts.append("[vcat]format=gray,eq=contrast=1.05:brightness=0.02,noise=alls=20:allf=t,vignette=PI/11,format=yuv420p[vfx]")
        parts.append("[vfx]ass=subs.ass[vout]")
    else:
        parts.append("[vcat]ass=subs.ass[vout]")

    cmd = ["ffmpeg", "-y"]
    for i in range(K):
        cmd += ["-i", "img_%d.jpg" % i]
    if audio_path:
        cmd += ["-i", "audio.wav"]
    fc = ";".join(parts)
    cmd += ["-filter_complex", fc, "-map", "[vout]"]
    if audio_path:
        cmd += ["-map", "%d:a" % K, "-c:a", "aac", "-b:a", "128k", "-shortest"]
    cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
            "-maxrate", "8M", "-bufsize", "16M", "-pix_fmt", "yuv420p",
            "-r", str(FPS), "-movflags", "+faststart", "out.mp4"]
    run(cmd, cwd=workdir)
    out = os.path.join(workdir, "out.mp4")
    # Keep a permanent copy on the VPS so a Slack/n8n hiccup never loses the video.
    try:
        stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        shutil.copyfile(out, os.path.join(OUTPUT_DIR, "reel-" + stamp + ".mp4"))
        prune_outputs()
    except Exception:
        pass
    return out

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200); self.send_header("Content-Type", "text/plain"); self.end_headers()
            self.wfile.write(b"ok")
        elif self.path in ("/videos", "/videos/"):
            files = sorted([f for f in os.listdir(OUTPUT_DIR) if f.endswith(".mp4")], reverse=True)
            rows = "".join('<li><a href="/videos/%s">%s</a></li>' % (f, f) for f in files) or "<li>(no videos yet)</li>"
            html = ("<html><head><title>Rendered Reels</title></head><body style='font-family:sans-serif'>"
                    "<h2>Rendered Reels (%d)</h2><ul>%s</ul></body></html>" % (len(files), rows)).encode("utf-8")
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(html))); self.end_headers(); self.wfile.write(html)
        elif self.path.startswith("/videos/"):
            name = os.path.basename(self.path[len("/videos/"):])
            p = os.path.join(OUTPUT_DIR, name)
            if name.endswith(".mp4") and os.path.isfile(p):
                with open(p, "rb") as f:
                    data = f.read()
                self.send_response(200); self.send_header("Content-Type", "video/mp4")
                self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
            else:
                self.send_response(404); self.end_headers()
        else:
            self.send_response(404); self.end_headers()
    def do_POST(self):
        if self.path != "/render":
            self.send_response(404); self.end_headers(); return
        workdir = tempfile.mkdtemp(prefix="reel-")
        try:
            n = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(n).decode("utf-8"))
            out = render(payload, workdir)
            with open(out, "rb") as f:
                data = f.read()
            self.send_response(200); self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Length", str(len(data))); self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            msg = json.dumps({"error": str(e)}).encode("utf-8")
            self.send_response(500); self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(msg))); self.end_headers()
            self.wfile.write(msg)
        finally:
            shutil.rmtree(workdir, ignore_errors=True)

if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8088), Handler).serve_forever()
