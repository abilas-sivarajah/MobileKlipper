# Design-Entscheidungen

## Farbpalette des Temperatur-Charts

Der Verlauf zeigt mehrere Entitäten gleichzeitig – Hotend, Bett, Kammer, Sensoren.
Das ist eine **kategoriale** Farbaufgabe: die Farbe steht für die Identität einer
Entität, nicht für eine Größe.

### Die acht Slots

Acht feste Farbtöne, für den jeweiligen Untergrund getrennt abgestimmt:

| Slot | Ton | Hell (`#ffffff`) | Dunkel (`#131a22`) |
| --- | --- | --- | --- |
| 1 | Orange | `#eb6834` | `#d95926` |
| 2 | Blau | `#2a78d6` | `#3987e5` |
| 3 | Aqua | `#1baf7a` | `#199e70` |
| 4 | Gelb | `#eda100` | `#c98500` |
| 5 | Magenta | `#e87ba4` | `#d55181` |
| 6 | Grün | `#008300` | `#008300` |
| 7 | Violett | `#4a3aa7` | `#9085e9` |
| 8 | Rot | `#e34948` | `#e66767` |

Slot 1 ist warm und Slot 2 kühl, damit Hotend und Heizbett die Farben bekommen,
die in der 3D-Druck-Welt üblich sind.

### Validierung

Beide Spalten wurden gegen ihren tatsächlichen Chart-Untergrund geprüft, nicht
nach Augenmaß:

- **Dunkel** (`#131a22`): alle Prüfungen bestanden. Schlechtestes benachbartes
  Paar bei Farbsehschwäche ΔE 8.4 (Protanopie), bei normalem Sehen ΔE 19.3,
  Kontrast überall ≥ 3:1.
- **Hell** (`#ffffff`): alle Prüfungen bestanden, mit einer Auflage – Aqua, Gelb
  und Magenta liegen unter 3:1 Kontrast. Dafür gilt die Erleichterungsregel:
  sichtbare Beschriftungen müssen vorhanden sein. Die Legende führt deshalb immer
  den aktuellen Zahlenwert je Serie mit.

### Regeln, die im Code stecken

- **Farbe folgt der Entität, nie ihrem Rang.** Die Slots werden aus der
  vollständigen, stabil sortierten Objektliste vergeben (`lib/palette.ts`). Wer in
  der Legende eine Serie ausblendet, färbt damit keine andere um.
- **Kein Durchrotieren der Töne.** Ab der neunten Entität gibt es ein neutrales
  Grau statt eines wiederverwendeten Farbtons – zwei Entitäten in derselben Farbe
  wären schlimmer als eine unauffällige.
- **Eine Achse.** Hotend bei 250 °C und Kammer bei 50 °C teilen sich dieselbe
  y-Achse. Eine zweite Skala würde Steigungen vergleichbar aussehen lassen, die es
  nicht sind.
- **Text trägt Textfarben.** Werte und Beschriftungen stehen in den normalen
  Schriftfarben; die Identität transportiert der farbige Punkt daneben.
- **Zieltemperaturen gestrichelt**, im selben Farbton wie die Istkurve und
  schwächer – dieselbe Entität, ein anderer Zustand.

Die Variablen liegen als `--color-series-1` … `-8` auf `:root` und werden im
hellen Theme überschrieben. Sie stehen bewusst **nicht** in Tailwinds `@theme`:
Tailwind v4 wirft Theme-Variablen weg, die keine generierte Utility-Klasse
benutzt, und diese hier werden nur in SVG-Attributen referenziert.

## Fortschritt und Restzeit

Die Werte sind bewusst so gerechnet, dass sie mit Mainsail übereinstimmen – wer
beide nebeneinander offen hat, soll nicht zwei verschiedene Restzeiten sehen.

### Fortschritt

Klipper meldet in `virtual_sdcard.progress` die rohe Byte-Position über die
**ganze** Datei. Darin stecken aber die eingebetteten Thumbnails am Anfang und
der Konfigurationsblock des Slicers am Ende – Bytes, die der Drucker zwar liest,
aber nicht druckt. Mainsail und Fluidd rechnen deshalb beide über den druckbaren
Teil:

```
Fortschritt = (file_position − gcode_start_byte) / (gcode_end_byte − gcode_start_byte)
```

Fehlen die Byte-Angaben in den Metadaten, fällt die Rechnung auf den rohen Wert
zurück. Die Prozentzahl wird **abgerundet**, nicht gerundet – sonst zeigt dieselbe
Sekunde hier 4 % und in Mainsail 3 %.

### Die drei Schätzungen

