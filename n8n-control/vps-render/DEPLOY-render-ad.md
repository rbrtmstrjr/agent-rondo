# Deploy /render-ad to the VPS

Run in the Hostinger browser terminal as root. Stop at any unexpected output and report it.

## 1. Fingerprint and back up the live service
```bash
md5sum /opt/reel-render/render.py
cp /opt/reel-render/render.py /opt/reel-render/render.py.bak-$(date +%Y%m%d%H%M)
```
Report the md5. Known versions: repo base `08e7ebce6dcb2268e1ae5b09ef1e2a85`, later deploy `70f5623a628477f3cd361ab706ddd0e4`. If it is neither, STOP and send `cat /opt/reel-render/render.py` so the change is rebased onto the live file.

## 2. Download the new files to a staging copy (does not touch the live render.py)
The controller uploads both files (they contain no secrets) and gives you two URLs and two md5s.
```bash
mkdir -p /opt/reel-render/staging
curl -fsSL "<RENDER_URL>" -o /opt/reel-render/staging/render.py && md5sum /opt/reel-render/staging/render.py
curl -fsSL "<SMOKE_URL>" -o /opt/reel-render/staging/smoke_render_ad.sh && md5sum /opt/reel-render/staging/smoke_render_ad.sh
/opt/reel-render/venv/bin/python3 -m py_compile /opt/reel-render/staging/render.py
```
Verify both md5s against the ones the controller gave you before continuing.

## 3. Pre-download the multilingual Whisper model
```bash
/opt/reel-render/venv/bin/python3 -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8'); print('whisper small ready')"
```

## 4. Test the staged copy on port 8089
This runs the staged `render.py` as its own process against a throwaway `RENDER_ROOT`, so nothing touches the live output folder and the live service on 8088 is never stopped or restarted.
```bash
mkdir -p /opt/reel-render/staging-root/output /opt/reel-render/staging-root/music /opt/reel-render/staging-root/assets
TEST_TOKEN=$(openssl rand -hex 16)
RENDER_ROOT=/opt/reel-render/staging-root RENDER_AD_TOKEN=$TEST_TOKEN nohup /opt/reel-render/venv/bin/python3 -c "import sys; sys.path.insert(0,'/opt/reel-render/staging'); import render; from http.server import ThreadingHTTPServer; ThreadingHTTPServer(('127.0.0.1', 8089), render.Handler).serve_forever()" > /tmp/render-staging.log 2>&1 &
STAGING_PID=$!
sleep 3
curl -s http://127.0.0.1:8089/health; echo
PORT=8089 RENDER_AD_TOKEN=$TEST_TOKEN bash /opt/reel-render/staging/smoke_render_ad.sh
kill $STAGING_PID
```
Expected: `/health` prints `ok`, every smoke-test line is `PASS`, and `FAILS=0`. If anything fails: STOP, send the full output and `tail -50 /tmp/render-staging.log`; the live service on 8088 has not been touched.

## 5. Install and restart (only after step 4 printed FAILS=0)
```bash
cp /opt/reel-render/staging/render.py /opt/reel-render/render.py
TOKEN=$(openssl rand -hex 24)
mkdir -p /etc/systemd/system/reel-render.service.d
printf '[Service]\nEnvironment=RENDER_AD_TOKEN=%s\n' "$TOKEN" > /etc/systemd/system/reel-render.service.d/render-ad.conf
chmod 600 /etc/systemd/system/reel-render.service.d/render-ad.conf
systemctl daemon-reload && systemctl restart reel-render && sleep 2 && curl -s http://127.0.0.1:8088/health; echo
echo "$TOKEN"
```
Copy the token into your local `n8n-control/.env` as `FISHPIN_RENDER_TOKEN=<token>` yourself. Do not paste it into chat.

## 6. Smoke test the live service
```bash
RENDER_AD_TOKEN="$TOKEN" bash /opt/reel-render/staging/smoke_render_ad.sh
```
Expected: every line `PASS` and `FAILS=0` (default `PORT=8088`, so this hits the live service). Send the full output. If it does not print `FAILS=0`, run the Rollback section immediately.

## 7. Firewall port 8088 to the Docker network only
```bash
ufw status
```
If ufw is **inactive**, first run `ufw allow OpenSSH` so you keep terminal access, then:
```bash
ufw allow from 172.18.0.0/16 to any port 8088 proto tcp
ufw deny 8088/tcp
ufw --force enable
ufw status numbered
docker exec n8n-n8n-1 wget -qO- http://172.18.0.1:8088/health; echo
```
Expected: the last command prints `ok`. The controller then confirms the public probe of `:8088/health` no longer answers.

## Rollback
```bash
cp /opt/reel-render/render.py.bak-<stamp> /opt/reel-render/render.py && systemctl restart reel-render
```
