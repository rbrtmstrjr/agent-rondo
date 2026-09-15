#!/usr/bin/env bash
# Run ON THE VPS after deploying: RENDER_AD_TOKEN=<token> bash smoke_render_ad.sh
set -u
T=$(mktemp -d); cd "$T"; FAILS=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; FAILS=$((FAILS+1)); }
[ -n "${RENDER_AD_TOKEN:-}" ] || { echo "set RENDER_AD_TOKEN"; exit 2; }

ffmpeg -loglevel error -y -f lavfi -i testsrc2=s=1080x1920:r=24:d=6 -f lavfi -i sine=f=300:d=6 -shortest -c:v libx264 -pix_fmt yuv420p -c:a aac clip.mp4
ffmpeg -loglevel error -y -f lavfi -i color=c=0x147DFF:s=1024x1536 -frames:v 1 img.png
ffmpeg -loglevel error -y -f lavfi -i sine=f=220:d=20 -ac 1 -ar 24000 vo.wav
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
PY

code=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8088/render-ad -H 'Content-Type: application/json' --data-binary @ok.json)
[ "$code" = "401" ] && pass "no token -> 401" || fail "no token -> $code"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8088/render-ad -H "X-Render-Token: $RENDER_AD_TOKEN" -H 'Content-Type: application/json' --data-binary @bad.json)
[ "$code" = "400" ] && pass "off-domain screen -> 400" || fail "off-domain screen -> $code"
code=$(curl -s -o out.mp4 -w '%{http_code}' --max-time 600 -X POST http://127.0.0.1:8088/render-ad -H "X-Render-Token: $RENDER_AD_TOKEN" -H 'Content-Type: application/json' --data-binary @ok.json)
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
[ "$(curl -s http://127.0.0.1:8088/health)" = "ok" ] && pass "/health still ok" || fail "/health"
echo "FAILS=$FAILS"; [ "$FAILS" = "0" ]
