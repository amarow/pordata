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
  onSetupSticks: () => void;
  onOpenSettings: () => void;
  appVersion: string;
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
  onSetupSticks,
  onOpenSettings,
  appVersion,
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
          {appVersion && <span className="app-version">v{appVersion}</span>}
        </div>
        <div className="header-actions">
          <button
            className="btn-theme-toggle"
            title="USB-Sticks einrichten (pordata-Ordner, AppImage)"
            onClick={onSetupSticks}
            disabled={activeDevices.length === 0}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
              <rect x="7" y="12" width="4" height="4" rx="1"/>
              <line x1="9" y1="12" x2="9" y2="7" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="4" y1="7" x2="14" y2="7" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="4" y1="7" x2="4" y2="4" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="4" cy="3" r="1.5"/>
              <line x1="14" y1="7" x2="14" y2="4" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="12.5" y="2" width="3" height="3" rx="0.3"/>
            </svg>
          </button>
          <button
            className="btn-theme-toggle"
            title="Einstellungen"
            onClick={onOpenSettings}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
              <circle cx="9" cy="9" r="2.4" />
              <path d="M9 1.8v1.6M9 14.6v1.6M16.2 9h-1.6M3.4 9H1.8M14.02 3.98l-1.13 1.13M5.11 12.9l-1.13 1.13M14.02 14.02l-1.13-1.13M5.11 5.11L3.98 3.98" />
            </svg>
          </button>
          <button
            className="btn-theme-toggle"
            title={theme === "dark" ? "Helles Design" : "Dunkles Design"}
            onClick={onToggleTheme}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
              <circle cx="9" cy="9" r="7" />
              <path d="M9 2a7 7 0 0 0 0 14z" fill="currentColor" stroke="none" />
            </svg>
          </button>
        </div>
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
