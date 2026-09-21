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

**Steuerung**
- Achsen-Jogging mit konfigurierbaren Schrittweiten, Homing pro Achse
- Z-Offset und Babystepping (im Druck mit `MOVE=1`, sonst ohne)
- Extrudieren und Zurückziehen, blockiert solange Klipper zu kalt meldet
- Geschwindigkeit, Flussrate, Max-Velocity und Beschleunigung
- Lüfter, Temperatur-Lüfter und `output_pin`-Ausgänge (PWM als Slider, sonst Schalter)
- Alle G-Code-Makros mit Suche; Favoriten landen im Dashboard-Schnellzugriff
- Neustarts für Firmware, Klipper, Moonraker und Host

**Dateien**
- G-Code-Browser mit Ordnern, Thumbnails, Suche und Sortierung
- Detailansicht mit Slicer-Metadaten, Druckstart und Löschen
- Upload mit Fortschrittsanzeige in das gerade geöffnete Verzeichnis
- Druckverlauf und Gesamtstatistik

**Kamera & Konsole**
- Webcams werden aus Moonraker übernommen, inklusive Rotation und Spiegelung
- MJPEG direkt, Snapshot-Polling als Rückfallebene, Vollbildmodus
- Overlay mit Fortschritt und Temperaturen
- G-Code-Konsole mit Verlauf, Autovervollständigung für Makros und Klipper-Befehle
  sowie einem Filter für die periodischen Temperaturmeldungen

**Allgemein**
- Mehrere Drucker, Umschalten in der Kopfzeile
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
Schichtfortschritt, G-Code-Antworten sowie die Datei-, Verlaufs- und
Kamera-Endpunkte.

```bash
node tools/mock-moonraker.mjs     # Terminal 1
npm run dev                       # Terminal 2
```

Dann `localhost:7125` als Druckeradresse eintragen.

### Skripte

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Typecheck und Produktions-Build nach `dist/` |
| `npm run preview` | Gebautes Ergebnis lokal ausliefern |
| `npm test` | Unit-Tests |
| `npm run typecheck` | Nur Typprüfung |

## Ausliefern

`npm run build` erzeugt statische Dateien in `dist/`. Die können überall liegen –
auch direkt auf dem Drucker-Host neben Mainsail:

```bash
npm run build
scp -r dist/* pi@printer.local:/home/pi/mobileklipper/
```

Als PWA installierst du sie dann über „Zum Startbildschirm hinzufügen". Der Service
Worker cacht nur die App-Shell; Druckerdaten laufen immer live über den WebSocket.

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

**Hinweis zu Push-Benachrichtigungen:** Eine App kann nicht zuverlässig im
Hintergrund am WebSocket hängen. Benachrichtigungen bei Druckende oder Fehler
brauchen wie bei Mobileraker einen Begleitdienst auf dem Drucker-Host, der den
Status überwacht und Pushes über FCM/APNs verschickt. Das ist ein eigenes Stück
Software und in dieser App noch nicht enthalten.

## Aufbau

```
src/
  moonraker/     JSON-RPC-Transport, API-Client, Klipper-Objekttypen
  store/         Zustand-Stores: Druckerkonfiguration, Live-Status, UI
  lib/           Reine Logik: Selektoren, G-Code-Bau, Formatierung, Palette
  components/    Gemeinsame UI-Bausteine und Layout
  features/      Fachliche Bausteine je Bereich
  pages/         Die fünf Hauptbildschirme plus Einstellungen und Verlauf
tools/           Mock-Moonraker für die Entwicklung
test/            Unit- und Komponententests
```

Die Trennung ist bewusst: alles unter `lib/` und `moonraker/` ist frei von React
und damit ohne Drucker testbar – dort liegen auch die Teile, die am ehesten
schiefgehen (Reconnect-Verhalten, Restzeit-Schätzung, G-Code-Erzeugung).

Zu den Chart- und Farbentscheidungen siehe [docs/DESIGN.md](docs/DESIGN.md).

## Sicherheit

Die App spricht direkt mit Moonraker, ohne Zwischenserver. API-Keys liegen im
`localStorage` des Browsers. Moonraker ins offene Internet zu stellen ist keine
gute Idee – für Zugriff von unterwegs eignen sich VPN (WireGuard, Tailscale) oder
ein Reverse-Proxy mit Authentifizierung.

## Lizenz

MIT
