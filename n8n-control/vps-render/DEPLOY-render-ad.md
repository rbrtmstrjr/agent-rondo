# Deploy /render-ad to the VPS as its own service

The live `/opt/reel-render/render.py` (unit `reel-render`, port 8088) is a different, older
variant than the repo's base — it has 97 lines of its own (film-grain vintage, a scanline overlay,
DejaVu-Sans phrase captions, a different zoompan curve) that don't exist upstream. The owner decided
**not** to merge or replace it: `/render-ad` runs as a brand-new, separate service instead.

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
That network's subnet/gateway pair become `<SUBNET>` and `<GATEWAY>`, used in place of the
placeholders in Step 7 below. If `<GATEWAY>` is not `172.18.0.1`, n8n's `renderUrl` must also use the
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

## 5. Install as its own systemd service on port 8090 (only after step 4 printed FAILS=0)
```bash
TOKEN=$(openssl rand -hex 24)
cat > /etc/systemd/system/reel-render-ad.service <<EOF
[Unit]
Description=FishPin /render-ad (separate from reel-render)
After=network.target

[Service]
WorkingDirectory=/opt/reel-render-ad
ExecStart=/opt/reel-render/venv/bin/python3 /opt/reel-render-ad/render.py
Environment=RENDER_ROOT=/opt/reel-render-ad
Environment=RENDER_AD_TOKEN=$TOKEN
Environment=RENDER_AD_PORT=8090
Restart=always

[Install]
WantedBy=multi-user.target
EOF
chmod 600 /etc/systemd/system/reel-render-ad.service
```
The token is inline in this unit file (there's no separate drop-in this time), so `chmod 600` keeps
it from being world-readable — the heredoc alone would otherwise leave it at the default 0644.

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
curl -s http://127.0.0.1:8090/health; echo
echo "$TOKEN"
```
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

Expected: every line `PASS` and `FAILS=0` (now hitting the live `reel-render-ad` service on 8090).
Send the full output. If it does not print `FAILS=0`, run the Rollback section immediately.

## 7. Firewall: lock 8090 to the Docker network, and restore n8n's access to 8088
`ufw --force enable` sets ufw's default INPUT policy to DROP, and container→gateway traffic (n8n
calling `http://<GATEWAY>:8088/render`, the existing reel pipeline) crosses the host's INPUT chain
just like any other inbound connection — so enabling ufw without an explicit allow for 8088 from the
Docker network would silently cut n8n off from the reel service it already depends on today. This
step restores exactly that Docker-network access. What happens to 8088's *public* exposure depends
on ufw's starting state (see below) — it is not simply "unchanged" in every case.
```bash
ufw status numbered
```
If any existing rule allows `8090` from `Anywhere`, delete it: `ufw delete <n>`. Rule numbers shift
after every delete — re-run `ufw status numbered` again before deleting the next one; never delete
by a number you read before the previous delete.

**Check this listing for a `DENY` rule on port `8088`.** An earlier revision of this very runbook
paired a Docker-subnet 8088 allow with a public `ufw deny 8088/tcp`, so a box deployed under that
revision may already have one. ufw evaluates `ufw-user-input` first-rule-wins, and a plain appended
allow lands *after* that existing DENY — so it would never actually match, and n8n would stay cut
off exactly as this step exists to prevent. Two ways to fix it:
- **Preferred:** insert the new 8088 allow at position 1 instead of appending it (the always-run
  block below already does this — `ufw insert 1 allow from <SUBNET> to any port 8088 proto tcp` —
  precisely for this reason), so it is evaluated before any existing rule, including a stale DENY,
  without deleting or otherwise touching that DENY or anything else already there.
- Delete the stale DENY instead (`ufw delete <n>`, re-running `ufw status numbered` between deletes
  since numbers shift). This also works, but it changes 8088's public exposure — that DENY may have
  been intentional — so only do this if you've confirmed with the owner that opening 8088 publicly
  is fine. Insert is the safer default; prefer it unless you have a specific reason to delete.

Leave every other existing `8088` rule exactly as you find it — this step's only change to 8088 is
the one inserted Docker-network-scoped allow described above.

If `ufw status` above showed **inactive**, check what else is publicly listening before enabling it,
so this step can't accidentally cut off something the owner relies on:
```bash
ss -tlnp
```
For every host port listed besides `22` (SSH), `8088` and `8090` (both handled explicitly below,
not as generic public allows), add an explicit allow — e.g.:
```bash
ufw allow 80/tcp
ufw allow 443/tcp
# ... and any other service the owner relies on
```
Docker-published ports do not need a rule here — Docker manages its own iptables rules independently
of ufw.

Before enabling, get a baseline for the 8088 health check so a pre-existing problem is never
mistaken for one this step caused:
```bash
docker exec <N8N_CONTAINER> wget -qO- http://<GATEWAY>:8088/health; echo
```
Note whether this prints `ok`. If it does **not**, that is a pre-existing condition unrelated to
this firewall change — record it now, and do not treat the same check failing again after `ufw
--force enable` below as a firewall regression; it was already broken before ufw was touched.

Then, always:
```bash
ufw allow OpenSSH
ufw allow from <SUBNET> to any port 8090 proto tcp
ufw deny 8090/tcp
ufw insert 1 allow from <SUBNET> to any port 8088 proto tcp
ufw --force enable
ufw status numbered
docker exec <N8N_CONTAINER> wget -qO- http://<GATEWAY>:8090/health; echo
docker exec <N8N_CONTAINER> wget -qO- http://<GATEWAY>:8088/health; echo
curl -sI https://n8n.srv1193790.hstgr.cloud | head -1
```
`<SUBNET>` and `<GATEWAY>` are the values discovered in step 1 — do not assume `172.18.0.0/16` /
`172.18.0.1` without checking step 1's output. The inserted 8088 rule only restores the
Docker-network access the reel service already had — it is not `ufw allow 8088/tcp` (which would
open it to Anywhere).

**On 8088's public exposure specifically:** if ufw was already active before this step, its existing
8088 rules (checked above) are left exactly as found. If ufw was **inactive**, enabling it now closes
8088 to the public internet, the same as every other port not explicitly allowed — this is
deliberate (the `ss -tlnp` sweep above intentionally excludes 8088 from the generic public-allow
list), not an oversight. Either way, only the Docker network keeps access to 8088 through the
inserted rule.

Expected: the pre-enable 8088 baseline above matched what you expected (or its failure was already
noted as pre-existing), and now **both** `docker exec` checks print `ok` (8090 confirms the new
service; 8088 confirms n8n's access to the existing reel service survived enabling ufw) and the
`curl` prints an HTTP status line (n8n is still publicly reachable). **If either post-enable
`docker exec` check newly fails (i.e. the 8088 one printed `ok` in the baseline but not now), or the
`curl` fails, run `ufw disable` immediately and send the output** — do not leave the firewall in a
broken state. Once everything checks out, the controller separately confirms the public probe of
`:8090/health` no longer answers.

## Rollback
```bash
systemctl disable --now reel-render-ad
# optionally also remove its files entirely:
# rm -rf /opt/reel-render-ad
```
The `reel-render` service itself (its `render.py`, its systemd unit) was never touched by this
deploy, so there is nothing to restore there. Step 7's inserted `ufw ... allow from <SUBNET> to any
port 8088` rule is purely additive (it only restores Docker-network access that existed before ufw
was enabled) and safe to leave in place even after this rollback.
