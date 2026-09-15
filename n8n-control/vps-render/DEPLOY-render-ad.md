# Deploy /render-ad to the VPS

Run in the Hostinger browser terminal as root. Stop at any unexpected output and report it.

## 1. Fingerprint, back up and check prerequisites

### Fingerprint (check BEFORE backing up)
```bash
md5sum /opt/reel-render/render.py
```
The new `render.py` is built on the repo base file, md5 `08e7ebce6dcb2268e1ae5b09ef1e2a85`. **STOP unless the live md5 equals that exactly** — if it is anything else (including a prior deploy's `70f5623a628477f3cd361ab706ddd0e4`), STOP and send `cat /opt/reel-render/render.py` so the change can be rebased onto the live file. Do **not** back up yet — only proceed to the backup once the md5 has been confirmed to match, so that re-running this step after a swap can never make the newest backup a copy of the new file instead of the original.

### Only once the md5 matches: back up
```bash
BAK=/opt/reel-render/render.py.bak-$(date +%Y%m%d%H%M)
cp /opt/reel-render/render.py "$BAK"
echo "$BAK"
```
Report the md5 and the `$BAK` path.

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
docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{println $k}}{{end}}' <N8N_CONTAINER>
```
This lists every Docker network the n8n container is attached to, one per line — there can be more than one. For each network name printed, inspect it:
```bash
docker network inspect <NETWORK_NAME> -f '{{range .IPAM.Config}}{{println .Subnet .Gateway}}{{end}}'
```
Use the network that the render service's gateway actually belongs to — normally the one whose gateway n8n already uses today, `172.18.0.1`. That network's subnet/gateway pair become `<SUBNET>` and `<GATEWAY>`, used in place of the placeholders in Step 7 below. If `<GATEWAY>` is not `172.18.0.1`, the render URL configured in n8n must also use the discovered gateway, not `172.18.0.1`.

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
RENDER_ROOT=/opt/reel-render/staging-root PORT=8089 RENDER_AD_TOKEN=$TEST_TOKEN bash /opt/reel-render/staging/smoke_render_ad.sh
kill $STAGING_PID
```
Passing `RENDER_ROOT=/opt/reel-render/staging-root` to the smoke script itself (not only to the staging server) matters: without it, the smoke script's own output-folder cleanup falls back to `/opt/reel-render/output` — the **live** service's folder — so its cleanup trap could delete real reel/ad files the live service writes during this staging run, while the actual staging output under `staging-root/output` never gets cleaned up at all.

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
**Warning:** this run is against the live `render.py` with the live `RENDER_ROOT`, so its cleanup trap only protects the reel/ad files that already existed before it started — any real reel or ad that a live pipeline finishes rendering during these few minutes could get swept up and deleted along with the test output. Only run this step when you're confident no real reel/ad render is in flight.

Expected: every line `PASS` and `FAILS=0` (default `PORT=8088`, so this hits the live service). Send the full output. If it does not print `FAILS=0`, run the Rollback section immediately.

## 7. Firewall port 8088 to the Docker network only
```bash
ufw status numbered
```
If any existing rule allows `8088` from `Anywhere`, delete it: `ufw delete <n>`. Rule numbers shift after every delete — re-run `ufw status numbered` again before deleting the next one; never delete by a number you read before the previous delete.

If `ufw status` above showed **inactive**, check what else is publicly listening before enabling it, so this step can't accidentally cut off something the owner relies on:
```bash
ss -tlnp
```
For every host port listed besides `22` (SSH) and `8088` (the render service), add an explicit allow — e.g.:
```bash
ufw allow 80/tcp
ufw allow 443/tcp
# ... and any other service the owner relies on
```
Docker-published ports do not need a rule here — Docker manages its own iptables rules independently of ufw.

Then, always:
```bash
ufw allow OpenSSH
ufw allow from <SUBNET> to any port 8088 proto tcp
ufw deny 8088/tcp
ufw --force enable
ufw status numbered
docker exec <N8N_CONTAINER> wget -qO- http://<GATEWAY>:8088/health; echo
curl -sI https://n8n.srv1193790.hstgr.cloud | head -1
```
`<SUBNET>` and `<GATEWAY>` are the values discovered in step 1 — do not assume `172.18.0.0/16` / `172.18.0.1` without checking step 1's output.

Expected: the `docker exec` prints `ok` and the `curl` prints an HTTP status line (n8n is still publicly reachable). **If either check fails, run `ufw disable` immediately and send the output** — do not leave the firewall in a broken state. Once both pass, the controller separately confirms the public probe of `:8088/health` no longer answers.

## Rollback
```bash
cp "$(ls -t /opt/reel-render/render.py.bak-* | head -1)" /opt/reel-render/render.py && systemctl restart reel-render
```
