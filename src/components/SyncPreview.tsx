import type { PreScanResult } from "../types";

interface SyncProgress {
  done: number;
  total: number;
  currentFile: string;
}

interface Props {
  results: PreScanResult[];
  activeIndex: number;
  onTabChange: (i: number) => void;
  onSync: (jobId: string, direction: "to_usb" | "to_local" | "both") => void;
  onBack: () => void;
  syncProgress: SyncProgress | null;
  onCancelSync: () => void;
}

function FileIcon() {
  return (
    <svg width="15" height="18" viewBox="0 0 15 18" fill="currentColor" aria-hidden>
      <path d="M9 0H2C.9 0 0 .9 0 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V5L9 0zm-1 6V1.5L12.5 6H8z" />
    </svg>
  );
}

export default function SyncPreview({ results, activeIndex, onTabChange, onSync, onBack, syncProgress, onCancelSync }: Props) {
  const active = results[activeIndex];
  const s = active.summary;

  const deleteOnUsb = s.operations.filter((op) => "DeleteOnUsb" in op).length;
  const deleteOnLocal = s.operations.filter((op) => "DeleteOnLocal" in op).length;

  const hasToUsb = s.copy_to_usb > 0 || deleteOnUsb > 0;
  const hasToLocal = s.copy_to_local > 0 || deleteOnLocal > 0;

  return (
    <div className="view sync-preview">
      <div className="preview-header">
        <button className="btn-icon" onClick={onBack}>
          ← Zurück
        </button>
        <h2>Sync-Vorschau</h2>
      </div>

      {results.length > 1 && (
        <div className="tab-bar">
          {results.map((r, i) => (
            <button
              key={r.job_id}
              className={`tab ${i === activeIndex ? "active" : ""}`}
              onClick={() => onTabChange(i)}
            >
              {r.usb_subfolder}
            </button>
          ))}
        </div>
      )}

      <div className="preview-body">
        {/* Left info card */}
        <div className="info-card">
          <div className="info-card-label label-local">Lokal</div>
          <div className="info-card-path">{active.local_path}</div>
          <div className="info-card-stat">
            <span className="stat-num stat-blue">{active.local_file_count}</span>
            Datei{active.local_file_count !== 1 ? "en" : ""}
          </div>
        </div>

        {/* Direction buttons or progress display */}
        <div className="dir-buttons-wrap">
          {syncProgress !== null ? (
            <div className="sync-running">
              <div className="sync-running-label">
                {syncProgress.total === 0
                  ? "Wird vorbereitet…"
                  : `${syncProgress.done} von ${syncProgress.total} Dateien`}
                {syncProgress.total > 0 && (
                  <span className="sync-running-pct">
                    {Math.round((syncProgress.done / syncProgress.total) * 100)} %
                  </span>
                )}
              </div>
              <div className="sync-progress-track">
                <div
                  className="sync-progress-fill"
                  style={{
                    width: syncProgress.total > 0
                      ? `${(syncProgress.done / syncProgress.total) * 100}%`
                      : "0%",
                  }}
                />
              </div>
              {syncProgress.currentFile && (
                <div className="sync-running-file">{syncProgress.currentFile}</div>
              )}
              <button className="btn-secondary" onClick={onCancelSync}>
                Abbrechen
              </button>
            </div>
          ) : (
            <>
              <button
                className="dir-btn dir-btn-to-usb"
                onClick={() => onSync(active.job_id, "to_usb")}
                disabled={!hasToUsb}
              >
                <span className="dir-btn-top">
                  <FileIcon />
                  <span className="dir-btn-count">{s.copy_to_usb}</span>
                  <span className="dir-btn-unit">Datei{s.copy_to_usb !== 1 ? "en" : ""}</span>
                </span>
                <span className="dir-btn-arrow">Lokal → USB</span>
                {deleteOnUsb > 0 && (
                  <span className="dir-btn-delete">{deleteOnUsb} löschen</span>
                )}
              </button>

              <button
                className="dir-btn dir-btn-to-local"
                onClick={() => onSync(active.job_id, "to_local")}
                disabled={!hasToLocal}
              >
                <span className="dir-btn-top">
                  <FileIcon />
                  <span className="dir-btn-count">{s.copy_to_local}</span>
                  <span className="dir-btn-unit">Datei{s.copy_to_local !== 1 ? "en" : ""}</span>
                </span>
                <span className="dir-btn-arrow">Lokal ← USB</span>
                {deleteOnLocal > 0 && (
                  <span className="dir-btn-delete">{deleteOnLocal} löschen</span>
                )}
              </button>

              {s.conflicts > 0 && (
                <button
                  className="dir-btn dir-btn-conflicts"
                  onClick={() => onSync(active.job_id, "both")}
                >
                  <span className="dir-btn-top">
                    <span className="dir-btn-count">{s.conflicts}</span>
                    <span className="dir-btn-unit">Konflikt{s.conflicts !== 1 ? "e" : ""}</span>
                  </span>
                  <span className="dir-btn-arrow">Konflikte lösen</span>
                </button>
              )}
            </>
          )}
        </div>

        {/* Right info card */}
        <div className="info-card">
          <div className="info-card-label label-usb">USB</div>
          <div className="info-card-path">
            {active.usb_mount_path}/{active.usb_subfolder}
          </div>
          <div className="info-card-stat">
            <span className="stat-num stat-green">{active.usb_file_count}</span>
            Datei{active.usb_file_count !== 1 ? "en" : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
