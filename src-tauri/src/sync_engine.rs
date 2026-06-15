//! Core synchronization engine for two-way folder sync.
//!
//! This module implements the heart of Pordata Sync: comparing a **local**
//! directory against a **USB** subfolder, deciding which files need to be
//! copied, deleted, or flagged as conflicts, and then executing those
//! operations while keeping a persisted [`SyncIndex`] up-to-date.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

use filetime::FileTime;
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// FAT32 timestamps have a 2-second granularity, so two mtimes that differ by
/// at most this many seconds are considered equal.
const FAT32_MTIME_TOLERANCE: u64 = 2;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/// Metadata snapshot for a single file at a specific point in time.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FileState {
    /// Path relative to the sync root (forward-slash separated).
    pub rel_path: String,
    /// Last-modification time as seconds since the Unix epoch.
    pub mtime: u64,
    /// File size in bytes.
    pub size: u64,
}

/// Describes what action should be taken for a given file during sync.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum SyncOperation {
    /// The local copy is newer — push it to the USB.
    CopyToUsb { rel_path: String },
    /// The USB copy is newer — pull it to local.
    CopyToLocal { rel_path: String },
    /// The file was deleted locally since the last sync — remove it from USB.
    DeleteOnUsb { rel_path: String },
    /// The file was deleted on USB since the last sync — remove it locally.
    DeleteOnLocal { rel_path: String },
    /// Both sides changed since the last sync — manual resolution required.
    Conflict {
        rel_path: String,
        local_mtime: u64,
        local_size: u64,
        usb_mtime: u64,
        usb_size: u64,
    },
    /// File is identical on both sides — nothing to do.
    UpToDate { rel_path: String },
}

/// Aggregate counts of each operation type, plus the full operation list.
///
/// This is fed straight to the frontend to power the donut chart.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SyncSummary {
    pub copy_to_usb: usize,
    pub copy_to_local: usize,
    pub delete: usize,
    pub conflicts: usize,
    pub up_to_date: usize,
    /// The individual operations that were computed.
    pub operations: Vec<SyncOperation>,
}

/// Persisted snapshot of every file's state at the time of the last
/// successful sync.  Stored as JSON on disk.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SyncIndex {
    /// Map from relative path to [`FileState`].
    pub files: HashMap<String, FileState>,
}

impl SyncIndex {
    /// Create an empty index (no previous sync history).
    pub fn empty() -> Self {
        Self {
            files: HashMap::new(),
        }
    }
}

/// How a conflict should be resolved.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ConflictResolution {
    /// Overwrite the USB copy with the local version.
    KeepLocal,
    /// Overwrite the local copy with the USB version.
    KeepUsb,
    /// Leave both copies as-is and skip synchronisation for this file.
    Skip,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Return `true` when two mtimes are close enough to be considered equal on
/// FAT32 volumes.
fn mtimes_equal(a: u64, b: u64) -> bool {
    a.abs_diff(b) <= FAT32_MTIME_TOLERANCE
}

/// Normalise a relative path to always use forward slashes, regardless of OS.
fn normalise_rel_path(p: &Path) -> String {
    let s = p.to_string_lossy();
    s.replace('\\', "/")
}

/// Copy `src` → `dst`, creating parent directories as needed, then set the
/// destination's mtime to match the source's.
fn copy_preserving_mtime(src: &Path, dst: &Path) -> Result<(), String> {
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            format!(
                "Failed to create parent directory {}: {e}",
                parent.display()
            )
        })?;
    }

    fs::copy(src, dst).map_err(|e| {
        format!(
            "Failed to copy {} → {}: {e}",
            src.display(),
            dst.display()
        )
    })?;

    // Read back the source mtime and apply it to the destination.
    let src_meta = fs::metadata(src).map_err(|e| {
        format!("Failed to read metadata of {}: {e}", src.display())
    })?;
    let src_mtime = FileTime::from_last_modification_time(&src_meta);
    filetime::set_file_mtime(dst, src_mtime).map_err(|e| {
        format!("Failed to set mtime on {}: {e}", dst.display())
    })?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Recursively scan `root` and return a map of relative path → [`FileState`].
///
/// Only regular files are included; directories and symlinks are skipped.
/// Relative paths use forward-slash separators on all platforms.
pub fn scan_directory(root: &Path) -> Result<HashMap<String, FileState>, String> {
    let mut files = HashMap::new();

    for entry in WalkDir::new(root) {
        let entry = entry.map_err(|e| format!("walkdir error: {e}"))?;

        // Skip anything that is not a regular file.
        if !entry.file_type().is_file() {
            continue;
        }

        let abs = entry.path();
        let rel = abs
            .strip_prefix(root)
            .map_err(|e| format!("strip_prefix error: {e}"))?;
        let rel_path = normalise_rel_path(rel);

        let meta = fs::metadata(abs).map_err(|e| {
            format!("Failed to read metadata of {}: {e}", abs.display())
        })?;
        let mtime = FileTime::from_last_modification_time(&meta).unix_seconds() as u64;
        let size = meta.len();

        files.insert(
            rel_path.clone(),
            FileState {
                rel_path,
                mtime,
                size,
            },
        );
    }

    Ok(files)
}

