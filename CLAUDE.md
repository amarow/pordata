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
  → handleStartPreScan checks both paths exist via check_path_exists
    → if missing: modal asks to create them (create_directory), then continues
  → run_pre_scan (Tauri command)
    → scan_directory(local) + scan_directory(usb)
    → compare_states(local, usb, last_index) → SyncSummary
    → local_appears_reset heuristic: empty local + non-empty index → CopyToLocal (not DeleteOnUsb)
  → frontend shows SyncPreview (two directional buttons + optional conflicts button)

User clicks a direction button ("Lokal → USB" or "Lokal ← USB")
  → start_sync (Tauri command, direction: "to_usb" | "to_local" | "both")
    → filters operations by direction before execute_sync
    → execute_sync(filtered_ops, &mut index)  copies / deletes files
    → save_index(idx_path, &index)            persists new baseline
  → frontend re-runs run_pre_scan for that job
    → if copy_to_usb + copy_to_local + conflicts == 0 → dashboard
    → else → SyncPreview stays open with updated counts
  → if direction == "both" and conflicts > 0 → ConflictDialog
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
- `PreScanResult` — includes `local_file_count` and `usb_file_count` (total files per side)

**FAT32 tolerance**: mtimes within 2 seconds are treated as equal (`FAT32_MTIME_TOLERANCE = 2`).

**local_appears_reset heuristic** (in `compare_states`): if local directory is empty but the last index is non-empty, the local folder is assumed to have been freshly re-created — files that exist only on USB are classified as `CopyToLocal`, not `DeleteOnUsb`.

**Locking discipline**: `AppState` holds two `Arc<Mutex<_>>` — `config` and `active_devices`. Commands always drop the config lock before acquiring `active_devices` to avoid deadlocks.

**Extra Tauri commands** (beyond the original set):
- `check_path_exists(path) -> bool` — used to validate paths before scan
- `create_directory(path) -> Result<(), String>` — creates missing local or USB folder
- `init_usb_device(path) -> Result<{mount_path, uuid}, String>` — reads or auto-creates `.pordata-uuid` on stick root; used by NewJobDialog

### React frontend (`src/`)

`App.tsx` owns all state and view routing. `View` type is a discriminated union: `'dashboard' | 'new-job' | 'sync-preview' | 'conflict'`. There is no router or state library — navigation is a plain `useState<View>`.

All Tauri IPC goes through `invoke()` in `App.tsx`; child components receive callbacks only. `src/types.ts` mirrors every Rust type that crosses the IPC boundary.

**Theme**: dark/light toggle persisted in `localStorage` under `pordata-theme`. Applied via `document.documentElement.classList.toggle("light", ...)`. CSS uses `:root` for dark defaults, `:root.light` for overrides.

**Path validity polling**: every 3 s `check_path_exists` is called for all local paths; results drive `validLocalPaths: Set<string>`. Paths that are unreachable are rendered dimmed.

**SyncPreview** shows two directional buttons (blue "Lokal → USB", green "Lokal ← USB") plus an optional orange "Konflikte lösen" button. After a directional sync `App.tsx` re-runs `run_pre_scan`; the view stays open until all counts reach zero.

**ConflictDialog**: pre-selects the newest file (local vs USB mtime), bulk action "Alle: Neueste", submit button labelled "Synchronisieren". Local = blue, USB = green resolution buttons.

**NewJobDialog**: full-page view (not an overlay). Uses `init_usb_device` to auto-create `.pordata-uuid` if the stick doesn't have one yet.

### USB stick identity

A stick is identified by the trimmed content of `.pordata-uuid` in its root. This UUID is stored in `SyncJob.usb_uuid` and is the key in `AppState.active_devices`. The monitor ignores non-removable disks and disks without this file. `init_usb_device` creates the file automatically the first time a stick is picked in NewJobDialog.
