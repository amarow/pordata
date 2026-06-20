pub mod config;
pub mod device_monitor;
pub mod sync_engine;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager, State};

use crate::config::{add_sync_job, remove_sync_job, save_config, Config, SyncJob};
use crate::device_monitor::{ActiveDevices, DeviceInfo};
use crate::sync_engine::{
    compare_states, execute_sync, load_index, resolve_conflict, save_index, scan_directory,
    ConflictResolution, SyncOperation, SyncSummary,
};

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

pub struct AppState {
    pub config: Arc<Mutex<Config>>,
    pub active_devices: ActiveDevices,
    pub cancel_sync: Arc<AtomicBool>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn job_index_path(job_id: &str) -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_owned());
    PathBuf::from(home)
        .join(".config")
        .join("pordata")
        .join(format!("index_{job_id}.json"))
}

// ---------------------------------------------------------------------------
// DTOs for cross-command data
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct PreScanResult {
    pub job_id: String,
    pub local_path: String,
    pub usb_mount_path: String,
    pub usb_subfolder: String,
    pub local_file_count: usize,
    pub usb_file_count: usize,
    pub summary: SyncSummary,
}

#[derive(Debug, Deserialize)]
pub struct ConflictResolutionInput {
    pub rel_path: String,
    pub resolution: ConflictResolution,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_sync_jobs(state: State<AppState>) -> Result<Vec<SyncJob>, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    Ok(config.jobs.clone())
}

#[tauri::command]
fn create_sync_job(
    local_path: String,
    usb_subfolder: String,
    usb_uuid: String,
    state: State<AppState>,
) -> Result<SyncJob, String> {
    let mut config = state.config.lock().map_err(|e| e.to_string())?;
    let job = add_sync_job(&mut config, local_path, usb_subfolder, usb_uuid);
    save_config(&config)?;
    Ok(job)
}

#[tauri::command]
fn delete_sync_job(job_id: String, state: State<AppState>) -> Result<(), String> {
    let mut config = state.config.lock().map_err(|e| e.to_string())?;
    remove_sync_job(&mut config, &job_id)?;
    save_config(&config)
}

#[tauri::command]
fn check_path_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
fn create_directory(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

/// Finds the removable disk whose mount point is a prefix of `path`,
/// reads or creates `.pordata-uuid` there, and returns {mount_path, uuid}.
#[tauri::command]
fn init_usb_device(path: String) -> Result<serde_json::Value, String> {
    use sysinfo::Disks;
    let disks = Disks::new_with_refreshed_list();
    let mut best_mount: Option<std::path::PathBuf> = None;
    for disk in disks.list() {
        if !disk.is_removable() {
            continue;
        }
        let mp = disk.mount_point();
        let mp_str = mp.to_string_lossy();
        if path == mp_str.as_ref() || path.starts_with(&format!("{}/", mp_str)) {
            let longer = best_mount
                .as_ref()
                .map_or(true, |b| mp.as_os_str().len() > b.as_os_str().len());
            if longer {
                best_mount = Some(mp.to_path_buf());
            }
        }
    }
    let mount = best_mount
        .ok_or_else(|| "Kein entfernbares Laufwerk für diesen Pfad gefunden.".to_string())?;

    let uuid_file = mount.join(".pordata-uuid");
    let uuid = if uuid_file.exists() {
        let s = std::fs::read_to_string(&uuid_file).map_err(|e| e.to_string())?;
        let t = s.trim().to_owned();
        if t.is_empty() {
            let id = generate_device_id();
            std::fs::write(&uuid_file, &id).map_err(|e| e.to_string())?;
            id
        } else {
            t
        }
    } else {
        let id = generate_device_id();
        std::fs::write(&uuid_file, &id).map_err(|e| e.to_string())?;
        id
    };

    Ok(serde_json::json!({
        "mount_path": mount.to_string_lossy(),
        "uuid": uuid,
    }))
}

fn generate_device_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let d = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("pd-{:x}{:08x}", d.as_secs(), d.subsec_nanos())
}

