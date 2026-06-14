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
  appimage/   → pordata-sync_0.1.0_amd64.AppImage   (direkt ausführbar)
  deb/        → pordata-sync_0.1.0_amd64.deb         (installierbar)
```

---

## USB-Stick vorbereiten

Der Stick muss eine Datei `.pordata-uuid` im Root-Verzeichnis haben.
Diese Datei enthält eine eindeutige ID, anhand derer die App den Stick erkennt.

**Einmalige Einrichtung des Sticks:**

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

### Szenario 1: Erstes Ordner-Pair anlegen

1. App mit `npm run tauri dev` starten
2. USB-Stick (mit `.pordata-uuid`) einstecken
3. Die App erkennt den Stick automatisch — oben rechts erscheint ein
   grüner Pill mit dem Mount-Pfad (z. B. `/media/ama/MEIN_STICK`)
4. Auf **„+ Ordner-Pair hinzufügen"** klicken
5. Im Dialog:
   - **Lokaler Ordner:** „Durchsuchen…" → Ordner auswählen
   - **USB-Unterordner:** Namen eingeben, z. B. `backup`
   - **USB-Gerät:** sollte automatisch erkannt sein
   - „**Speichern**" klicken
6. Dashboard zeigt jetzt das neue Pair mit **„Verbunden"**-Badge

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
1. Ordner-Pair mit `~/Testordner` → `backup` anlegen (Szenario 1)
2. **„Sync starten"** klicken
3. Sync-Vorschau erscheint:
   - Blauer Donut-Anteil: 3 Dateien `→ USB`
   - Grauer Anteil: 0 (Aktuell)
4. **Center-Button „Sync starten"** klicken
5. Stick prüfen:
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
2. **„Sync starten"** klicken
3. Donut-Vorschau zeigt:
   - **Blau (→ USB):** 1 (a.txt ist lokal neuer)
   - **Grün (→ Lokal):** 1 (neu_auf_stick.txt)
   - **Grau (Aktuell):** b.txt, unterordner/c.txt
4. Sync ausführen
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
2. **„Sync starten"** → Vorschau zeigt **Roter Anteil: 1 (Konflikt)**
3. **Center-Button „Konflikte lösen"** klickt sich in den Conflict-Dialog
4. `b.txt` ist gelistet mit:
   - Lokal: Dateigröße + Datum
   - USB: Dateigröße + Datum
5. Entscheidung treffen: **„Lokal"** / **„USB"** / **„Skip"**
6. **„Konflikte bestätigen"** → zurück zum Dashboard

---

### Szenario 5: Stick abziehen

1. Stick abziehen während die App läuft
2. Der grüne Pill oben rechts verschwindet → **„Kein USB verbunden"**
3. Job-Karte zeigt kein „Verbunden"-Badge mehr
4. **„Sync starten"**-Button ist nicht mehr sichtbar

---

### Szenario 6: Mehrere Ordner-Pairs

1. Mehrere Ordner-Pairs auf demselben Stick anlegen (verschiedene `usb_subfolder`)
2. Beim Sync-Preview erscheint eine **Tab-Leiste** oben
3. Jeder Tab zeigt einen eigenen Donut-Chart für das jeweilige Pair

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
