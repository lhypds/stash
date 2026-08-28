#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

PKG_JSON="package.json"
DIST_DIR="dist"

echo "==> Checking toolchain"
if ! command -v node >/dev/null 2>&1; then
  echo "    node not found on PATH." >&2
  exit 1
fi

if command -v pnpm >/dev/null 2>&1; then
  PKG=pnpm
elif command -v npm >/dev/null 2>&1; then
  PKG=npm
else
  echo "    Neither pnpm nor npm found on PATH." >&2
  exit 1
fi
echo "    Using $PKG"

NAME="$(node -p "require('./$PKG_JSON').name" 2>/dev/null || echo stash)"
VERSION="$(node -p "require('./$PKG_JSON').version" 2>/dev/null || echo 0.0.0)"
STEM="${NAME}-${VERSION}"
OUTPUT="${STEM}.tar.gz"

echo "==> Installing dependencies"
"$PKG" install

echo "==> Building frontend"
"$PKG" run build

if [ ! -d "$DIST_DIR" ]; then
  echo "    Build did not produce '$DIST_DIR/'. Aborting." >&2
  exit 1
fi

echo "==> Staging $STEM"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
ROOT="$STAGE/$STEM"
mkdir -p "$ROOT"

# Runtime files only: no node_modules (reinstalled on the target), and no
# data/ or .env — those are the deployment's own, not the package's.
for item in \
  "$DIST_DIR" \
  server \
  index.html \
  vite.config.js \
  ecosystem.config.cjs \
  setup.sh \
  start.sh \
  stop.sh \
  package.json \
  pnpm-lock.yaml \
  package-lock.json \
  pnpm-workspace.yaml \
  .env.example \
  README.md
do
  [ -e "$item" ] && cp -R "$item" "$ROOT/"
done

echo "==> Packing into $OUTPUT"
rm -f "$OUTPUT"
tar -czf "$OUTPUT" -C "$STAGE" "$STEM"

echo
echo "Done: $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
echo "Next: copy it to the server, then:"
echo "  tar -xzf $OUTPUT && cd $STEM"
echo "  ./setup.sh && ./start.sh"