#[tauri::command]
fn open_in_file_manager(path: String) -> Result<(), String> {
    std::process::Command::new("xdg-open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn select_directory() -> Result<Option<String>, String> {
    let folder = rfd::AsyncFileDialog::new().pick_folder().await;
    Ok(folder.map(|f| f.path().to_string_lossy().to_string()))
}

#[tauri::command]
async fn select_directory_from(start_path: String) -> Result<Option<String>, String> {
    let folder = rfd::AsyncFileDialog::new()
        .set_directory(&start_path)
        .pick_folder()
        .await;
    Ok(folder.map(|f| f.path().to_string_lossy().to_string()))
}

#[tauri::command]
fn run_pre_scan(
    job_id: Option<String>,
    state: State<AppState>,
) -> Result<Vec<PreScanResult>, String> {
    // Collect job info and release the config lock before locking active_devices.
    let jobs: Vec<SyncJob> = {
        let config = state.config.lock().map_err(|e| e.to_string())?;
        match &job_id {
            Some(id) => config.jobs.iter().filter(|j| &j.id == id).cloned().collect(),
            None => config.jobs.clone(),
        }
    };

    let active = state.active_devices.lock().map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for job in &jobs {
        let Some(device) = active.get(&job.usb_uuid) else {
            continue; // USB not connected — skip silently
        };

        let local_root = PathBuf::from(&job.local_path);
        let usb_root = PathBuf::from(&device.mount_path).join(&job.usb_subfolder);
        std::fs::create_dir_all(&usb_root).map_err(|e| e.to_string())?;

        let local_state = scan_directory(&local_root)?;
        let usb_state = scan_directory(&usb_root)?;
        let index = load_index(&job_index_path(&job.id))?;
        let summary = compare_states(&local_state, &usb_state, &index);

        results.push(PreScanResult {
            job_id: job.id.clone(),
            local_path: job.local_path.clone(),
            usb_mount_path: device.mount_path.clone(),
            usb_subfolder: job.usb_subfolder.clone(),
            local_file_count: local_state.len(),
            usb_file_count: usb_state.len(),
            summary,
        });
    }

    Ok(results)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SyncProgressEvent {
    done: usize,
    total: usize,
    copies_done: usize,
    current_file: String,
    direction: String,
}

#[tauri::command]
async fn start_sync(
    job_id: String,
    direction: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<SyncSummary, String> {
    // Extract all data we need before entering the blocking thread.
    let (local_path, usb_subfolder, usb_uuid) = {
        let config = state.config.lock().map_err(|e| e.to_string())?;
        let job = config
            .jobs
            .iter()
            .find(|j| j.id == job_id)
            .ok_or_else(|| format!("Job '{job_id}' not found"))?;
        (job.local_path.clone(), job.usb_subfolder.clone(), job.usb_uuid.clone())
    };

    let mount_path = {
        let active = state.active_devices.lock().map_err(|e| e.to_string())?;
        active
            .get(&usb_uuid)
            .map(|d| d.mount_path.clone())
            .ok_or_else(|| format!("USB device '{usb_uuid}' is not connected"))?
    };

    let cancel = Arc::clone(&state.cancel_sync);
    cancel.store(false, Ordering::Relaxed);
    let idx_path = job_index_path(&job_id);

    // Run all blocking file I/O on a dedicated thread so the GTK/WebKit
    // event loop stays responsive and progress events can be delivered.
    tauri::async_runtime::spawn_blocking(move || {
        let local_root = PathBuf::from(&local_path);
        let usb_root = PathBuf::from(&mount_path).join(&usb_subfolder);
        std::fs::create_dir_all(&usb_root).map_err(|e| e.to_string())?;

        let local_state = scan_directory(&local_root)?;
        let usb_state = scan_directory(&usb_root)?;
        let mut index = load_index(&idx_path)?;
        let summary = compare_states(&local_state, &usb_state, &index);

        let ops: Vec<SyncOperation> = summary.operations.iter().filter(|op| {
            match direction.as_str() {
                "to_usb" => matches!(op,
                    SyncOperation::CopyToUsb { .. } | SyncOperation::DeleteOnUsb { .. }),
                "to_local" => matches!(op,
                    SyncOperation::CopyToLocal { .. } | SyncOperation::DeleteOnLocal { .. }),
                _ => true,
            }
        }).cloned().collect();

        // Throttle events: emit at most every 100 ms or when percentage
        // changes by ≥ 1 % to avoid flooding the webview message queue.
        let mut last_emit = std::time::Instant::now();
        let mut last_pct: usize = 0;
        let mut copies_done: usize = 0;
        let (_, skipped) = execute_sync(&local_root, &usb_root, &ops, &mut index, &cancel, |done, total, file, is_copy| {
            if is_copy { copies_done += 1; }
            let pct = if total > 0 { done * 100 / total } else { 0 };
            let now = std::time::Instant::now();
            if done == total
                || pct > last_pct
                || now.duration_since(last_emit).as_millis() >= 100
            {
                let _ = app.emit("sync-progress", SyncProgressEvent {
                    done,
                    total,
                    copies_done,
                    current_file: file.to_string(),
                    direction: direction.clone(),
                });
                last_emit = now;
                last_pct = pct;
            }
        })?;

        if !skipped.is_empty() {
            let _ = app.emit("sync-skipped", &skipped);
        }

        save_index(&idx_path, &index)?;
        Ok::<SyncSummary, String>(summary)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn cancel_sync(state: State<'_, AppState>) {
    state.cancel_sync.store(true, Ordering::Relaxed);
}

#[tauri::command]
fn resolve_conflicts(
    job_id: String,
    resolutions: Vec<ConflictResolutionInput>,
    state: State<AppState>,
) -> Result<(), String> {
    let (local_path, usb_subfolder, usb_uuid) = {
        let config = state.config.lock().map_err(|e| e.to_string())?;
        let job = config
            .jobs
            .iter()
            .find(|j| j.id == job_id)
            .ok_or_else(|| format!("Job '{job_id}' not found"))?;
        (job.local_path.clone(), job.usb_subfolder.clone(), job.usb_uuid.clone())
    };

    let mount_path = {
        let active = state.active_devices.lock().map_err(|e| e.to_string())?;
        active
            .get(&usb_uuid)
            .map(|d| d.mount_path.clone())
            .ok_or_else(|| format!("USB device '{usb_uuid}' is not connected"))?
    };

    let local_root = PathBuf::from(&local_path);
    let usb_root = PathBuf::from(&mount_path).join(&usb_subfolder);
    let idx_path = job_index_path(&job_id);
    let mut index = load_index(&idx_path)?;

    for res in &resolutions {
        resolve_conflict(&local_root, &usb_root, &res.rel_path, res.resolution, &mut index)?;
    }

    save_index(&idx_path, &index)
}

#[tauri::command]
fn get_active_devices(state: State<AppState>) -> Result<Vec<DeviceInfo>, String> {
    let active = state.active_devices.lock().map_err(|e| e.to_string())?;
    Ok(active.values().cloned().collect())
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config: Arc<Mutex<Config>> =
        Arc::new(Mutex::new(crate::config::load_config().unwrap_or_default()));
    let active_devices: ActiveDevices = Arc::new(Mutex::new(HashMap::new()));
    let cancel_flag: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .manage(AppState {
            config: config.clone(),
            active_devices: active_devices.clone(),
            cancel_sync: cancel_flag.clone(),
        })
        .setup(move |app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_icon(tauri::image::Image::from_bytes(include_bytes!(
                    "../icons/icon.png"
                ))?);
            }
            device_monitor::start_monitor(app.handle().clone(), active_devices);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_sync_jobs,
            create_sync_job,
            delete_sync_job,
            check_path_exists,
            create_directory,
            init_usb_device,
            open_in_file_manager,
            select_directory,
            select_directory_from,
            run_pre_scan,
            start_sync,
            cancel_sync,
            resolve_conflicts,
            get_active_devices,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
