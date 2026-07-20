#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Starting..."

cd "$ROOT"
if [ ! -d dist ]; then
  echo "dist/ not found — run ./setup.sh first" >&2
  exit 1
fi

pm2 start ecosystem.config.cjs --update-env

# Read PORT from .env for display
PORT=$(grep '^PORT=' "$ROOT/.env" 2>/dev/null | cut -d= -f2 || echo 3001)

echo "stash running at http://localhost:${PORT:-3001}"
