# Plan: USB Synchronizer (Pordata Sync)

An intuitive, simple, cross-platform USB synchronization application built with Tauri, React, and TypeScript. The goal is to allow users to plug in a USB stick, view a graphical representation of pending changes for one or more folder pairs, and trigger the sync manually with a single click. Conflicts are displayed and resolved interactively.

## User Review Required

> [!IMPORTANT]
> - **Two-Way Sync Safety**: Two-way synchronization involves overwriting and deleting files. We will keep a local state index of the last sync to distinguish deletions from additions. If a file is modified on both sides, we will pause and show a conflict resolution dialog to the user.
> - **FAT32/exFAT 2-second mtime resolution**: USB drives often use FAT32, which only has a 2-second resolution for file modification times. Our sync engine will compare modification times with a 2-second tolerance threshold.
> - **Multi-Folder Pair Support**: A single USB stick (identified by `.pordata-uuid`) can manage multiple synchronization folder pairs (e.g. Local Folder A <=> USB Subfolder A, Local Folder B <=> USB Subfolder B).
> - **Interactive Flow**: Plugging in a known USB stick will trigger a background pre-scan of all configured folder pairs, open the UI, and display a summary of pending changes. The user can sync all folders or choose a specific folder to preview via a Donut Chart.

## Proposed Changes

### Backend (Rust)
We will implement the synchronization logic and drive-monitoring loop in Rust, using standard crates for performance and safety.

#### [NEW] [Cargo.toml additions](file:///home/ama/Schreibtisch/dev/rust/pordata/src-tauri/Cargo.toml)
We need to add the following dependencies:
- `sysinfo` (for disk detection)
- `rfd` (for native folder dialogs)
- `filetime` (to preserve modification times after copy)
- `walkdir` (for directory traversal)

#### [NEW] [sync_engine.rs](file:///home/ama/Schreibtisch/dev/rust/pordata/src-tauri/src/sync_engine.rs)
Contains the core synchronization algorithm:
- Scan local and USB subfolders recursively
- State comparison and operation classification (Copy to USB, Copy to Local, Delete, Conflict)
- Execution of file copy/delete operations
- Preservation of modification times (mtimes)
- Index serialization/deserialization per folder pair

#### [NEW] [device_monitor.rs](file:///home/ama/Schreibtisch/dev/rust/pordata/src-tauri/src/device_monitor.rs)
Manages the background loop (running every 2 seconds):
- Uses `sysinfo::Disks` to find removable drives
- Looks for `.pordata-uuid` on the drive root
- Matches UUID with local configured jobs
- Emits Tauri events: `device-attached` (which triggers the pre-scan and opens the window), `device-detached`

#### [NEW] [config.rs](file:///home/ama/Schreibtisch/dev/rust/pordata/src-tauri/src/config.rs)
Manages the local configuration file (e.g. `~/.config/pordata/config.json`):
- Maps `USB_UUID` to a list of folder pairs (LocalPath <=> USB Subfolder)
- Stores settings

#### [MODIFY] [main.rs](file:///home/ama/Schreibtisch/dev/rust/pordata/src-tauri/src/main.rs)
Initializes Tauri, starts the background monitor thread, and registers commands:
- `get_sync_jobs`
- `create_sync_job` (adds a new folder pair to a USB stick)
- `delete_sync_job` (removes a folder pair connection)
- `select_directory`
- `run_pre_scan` (scans directories for a specific folder pair or all pairs, returning counts for the frontend)
- `start_sync` (executes the copy/delete actions for selected folder pairs)
- `resolve_conflicts`
- `get_active_devices`

---

### Frontend (React + TypeScript)
We will build a sleek, premium single-page interface using React and custom CSS (Vanilla CSS).

#### [MODIFY] [App.tsx](file:///home/ama/Schreibtisch/dev/rust/pordata/src/App.tsx)
The main container managing application state:
- Listen to background events (device connection, sync progress, conflicts)
- Manage active views:
  - **Dashboard**: Lists configured sync jobs, status, and active USB devices. Shows folder list for the active device.
  - **New Folder Setup**: Dialog to add a new folder pairing (select local directory, input USB subfolder name).
  - **Visual Sync Preview**: 
    - Left Card: Host (PC) info with path and count of newer files.
    - Right Card: USB stick info with path/subfolder and count of newer files.
    - Center: A beautiful SVG Donut Chart representing:
      - Blue: Files to copy to USB (newer on PC)
      - Green: Files to copy to Local (newer on USB)
      - Orange: Files to delete
      - Red: Conflicts
      - Grey: Up-to-date files
    - Center Button inside Donut Chart: **"Start Sync"** (or "Resolve Conflicts" if Red slice > 0)
    - Tab bar / list selector to switch between different folder pairs on the same USB stick.
  - **Conflict Dialog**: Visual card showing conflicting files with size/mtime details, allowing users to choose "Keep Local", "Keep USB", or "Skip".

#### [MODIFY] [App.css](file:///home/ama/Schreibtisch/dev/rust/pordata/src/App.css)
Sleek dark-mode design system with rich glassmorphism aesthetics, modern typography (Inter), smooth transitions, vibrant accent colors, and micro-animations for hover states and progress bars.

---

## Verification Plan

### Automated Tests
- Run `cargo test` on the `sync_engine` logic to ensure all 10 state transition cases work correctly.

### Manual Verification
- Mount a simulated USB drive (or use a real one if available).
- Plug in the drive, verify that the Tauri app detects it and prompts for configuration.
- Configure multiple folder pairs, and run them.
- Edit files on both sides to trigger conflicts, resolve them through the UI, and verify results.
