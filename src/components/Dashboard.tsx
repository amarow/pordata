import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SyncJob, DeviceInfo } from "../types";

function openFolder(path: string) {
  invoke("open_in_file_manager", { path }).catch(() => {});
}

interface Props {
  jobs: SyncJob[];
  activeDevices: DeviceInfo[];
  onNewJob: () => void;
  onStartSync: (jobId?: string) => void;
  onDeleteJob: (jobId: string) => void;
}

export default function Dashboard({
  jobs,
  activeDevices,
  onNewJob,
  onStartSync,
  onDeleteJob,
}: Props) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const activeUuids = new Set(activeDevices.map((d) => d.uuid));
  const deviceByUuid = new Map(activeDevices.map((d) => [d.uuid, d]));

  return (
    <div className="view dashboard">
      <header className="app-header">
        <h1>Pordata Sync</h1>
      </header>

      <div className="jobs-grid">
        {jobs.length === 0 ? (
          <div className="empty-state">
            <p>Noch keine Ordner-Pairs konfiguriert.</p>
          </div>
        ) : (
          jobs.map((job) => {
            const connected = activeUuids.has(job.usb_uuid);
            const device = deviceByUuid.get(job.usb_uuid);
            return (
              <div key={job.id} className={`job-card ${connected ? "connected" : ""}`}>
                <div className="job-card-body">
                  <div className="job-path">
                    <span className="label">Lokal</span>
                    <span
                      className="path path-link"
                      title={job.local_path}
                      onClick={() => openFolder(job.local_path)}
                    >
                      {job.local_path}
                    </span>
                  </div>
                  <div className="job-arrow">↕</div>
                  <div className="job-path">
                    <span className="label">USB</span>
                    <span
                      className="path path-link"
                      title={device ? `${device.mount_path}/${job.usb_subfolder}` : job.usb_subfolder}
                      onClick={() => {
                        const full = device
                          ? `${device.mount_path}/${job.usb_subfolder}`
                          : job.usb_subfolder;
                        openFolder(full);
                      }}
                    >
                      {device ? `${device.mount_path}/` : ""}
                      {job.usb_subfolder}
                    </span>
                  </div>
                  {connected && (
                    <div className="job-status-badge">Verbunden</div>
                  )}
                </div>
                <div className="job-card-actions">
                  {confirmDeleteId === job.id ? (
                    <div className="delete-confirm">
                      <span className="delete-confirm-text">
                        Es werden keine Dateien gelöscht — nur diese Verbindung wird entfernt.
                      </span>
                      <button
                        className="btn-danger btn-sm"
                        onClick={() => { onDeleteJob(job.id); setConfirmDeleteId(null); }}
                      >
                        Ja, entfernen
                      </button>
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Abbrechen
                      </button>
                    </div>
                  ) : (
                    <>
                      {connected && (
                        <button
                          className="btn-primary"
                          onClick={() => onStartSync(job.id)}
                        >
                          Sync starten
                        </button>
                      )}
                      <button
                        className="btn-danger"
                        onClick={() => setConfirmDeleteId(job.id)}
                      >
                        Löschen
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="dashboard-footer">
        <button className="btn-secondary" onClick={onNewJob}>
          + Ordner-Pair hinzufügen
        </button>
      </div>
    </div>
  );
}
