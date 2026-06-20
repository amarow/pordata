import { useState } from "react";
import type { DeviceInfo } from "../types";

interface Props {
  activeDevices: DeviceInfo[];
  onSave: (localPath: string, usbSubfolder: string, usbUuid: string) => void;
  onCancel: () => void;
  onSuggestUsbSubfolder: (localPath: string) => Promise<string>;
  onPickLocalFolder: () => Promise<string | null>;
  onPickUsbFolder: (startPath: string) => Promise<string | null>;
  onInitUsbDevice: (path: string) => Promise<{ mount_path: string; uuid: string }>;
}

export default function NewJobDialog({ activeDevices, onSave, onCancel, onSuggestUsbSubfolder, onPickLocalFolder, onPickUsbFolder, onInitUsbDevice }: Props) {
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

  async function applySuggestion() {
    if (!localPath) return;
    const suggestion = await onSuggestUsbSubfolder(localPath);
    const device = activeDevices[0];
    if (device) {
      const fullPath = `${device.mount_path}/${suggestion}`;
      setUsbFullPath(fullPath);
      setDetectedUuid(device.uuid);
      setDetectedMountPath(device.mount_path);
      setUsbError("");
    }
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
            <button type="button" className="btn-icon-sm" onClick={pickFolder} title="Ordner durchsuchen">
              <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2.2"/>
                <line x1="13" y1="13" x2="18" y2="18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
              </svg>
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
              className="btn-icon-sm"
              onClick={applySuggestion}
              disabled={!localPath || activeDevices.length === 0}
              title="USB-Pfad aus lokalem Ordner ableiten"
            >
              <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path d="M13 2 L15 4 L7 13 L4 14 L5 11 Z"/>
                <line x1="11" y1="4" x2="16" y2="9" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="17" cy="3" r="1.5"/>
              </svg>
            </button>
            <button
              type="button"
              className="btn-icon-sm"
              onClick={pickUsbFolder}
              title="Ordner durchsuchen"
            >
              <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2.2"/>
                <line x1="13" y1="13" x2="18" y2="18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
              </svg>
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
