#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Restarting..."

"$ROOT/stop.sh"
"$ROOT/start.sh"
