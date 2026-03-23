#!/usr/bin/env bash
# On the VPS: git pull → npm ci → npm run build → publish dist.
# Push from your machine first: git push origin main
set -euo pipefail

VPS_USER="${VPS_USER:-automation}"
VPS_HOST="${VPS_HOST:-87.106.69.120}"
REPO="${REPO:-/home/automation/Client}"
GIT_URL="${GIT_URL:-https://github.com/xason0/Client.git}"
BRANCH="${BRANCH:-main}"
WEB_ROOT="${WEB_ROOT:-/home/automation/client-dist}"

ssh "$VPS_USER@$VPS_HOST" "bash -s" <<EOF
set -euo pipefail
REPO="$REPO"
GIT_URL="$GIT_URL"
BRANCH="$BRANCH"
WEB_ROOT="$WEB_ROOT"
if [ ! -d "\$REPO/.git" ]; then
  git clone "\$GIT_URL" "\$REPO"
fi
cd "\$REPO"
git fetch origin "\$BRANCH"
git checkout "\$BRANCH"
git pull --ff-only origin "\$BRANCH"
npm ci
npm run build
mkdir -p "\$WEB_ROOT"
rsync -av --delete "\$REPO/dist/" "\$WEB_ROOT/"
echo OK
EOF
