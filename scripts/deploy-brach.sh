#!/usr/bin/env bash
# Builds the backend and a standalone Next server here, ships both to brach and restarts its services.
# brach runs them as user services: helpa (Go, 127.0.0.1:8095) and helpa-web (Next, 127.0.0.1:3095).
set -euo pipefail
cd "$(dirname "$0")/.."
site_url="${SITE_URL:-https://brach.taild3399f.ts.net}"
out=.deploy
rm -rf "$out" && mkdir -p "$out"

(cd backend && GOOS=linux GOARCH=amd64 go build -o "../$out/helpa" .)

(cd app && NEXT_OUTPUT=standalone NEXT_DIST_DIR=.next-deploy SITE_URL="$site_url" npm run build)
cp -r app/.next-deploy/standalone "$out/web"
cp -r app/.next-deploy/static "$out/web/.next-deploy/static"
cp -r app/public "$out/web/public"
git checkout -q app/tsconfig.json 2>/dev/null || true

rsync -a --delete "$out/web/" brach:helpa/web/
scp -q "$out/helpa" brach:helpa/helpa.new
ssh brach 'mv ~/helpa/helpa.new ~/helpa/helpa
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/helpa-web.service <<UNIT
[Unit]
Description=Helpa web app
After=helpa.service

[Service]
WorkingDirectory=%h/helpa/web
Environment=PORT=3095 HOSTNAME=127.0.0.1 NODE_ENV=production
ExecStart=%h/.local/node/bin/node server.js
Restart=always

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable -q helpa-web
systemctl --user restart helpa helpa-web
sleep 3
curl -fsS 127.0.0.1:8095/api/health && echo && curl -fsS -o /dev/null -w "web %{http_code}\n" 127.0.0.1:3095/'
