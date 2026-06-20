# Pordata Sync – Technische Dokumentation

## Überblick

Pordata Sync ist eine Desktop-App zur bidirektionalen USB-Ordnersynchronisation.
Sie basiert auf **Tauri 2**: ein schmaler React/TypeScript-Frontend läuft in einer
WebView, die gesamte Sync-Logik steckt im Rust-Backend.

---

## Tech-Stack

| Schicht | Technologie |
|---------|-------------|
| UI | React 18, TypeScript, Vite |
| Desktop-Shell | Tauri 2 (WebView2 / WebKit) |
| Backend | Rust (stable) |
| Dateisystem | `walkdir`, `filetime` |
| USB-Erkennung | `sysinfo::Disks` |
| Dateidialog | `rfd` (async) |
| Persistenz | JSON (`serde_json`) in `~/.config/pordata/` |

---

## Systemarchitektur

```
┌─────────────────────────────────────────────────────────┐
│                    Tauri-Prozess                         │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │               React-Frontend (WebView)             │  │
│  │                                                    │  │
│  │  useAppState.ts ──► App.tsx ──► Komponenten        │  │
│  │      (State,            (JSX-           Dashboard  │  │
│  │       Handler)          Routing)        SyncPreview│  │
│  │                                        ConflictDlg │  │
│  └──────────────────────┬────────────────────────────┘  │
│                         │  Tauri IPC                     │
│              invoke() / listen() / emit()                │
│                         │                                │
│  ┌──────────────────────▼────────────────────────────┐  │
│  │               Rust-Backend (lib.rs)                │  │
│  │                                                    │  │
│  │  Tauri-Commands:                                   │  │
│  │  run_pre_scan ──────────► sync_engine              │  │
│  │  run_pre_scan_fresh ────► sync_engine              │  │
│  │  start_sync ────────────► sync_engine              │  │
│  │  resolve_conflicts ─────► sync_engine              │  │
│  │  get_sync_jobs ─────────► config                   │  │
│  │  create/delete_sync_job ► config                   │  │
│  │  init_usb_device ───────► sysinfo                  │  │
│  │                                                    │  │
│  │  AppState { config, active_devices, cancel_sync }  │  │
│  └──────────────────────────────────────────────────-┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────-┐  │
│  │           device_monitor (Hintergrund-Thread)      │  │
│  │  poll alle 2 s → prüft .pordata-uuid               │  │
│  │  → emitiert "device-attached" / "device-detached"  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

Persistenz (Dateisystem):
  ~/.config/pordata/config.json          ← alle SyncJobs
  ~/.config/pordata/index_<JOB-ID>.json  ← Sync-Index pro Job
  <USB-Root>/.pordata-uuid               ← Stick-Identität
```

---

## Datenfluss: Sync-Ablauf

```
USB-Stick einstecken
  └─► device_monitor erkennt neue Disk mit .pordata-uuid
      └─► "device-attached" Event → Frontend aktualisiert activeDevices

Nutzer klickt "Sync starten"
  └─► handleStartPreScan
      ├─► check_path_exists (local + usb) — fehlende Ordner → Modal
      └─► run_pre_scan
          ├─► scan_directory(local)  → HashMap<path, FileState>
          ├─► scan_directory(usb)   → HashMap<path, FileState>
          ├─► load_index(job)       → SyncIndex (letzter bekannter Zustand)
          └─► compare_states(...)   → SyncSummary
              └─► Frontend zeigt SyncPreview

Nutzer klickt Richtungs-Button
  └─► start_sync(direction, fresh)
      ├─► [fresh=true] compare_states_fresh  (Zeitstempel-Vergleich, kein Index)
      │   [fresh=false] compare_states       (Index-basierter Diff)
      ├─► Operationen nach Richtung filtern
      ├─► execute_sync → Dateien kopieren / löschen
      │   └─► sync-progress Events → Fortschrittsanzeige im Frontend
      └─► save_index → neuer Baseline-Snapshot

Nutzer klickt "Manuell"
  └─► ConflictDialog öffnet sich mit allen anstehenden Operationen
      └─► resolve_conflicts → copy / skip pro Datei → save_index
```

---

## Rust-Module

### `sync_engine.rs` — Kern der Sync-Logik

**Zentrale Typen:**

```
FileState       { rel_path, mtime (Unix-Sek.), size }
SyncIndex       { files: HashMap<path, FileState> }   ← JSON auf Disk
SyncSummary     { copy_to_usb, copy_to_local, delete, conflicts, up_to_date,
                  operations: Vec<SyncOperation> }
SyncOperation   CopyToUsb | CopyToLocal | DeleteOnUsb | DeleteOnLocal
                | Conflict { local_mtime, usb_mtime, … } | UpToDate
ConflictResolution  KeepLocal | KeepUsb | Skip
```

**`compare_states` — Index-basierter Diff:**

```
Datei nur lokal  + im Index  → DeleteOnLocal  (auf USB gelöscht)
Datei nur lokal  – im Index  → CopyToUsb      (neu)
Datei nur auf USB + im Index → DeleteOnUsb    (lokal gelöscht)
Datei nur auf USB – im Index → CopyToLocal    (neu)
Beide Seiten     + im Index  → geändert lokal?  → CopyToUsb
                               geändert USB?    → CopyToLocal
                               beide geändert?  → Conflict
                               nichts geändert? → UpToDate
Beide Seiten     – im Index  → mtimes gleich?   → UpToDate
                               mtimes verschieden? → Conflict
```

**`compare_states_fresh` — Zeitstempel-Vergleich (kein Index):**

