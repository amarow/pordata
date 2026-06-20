import { useState } from "react";
import type { DeviceInfo } from "../types";

interface Props {
  activeDevices: DeviceInfo[];
  onSave: (localPath: string, usbSubfolder: string, usbUuid: string) => void;
  onCancel: () => void;
  onPickLocalFolder: () => Promise<string | null>;
  onPickUsbFolder: (startPath: string) => Promise<string | null>;
  onInitUsbDevice: (path: string) => Promise<{ mount_path: string; uuid: string }>;
}

export default function NewJobDialog({ activeDevices, onSave, onCancel, onPickLocalFolder, onPickUsbFolder, onInitUsbDevice }: Props) {
  const [localPath, setLocalPath] = useState("");
  const [usbFullPath, setUsbFullPath] = useState("");
  const [detectedUuid, setDetectedUuid] = useState("");
  const [detectedMountPath, setDetectedMountPath] = useState("");
  const [usbError, setUsbError] = useState("");

  function detectFromActive(pickedPath: string): DeviceInfo | undefined {
    return [...activeDevices]
      .sort((a, b) => b.mount_path.length - a.mount_path.length)
      .find((d) => pickedPath === d.mount_path || pickedPath.startsWith(d.mount_path + "/"));
  }

  async function pickFolder() {
    const result = await onPickLocalFolder();
    if (result) setLocalPath(result);
  }

  async function pickUsbFolder() {
    const startPath =
      activeDevices.length > 0
        ? activeDevices[0].mount_path.split("/").slice(0, -1).join("/") || "/media"
        : "/media";
    const result = await onPickUsbFolder(startPath);
    if (!result) return;

    setUsbFullPath(result);
    setUsbError("");

    const device = detectFromActive(result);
    if (device) {
      setDetectedUuid(device.uuid);
      setDetectedMountPath(device.mount_path);
      return;
    }

    try {
      const info = await onInitUsbDevice(result);
      setDetectedUuid(info.uuid);
      setDetectedMountPath(info.mount_path);
    } catch (e) {
      setDetectedUuid("");
      setDetectedMountPath("");
      setUsbError(String(e));
    }
  }

  function handleUsbInput(value: string) {
    setUsbFullPath(value);
    setUsbError("");
    const device = detectFromActive(value);
    if (device) {
      setDetectedUuid(device.uuid);
      setDetectedMountPath(device.mount_path);
    } else {
      setDetectedUuid("");
      setDetectedMountPath("");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!localPath || !usbFullPath || !detectedUuid || !detectedMountPath) return;
    const rel = usbFullPath.startsWith(detectedMountPath)
      ? usbFullPath.slice(detectedMountPath.length).replace(/^\/+/, "")
      : "";
    onSave(localPath, rel || ".", detectedUuid);
  }

  const canSave = !!localPath && !!usbFullPath && !!detectedUuid && !!detectedMountPath;

  return (
    <div className="view new-job-view">
      <div className="preview-header">
        <button className="btn-icon" onClick={onCancel}>
          ← Zurück
        </button>
        <h2>Neue Synchronisation</h2>
      </div>

      <form className="new-job-form" onSubmit={handleSubmit}>
        <div className="form-field">
          <label className="label-local">Lokaler Ordner</label>
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
          <label className="label-usb">USB-Ordner</label>
          <div className="input-row">
            <input
              type="text"
              value={usbFullPath}
              onChange={(e) => handleUsbInput(e.target.value)}
              placeholder="/media/user/STICK oder Unterordner"
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={pickUsbFolder}
            >
              Durchsuchen…
            </button>
          </div>
          {usbError && <p className="warning-text">{usbError}</p>}
          {usbFullPath && !detectedUuid && !usbError && (
            <p className="warning-text">
              Kein Laufwerk erkannt — bitte per „Durchsuchen" einen Ordner auf dem Stick wählen.
            </p>
          )}
          {detectedMountPath && (
            <p className="usb-detected-hint">
              Laufwerk erkannt: <span>{detectedMountPath}</span>
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
  );
}
