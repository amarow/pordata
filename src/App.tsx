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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadJobs();
    loadActiveDevices();
  }, []);

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

  async function handleStartPreScan(jobId?: string) {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }

  async function handleSync(jobId: string) {
    setLoading(true);
    setError(null);
    try {
      const summary = await invoke<SyncSummary>("start_sync", { jobId });
      if (summary.conflicts > 0) {
        const conflicts = summary.operations
          .filter((op) => "Conflict" in op)
          .map((op) => (op as { Conflict: ConflictInfo }).Conflict);
        setConflictJobId(jobId);
        setConflictOps(conflicts);
        setView("conflict");
      } else {
        setView("dashboard");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleResolveConflicts(
    jobId: string,
    resolutions: ConflictResolutionInput[]
  ) {
    setLoading(true);
    setError(null);
    try {
      await invoke("resolve_conflicts", { jobId, resolutions });
      setView("dashboard");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {loading && (
        <div className="loading-overlay">
          <div className="spinner" />
        </div>
      )}

      {view === "dashboard" && (
        <Dashboard
          jobs={jobs}
          activeDevices={activeDevices}
          onNewJob={() => setView("new-job")}
          onStartSync={handleStartPreScan}
          onDeleteJob={handleDeleteJob}
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
