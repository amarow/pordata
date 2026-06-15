# Tasks – Pordata Sync

Aufgabenliste basierend auf dem [Implementierungsplan](./implementation_plan.md).

---

## 🦀 Backend (Rust)

### `Cargo.toml`
- [x] `sysinfo` hinzugefügt
- [x] `rfd` hinzugefügt
- [x] `filetime` hinzugefügt
- [x] `walkdir` hinzugefügt

---

### `config.rs` – Konfigurationsverwaltung
- [x] Struct `SyncJob` definieren (`id`, `local_path`, `usb_subfolder`, `usb_uuid`)
- [x] Struct `Config` definieren (Liste von `SyncJob`s, Einstellungen)
- [x] `load_config()` – Liest `~/.config/pordata/config.json`
- [x] `save_config()` – Schreibt Konfiguration zurück auf Disk
- [x] `add_sync_job()` – Neuen Ordner-Pair hinzufügen
- [x] `remove_sync_job()` – Ordner-Pair entfernen

---

### `sync_engine.rs` – Synchronisierungslogik
- [x] Structs für `FileState`, `SyncOperation` (`CopyToUsb`, `CopyToLocal`, `Delete`, `Conflict`, `UpToDate`) definieren
- [x] `scan_directory()` – Rekursiver Scan mit `walkdir`, gibt Map `RelPath → (mtime, size)` zurück
- [x] `compare_states()` – Vergleicht lokalen Scan, USB-Scan und letzten Index (2-Sek-Toleranz für FAT32)
- [x] `load_index()` / `save_index()` – Serialisierung des letzten Sync-Zustands (JSON)
- [x] `execute_sync()` – Führt Kopier- und Löschoperationen aus, bewahrt mtimes mit `filetime`
- [x] `resolve_conflict()` – Wendet die Benutzerentscheidung (Local / USB / Skip) an
- [x] Unit-Tests für alle 10 Zustandsübergänge (`cargo test`)

---

### `device_monitor.rs` – USB-Erkennung
- [x] Hintergrund-Loop alle 2 Sekunden mit `sysinfo::Disks`
- [x] Suche nach `.pordata-uuid` im Root eines Wechseldatenträgers
- [x] UUID mit konfigurierten Jobs abgleichen
- [x] Tauri-Event `device-attached` emittieren (inkl. UUID & Mount-Pfad)
- [x] Tauri-Event `device-detached` emittieren
- [x] Fenster automatisch öffnen wenn bekannter Stick erkannt wird

---

### `main.rs` / `lib.rs` – Tauri-Setup & Commands
- [x] Hintergrund-Monitor-Thread beim App-Start starten
- [x] Command `get_sync_jobs` – Gibt alle konfigurierten Jobs zurück
- [x] Command `create_sync_job` – Neues Ordner-Pair anlegen
- [x] Command `delete_sync_job` – Ordner-Pair löschen
- [x] Command `select_directory` – Nativer Ordner-Dialog via `rfd`
- [x] Command `run_pre_scan` – Pre-Scan eines oder aller Folder-Pairs; gibt `local_file_count` und `usb_file_count` zurück
- [x] Command `start_sync` – Führt Sync aus; `direction: "to_usb" | "to_local" | "both"` filtert Operationen
- [x] Command `resolve_conflicts` – Nimmt Konflikt-Entscheidungen entgegen
- [x] Command `get_active_devices` – Gibt aktuell verbundene bekannte USB-Sticks zurück
- [x] Command `check_path_exists` – Prüft ob ein Ordner existiert (für Pfad-Validierung)
- [x] Command `create_directory` – Legt fehlenden lokalen oder USB-Ordner an
- [x] Command `init_usb_device` – Liest oder erstellt `.pordata-uuid` auf dem Stick

---

## ⚛️ Frontend (React + TypeScript)

### Design-System (`App.css`)
- [x] CSS-Variablen / Design-Tokens (Farben, Radien, Schatten, Abstände)
- [x] Dark/Light-Mode mit Toggle (persistiert in `localStorage`)
- [x] Typografie (Inter / System-Font-Stack)
- [x] Farbpalette: Blau (Lokal) / Grün (USB) / Orange (Konflikte)
- [x] Hover-Effekte und Micro-Animationen
- [x] Richtungs-Buttons (`.dir-btn-to-usb`, `.dir-btn-to-local`, `.dir-btn-conflicts`)
- [x] Modal-Overlay für Löschbestätigung und fehlende Pfade
- [ ] Transition für Ansichtswechsel

