#!/usr/bin/env bash
# Re-encodes existing icon/thumbnail/screenshot files to WebP.
# Run with --dry-run first to preview what would change with no writes.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
node server/scripts/migrate-to-webp.js "$@"
