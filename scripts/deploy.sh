#!/usr/bin/env bash
# Fragt (falls nicht als Argument übergeben) nach der Versionsnummer,
# verteilt sie im Projekt, baut das AppImage und packt es nach deploy/.
#
# Verwendung:
#   npm run deploy               # fragt interaktiv nach der Version
#   npm run deploy -- 0.2.0      # setzt Version nicht-interaktiv
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CURRENT_VERSION=$(node -p "require('./package.json').version")

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  read -rp "Versionsnummer [$CURRENT_VERSION]: " VERSION
  VERSION="${VERSION:-$CURRENT_VERSION}"
fi

if [ "$VERSION" != "$CURRENT_VERSION" ]; then
  bash scripts/set-version.sh "$VERSION"
else
  echo "Version bleibt bei $VERSION"
fi

npm run tauri build -- --bundles appimage
bash scripts/package-linux.sh
