import { useState } from "react";
import type { ConflictInfo, ConflictResolutionInput, Resolution } from "../types";

interface Props {
  jobId: string;
  conflicts: ConflictInfo[];
  onResolve: (jobId: string, resolutions: ConflictResolutionInput[]) => void;
  onCancel: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(secs: number): string {
  return new Date(secs * 1000).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const OPTIONS: { value: Resolution; label: string }[] = [
  { value: "KeepLocal", label: "Lokal" },
  { value: "KeepUsb", label: "USB" },
  { value: "Skip", label: "Skip" },
];

export default function ConflictDialog({
  jobId,
  conflicts,
  onResolve,
  onCancel,
}: Props) {
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>(
    Object.fromEntries(conflicts.map((c) => [c.rel_path, "Skip" as Resolution]))
  );

  function setAll(r: Resolution) {
    setResolutions(
      Object.fromEntries(conflicts.map((c) => [c.rel_path, r]))
    );
  }

  function handleSubmit() {
    const result: ConflictResolutionInput[] = conflicts.map((c) => ({
      rel_path: c.rel_path,
      resolution: resolutions[c.rel_path] ?? "Skip",
    }));
    onResolve(jobId, result);
  }

  return (
    <div className="view conflict-view">
      <div className="conflict-header">
        <button className="btn-icon" onClick={onCancel}>
          ← Zurück
        </button>
        <h2>
          Konflikte lösen <span className="badge">{conflicts.length}</span>
        </h2>
        <div className="bulk-actions">
          <button className="btn-secondary btn-sm" onClick={() => setAll("KeepLocal")}>
            Alle: Lokal
          </button>
          <button className="btn-secondary btn-sm" onClick={() => setAll("KeepUsb")}>
            Alle: USB
          </button>
          <button className="btn-secondary btn-sm" onClick={() => setAll("Skip")}>
            Alle: Skip
          </button>
        </div>
      </div>

      <div className="conflict-list">
        {conflicts.map((c) => (
          <div key={c.rel_path} className="conflict-item">
            <div className="conflict-path">{c.rel_path}</div>
            <div className="conflict-sides">
              <div className="conflict-side local">
                <span className="side-label">Lokal</span>
                <span className="side-size">{formatSize(c.local_size)}</span>
                <span className="side-mtime">{formatDate(c.local_mtime)}</span>
              </div>
              <div className="conflict-side usb">
                <span className="side-label">USB</span>
                <span className="side-size">{formatSize(c.usb_size)}</span>
                <span className="side-mtime">{formatDate(c.usb_mtime)}</span>
              </div>
            </div>
            <div className="conflict-resolution">
              {OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`res-btn ${
                    resolutions[c.rel_path] === opt.value ? "active" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name={c.rel_path}
                    value={opt.value}
                    checked={resolutions[c.rel_path] === opt.value}
                    onChange={() =>
                      setResolutions((prev) => ({
                        ...prev,
                        [c.rel_path]: opt.value,
                      }))
                    }
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="conflict-footer">
        <button className="btn-primary" onClick={handleSubmit}>
          Konflikte bestätigen
        </button>
      </div>
    </div>
  );
}