| Quelle | Rechnung |
| --- | --- |
| Datei | `print_duration / Fortschritt − print_duration` |
| Slicer | `estimated_time − print_duration` |
| Filament | `print_duration / (filament_used / filament_total) − print_duration` |

Nur positive Werte gehen in einen Mittelwert ein. Eine Slicer-Schätzung, die der
Druck längst überschritten hat, sagt nichts mehr aus, und eine Null würde den
Durchschnitt Richtung „gleich fertig" ziehen.

### Warum Restzeit und „Fertig um" verschieden gemittelt werden

Das ist keine Willkür, sondern Mainsails Voreinstellung (`calcEstimateTime` bzw.
`calcEtaTime`):

- **Restzeit** = Mittel aus **Datei + Filament**
- **Fertig um** = Mittel aus **Datei + Filament + Slicer**

Die Slicer-Angabe kennt die echte Beschleunigung des Druckers nicht und liegt oft
deutlich daneben; für die prominente Restzeit bleibt sie deshalb außen vor, für
den Zeitpunkt wird sie mitgemittelt. Beide Quellenlisten sind in den
Einstellungen änderbar, falls in Mainsail etwas anderes eingestellt ist.

Ein Regressionstest in `test/derive.test.ts` rechnet einen echten Druck nach, der
in Mainsail `Estimate 15:40:23 · Slicer 12:01:44 · Total 0:42:06 · ETA 04:36 +1`
anzeigte, und hält die Werte fest.

## Datenfluss

Moonraker schickt nach `printer.objects.subscribe` nur noch **Teilaktualisierungen** –
ein Statusframe enthält ausschließlich die Felder, die sich geändert haben. Der
Store führt sie eine Ebene tief zusammen (`mergeStatus`), sodass die Views immer
ein vollständiges Bild sehen.

Der Temperaturverlauf wird aus `server.temperature_store` vorgefüllt (rund 20
Minuten bei 1 Hz) und danach aus den Live-Updates fortgeschrieben, gedrosselt auf
einen Messpunkt pro Sekunde. Dadurch bleiben alle Serien auf derselben Zeitbasis
indexiert, was das Zeichnen und das Auslesen unter dem Crosshair trivial macht.

## Verbindungsverhalten

Der Transport (`moonraker/rpc.ts`) ist absichtlich langweilig und vollständig
testbar: Requests werden über ihre `id` zugeordnet, offene Aufrufe laufen in einen
Timeout, ein Verbindungsabbruch lehnt alles Ausstehende ab, und der Reconnect
wartet mit exponentiellem Backoff plus Jitter. Ein Watchdog schließt eine
Verbindung, über die zu lange nichts mehr kam – TCP merkt das sonst erst spät.

Der Client zählt zudem seine Verbindungsgenerationen. Beim Verbinden wird auf ein
Oneshot-Token gewartet; ein Client, der währenddessen verworfen wird, darf danach
nicht doch noch eine Verbindung aufbauen und Events in einen Store schreiben, der
längst einem anderen Drucker gehört.

## Fähigkeiten statt Modelle

Die App fragt nie „ist das ein Neptune 4?", sondern „hat diese Konfiguration eine
Sonde, ein `[bed_mesh]`, `[bed_screws]`?" (`lib/caps.ts`). Dasselbe Modell sieht je
nach Umbau und Firmware anders aus: ein Ender 3 V2 mit oder ohne CR Touch, ein
Neptune 4 Pro, dessen äußere Bettzone mal `heater_bed_outer` und mal anders heißt.
Das gewählte Druckerprofil (`lib/profiles.ts`) setzt nur App-seitige Startwerte –
Schrittweiten, Tempo, Material-Presets, Filamentweg – und Hinweise.

Abgeleitete Entscheidungen, die sonst gern schiefgehen:

- **Z-Offset speichern:** `Z_OFFSET_APPLY_PROBE` nur, wenn Z über die Sonde homt
  (`endstop_pin` enthält `z_virtual_endstop`), sonst `Z_OFFSET_APPLY_ENDSTOP` – auch
  bei einer Sonde, die nur das Mesh misst. Während eines Drucks wird nie
  `SAVE_CONFIG` mitgeschickt, weil es Klipper neu startet.
- **Heizer adressieren:** Klipper erwartet `HEATER=<letztes Wort des Abschnitts>`,
  also `heater_bed_outer` statt `heater_generic heater_bed_outer` (`heaterName`).
- **Extrusion:** Klipper lehnt jede einzelne Nur-Extrusionsbewegung über
  `max_extrude_only_distance` ab (Standard 50 mm). `extrudeMoves` teilt längere Wege
  in gleich lange Stücke, die das Limit nie überschreiten.

