# MobileKlipper

Eine vollständige Bedien- und Überwachungs-App für Klipper-3D-Drucker, gebaut als
installierbare PWA. Sie spricht direkt mit **Moonraker** – genau wie Mainsail oder
Fluidd – und läuft auf Handy, Tablet und Desktop, ohne Cloud-Dienst dazwischen.

## Funktionen

**Status**
- Live-Dashboard über WebSocket-Subscriptions (keine Polling-Schleifen)
- Druckfortschritt mit Schichtzähler, Laufzeit und drei unabhängigen Restzeit-
  Schätzungen (Dateiposition, Slicer-Angabe, Filamentverbrauch), gerechnet wie
  in Mainsail – siehe [docs/DESIGN.md](docs/DESIGN.md)
- Slicer-Thumbnail des laufenden Drucks
- Heizungen, generische Heizer und Temperatursensoren als Kacheln
- Temperaturverlauf-Chart mit Zieltemperatur-Linien und Crosshair-Tooltip
- Filamentsensoren, Pause/Weiter/Stopp, Notaus

- Vorheizen mit einem Tipp: Material-Preset auf alle passenden Heizer, inklusive
  zweiter Bettzone (Neptune 4 Pro/Plus/Max) – einzeln abwählbar
- Objekte ausschließen: einzelne Teile eines Mehrteile-Drucks abbrechen, mit Bettkarte
- Benachrichtigungen bei Druckende, Fehler, Pause/Filament leer und Klipper-Stopp,
  solange die App im Hintergrund offen ist

**Steuerung**
- Achsen-Jogging mit konfigurierbaren Schrittweiten, Homing pro Achse
- Z-Offset und Babystepping (im Druck mit `MOVE=1`, sonst ohne); Speichern wählt
  automatisch `Z_OFFSET_APPLY_PROBE` oder `_ENDSTOP` und sendet während eines Drucks
  kein `SAVE_CONFIG`
- Extrudieren und Zurückziehen, blockiert solange Klipper zu kalt meldet; lange Wege
  werden an `max_extrude_only_distance` geteilt
- Filament-Assistent zum Laden und Entladen: heizt auf, wartet, fährt den
  Filamentweg in Stücken ab (Bowden oder Direct Drive); nutzt eigene
  `LOAD_/UNLOAD_FILAMENT`-Makros, wenn vorhanden; auch aus einem pausierten Druck
- Geschwindigkeit, Flussrate, Max-Velocity und Beschleunigung
- Pressure Advance und Firmware-Retraction live anpassen
- Lüfter, Temperatur-Lüfter und `output_pin`-Ausgänge (PWM als Slider, sonst Schalter)
- Alle G-Code-Makros mit Suche; Favoriten landen im Dashboard-Schnellzugriff
- Neustarts für Firmware, Klipper, Moonraker und Host

