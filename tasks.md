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
- [x] Command `run_pre_scan` – Pre-Scan eines oder aller Folder-Pairs, gibt Zählungen zurück
- [x] Command `start_sync` – Führt Sync für ausgewählte Pairs aus
- [x] Command `resolve_conflicts` – Nimmt Konflikt-Entscheidungen entgegen
- [x] Command `get_active_devices` – Gibt aktuell verbundene bekannte USB-Sticks zurück

---

## ⚛️ Frontend (React + TypeScript)

### Design-System (`App.css`)
- [x] CSS-Variablen / Design-Tokens (Farben, Radien, Schatten, Abstände)
- [x] Dark-Mode Hintergrund-System mit Glassmorphism-Karten
- [x] Typografie (Inter / System-Font-Stack)
- [x] Donut-Chart Farbpalette: Blau / Grün / Orange / Rot / Grau
- [x] Hover-Effekte und Micro-Animationen
- [ ] Transition für Ansichtswechsel

---

### `App.tsx` – Haupt-State-Management
- [x] Tauri-Events `device-attached` / `device-detached` abonnieren
- [x] Zustandsverwaltung: aktive Ansicht (`dashboard` | `new-job` | `sync-preview` | `conflict`)
- [x] Aktives Gerät (UUID, Mount-Pfad) im State halten
- [x] Aktiver Folder-Pair-Tab im State halten

---

### Dashboard-Ansicht
- [x] Liste aller konfigurierten Sync-Jobs anzeigen
- [x] Aktives USB-Gerät hervorheben
- [x] Button „Neues Ordner-Pair hinzufügen"
- [x] Button „Sync starten" (öffnet Sync-Preview)

---

### New-Job-Dialog
- [x] Lokalen Ordner auswählen (via `select_directory` Command)
- [x] USB-Unterordner-Name eingeben
- [x] Speichern → `create_sync_job` aufrufen

---

### Sync-Preview-Ansicht
- [x] **Linke Karte**: Host-Info (Pfad, Anzahl neuerer Dateien)
- [x] **Rechte Karte**: USB-Info (Mount-Pfad, Unterordner, Anzahl neuerer Dateien)
- [x] **Donut-Chart (SVG)**:
  - [x] Segmente: Blau (→ USB), Grün (→ Lokal), Orange (Löschen), Rot (Konflikt), Grau (Aktuell)
  - [ ] Animierter Aufbau beim Laden
  - [x] Tooltip bei Hover (Anzahl + Label)
  - [x] Zentrums-Button: „Sync starten" / „Konflikte lösen"
- [x] Tab-Leiste zum Wechseln zwischen Folder-Pairs
- [x] Fortschritts-Overlay während des Syncs

---

### Conflict-Dialog
- [x] Liste aller Konflikte anzeigen (relativer Pfad, Größe, mtime beider Seiten)
- [x] Pro Konflikt: „Lokal behalten" / „USB behalten" / „Überspringen"
- [x] Alle auf einmal auflösen (Bulk-Aktion)
- [x] Nach Bestätigung `resolve_conflicts` Command aufrufen

---

## ✅ Verifikation

- [x] `cargo test` – Alle Unit-Tests für `sync_engine` grün (30/30)
- [ ] Manueller Test: Simulierten USB-Stick einhängen
- [ ] App erkennt Stick und öffnet Fenster automatisch
- [ ] Mehrere Folder-Pairs konfigurieren und synchronisieren
- [ ] Konflikte (Änderung auf beiden Seiten) erzeugen und lösen
- [ ] FAT32-Timestamp-Toleranz verifizieren (2-Sek-Fenster)