/// Compare the current **local** and **USB** directory snapshots against the
/// persisted [`SyncIndex`] and produce a [`SyncSummary`] describing every
/// required operation.
pub fn compare_states(
    local: &HashMap<String, FileState>,
    usb: &HashMap<String, FileState>,
    last_index: &SyncIndex,
) -> SyncSummary {
    // If the local folder contains no files at all while the index is non-empty,
    // treat it as a fresh/reset local folder rather than "everything was deleted
    // locally". This prevents wiping the USB when the user pairs a new empty
    // local folder with an existing USB folder.
    let local_appears_reset = local.is_empty() && !last_index.files.is_empty();

    let all_paths: HashSet<&String> = local.keys().chain(usb.keys()).collect();

    let mut operations = Vec::new();

    for rel_path in all_paths {
        let in_local = local.get(rel_path);
        let in_usb = usb.get(rel_path);
        let in_index = last_index.files.get(rel_path);

        let op = match (in_local, in_usb) {
            // --- File only on LOCAL side ----------------------------------
            (Some(_local_fs), None) => {
                if in_index.is_some() {
                    // Was synced before → deleted on USB since then.
                    SyncOperation::DeleteOnLocal {
                        rel_path: rel_path.clone(),
                    }
                } else {
                    // Never synced → new local file.
                    SyncOperation::CopyToUsb {
                        rel_path: rel_path.clone(),
                    }
                }
            }

            // --- File only on USB side ------------------------------------
            (None, Some(_usb_fs)) => {
                if in_index.is_some() && !local_appears_reset {
                    // Was synced before and local folder still has other files
                    // → this file was deleted locally since the last sync.
                    SyncOperation::DeleteOnUsb {
                        rel_path: rel_path.clone(),
                    }
                } else {
                    // Either never synced, or local folder is completely empty
                    // (fresh/reset) → pull from USB.
                    SyncOperation::CopyToLocal {
                        rel_path: rel_path.clone(),
                    }
                }
            }

            // --- File on BOTH sides ---------------------------------------
            (Some(local_fs), Some(usb_fs)) => {
                match in_index {
                    Some(idx_fs) => {
                        let local_changed = !mtimes_equal(local_fs.mtime, idx_fs.mtime);
                        let usb_changed = !mtimes_equal(usb_fs.mtime, idx_fs.mtime);

                        match (local_changed, usb_changed) {
                            (false, false) => SyncOperation::UpToDate {
                                rel_path: rel_path.clone(),
                            },
                            (true, false) => SyncOperation::CopyToUsb {
                                rel_path: rel_path.clone(),
                            },
                            (false, true) => SyncOperation::CopyToLocal {
                                rel_path: rel_path.clone(),
                            },
                            (true, true) => SyncOperation::Conflict {
                                rel_path: rel_path.clone(),
                                local_mtime: local_fs.mtime,
                                local_size: local_fs.size,
                                usb_mtime: usb_fs.mtime,
                                usb_size: usb_fs.size,
                            },
                        }
                    }
                    None => {
                        // No previous index — compare mtimes directly.
                        if mtimes_equal(local_fs.mtime, usb_fs.mtime) {
                            SyncOperation::UpToDate {
                                rel_path: rel_path.clone(),
                            }
                        } else {
                            SyncOperation::Conflict {
                                rel_path: rel_path.clone(),
                                local_mtime: local_fs.mtime,
                                local_size: local_fs.size,
                                usb_mtime: usb_fs.mtime,
                                usb_size: usb_fs.size,
                            }
                        }
                    }
                }
            }

            // Shouldn't happen — we collected keys from both maps.
            (None, None) => unreachable!(),
        };

        operations.push(op);
    }

    // Tally up.
    let mut summary = SyncSummary {
        copy_to_usb: 0,
        copy_to_local: 0,
        delete: 0,
        conflicts: 0,
        up_to_date: 0,
        operations,
    };

    for op in &summary.operations {
        match op {
            SyncOperation::CopyToUsb { .. } => summary.copy_to_usb += 1,
            SyncOperation::CopyToLocal { .. } => summary.copy_to_local += 1,
            SyncOperation::DeleteOnUsb { .. } | SyncOperation::DeleteOnLocal { .. } => {
                summary.delete += 1
            }
            SyncOperation::Conflict { .. } => summary.conflicts += 1,
            SyncOperation::UpToDate { .. } => summary.up_to_date += 1,
        }
    }

    summary
}

