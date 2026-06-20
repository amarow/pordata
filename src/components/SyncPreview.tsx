import { useState } from "react";
import type { PreScanResult, SyncOperation } from "../types";
import { openFolder, usbPath } from "../utils";

interface SyncProgress {
  done: number;
  total: number;
  copiesDone: number;
  currentFile: string;
  direction: string;
}

interface Props {
  results: PreScanResult[];
  activeIndex: number;
  onTabChange: (i: number) => void;
  onSync: (jobId: string, direction: "to_usb" | "to_local" | "both") => void;
  onManual: (jobId: string) => void;
  onBack: () => void;
  syncProgress: SyncProgress | null;
  onCancelSync: () => void;
  onFreshScan: (jobId: string) => void;
}

function FileIcon() {
  return (
    <svg width="15" height="18" viewBox="0 0 15 18" fill="currentColor" aria-hidden>
      <path d="M9 0H2C.9 0 0 .9 0 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V5L9 0zm-1 6V1.5L12.5 6H8z" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg className="dir-arrow-icon" viewBox="0 0 56 28" fill="currentColor" aria-hidden>
      <path d="M0 10 H34 V3 L56 14 L34 25 V18 H0 Z" />
    </svg>
  );
}

function ArrowLeft() {
  return (
    <svg className="dir-arrow-icon" viewBox="0 0 56 28" fill="currentColor" aria-hidden>
      <path d="M56 10 H22 V3 L0 14 L22 25 V18 H56 Z" />
    </svg>
  );
}

function LupeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <line x1="13" y1="13" x2="18" y2="18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

interface FileListModalProps {
  direction: "to_usb" | "to_local";
  operations: SyncOperation[];
  onClose: () => void;
}

function FileListModal({ direction, operations, onClose }: FileListModalProps) {
  const copies = operations
    .filter((op) => direction === "to_usb" ? "CopyToUsb" in op : "CopyToLocal" in op)
    .map((op) => (op as any)[direction === "to_usb" ? "CopyToUsb" : "CopyToLocal"].rel_path as string);

  const deletes = operations
    .filter((op) => direction === "to_usb" ? "DeleteOnUsb" in op : "DeleteOnLocal" in op)
    .map((op) => (op as any)[direction === "to_usb" ? "DeleteOnUsb" : "DeleteOnLocal"].rel_path as string);

  const label = direction === "to_usb" ? "Lokal → USB" : "Lokal ← USB";
  const colorCls = direction === "to_usb" ? "filelist-usb" : "filelist-local";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`filelist-modal ${colorCls}`} onClick={(e) => e.stopPropagation()}>
        <div className="filelist-header">
          <span className="filelist-title">{label}</span>
          <button className="btn-icon filelist-close" onClick={onClose}>✕</button>
        </div>
        <div className="filelist-body">
          {copies.length > 0 && (
            <section>
              <div className="filelist-section-label">Kopieren ({copies.length})</div>
              {copies.map((p) => (
                <div key={p} className="filelist-row filelist-row-copy">
                  <span className="filelist-row-icon">+</span>
                  <span className="filelist-row-path">{p}</span>
                </div>
              ))}
            </section>
          )}
          {deletes.length > 0 && (
            <section>
              <div className="filelist-section-label">Löschen ({deletes.length})</div>
              {deletes.map((p) => (
                <div key={p} className="filelist-row filelist-row-delete">
                  <span className="filelist-row-icon">−</span>
                  <span className="filelist-row-path">{p}</span>
                </div>
              ))}
            </section>
          )}
          {copies.length === 0 && deletes.length === 0 && (
            <div className="filelist-empty">Keine Änderungen</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SyncPreview({ results, activeIndex, onTabChange, onSync, onManual, onBack, syncProgress, onCancelSync, onFreshScan }: Props) {
  const active = results[activeIndex];
  const s = active.summary;
  const [fileListDir, setFileListDir] = useState<"to_usb" | "to_local" | null>(null);

  const deleteOnUsb = s.operations.filter((op) => "DeleteOnUsb" in op).length;
  const deleteOnLocal = s.operations.filter((op) => "DeleteOnLocal" in op).length;

  const hasToUsb = s.copy_to_usb > 0 || deleteOnUsb > 0;
  const hasToLocal = s.copy_to_local > 0 || deleteOnLocal > 0;

  return (
    <div className="view sync-preview">
      {fileListDir && (
        <FileListModal
          direction={fileListDir}
          operations={s.operations}
          onClose={() => setFileListDir(null)}
        />
      )}

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
          <span className="info-card-path path-link" onClick={() => openFolder(active.local_path)} title="Im Dateimanager öffnen">{active.local_path}</span>
          <div className="info-card-stat">
            <span className="stat-num stat-blue">
              {syncProgress?.direction === "to_local"
                ? active.local_file_count + syncProgress.copiesDone
                : active.local_file_count}
            </span>
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
              <div className="sync-running-file">{syncProgress.currentFile}</div>
              <button className="btn-secondary" onClick={onCancelSync}>
                Abbrechen
              </button>
            </div>
          ) : (
            <>
              <div className="dir-btn-wrap">
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
                  <ArrowRight />
                  <span className="dir-btn-label">Lokal → USB</span>
                  {deleteOnUsb > 0 && (
                    <span className="dir-btn-delete">{deleteOnUsb} löschen</span>
                  )}
                </button>
                <button
                  className="dir-btn-lupe"
                  title="Dateien anzeigen"
                  onClick={() => setFileListDir("to_usb")}
                >
                  <LupeIcon />
                </button>
              </div>

              <div className="dir-btn-wrap">
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
                  <ArrowLeft />
                  <span className="dir-btn-label">Lokal ← USB</span>
                  {deleteOnLocal > 0 && (
                    <span className="dir-btn-delete">{deleteOnLocal} löschen</span>
                  )}
                </button>
                <button
                  className="dir-btn-lupe"
                  title="Dateien anzeigen"
                  onClick={() => setFileListDir("to_local")}
                >
                  <LupeIcon />
                </button>
              </div>

              <div className="preview-aux-btns">
                <button className="btn-reset" onClick={() => onFreshScan(active.job_id)}>
                  Aktualisieren
                </button>
                <button className="btn-reset btn-reset-manual" onClick={() => onManual(active.job_id)}>
                  Manuell
                  {s.conflicts > 0 && (
                    <span className="manual-conflict-badge">{s.conflicts}</span>
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right info card */}
        <div className="info-card">
          <div className="info-card-label label-usb">USB</div>
          <span className="info-card-path path-link" onClick={() => openFolder(usbPath(active.usb_mount_path, active.usb_subfolder))} title="Im Dateimanager öffnen">
            {active.usb_mount_path}/{active.usb_subfolder}
          </span>
          <div className="info-card-stat">
            <span className="stat-num stat-green">
              {syncProgress?.direction === "to_usb"
                ? active.usb_file_count + syncProgress.copiesDone
                : active.usb_file_count}
            </span>
            Datei{active.usb_file_count !== 1 ? "en" : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
