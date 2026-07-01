//! Configuration management for Pordata Sync.
//!
//! Persists sync-job definitions as pretty-printed JSON at
//! `~/.config/pordata/config.json`.  The [`load_config`] / [`save_config`]
//! convenience wrappers use the default config path, while
//! [`load_config_from`] / [`save_config_to`] accept an explicit path so that
//! unit tests can redirect I/O to a temporary directory.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

// ---------------------------------------------------------------------------
// Data structs
// ---------------------------------------------------------------------------

/// A single folder-pair sync configuration.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SyncJob {
    /// Unique identifier (UUID-like hex string).
    pub id: String,
    /// Absolute path to the local folder.
    pub local_path: String,
    /// Relative subfolder name on the USB stick.
    pub usb_subfolder: String,
    /// UUID of the USB stick (content of `.pordata-uuid` in the stick's root).
    pub usb_uuid: String,
}

/// Top-level application configuration.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Config {
    /// List of configured sync jobs.
    pub jobs: Vec<SyncJob>,
    /// Glob-style patterns for files/directories to exclude from every sync.
    /// Supports `*` as a wildcard prefix or suffix (e.g. `"node_modules"`, `"*.log"`).
    #[serde(default)]
    pub global_ignores: Vec<String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            jobs: Vec::new(),
            global_ignores: Vec::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// Path helper
// ---------------------------------------------------------------------------

/// Returns `~/.config/pordata/config.json`, creating parent directories if
/// they do not already exist.
///
/// # Panics
///
/// Panics if the `HOME` environment variable is not set.
pub fn config_path() -> PathBuf {
    let home = std::env::var("HOME").expect("HOME environment variable is not set");
    let dir = PathBuf::from(home).join(".config").join("pordata");
    // Best-effort: create dirs so later save calls don't fail.
    let _ = fs::create_dir_all(&dir);
    dir.join("config.json")
}

// ---------------------------------------------------------------------------
// Load / Save
// ---------------------------------------------------------------------------

/// Loads the configuration from the default config path.
///
/// Returns an empty [`Config`] when the file does not exist.
pub fn load_config() -> Result<Config, String> {
    load_config_from(&config_path())
}

/// Loads the configuration from an arbitrary `path`.
///
/// Returns an empty [`Config`] when the file does not exist.
pub fn load_config_from(path: &Path) -> Result<Config, String> {
    if !path.exists() {
        return Ok(Config::default());
    }
    let data = fs::read_to_string(path).map_err(|e| format!("Failed to read config: {e}"))?;
    serde_json::from_str(&data).map_err(|e| format!("Failed to parse config: {e}"))
}

/// Saves the configuration to the default config path (pretty-printed JSON).
pub fn save_config(config: &Config) -> Result<(), String> {
    save_config_to(config, &config_path())
}

/// Saves the configuration to an arbitrary `path` (pretty-printed JSON).
///
/// Parent directories are created automatically if they do not exist.
pub fn save_config_to(config: &Config, path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {e}"))?;
    }
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {e}"))?;
    fs::write(path, json).map_err(|e| format!("Failed to write config: {e}"))
}

// ---------------------------------------------------------------------------
// Job management
// ---------------------------------------------------------------------------

/// Generates a simple UUID-like hex ID from the current timestamp and a
/// pseudo-random component derived from the memory address of a local
/// variable (NOT cryptographically secure — purely for uniqueness within
/// this application).
fn generate_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    // Grab some "randomness" from a stack address.
    let stack_var: u8 = 0;
    let addr = &stack_var as *const u8 as usize;
    format!("{:016x}-{:08x}", nanos, addr as u32)
}

/// Creates a new [`SyncJob`], appends it to `config.jobs`, and returns a
/// clone of the newly created job.
pub fn add_sync_job(
    config: &mut Config,
    local_path: String,
    usb_subfolder: String,
    usb_uuid: String,
) -> SyncJob {
    let job = SyncJob {
        id: generate_id(),
        local_path,
        usb_subfolder,
        usb_uuid,
    };
    config.jobs.push(job.clone());
    job
}

