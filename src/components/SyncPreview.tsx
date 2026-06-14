import { useState } from "react";
import type { PreScanResult, SyncSummary } from "../types";

interface Props {
  results: PreScanResult[];
  activeIndex: number;
  onTabChange: (i: number) => void;
  onSync: (jobId: string) => void;
  onBack: () => void;
}

// ---- Donut chart constants ----
const R = 60;
const SW = 24;
const CIRC = 2 * Math.PI * R;
const CX = 100;
const CY = 100;

const SEGS = [
  { key: "copy_to_usb" as const, color: "#4f8ef7", label: "→ USB" },
  { key: "copy_to_local" as const, color: "#3fca7a", label: "→ Lokal" },
  { key: "delete" as const, color: "#f5863a", label: "Löschen" },
  { key: "conflicts" as const, color: "#f05555", label: "Konflikt" },
  { key: "up_to_date" as const, color: "#55556a", label: "Aktuell" },
];

function DonutChart({
  summary,
  onAction,
  hasConflicts,
}: {
  summary: SyncSummary;
  onAction: () => void;
  hasConflicts: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const segs = SEGS.map((s) => ({ ...s, count: summary[s.key] }));
  const total = segs.reduce((a, s) => a + s.count, 0);

  let cum = 0;
  const paths = segs
    .filter((s) => s.count > 0)
    .map((seg, i) => {
      const dashLen = (seg.count / total) * CIRC;
      const offset = -(cum / total) * CIRC;
      cum += seg.count;
      return { ...seg, dashLen, offset, i };
    });

  return (
    <div className="donut-wrapper">
      <div className="donut-container">
        <svg viewBox="0 0 200 200" className="donut-svg">
          {/* Track */}
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={SW}
          />
          {paths.map((seg) => (
            <circle
              key={seg.key}
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke={seg.color}
              strokeWidth={hovered === seg.i ? SW + 5 : SW}
              strokeDasharray={`${seg.dashLen} ${CIRC - seg.dashLen}`}
              strokeDashoffset={seg.offset}
              transform={`rotate(-90 ${CX} ${CY})`}
              className="donut-segment"
              onMouseEnter={() => setHovered(seg.i)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
        </svg>

        <button className="donut-center-btn" onClick={onAction}>
          {hasConflicts ? "Konflikte\nlösen" : "Sync\nstarten"}
        </button>

        {hovered !== null && (
          <div className="donut-tooltip">
            {paths[hovered].label}: {paths[hovered].count}
          </div>
        )}
      </div>

      <div className="donut-legend">
        {segs.map((s) => {
          if (s.count === 0) return null;
          return (
            <div key={s.key} className="legend-item">
              <span className="legend-dot" style={{ background: s.color }} />
              <span className="legend-label">{s.label}</span>
              <span className="legend-count">{s.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SyncPreview({
  results,
  activeIndex,
  onTabChange,
  onSync,
  onBack,
}: Props) {
  const active = results[activeIndex];
  const hasConflicts = active.summary.conflicts > 0;

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
        <div className="info-card">
          <div className="info-card-label">Lokal</div>
          <div className="info-card-path">{active.local_path}</div>
          <div className="info-card-stat">
            <span className="stat-num stat-blue">
              {active.summary.copy_to_usb}
            </span>{" "}
            neuer als USB
          </div>
        </div>

        <DonutChart
          summary={active.summary}
          onAction={() => onSync(active.job_id)}
          hasConflicts={hasConflicts}
        />

        <div className="info-card">
          <div className="info-card-label">USB</div>
          <div className="info-card-path">
            {active.usb_mount_path}/{active.usb_subfolder}
          </div>
          <div className="info-card-stat">
            <span className="stat-num stat-green">
              {active.summary.copy_to_local}
            </span>{" "}
            neuer als Lokal
          </div>
        </div>
      </div>
    </div>
  );
}
