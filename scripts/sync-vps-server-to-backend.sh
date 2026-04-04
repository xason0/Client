#!/usr/bin/env bash
# OPTIONAL — run ON the VPS only if your live API is a copy of Client/vps-server.js.
# Backs up ~/backend/server.js then copies from the repo. Does not restart PM2.
#
#   cd ~/Client && bash scripts/sync-vps-server-to-backend.sh
#
# After copying: pm2 reload dataplus-api || pm2 restart dataplus-api
set -euo pipefail

REPO="${REPO:-${HOME}/Client}"
SRC="${REPO}/vps-server.js"
DEST="${DEST:-${HOME}/backend/server.js}"

if [ ! -f "${SRC}" ]; then
  echo "Missing ${SRC}" >&2
  exit 1
fi
if [ ! -f "${DEST}" ]; then
  echo "Missing ${DEST} — fix DEST or install backend first" >&2
  exit 1
fi

cp -a "${DEST}" "${DEST}.bak-$(date +%Y%m%d%H%M%S)"
cp -a "${SRC}" "${DEST}"
node --check "${DEST}"
echo "Updated ${DEST} from ${SRC}. Restart API: pm2 reload dataplus-api || pm2 restart dataplus-api"
