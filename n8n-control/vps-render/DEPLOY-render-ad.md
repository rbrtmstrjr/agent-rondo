# Deploy /render-ad to the VPS as its own service

This repo's `render.py` is the video-ad service's file. The live `/opt/reel-render/render.py`
(unit `reel-render`, port 8088) is a different, older variant that has diverged from it — it has
97 lines of its own (film-grain vintage, a scanline overlay, DejaVu-Sans phrase captions, a
different zoompan curve) that don't exist in this repo, and it is not tracked in git. The owner
decided **not** to merge or replace it: `/render-ad` runs as a brand-new, separate service instead.

**This deploy never copies over, restarts, or backs up `/opt/reel-render/render.py` or the
`reel-render` unit. They are completely out of scope — every step below only ever touches
`/opt/reel-render-ad` and the new `reel-render-ad` unit.**

Run in the Hostinger browser terminal as root. Stop at any unexpected output and report it.

## 1. Prerequisites (no fingerprint/backup of the live render.py — out of scope)
```bash
ffmpeg -hide_banner -filters | grep -E ' (drawtext|ass|zoompan|amix) '
systemctl cat reel-render
docker ps --format '{{.Names}}'
```
- The `ffmpeg -filters` grep must list all four filters (`drawtext`, `ass`, `zoompan`, `amix`). STOP if any is missing.
- `systemctl cat reel-render` is read-only here — we're copying its `ExecStart=`/venv path/`User=`
  conventions for the new unit in step 5, not touching the file itself. Note whether it has a
  `User=` line (and which user) or runs as root.
- `docker ps` lists the real running container names. Find the n8n container and use its name below
  as `<N8N_CONTAINER>`.
```bash
docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{println $k}}{{end}}' <N8N_CONTAINER>
```
This lists every Docker network the n8n container is attached to, one per line — there can be more
than one. For each network name printed, inspect it:
```bash
docker network inspect <NETWORK_NAME> -f '{{range .IPAM.Config}}{{println .Subnet .Gateway}}{{end}}'
```
Use the network whose gateway the render service already talks to today — normally `172.18.0.1`.
That network's gateway becomes `$GATEWAY`, used in place of the placeholder in Steps 5 and 7 below
(it's also what the service will be bound to, so the service is reachable from exactly this
network and nowhere else). If `<GATEWAY>` is not `172.18.0.1`, n8n's `renderUrl` must also use the
discovered gateway (it is currently configured as `http://172.18.0.1:8090/render-ad`).

## 2. Lay down the new service's files under /opt/reel-render-ad
The controller uploads `render.py` and `smoke_render_ad.sh` (they contain no secrets) and gives you
two URLs and two md5s.
```bash
mkdir -p /opt/reel-render-ad/output /opt/reel-render-ad/music /opt/reel-render-ad/assets
curl -fsSL "<RENDER_URL>" -o /opt/reel-render-ad/render.py && md5sum /opt/reel-render-ad/render.py
curl -fsSL "<SMOKE_URL>" -o /opt/reel-render-ad/smoke_render_ad.sh && md5sum /opt/reel-render-ad/smoke_render_ad.sh
/opt/reel-render/venv/bin/python3 -m py_compile /opt/reel-render-ad/render.py
cp -a /opt/reel-render/music/. /opt/reel-render-ad/music/ 2>/dev/null || true
```
Verify both md5s against the ones the controller gave you before continuing. The new service reuses
the **existing** `/opt/reel-render/venv` (it needs the same dependencies — `faster-whisper`, etc. —
already installed there; nothing is installed twice). If the `User=` the new unit runs as (step 5)
differs from that venv's owner, that user must still be able to read and execute everything under
`/opt/reel-render/venv` — check with `ls -la /opt/reel-render/venv/bin/python3` if in doubt.

