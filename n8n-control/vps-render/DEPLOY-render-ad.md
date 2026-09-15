# Deploy /render-ad to the VPS

Run in the Hostinger browser terminal as root. Stop at any unexpected output and report it.

## 1. Fingerprint, back up and check prerequisites

### Fingerprint + backup
```bash
md5sum /opt/reel-render/render.py
BAK=/opt/reel-render/render.py.bak-$(date +%Y%m%d%H%M)
cp /opt/reel-render/render.py "$BAK"
echo "$BAK"
```
The new `render.py` is built on the repo base file, md5 `08e7ebce6dcb2268e1ae5b09ef1e2a85`. **STOP unless the live md5 equals that exactly** — if it is anything else (including a prior deploy's `70f5623a628477f3cd361ab706ddd0e4`), STOP and send `cat /opt/reel-render/render.py` so the change can be rebased onto the live file. Report the md5 and the `$BAK` path.

### Prerequisite checks (STOP if any looks wrong — send the output)
```bash
ffmpeg -hide_banner -filters | grep -E ' (drawtext|ass|zoompan|amix) '
systemctl cat reel-render
docker ps --format '{{.Names}}'
```
- The `ffmpeg -filters` grep must list all four filters (`drawtext`, `ass`, `zoompan`, `amix`). STOP if any is missing.
- `systemctl cat reel-render` confirms the unit name and shows a `User=` line (or none, meaning root). Note which user runs the service — needed for step 3.
- `docker ps` lists the real running container names. Find the n8n container and use its name below as `<N8N_CONTAINER>`.
```bash
docker network inspect $(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' <N8N_CONTAINER>) -f '{{range .IPAM.Config}}{{.Subnet}} {{.Gateway}}{{end}}'
```
This prints the real Docker network's subnet and gateway as `<SUBNET> <GATEWAY>` (e.g. `172.18.0.0/16 172.18.0.1`). Use the discovered `<SUBNET>` and `<GATEWAY>` in place of the placeholders in steps 5 and 7 below. If `<GATEWAY>` is not `172.18.0.1`, the render URL configured in n8n must also use the discovered gateway, not `172.18.0.1`.

## 2. Download the new files to a staging copy (does not touch the live render.py)
The controller uploads both files (they contain no secrets) and gives you two URLs and two md5s.
```bash
mkdir -p /opt/reel-render/staging
curl -fsSL "<RENDER_URL>" -o /opt/reel-render/staging/render.py && md5sum /opt/reel-render/staging/render.py
curl -fsSL "<SMOKE_URL>" -o /opt/reel-render/staging/smoke_render_ad.sh && md5sum /opt/reel-render/staging/smoke_render_ad.sh
/opt/reel-render/venv/bin/python3 -m py_compile /opt/reel-render/staging/render.py
```
Verify both md5s against the ones the controller gave you before continuing.

## 3. Pre-download the multilingual Whisper model (as the service's user)
Use the `User=` value found in step 1's `systemctl cat reel-render` output — the model cache must land where the systemd service will actually look for it.
```bash
# if reel-render runs as root (no User= line, or User=root):
/opt/reel-render/venv/bin/python3 -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8'); print('whisper small ready')"
# if reel-render runs as a non-root User=<ServiceUser>:
sudo -u <ServiceUser> /opt/reel-render/venv/bin/python3 -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8'); print('whisper small ready')"
```
Run whichever line matches step 1's `User=` finding.

## 4. Test the staged copy on port 8089
This runs the staged `render.py` as its own process against a throwaway `RENDER_ROOT`, so nothing touches the live output folder and the live service on 8088 is never stopped or restarted.
```bash
mkdir -p /opt/reel-render/staging-root/output /opt/reel-render/staging-root/music /opt/reel-render/staging-root/assets
cp -a /opt/reel-render/music/. /opt/reel-render/staging-root/music/ 2>/dev/null || true
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
Re-read the token from the drop-in rather than relying on step 5's shell variable still being set (it will not survive a terminal reconnect):
```bash
TOKEN=$(sed -n 's/^Environment=RENDER_AD_TOKEN=//p' /etc/systemd/system/reel-render.service.d/render-ad.conf)
RENDER_AD_TOKEN="$TOKEN" bash /opt/reel-render/staging/smoke_render_ad.sh
```
Expected: every line `PASS` and `FAILS=0` (default `PORT=8088`, so this hits the live service). Send the full output. If it does not print `FAILS=0`, run the Rollback section immediately.

## 7. Firewall port 8088 to the Docker network only
```bash
ufw status numbered
```
If any existing rule allows `8088` from `Anywhere`, delete it first (using the number shown): `ufw delete <n>`.
```bash
ufw allow OpenSSH
ufw allow from <SUBNET> to any port 8088 proto tcp
ufw deny 8088/tcp
ufw --force enable
ufw status numbered
docker exec <N8N_CONTAINER> wget -qO- http://<GATEWAY>:8088/health; echo
```
`<SUBNET>` and `<GATEWAY>` are the values discovered in step 1 (e.g. `172.18.0.0/16` and `172.18.0.1`) — do not assume those defaults without checking step 1's output. Expected: the last command prints `ok`. The controller then confirms the public probe of `:8088/health` no longer answers.

## Rollback
```bash
cp "$(ls -t /opt/reel-render/render.py.bak-* | head -1)" /opt/reel-render/render.py && systemctl restart reel-render
```
