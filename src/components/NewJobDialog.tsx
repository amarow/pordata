import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { DeviceInfo } from "../types";

interface Props {
  activeDevices: DeviceInfo[];
  onSave: (localPath: string, usbSubfolder: string, usbUuid: string) => void;
  onCancel: () => void;
}

export default function NewJobDialog({ activeDevices, onSave, onCancel }: Props) {
  const [localPath, setLocalPath] = useState("");
  const [usbFullPath, setUsbFullPath] = useState("");
  const [detectedUuid, setDetectedUuid] = useState("");

  function detectDevice(pickedPath: string): DeviceInfo | undefined {
    // longest mount_path wins (in case of nested mounts)
    return [...activeDevices]
      .sort((a, b) => b.mount_path.length - a.mount_path.length)
      .find((d) => pickedPath === d.mount_path || pickedPath.startsWith(d.mount_path + "/"));
  }

  async function pickFolder() {
    const result = await invoke<string | null>("select_directory");
    if (result) setLocalPath(result);
  }

  async function pickUsbFolder() {
    // Start at the parent of the first mounted device, or /media as fallback
    const startPath =
      activeDevices.length > 0
        ? activeDevices[0].mount_path.split("/").slice(0, -1).join("/") || "/media"
        : "/media";

    const result = await invoke<string | null>("select_directory_from", {
      startPath,
    });
    if (!result) return;

    setUsbFullPath(result);

    const device = detectDevice(result);
    if (device) {
      setDetectedUuid(device.uuid);
    } else {
      setDetectedUuid("");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!localPath || !usbFullPath || !detectedUuid) return;

    const device = activeDevices.find((d) => d.uuid === detectedUuid)!;
    const rel = usbFullPath.startsWith(device.mount_path)
      ? usbFullPath.slice(device.mount_path.length).replace(/^\/+/, "")
      : "";

    onSave(localPath, rel || ".", detectedUuid);
  }

  const usbOk = !!usbFullPath && !!detectedUuid;
  const canSave = !!localPath && usbOk;

  return (
    <div className="view dialog-view">
      <div className="dialog-card">
        <h2>Neues Ordner-Pair</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label>Lokaler Ordner</label>
            <div className="input-row">
              <input
                type="text"
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                placeholder="/home/user/Dokumente"
              />
              <button type="button" className="btn-secondary" onClick={pickFolder}>
                Durchsuchen…
              </button>
            </div>
          </div>

          <div className="form-field">
            <label>USB-Ordner</label>
            <div className="input-row">
              <input
                type="text"
                value={usbFullPath}
                onChange={(e) => {
                  setUsbFullPath(e.target.value);
                  const device = detectDevice(e.target.value);
                  setDetectedUuid(device?.uuid ?? "");
                }}
                placeholder="/media/user/STICK oder Unterordner"
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={pickUsbFolder}
                disabled={activeDevices.length === 0}
              >
                Durchsuchen…
              </button>
            </div>
            {usbFullPath && !detectedUuid && (
              <p className="warning-text">
                Kein verbundener USB-Stick erkannt — bitte einen Ordner auf dem Stick wählen.
              </p>
            )}
          </div>

          <div className="dialog-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Abbrechen
            </button>
            <button type="submit" className="btn-primary" disabled={!canSave}>
              Speichern
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
