#!/usr/bin/env bash
# From your laptop: push to GitHub, then run this to SSH into the VPS and deploy.
# To deploy from the VPS shell only, use:  bash scripts/deploy-on-vps.sh
#
# Uses reset --hard so unstaged edits on the VPS cannot block deploys.
#
# CRITICAL: Production API is ~/backend/server.js (SQLite). PM2 name: dataplus-api.
# Reply-meta API fixes live in Client/vps-server.js — sync to backend when needed:
#   bash scripts/sync-vps-server-to-backend.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

VPS_USER="${VPS_USER:-automation}"
VPS_HOST="${VPS_HOST:-87.106.69.120}"
REPO="${REPO:-/home/automation/Client}"
GIT_URL="${GIT_URL:-https://github.com/xason0/Client.git}"
BRANCH="${BRANCH:-main}"
WEB_ROOT="${WEB_ROOT:-/home/automation/client-dist}"

ssh "$VPS_USER@$VPS_HOST" \
  "REPO='$REPO' WEB_ROOT='$WEB_ROOT' BRANCH='$BRANCH' GIT_URL='$GIT_URL' bash -s" \
  <"$SCRIPT_DIR/scripts/deploy-on-vps.sh"
