import { useState, useEffect } from "react";
import appIcon from "../assets/icon.png";
import type { SyncJob, DeviceInfo } from "../types";
import { openFolder, usbPath } from "../utils";

interface Props {
  jobs: SyncJob[];
  activeDevices: DeviceInfo[];
  onNewJob: () => void;
  onStartSync: (jobId?: string) => void;
  onDeleteJob: (jobId: string) => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  validLocalPaths: Set<string>;
}

export default function Dashboard({
  jobs,
  activeDevices,
  onNewJob,
  onStartSync,
  onDeleteJob,
  theme,
  onToggleTheme,
  validLocalPaths,
}: Props) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmDeleteId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setConfirmDeleteId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmDeleteId]);
  const activeUuids = new Set(activeDevices.map((d) => d.uuid));
  const deviceByUuid = new Map(activeDevices.map((d) => [d.uuid, d]));

  return (
    <div className="view dashboard">
      <header className="app-header">
        <div className="app-title">
          <img src={appIcon} alt="" className="app-icon" />
          <h1>Pordata Sync</h1>
        </div>
        <button
          className="btn-theme-toggle"
          title={theme === "dark" ? "Helles Design" : "Dunkles Design"}
          onClick={onToggleTheme}
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </header>

      <div className="jobs-grid">
        {jobs.length === 0 && (
          <div className="empty-state">
            <p>Noch keine Ordner-Pairs konfiguriert.</p>
          </div>
        )}
        {jobs.map((job) => {
            const connected = activeUuids.has(job.usb_uuid);
            const device = deviceByUuid.get(job.usb_uuid);
            return (
              <div key={job.id} className={`job-card ${connected ? "connected" : ""}`}>
                <div className="job-card-body">
                  <div className="job-path job-path-local">
                    <span className="label">Lokal</span>
                    <span
                      className={`path path-link ${validLocalPaths.has(job.local_path) ? "" : "path-dim"}`}
                      title={job.local_path}
                      onClick={() => openFolder(job.local_path)}
                    >
                      {job.local_path}
                    </span>
                  </div>

                  <div className="job-center-action">
                    {connected ? (
                      <button
                        className="btn-icon-action btn-icon-sync"
                        title="Synchronisation starten"
                        onClick={() => onStartSync(job.id)}
                      >
                        <span className="sync-arrows">
                          <span className="arrow-left">⬅</span>
                          <span className="arrow-right">➡</span>
                        </span>
                      </button>
                    ) : (
                      <span className="job-arrow">↔</span>
                    )}
                  </div>

                  <div className="job-path job-path-right">
                    <span className="label">USB</span>
                    <span
                      className={`path path-link ${connected ? "" : "path-dim"}`}
                      title={device ? usbPath(device.mount_path, job.usb_subfolder) : job.usb_subfolder}
                      onClick={() => openFolder(device ? usbPath(device.mount_path, job.usb_subfolder) : job.usb_subfolder)}
                    >
                      {device ? `${device.mount_path}/` : ""}
                      {job.usb_subfolder}
                    </span>
                  </div>
                </div>
                <div className="job-card-actions">
                  <button
                    className="btn-icon-action btn-icon-delete"
                    title="Synchronisation entfernen"
                    onClick={() => setConfirmDeleteId(job.id)}
                  >
                    🗑
                  </button>
                </div>
              </div>
            );
        })}

        <button className="job-add-btn" onClick={onNewJob}>
          <span className="job-add-icon">＋</span>
          <span>Neue Synchronisation</span>
        </button>
      </div>

      {confirmDeleteId && (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDeleteId(null); }}
        >
          <div className="dialog-card delete-confirm-dialog">
            <h2>Synchronisation entfernen?</h2>
            <p className="delete-confirm-text">
              Es werden keine Dateien gelöscht — nur diese Verbindung wird entfernt.
            </p>
            <div className="dialog-actions">
              <button className="btn-secondary" onClick={() => setConfirmDeleteId(null)}>
                Abbrechen
              </button>
              <button
                className="btn-danger"
                onClick={() => { onDeleteJob(confirmDeleteId); setConfirmDeleteId(null); }}
              >
                Ja, entfernen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