**Kalibrieren & Leveling**
- Bettschrauben ohne Sonde: `BED_SCREWS_ADJUST` Schraube für Schraube mit Papiertest
- Bettschrauben mit Sonde: `SCREWS_TILT_CALCULATE` mit Drehrichtung und -menge auf
  einer Bettskizze („¼ Umdrehung im Uhrzeigersinn")
- Bed Mesh als Heatmap mit Spannweite, Messwert per Antippen, Tabellenansicht und
  Profilverwaltung
- Z-Endschalter bzw. Sonden-Offset kalibrieren; das Papiertest-Panel
  (`TESTZ`/`ACCEPT`/`ABORT`) erscheint überall, sobald Klipper manuell probt
- PID-Tuning für jeden Heizer, Input Shaper mit Beschleunigungssensor
- `SAVE_CONFIG`-Knopf in der Kopfzeile, sobald etwas ungespeichert ist, mit Liste der
  betroffenen Abschnitte
- Angezeigt wird nur, was die `printer.cfg` tatsächlich hergibt

**Dateien**
- G-Code-Browser mit Ordnern, Thumbnails, Suche und Sortierung
- Detailansicht mit Slicer-Metadaten, Druckstart, Vorheizen auf die Temperaturen
  aus der Datei, Umbenennen/Verschieben und Löschen
- Ordner anlegen, umbenennen und löschen
- Upload mit Fortschrittsanzeige in das gerade geöffnete Verzeichnis, wahlweise mit
  direktem Druckstart
- Druckverlauf und Gesamtstatistik; Einträge erneut drucken oder löschen

**Konfiguration & System**
- `printer.cfg`, `moonraker.conf` und Co. direkt in der App bearbeiten, mit Sprung zu
  Abschnitten, Speichern und Speichern mit Neustart
- `klippy.log` und `moonraker.log` herunterladen
- Moonraker-Steckdosen (`[power]`, z. B. Tasmota/Shelly): Schalter auf dem Dashboard
  und ein Einschalt-Knopf, wenn Klipper fehlt, weil der Drucker aus ist
- Host-Zustand: CPU, Speicher, Temperatur, Laufzeit und Raspberry-Pi-Warnungen bei
  Unterspannung oder Drosselung
- Update-Manager mit Schutz vor Updates auf Hersteller-Forks

**Kamera & Konsole**
- Webcams werden aus Moonraker übernommen, inklusive Rotation und Spiegelung
- MJPEG direkt, Snapshot-Polling als Rückfallebene, Vollbildmodus
- Overlay mit Fortschritt und Temperaturen
- G-Code-Konsole mit Verlauf, Autovervollständigung für Makros und Klipper-Befehle
  sowie einem Filter für die periodischen Temperaturmeldungen

**Allgemein**
- Updates aus GitHub-Releases: „Update verfügbar"-Dialog, Installation über Moonraker,
  danach Neustart in die neue Version (siehe „Ausliefern und Updates")
- Mehrere Drucker, Umschalten in der Kopfzeile
- Druckerprofile für Ender 3 V2 und die Neptune-4-Reihe mit passenden Startwerten
  (Tempo, Presets, Filamentweg) und modellspezifischen Hinweisen
- Automatischer Reconnect mit Backoff und Watchdog für stumme Verbindungen
- Helles und dunkles Theme
- Bildschirm-Wachhalten während eines Drucks

## Voraussetzungen

Ein laufender Klipper mit Moonraker, erreichbar im selben Netzwerk. Getestet gegen
die Moonraker-API v1.5.

### Moonraker für Browser-Zugriff freigeben

Die App läuft im Browser und damit auf einer anderen Origin als Moonraker. Ohne
passende CORS-Einstellung blockiert der Browser jede Anfrage. In die
`moonraker.conf`:

```ini
[authorization]
cors_domains:
    http://localhost:5173
    http://mobileklipper.local
    http://*.local
trusted_clients:
    127.0.0.1
    192.168.1.0/24
    FE80::/10
    ::1/128
```

Danach Moonraker neu starten. Verlangt deine Instanz einen API-Key, trage ihn beim
Anlegen des Druckers ein – die App holt sich damit automatisch ein Oneshot-Token
für den WebSocket-Handshake, weil Browser bei WebSockets keine Header setzen können.

### HTTPS und Mixed Content

Wird die App über HTTPS ausgeliefert, der Drucker aber über HTTP angesprochen,
blockiert der Browser die Verbindung. Drei Wege funktionieren:

1. App ebenfalls über HTTP ausliefern (im Heimnetz der Normalfall)
2. Moonraker hinter einen HTTPS-Reverse-Proxy legen
3. Die App als native App über Capacitor bauen (siehe unten)

## Druckerspezifisches

Was ein Drucker kann, liest die App aus seiner laufenden Konfiguration – nicht aus
dem gewählten Modell. Das Profil setzt nur Startwerte und blendet Hinweise ein.

### Creality Ender 3 V2

Klipper läuft hier typischerweise auf einem Raspberry Pi (MainsailOS, KIAUH o. Ä.).
Das Original-Display des V2 wird von Klipper nicht unterstützt – die App ersetzt es.

- **Leveling ohne Sonde:** Mit `[bed_screws]` führt „Mehr → Kalibrieren" Schraube für
  Schraube durch den Papiertest. Positionen an deine Schrauben anpassen:

  ```ini
  [bed_screws]
  screw1: 30, 35
  screw1_name: vorne links
  screw2: 200, 35
  screw2_name: vorne rechts
  screw3: 200, 205
  screw3_name: hinten rechts
  screw4: 30, 205
  screw4_name: hinten links
  ```

- **Mit CR Touch/BLTouch:** zusätzlich `[screws_tilt_adjust]` (gleiche Schrauben,
  Positionen um den Sonden-Versatz korrigiert) und `[bed_mesh]` eintragen.
- **Z-Offset:** Ohne Sonde speichert die App mit `Z_OFFSET_APPLY_ENDSTOP` in die
  Endschalter-Position.
- **Filamentweg:** Das Profil rechnet mit 400 mm Bowden. In den Druckereinstellungen auf
  deine Schlauchlänge anpassen; die App teilt den Weg automatisch in Stücke, die
  `max_extrude_only_distance` einhalten.
- **Smart-Plug:** Hängt der Drucker an einer Tasmota- oder Shelly-Steckdose, in der
  `moonraker.conf` z. B.

  ```ini
  [power drucker]
  type: tasmota
  address: 192.168.1.50
  locked_while_printing: True
  restart_klipper_when_powered: True
  ```

  Dann gibt es auf dem Dashboard einen Schalter, und ist der Drucker aus, zeigt das
  Banner „Drucker einschalten".
- **Unterspannung:** Meldet der Pi Unterspannung, steht das unter „Mehr → System & Strom".
  Ein zu schwaches Pi-Netzteil ist eine häufige Ursache für Verbindungsabbrüche.

### Elegoo Neptune 4 / Pro / Plus / Max

Klipper und Moonraker laufen ab Werk auf dem Drucker. Als Adresse die IP des Druckers
mit Port 7125 eintragen.

- **CORS:** Die `moonraker.conf` über das mitgelieferte Web-Interface (Fluidd →
  Konfiguration) öffnen und unter `[authorization]` die Adresse ergänzen, von der die
  App läuft (siehe oben).
- **Geteiltes Heizbett (Pro/Plus/Max):** Die äußere Zone ist ein eigener
  `heater_generic` und erscheint als „Heizbett außen". Vorheizen belegt sie mit der
  Betttemperatur; im Vorheiz-Dialog lässt sie sich für kleine Teile abwählen. Der Name
  der Zone unterscheidet sich je nach Firmware – die App nimmt, was in der Konfiguration
  steht.
- **PID-Tuning der Außenzone:** Ältere Klipper-Versionen speichern die Werte eines
  `heater_generic` per `SAVE_CONFIG` unter falschem Abschnittsnamen
  ([Klipper-Forum](https://klipper.discourse.group/t/issue-with-pid-calibrate-heater-generic-save-config/14349)).
  Nach dem Tuning die `printer.cfg` prüfen – geht direkt in der App.
- **Updates:** Elegoos Klipper ist ein angepasster Fork. Die App sperrt Updates für
  Komponenten, die Moonraker als ungültig oder lokal verändert meldet, und warnt vor
  einem Klipper-Update auf dem Neptune 4.
- **Objekte ausschließen:** Braucht `[exclude_object]` in der `printer.cfg` und im
  Slicer „Objekte beschriften" (bzw. in Moonraker `enable_object_processing: True`).

## Loslegen

```bash
npm install
npm run dev
```

Die App fragt beim ersten Start nach der Adresse des Druckers – dieselbe, die du
auch für Mainsail oder Fluidd im Browser eingibst, z. B. `192.168.1.42:7125`.

### Ohne Drucker entwickeln

Im Repo liegt ein Mock-Moonraker, der genug der echten API spricht, um die
komplette App zu bedienen: er simuliert Aufheizen, einen laufenden Druck mit
Schichtfortschritt, G-Code-Antworten, Leveling, manuelles Proben, PID-Tuning,
`SAVE_CONFIG`, Steckdosen, Konfigurationsdateien sowie die Datei-, Verlaufs- und
Kamera-Endpunkte. Wie echtes Klipper lehnt er zu lange Extrusionsbewegungen und
Bewegungen ohne Homing ab.

```bash
node tools/mock-moonraker.mjs                       # Terminal 1
npm run dev                                         # Terminal 2
```

Dann `localhost:7125` als Druckeradresse eintragen. Mit `--profile` simuliert er
einen bestimmten Drucker, mit `--port` laufen mehrere nebeneinander:

| Profil | Simuliert |
| --- | --- |
| `voron` (Standard) | CoreXY mit Kammerheizung, Sonde, QGL und ADXL, druckt |
| `ender3v2` | Bowden, Z-Endschalter, `[bed_screws]`, Smart-Plug, Pi mit Unterspannung, im Leerlauf |
| `neptune4` | Sonde als Z-Endschalter, 11×11-Mesh, Außenzone des Betts, `[screws_tilt_adjust]`, Objekte, druckt |

```bash
node tools/mock-moonraker.mjs --profile ender3v2 --port 7126
node tools/mock-moonraker.mjs --profile neptune4 --port 7127
```

### Skripte

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Typecheck und Produktions-Build nach `dist/` |
| `npm run preview` | Gebautes Ergebnis lokal ausliefern |
| `npm test` | Unit-Tests |
| `npm run typecheck` | Nur Typprüfung |

## Ausliefern und Updates

Die App aktualisiert sich wie GX Tube und ABI TV über **GitHub-Releases**. Weil sie
eine Web-App ist, spielt **Moonraker** das Update ein, genauso wie bei Mainsail und
Fluidd.

### Releases

Jeder Push auf den Standard-Branch baut über `.github/workflows/release.yml`
automatisch ein Release `v0.1.<Build-Nummer>` mit `mobileklipper.zip`. Die
Release-Notiz übernimmt die Commit-Zeile als „Neu: …". Andere Branches und Pull
Requests werden nur getestet und gebaut. Von Hand geht es unter Actions →
„Build & Release" → „Run workflow".

### Einmalig: auf dem Drucker installieren

Neben Mainsail/Fluidd auf dem Drucker-Host (Benutzer anpassen, z. B. `pi` auf dem
Raspberry Pi):

```bash
mkdir -p ~/mobileklipper && cd ~/mobileklipper
wget https://github.com/abilas-sivarajah/MobileKlipper/releases/latest/download/mobileklipper.zip
unzip -o mobileklipper.zip && rm mobileklipper.zip
```

Ausliefern über das vorhandene nginx, z. B. auf Port 8090, in
`/etc/nginx/sites-available/mobileklipper`:

```nginx
server {
    listen 8090;
    root /home/pi/mobileklipper;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
    # Den Service Worker nie zwischenspeichern, sonst kommen Updates verspätet an
    location = /sw.js {
        add_header Cache-Control "no-cache";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/mobileklipper /etc/nginx/sites-enabled/
sudo systemctl reload nginx
```

Dann in der `moonraker.conf` die neue Adresse unter `cors_domains` ergänzen (z. B.
`http://192.168.1.42:8090`) und das Update eintragen:

```ini
[update_manager mobileklipper]
type: web
channel: stable
repo: abilas-sivarajah/MobileKlipper
path: ~/mobileklipper
```

Moonraker neu starten. MobileKlipper taucht danach auch in der Update-Liste von
Mainsail/Fluidd und unter „Mehr → System & Strom" auf.

### So läuft ein Update

- Beim Öffnen und beim Zurückkehren in die App fragt sie GitHub nach dem neuesten
  Release, höchstens alle 15 Minuten (abschaltbar unter Einstellungen → „App & Updates").
- Ist es neuer, erscheint „Update verfügbar" mit der Neuerung. „Später" blendet diese
  Version für 12 Stunden aus.
- „Jetzt aktualisieren" lässt Moonraker die Version von GitHub holen und installieren.
  Danach lädt die App neu und läuft in der neuen Version. Während eines Drucks sperrt
  Moonraker Updates, die App sagt das dann.
- Wurde die App anders aktualisiert, etwa über Mainsail oder per Hand kopiert, meldet
  ein Banner „Neue App-Version geladen" mit „Neu laden".
- Ohne `[update_manager mobileklipper]` zeigt der Dialog den passenden Eintrag und
  einen Link zum Release.

Als PWA installierst du die App über „Zum Startbildschirm hinzufügen". Der Service
Worker cacht nur die App-Shell; Druckerdaten laufen immer live über den WebSocket.

Lokal bauen geht weiterhin mit `npm run build`, das Ergebnis liegt in `dist/`
(inklusive `release_info.json` für Moonraker). Die Versionsnummer kommt aus
`MOBILEKLIPPER_VERSION`, sonst aus der `package.json`.

## Native Apps mit Capacitor

Der Code ist so geschrieben, dass er unverändert in eine native Hülle passt:

```bash
npm install -D @capacitor/cli
npm install @capacitor/core @capacitor/android @capacitor/ios
npx cap init MobileKlipper app.mobileklipper --web-dir=dist
npm run build && npx cap add android && npx cap sync
```

Das löst zugleich das Mixed-Content-Problem, weil die native WebView nicht an die
HTTPS-Regeln einer Browser-Origin gebunden ist.

**Hinweis zu Push-Benachrichtigungen:** Die App meldet Druckende, Fehler und Pausen,
solange sie im Hintergrund noch läuft (Einstellungen → Benachrichtigungen). Wird sie
vom Betriebssystem beendet – auf iOS schnell, auf Android irgendwann –, kommt nichts
mehr an. Zuverlässige Pushes brauchen wie bei Mobileraker einen Begleitdienst auf dem
Drucker-Host, der den Status überwacht und über FCM/APNs verschickt. Das ist ein
eigenes Stück Software und in dieser App nicht enthalten.

## Aufbau

```
src/
  moonraker/     JSON-RPC-Transport, API-Client, Klipper-Objekttypen
  store/         Zustand-Stores: Druckerkonfiguration, Live-Status, UI
  lib/           Reine Logik: Selektoren, G-Code-Bau, Formatierung, Palette
  components/    Gemeinsame UI-Bausteine und Layout
  features/      Fachliche Bausteine je Bereich
  pages/         Hauptbildschirme plus Kalibrieren, Konfiguration, System, Verlauf,
                 Einstellungen
tools/           Mock-Moonraker für die Entwicklung
test/            Unit- und Komponententests
```

Die Trennung ist bewusst: alles unter `lib/` und `moonraker/` ist frei von React
und damit ohne Drucker testbar – dort liegen auch die Teile, die am ehesten
schiefgehen (Reconnect-Verhalten, Restzeit-Schätzung, G-Code-Erzeugung,
Fähigkeitserkennung aus der Konfiguration, Filamentwechsel-Planung, Mesh-Farben).

Zu den Chart- und Farbentscheidungen siehe [docs/DESIGN.md](docs/DESIGN.md).

## Sicherheit

Die App spricht direkt mit Moonraker, ohne Zwischenserver. API-Keys liegen im
`localStorage` des Browsers. Moonraker ins offene Internet zu stellen ist keine
gute Idee – für Zugriff von unterwegs eignen sich VPN (WireGuard, Tailscale) oder
ein Reverse-Proxy mit Authentifizierung.

## Lizenz

MIT