## 3. Pre-download the multilingual Whisper model (as the new service's user)
Use the same `User=` convention noted from step 1's `systemctl cat reel-render` output — the model
cache must land where the systemd service will actually look for it.
```bash
# if the service will run as root (reel-render had no User= line, or User=root):
/opt/reel-render/venv/bin/python3 -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8'); print('whisper small ready')"
# if it will run as a non-root User=<ServiceUser> (same convention as reel-render):
sudo -u <ServiceUser> /opt/reel-render/venv/bin/python3 -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8'); print('whisper small ready')"
```
Run whichever line matches step 1's `User=` finding.

## 4. Test on 127.0.0.1:8089 before installing anything as a service
```bash
TEST_TOKEN=$(openssl rand -hex 16)
RENDER_ROOT=/opt/reel-render-ad RENDER_AD_TOKEN=$TEST_TOKEN nohup /opt/reel-render/venv/bin/python3 -c "import sys; sys.path.insert(0,'/opt/reel-render-ad'); import render; from http.server import ThreadingHTTPServer; ThreadingHTTPServer(('127.0.0.1', 8089), render.Handler).serve_forever()" > /tmp/render-ad-staging.log 2>&1 &
STAGING_PID=$!
sleep 3
curl -s http://127.0.0.1:8089/health; echo
RENDER_ROOT=/opt/reel-render-ad PORT=8089 RENDER_AD_TOKEN=$TEST_TOKEN bash /opt/reel-render-ad/smoke_render_ad.sh
kill $STAGING_PID
```
This runs the exact files from step 2, from `/opt/reel-render-ad`, against their own
`RENDER_ROOT=/opt/reel-render-ad` — the smoke script's own `RENDER_ROOT` matches so its
output-folder cleanup only ever touches `/opt/reel-render-ad/output`. Nothing has been installed as
a systemd service yet at this point: no unit, no port-8090 listener, and `/opt/reel-render` /
`reel-render` remain completely untouched throughout this step.

Expected: `/health` prints `ok`, every smoke-test line is `PASS`, and `FAILS=0`. If anything fails:
STOP, send the full output and `tail -50 /tmp/render-ad-staging.log`.

