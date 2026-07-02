import { useAppState } from "./hooks/useAppState";
import Dashboard from "./components/Dashboard";
import NewJobDialog from "./components/NewJobDialog";
import SyncPreview from "./components/SyncPreview";
import ConflictDialog from "./components/ConflictDialog";
import SettingsDialog from "./components/SettingsDialog";
import "./App.css";

export default function App() {
  const {
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
    toggleTheme,
    handleCreateJob,
    handleDeleteJob,
    handleStartPreScan,
    handleConfirmCreatePaths,
    handleOpenManual,
    handleSetupSticks,
    stickSetupResults, setStickSetupResults,
    appVersion,
    globalIgnores,
    settingsOpen, setSettingsOpen,
    handleSaveGlobalIgnores,
    handleSync,
    handleCancelSync,
    handleResolveConflicts,
    handleFreshScan,
    suggestUsbSubfolder,
    pickLocalFolder,
    pickUsbFolder,
    initUsbDevice,
  } = useAppState();

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

      {skippedFiles.length > 0 && (
        <div className="warning-banner">
          <div className="warning-banner-content">
            <span className="warning-banner-title">
              {skippedFiles.length} Datei{skippedFiles.length !== 1 ? "en" : ""} übersprungen
            </span>
            <ul className="warning-banner-list">
              {skippedFiles.map((f) => <li key={f}>{f}</li>)}
            </ul>
          </div>
          <button onClick={() => setSkippedFiles([])}>✕</button>
        </div>
      )}

      {stickSetupResults && (
        <div className="modal-overlay">
          <div className="dialog-card">
            <h2>USB-Sticks eingerichtet</h2>
            {stickSetupResults.map((r) => (
              <div key={r.mountPath} className="setup-stick-result">
                <div className="setup-stick-mount">{r.mountPath}</div>
                <ul className="setup-stick-list">
                  <li>UUID: <code>{r.uuid}</code></li>
                  <li>pordata/.pordata-uuid, pordata/Windows/ und pordata/Linux/ angelegt</li>
                  {r.appimageCopied
                    ? <li className="setup-ok">pordata/Linux/{r.appimageName} kopiert</li>
                    : <li className="setup-skip">AppImage nicht gefunden – bitte manuell in pordata/Linux/ ablegen</li>
                  }
                </ul>
              </div>
            ))}
            <div className="dialog-actions">
              <button className="btn-primary" onClick={() => setStickSetupResults(null)}>OK</button>
            </div>
          </div>
        </div>
      )}

      {view === "dashboard" && (
        <Dashboard
          jobs={jobs}
          activeDevices={activeDevices}
          onNewJob={() => setView("new-job")}
          onStartSync={handleStartPreScan}
          onDeleteJob={handleDeleteJob}
          onSetupSticks={handleSetupSticks}
          onOpenSettings={() => setSettingsOpen(true)}
          appVersion={appVersion}
          theme={theme}
          onToggleTheme={toggleTheme}
          validLocalPaths={validLocalPaths}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          ignores={globalIgnores}
          onSave={handleSaveGlobalIgnores}
          onCancel={() => setSettingsOpen(false)}
        />
      )}

      {view === "new-job" && (
        <NewJobDialog
          activeDevices={activeDevices}
          onSave={handleCreateJob}
          onCancel={() => setView("dashboard")}
          onSuggestUsbSubfolder={suggestUsbSubfolder}
          onPickLocalFolder={pickLocalFolder}
          onPickUsbFolder={pickUsbFolder}
          onInitUsbDevice={initUsbDevice}
        />
      )}

      {view === "sync-preview" && scanResults.length > 0 && (
        <SyncPreview
          results={scanResults}
          activeIndex={activeScanIndex}
          onTabChange={setActiveScanIndex}
          onSync={handleSync}
          onManual={handleOpenManual}
          onBack={() => setView("dashboard")}
          syncProgress={syncProgress}
          onCancelSync={handleCancelSync}
          onFreshScan={handleFreshScan}
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
