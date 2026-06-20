//! Background USB device monitor.
//!
//! Polls connected disks every 2 seconds, reads `.pordata-uuid` from the root
//! of each removable drive, and emits Tauri events when any Pordata-tagged
//! device appears or disappears — regardless of whether a matching sync job
//! exists yet.  This lets the NewJobDialog show available sticks before the
//! first job is created.  The main window is shown automatically when a
//! tagged stick is plugged in.

use std::collections::HashMap;
use std::fs;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sysinfo::Disks;
use tauri::{AppHandle, Emitter, Manager};

const POLL_INTERVAL: Duration = Duration::from_secs(2);

/// Path of the UUID file relative to the stick's mount point.
pub const UUID_SUBPATH: &str = "pordata/.pordata-uuid";

/// Information about a currently-connected Pordata USB device.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub uuid: String,
    pub mount_path: String,
}

/// Shared map of UUID → [`DeviceInfo`] for all currently active devices.
pub type ActiveDevices = Arc<Mutex<HashMap<String, DeviceInfo>>>;

#[derive(Clone, Serialize)]
struct DeviceAttachedPayload {
    uuid: String,
    mount_path: String,
}

#[derive(Clone, Serialize)]
struct DeviceDetachedPayload {
    uuid: String,
}

/// Read the trimmed content of `pordata/.pordata-uuid` from `mount_point`.
/// Returns `None` when the file is absent or empty.
fn read_pordata_uuid(mount_point: &std::path::Path) -> Option<String> {
    let s = fs::read_to_string(mount_point.join(UUID_SUBPATH)).ok()?;
    let trimmed = s.trim().to_owned();
    if trimmed.is_empty() { None } else { Some(trimmed) }
}

/// Spawn the background polling thread.
///
/// The thread runs forever; stopping the application terminates it.
pub fn start_monitor(app: AppHandle, active_devices: ActiveDevices) {
    thread::spawn(move || loop {
        poll_once(&app, &active_devices);
        thread::sleep(POLL_INTERVAL);
    });
}

fn poll_once(app: &AppHandle, active_devices: &ActiveDevices) {
    // Build a snapshot of all removable disks that have a .pordata-uuid file.
    let disks = Disks::new_with_refreshed_list();
    let mut current: HashMap<String, String> = HashMap::new();
    for disk in disks.list() {
        if !disk.is_removable() {
            continue;
        }
        if let Some(uuid) = read_pordata_uuid(disk.mount_point()) {
            current.insert(uuid, disk.mount_point().to_string_lossy().into_owned());
        }
    }

    let Ok(mut active) = active_devices.lock() else { return };

    // Newly attached devices.
    for (uuid, mount_path) in &current {
        if active.contains_key(uuid) {
            continue;
        }
        let _ = app.emit(
            "device-attached",
            DeviceAttachedPayload { uuid: uuid.clone(), mount_path: mount_path.clone() },
        );
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.show();
            let _ = win.set_focus();
        }
        active.insert(uuid.clone(), DeviceInfo { uuid: uuid.clone(), mount_path: mount_path.clone() });
    }

    // Detached devices.
    let gone: Vec<String> = active
        .keys()
        .filter(|u| !current.contains_key(*u))
        .cloned()
        .collect();
    for uuid in gone {
        let _ = app.emit("device-detached", DeviceDetachedPayload { uuid: uuid.clone() });
        active.remove(&uuid);
    }
}