## Lange G-Code-Aufrufe

Moonraker beantwortet `printer.gcode.script` erst, wenn Klipper das Skript
abgearbeitet hat. `G28` auf einer Z-Achse mit 5 mm/s, `BED_MESH_CALIBRATE` oder
`PID_CALIBRATE` dauern Minuten. Der normale RPC-Timeout (20 s) würde dort einen
Fehler melden, während der Drucker korrekt weiterarbeitet. G-Code-Aufrufe haben
deshalb einen eigenen Timeout von einer Stunde; ein Verbindungsabbruch lehnt sie
weiterhin sofort ab.

Der Filament-Assistent schickt jedes Teilstück als eigenen Aufruf. So bleibt jeder
Aufruf kurz, der Fortschritt ist sichtbar, und „Anhalten" greift zwischen zwei
Stücken. Ein abschließendes `M400` wartet, bis die Motoren wirklich fertig sind.

## Bed-Mesh-Farbskala

Mesh-Werte sind vorzeichenbehaftete Abweichungen von Z=0 – Bett zu hoch oder zu tief.
Das ist eine **divergierende** Aufgabe: zwei Farbtöne mit neutralem Grau in der
Mitte, symmetrisch um null skaliert (±größte Abweichung), damit gleich große
Abweichungen gleich stark wirken.

| | Tief | Mitte (0) | Hoch |
| --- | --- | --- | --- |
| Hell | `#1c5cab` | `#f0efec` | `#a32a26` |
| Dunkel | `#6da7ec` | `#383835` | `#e57f78` |

- Blau und Rot sind kalt/warm und lesen sich als Gegensätze; kein Regenbogen.
- Beide Pole haben dieselbe OKLCH-Helligkeit (hell ≈ 0,48, dunkel ≈ 0,71), damit
  keine Richtung schlimmer aussieht als die andere.
- Interpoliert wird in OKLab, damit die Helligkeit entlang jedes Arms gleichmäßig
  verläuft; `test/bedMesh.test.ts` prüft Monotonie und gleiche Pol-Helligkeit.
- Werte stehen nicht in jeder Zelle. Antippen zeigt den Messwert, tiefster und
  höchster Punkt sind markiert und darunter beschriftet, und eine Tabellenansicht
  liefert alle Zahlen – die Farbe trägt die Information nie allein.
- Zeile 0 der Klipper-Matrix ist die Vorderkante des Betts und steht unten, so wie
  man vor dem Drucker steht.

## Benachrichtigungen

Gemeldet werden nur **Übergänge** (`lib/notify.ts`): wer sich mit einem Drucker
verbindet, dessen Druck längst fertig ist, bekommt kein „Druck fertig". Nach jedem
Verbindungsaufbau wird zuerst eine Ausgangslage genommen. Sichtbar offen zeigt die
App Toasts, im Hintergrund Systembenachrichtigungen über den Service Worker.

## App-Updates

Das Schema stammt aus GX Tube und ABI TV: `releases/latest` abfragen, Versionen
numerisch vergleichen, „Später" gilt 12 Stunden für genau diese Version, beim Öffnen
höchstens alle 15 Minuten prüfen, Fehler nur bei der manuellen Prüfung melden
(`lib/appUpdate.ts`, `store/appUpdate.ts`).

Eine Web-App kann ihre Dateien auf dem Server nicht selbst ersetzen. Das übernimmt
Moonrakers Update-Manager mit `type: web`: Er lädt `mobileklipper.zip` aus dem Release
und prüft die Installation anhand von `release_info.json`. Beides erzeugt der Build
(`vite.config.ts`) aus derselben Versionsnummer, die auch in die App kompiliert wird.
Release-Tag, `release_info.json` und Anzeige in der App können dadurch nicht
auseinanderlaufen.

Vor dem Upgrade fragt die App Moonraker per `machine.update.refresh` gezielt nach
diesem einen Eintrag. Moonraker merkt sich GitHubs Antwort lange und würde sonst
„bereits aktuell" melden.

Danach bleibt der Service Worker: Er hält die alte App-Shell im Cache. Der Worker
ist deshalb auf `registerType: 'prompt'` gestellt. Nach dem Upgrade holt die App
den neuen Worker und lässt ihn übernehmen (`lib/sw.ts`), statt nur neu zu laden und
dabei wieder die alten Dateien aus dem Cache zu bekommen. Kommen neue Dateien auf
anderem Weg (Mainsail, Kopieren), erscheint ein Banner statt eines ungefragten
Neuladens mitten in einer Eingabe.
