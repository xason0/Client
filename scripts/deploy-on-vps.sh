#!/usr/bin/env bash
# Run this ON the VPS only (SSH in, then):
#   cd /home/automation/Client && bash scripts/deploy-on-vps.sh
#
# Pulls origin, builds the Vite app, rsyncs static files, reloads PM2.
# Production API + SQLite live in ~/backend/server.js — not Client/server/index.js.
#
# Env overrides: REPO, WEB_ROOT, BRANCH, GIT_URL, BACKEND_JS
set -euo pipefail

REPO="${REPO:-${HOME}/Client}"
WEB_ROOT="${WEB_ROOT:-${HOME}/client-dist}"
BRANCH="${BRANCH:-main}"
GIT_URL="${GIT_URL:-https://github.com/xason0/Client.git}"
BACKEND_JS="${BACKEND_JS:-${HOME}/backend/server.js}"

if [ ! -d "${REPO}/.git" ]; then
  echo "Cloning into ${REPO}..."
  git clone "${GIT_URL}" "${REPO}"
fi

cd "${REPO}"
git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git reset --hard "origin/${BRANCH}"

npm ci
npm run build

mkdir -p "${WEB_ROOT}"
rsync -av --delete "${REPO}/dist/" "${WEB_ROOT}/"

if [ -f "${BACKEND_JS}" ]; then
  node --check "${BACKEND_JS}" || {
    echo "node --check failed: ${BACKEND_JS}" >&2
    exit 1
  }
fi

pm2 reload dataplus-api 2>/dev/null || pm2 restart dataplus-api || true
pm2 save 2>/dev/null || true
echo "OK — static site updated; PM2 dataplus-api reloaded."
