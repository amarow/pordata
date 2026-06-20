import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  SyncJob,
  DeviceInfo,
  PreScanResult,
  ConflictInfo,
  ConflictResolutionInput,
  SetupStickResult,
  View,
} from "../types";
import { usbPath } from "../utils";

export function useAppState() {
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

  const [freshScanJobIds, setFreshScanJobIds] = useState<Set<string>>(new Set());
  const [stickSetupResults, setStickSetupResults] = useState<SetupStickResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skippedFiles, setSkippedFiles] = useState<string[]>([]);
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
    const unlisten = listen<string[]>("sync-skipped", (e) => setSkippedFiles(e.payload));
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

  async function handleCreateJob(localPath: string, usbSubfolder: string, usbUuid: string) {
    try {
      await invoke("create_sync_job", { localPath, usbSubfolder, usbUuid });
      const device = activeDevices.find((d) => d.uuid === usbUuid);
      await Promise.all([
        invoke("create_directory", { path: localPath }),
        device
          ? invoke("create_directory", { path: usbPath(device.mount_path, usbSubfolder) })
          : Promise.resolve(),
      ]);
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
    setFreshScanJobIds(new Set());
    setError(null);
    try {
      const results = await invoke<PreScanResult[]>("run_pre_scan", { jobId: jobId ?? null });
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
          const path = usbPath(device.mount_path, job.usb_subfolder);
          const usbOk = await invoke<boolean>("check_path_exists", { path });
          if (!usbOk) missing.push({ label: "USB", path });
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

  function handleOpenManual(jobId: string) {
    const result = scanResults.find((r) => r.job_id === jobId);
    if (!result) return;
    const items: ConflictInfo[] = result.summary.operations.flatMap((op) => {
      if ("Conflict" in op)      return [op.Conflict];
      if ("CopyToUsb" in op)     return [{ rel_path: op.CopyToUsb.rel_path,     local_mtime: 1, local_size: 0, usb_mtime: 0, usb_size: 0 }];
      if ("CopyToLocal" in op)   return [{ rel_path: op.CopyToLocal.rel_path,   local_mtime: 0, local_size: 0, usb_mtime: 1, usb_size: 0 }];
      if ("DeleteOnLocal" in op) return [{ rel_path: op.DeleteOnLocal.rel_path, local_mtime: 1, local_size: 0, usb_mtime: 0, usb_size: 0 }];
      if ("DeleteOnUsb" in op)   return [{ rel_path: op.DeleteOnUsb.rel_path,   local_mtime: 0, local_size: 0, usb_mtime: 1, usb_size: 0 }];
      return [];
    });
    setConflictJobId(jobId);
    setConflictOps(items);
    setView("conflict");
  }

  async function handleSync(jobId: string, direction: "to_usb" | "to_local" | "both" = "both") {
    const fresh = freshScanJobIds.has(jobId);
    setFreshScanJobIds((prev) => { const s = new Set(prev); s.delete(jobId); return s; });
    setSyncProgress({ done: 0, total: 0, copiesDone: 0, currentFile: "", direction });
    setError(null);
    setSkippedFiles([]);
    try {
      await invoke("start_sync", { jobId, direction, fresh });
      const refreshed = await invoke<PreScanResult[]>("run_pre_scan", { jobId });
      if (refreshed.length === 0) {
        setView("dashboard");
        return;
      }
      const s = refreshed[0].summary;
      if (s.copy_to_usb === 0 && s.copy_to_local === 0 && s.conflicts === 0) {
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

  async function handleResolveConflicts(jobId: string, resolutions: ConflictResolutionInput[]) {
    setError(null);
    try {
      await invoke("resolve_conflicts", { jobId, resolutions });
      setView("dashboard");
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleFreshScan(jobId: string) {
    setError(null);
    try {
      const refreshed = await invoke<PreScanResult[]>("run_pre_scan_fresh", { jobId });
      if (refreshed.length > 0) {
        setScanResults((prev) => prev.map((r) => (r.job_id === jobId ? refreshed[0] : r)));
        setFreshScanJobIds((prev) => new Set(prev).add(jobId));
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSetupSticks() {
    setError(null);
    const results: SetupStickResult[] = [];
    for (const device of activeDevices) {
      try {
        const r = await invoke<{ uuid: string; appimageCopied: boolean; appimageName: string | null }>(
          "setup_usb_stick",
          { mountPath: device.mount_path }
        );
        results.push({ mountPath: device.mount_path, ...r });
      } catch (e) {
        setError(String(e));
        return;
      }
    }
    setStickSetupResults(results);
  }

  async function suggestUsbSubfolder(localPath: string): Promise<string> {
    return invoke<string>("suggest_usb_subfolder", { localPath });
  }

  async function pickLocalFolder(): Promise<string | null> {
    return invoke<string | null>("select_directory");
  }

  async function pickUsbFolder(startPath: string): Promise<string | null> {
    return invoke<string | null>("select_directory_from", { startPath });
  }

  async function initUsbDevice(path: string): Promise<{ mount_path: string; uuid: string }> {
    return invoke<{ mount_path: string; uuid: string }>("init_usb_device", { path });
  }

  return {
    view, setView,
    jobs,
    activeDevices,
    scanResults,
    activeScanIndex, setActiveScanIndex,
    conflictJobId,
    conflictOps,
    syncProgress,
    error, setError,
    skippedFiles, setSkippedFiles,
    validLocalPaths,
    missingPathConfirm, setMissingPathConfirm,
    theme,
    toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    handleCreateJob,
    handleDeleteJob,
    handleStartPreScan,
    handleConfirmCreatePaths,
    handleOpenManual,
    handleSetupSticks,
    stickSetupResults, setStickSetupResults,
    handleSync,
    handleCancelSync,
    handleResolveConflicts,
    handleFreshScan,
    suggestUsbSubfolder,
    pickLocalFolder,
    pickUsbFolder,
    initUsbDevice,
  };
}