---

### `App.tsx` – Haupt-State-Management
- [x] Tauri-Events `device-attached` / `device-detached` abonnieren
- [x] Zustandsverwaltung: aktive Ansicht (`dashboard` | `new-job` | `sync-preview` | `conflict`)
- [x] Aktives Gerät (UUID, Mount-Pfad) im State halten
- [x] Aktiver Folder-Pair-Tab im State halten
- [x] `validLocalPaths` – alle 3 s via `check_path_exists` aktualisiert
- [x] `missingPathConfirm` – Modal wenn Pfad fehlt; Option zum Anlegen vor dem Sync
- [x] `theme` – Dark/Light, aus `localStorage` initialisiert

---

### Dashboard-Ansicht
- [x] Liste aller konfigurierten Sync-Jobs anzeigen
- [x] USB-Pfad hervorheben wenn verbunden (kein Badge)
- [x] Lokal-Pfad ausgegraut wenn Ordner nicht erreichbar
- [x] „+" Button inline in der Job-Liste (Neue Synchronisation)
- [x] Sync-Pfeil-Button zwischen den Pfadspalten (blau/grün)
- [x] Lösch-Bestätigung als kleines Modal-Overlay (kein Layout-Shift)
- [x] Escape schließt Lösch-Modal

---

### Neue-Synchronisation-Ansicht
- [x] Vollseiten-Ansicht (kein modales Overlay), mit „← Zurück"-Header
- [x] Lokalen Ordner auswählen (via `select_directory` Command)
- [x] USB-Ordner auswählen – ruft `init_usb_device` auf (erstellt `.pordata-uuid` falls fehlend)
- [x] Speichern → `create_sync_job` aufrufen

---

### Sync-Preview-Ansicht
- [x] **Linke Karte** (blau „Lokal"): Pfad, Gesamtanzahl Dateien
- [x] **Rechte Karte** (grün „USB"): Pfad, Gesamtanzahl Dateien
- [x] **Richtungs-Buttons** (Mitte):
  - [x] Blau „Lokal → USB" – Dateianzahl, deaktiviert wenn nichts zu tun
  - [x] Grün „Lokal ← USB" – Dateianzahl, deaktiviert wenn nichts zu tun
  - [x] Orange „N Konflikte lösen" – nur sichtbar wenn Konflikte vorhanden
- [x] Nach direktionalem Sync: erneuter Pre-Scan, Ansicht bleibt offen solange Arbeit verbleibt
- [x] Tab-Leiste zum Wechseln zwischen mehreren Jobs
- [x] Fortschritts-Overlay während des Syncs

---

### Conflict-Dialog
- [x] Liste aller Konflikte anzeigen (relativer Pfad, Größe, mtime beider Seiten)
- [x] Pro Konflikt: „Lokal" (blau) / „USB" (grün) / „Skip" – neueste Datei vorausgewählt
- [x] Bulk-Buttons: „Alle: Neueste", „Alle: Lokal", „Alle: USB", „Alle: Skip"
- [x] Submit-Button: „Synchronisieren"
- [x] Nach Bestätigung `resolve_conflicts` Command aufrufen

---

## ✅ Verifikation

- [x] `cargo test` – Alle Unit-Tests für `sync_engine` grün (31/31)
- [ ] Manueller Test: Simulierten USB-Stick einhängen
- [ ] App erkennt Stick und öffnet Fenster automatisch
- [ ] Mehrere Synchronisationen konfigurieren und ausführen
- [ ] Konflikte (Änderung auf beiden Seiten) erzeugen und lösen
- [ ] FAT32-Timestamp-Toleranz verifizieren (2-Sek-Fenster)
- [ ] Direktionalen Sync testen (nur Lokal→USB, nur USB→Lokal)
- [ ] Vorschau bleibt offen wenn nach direktionalem Sync noch Arbeit verbleibt
