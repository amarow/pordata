# Changelog

## [Unreleased]

## [0.1.3] - 2026-07-02
### Fixed
- Scrollbar in der Liste der globalen Ignore-Muster überlappt nicht mehr die Einträge
- Theme-Umschalter-Icon (Hell/Dunkel) durch ein deutlicheres Kreis-Symbol ersetzt, besser unterscheidbar vom Einstellungen-Icon

## [0.1.2] - 2026-07-02
### Added
- Einstellungen-Dialog zum Verwalten global ignorierter Dateien/Verzeichnisse (Muster mit `*`-Wildcard am Anfang oder Ende)
- Versionsnummer wird im Dashboard neben dem Titel angezeigt
- `scripts/deploy.sh` und `scripts/set-version.sh` zur zentralen Versionsverwaltung beim Release (`npm run deploy` fragt jetzt nach der Version statt sie hart zu setzen)

### Changed
- Verzeichnis-Scan und Kopier-/Löschvorgänge beim Sync parallelisiert (rayon) für schnellere Läufe auf großen Datenmengen
