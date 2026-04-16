#!/bin/bash
# Build script for Architect Cadence — Mac/Linux
# Run from the project root: ./scripts/build.sh
# Packages the extension into a zip ready for Chrome Web Store upload.

cd "$(dirname "$0")/.." || exit 1

OUTPUT="archcadence.zip"

rm -f "$OUTPUT"

zip "$OUTPUT" \
  manifest.json \
  background.js \
  popup.html \
  popup.js \
  config.json \
  icons/icon16.png \
  icons/icon48.png \
  icons/icon128.png

echo "Build complete: $OUTPUT"
