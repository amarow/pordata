# Pordata Sync

Eine intuitive, plattformübergreifende Desktop-App zur **bidirektionalen USB-Synchronisierung** von Ordner-Paaren — gebaut mit Tauri, React und Rust.

## Funktionsweise

1. USB-Stick einstecken → App erkennt ihn automatisch (oder richtet ihn beim ersten Mal ein)
2. Ausstehende Änderungen werden per Klick auf „Sync starten" voranalysiert
3. Zwei Richtungs-Buttons zeigen, wie viele Dateien je Richtung zu kopieren sind
4. Einzelne Richtungen separat ausführen oder Konflikte interaktiv lösen

## Features

- **Bidirektionale Synchronisierung** mit Zustandsindex (kein blindes Überschreiben)
- **Automatische USB-Erkennung** via Hintergrund-Loop (alle 2 s)
- **Mehrere Synchronisationen** pro USB-Stick konfigurierbar
- **Direktionaler Sync** — „Lokal → USB" und „Lokal ← USB" unabhängig voneinander
- **Konfliktlösung** mit Dateidetails (Größe, Datum), neueste Datei vorausgewählt
- **FAT32/exFAT-kompatibel** (2-Sekunden-Toleranz bei mtimes)
- **Dark / Light Mode** mit automatischer Systemerkennung
- **Pfad-Überwachung** — ausgegrauter Pfad wenn Ordner nicht mehr erreichbar ist

## Tech Stack

| Schicht  | Technologie                                    |
| -------- | ---------------------------------------------- |
| Desktop  | [Tauri 2](https://tauri.app)                   |
| Backend  | Rust (`sysinfo`, `walkdir`, `filetime`, `rfd`) |
| Frontend | React 19 + TypeScript                          |
| Build    | Vite 7                                         |
| Styling  | Vanilla CSS (Dark Mode, Glassmorphism)         |

## Projektstruktur

```
pordata/
├── src/                  # React-Frontend
│   ├── hooks/
│   │   └── useAppState.ts # Gesamter App-State + invoke()-Aufrufe
│   ├── components/       # UI-Komponenten
│   ├── App.tsx           # JSX-Routing (kein eigener State)
│   ├── types.ts          # Rust-Typen gespiegelt
│   └── utils.ts          # Hilfsfunktionen
├── src-tauri/            # Rust-Backend
│   ├── src/
│   │   ├── lib.rs        # Tauri-Commands & AppState
│   │   ├── config.rs     # Konfigurationsverwaltung
│   │   ├── sync_engine.rs# Synchronisierungslogik
│   │   └── device_monitor.rs # USB-Erkennung
│   └── Cargo.toml
├── scripts/
│   └── package-linux.sh  # AppImage + Anleitung → deploy/
└── deploy/               # (gitignore) Release-Artefakte
```

## App starten

```bash
npm install          # einmalig
npm run tauri dev    # startet App im Entwicklungsmodus
```

Beim ersten Start kompiliert Rust ~1–2 Minuten; danach gecacht.
Für End-to-End-Tests und USB-Stick-Einrichtung → [TESTING.md](./TESTING.md)

## Build & Tests

```bash
npm run tauri build       # Produktions-Build (AppImage / .deb)
npm run deploy            # Build + AppImage & Bedienungsanleitung → deploy/
cd src-tauri && cargo test # Rust-Unit-Tests (31/31)
```

## Empfohlenes IDE-Setup

[VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
