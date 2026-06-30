#!/usr/bin/env bash
set -euo pipefail

VERSION=$(node -p "require('./package.json').version")
SRC="src-tauri/target/release/bundle/appimage/tauri-app_${VERSION}_amd64.AppImage"

if [ ! -f "$SRC" ]; then
  echo "Fehler: AppImage nicht gefunden: $SRC" >&2
  exit 1
fi

mkdir -p deploy
cp "$SRC" "deploy/pordata_${VERSION}.AppImage"
cp BEDIENUNGSANLEITUNG.txt deploy/

echo "→ deploy/pordata_${VERSION}.AppImage"
echo "→ deploy/BEDIENUNGSANLEITUNG.txt"
