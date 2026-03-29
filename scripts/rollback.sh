#!/usr/bin/env bash
# rollback.sh — revert to flipoff:previous image and restart
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$REPO_DIR"

if ! docker image inspect flipoff:previous &>/dev/null; then
  echo "[rollback] No previous image found. Nothing to roll back to." >&2
  exit 1
fi

echo "[rollback] Tagging flipoff:previous as flipoff:latest..."
docker tag flipoff:previous flipoff:latest

echo "[rollback] Restarting container..."
docker compose up -d --force-recreate

echo "[rollback] Done."
