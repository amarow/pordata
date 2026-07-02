import { useState } from "react";

interface Props {
  ignores: string[];
  onSave: (ignores: string[]) => void;
  onCancel: () => void;
}

export default function SettingsDialog({ ignores, onSave, onCancel }: Props) {
  const [patterns, setPatterns] = useState<string[]>(ignores);
  const [newPattern, setNewPattern] = useState("");

  function addPattern() {
    const value = newPattern.trim();
    if (!value || patterns.includes(value)) {
      setNewPattern("");
      return;
    }
    setPatterns([...patterns, value]);
    setNewPattern("");
  }

  function removePattern(pattern: string) {
    setPatterns(patterns.filter((p) => p !== pattern));
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="dialog-card settings-dialog">
        <h2>Einstellungen</h2>

        <div className="form-field">
          <label>Global ignorierte Dateien/Verzeichnisse</label>
          <p className="missing-path-intro">
            Diese Muster werden bei jeder Synchronisation übersprungen. `*` ist als
            Platzhalter am Anfang oder Ende erlaubt (z. B. <code>*.log</code>).
          </p>
          <div className="input-row">
            <input
              type="text"
              value={newPattern}
              placeholder="z. B. node_modules oder *.tmp"
              onChange={(e) => setNewPattern(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPattern(); } }}
            />
            <button className="btn-icon-sm" title="Hinzufügen" onClick={addPattern}>
              ＋
            </button>
          </div>

          {patterns.length > 0 && (
            <ul className="ignore-pattern-list">
              {patterns.map((p) => (
                <li key={p}>
                  <span className="ignore-pattern-value">{p}</span>
                  <button
                    className="btn-icon"
                    title="Entfernen"
                    onClick={() => removePattern(p)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="dialog-actions">
          <button className="btn-secondary" onClick={onCancel}>
            Abbrechen
          </button>
          <button className="btn-primary" onClick={() => onSave(patterns)}>
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}
