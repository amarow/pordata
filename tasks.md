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
- [ ] Struct `SyncJob` definieren (`uuid`, `local_path`, `usb_subfolder`)
- [ ] Struct `Config` definieren (Liste von `SyncJob`s, Einstellungen)
- [ ] `load_config()` – Liest `~/.config/pordata/config.json`
- [ ] `save_config()` – Schreibt Konfiguration zurück auf Disk
- [ ] `add_sync_job()` – Neuen Ordner-Pair hinzufügen
- [ ] `remove_sync_job()` – Ordner-Pair entfernen

---

### `sync_engine.rs` – Synchronisierungslogik
- [ ] Structs für `FileState`, `SyncOperation` (`CopyToUsb`, `CopyToLocal`, `Delete`, `Conflict`, `UpToDate`) definieren
- [ ] `scan_directory()` – Rekursiver Scan mit `walkdir`, gibt Map `RelPath → (mtime, size)` zurück
- [ ] `compare_states()` – Vergleicht lokalen Scan, USB-Scan und letzten Index (2-Sek-Toleranz für FAT32)
- [ ] `load_index()` / `save_index()` – Serialisierung des letzten Sync-Zustands (JSON)
- [ ] `execute_sync()` – Führt Kopier- und Löschoperationen aus, bewahrt mtimes mit `filetime`
- [ ] `resolve_conflict()` – Wendet die Benutzerentscheidung (Local / USB / Skip) an
- [ ] Unit-Tests für alle 10 Zustandsübergänge (`cargo test`)

---

### `device_monitor.rs` – USB-Erkennung
- [ ] Hintergrund-Loop alle 2 Sekunden mit `sysinfo::Disks`
- [ ] Suche nach `.pordata-uuid` im Root eines Wechseldatenträgers
- [ ] UUID mit konfigurierten Jobs abgleichen
- [ ] Tauri-Event `device-attached` emittieren (inkl. UUID & Mount-Pfad)
- [ ] Tauri-Event `device-detached` emittieren
- [ ] Fenster automatisch öffnen wenn bekannter Stick erkannt wird

---

### `main.rs` / `lib.rs` – Tauri-Setup & Commands
- [ ] Hintergrund-Monitor-Thread beim App-Start starten
- [ ] Command `get_sync_jobs` – Gibt alle konfigurierten Jobs zurück
- [ ] Command `create_sync_job` – Neues Ordner-Pair anlegen
- [ ] Command `delete_sync_job` – Ordner-Pair löschen
- [ ] Command `select_directory` – Nativer Ordner-Dialog via `rfd`
- [ ] Command `run_pre_scan` – Pre-Scan eines oder aller Folder-Pairs, gibt Zählungen zurück
- [ ] Command `start_sync` – Führt Sync für ausgewählte Pairs aus
- [ ] Command `resolve_conflicts` – Nimmt Konflikt-Entscheidungen entgegen
- [ ] Command `get_active_devices` – Gibt aktuell verbundene bekannte USB-Sticks zurück

---

## ⚛️ Frontend (React + TypeScript)

### Design-System (`App.css`)
- [ ] CSS-Variablen / Design-Tokens (Farben, Radien, Schatten, Abstände)
- [ ] Dark-Mode Hintergrund-System mit Glassmorphism-Karten
- [ ] Typografie (Inter via Google Fonts)
- [ ] Donut-Chart Farbpalette: Blau / Grün / Orange / Rot / Grau
- [ ] Hover-Effekte und Micro-Animationen
- [ ] Transition für Ansichtswechsel

---

### `App.tsx` – Haupt-State-Management
- [ ] Tauri-Events `device-attached` / `device-detached` abonnieren
- [ ] Zustandsverwaltung: aktive Ansicht (`dashboard` | `new-job` | `sync-preview` | `conflict`)
- [ ] Aktives Gerät (UUID, Mount-Pfad) im State halten
- [ ] Aktiver Folder-Pair-Tab im State halten

---

### Dashboard-Ansicht
- [ ] Liste aller konfigurierten Sync-Jobs anzeigen
- [ ] Aktives USB-Gerät hervorheben
- [ ] Button „Neues Ordner-Pair hinzufügen"
- [ ] Button „Sync starten" (öffnet Sync-Preview)

---

### New-Job-Dialog
- [ ] Lokalen Ordner auswählen (via `select_directory` Command)
- [ ] USB-Unterordner-Name eingeben
- [ ] Speichern → `create_sync_job` aufrufen

---

### Sync-Preview-Ansicht
- [ ] **Linke Karte**: Host-Info (Pfad, Anzahl neuerer Dateien)
- [ ] **Rechte Karte**: USB-Info (Mount-Pfad, Unterordner, Anzahl neuerer Dateien)
- [ ] **Donut-Chart (SVG)**:
  - [ ] Segmente: Blau (→ USB), Grün (→ Lokal), Orange (Löschen), Rot (Konflikt), Grau (Aktuell)
  - [ ] Animierter Aufbau beim Laden
  - [ ] Tooltip bei Hover (Anzahl + Label)
  - [ ] Zentrums-Button: „Sync starten" / „Konflikte lösen"
- [ ] Tab-Leiste zum Wechseln zwischen Folder-Pairs
- [ ] Fortschritts-Overlay während des Syncs

---

### Conflict-Dialog
- [ ] Liste aller Konflikte anzeigen (relativer Pfad, Größe, mtime beider Seiten)
- [ ] Pro Konflikt: „Lokal behalten" / „USB behalten" / „Überspringen"
- [ ] Alle auf einmal auflösen (Bulk-Aktion)
- [ ] Nach Bestätigung `resolve_conflicts` Command aufrufen

---

## ✅ Verifikation

- [ ] `cargo test` – Alle Unit-Tests für `sync_engine` grün
- [ ] Manueller Test: Simulierten USB-Stick einhängen
- [ ] App erkennt Stick und öffnet Fenster automatisch
- [ ] Mehrere Folder-Pairs konfigurieren und synchronisieren
- [ ] Konflikte (Änderung auf beiden Seiten) erzeugen und lösen
- [ ] FAT32-Timestamp-Toleranz verifizieren (2-Sek-Fenster)
