# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Pordata Sync is a Tauri 2 desktop app for bidirectional USB folder synchronisation. The Rust backend does all sync logic; the React frontend is a thin display layer.

## Commands

```bash
npm install              # first-time setup
npm run tauri dev        # dev mode (starts Vite + compiles Rust; first build ~1-2 min)
npm run tauri build      # production AppImage / .deb → src-tauri/target/release/bundle/

cd src-tauri && cargo test   # Rust unit tests (all in sync_engine.rs and config.rs)
```

Reset app state if something breaks:
```bash
rm ~/.config/pordata/config.json          # clears all jobs
rm ~/.config/pordata/index_<JOB-ID>.json  # clears sync index for one job
```

## Architecture

### Data flow

```
USB device plugged in
  → device_monitor::poll_once()            polls every 2 s via sysinfo::Disks
  → reads .pordata-uuid from stick root
  → emits Tauri events "device-attached" / "device-detached"
  → frontend listens and updates activeDevices state

User clicks "Sync starten"
  → run_pre_scan (Tauri command)
    → scan_directory(local) + scan_directory(usb)
    → compare_states(local, usb, last_index) → SyncSummary
  → frontend shows SyncPreview (donut chart)

User confirms sync
  → start_sync (Tauri command)
    → execute_sync(operations, &mut index)   copies / deletes files
    → save_index(idx_path, &index)           persists new baseline
  → if conflicts remain → ConflictDialog
```

### Rust backend (`src-tauri/src/`)

| File | Responsibility |
|------|---------------|
| `lib.rs` | All Tauri commands; wires `AppState` (config + active_devices) |
| `sync_engine.rs` | `scan_directory`, `compare_states`, `execute_sync`, `resolve_conflict`; all unit-tested |
| `config.rs` | Load/save `~/.config/pordata/config.json`; `SyncJob` CRUD; unit-tested |
| `device_monitor.rs` | Background thread; polls removable disks; emits `device-attached`/`device-detached` |

**Key types** (all in `sync_engine.rs`):
- `SyncOperation` — enum: `CopyToUsb`, `CopyToLocal`, `DeleteOnUsb`, `DeleteOnLocal`, `Conflict`, `UpToDate`
- `SyncSummary` — counts + full `Vec<SyncOperation>`, serialised directly to frontend
- `SyncIndex` — persisted JSON snapshot of file states at last successful sync (`~/.config/pordata/index_<job_id>.json`)
- `FileState` — `{rel_path, mtime (unix secs), size}`

**FAT32 tolerance**: mtimes within 2 seconds are treated as equal (`FAT32_MTIME_TOLERANCE = 2`).

**Locking discipline**: `AppState` holds two `Arc<Mutex<_>>` — `config` and `active_devices`. Commands always drop the config lock before acquiring `active_devices` to avoid deadlocks.

### React frontend (`src/`)

`App.tsx` owns all state and view routing. `View` type is a discriminated union: `'dashboard' | 'new-job' | 'sync-preview' | 'conflict'`. There is no router or state library — navigation is a plain `useState<View>`.

All Tauri IPC goes through `invoke()` in `App.tsx`; child components receive callbacks only. `src/types.ts` mirrors every Rust type that crosses the IPC boundary.

### USB stick identity

A stick is identified by the trimmed content of `.pordata-uuid` in its root. This UUID is stored in `SyncJob.usb_uuid` and is the key in `AppState.active_devices`. The monitor ignores non-removable disks and disks without this file.