/// Load a [`SyncIndex`] from a JSON file at `index_path`.
///
/// Returns an empty index if the file does not exist.
pub fn load_index(index_path: &Path) -> Result<SyncIndex, String> {
    if !index_path.exists() {
        return Ok(SyncIndex::empty());
    }
    let data = fs::read_to_string(index_path)
        .map_err(|e| format!("Failed to read index at {}: {e}", index_path.display()))?;
    serde_json::from_str(&data)
        .map_err(|e| format!("Failed to parse index at {}: {e}", index_path.display()))
}

/// Persist a [`SyncIndex`] as JSON to `index_path`.
pub fn save_index(index_path: &Path, index: &SyncIndex) -> Result<(), String> {
    if let Some(parent) = index_path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            format!(
                "Failed to create parent directory {}: {e}",
                parent.display()
            )
        })?;
    }
    let json = serde_json::to_string_pretty(index)
        .map_err(|e| format!("Failed to serialise index: {e}"))?;
    fs::write(index_path, json)
        .map_err(|e| format!("Failed to write index to {}: {e}", index_path.display()))
}

/// Execute the given sync operations, copying and deleting files as needed.
///
/// - `CopyToUsb`    → copy local → USB
/// - `CopyToLocal`  → copy USB → local
/// - `DeleteOnUsb`  → remove file from USB
/// - `DeleteOnLocal` → remove file from local
/// - `Conflict` / `UpToDate` → skipped
///
/// After each successful operation the `index` is updated so that a
/// subsequent crash leaves the index consistent with what has already been
/// written to disk.
///
/// Returns the number of operations that were actually executed.
pub fn execute_sync<F>(
    local_root: &Path,
    usb_root: &Path,
    operations: &[SyncOperation],
    index: &mut SyncIndex,
    cancel: &std::sync::atomic::AtomicBool,
    mut progress: F,
) -> Result<usize, String>
where
    F: FnMut(usize, usize, &str),
{
    let total = operations
        .iter()
        .filter(|op| !matches!(op, SyncOperation::UpToDate { .. } | SyncOperation::Conflict { .. }))
        .count();
    let mut executed: usize = 0;

    for op in operations {
        if cancel.load(std::sync::atomic::Ordering::Relaxed) {
            return Err("Sync abgebrochen".to_string());
        }
        match op {
            SyncOperation::CopyToUsb { rel_path } => {
                let src = local_root.join(rel_path);
                let dst = usb_root.join(rel_path);
                copy_preserving_mtime(&src, &dst)?;

                // Re-read the (now identical) mtime from the destination.
                let meta = fs::metadata(&src).map_err(|e| {
                    format!("metadata after copy: {e}")
                })?;
                let mtime =
                    FileTime::from_last_modification_time(&meta).unix_seconds() as u64;
                let size = meta.len();
                index.files.insert(
                    rel_path.clone(),
                    FileState {
                        rel_path: rel_path.clone(),
                        mtime,
                        size,
                    },
                );
                executed += 1;
                progress(executed, total, rel_path);
            }

            SyncOperation::CopyToLocal { rel_path } => {
                let src = usb_root.join(rel_path);
                let dst = local_root.join(rel_path);
                copy_preserving_mtime(&src, &dst)?;

                let meta = fs::metadata(&src).map_err(|e| {
                    format!("metadata after copy: {e}")
                })?;
                let mtime =
                    FileTime::from_last_modification_time(&meta).unix_seconds() as u64;
                let size = meta.len();
                index.files.insert(
                    rel_path.clone(),
                    FileState {
                        rel_path: rel_path.clone(),
                        mtime,
                        size,
                    },
                );
                executed += 1;
                progress(executed, total, rel_path);
            }

            SyncOperation::DeleteOnUsb { rel_path } => {
                let target = usb_root.join(rel_path);
                if target.exists() {
                    fs::remove_file(&target).map_err(|e| {
                        format!("Failed to delete {}: {e}", target.display())
                    })?;
                }
                index.files.remove(rel_path);
                executed += 1;
                progress(executed, total, rel_path);
            }

            SyncOperation::DeleteOnLocal { rel_path } => {
                let target = local_root.join(rel_path);
                if target.exists() {
                    fs::remove_file(&target).map_err(|e| {
                        format!("Failed to delete {}: {e}", target.display())
                    })?;
                }
                index.files.remove(rel_path);
                executed += 1;
                progress(executed, total, rel_path);
            }

            // Conflicts and up-to-date files are intentionally skipped.
            SyncOperation::Conflict { .. } | SyncOperation::UpToDate { .. } => {}
        }
    }

    Ok(executed)
}