/// Removes a sync job by its `job_id`.
///
/// Returns `Err` if no job with the given ID exists.
pub fn remove_sync_job(config: &mut Config, job_id: &str) -> Result<(), String> {
    let before = config.jobs.len();
    config.jobs.retain(|j| j.id != job_id);
    if config.jobs.len() == before {
        Err(format!("No sync job found with id '{job_id}'"))
    } else {
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// Helper: creates a temporary directory and returns the path to a
    /// `config.json` inside it.
    fn temp_config_path() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().expect("failed to create tempdir");
        let path = dir.path().join("config.json");
        (dir, path)
    }

    #[test]
    fn load_missing_file_returns_default() {
        let (_dir, path) = temp_config_path();
        let config = load_config_from(&path).expect("should succeed");
        assert_eq!(config, Config::default());
        assert!(config.jobs.is_empty());
    }

    #[test]
    fn save_and_reload_roundtrip() {
        let (_dir, path) = temp_config_path();

        let mut config = Config::default();
        let job1 = add_sync_job(
            &mut config,
            "/home/user/Documents".into(),
            "documents_backup".into(),
            "usb-uuid-1".into(),
        );
        let job2 = add_sync_job(
            &mut config,
            "/home/user/Photos".into(),
            "photos".into(),
            "usb-uuid-1".into(),
        );

        save_config_to(&config, &path).expect("save should succeed");

        let reloaded = load_config_from(&path).expect("load should succeed");
        assert_eq!(reloaded.jobs.len(), 2);
        assert_eq!(reloaded.jobs[0], job1);
        assert_eq!(reloaded.jobs[1], job2);
        assert_eq!(reloaded, config);
    }

    #[test]
    fn add_job_generates_unique_ids() {
        let mut config = Config::default();
        let a = add_sync_job(&mut config, "/a".into(), "a".into(), "uuid-a".into());
        let b = add_sync_job(&mut config, "/b".into(), "b".into(), "uuid-b".into());
        assert_ne!(a.id, b.id, "generated IDs must be unique");
    }

    #[test]
    fn remove_existing_job() {
        let mut config = Config::default();
        let job = add_sync_job(&mut config, "/tmp/test".into(), "test".into(), "uuid".into());
        assert_eq!(config.jobs.len(), 1);

        remove_sync_job(&mut config, &job.id).expect("remove should succeed");
        assert!(config.jobs.is_empty());
    }

    #[test]
    fn remove_nonexistent_job_returns_error() {
        let mut config = Config::default();
        let result = remove_sync_job(&mut config, "does-not-exist");
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("No sync job found with id 'does-not-exist'"));
    }

    #[test]
    fn saved_json_is_pretty_printed() {
        let (_dir, path) = temp_config_path();

        let mut config = Config::default();
        add_sync_job(&mut config, "/some/path".into(), "backup".into(), "uuid".into());
        save_config_to(&config, &path).expect("save should succeed");

        let raw = fs::read_to_string(&path).expect("should read file");
        // Pretty-printed JSON contains newlines and indentation.
        assert!(raw.contains('\n'), "JSON should be pretty-printed");
        assert!(raw.contains("  "), "JSON should be indented");
    }

    #[test]
    fn full_lifecycle() {
        let (_dir, path) = temp_config_path();

        // Start empty.
        let mut config = load_config_from(&path).expect("load empty");
        assert!(config.jobs.is_empty());

        // Add two jobs, persist.
        let job1 = add_sync_job(&mut config, "/data/music".into(), "music".into(), "usb-uuid".into());
        let _job2 = add_sync_job(&mut config, "/data/videos".into(), "videos".into(), "usb-uuid".into());
        save_config_to(&config, &path).expect("save");

        // Reload and remove the first job.
        let mut config = load_config_from(&path).expect("reload");
        assert_eq!(config.jobs.len(), 2);
        remove_sync_job(&mut config, &job1.id).expect("remove");
        save_config_to(&config, &path).expect("save after remove");

        // Reload again — only one job should remain.
        let config = load_config_from(&path).expect("final reload");
        assert_eq!(config.jobs.len(), 1);
        assert_eq!(config.jobs[0].usb_subfolder, "videos");
    }
}
