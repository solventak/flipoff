#!/usr/bin/env bash
# deploy.sh — pull latest code, rebuild image, restart container
# Run from the repo root (or REPO_DIR env var)
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$REPO_DIR"

echo "[deploy] Pulling latest from main..."
git fetch origin main
git reset --hard origin/main

echo "[deploy] Tagging current image as flipoff:previous (for rollback)..."
if docker image inspect flipoff:latest &>/dev/null; then
  docker tag flipoff:latest flipoff:previous
fi

echo "[deploy] Building new image..."
docker build -t flipoff:latest .

echo "[deploy] Restarting container..."
docker compose up -d --force-recreate

echo "[deploy] Done."
