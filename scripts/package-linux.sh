#!/usr/bin/env bash
set -euo pipefail

SRC=$(ls src-tauri/target/release/bundle/appimage/*.AppImage 2>/dev/null | head -n1)

if [ -z "$SRC" ]; then
  echo "Fehler: kein AppImage in src-tauri/target/release/bundle/appimage/ gefunden" >&2
  exit 1
fi

mkdir -p deploy
cp "$SRC" "deploy/pordata.AppImage"
cp BEDIENUNGSANLEITUNG.txt deploy/

echo "→ deploy/pordata.AppImage"
echo "→ deploy/BEDIENUNGSANLEITUNG.txt"
