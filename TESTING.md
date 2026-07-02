# Pordata Sync – Start & Testanleitung

## App starten

### Entwicklungsmodus (empfohlen)

Einmaliger Setup (nur beim ersten Mal):
```bash
npm install
```

App starten:
```bash
npm run tauri dev
```

Das startet automatisch den Vite-Dev-Server und kompiliert den Rust-Backend.
Beim ersten Aufruf dauert die Rust-Kompilierung ~1–2 Minuten, danach ist der
Build gecacht und startet in wenigen Sekunden.

### Produktions-Build (optional)

```bash
npm run tauri build
```

Das erzeugt ein installierbares Paket unter:
```
src-tauri/target/release/bundle/
  appimage/   → Pordata Sync_<version>_amd64.AppImage   (direkt ausführbar)
  deb/        → Pordata Sync_<version>_amd64.deb         (installierbar)
```

`npm run deploy` kopiert das AppImage zusätzlich ohne Versionsnummer nach
`deploy/pordata.AppImage`.

---

## USB-Stick vorbereiten

Die App erkennt Sticks anhand einer `.pordata-uuid`-Datei im Root-Verzeichnis. Diese Datei wird beim ersten Einrichten einer neuen Synchronisation **automatisch erstellt** — kein manueller Schritt nötig.

Wer die Datei dennoch manuell anlegen will:

```bash
# UUID generieren und auf den Stick schreiben
# (Pfad anpassen, z. B. /media/$USER/STICKNAME)
python3 -c "import uuid; print(uuid.uuid4())" > /media/$USER/MEIN_STICK/.pordata-uuid

# Prüfen
cat /media/$USER/MEIN_STICK/.pordata-uuid
# → z. B. a3f1c2d4-5e6f-7890-abcd-ef1234567890
```

> Der Name der Datei muss exakt `.pordata-uuid` lauten (mit Punkt am Anfang).
> Die Datei muss direkt im Root des Sticks liegen, nicht in einem Unterordner.

---

## End-to-End-Test

### Szenario 1: Erste Synchronisation anlegen

1. App mit `npm run tauri dev` starten
2. USB-Stick einstecken (muss kein `.pordata-uuid` haben – wird automatisch angelegt)
3. Die App erkennt den Stick — der USB-Pfad im Job-Eintrag wird farbig hervorgehoben
4. Auf **„＋ Neue Synchronisation"** klicken (am Ende der Job-Liste)
5. In der neuen Ansicht:
   - **Lokaler Ordner:** „Durchsuchen…" → Ordner auswählen
   - **USB-Ordner:** „Durchsuchen…" → Ordner auf dem Stick wählen (`.pordata-uuid` wird automatisch erstellt)
   - „**Speichern**" klicken
6. Dashboard zeigt jetzt die neue Synchronisation; USB-Pfad ist farbig hervorgehoben wenn verbunden

---

### Szenario 2: Erster Sync (neue Dateien)

**Vorbereitung:**
```bash
# Testdateien im lokalen Ordner anlegen
mkdir -p ~/Testordner
echo "Datei 1" > ~/Testordner/a.txt
echo "Datei 2" > ~/Testordner/b.txt
mkdir ~/Testordner/unterordner
echo "Tief" > ~/Testordner/unterordner/c.txt
```

**Ablauf:**
1. Synchronisation mit `~/Testordner` → `backup` anlegen (Szenario 1)
2. **Pfeil-Button** (⬅/➡ zwischen den Pfaden) klicken
3. Sync-Vorschau erscheint:
   - **„Lokal → USB"** (blau): 3 Dateien — Button ist aktiv
   - **„Lokal ← USB"** (grün): 0 Dateien — Button ist deaktiviert
4. **„Lokal → USB"** klicken
5. Vorschau schließt sich (nichts mehr zu tun), Dashboard erscheint
6. Stick prüfen:
   ```bash
   ls /media/$USER/MEIN_STICK/backup/
   # → a.txt  b.txt  unterordner/
   ```

---

### Szenario 3: Bidirektionaler Sync

**Vorbereitung:** Szenario 2 abgeschlossen.