/// Resolve a single conflict for the file at `rel_path`.
///
/// - [`ConflictResolution::KeepLocal`] — copy local → USB, update index.
/// - [`ConflictResolution::KeepUsb`]   — copy USB → local, update index.
/// - [`ConflictResolution::Skip`]      — do nothing.
pub fn resolve_conflict(
    local_root: &Path,
    usb_root: &Path,
    rel_path: &str,
    resolution: ConflictResolution,
    index: &mut SyncIndex,
) -> Result<(), String> {
    match resolution {
        ConflictResolution::KeepLocal => {
            let src = local_root.join(rel_path);
            let dst = usb_root.join(rel_path);
            copy_preserving_mtime(&src, &dst)?;

            let meta = fs::metadata(&src).map_err(|e| {
                format!("metadata after conflict resolution: {e}")
            })?;
            let mtime =
                FileTime::from_last_modification_time(&meta).unix_seconds() as u64;
            let size = meta.len();
            index.files.insert(
                rel_path.to_owned(),
                FileState {
                    rel_path: rel_path.to_owned(),
                    mtime,
                    size,
                },
            );
        }

        ConflictResolution::KeepUsb => {
            let src = usb_root.join(rel_path);
            let dst = local_root.join(rel_path);
            copy_preserving_mtime(&src, &dst)?;

            let meta = fs::metadata(&src).map_err(|e| {
                format!("metadata after conflict resolution: {e}")
            })?;
            let mtime =
                FileTime::from_last_modification_time(&meta).unix_seconds() as u64;
            let size = meta.len();
            index.files.insert(
                rel_path.to_owned(),
                FileState {
                    rel_path: rel_path.to_owned(),
                    mtime,
                    size,
                },
            );
        }

        ConflictResolution::Skip => { /* intentionally empty */ }
    }

    Ok(())
}