```
Datei nur lokal  → CopyToUsb
Datei nur auf USB → CopyToLocal
Beide Seiten     → neuere mtime gewinnt; gleich → UpToDate
                   (keine Delete-Operationen)
```

Wird über "Aktualisieren" ausgelöst, wenn der Nutzer den Index ignorieren
und rein nach Zeitstempeln entscheiden lassen möchte.

**FAT32-Toleranz:** Zeitstempel-Differenzen ≤ 2 Sekunden gelten als gleich
(`FAT32_MTIME_TOLERANCE = 2`), da FAT32 nur 2-Sekunden-Granularität hat.

**`local_appears_reset`-Heuristik:** Ist der lokale Ordner leer, aber der
Index nicht, wird angenommen, dass der Nutzer einen frisch angelegten lokalen
Ordner verwendet — es wird `CopyToLocal` statt `DeleteOnUsb` erzeugt.

### `lib.rs` — Tauri-Commands und AppState

**AppState:**
```rust
AppState {
    config:         Arc<Mutex<Config>>         // SyncJobs
    active_devices: Arc<Mutex<HashMap<…>>>     // erkannte USB-Sticks
    cancel_sync:    Arc<AtomicBool>            // Abbruch-Flag
}
```

**Locking-Disziplin:** Config-Lock wird immer freigegeben, *bevor*
`active_devices` gesperrt wird — verhindert Deadlocks.

**Interne Helper:**
- `resolve_job_roots(job_id, state)` — ermittelt `(local_root, usb_root)` aus
  Job-Config und aktivem Device; von `start_sync` und `resolve_conflicts` geteilt
- `collect_pre_scan_results(job_id, state, fresh)` — gemeinsame Logik für
  `run_pre_scan` und `run_pre_scan_fresh`
- `job_index_path(job_id)` — liefert den Pfad zum Index-JSON

**Fortschritts-Events:** `start_sync` läuft in `spawn_blocking`, damit der
GTK/WebKit-Event-Loop frei bleibt. Fortschritt wird als Tauri-Event
`sync-progress` emittiert (max. alle 100 ms oder bei ≥ 1 % Änderung).
Übersprungene Dateien (z. B. FAT32-illegale Dateinamen) landen im
`sync-skipped`-Event und werden als Warning-Banner angezeigt.

### `config.rs` — Job-Verwaltung

Lädt/speichert `~/.config/pordata/config.json` mit allen `SyncJob`-Einträgen.
Jeder Job hat eine UUID-ID, einen lokalen Pfad, einen USB-Unterordner und die
UUID des zugehörigen USB-Sticks.

### `device_monitor.rs` — USB-Erkennung

Hintergrund-Thread; prüft alle 2 Sekunden über `sysinfo::Disks`, welche
Wechseldatenträger eingesteckt sind. Nur Disks mit `.pordata-uuid` im
Stammverzeichnis werden erkannt. Ändert sich der Zustand, werden
`device-attached`- bzw. `device-detached`-Events an die WebView emittiert.

---

## React-Frontend

### State-Architektur

```
useAppState.ts          ← gesamter App-State + alle Handler
    │
    └─► App.tsx         ← nur JSX, kein eigener State
        ├─► Dashboard
        ├─► NewJobDialog
        ├─► SyncPreview
        └─► ConflictDialog
```

Kein Router, keine State-Library. Navigation über `useState<View>` mit dem
Discriminated-Union-Typ `'dashboard' | 'new-job' | 'sync-preview' | 'conflict'`.

Alle `invoke()`-Aufrufe leben in `useAppState.ts`; Komponenten erhalten nur
Callbacks. `src/types.ts` spiegelt jeden Rust-Typ, der die IPC-Grenze passiert.

### Geteilte Utilities (`src/utils.ts`)

- `openFolder(path)` — öffnet einen Pfad im Dateimanager via `xdg-open`
- `usbPath(mountPath, subfolder)` — konstruiert den vollständigen USB-Pfad

### Fresh-Scan-Mechanismus

`freshScanJobIds: Set<string>` im Hook merkt sich, für welche Jobs ein
Aktualisieren-Scan (`run_pre_scan_fresh`) aktiv ist. Beim nachfolgenden
`start_sync` wird das Flag gelesen und `fresh: true` ans Backend übergeben,
damit der Index-freie Vergleich auch tatsächlich beim Kopieren verwendet wird.
Nach einem regulären Pre-Scan wird das Set geleert.

### USB-Stick-Identität

Ein Stick wird eindeutig über den getrimten Inhalt von `.pordata-uuid` in
seinem Stammverzeichnis identifiziert. Diese UUID ist der Schlüssel in
`AppState.active_devices` und wird in `SyncJob.usb_uuid` gespeichert.
`init_usb_device` legt die Datei beim ersten Einrichten automatisch an.

---

## Persistenz-Übersicht

```
~/.config/pordata/
├── config.json                ← [ { id, local_path, usb_subfolder, usb_uuid }, … ]
├── index_<JOB-ID-1>.json     ← { files: { "rel/path": { mtime, size }, … } }
└── index_<JOB-ID-2>.json

<USB-Mount>/
├── .pordata-uuid              ← "pd-…" (Stick-Identität)
└── <usb_subfolder>/           ← synchronisierter Ordner
    └── …
```

Der Sync-Index ist der "Gedächtnis"-Mechanismus: Er speichert den Zustand
beider Seiten nach dem letzten erfolgreichen Sync und ermöglicht so die
Unterscheidung zwischen "auf einer Seite gelöscht" und "auf der anderen Seite
hinzugefügt".
