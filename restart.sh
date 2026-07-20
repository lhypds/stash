#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Restarting..."

cd "$ROOT"
echo "Pulling latest code..."
git pull --ff-only

"$ROOT/setup.sh"

"$ROOT/stop.sh"
"$ROOT/start.sh"