// ===========================================================================
// Tests
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self, File};
    use std::io::Write;
    use std::path::PathBuf;

    /// Create a unique temporary directory under the workspace for one test.
    fn tmp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join("pordata_sync_tests").join(name);
        let _ = fs::remove_dir_all(&dir); // clean slate
        fs::create_dir_all(&dir).expect("create tmp dir");
        dir
    }

    /// Write a file and set a specific mtime (seconds since epoch).
    fn write_file(root: &Path, rel: &str, content: &str, mtime_secs: u64) {
        let path = root.join(rel);
        if let Some(p) = path.parent() {
            fs::create_dir_all(p).unwrap();
        }
        let mut f = File::create(&path).unwrap();
        f.write_all(content.as_bytes()).unwrap();
        f.sync_all().unwrap();
        let ft = FileTime::from_unix_time(mtime_secs as i64, 0);
        filetime::set_file_mtime(&path, ft).unwrap();
    }

    /// Build a single-entry [`HashMap`] for convenience.
    fn state_map(entries: Vec<FileState>) -> HashMap<String, FileState> {
        entries
            .into_iter()
            .map(|fs| (fs.rel_path.clone(), fs))
            .collect()
    }

    fn fs_entry(rel_path: &str, mtime: u64, size: u64) -> FileState {
        FileState {
            rel_path: rel_path.to_owned(),
            mtime,
            size,
        }
    }

    // -----------------------------------------------------------------------
    // 1. New file only on local (no index) → CopyToUsb
    // -----------------------------------------------------------------------
    #[test]
    fn test_new_file_local_only_no_index() {
        let local = state_map(vec![fs_entry("a.txt", 1000, 10)]);
        let usb = HashMap::new();
        let idx = SyncIndex::empty();

        let summary = compare_states(&local, &usb, &idx);

        assert_eq!(summary.copy_to_usb, 1);
        assert!(matches!(
            &summary.operations[0],
            SyncOperation::CopyToUsb { rel_path } if rel_path == "a.txt"
        ));
    }

    // -----------------------------------------------------------------------
    // 2. New file only on USB (no index) → CopyToLocal
    // -----------------------------------------------------------------------
    #[test]
    fn test_new_file_usb_only_no_index() {
        let local = HashMap::new();
        let usb = state_map(vec![fs_entry("b.txt", 2000, 20)]);
        let idx = SyncIndex::empty();

        let summary = compare_states(&local, &usb, &idx);

        assert_eq!(summary.copy_to_local, 1);
        assert!(matches!(
            &summary.operations[0],
            SyncOperation::CopyToLocal { rel_path } if rel_path == "b.txt"
        ));
    }

    // -----------------------------------------------------------------------
    // 3. File on both, same mtime → UpToDate
    // -----------------------------------------------------------------------
    #[test]
    fn test_both_same_mtime_up_to_date() {
        let local = state_map(vec![fs_entry("c.txt", 3000, 30)]);
        let usb = state_map(vec![fs_entry("c.txt", 3000, 30)]);
        let idx = SyncIndex {
            files: state_map(vec![fs_entry("c.txt", 3000, 30)]),
        };

        let summary = compare_states(&local, &usb, &idx);

        assert_eq!(summary.up_to_date, 1);
        assert!(matches!(
            &summary.operations[0],
            SyncOperation::UpToDate { rel_path } if rel_path == "c.txt"
        ));
    }

    // -----------------------------------------------------------------------
    // 4. File deleted on USB (was in index) → DeleteOnLocal
    // -----------------------------------------------------------------------
    #[test]
    fn test_deleted_on_usb() {
        let local = state_map(vec![fs_entry("d.txt", 4000, 40)]);
        let usb = HashMap::new();
        let idx = SyncIndex {
            files: state_map(vec![fs_entry("d.txt", 4000, 40)]),
        };

        let summary = compare_states(&local, &usb, &idx);

        assert_eq!(summary.delete, 1);
        assert!(matches!(
            &summary.operations[0],
            SyncOperation::DeleteOnLocal { rel_path } if rel_path == "d.txt"
        ));
    }

    // -----------------------------------------------------------------------
    // 5. File deleted locally (was in index, other local files still exist)
    //    → DeleteOnUsb
    // -----------------------------------------------------------------------
    #[test]
    fn test_deleted_locally() {
        // "other.txt" still exists locally — folder is not empty — so "e.txt"
        // was specifically deleted, not the whole folder reset.
        let local = state_map(vec![fs_entry("other.txt", 1000, 5)]);
        let usb = state_map(vec![
            fs_entry("e.txt", 5000, 50),
            fs_entry("other.txt", 1000, 5),
        ]);
        let idx = SyncIndex {
            files: state_map(vec![
                fs_entry("e.txt", 5000, 50),
                fs_entry("other.txt", 1000, 5),
            ]),
        };

        let summary = compare_states(&local, &usb, &idx);

        assert_eq!(summary.delete, 1);
        let delete_op = summary
            .operations
            .iter()
            .find(|op| matches!(op, SyncOperation::DeleteOnUsb { .. }));
        assert!(matches!(
            delete_op,
            Some(SyncOperation::DeleteOnUsb { rel_path }) if rel_path == "e.txt"
        ));
    }

    // -----------------------------------------------------------------------
    // 5b. Local folder is completely empty, index is non-empty, USB has files
    //     → CopyToLocal (fresh/reset local folder, not intentional delete)
    // -----------------------------------------------------------------------
    #[test]
    fn test_fresh_local_folder_copies_from_usb() {
        let local = HashMap::new();
        let usb = state_map(vec![
            fs_entry("e.txt", 5000, 50),
            fs_entry("f.txt", 6000, 60),
        ]);
        let idx = SyncIndex {
            files: state_map(vec![
                fs_entry("e.txt", 5000, 50),
                fs_entry("f.txt", 6000, 60),
            ]),
        };

        let summary = compare_states(&local, &usb, &idx);

        assert_eq!(summary.copy_to_local, 2);
        assert_eq!(summary.delete, 0);
        assert!(summary
            .operations
            .iter()
            .all(|op| matches!(op, SyncOperation::CopyToLocal { .. })));
    }

    // -----------------------------------------------------------------------
    // 6. File modified only locally → CopyToUsb
    // -----------------------------------------------------------------------
    #[test]
    fn test_modified_only_locally() {
        let local = state_map(vec![fs_entry("f.txt", 6100, 60)]);
        let usb = state_map(vec![fs_entry("f.txt", 6000, 60)]);
        let idx = SyncIndex {
            files: state_map(vec![fs_entry("f.txt", 6000, 60)]),
        };

        let summary = compare_states(&local, &usb, &idx);

        assert_eq!(summary.copy_to_usb, 1);
        assert!(matches!(
            &summary.operations[0],
            SyncOperation::CopyToUsb { rel_path } if rel_path == "f.txt"
        ));
    }

    // -----------------------------------------------------------------------
    // 7. File modified only on USB → CopyToLocal
    // -----------------------------------------------------------------------
    #[test]
    fn test_modified_only_on_usb() {
        let local = state_map(vec![fs_entry("g.txt", 7000, 70)]);
        let usb = state_map(vec![fs_entry("g.txt", 7100, 70)]);
        let idx = SyncIndex {
            files: state_map(vec![fs_entry("g.txt", 7000, 70)]),
        };

        let summary = compare_states(&local, &usb, &idx);

        assert_eq!(summary.copy_to_local, 1);
        assert!(matches!(
            &summary.operations[0],
            SyncOperation::CopyToLocal { rel_path } if rel_path == "g.txt"
        ));
    }

    // -----------------------------------------------------------------------
    // 8. File modified on both sides → Conflict
    // -----------------------------------------------------------------------
    #[test]
    fn test_modified_on_both_sides() {
        let local = state_map(vec![fs_entry("h.txt", 8100, 80)]);
        let usb = state_map(vec![fs_entry("h.txt", 8200, 85)]);
        let idx = SyncIndex {
            files: state_map(vec![fs_entry("h.txt", 8000, 80)]),
        };

        let summary = compare_states(&local, &usb, &idx);

        assert_eq!(summary.conflicts, 1);
        assert!(matches!(
            &summary.operations[0],
            SyncOperation::Conflict {
                rel_path,
                local_mtime: 8100,
                local_size: 80,
                usb_mtime: 8200,
                usb_size: 85,
            } if rel_path == "h.txt"
        ));
    }

    // -----------------------------------------------------------------------
    // 9. File on both, mtime within 2-second tolerance → UpToDate
    // -----------------------------------------------------------------------
    #[test]
    fn test_mtime_within_fat32_tolerance() {
        let local = state_map(vec![fs_entry("i.txt", 9000, 90)]);
        let usb = state_map(vec![fs_entry("i.txt", 9002, 90)]);
        let idx = SyncIndex::empty(); // no index

        let summary = compare_states(&local, &usb, &idx);

        assert_eq!(summary.up_to_date, 1);
        assert!(matches!(
            &summary.operations[0],
            SyncOperation::UpToDate { rel_path } if rel_path == "i.txt"
        ));
    }

    // -----------------------------------------------------------------------
    // 10. File on both, mtime differs > 2s, no index → Conflict
    // -----------------------------------------------------------------------
    #[test]
    fn test_mtime_differs_no_index() {
        let local = state_map(vec![fs_entry("j.txt", 10000, 100)]);
        let usb = state_map(vec![fs_entry("j.txt", 10005, 100)]);
        let idx = SyncIndex::empty();

        let summary = compare_states(&local, &usb, &idx);

        assert_eq!(summary.conflicts, 1);
        assert!(matches!(
            &summary.operations[0],
            SyncOperation::Conflict {
                rel_path,
                local_mtime: 10000,
                local_size: 100,
                usb_mtime: 10005,
                usb_size: 100,
            } if rel_path == "j.txt"
        ));
    }

    // -----------------------------------------------------------------------
    // scan_directory
    // -----------------------------------------------------------------------
    #[test]
    fn test_scan_directory() {
        let dir = tmp_dir("scan");
        write_file(&dir, "hello.txt", "hello", 1_600_000_000);
        write_file(&dir, "sub/deep.txt", "deep", 1_600_000_010);

        let files = scan_directory(&dir).unwrap();

        assert_eq!(files.len(), 2);
        assert!(files.contains_key("hello.txt"));
        assert!(files.contains_key("sub/deep.txt"));
        assert_eq!(files["hello.txt"].mtime, 1_600_000_000);
        assert_eq!(files["hello.txt"].size, 5);
        assert_eq!(files["sub/deep.txt"].mtime, 1_600_000_010);
        assert_eq!(files["sub/deep.txt"].size, 4);
    }

    // -----------------------------------------------------------------------
    // load_index / save_index round-trip
    // -----------------------------------------------------------------------
    #[test]
    fn test_index_round_trip() {
        let dir = tmp_dir("index_rt");
        let path = dir.join("sync_index.json");

        let idx = SyncIndex {
            files: state_map(vec![fs_entry("x.txt", 42, 7)]),
        };

        save_index(&path, &idx).unwrap();
        let loaded = load_index(&path).unwrap();
        assert_eq!(idx, loaded);
    }

    #[test]
    fn test_load_missing_index_returns_empty() {
        let dir = tmp_dir("index_missing");
        let path = dir.join("nonexistent.json");

        let loaded = load_index(&path).unwrap();
        assert!(loaded.files.is_empty());
    }

    // -----------------------------------------------------------------------
    // execute_sync — real file operations
    // -----------------------------------------------------------------------
    #[test]
    fn test_execute_sync_copy_to_usb() {
        let base = tmp_dir("exec_copy_to_usb");
        let local_root = base.join("local");
        let usb_root = base.join("usb");
        fs::create_dir_all(&local_root).unwrap();
        fs::create_dir_all(&usb_root).unwrap();

        write_file(&local_root, "new.txt", "local content", 1_700_000_000);

        let ops = vec![SyncOperation::CopyToUsb {
            rel_path: "new.txt".into(),
        }];
        let mut idx = SyncIndex::empty();

        let count = execute_sync(&local_root, &usb_root, &ops, &mut idx, &std::sync::atomic::AtomicBool::new(false), |_, _, _| {}).unwrap();

        assert_eq!(count, 1);
        assert!(usb_root.join("new.txt").exists());
        assert_eq!(
            fs::read_to_string(usb_root.join("new.txt")).unwrap(),
            "local content"
        );
        assert!(idx.files.contains_key("new.txt"));
    }

    #[test]
    fn test_execute_sync_copy_to_local() {
        let base = tmp_dir("exec_copy_to_local");
        let local_root = base.join("local");
        let usb_root = base.join("usb");
        fs::create_dir_all(&local_root).unwrap();
        fs::create_dir_all(&usb_root).unwrap();

        write_file(&usb_root, "from_usb.txt", "usb content", 1_700_000_100);

        let ops = vec![SyncOperation::CopyToLocal {
            rel_path: "from_usb.txt".into(),
        }];
        let mut idx = SyncIndex::empty();

        let count = execute_sync(&local_root, &usb_root, &ops, &mut idx, &std::sync::atomic::AtomicBool::new(false), |_, _, _| {}).unwrap();

        assert_eq!(count, 1);
        assert!(local_root.join("from_usb.txt").exists());
        assert_eq!(
            fs::read_to_string(local_root.join("from_usb.txt")).unwrap(),
            "usb content"
        );
        assert!(idx.files.contains_key("from_usb.txt"));
    }

    #[test]
    fn test_execute_sync_delete_on_usb() {
        let base = tmp_dir("exec_delete_usb");
        let local_root = base.join("local");
        let usb_root = base.join("usb");
        fs::create_dir_all(&local_root).unwrap();
        fs::create_dir_all(&usb_root).unwrap();

        write_file(&usb_root, "old.txt", "stale", 1_600_000_000);

        let mut idx = SyncIndex {
            files: state_map(vec![fs_entry("old.txt", 1_600_000_000, 5)]),
        };

        let ops = vec![SyncOperation::DeleteOnUsb {
            rel_path: "old.txt".into(),
        }];

        let count = execute_sync(&local_root, &usb_root, &ops, &mut idx, &std::sync::atomic::AtomicBool::new(false), |_, _, _| {}).unwrap();

        assert_eq!(count, 1);
        assert!(!usb_root.join("old.txt").exists());
        assert!(!idx.files.contains_key("old.txt"));
    }

    #[test]
    fn test_execute_sync_delete_on_local() {
        let base = tmp_dir("exec_delete_local");
        let local_root = base.join("local");
        let usb_root = base.join("usb");
        fs::create_dir_all(&local_root).unwrap();
        fs::create_dir_all(&usb_root).unwrap();

        write_file(&local_root, "gone.txt", "bye", 1_600_000_000);

        let mut idx = SyncIndex {
            files: state_map(vec![fs_entry("gone.txt", 1_600_000_000, 3)]),
        };

        let ops = vec![SyncOperation::DeleteOnLocal {
            rel_path: "gone.txt".into(),
        }];

        let count = execute_sync(&local_root, &usb_root, &ops, &mut idx, &std::sync::atomic::AtomicBool::new(false), |_, _, _| {}).unwrap();

        assert_eq!(count, 1);
        assert!(!local_root.join("gone.txt").exists());
        assert!(!idx.files.contains_key("gone.txt"));
    }

    #[test]
    fn test_execute_sync_skips_conflict_and_up_to_date() {
        let base = tmp_dir("exec_skip");
        let local_root = base.join("local");
        let usb_root = base.join("usb");
        fs::create_dir_all(&local_root).unwrap();
        fs::create_dir_all(&usb_root).unwrap();

        let ops = vec![
            SyncOperation::Conflict {
                rel_path: "x.txt".into(),
                local_mtime: 1,
                local_size: 1,
                usb_mtime: 2,
                usb_size: 2,
            },
            SyncOperation::UpToDate {
                rel_path: "y.txt".into(),
            },
        ];
        let mut idx = SyncIndex::empty();

        let count = execute_sync(&local_root, &usb_root, &ops, &mut idx, &std::sync::atomic::AtomicBool::new(false), |_, _, _| {}).unwrap();
        assert_eq!(count, 0);
    }

    // -----------------------------------------------------------------------
    // execute_sync — nested directory creation
    // -----------------------------------------------------------------------
    #[test]
    fn test_execute_sync_creates_parent_dirs() {
        let base = tmp_dir("exec_nested");
        let local_root = base.join("local");
        let usb_root = base.join("usb");
        fs::create_dir_all(&local_root).unwrap();
        fs::create_dir_all(&usb_root).unwrap();

        write_file(&local_root, "a/b/c.txt", "nested", 1_700_000_000);

        let ops = vec![SyncOperation::CopyToUsb {
            rel_path: "a/b/c.txt".into(),
        }];
        let mut idx = SyncIndex::empty();

        let count = execute_sync(&local_root, &usb_root, &ops, &mut idx, &std::sync::atomic::AtomicBool::new(false), |_, _, _| {}).unwrap();

        assert_eq!(count, 1);
        assert!(usb_root.join("a/b/c.txt").exists());
        assert_eq!(
            fs::read_to_string(usb_root.join("a/b/c.txt")).unwrap(),
            "nested"
        );
    }

    // -----------------------------------------------------------------------
    // resolve_conflict
    // -----------------------------------------------------------------------
    #[test]
    fn test_resolve_conflict_keep_local() {
        let base = tmp_dir("resolve_local");
        let local_root = base.join("local");
        let usb_root = base.join("usb");
        fs::create_dir_all(&local_root).unwrap();
        fs::create_dir_all(&usb_root).unwrap();

        write_file(&local_root, "conflict.txt", "LOCAL wins", 1_700_000_000);
        write_file(&usb_root, "conflict.txt", "USB loses", 1_700_000_500);

        let mut idx = SyncIndex::empty();
        resolve_conflict(
            &local_root,
            &usb_root,
            "conflict.txt",
            ConflictResolution::KeepLocal,
            &mut idx,
        )
        .unwrap();

        assert_eq!(
            fs::read_to_string(usb_root.join("conflict.txt")).unwrap(),
            "LOCAL wins"
        );
        assert!(idx.files.contains_key("conflict.txt"));
    }

    #[test]
    fn test_resolve_conflict_keep_usb() {
        let base = tmp_dir("resolve_usb");
        let local_root = base.join("local");
        let usb_root = base.join("usb");
        fs::create_dir_all(&local_root).unwrap();
        fs::create_dir_all(&usb_root).unwrap();

        write_file(&local_root, "conflict.txt", "LOCAL loses", 1_700_000_000);
        write_file(&usb_root, "conflict.txt", "USB wins", 1_700_000_500);

        let mut idx = SyncIndex::empty();
        resolve_conflict(
            &local_root,
            &usb_root,
            "conflict.txt",
            ConflictResolution::KeepUsb,
            &mut idx,
        )
        .unwrap();

        assert_eq!(
            fs::read_to_string(local_root.join("conflict.txt")).unwrap(),
            "USB wins"
        );
        assert!(idx.files.contains_key("conflict.txt"));
    }

    #[test]
    fn test_resolve_conflict_skip() {
        let base = tmp_dir("resolve_skip");
        let local_root = base.join("local");
        let usb_root = base.join("usb");
        fs::create_dir_all(&local_root).unwrap();
        fs::create_dir_all(&usb_root).unwrap();

        write_file(&local_root, "conflict.txt", "LOCAL", 1_700_000_000);
        write_file(&usb_root, "conflict.txt", "USB", 1_700_000_500);

        let mut idx = SyncIndex::empty();
        resolve_conflict(
            &local_root,
            &usb_root,
            "conflict.txt",
            ConflictResolution::Skip,
            &mut idx,
        )
        .unwrap();

        // Both files unchanged.
        assert_eq!(
            fs::read_to_string(local_root.join("conflict.txt")).unwrap(),
            "LOCAL"
        );
        assert_eq!(
            fs::read_to_string(usb_root.join("conflict.txt")).unwrap(),
            "USB"
        );
        assert!(idx.files.is_empty());
    }

    // -----------------------------------------------------------------------
    // Full integration: scan → compare → execute round-trip
    // -----------------------------------------------------------------------
    #[test]
    fn test_full_round_trip() {
        let base = tmp_dir("full_rt");
        let local_root = base.join("local");
        let usb_root = base.join("usb");
        fs::create_dir_all(&local_root).unwrap();
        fs::create_dir_all(&usb_root).unwrap();

        // Local has two files, USB has one (different).
        write_file(&local_root, "shared.txt", "v1", 1_700_000_000);
        write_file(&local_root, "only_local.txt", "mine", 1_700_000_000);
        write_file(&usb_root, "shared.txt", "v1", 1_700_000_000);
        write_file(&usb_root, "only_usb.txt", "theirs", 1_700_000_000);

        let local_state = scan_directory(&local_root).unwrap();
        let usb_state = scan_directory(&usb_root).unwrap();
        let idx = SyncIndex::empty();

        let summary = compare_states(&local_state, &usb_state, &idx);

        // shared.txt → UpToDate (same mtime)
        // only_local.txt → CopyToUsb (new, no index)
        // only_usb.txt → CopyToLocal (new, no index)
        assert_eq!(summary.up_to_date, 1);
        assert_eq!(summary.copy_to_usb, 1);
        assert_eq!(summary.copy_to_local, 1);
        assert_eq!(summary.conflicts, 0);
        assert_eq!(summary.delete, 0);

        let mut idx = SyncIndex::empty();
        let count =
            execute_sync(&local_root, &usb_root, &summary.operations, &mut idx, &std::sync::atomic::AtomicBool::new(false), |_, _, _| {}).unwrap();

        assert_eq!(count, 2); // CopyToUsb + CopyToLocal
        assert!(usb_root.join("only_local.txt").exists());
        assert!(local_root.join("only_usb.txt").exists());
    }
}
