#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-$APP_ROOT/extensions/vibeproof-reviews}"
SOURCE="$APP_ROOT/theme-extension-template"

if [ ! -d "$TARGET" ]; then
  echo "Theme extension not found at: $TARGET"
  echo
  echo "First run Shopify CLI from the app root:"
  echo "  shopify app generate extension"
  echo
  echo "Choose 'Theme app extension' and name it 'vibeproof-reviews'."
  echo "Then rerun:"
  echo "  bash scripts/apply-theme-extension-template.sh"
  exit 1
fi

mkdir -p "$TARGET/blocks" "$TARGET/assets"

find "$TARGET/blocks" -maxdepth 1 -type f -name '*.liquid' -delete
find "$TARGET/assets" -maxdepth 1 -type f -delete
rm -f "$TARGET/snippets/stars.liquid"

cp "$SOURCE"/blocks/*.liquid "$TARGET/blocks/"
cp "$SOURCE"/assets/* "$TARGET/assets/"

ESBUILD="$APP_ROOT/node_modules/.bin/esbuild"
if [ ! -x "$ESBUILD" ]; then
  echo "esbuild was not found at $ESBUILD"
  echo "Run npm install from $APP_ROOT, then rerun this script."
  exit 1
fi

for file in "$TARGET"/assets/*.js; do
  [ -f "$file" ] || continue
  tmp="$file.min"
  "$ESBUILD" "$file" --minify --outfile="$tmp"
  mv "$tmp" "$file"
done

echo "Applied VibeProof theme app extension files to:"
echo "  $TARGET"
echo
echo "JavaScript asset sizes:"
wc -c "$TARGET"/assets/*.js
