#!/usr/bin/env python3
# Reel render service v4 (unskippable): images + Gemini voiceover + Whisper word-pop captions
# + motion variety + fast transitions + optional music bed -> MP4 (vertical 9:16). Pure stdlib + ffmpeg.
import json, base64, os, re, subprocess, tempfile, shutil, urllib.request, datetime, hmac, difflib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

W_DEFAULT, H_DEFAULT, FPS, UP, T = 1080, 1920, 30, 3, 0.25
HOOK_SECS = 2.2
ROOT = os.environ.get("RENDER_ROOT", "/opt/reel-render")
OUTPUT_DIR = os.path.join(ROOT, "output")
MUSIC_DIR = os.path.join(ROOT, "music")
ASSETS_DIR = os.path.join(ROOT, "assets")
for d in (OUTPUT_DIR, MUSIC_DIR, ASSETS_DIR):
    os.makedirs(d, exist_ok=True)
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
TRANS = ["slideleft", "slideright", "smoothup", "fade"]

def prune_outputs(keep=50):
    try:
        fs_ = sorted([os.path.join(OUTPUT_DIR, f) for f in os.listdir(OUTPUT_DIR) if f.endswith(".mp4")], key=os.path.getmtime)
        for f in fs_[:-keep]:
            os.remove(f)
    except Exception:
        pass

def pick_music(seed):
    try:
        files = sorted(f for f in os.listdir(MUSIC_DIR) if f.lower().endswith((".mp3", ".m4a", ".wav", ".ogg")))
        return os.path.join(MUSIC_DIR, files[seed % len(files)]) if files else None
    except Exception:
        return None

_WHISPER = None
def transcribe_words(audio_path):
    global _WHISPER
    from faster_whisper import WhisperModel
    if _WHISPER is None:
        _WHISPER = WhisperModel("base.en", device="cpu", compute_type="int8")
    segments, _ = _WHISPER.transcribe(audio_path, language="en", word_timestamps=True, vad_filter=True)
    out = []
    for seg in segments:
        for w in (seg.words or []):
            t = (w.word or "").strip()
            if t:
                out.append((t, float(w.start), float(w.end)))
    return out

def run(cmd, cwd=None):
    p = subprocess.run(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if p.returncode != 0:
        raise RuntimeError(cmd[0] + " failed: " + p.stderr.decode("utf-8", "ignore")[-1800:])
    return p.stdout.decode("utf-8", "ignore")

def probe_duration(path):
    try:
        return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path]).strip())
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

def _esc(t):
    return t.replace("\\", "").replace("{", "").replace("}", "").strip().upper()

def _group_words(ws, max_words=4, max_chars=18):
    groups, cur, cc = [], [], 0
    for w in ws:
        wl = len(w[0])
        if cur and (len(cur) >= max_words or cc + wl + 1 > max_chars):
            groups.append(cur); cur, cc = [], 0
        cur.append(w); cc += wl + 1
    if cur:
        groups.append(cur)
    return groups

