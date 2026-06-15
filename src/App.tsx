import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  SyncJob,
  DeviceInfo,
  PreScanResult,
  SyncSummary,
  ConflictInfo,
  ConflictResolutionInput,
  View,
} from "./types";
import Dashboard from "./components/Dashboard";
import NewJobDialog from "./components/NewJobDialog";
import SyncPreview from "./components/SyncPreview";
import ConflictDialog from "./components/ConflictDialog";
import "./App.css";

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [activeDevices, setActiveDevices] = useState<DeviceInfo[]>([]);
  const [scanResults, setScanResults] = useState<PreScanResult[]>([]);
  const [activeScanIndex, setActiveScanIndex] = useState(0);
  const [conflictJobId, setConflictJobId] = useState<string | null>(null);
  const [conflictOps, setConflictOps] = useState<ConflictInfo[]>([]);
  const [syncProgress, setSyncProgress] = useState<{
    done: number;
    total: number;
    copiesDone: number;
    currentFile: string;
    direction: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validLocalPaths, setValidLocalPaths] = useState<Set<string>>(new Set());
  const [missingPathConfirm, setMissingPathConfirm] = useState<{
    jobId: string;
    paths: { label: string; path: string }[];
  } | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("pordata-theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("pordata-theme", theme);
  }, [theme]);

  useEffect(() => {
    loadJobs();
    loadActiveDevices();
  }, []);

  useEffect(() => {
    refreshLocalPathValidity(jobs);
    const id = setInterval(() => refreshLocalPathValidity(jobs), 3000);
    return () => clearInterval(id);
  }, [jobs]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (view === "new-job") setView("dashboard");
      if (view === "sync-preview") setView("dashboard");
      if (view === "conflict") setView("dashboard");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view]);

  useEffect(() => {
    const unlisten = listen<{ done: number; total: number; copiesDone: number; currentFile: string; direction: string }>(
      "sync-progress",
      (e) => setSyncProgress(e.payload)
    );
    return () => { unlisten.then((f) => f()); };
  }, []);

  useEffect(() => {
    const unlistenAttached = listen<{ uuid: string; mount_path: string }>(
      "device-attached",
      (e) => {
        setActiveDevices((prev) => [
          ...prev.filter((d) => d.uuid !== e.payload.uuid),
          e.payload,
        ]);
      }
    );
    const unlistenDetached = listen<{ uuid: string }>("device-detached", (e) => {
      setActiveDevices((prev) => prev.filter((d) => d.uuid !== e.payload.uuid));
    });
    return () => {
      unlistenAttached.then((f) => f());
      unlistenDetached.then((f) => f());
    };
  }, []);

  async function loadJobs() {
    try {
      setJobs(await invoke<SyncJob[]>("get_sync_jobs"));
    } catch (e) {
      setError(String(e));
    }
  }

  async function refreshLocalPathValidity(currentJobs: SyncJob[]) {
    if (currentJobs.length === 0) return;
    const checks = await Promise.all(
      currentJobs.map((j) =>
        invoke<boolean>("check_path_exists", { path: j.local_path }).then(
          (ok) => (ok ? j.local_path : null)
        )
      )
    );
    setValidLocalPaths(new Set(checks.filter(Boolean) as string[]));
  }

  async function loadActiveDevices() {
    try {
      setActiveDevices(await invoke<DeviceInfo[]>("get_active_devices"));
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleCreateJob(
    localPath: string,
    usbSubfolder: string,
    usbUuid: string
  ) {
    try {
      await invoke("create_sync_job", { localPath, usbSubfolder, usbUuid });
      await loadJobs();
      setView("dashboard");
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDeleteJob(jobId: string) {
    try {
      await invoke("delete_sync_job", { jobId });
      await loadJobs();
    } catch (e) {
      setError(String(e));
    }
  }

  async function doPreScan(jobId?: string) {
    setError(null);
    try {
      const results = await invoke<PreScanResult[]>("run_pre_scan", {
        jobId: jobId ?? null,
      });
      if (results.length === 0) {
        setError("Kein USB-Gerät mit konfigurierten Jobs verbunden.");
        return;
      }
      setScanResults(results);
      setActiveScanIndex(0);
      setView("sync-preview");
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleStartPreScan(jobId?: string) {
    if (jobId) {
      const job = jobs.find((j) => j.id === jobId);
      if (job) {
        const missing: { label: string; path: string }[] = [];
        const localOk = await invoke<boolean>("check_path_exists", { path: job.local_path });
        if (!localOk) missing.push({ label: "Lokal", path: job.local_path });
        const device = activeDevices.find((d) => d.uuid === job.usb_uuid);
        if (device) {
          const usbPath = `${device.mount_path}/${job.usb_subfolder}`;
          const usbOk = await invoke<boolean>("check_path_exists", { path: usbPath });
          if (!usbOk) missing.push({ label: "USB", path: usbPath });
        }
        if (missing.length > 0) {
          setMissingPathConfirm({ jobId, paths: missing });
          return;
        }
      }
    }
    await doPreScan(jobId);
  }

  async function handleConfirmCreatePaths() {
    if (!missingPathConfirm) return;
    const { jobId, paths } = missingPathConfirm;
    setMissingPathConfirm(null);
    try {
      for (const { path } of paths) {
        await invoke("create_directory", { path });
      }
      await doPreScan(jobId);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSync(jobId: string, direction: "to_usb" | "to_local" | "both" = "both") {
    setSyncProgress({ done: 0, total: 0, copiesDone: 0, currentFile: "", direction });
    setError(null);
    try {
      const summary = await invoke<SyncSummary>("start_sync", { jobId, direction });

      if (direction === "both" && summary.conflicts > 0) {
        const conflicts = summary.operations
          .filter((op) => "Conflict" in op)
          .map((op) => (op as { Conflict: ConflictInfo }).Conflict);
        setConflictJobId(jobId);
        setConflictOps(conflicts);
        setView("conflict");
        return;
      }

      // Re-scan to check what's still left.
      const refreshed = await invoke<PreScanResult[]>("run_pre_scan", { jobId });
      if (refreshed.length === 0) {
        setView("dashboard");
        return;
      }
      const s = refreshed[0].summary;
      const allDone = s.copy_to_usb === 0 && s.copy_to_local === 0 && s.conflicts === 0;
      if (allDone) {
        setView("dashboard");
      } else {
        setScanResults((prev) => prev.map((r) => (r.job_id === jobId ? refreshed[0] : r)));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSyncProgress(null);
    }
  }

  function handleCancelSync() {
    invoke("cancel_sync").catch(() => {});
  }

  async function handleResolveConflicts(
    jobId: string,
    resolutions: ConflictResolutionInput[]
  ) {
    setError(null);
    try {
      await invoke("resolve_conflicts", { jobId, resolutions });
      setView("dashboard");
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="app">
      {missingPathConfirm && (
        <div className="modal-overlay">
          <div className="dialog-card missing-path-dialog">
            <h2>Ordner nicht gefunden</h2>
            <p className="missing-path-intro">
              {missingPathConfirm.paths.length === 1
                ? "Folgender Ordner existiert nicht:"
                : "Folgende Ordner existieren nicht:"}
            </p>
            <ul className="missing-path-list">
              {missingPathConfirm.paths.map(({ label, path }) => (
                <li key={path}>
                  <span className={`missing-path-label ${label === "USB" ? "label-usb" : "label-local"}`}>
                    {label}
                  </span>
                  <span className="missing-path-value">{path}</span>
                </li>
              ))}
            </ul>
            <p className="missing-path-question">Sollen die Ordner jetzt angelegt werden?</p>
            <div className="dialog-actions">
              <button className="btn-secondary" onClick={() => setMissingPathConfirm(null)}>
                Abbrechen
              </button>
              <button className="btn-primary" onClick={handleConfirmCreatePaths}>
                Anlegen & Synchronisieren
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}


      {view === "dashboard" && (
        <Dashboard
          jobs={jobs}
          activeDevices={activeDevices}
          onNewJob={() => setView("new-job")}
          onStartSync={handleStartPreScan}
          onDeleteJob={handleDeleteJob}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          validLocalPaths={validLocalPaths}
        />
      )}

      {view === "new-job" && (
        <NewJobDialog
          activeDevices={activeDevices}
          onSave={handleCreateJob}
          onCancel={() => setView("dashboard")}
        />
      )}

      {view === "sync-preview" && scanResults.length > 0 && (
        <SyncPreview
          results={scanResults}
          activeIndex={activeScanIndex}
          onTabChange={setActiveScanIndex}
          onSync={handleSync}
          onBack={() => setView("dashboard")}
          syncProgress={syncProgress}
          onCancelSync={handleCancelSync}
        />
      )}

      {view === "conflict" && conflictJobId && (
        <ConflictDialog
          jobId={conflictJobId}
          conflicts={conflictOps}
          onResolve={handleResolveConflicts}
          onCancel={() => setView("dashboard")}
        />
      )}
    </div>
  );
}
