#!/usr/bin/env bash
# Setzt die Versionsnummer an allen Stellen im Projekt, an denen sie
# gepflegt werden muss: package.json, src-tauri/tauri.conf.json und
# src-tauri/Cargo.toml. Cargo.lock wird per `cargo check` automatisch
# nachgezogen.
set -euo pipefail

if [ $# -lt 1 ] || [ -z "$1" ]; then
  echo "Usage: $0 <version>" >&2
  echo "Beispiel: $0 0.2.0" >&2
  exit 1
fi

VERSION="$1"
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Fehler: Version muss dem Format x.y.z entsprechen (erhalten: '$VERSION')." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

npm pkg set version="$VERSION" >/dev/null

node -e "
const fs = require('fs');
const path = 'src-tauri/tauri.conf.json';
const conf = JSON.parse(fs.readFileSync(path, 'utf8'));
conf.version = '$VERSION';
fs.writeFileSync(path, JSON.stringify(conf, null, 2) + '\n');
"

sed -i "0,/^version = \".*\"/s//version = \"$VERSION\"/" src-tauri/Cargo.toml

(cd src-tauri && cargo check --quiet)

echo "Version auf $VERSION gesetzt: package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml, Cargo.lock"