```bash
# Lokale Änderung
echo "aktualisiert" > ~/Testordner/a.txt

# USB-Änderung
echo "vom Stick" > /media/$USER/MEIN_STICK/backup/neu_auf_stick.txt
```

**Ablauf:**
1. Stick abziehen und wieder einstecken (oder App neu starten)
2. **Pfeil-Button** auf dem Job klicken
3. Sync-Vorschau zeigt:
   - **„Lokal → USB"** (blau): 1 Datei (a.txt ist lokal neuer)
   - **„Lokal ← USB"** (grün): 1 Datei (neu_auf_stick.txt)
4. Beide Buttons einzeln ausführen oder nacheinander; Vorschau bleibt offen bis beide Richtungen erledigt
5. Ergebnis prüfen:
   ```bash
   cat /media/$USER/MEIN_STICK/backup/a.txt   # → "aktualisiert"
   cat ~/Testordner/neu_auf_stick.txt           # → "vom Stick"
   ```

---

### Szenario 4: Konflikt erzeugen und lösen

**Vorbereitung:** Szenario 2 abgeschlossen. Stick abgezogen.

```bash
# Beide Seiten unabhängig ändern
echo "lokal-version" > ~/Testordner/b.txt

# Mtime auf dem Stick manuell vorverstellen (simuliert Änderung auf Stick)
echo "stick-version" > /media/$USER/MEIN_STICK/backup/b.txt
```

**Ablauf:**
1. Stick einstecken
2. **Pfeil-Button** auf dem Job klicken → Vorschau zeigt orangenen **„1 Konflikt lösen"**-Button
3. **„1 Konflikt lösen"** klicken → Conflict-Dialog öffnet sich
4. `b.txt` ist gelistet mit Größe und Datum beider Seiten; die neuere Seite ist vorausgewählt
5. Entscheidung prüfen oder ändern: **„Lokal"** (blau) / **„USB"** (grün) / **„Skip"**
6. Optional: **„Alle: Neueste"** für automatische Vorauswahl
7. **„Synchronisieren"** → zurück zum Dashboard

---

### Szenario 5: Stick abziehen

1. Stick abziehen während die App läuft
2. USB-Pfad in der Job-Karte wird ausgegraut
3. Pfeil-Button (Sync starten) verschwindet — nur statisches ↔ Symbol bleibt

---

### Szenario 6: Mehrere Synchronisationen

1. Mehrere Synchronisationen auf demselben Stick anlegen (verschiedene `usb_subfolder`)
2. Beim Sync-Preview erscheint eine **Tab-Leiste** oben
3. Jeder Tab zeigt eigene Richtungs-Buttons und Dateizahlen für die jeweilige Synchronisation

---

## FAT32-Toleranz prüfen

FAT32-Dateisysteme speichern mtimes nur mit 2-Sekunden-Granularität.
Pordata ignoriert Zeitunterschiede ≤ 2 Sekunden (Dateien gelten als „Aktuell"):

```bash
# Datei mit exakt 2s Unterschied anlegen
touch -d "2025-01-01 12:00:00" ~/Testordner/fat32test.txt
touch -d "2025-01-01 12:00:02" /media/$USER/MEIN_STICK/backup/fat32test.txt

# Im Sync-Vorschau: fat32test.txt muss als "Aktuell" (grau) erscheinen
```

---

## Konfiguration zurücksetzen

Wenn etwas schiefläuft:

```bash
# Alle Jobs löschen
rm ~/.config/pordata/config.json

# Sync-Index eines Jobs löschen (JOB-ID aus config.json)
rm ~/.config/pordata/index_<JOB-ID>.json
```

---

## Bekannte Einschränkungen

| Einschränkung | Erklärung |
|---|---|
| Keine symlinks | `walkdir` folgt standardmäßig keinen Symlinks |
| Ein Stick pro Session | Mehrere gleichzeitig angesteckte Sticks mit UUID-Dateien werden alle erkannt, aber UI zeigt alle als separate Geräte |
| Keine Fortschrittsanzeige pro Datei | Nur Spinner während des Syncs — kein Datei-für-Datei-Fortschritt |
| `select_directory` benötigt GTK | Auf minimalen Systemen ohne Desktop kann der Folder-Picker fehlen |