def build_ass_karaoke(ws, W, H):
    head = (
        "[Script Info]\nScriptType: v4.00+\nPlayResX: %d\nPlayResY: %d\nWrapStyle: 0\n\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV\n"
        "Style: Cap,DejaVu Sans,70,&H00FFFFFF,&H00000000,&H00000000,1,0,1,6,3,8,80,80,260\n"
        "Style: Hook,DejaVu Sans,104,&H00FFFFFF,&H00000000,&H00000000,1,0,1,8,4,8,60,60,300\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    ) % (W, H)
    YELLOW = "&H0000FFFF&"
    out = []
    for g in _group_words(ws):
        style = "Hook" if g[0][1] < HOOK_SECS else "Cap"
        for j in range(len(g)):
            start = g[j][1]
            end = g[j + 1][1] if j + 1 < len(g) else g[j][2]
            if end <= start:
                end = start + 0.06
            parts = []
            for k in range(len(g)):
                u = _esc(g[k][0])
                if k == j:
                    # active word: yellow + quick scale POP
                    parts.append("{\\c%s\\fscx112\\fscy112\\t(0,90,\\fscx128\\fscy128)}%s{\\r%s}" % (YELLOW, u, style))
                else:
                    parts.append(u)
            out.append("Dialogue: 0,%s,%s,%s,,0,0,0,,%s" % (ass_time(start), ass_time(end), style, " ".join(parts)))
    return head + "\n".join(out) + "\n"

def build_ass_phrases(scenes, durs, W, H):
    head = (
        "[Script Info]\nScriptType: v4.00+\nPlayResX: %d\nPlayResY: %d\nWrapStyle: 0\n\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV\n"
        "Style: Cap,DejaVu Sans,70,&H00FFFFFF,&H00000000,&H00000000,1,0,1,6,3,8,80,80,260\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    ) % (W, H)
    def wrap(t, n=16):
        o, cur = [], ""
        for w in t.split():
            if cur and len(cur) + 1 + len(w) > n:
                o.append(cur); cur = w
            else:
                cur = (cur + " " + w).strip()
        if cur:
            o.append(cur)
        return "\\N".join(o)
    lines, tt = [], 0.0
    for i, sc in enumerate(scenes):
        st = tt; en = tt + durs[i]; tt = en
        txt = _esc(sc.get("narration") or "")
        if txt:
            lines.append("Dialogue: 0,%s,%s,Cap,,0,0,0,,%s" % (ass_time(st), ass_time(en), wrap(txt)))
    return head + "\n".join(lines) + "\n"

def motion(i):
    if i == 0:
        return "zoompan=z='min(1.0+0.0016*on,1.30)'"      # hook: fast zoom PUNCH
    if i % 2 == 0:
        return "zoompan=z='min(1.0+0.0006*on,1.22)'"      # slow push-in
    return "zoompan=z='max(1.22-0.0006*on,1.02)'"          # slow pull-out

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
                raise RuntimeError("tiny")
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

    # durations weighted by words; scaled so AFTER transition-overlaps the video == audio length
    wts = [words(s.get("narration")) for s in scenes]
    target = total + (K - 1) * T
    durs = [max(T + 0.8, target * w / sum(wts)) for w in wts]
    durs = [d * (target / sum(durs)) for d in durs]

    # captions
    wseg = []
    if audio_path:
        try:
            wseg = transcribe_words(audio_path)
        except Exception:
            wseg = []
    ass_text = build_ass_karaoke(wseg, W, H) if wseg else build_ass_phrases(scenes, durs, W, H)
    with open(os.path.join(workdir, "subs.ass"), "w", encoding="utf-8") as f:
        f.write(ass_text)

    # per-scene motion clips
    parts = []
    for i in range(K):
        fr = max(2, int(round(durs[i] * FPS)))
        parts.append(
            "[%d:v]scale=%d:%d:force_original_aspect_ratio=increase:flags=lanczos,crop=%d:%d,"
            "%s:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=%d:s=%dx%d:fps=%d,setsar=1,format=yuv420p[v%d]"
            % (i, UP * W, UP * H, UP * W, UP * H, motion(i), fr, W, H, FPS, i)
        )
    # fast transitions (xfade chain)
    if K == 1:
        vlabel = "[v0]"
    else:
        acc = durs[0]; label = "v0"
        for i in range(1, K):
            off = max(0.0, acc - T)
            new = "xf%d" % i
            parts.append("[%s][v%d]xfade=transition=%s:duration=%.3f:offset=%.3f[%s]"
                         % (label, i, TRANS[(i - 1) % len(TRANS)], T, off, new))
            acc += durs[i] - T
            label = new
        vlabel = "[%s]" % label

    # optional vintage grain (off by default)
    if bool(payload.get("vintage", False)):
        parts.append("%sformat=gray,eq=contrast=1.05:brightness=0.02,noise=alls=20:allf=t,vignette=PI/11,format=yuv420p[vfx]" % vlabel)
        vlabel = "[vfx]"
    parts.append("%sass=subs.ass[vout]" % vlabel)

    # music bed (mix under voice) if a track exists
    music = pick_music(K) if audio_path else None
    if music:
        parts.append("[%d:a]volume=0.14,aloop=loop=-1:size=2e9[mus]" % (K + 1))
        parts.append("[%d:a][mus]amix=inputs=2:duration=first:normalize=0[aout]" % K)

    fc = ";".join(parts)
    cmd = ["ffmpeg", "-y"]
    for i in range(K):
        cmd += ["-i", "img_%d.jpg" % i]
    if audio_path:
        cmd += ["-i", "audio.wav"]
    if music:
        cmd += ["-i", music]
    cmd += ["-filter_complex", fc, "-map", "[vout]"]
    if audio_path:
        cmd += ["-map", "[aout]" if music else ("%d:a" % K), "-c:a", "aac", "-b:a", "128k"]
    cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-maxrate", "8M", "-bufsize", "16M",
            "-pix_fmt", "yuv420p", "-r", str(FPS), "-shortest", "-movflags", "+faststart", "out.mp4"]
    run(cmd, cwd=workdir)

    out = os.path.join(workdir, "out.mp4")
    try:
        stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        shutil.copyfile(out, os.path.join(OUTPUT_DIR, "reel-" + stamp + ".mp4"))
        prune_outputs()
    except Exception:
        pass
    return out

# ============================================================================
# /render-ad: FishPin video ads. Pure helpers (unit-tested locally); the ffmpeg
# graph is render_ad(), added below these.
# ============================================================================
AD_W, AD_H, AD_FPS, AD_TAIL = 1080, 1920, 30, 0.4
AMBER_ASS = "&H0057C8FF&"            # #FFC857 in ASS BGR order
PERSIAN_HEX = "0x0A2461"
SCREEN_URL_PREFIX = "https://www.fishpin.app/"
AD_SCENE_TYPES = ("video", "image", "screen")

class AdRequestError(Exception):
    def __init__(self, status, message):
        Exception.__init__(self, message)
        self.status = status
        self.message = message

def check_ad_token(supplied, expected):
    if not expected:
        raise AdRequestError(503, "render-ad is not configured: RENDER_AD_TOKEN is unset")
    if not hmac.compare_digest(str(supplied or ""), str(expected)):
        raise AdRequestError(401, "missing or incorrect X-Render-Token")

def validate_ad_payload(payload):
    if not isinstance(payload, dict):
        raise AdRequestError(400, "body must be a JSON object")
    if not str(payload.get("audio_b64") or ""):
        raise AdRequestError(400, "audio_b64 is required")
    scenes = payload.get("scenes")
    if not isinstance(scenes, list) or not (1 <= len(scenes) <= 8):
        raise AdRequestError(400, "scenes must be a list of 1 to 8 scenes")
    clean = []
    for i, sc in enumerate(scenes):
        n = i + 1
        if not isinstance(sc, dict) or sc.get("type") not in AD_SCENE_TYPES:
            raise AdRequestError(400, "scene %d: type must be one of %s" % (n, ", ".join(AD_SCENE_TYPES)))
        try:
            seconds = float(sc.get("seconds"))
        except (TypeError, ValueError):
            seconds = 0.0
        if seconds <= 0:
            raise AdRequestError(400, "scene %d: seconds must be greater than 0" % n)
        if sc["type"] in ("video", "image") and not str(sc.get("b64") or ""):
            raise AdRequestError(400, "scene %d: b64 is required for %s" % (n, sc["type"]))
        if sc["type"] == "screen" and not str(sc.get("url") or "").startswith(SCREEN_URL_PREFIX):
            raise AdRequestError(400, "scene %d: screen url must start with %s (www.fishpin.app only)" % (n, SCREEN_URL_PREFIX))
        c = dict(sc); c["seconds"] = seconds
        clean.append(c)
    ec = payload.get("end_card") or {}
    try:
        ec_seconds = float(ec.get("seconds", 3.5))
    except (TypeError, ValueError):
        ec_seconds = 3.5
    return {
        "width": AD_W, "height": AD_H, "fps": AD_FPS,
        "audio_b64": payload["audio_b64"],
        "script": str(payload.get("script") or ""),
        "language": str(payload.get("language") or "tl"),
        "scenes": clean,
        "end_card": {"cta": str(ec.get("cta") or ""), "url": str(ec.get("url") or ""),
                     "seconds": min(6.0, max(1.0, ec_seconds))},
    }

def tokenize_script(script):
    return [w for w in (script or "").split() if w]

def _norm_token(w):
    return re.sub(r"[^\w]", "", (w or "").lower(), flags=re.UNICODE)

def align_script_words(script_words, recognised):
    if not script_words or not recognised:
        return None
    a = [_norm_token(w) for w in script_words]
    b = [_norm_token(r[0]) for r in recognised]
    times = [None] * len(script_words)
    matched = 0
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                r = recognised[j1 + k]
                times[i1 + k] = (float(r[1]), float(r[2]))
                matched += 1
    if matched == 0:
        return None
    n = len(script_words)
    known = [i for i in range(n) if times[i] is not None]
    for i in range(n):
        if times[i] is not None:
            continue
        prev = max([k for k in known if k < i], default=None)
        nxt = min([k for k in known if k > i], default=None)
        if prev is not None and nxt is not None:
            t0, t1 = times[prev][1], times[nxt][0]
            gap = nxt - prev - 1
            s = t0 + (t1 - t0) * (i - prev - 1) / gap
            e = t0 + (t1 - t0) * (i - prev) / gap
        elif prev is not None:
            s = times[prev][1] + 0.3 * (i - prev - 1)
            e = s + 0.3
        else:
            e = max(0.05, times[nxt][0] - 0.3 * (nxt - i - 1))
            s = max(0.0, e - 0.3)
        times[i] = (s, max(e, s + 0.05))
    return [(script_words[i], times[i][0], times[i][1]) for i in range(n)]

def proportional_word_times(script_words, total_seconds):
    weights = [len(w) + 1 for w in script_words]
    total_w = float(sum(weights)) or 1.0
    out, t = [], 0.0
    for w, wt in zip(script_words, weights):
        d = float(total_seconds) * wt / total_w
        out.append((w, t, t + d))
        t += d
    return out

def scale_scene_durations(planned, audio_seconds, end_card_seconds, tail=AD_TAIL, min_scene=1.0):
    p = [max(0.0, float(x)) for x in planned]
    if not p or sum(p) <= 0:
        raise ValueError("no planned durations")
    total = max(min_scene * len(p), float(audio_seconds) + tail - float(end_card_seconds))
    durs = [x * total / sum(p) for x in p]
    short = [i for i, d in enumerate(durs) if d < min_scene]
    for i in short:
        durs[i] = min_scene
    excess = sum(durs) - total
    if excess > 1e-9:
        free = [i for i in range(len(durs)) if i not in short]
        free_total = sum(durs[i] for i in free)
        for i in free:
            durs[i] -= excess * durs[i] / free_total
    return [round(d, 3) for d in durs]

def _esc_ad(t):
    return t.replace("\\", "").replace("{", "").replace("}", "").strip()

def build_ass_ad(ws, W, H):
    head = (
        "[Script Info]\nScriptType: v4.00+\nPlayResX: %d\nPlayResY: %d\nWrapStyle: 0\n\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV\n"
        "Style: Ad,Poppins,78,&H00FFFFFF,&H00000000,&H00000000,1,0,1,6,2,5,90,90,0\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    ) % (W, H)
    out = []
    for g in _group_words(ws, max_words=3, max_chars=20):
        for j in range(len(g)):
            start = g[j][1]
            end = g[j + 1][1] if j + 1 < len(g) else g[j][2]
            if end <= start:
                end = start + 0.06
            parts = []
            for k in range(len(g)):
                u = _esc_ad(g[k][0])
                parts.append("{\\c%s}%s{\\rAd}" % (AMBER_ASS, u) if k == j else u)
            out.append("Dialogue: 0,%s,%s,Ad,,0,0,0,,%s" % (ass_time(start), ass_time(end), " ".join(parts)))
    return head + "\n".join(out) + "\n"

def ad_encode_args():
    return ["-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
            "-r", str(AD_FPS), "-g", "60", "-keyint_min", "60", "-sc_threshold", "0",
            "-maxrate", "8M", "-bufsize", "16M",
            "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
            "-movflags", "+faststart"]

def clip_words_to(ws, end_seconds):
    out = []
    for w, s, e in ws:
        if s >= end_seconds:
            continue
        out.append((w, s, min(e, end_seconds)))
    return out

AD_ASSETS = {
    "Poppins-Bold.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-Bold.ttf",
    "Poppins-SemiBold.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-SemiBold.ttf",
    "logo.png": "https://www.fishpin.app/favicon/apple-icon.png",
}

def _download(url, dest, min_bytes=1024):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
        shutil.copyfileobj(r, f)
    if os.path.getsize(dest) < min_bytes:
        os.remove(dest)
        raise RuntimeError("download too small: " + url)

def ensure_ad_assets():
    paths = {}
    for name, url in AD_ASSETS.items():
        dest = os.path.join(ASSETS_DIR, name)
        if not os.path.exists(dest):
            try:
                _download(url, dest)
            except Exception as e:
                raise AdRequestError(502, "could not fetch asset %s: %s" % (name, e))
        paths[name] = dest
    return paths

_WHISPER_ML = None
def transcribe_words_multilingual(audio_path, script):
    global _WHISPER_ML
    from faster_whisper import WhisperModel
    if _WHISPER_ML is None:
        _WHISPER_ML = WhisperModel("small", device="cpu", compute_type="int8")
    segments, _ = _WHISPER_ML.transcribe(audio_path, language="tl", initial_prompt=(script or "")[:800],
                                         word_timestamps=True, vad_filter=True)
    out = []
    for seg in segments:
        for w in (seg.words or []):
            t = (w.word or "").strip()
            if t:
                out.append((t, float(w.start), float(w.end)))
    return out

def _write_text(workdir, name, text):
    p = os.path.join(workdir, name)
    with open(p, "w", encoding="utf-8") as f:
        f.write(text)
    return p

def _ffpath(p):
    # ffmpeg filter arguments: escape backslash and colon (paths only)
    return p.replace("\\", "/").replace(":", "\\:")

def render_ad(payload, workdir):
    p = validate_ad_payload(payload)
    assets = ensure_ad_assets()
    W, H, F = AD_W, AD_H, AD_FPS
    ec = p["end_card"]

    audio = os.path.join(workdir, "vo.wav")
    with open(audio, "wb") as f:
        f.write(base64.b64decode(p["audio_b64"]))
    audio_s = probe_duration(audio)
    if audio_s <= 0:
        raise AdRequestError(400, "audio_b64 is not readable audio")

    durs = scale_scene_durations([sc["seconds"] for sc in p["scenes"]], audio_s, ec["seconds"])
    content_end = sum(durs)
    total = content_end + ec["seconds"]

    segs, ambient = [], None
    t_cursor = 0.0
    for i, sc in enumerate(p["scenes"]):
        d = durs[i]
        frames = max(2, int(round(d * F)))
        seg = os.path.join(workdir, "seg_%02d.mp4" % i)
        # identical codec, size, rate and timescale on every segment, so the concat can stream-copy
        enc = ["-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", str(F),
               "-video_track_timescale", "15360", "-t", "%.3f" % d, seg]
        if sc["type"] == "video":
            src = os.path.join(workdir, "clip_%02d.mp4" % i)
            with open(src, "wb") as f:
                f.write(base64.b64decode(sc["b64"]))
            vf = ("scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d,fps=%d,setsar=1,"
                  "tpad=stop_mode=clone:stop_duration=%.3f,format=yuv420p") % (W, H, W, H, F, d)
            run(["ffmpeg", "-y", "-i", src, "-vf", vf] + enc)
            if sc.get("ambient") and ambient is None:
                amb = os.path.join(workdir, "ambient.wav")
                try:
                    run(["ffmpeg", "-y", "-i", src, "-vn", "-t", "%.3f" % d, "-ac", "2", "-ar", "48000", amb])
                    ambient = (amb, t_cursor)
                except Exception:
                    ambient = None
        elif sc["type"] == "image":
            src = os.path.join(workdir, "img_%02d.png" % i)
            with open(src, "wb") as f:
                f.write(base64.b64decode(sc["b64"]))
            z = "min(1.0+0.004*on,1.35)" if sc.get("punch") else "min(1.0+0.0006*on,1.18)"
            vf = ("scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d,"
                  "zoompan=z='%s':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=%d:s=%dx%d:fps=%d,setsar=1,format=yuv420p"
                  ) % (UP * W, UP * H, UP * W, UP * H, z, frames, W, H, F)
            # a single input frame: zoompan's d=frames emits exactly the scene's frames
            run(["ffmpeg", "-y", "-i", src, "-vf", vf] + enc)
        else:
            src = os.path.join(workdir, "scr_%02d.png" % i)
            try:
                _download(sc["url"], src)
            except Exception as e:
                raise AdRequestError(502, "could not fetch screen %s: %s" % (sc["url"], e))
            vf = ("scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2:color=%s,"
                  "zoompan=z='min(1.0+0.0004*on,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=%d:s=%dx%d:fps=%d,setsar=1,format=yuv420p"
                  ) % (2 * W, 2 * H, 2 * W, 2 * H, PERSIAN_HEX, frames, W, H, F)
            run(["ffmpeg", "-y", "-i", src, "-vf", vf] + enc)
        segs.append(seg)
        t_cursor += d

    # end card: Persian Blue, logo, wordmark, CTA, url (text via textfile: no escaping)
    brand_txt = _write_text(workdir, "brand.txt", "FishPin")
    cta_txt = _write_text(workdir, "cta.txt", ec["cta"])
    url_txt = _write_text(workdir, "url.txt", ec["url"])
    bold, semi = _ffpath(assets["Poppins-Bold.ttf"]), _ffpath(assets["Poppins-SemiBold.ttf"])
    card = os.path.join(workdir, "seg_end.mp4")
    card_fc = ("[1:v]scale=260:-1[lg];[0:v][lg]overlay=(W-w)/2:620[a];"
               "[a]drawtext=fontfile='%s':textfile='%s':fontsize=110:fontcolor=white:x=(w-text_w)/2:y=920[b];"
               "[b]drawtext=fontfile='%s':textfile='%s':fontsize=64:fontcolor=0xFFC857:x=(w-text_w)/2:y=1110[c];"
               "[c]drawtext=fontfile='%s':textfile='%s':fontsize=54:fontcolor=white:x=(w-text_w)/2:y=1210,format=yuv420p[v]"
               ) % (bold, _ffpath(brand_txt), semi, _ffpath(cta_txt), semi, _ffpath(url_txt))
    run(["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=%s:s=%dx%d:r=%d:d=%.3f" % (PERSIAN_HEX, W, H, F, ec["seconds"]),
         "-i", assets["logo.png"], "-filter_complex", card_fc, "-map", "[v]", "-an",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", str(F),
         "-video_track_timescale", "15360", "-t", "%.3f" % ec["seconds"], card])
    segs.append(card)

    listfile = _write_text(workdir, "list.txt", "".join("file '%s'\n" % os.path.basename(s) for s in segs))
    body = os.path.join(workdir, "body.mp4")
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", listfile, "-c", "copy", body], cwd=workdir)

    words = tokenize_script(p["script"])
    timed = None
    if words:
        try:
            timed = align_script_words(words, transcribe_words_multilingual(audio, p["script"]))
        except Exception:
            timed = None
        if not timed:
            timed = proportional_word_times(words, audio_s)
    with open(os.path.join(workdir, "subs.ass"), "w", encoding="utf-8") as f:
        f.write(build_ass_ad(clip_words_to(timed or [], content_end), W, H))

    inputs = ["-i", body, "-i", assets["logo.png"], "-i", audio]
    fc = [
        "[0:v]ass=subs.ass:fontsdir=%s[vc]" % _ffpath(ASSETS_DIR),
        "[1:v]scale=76:-1[lg]",
        "[vc][lg]overlay=48:64:enable='between(t,1.0,%.3f)'[vl]" % content_end,
        ("[vl]drawtext=fontfile='%s':textfile='%s':fontsize=44:fontcolor=white:borderw=2:bordercolor=black@0.4:"
         "x=136:y=78:enable='between(t,1.0,%.3f)'[vout]") % (bold, _ffpath(brand_txt), content_end),
        "[2:a]aresample=48000,aformat=channel_layouts=stereo,apad[vo]",
    ]
    mix = ["[vo]"]
    idx = 3
    if ambient:
        inputs += ["-i", ambient[0]]
        delay = int(round(ambient[1] * 1000))
        fc.append("[%d:a]volume=0.25,adelay=%d|%d,aresample=48000,aformat=channel_layouts=stereo[amb]" % (idx, delay, delay))
        mix.append("[amb]"); idx += 1
    music = pick_music(len(p["scenes"]))
    if music:
        inputs += ["-i", music]
        fc.append("[%d:a]volume=0.10,aloop=loop=-1:size=2e9,aresample=48000,aformat=channel_layouts=stereo[mus]" % idx)
        mix.append("[mus]")
    if len(mix) > 1:
        fc.append("%samix=inputs=%d:duration=first:normalize=0[aout]" % ("".join(mix), len(mix)))
        amap = "[aout]"
    else:
        amap = "[vo]"
    out = os.path.join(workdir, "out.mp4")
    run(["ffmpeg", "-y"] + inputs + ["-filter_complex", ";".join(fc), "-map", "[vout]", "-map", amap]
        + ad_encode_args() + ["-t", "%.3f" % total, out], cwd=workdir)

    try:
        stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        shutil.copyfile(out, os.path.join(OUTPUT_DIR, "ad-" + stamp + ".mp4"))
        prune_outputs()
    except Exception:
        pass
    return out

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200); self.send_header("Content-Type", "text/plain"); self.end_headers(); self.wfile.write(b"ok")
        elif self.path in ("/videos", "/videos/"):
            files = sorted([f for f in os.listdir(OUTPUT_DIR) if f.endswith(".mp4")], reverse=True)
            rows = "".join('<li><a href="/videos/%s">%s</a></li>' % (f, f) for f in files) or "<li>(none yet)</li>"
            html = ("<html><body style='font-family:sans-serif'><h2>Rendered Reels (%d)</h2><ul>%s</ul></body></html>" % (len(files), rows)).encode("utf-8")
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Content-Length", str(len(html))); self.end_headers(); self.wfile.write(html)
        elif self.path.startswith("/videos/"):
            name = os.path.basename(self.path[len("/videos/"):]); p = os.path.join(OUTPUT_DIR, name)
            if name.endswith(".mp4") and os.path.isfile(p):
                with open(p, "rb") as f:
                    data = f.read()
                self.send_response(200); self.send_header("Content-Type", "video/mp4"); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
            else:
                self.send_response(404); self.end_headers()
        else:
            self.send_response(404); self.end_headers()
    def _json(self, status, obj):
        msg = json.dumps(obj).encode("utf-8")
        self.send_response(status); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(msg))); self.end_headers(); self.wfile.write(msg)

    def do_POST(self):
        if self.path == "/render-ad":
            workdir = tempfile.mkdtemp(prefix="ad-")
            try:
                check_ad_token(self.headers.get("X-Render-Token", ""), os.environ.get("RENDER_AD_TOKEN", ""))
                n = int(self.headers.get("Content-Length", "0"))
                out = render_ad(json.loads(self.rfile.read(n).decode("utf-8")), workdir)
                with open(out, "rb") as f:
                    data = f.read()
                self.send_response(200); self.send_header("Content-Type", "video/mp4")
                self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
            except AdRequestError as e:
                self._json(e.status, {"error": e.message})
            except Exception as e:
                self._json(500, {"error": str(e)})
            finally:
                shutil.rmtree(workdir, ignore_errors=True)
            return
        if self.path != "/render":
            self.send_response(404); self.end_headers(); return
        workdir = tempfile.mkdtemp(prefix="reel-")
        try:
            n = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(n).decode("utf-8"))
            out = render(payload, workdir)
            with open(out, "rb") as f:
                data = f.read()
            self.send_response(200); self.send_header("Content-Type", "video/mp4"); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
        except Exception as e:
            msg = json.dumps({"error": str(e)}).encode("utf-8")
            self.send_response(500); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(msg))); self.end_headers(); self.wfile.write(msg)
        finally:
            shutil.rmtree(workdir, ignore_errors=True)

if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8088), Handler).serve_forever()
