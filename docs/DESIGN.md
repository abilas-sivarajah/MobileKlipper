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