## 5. Install as its own systemd service, bound to the Docker gateway only (only after step 4 printed FAILS=0)
Use the `<GATEWAY>` discovered in step 1 (normally `172.18.0.1`, but use the value you actually
found there, not a hardcoded one). Binding the listen address itself — rather than opening the port
and then firewalling it — means the process never accepts a connection from outside the Docker
bridge in the first place:
```bash
TOKEN=$(openssl rand -hex 24)
GATEWAY=172.18.0.1   # replace with the value discovered in step 1 if different
cat > /etc/systemd/system/reel-render-ad.service <<EOF
[Unit]
Description=FishPin /render-ad (separate from reel-render)
After=network.target docker.service
Requires=docker.service

[Service]
WorkingDirectory=/opt/reel-render-ad
ExecStart=/opt/reel-render/venv/bin/python3 /opt/reel-render-ad/render.py
Environment=RENDER_ROOT=/opt/reel-render-ad
Environment=RENDER_AD_TOKEN=$TOKEN
Environment=RENDER_AD_PORT=8090
Environment=RENDER_AD_BIND=$GATEWAY
Restart=always

[Install]
WantedBy=multi-user.target
EOF
chmod 600 /etc/systemd/system/reel-render-ad.service
```
The token is inline in this unit file (there's no separate drop-in this time), so `chmod 600` keeps
it from being world-readable — the heredoc alone would otherwise leave it at the default 0644.
`After=network.target docker.service` plus `Requires=docker.service` make sure the Docker bridge
(and therefore the gateway address the service is about to bind) already exists before this unit
starts; `Restart=always` (already set above) covers the remaining race if the bridge is still
coming up on first boot, since the service will simply retry.

If step 1's `systemctl cat reel-render` showed a `User=` line, add the same `User=<ServiceUser>`
line into the `[Service]` block above (matching `reel-render`'s convention) before continuing — edit
the unit file or re-run the `cat > ... <<EOF` block with it included — and hand the directory over to
that user, since it was created as root back in step 2:
```bash
chown -R <ServiceUser>: /opt/reel-render-ad
```
Note: step 4's staged test ran as root (it started the same venv's python directly with no `User=`
involved), so it never actually exercised this user's read/execute/write permissions — this `chown`,
and the checks below, are the first real test of them. If `reel-render` runs as root, leave `User=`
out and skip the `chown` (root is systemd's default and already owns `/opt/reel-render-ad`).
```bash
ss -tlnp | grep -w 8090 || echo "8090 free"
```
**STOP if anything is already listening on 8090** — investigate before continuing (another
process, a leftover staging server from step 4 that was never killed, etc.). Only move on once this
prints `8090 free`.
```bash
systemctl daemon-reload
systemctl enable --now reel-render-ad
systemctl status reel-render-ad --no-pager | head -5
ss -tlnp | grep -w 8090
docker exec <N8N_CONTAINER> wget -qO- http://$GATEWAY:8090/health; echo
echo "$TOKEN"
```
The `ss` line must show the socket bound to `$GATEWAY:8090`, **not** `0.0.0.0:8090` — if it shows
`0.0.0.0`, `RENDER_AD_BIND` did not take effect (check the unit's `Environment=` line and
`systemctl daemon-reload` above) and the service is reachable from more than the Docker bridge.
`docker exec ... wget` must print `ok` — this is how n8n itself reaches the service, so it is the
real-world check that this bind change hasn't cut n8n off.

Copy the token into your local `n8n-control/.env` as `FISHPIN_RENDER_TOKEN=<token>` yourself. Do not
paste it into chat.

## 6. Smoke test the new live service
Re-read the token from the unit file rather than relying on step 5's shell variable still being set
(it will not survive a terminal reconnect):
```bash
TOKEN=$(sed -n 's/^Environment=RENDER_AD_TOKEN=//p' /etc/systemd/system/reel-render-ad.service)
RENDER_ROOT=/opt/reel-render-ad PORT=8090 RENDER_AD_TOKEN="$TOKEN" bash /opt/reel-render-ad/smoke_render_ad.sh
```
Because this service has its own `RENDER_ROOT` (`/opt/reel-render-ad`, entirely separate from
`/opt/reel-render`), the smoke script's cleanup can never touch the `reel-render` service's real
output — there is no equivalent of the old "only run when no reel is in flight" caution here.

**Note:** `smoke_render_ad.sh` talks to `http://127.0.0.1:$PORT`, and step 5's `RENDER_AD_BIND`
means the live service no longer listens on loopback — so once the service is bound to the gateway,
this script will fail to connect when run against the live instance, not because anything is broken.
Run it here *before* moving the bind to the gateway (i.e. right after step 4's style of test, or
against a temporary staging instance with `RENDER_AD_BIND` unset) to get full `/render` and
`/render-ad` content coverage; once the live service is gateway-bound, step 5's `docker exec ...
wget .../health` and step 7's checks below are what confirm the live, bound instance is reachable
and correct — they just don't re-cover every smoke-test assertion.

Expected: every line `PASS` and `FAILS=0`. If it does not print `FAILS=0`, run the Rollback section
immediately.

## 7. Confirm the bind, not a firewall, is what's protecting the port
No firewall step is needed here — the service never listens anywhere but the Docker gateway, so
there's nothing for a firewall to additionally block. This step just proves that's actually true.
```bash
ss -tlnp | grep -w 8090
```
Must show only `$GATEWAY:8090` (e.g. `172.18.0.1:8090`) — **not** `0.0.0.0:8090` and not
`127.0.0.1:8090`. If you see `0.0.0.0`, stop and recheck the unit's `Environment=RENDER_AD_BIND=`
line and re-run `systemctl daemon-reload && systemctl restart reel-render-ad`.
```bash
docker exec <N8N_CONTAINER> wget -qO- http://$GATEWAY:8090/health; echo
```
Must print `ok` — this is n8n's own path to the service (`renderUrl` in the workflow config points
at `http://$GATEWAY:8090/render-ad`), so this is the real dependency check, not just a syntactic one.

From **outside the box** (not a command run on the VPS itself — a curl run on the box would go over
loopback/the bridge and prove nothing about external reachability; the controller runs this check):
```bash
curl -m 5 http://<PUBLIC_IP>:8090/health
```
Must fail or time out within the 5s limit. If it succeeds, the service is reachable from the public
internet and this step has failed — stop and re-check the bind address before doing anything else.

**If you prefer a firewall instead** (e.g. because a future change needs the service to listen on
more than the Docker bridge): the equivalent `ufw` rules would be `ufw allow from <SUBNET> to any
port 8090 proto tcp` plus `ufw deny 8090/tcp` (the Docker-subnet allow evaluated before the deny),
alongside the pre-existing `8088` rules for the `reel-render` service — see this runbook's git
history for the full worked example. That is not the documented default here: binding the listen
address is simpler, needs no `ufw --force enable` on a box that has never run a firewall before, and
can't be silently defeated by a later `ufw disable` or a misordered rule.

## 8. Rotate the token
The token used while setting this service up was visible on-screen during the deploy session, so
treat it as burned and replace it before relying on this service for real traffic.
```bash
NEWTOKEN=$(openssl rand -hex 24)
sed -i "s/^Environment=RENDER_AD_TOKEN=.*/Environment=RENDER_AD_TOKEN=$NEWTOKEN/" /etc/systemd/system/reel-render-ad.service
chmod 600 /etc/systemd/system/reel-render-ad.service
systemctl daemon-reload
systemctl restart reel-render-ad
systemctl status reel-render-ad --no-pager | head -5
echo "$NEWTOKEN"
```
Copy `$NEWTOKEN` into your local `n8n-control/.env` as `FISHPIN_RENDER_TOKEN=<newtoken>` yourself —
do not paste it into chat — then redeploy the workflow so n8n actually sends the new token:
```powershell
$cfg = @{}; foreach ($l in Get-Content .env) { if ($l -match '^\s*([^=#]+?)\s*=\s*(.*)$') { $cfg[$matches[1]] = $matches[2].Trim() } }
$env:FISHPIN_VIDEO_TRIGGER_SECRET = $cfg["FISHPIN_VIDEO_TRIGGER_SECRET"]; $env:FISHPIN_RENDER_TOKEN = $cfg["FISHPIN_RENDER_TOKEN"]
node builds\07-fishpin-video-ads\build.js
$env:FISHPIN_VIDEO_TRIGGER_SECRET = $null; $env:FISHPIN_RENDER_TOKEN = $null
.\n8n.ps1 update <workflow id> builds\07-fishpin-video-ads\fishpin-video-ads.workflow.json
node builds\07-fishpin-video-ads\build.js   # back to placeholders before any commit
```
Confirm the old token no longer works and the new one does:
```bash
docker exec <N8N_CONTAINER> wget -qO- --header="X-Render-Token: <old token>" --post-data='{}' http://$GATEWAY:8090/render-ad; echo
```
Expect a `401`-style JSON error body for the old token. A real render triggered from `trigger.html`
against the redeployed workflow is the actual proof the new token round-trips end to end.

## Rollback
```bash
systemctl disable --now reel-render-ad
# optionally also remove its files entirely:
# rm -rf /opt/reel-render-ad
```
The `reel-render` service itself (its `render.py`, its systemd unit) was never touched by this
deploy, so there is nothing to restore there. No firewall rules were added by this runbook (the
service is protected by its bind address, not `ufw`), so there is nothing else to undo.
