# Changelog

## [Unreleased]

## [0.1.2] - 2026-07-02
### Added
- Einstellungen-Dialog zum Verwalten global ignorierter Dateien/Verzeichnisse (Muster mit `*`-Wildcard am Anfang oder Ende)
- Versionsnummer wird im Dashboard neben dem Titel angezeigt
- `scripts/deploy.sh` und `scripts/set-version.sh` zur zentralen Versionsverwaltung beim Release (`npm run deploy` fragt jetzt nach der Version statt sie hart zu setzen)

### Changed
- Verzeichnis-Scan und Kopier-/Löschvorgänge beim Sync parallelisiert (rayon) für schnellere Läufe auf großen Datenmengen
