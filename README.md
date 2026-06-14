# Pordata Sync

Eine intuitive, plattformübergreifende Desktop-App zur **bidirektionalen USB-Synchronisierung** von Ordner-Paaren — gebaut mit Tauri, React und Rust.

## Funktionsweise

1. USB-Stick einstecken → App erkennt ihn automatisch anhand einer `.pordata-uuid`-Datei
2. Ausstehende Änderungen werden im Hintergrund voranalysiert
3. Ein **visueller Donut-Chart** zeigt die Änderungsverteilung (Neu, Gelöscht, Konflikte)
4. Mit einem Klick starten — oder Konflikte interaktiv lösen

## Features

- 🔄 **Bidirektionale Synchronisierung** mit Zustandsindex (kein blindes Überschreiben)
- 🔌 **Automatische USB-Erkennung** via Hintergrund-Loop
- 📁 **Mehrere Ordner-Pairs** pro USB-Stick konfigurierbar
- ⚠️ **Konfliktlösung** mit Dateidetails (Größe, Änderungsdatum)
- 🕐 **FAT32/exFAT-kompatibel** (2-Sekunden-Toleranz bei mtimes)

## Tech Stack

| Schicht   | Technologie                              |
|-----------|------------------------------------------|
| Desktop   | [Tauri 2](https://tauri.app)             |
| Backend   | Rust (`sysinfo`, `walkdir`, `filetime`, `rfd`) |
| Frontend  | React 19 + TypeScript                    |
| Build     | Vite 7                                   |
| Styling   | Vanilla CSS (Dark Mode, Glassmorphism)   |

## Projektstruktur

```
pordata/
├── src/                  # React-Frontend
│   ├── App.tsx           # Haupt-Komponente & State-Management
│   └── App.css           # Design-System
├── src-tauri/            # Rust-Backend
│   ├── src/
│   │   ├── main.rs       # Einstiegspunkt
│   │   ├── lib.rs        # Tauri-Commands
│   │   ├── config.rs     # Konfigurationsverwaltung
│   │   ├── sync_engine.rs# Synchronisierungslogik
│   │   └── device_monitor.rs # USB-Erkennung
│   └── Cargo.toml
├── implementation_plan.md
└── tasks.md
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
cd src-tauri && cargo test # Rust-Unit-Tests (30/30)
```

## Empfohlenes IDE-Setup

[VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
