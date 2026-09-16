#!/usr/bin/env bash
# Run ON THE VPS after deploying: RENDER_AD_TOKEN=<token> bash smoke_render_ad.sh
# Defaults to the reel-render-ad service (port 8090, RENDER_ROOT=/opt/reel-render-ad).
# Optional: PORT=8089 to point at a staging instance instead of the live one on 8090.
# Optional: RENDER_ROOT=<dir> to match the render.py instance under test (defaults to
# /opt/reel-render-ad, reel-render-ad's root) -- used only to avoid polluting its output/.
set -u
PORT="${PORT:-8090}"
OUT_DIR="${RENDER_ROOT:-/opt/reel-render-ad}/output"
BEFORE_FILES=$(ls "$OUT_DIR" 2>/dev/null || true)
[ -n "${RENDER_AD_TOKEN:-}" ] || { echo "set RENDER_AD_TOKEN"; exit 2; }
T=$(mktemp -d); cd "$T"; FAILS=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; FAILS=$((FAILS+1)); }

cleanup() {
  kill "${HTTPD_PID:-}" 2>/dev/null
  if [ -d "$OUT_DIR" ]; then
    for f in "$OUT_DIR"/reel-*.mp4 "$OUT_DIR"/ad-*.mp4; do
      [ -e "$f" ] || continue
      base=$(basename "$f")
      if ! printf '%s\n' "$BEFORE_FILES" | grep -Fxq "$base"; then
        rm -f "$f"
        echo "INFO  removed test output: $base"
      fi
    done
  fi
  rm -rf "$T"
}
trap cleanup EXIT

ffmpeg -loglevel error -y -f lavfi -i testsrc2=s=1080x1920:r=24:d=6 -f lavfi -i sine=f=300:d=6 -shortest -c:v libx264 -pix_fmt yuv420p -c:a aac clip.mp4 || { echo "fixture failed: clip.mp4"; exit 2; }
ffmpeg -loglevel error -y -f lavfi -i color=c=0x147DFF:s=1024x1536 -frames:v 1 img.png || { echo "fixture failed: img.png"; exit 2; }
ffmpeg -loglevel error -y -f lavfi -i sine=f=220:d=20 -ac 1 -ar 24000 vo.wav || { echo "fixture failed: vo.wav"; exit 2; }

imgsize=$(stat -c %s img.png)
[ "$imgsize" -ge 1024 ] || { echo "img.png is only $imgsize bytes (render() rejects downloads under 1024 bytes)"; exit 2; }

# regression: serve img.png locally so this service's own /render endpoint (image_url based,
# the code shared with reel-render but NOT a probe of the separate live reel-render service)
# can fetch it
python3 -m http.server 8099 --bind 127.0.0.1 >/tmp/smoke-http.log 2>&1 &
HTTPD_PID=$!

ready=0
for _ in $(seq 1 20); do
  if curl -s -o /dev/null http://127.0.0.1:8099/img.png; then ready=1; break; fi
  sleep 0.5
done
[ "$ready" = "1" ] || { echo "fixture http.server on 8099 never came up"; exit 2; }

python3 - <<'PY'
import base64, json
b = lambda p: base64.b64encode(open(p, "rb").read()).decode()
scenes = [{"type": "video", "b64": b("clip.mp4"), "seconds": 3, "ambient": True},
          {"type": "image", "b64": b("img.png"), "seconds": 3, "punch": True},
          {"type": "screen", "url": "https://www.fishpin.app/images/onboarding/onboarding4.png", "seconds": 4},
          {"type": "image", "b64": b("img.png"), "seconds": 4}]
p = {"audio_b64": b("vo.wav"), "script": "Gabi na sa laot at nawala ang signal pero alam mo pa rin kung nasaan ka.",
     "language": "tl", "scenes": scenes, "end_card": {"cta": "I-download sa Play Store", "url": "www.fishpin.app", "seconds": 3.5}}
json.dump(p, open("ok.json", "w"))
p["scenes"] = [{"type": "screen", "url": "https://evil.example/x.png", "seconds": 4}]
json.dump(p, open("bad.json", "w"))
old = {"scenes": [{"image_url": "http://127.0.0.1:8099/img.png", "narration": "test one"},
                   {"image_url": "http://127.0.0.1:8099/img.png", "narration": "test two"}],
       "audio_b64": b("vo.wav")}
json.dump(old, open("render_old.json", "w"))
PY

code=$(curl -s -o render_old_out.mp4 -w '%{http_code}' --max-time 600 -X POST "http://127.0.0.1:$PORT/render" -H 'Content-Type: application/json' --data-binary @render_old.json)
if [ "$code" = "200" ] && ffprobe -v error -select_streams v:0 -show_entries stream=codec_type -of default=nw=1:nk=1 render_old_out.mp4 2>/dev/null | grep -q video; then
  pass "/render still renders on this service"
else
  fail "/render still renders on this service -> $code: $(head -c 400 render_old_out.mp4)"
fi

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$PORT/render-ad" -H 'Content-Type: application/json' --data-binary @ok.json)
[ "$code" = "401" ] && pass "no token -> 401" || fail "no token -> $code"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$PORT/render-ad" -H "X-Render-Token: $RENDER_AD_TOKEN" -H 'Content-Type: application/json' --data-binary @bad.json)
[ "$code" = "400" ] && pass "off-domain screen -> 400" || fail "off-domain screen -> $code"
code=$(curl -s -o out.mp4 -w '%{http_code}' --max-time 600 -X POST "http://127.0.0.1:$PORT/render-ad" -H "X-Render-Token: $RENDER_AD_TOKEN" -H 'Content-Type: application/json' --data-binary @ok.json)
[ "$code" = "200" ] && pass "render -> 200" || { fail "render -> $code: $(head -c 400 out.mp4)"; echo "FAILS=$FAILS"; exit 1; }

v() { ffprobe -v error -select_streams v:0 -show_entries stream="$1" -of default=nw=1:nk=1 out.mp4; }
a() { ffprobe -v error -select_streams a:0 -show_entries stream="$1" -of default=nw=1:nk=1 out.mp4; }
[ "$(v width)" = "1080" ] && [ "$(v height)" = "1920" ] && pass "1080x1920" || fail "size $(v width)x$(v height)"
[ "$(v r_frame_rate)" = "30/1" ] && pass "30fps" || fail "fps $(v r_frame_rate)"
[ "$(v codec_name)" = "h264" ] && [ "$(v pix_fmt)" = "yuv420p" ] && pass "h264 yuv420p" || fail "video $(v codec_name) $(v pix_fmt)"
[ "$(a codec_name)" = "aac" ] && [ "$(a sample_rate)" = "48000" ] && [ "$(a channels)" = "2" ] && pass "aac 48k stereo" || fail "audio $(a codec_name) $(a sample_rate) $(a channels)"
dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 out.mp4)
python3 -c "import sys; sys.exit(0 if abs($dur-20.4)<0.4 else 1)" && pass "duration $dur ~ 20.4s" || fail "duration $dur (expected ~20.4)"
kf=$(ffprobe -v error -select_streams v:0 -skip_frame nokey -show_entries frame=pts_time -of csv=p=0 out.mp4 | head -3 | tr '\n' ' ')
echo "INFO  first keyframes at: $kf (expect 0, 2, 4)"
[ "$(curl -s "http://127.0.0.1:$PORT/health")" = "ok" ] && pass "/health still ok" || fail "/health"
echo "FAILS=$FAILS"; [ "$FAILS" = "0" ]
