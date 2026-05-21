# HEIMDALL Flux Card — Vollständige Spezifikation v2.0

**Version:** 2.0
**Datum:** 21.05.2026
**Status:** Definiert, freigegeben, bereit für Phase 1 Schritt 3
**Repository:** https://github.com/JochenRi/heimdall-flux-card
**Upstream:** https://github.com/jayjojayson/power-flux-card (MIT License)

**Vorgängerversion:** v1.0 vom 21.05.2026 — diese v2.0 ist eine inhaltliche Erweiterung, keine Umstellung. Alle Entscheidungen aus v1.0 gelten weiter, sofern nicht in dieser Datei explizit überschrieben.

---

## Änderungsprotokoll v1.0 → v2.0

| Bereich | Was geändert |
|---|---|
| Block A (Layout) | viewBox vergrößert von 420 (Original) auf **620 × 620**, Bubble-Größe von 90 auf **100 px**, Abstand 160 px wie Original |
| Block B (Pipes) | 12 Pipes mit finalen Bézier-Pfaden für die neue Geometrie. Upstream-Pfad `pathGridToBatt` entfällt (Spec-konform). |
| Block D (Compact-View) | unverändert (2 Balken nebeneinander) |
| Block E (Editor) | erweitert: Performance-Sektion, Forecast-Sektion, Lernsystem |
| Block G (Animationen) | unverändert |
| Block H (Sensor-Mapping) | erweitert um Forecast- und Lern-Sensoren |
| **Neu — Block K** | **Performance-Architektur** (alles editor-konfigurierbar, kein Hardcoding) |
| **Neu — Block L** | **PV-Forecast-Modul** (3 Anzeige-Varianten + Lernsystem) |
| **Neu — Block M** | **Recherche-Erkenntnisse aus dem HA-Ökosystem** (Vorschläge übernommen / parkiert / verworfen) |
| Phasenplan | erweitert um neue Features, Phase 7 in 7a/7b/7c aufgeteilt |

---

## Zweck dieses Dokuments

Dies ist die **vollständige Definition v2.0** der `heimdall-flux-card`. Sie ergänzt v1.0 um Erkenntnisse aus der Industrie-Recherche, ein vollwertiges PV-Forecast-Modul (Glockenkurve + Wochenvergleich + Lernsystem im evcc-Stil) sowie eine durchgängige Performance-Architektur für ältere Tablets.

Alle Design-Entscheidungen, Architektur-Wahl, Lizenz- und Attribution-Strategie sind hier dokumentiert. Diese Spec ist Basis für die Implementierung und Single Source of Truth bei Reviews und Rollbacks.

---

## Übersicht — Was wird gebaut?

Eine **eigenständige HACS-Karte** namens `heimdall-flux-card`, basierend auf Power Flux Card v0.x von jayjojayson:

- 4 Bubbles obere Reihe (Solar, Grid, LG, Venus) statt 3
- 5 Verbraucher-Bubbles in 3+2-Anordnung (Original-Layout)
- 12 Pipes (statt 9 im Upstream), davon 2 neu: separate Solar→LG und Solar→Venus
- LG/Venus mit eigener SoC + signed Leistung
- Compact-View komplett umgebaut: 2 Balken nebeneinander (einer pro Speicher)
- Donut-Chart erweitert auf 4 Segmente (PV, LG, Venus, Netz)
- Drittes View-Modus `lite` ohne Animationen (Tablet-Performance)
- **PV-Forecast-Modul mit Glockenkurve + Wochenvergleich + optionalem Lernsystem (Ist-Soll-Korrektur)**
- Vollständiger Editor mit allen Animations- und Performance-Toggles
- **Alle Performance-relevanten Werte editor-konfigurierbar — kein Hardcoding**
- MIT-Lizenz, GitHub-Repo öffentlich, HACS-konform, attribution-correct
- Bilingual DE/EN

**Aufwandszone v2.0:** 1000–1500 LOC Änderungen vs. Upstream (vorher 600–900, da Forecast und Performance dazu kommen).

---

## Block A — Layout (Standard-View) — v2.0 Geometrie

### viewBox & Maße

| Metrik | Upstream (3 Bubbles) | Spec v1.0 | **Spec v2.0** |
|---|---|---|---|
| viewBox-Breite | 420 | 560 | **620** |
| Bubble-Größe | 90 × 90 | 90 × 90 | **100 × 100** |
| Bubble-Abstand (Center-zu-Center) | 160 | 140 | **160** (= Original) |
| Lücke zwischen Bubbles | 70 | 50 | 60 |
| baseHeight (max) | 580 | 580 | **620** |

**Begründung:** v1.0 (560) war zu eng, Bubbles wirkten gedrängt. v2.0 (620) hält den **Original-Bubble-Abstand von 160 px** ein — die Card fühlt sich visuell genauso luftig an wie jayjojayson's Original.

### Bubble-Koordinaten (Mittelpunkte cx/cy + Anker am Rand)

| Bubble | cx | cy | Anker oben (cy−50) | Anker unten (cy+50) | Anker links (cx−50) | Anker rechts (cx+50) |
|---|---|---|---|---|---|---|
| **solar** | 55 | 125 | 75 | 175 | 5 | 105 |
| **grid** | 215 | 125 | 75 | 175 | 165 | 265 |
| **LG** | 375 | 125 | 75 | 175 | 325 | 425 |
| **venus** | 535 | 125 | 75 | 175 | 485 | 585 |
| **house** | 310 | 290 | 240 | 340 | 260 | 360 |
| **c1** (Tesla) | 85 | 445 | 395 | 495 | 35 | 135 |
| **c2** (Waschm.) | 310 | 445 | 395 | 495 | 260 | 360 |
| **c3** (Trockner) | 535 | 445 | 395 | 495 | 485 | 585 |
| **c4** (Spüle) | 195 | 555 | 505 | 605 | 145 | 245 |
| **c5** (BWWP) | 425 | 555 | 505 | 605 | 375 | 475 |

**Symmetrie:** alles um Mittelachse x=310 gespiegelt. ✅

### Layout-Schema (vertikal)

```
viewBox 0 0 620 620
  x=0                                                                       x=620
  │                                                                           │
  ┌──────────────────────────────────────────────────────────────────────────┐ y=0
  │                                                                           │
  │  ⚫solar      ⚫grid       ⚫LG         ⚫venus                              │ y=125
  │   ↓↘  ↘      ↓  ↘        ↓ ↑          ↓ ↑                                │
  │                                                                           │
  │                       ⚫haus                                               │ y=290
  │                      ↙  ↓  ↘                                              │
  │                                                                           │
  │   ⚫c1         ⚫c2         ⚫c3                                            │ y=445
  │     ↘                    ↙                                                │
  │                                                                           │
  │              ⚫c4     ⚫c5                                                  │ y=555
  │                                                                           │
  └──────────────────────────────────────────────────────────────────────────┘ y=620
```

### Skalierungs-Logik (übernommen vom Upstream, angepasst)

Upstream-Mechanismus bleibt erhalten:
- `designWidth` wird von 420 auf **620** geändert
- `userZoom` bleibt im Editor konfigurierbar (Default 0.9, Range 0.5–1.5)
- Card skaliert automatisch auf verfügbare Lovelace-Breite × userZoom

---

## Block B — Pipes (12 Stück) — v2.0 Pfade

### Pipe-Inventar mit finalen Bézier-Koordinaten

| # | Pipe | Pfad-d | Sichtbar wenn | Bemerkung |
|---|---|---|---|---|
| 1 | Solar → Haus | `M 55 175 Q 55 290 260 290` | PV-Direktverbrauch > S | unverändert vom Schema, neue Koords |
| 2 | Solar → LG | `M 105 125 Q 245 60 325 125` | LG lädt aus PV > S | **neu**, Bogen über Grid hinweg |
| 3 | Solar → Venus | `M 105 125 Q 320 30 485 125` | Venus lädt aus PV > S | **neu**, höherer Bogen über Grid+LG |
| 4 | Grid → Haus | `M 215 175 L 310 240` | Netzbezug > S | diagonal (Grid nicht mehr mittig) |
| 5 | Haus → Grid (Export via Haus) | `M 310 240 L 215 175` | Export > S | Gegenrichtung von #4 |
| 5b | Solar → Grid (Export direkt) | `M 105 125 Q 135 160 165 125` | PV-Überschuss > S | aktiver Pfad bei solarVal > 1 |
| 6 | LG ↔ Haus | `M 375 175 Q 375 260 340 260` | ｜Leistung｜ > S | **eine** Linie, Richtung dreht sich |
| 7 | Venus ↔ Haus | `M 535 175 Q 535 320 360 320` | ｜Leistung｜ > S | **eine** Linie, etwas tieferer Bogen damit nicht mit #6 kollidiert |

**Hinweis zur Andockpunkt-Geometrie der Pipes 6 und 7:**
Die End-Koordinaten `(340, 260)` für Pipe 6 und `(360, 320)` für Pipe 7 liegen nicht exakt auf dem Bubble-Rand des Hauses (Radius 50 px um Center 310,290). Pipe 6 endet ~42 px vom Center (innerhalb der Bubble), Pipe 7 ~58 px (außerhalb). Da die Pipes im SVG hinter der Haus-Bubble (z-index) verschwinden, ist das **optisch unkritisch** — der User sieht die Pipe bis zum Bubble-Rand. **Beim Implementieren (Phase 3) sind diese beiden Endpunkte visuell feinzujustieren**, falls Glow-Effekte über den Bubble-Rand hinausragen. Korrigierter Ziel-Endpunkt:
- Pipe 6: ungefähr `(340, 280)` — Haus rechts-oben (Winkel ~26° vom Center)
- Pipe 7: ungefähr `(348, 320)` — Haus rechts-unten (Winkel ~38° vom Center)
| 8 | Haus → Tesla (c1) | `M 260 290 Q 85 290 85 395` | > S | |
| 9 | Haus → Waschm. (c2) | `M 310 340 L 310 395` | > S | gerade Linie |
| 10 | Haus → Trockner (c3) | `M 360 290 Q 535 290 535 395` | > S | |
| 11 | Haus → Spüle (c4) | `M 260 290 Q 175 395 195 505` | > S | Bogen über c1 hinweg |
| 12 | Haus → BWWP (c5) | `M 360 290 Q 445 395 425 505` | > S | Bogen über c3 hinweg |

**Globaler Schwellwert (S):** 20 W, editor-konfigurierbar pro Pipe-Gruppe.

### Pipe-Routing-Regeln (gelten weiter aus v1.0)

- **Solar→LG und Solar→Venus** geometrisch nebeneinander gezeichnet, niemals überlappend.
- **LG↔Haus und Venus↔Haus** je eine Linie, Animationsrichtung dreht bei Vorzeichenwechsel.
- **Netzladung der Speicher** wird via Fluss-Kette `Grid→Haus↑` + `Haus→Speicher↑` dargestellt. Kein direkter `Grid→LG`/`Grid→Venus`-Pfad — Upstream-`pathGridToBatt` entfällt.
- **Pipes liegen im SVG, Bubbles als HTML mit z-index 2** — Pipes verschwinden visuell hinter Bubbles, was das gewünschte Original-Verhalten ist.

### Watt-Label-Positionen

Mitte der jeweiligen Pipe, im Editor pro Pipe-Gruppe verschiebbar (z.B. `solar_label_offset_x`).

| Pipe | Label-Position (x, y) Default |
|---|---|
| 1 Solar→Haus | (130, 245) |
| 2 Solar→LG | (215, 80) |
| 3 Solar→Venus | (310, 50) |
| 4/5 Grid↔Haus | (260, 215) |
| 5b Solar→Grid | (135, 145) |
| 6 LG↔Haus | (380, 230) |
| 7 Venus↔Haus | (450, 270) |
| 8 Haus→c1 | (165, 345) |
| 9 Haus→c2 | (320, 365) |
| 10 Haus→c3 | (450, 345) |
| 11 Haus→c4 | (220, 410) |
| 12 Haus→c5 | (400, 410) |

---

## Block C — Bubble-Inhalte (unverändert vs. v1.0)

| Bubble | Großwert | Kleinwert | Einheit |
|---|---|---|---|
| Solar | aktuelle PV-Leistung | optional: Forecast-Wert (Sekundärsensor) | W (auto kW) |
| Grid | Bezug/Export mit ▲ ▼ | optional: Strompreis o.ä. | W |
| LG | Leistung mit + (laden) / − (entladen) | SoC | W / % |
| Venus | Leistung mit + (laden) / − (entladen) | SoC | W / % |
| Haus | Gesamtverbrauch | optional | W |
| Tesla | aktuelle Ladeleistung | SoC | W / % |
| Waschmaschine | Leistung | — | W |
| Trockner | Leistung | — | W |
| Spüle | Leistung | — | W |
| BWWP | Leistung | Temperatur | W / °C |

### Erweiterung v2.0 — Auto-Detect signed vs. split entity

**Statt User-Toggle: Card erkennt selbst:**
- Wenn nur 1 Battery-Entität konfiguriert → signed-Modus (positiv = laden, negativ = entladen)
- Wenn 2 Entitäten konfiguriert (`battery_charge` + `battery_discharge`) → split-Modus
- **Editor zeigt erkannten Modus an** (z.B. "Erkannt: signed" als read-only Info-Feld)
- Optional: User kann den Auto-Detect übersteuern via `battery_sign_mode: auto | signed | split` (Default `auto`)

### Erweiterung v2.0 — `watt_threshold` pro Bubble

Upstream hat Auto-kW bei hardcoded 1000 W. Wir machen das per Bubble konfigurierbar:
- `solar_watt_threshold`, `grid_watt_threshold`, `lg_watt_threshold`, ... — Default 1000 W
- `0` = nie in kW umschalten, immer in W
- Sehr großer Wert (z.B. 99999) = nie in kW umschalten

---

## Block D — Compact-View (unverändert vs. v1.0)

Zwei Balken nebeneinander, einer pro Speicher.

```
┌─────────────────────────┐  ┌─────────────────────────┐
│  ☀  LG (SoC 78%)        │  │  ☀  Venus (SoC 45%)     │
│  ████████████░░░░░ +450W│  │  ██████░░░░░░░░░ -320W  │
│  🏠 🚗 🌡 ⚡             │  │  🏠 🚗 🌡 ⚡             │
└─────────────────────────┘  └─────────────────────────┘
```

**Pro Balken:**
- Hauptanzeige: SoC % (als gefüllter Anteil)
- Farbe: Grün = lädt aus PV, Gelb = entlädt, Rot = lädt aus Netz, Grau = idle
- Großtext: aktuelle Leistung in W mit Vorzeichen
- Kleintext: SoC %
- Bubble-Icons drumherum: Mini-Größe (Solar, Grid, Haus, ausgewählte Verbraucher)

---

## Block D2 — Lite-View (NEU in v2.0)

**Dritte View-Variante**, speziell für ältere Tablets oder User die Performance über Optik stellen.

**Was Lite zeigt:**
- Die 10 Bubbles wie in Standard-View (Layout identisch)
- Statische dünne Linien zwischen aktiven Knoten (keine Bézier-Bögen, keine Animation)
- Wert in jeder Bubble groß
- **Keine** Neon-Glows, Comet-Tails, Pulse, Donuts, Hintergrund-Tinting
- **Keine** SVG-Filter, keine `backdrop-filter`, keine `box-shadow` mit Blur
- Inaktive Pipes werden gar nicht im DOM gerendert (nicht `display: none`)

**Editor-Auswahl:** `view_mode: standard | compact | lite`

**Performance-Erwartung:** Auf einem Samsung Galaxy Tab A (2018-Generation) flüssig bei < 50 ms Render-Zeit pro State-Update.

---

## Block E — Editor (vollständig, alle Sektionen)

### E.1 — Bubble-Konfiguration (pro Bubble)

- Hauptentität (entity-picker)
- Sekundärentität (optional, entity-picker)
- Label/Name (free text, DE/EN-aware)
- Icon (MDI-Picker)
- Farbe (color-picker, mit Default)
- Glow on/off
- Tinted Background on/off
- Lokaler Schwellwert (override des Card-Globals)
- **`watt_threshold`** (auto-kW-Schwelle, Default 1000)
- Auto-kW-Skalierung on/off

### E.2 — Globale Sektion „Animationen"

| Toggle | Default | Performance-Kosten |
|---|---|---|
| `show_neon_glow` | true | mittel (box-shadow) |
| `show_donut_border` | true | gering (einmal pro Update via conic-gradient) |
| `show_comet_tail` | true | hoch (stroke-dashoffset pro Frame) |
| `show_dashed_line` | false | gering (Alternative zu Comet-Tail) |
| `show_tinted_background` | true | gering |
| `show_pulse` | true | mittel |
| `dynamic_flow_speed` | true | gering — Geschwindigkeit der Animation skaliert mit Leistung |
| `flow_speed_min` | 0.5s | — |
| `flow_speed_max` | 5s | — |

### E.3 — Globale Sektion „Pipes"

- `pipe_threshold_global` (Default 20 W)
- `pipe_threshold_solar`, `pipe_threshold_grid`, `pipe_threshold_battery`, `pipe_threshold_consumer` — Override pro Gruppe
- `hide_inactive_flows` (Default `true`, **strikt durchhalten** — inaktive Pipes nicht im DOM)
- `watt_label_position_offset_x/y` pro Pipe-Gruppe

### E.4 — Globale Sektion „View-Modus"

- `view_mode: standard | compact | lite` (Default `standard`)
- `zoom` (0.5–1.5, Default 0.9)
- `card_width_override` (px, optional — überschreibt automatische Lovelace-Breite)

### E.5 — Globale Sektion „Compact-View-Optionen"

- Welche Speicher anzeigen (`lg`, `venus`, oder beide)
- Reihenfolge (`lg_first` / `venus_first`)
- Welche Verbraucher als Mini-Icons (Multiselect)

### E.6 — Globale Sektion „Performance & Update" (NEU in v2.0)

| Editor-Feld | Was es macht | Default |
|---|---|---|
| `update_throttle_ms` | Minimaler Abstand zwischen Re-Renders, in ms | 0 (kein Throttling) |
| `max_animated_pipes` | Maximale Zahl gleichzeitig animierter Pipes (Rest statisch) | 12 |
| `resize_debounce_ms` | Debounce für ResizeObserver | 100 |
| `performance_mode` | Sammel-Preset: `full` / `balanced` / `low` | `full` |
| `low_power_mode` | Master-Switch: deaktiviert Glow, Comet-Tail, Pulse, Donut auf einen Klick | false |

**Wichtig:** `performance_mode` und `low_power_mode` sind Komfort-Sammel-Schalter. Sie setzen mehrere andere Werte gleichzeitig. **Alle individuellen Werte können danach weiterhin überschrieben werden**, nichts ist hardcoded.

### E.7 — Globale Sektion „Sprache"

- `language: de | en | auto` (Default `auto` — folgt HA-Sprache)

### E.8 — Sektion „PV-Forecast" (NEU in v2.0)

→ Komplette Spezifikation in **Block L** unten.

### E.9 — Editor-Erweiterungen vs. Upstream

- **Zweite Battery-Sektion**: Editor spiegelt die Battery-Sektion komplett (LG + Venus).
- **Vorzeichen-Auto-Detect**: Editor zeigt erkannten Modus, User kann übersteuern.
- **Forecast-Sektion** komplett neu (Block L).
- **Performance-Sektion** komplett neu (E.6).
- **Lite-View-Auswahl** neu (E.4).

---

## Block F — Distribution & Lizenz (unverändert vs. v1.0)

### Repository

- URL: https://github.com/JochenRi/heimdall-flux-card
- öffentlich, HACS Custom Repository
- echter GitHub-Fork (Attribution + Git-History erhalten)

### Lizenz

- MIT (vom Upstream übernommen)
- LICENSE-Datei: doppelter Copyright-Vermerk (jayjojayson + Johannes), MIT-Text unverändert
- Code-Header in der Haupt-JS-Datei: kurze "Based on..."-Notiz mit Link

### Attribution

Vorbild: `francois-le-ko4la/lovelace-entity-progress-card`, `flixlix/power-flow-card-plus`.

README-Header, README-Ende-Credits-Sektion, Stern-/Spenden-Empfehlung für jayjojayson — Details siehe v1.0 (unverändert).

### Card-Name

`custom:heimdall-flux-card` — "flux" bleibt als sichtbarer Herkunftsmarker erhalten.

---

## Block G — Animationen & visuelle Effekte (unverändert vs. v1.0)

Alle Effekte des Originals werden übernommen, alle im Editor schaltbar. Donut-Chart erweitert auf 4 Segmente (PV/LG/Venus/Netz). Details siehe E.2 und v1.0.

---

## Block H — Sensor-Mapping (erweitert vs. v1.0)

**Keine hardcoded Sensoren in der Card.** Alle Entitäten werden im Editor zugewiesen.

### H.1 — Card-Defaults (Platzhalter, vom Nutzer überschreibbar)

- `sensor.solar_power`
- `sensor.grid_power`
- `sensor.battery_1_power`, `sensor.battery_1_soc`
- `sensor.battery_2_power`, `sensor.battery_2_soc`
- `sensor.home_consumption`
- `sensor.consumer_1_power` … `sensor.consumer_5_power`
- entsprechende Sekundärsensoren

### H.2 — Forecast-Sensoren (NEU in v2.0)

- `sensor.forecast_today_kwh` — heutige Vorhersage
- `sensor.forecast_tomorrow_kwh` — morgige Vorhersage
- `sensor.forecast_day_3_kwh`, `sensor.forecast_day_4_kwh` … (optional, bis 7)
- `sensor.forecast_hourly` mit Attribut `watts` (24h-Array) — für Glockenkurve
- `sensor.pv_energy_today` — gemessene PV-Erzeugung **heute** (für Lernsystem)
- `sun.sun` — HA-Standard für Sonnenaufgang/-untergang

### H.3 — Optional „Grid-Outage"-Sensor (NEU in v2.0)

- `binary_sensor.grid_outage` (true = Netz weg) — Card zeigt dann Grid-Bubble ausgegraut, Insel-Modus

---

## Block I — Machbarkeit, Aufwand & Risiken (aktualisiert)

### Aufwand v2.0

| Komponente | LOC-Schätzung |
|---|---|
| Bestehender Layout-Umbau v1.0 (Geometrie, Pipes, 2. Battery) | 600–900 |
| Performance-Sektion (Editor + Code) | 100–150 |
| Lite-View (D2) | 80–120 |
| Forecast-Modul (SVG + Editor + Lernsystem) | 300–400 |
| Auto-Detect signed/split + watt_threshold | 50–80 |
| Action-Configs (Phase 7) | 80–120 |
| **Summe** | **1210–1770 LOC** |

### Risiken (v1.0 + neu)

1. **Editor-Konsistenz** (v1.0) — strukturierte Diff-Reviews vor jedem Commit
2. **SVG-Geometrie** (v1.0) — vorab Koordinaten-Plan ✅ erledigt in v2.0 Block A/B
3. **Compact-View Doppelbalken** (v1.0) — ~150 LOC zusätzlich
4. **Donut-Chart 4 Segmente** (v1.0) — Berechnung erweitern
5. **card_mod-Kompatibilität** (v1.0) — CSS-Variablen erweitern statt umbenennen
6. **Mehrsprachigkeit** (v1.0) — `lang-de.js`, `lang-en.js` ergänzen
7. **Build-Toolchain** (v1.0) — kein Drama
8. **NEU — Lernsystem-Persistenz** — `localStorage` ist tab-spezifisch, `input_number`-Helper wäre robuster aber komplexer. **Entscheidung:** beides anbieten (Editor-Auswahl), Default `localStorage`.
9. **NEU — Lernsystem-Verfälschung durch Speicher-Export** (bekanntes evcc-Problem) — adressiert durch klare Editor-Pflicht: `forecast_actual_today_sensor` MUSS reine PV-Erzeugung sein, nie Netzeinspeisung.
10. **NEU — Forecast-Modul ohne Sensoren** — bei fehlenden Sensoren graceful degradation, kein Crash. Card zeigt Hinweis "Sensoren fehlen" im Editor.

---

## Block J — Geklärte Detail-Entscheidungen (v1.0 + v2.0)

| ID | Frage | Entscheidung |
|---|---|---|
| J1 | Verbraucher-Anordnung unten | 3+2 versetzt wie Original |
| J2 | Compact-View bei 2 Speichern | Zwei Balken nebeneinander |
| **J3** | **Geometrie-Breite** | **viewBox 620, Bubble 100×100, Abstand 160** |
| **J4** | **Lite-View** | **Als dritter View-Modus aufgenommen (Tablet-Performance)** |
| **J5** | **Performance-Werte** | **Alle editor-konfigurierbar, kein Hardcoding** |
| **J6** | **Forecast-Modul** | **Aufgenommen als Phase 7a, 3 Varianten + Lernsystem** |
| **J7** | **Forecast-Display-Varianten** | **User wählt im Editor: `popup` / `inline` / `both`** |
| **J8** | **Lernsystem Speicher-Verfälschung** | **`forecast_actual_today_sensor` MUSS reine PV-Erzeugung sein, im Editor-Hilfetext warnen** |
| **J9** | **Lernsystem-Persistenz** | **Editor-Auswahl `localStorage` oder `ha_helper`, Default `localStorage`** |
| **J10** | **Vorzeichen LG/Venus** | **Auto-Detect (anhand Anzahl Entitäten), User kann übersteuern** |
| **J11** | **watt_threshold** | **Pro Bubble konfigurierbar, Default 1000** |
| **J12** | **Grid-Outage-Indikator** | **Optionaler `binary_sensor`, Phase 7b** |
| **J13** | **Action-Configs (tap/hold/double-tap)** | **HA-Standard, Phase 7b** |

---

## Block K — Performance-Architektur (NEU in v2.0)

### K.1 — Grundprinzipien

1. **Alle Performance-relevanten Werte sind editor-konfigurierbar.** Es gibt **keine hardcoded Werte** für Update-Frequenz, Animations-Geschwindigkeit, max. animierte Elemente, Throttling-Zeiten o.ä. Alles wird aus `this.config` gelesen.

2. **Default-Verhalten = Upstream-Verhalten.** User sehen nach Upgrade keinen Unterschied. Performance-Optimierung ist Opt-in via Editor.

3. **Animations-Properties bevorzugt: `transform` und `opacity`.** Diese werden auf der GPU komponiert und kosten keinen Reflow. Wenn `stroke-dashoffset` (Comet-Tail) verwendet wird, dann `will-change: stroke-dashoffset` sparsam einsetzen und durch `max_animated_pipes` limitieren.

4. **DOM-Updates nur bei tatsächlicher Wertänderung.** Property-Diff-Check in `shouldUpdate()`. Spart Re-Renders bei häufigen identischen State-Updates.

5. **Inaktive Pipes nicht im DOM.** `hide_inactive_flows: true` als Default. Spart bei typischem Setup mit 3–4 aktiven Pipes ca. 60–75 % SVG-Render-Aufwand.

### K.2 — Editor-konfigurierbare Performance-Parameter (siehe E.6)

Alle Werte landen in `this.config.*` und werden im Code gelesen als:

```javascript
const throttleMs = this.config.update_throttle_ms ?? 0;
const maxAnimated = this.config.max_animated_pipes ?? 12;
const resizeDebounce = this.config.resize_debounce_ms ?? 100;
const animateThisPipe = activePipeCount < maxAnimated;
```

### K.3 — Performance-Patterns (Best Practices aus der Recherche)

Aus `NXJim/enhanced-power-flow-card` übernommen:

- **Debounced ResizeObserver**: Default 100 ms (editor-konfigurierbar via `resize_debounce_ms`)
- **Proper cleanup on disconnect**: `disconnectedCallback()` entfernt alle Event-Listener und Observer
- **Minimal DOM manipulation**: Werte werden in lit-html-Templates via Property-Binding aktualisiert, nicht via `innerHTML`-Manipulation

### K.4 — Update-Throttling

`hass`-Setter throttlet Re-Renders auf `update_throttle_ms`:

- Default 0 ms = kein Throttling, Upstream-Verhalten
- Empfohlen für Tablets: 500–1000 ms
- Bei Throttling werden nur die letzten Werte verwendet (kein State-Verlust, nur weniger Re-Renders)

### K.5 — Lite-Mode = Performance-Joker

`view_mode: lite` schaltet alle Animationen, Glows, Donuts, Tints global aus. Keine SVG-Filter, keine box-shadow-Layer. Reine flat-CSS-Anzeige mit statischen dünnen Linien. Für ältere Tablets (Samsung Tab A 2018 und älter) **die empfohlene Wahl**.

### K.6 — Performance-Preset (`performance_mode`)

Sammel-Schalter, der mehrere Einzelwerte gleichzeitig setzt:

| Preset | Effekte |
|---|---|
| `full` (Default) | Alles an wie Upstream, `update_throttle_ms: 0`, `max_animated_pipes: 12` |
| `balanced` | `update_throttle_ms: 500`, `max_animated_pipes: 6`, `flow_speed_max: 3s`, Comet-Tail-Geschwindigkeit halbiert |
| `low` | `update_throttle_ms: 1000`, `max_animated_pipes: 0` (alles statisch), Glow aus, Donut aus, Pulse aus |

**User kann nach Wahl eines Presets jeden einzelnen Wert weiter überschreiben** — Preset ist nur ein Startpunkt, kein Käfig.

---

## Block L — PV-Forecast-Modul (NEU in v2.0)

### L.1 — Übersicht

Optionales Anzeige-Modul, das eine **Glockenkurve der Tages-PV-Vorhersage** plus **Wochenvergleich** zeigt. Inspiriert vom Design-Style aus dem User-Briefing (gelb-orange Neon, dunkler Hintergrund) und der evcc-Forecast-Funktion (Ist-Soll-Korrektur).

### L.2 — Drei Anzeige-Varianten (User wählt via Editor)

| Variante | Beschreibung | Wann sichtbar |
|---|---|---|
| **`popup`** | Vollansicht (Glocke + Wochenvergleich + Lernsystem-Info) | beim Klick auf Solar-Bubble |
| **`inline`** | Kompakte Mini-Glocke + JETZT-Wert + Heute-Total | permanent über/unter Standard-Card |
| **`both`** | Inline permanent + Popup zusätzlich bei Klick | beide |

Editor-Feld: `forecast_display_mode: popup | inline | both` (Default `popup`).

### L.3 — Variante 1: Popup (Vollansicht)

**Inhalt von oben nach unten:**

1. Header: Titel (`forecast_title`, Default "PV Forecast") + Untertitel (`forecast_subtitle_template`, Default `"Heute bis {sunset_h} Uhr"`)
2. Glockenkurve über Tagesachse 0–24 h
   - X-Achse: Stunden, Marker bei 0 / 6 / 12 / 18 / 24
   - Gefüllter Bereich unter der Kurve = erwartete PV-Produktion (Watt pro Stunde aus `forecast_hourly_attribute`)
   - Vertikale "JETZT"-Linie mit Punkt auf der Kurve
   - Sonnenaufgang ↑ und Sonnenuntergang ↓ als Text-Marker
3. Wochenvergleich (4–7 Tage)
   - Pro Tag: Label (HEUTE / MORGEN / Wochentagsname) + horizontaler Balken (relative Höhe) + kWh-Wert
   - HEUTE optisch hervorgehoben (kräftiger gefüllter Balken)
4. **Lernsystem-Box** (wenn aktiviert): "Korrekturfaktor: 0.87 — 7-Tage-Mittel" + Mini-Sparkline der letzten 7 Tagesfaktoren

### L.4 — Variante 2: Inline (Kompakt)

**Zwei-Spalten-Layout, ca. 80 px hoch:**

| Linke Spalte | Rechte Spalte |
|---|---|
| Mini-Glocke (kein Wochenvergleich, kein Sonnenauf/-untergang) | "JETZT" + aktueller PV-Wert (groß) |
| | "HEUTE" + erwartetes kWh-Total |

Position: `forecast_inline_position: top | bottom` (Default `top`).

### L.5 — Variante 3: Beide

Inline ist permanent sichtbar (kompakt). Bei Klick auf Solar-Bubble (oder auf Inline-Box) öffnet sich Popup-Vollansicht.

### L.6 — Editor-Konfiguration (komplette Liste)

#### L.6.1 — Anzeige

| Feld | Werte | Default | Beschreibung |
|---|---|---|---|
| `forecast_enabled` | bool | `false` | Forecast-Modul ein/aus |
| `forecast_display_mode` | `popup` / `inline` / `both` | `popup` | Welche Variante |
| `forecast_inline_position` | `top` / `bottom` | `top` | Wo Inline-Box steht |
| `forecast_title` | string | `"PV Forecast"` | Titel des Popup |
| `forecast_subtitle_template` | string | `"Heute bis {sunset_h} Uhr"` | Untertitel mit Variablen |
| `forecast_color` | hex | `#EF9F27` | Akzentfarbe |
| `forecast_show_now_line` | bool | `true` | „JETZT"-Linie anzeigen |
| `forecast_show_sunrise_sunset` | bool | `true` | Sonnenaufgang/-untergang anzeigen |
| `forecast_show_day_comparison` | bool | `true` | Untere Wochenleiste |
| `forecast_day_count` | 2…7 | 4 | Wieviele Tage im Vergleich |

#### L.6.2 — Sensoren

| Feld | Wertebeispiel | Beschreibung |
|---|---|---|
| `forecast_today_sensor` | `sensor.forecast_today_kwh` | Heute-Vorhersage in kWh |
| `forecast_tomorrow_sensor` | `sensor.forecast_tomorrow_kwh` | Morgen |
| `forecast_day_3_sensor` … `forecast_day_7_sensor` | optional | Weitere Tage |
| `forecast_hourly_attribute` | `sensor.forecast.attributes.watt_hours` | Pfad zum 24h-Array (für Glocke) |
| `forecast_sunrise_sensor` | `sun.sun` (next_rising attribute) | Sonnenaufgang |
| `forecast_sunset_sensor` | `sun.sun` (next_setting attribute) | Sonnenuntergang |

#### L.6.3 — Lernsystem (Ist-Soll-Korrektur, evcc-Stil)

| Feld | Werte | Default | Beschreibung |
|---|---|---|---|
| `forecast_learning_enabled` | bool | `false` | Lernsystem ein/aus |
| `forecast_actual_today_sensor` | sensor | — | **MUSS reine PV-Erzeugung sein!** Nie Netzeinspeisung. |
| `forecast_learning_window_days` | 3…14 | 7 | Gleitendes Mittel über X Tage |
| `forecast_learning_clamp_min` | 0.1…1.0 | 0.3 | Untere Grenze für Scale-Faktor |
| `forecast_learning_clamp_max` | 1.0…5.0 | 2.0 | Obere Grenze |
| `forecast_learning_storage` | `localStorage` / `ha_helper` | `localStorage` | Wo Faktoren persistiert werden |
| `forecast_learning_helper_entity` | input_number.X | — | Bei `ha_helper`: Welcher Helper |
| `forecast_learning_reset_button` | Button | — | Setzt gespeicherte Faktoren zurück |

### L.7 — Lern-Algorithmus

**Pseudocode (was die Card intern macht):**

```
// Pro Tag, einmal nach Sonnenuntergang oder um 23:59:
function captureTodaysFactor() {
  const istKwh = readSensor(forecast_actual_today_sensor);
  const sollKwh = readStoredValue("forecast_today_morning"); // Wert von 06:00
  if (sollKwh <= 0) return; // keine Vorhersage, kein Faktor
  let factor = istKwh / sollKwh;
  factor = clamp(factor, forecast_learning_clamp_min, forecast_learning_clamp_max);
  appendToHistory(today, factor);
}

// Beim Anzeigen jeder Vorhersage:
function adjustForecast(rohWert) {
  if (!forecast_learning_enabled) return rohWert;
  const recentFactors = getLastNDays(forecast_learning_window_days);
  if (recentFactors.length < 2) return rohWert; // zu wenig Daten
  const avgFactor = average(recentFactors);
  return rohWert * avgFactor;
}
```

**Persistierung:**
- `localStorage`: Card schreibt JSON-Array `{date, factor}[]` pro Domain
- `ha_helper`: Card schreibt aktuellen Faktor in `input_number`-Helper via HA-Service-Call

**Plausibilitätsprüfung:** Wenn `istKwh > sollKwh * forecast_learning_clamp_max` oder `< sollKwh * forecast_learning_clamp_min` → Wert für diesen Tag verwerfen (mit Konsolenwarnung).

### L.8 — Wichtiger Hinweis im Editor-Hilfetext

Direkt am Feld `forecast_actual_today_sensor`:

> ⚠️ **Wichtig:** Verwende einen Sensor, der **ausschließlich die PV-Erzeugung** misst (z.B. tägliches Wechselrichter-Yield). Nutze **nie** Netzeinspeisung oder Speicher-Entladungs-Sensoren — diese werden bei Speicher-Export ins Netz fälschlicherweise als PV-Erzeugung gezählt und verfälschen die Lern-Korrektur erheblich.

### L.9 — Performance des Forecast-Moduls

- Glockenkurve: **ein** SVG-`<path>`, berechnet aus 24h-Array, statisch (keine Animation)
- Update-Frequenz: Forecast-Daten ändern sich alle 15–60 Min. Card hat eigenes Throttling für diesen Bereich (`forecast_update_throttle_ms`, Default 60000 = 1 Min.)
- Bei `view_mode: lite` wird Forecast komplett unterdrückt (kein DOM)
- Lernsystem-Berechnung: läuft nur einmal pro Tag (nach Sonnenuntergang), keine Per-Frame-Kosten

---

## Block M — Recherche-Erkenntnisse aus dem HA-Ökosystem (NEU in v2.0)

### M.1 — Untersuchte Cards

| Card | Was wir gelernt haben |
|---|---|
| `flixlix/power-flow-card-plus` | De-facto-Marktstandard. **Multi-Battery ist offenes Feature-Request (Issue #844)** — unsere Card schließt diese Lücke. Action-Configs (tap/hold/double-tap), `power_outage`-Entity sind Community-Standard. |
| `flixlix/energy-flow-card-plus` | 14 Sprachen, Energy-Collection-Binding |
| `NXJim/enhanced-power-flow-card` | **Explizite Performance-Patterns**: Debounced resize 100 ms, minimal DOM manipulation, proper cleanup on disconnect, efficient SVG rendering |
| `slipx06/sunsynk-power-flow-card` | Drei Card-Styles `compact/lite/full`, `card_height/card_width` konfigurierbar, dynamische Animationsgeschwindigkeit |
| `DanteWinters/lux-power-distribution` | Schlank, gut für Vergleich |
| `pacemaker82/Compact-Power-Card` | Battery als Array für Multi-Battery |
| `Giorgio866/lumina-energy-card` | Solar-Tracking-Bogen, bis zu 20 Custom-Flows, PV-Forecast-Integration |
| `jayjojayson/power-flux-card` (Upstream) | Unser Vorbild — Neon-Stil, Compact-View |
| `evcc-io/evcc` | **Ist-Soll-Korrektur-Algorithmus** ("Adjust solar forecast based on real production data"). Bekannte Schwäche: Speicher-Export verfälscht Lernfaktor → wir adressieren das explizit (Block L.8). |

### M.2 — Tablet-Performance-Erkenntnisse

Aus Community-Threads bestätigt: HA-Lovelace auf älteren Tablets ist ein bekanntes, breit dokumentiertes Problem. Konkrete Hebel:

- CSS-Animationen nur auf `transform` und `opacity` (GPU-komponiert, kein Reflow)
- Vermeidung von `backdrop-filter`, `filter: blur()`
- Sparsamer Einsatz von `will-change`
- DOM-Update-Minimierung via Property-Diff
- Debounced Event-Handler

Diese Erkenntnisse fließen in Block K und K.5 (Lite-Mode) ein.

### M.3 — Übernommene Vorschläge

| ID | Vorschlag | Aufgenommen als | Phase |
|---|---|---|---|
| V1 | Auto-Detect signed vs. split entity | J10, Block C | Phase 2 |
| V4 | `watt_threshold` pro Bubble | J11, E.1 | Phase 4 |
| V7 | `dynamic_flow_speed` Toggle | E.2 | Phase 3 |
| V8 | `view_mode: lite` | D2, J4 | Phase 4 |
| Performance-Patterns | NXJim-Style | Block K.3 | Phase 4 |
| Forecast-Modul | Lumina-inspiriert, evcc-Lernsystem | Block L | Phase 7a |

### M.4 — Parkierte Vorschläge (für Phase 7b/c)

| ID | Vorschlag | Geplant für |
|---|---|---|
| V2 | `grid_outage_entity` Support | Phase 7b |
| V3 | Action-Configs (tap/hold/double-tap) | Phase 7b |
| V5 | `card_width_override` | E.4, Phase 4 |
| V6 | Solar-Tracking-Bogen | Phase 7c (optional) |
| V10 | 6.+7. Verbraucher | Future Work (v2.x) |

### M.5 — Verworfene Ideen

| Idee | Warum verworfen |
|---|---|
| Lumina's 3D-Optik | Visuell überladen, tablet-feindlich, passt nicht zum klaren jayjojayson-Stil |
| Lumina Pro-Features (closed-source) | Inkompatibel mit MIT-Lizenz |
| Lumina Tech-Dashboard-View | Aufwand würde Phasenplan verdoppeln |
| Sankey-Diagramm (XtremeOwnage) | Visuell schwerer zu lesen als Bubble-Flow, nicht unser Stil |
| ML-basiertes Forecast-Modell | Übertrieben für eine Card; simpler Skalierungsfaktor (evcc-Stil) ist robuster |

---

## Phasenplan v2.0

### Phase 0 — Vorbereitung ✅ KOMPLETT

- [x] Repo-Fork
- [x] Spec v1.0 finalisiert
- [x] README mit Community-Attribution
- [x] LICENSE erweitert
- [x] Code-Header in `src/power-flux-card.js`
- [x] `hacs.json` Name
- [x] `.gitignore`

### Phase 0.5 — Spec v2.0 ← AKTUELL

- [x] Geometrie-Plan v2.0 (Block A/B)
- [x] Recherche durchgeführt (Block M)
- [x] Forecast-Modul spezifiziert (Block L)
- [x] Performance-Architektur spezifiziert (Block K)
- [ ] **Diese Spec v2.0 ins Repo committen** ← nächster Schritt nach Review

### Phase 1 — Architektur-Vorbereitung (ohne Code-Änderungen)

- [ ] Performance-Audit Upstream-Code: welche Animations-Properties? welche box-shadow-Stärken?
- [ ] CSS-Variablen-Schema-Erweiterung planen (alte Var-Namen als Alias für Battery1, neue für Venus)
- [ ] Build-System-Anpassung prüfen (kein npm-Drama erwartet)

### Phase 2 — Minimale sichtbare Änderung

- [ ] Geometrie-Update: viewBox 620, designWidth-Variable 620, Bubble-CSS-Positionen
- [ ] Zweite Battery-Bubble (Venus) als sichtbares HTML einfügen (noch ohne Logik)
- [ ] Bestehende Funktionalität (1. Battery = LG) bleibt intakt
- [ ] Auto-Detect signed vs. split entity (J10)

### Phase 3 — Pipes zur Venus

- [ ] Solar → Venus Pipe
- [ ] Venus ↔ Haus Pipe (bidirektional)
- [ ] Animationsrichtung-Logik basierend auf Vorzeichen
- [ ] `dynamic_flow_speed` Toggle (V7)

### Phase 4 — Editor-Erweiterung & Performance

- [ ] Venus-Sektion im Editor spiegeln
- [ ] Vorzeichen-Konfiguration (signed/split, Auto-Detect-Anzeige)
- [ ] `watt_threshold` pro Bubble (V4, J11)
- [ ] Globale Performance-Sektion (E.6, Block K)
- [ ] `view_mode: lite` (D2, V8)
- [ ] `card_width_override` (V5)
- [ ] NXJim-Performance-Patterns implementieren (Block K.3)
- [ ] Alle Animations-Toggles vollständig

### Phase 5 — Compact-View Doppelbalken

- [ ] Layout-Refactor für 2 Balken nebeneinander
- [ ] Farb-Logik (PV/Entladen/Grid/Idle)
- [ ] Mini-Verbraucher-Icons

### Phase 6 — Donut-Chart 4 Segmente

- [ ] Berechnung erweitern (4 Segmente: PV/LG/Venus/Netz)
- [ ] Visual erweitern (via `conic-gradient`, performance-freundlich)

### Phase 7a — PV-Forecast-Modul

- [ ] Editor-Sektion „Forecast" (Block L.6)
- [ ] SVG-Pfadgenerierung aus 24h-Array (Glockenkurve)
- [ ] Wochenvergleichs-Leiste
- [ ] Popup-Integration (Klick auf Solar)
- [ ] Inline-Mini-Variante
- [ ] Lernsystem (Ist-Soll-Korrektur, Block L.7)
- [ ] Persistierung-Auswahl (`localStorage` / `ha_helper`)
- [ ] Editor-Reset-Button

### Phase 7b — Restliche Recherche-Vorschläge

- [ ] `grid_outage_entity` Support (V2, J12)
- [ ] Action-Configs (tap/hold/double-tap, V3, J13)

### Phase 7c — Optional Polish

- [ ] Solar-Tracking-Bogen über Solar-Bubble (V6)
- [ ] Weitere Sprachen, falls Community Bedarf hat

### Phase 8 — Release

- [ ] HACS-Registrierung
- [ ] DE/EN-Übersetzungen vollständig
- [ ] README finalisieren (Screenshots, Beispiel-YAML)
- [ ] Release-Tag v1.0.0 (der Card selbst — nicht der Spec)

---

## Arbeitsweise (gilt weiter aus v1.0)

- **Define-Phase strikt von Deploy-Phase getrennt** — Spec hier, Code im Repo, jeweils vor jedem Schritt Review
- **Backup-vor-jedem-Change** — Git-Commits als Backups; jeder Commit atomar und rollback-fähig
- **Eine Änderung pro Commit** — keine Sammel-Commits
- **Vor jedem Merge in main**: Johannes-Review
- **Bei Fehler: rollback statt fix-forward**, dann neu ansetzen
- **Vor jedem `git push`: Vorschau zeigen, grünes Licht abwarten**

---

## Anhang A — Original-Codebase-Inventar (unverändert vs. v1.0)

```
src/power-flux-card.js          1517 LOC (vor Header)  / 1538 LOC (mit Fork-Header)
src/power-flux-card-editor.js   1026 LOC
src/lang-de.js                    74 LOC
src/lang-en.js                    74 LOC
dist/power-flux-card.js          128 KB (gebaut)
build.js                          78 LOC
hacs.json                          klein
LICENSE                            MIT
README.md                          (HEIMDALL-Rebrand)
docs/UPSTREAM-README.md            (Original archiviert)
```

Frameworks: lit-html, ES-Module, eigenes `build.js`. Keine externen JS-Dependencies außer lit-core.

---

## Anhang B — Wichtige Source-Code-Strukturlandmarken

### `src/power-flux-card.js`

| Zeile | Was |
|---|---|
| 1–20 | Fork-Header (eigen) |
| 22–24 | imports |
| 41 | `class PowerFluxCard extends LitElement` |
| 42 | `static get properties()` |
| 56 | `static async getConfigElement()` |
| 60 | `static getStubConfig()` |
| 113 | `setConfig(config)` |
| 207 | `static get styles()` |
| 502–510 | **Bubble-Positionen (CSS `top/left`) — zentrale Layout-Tabelle** |
| 548 | `_renderIcon(type, val, colorOverride)` |
| 605 | `_renderSVGPath(d, color)` |
| 651 | `_renderCompactView(entities)` |
| 948 | `_renderStandardView(entities)` |
| 1140–1170 | **Skalierungs-Logik (`designWidth`, `userZoom`)** |
| 1390–1406 | **Pipe-d-Strings (Bézier-Pfade)** |
| 1420 | `<svg viewBox="0 0 420 ${baseHeight}">` ← wird auf 620 geändert |
| 1518 | `render()` |

### `src/power-flux-card-editor.js`

| Zeile | Was |
|---|---|
| 27 | `class PowerFluxCardEditor extends LitElement` |
| 226 | `static get styles()` |
| 381 | `_renderSolarView(...)` |
| 446 | `_renderGridView(...)` |
| 524 | `_renderBatteryView(...)` ← die Sektion, die für Venus gespiegelt wird |
| 633 | `_renderConsumersView(...)` |
| 865 | `render()` |

---

**Ende der Spezifikation v2.0.**

Stand: 21.05.2026.
Erstellt von: Claude (im Auftrag von @JochenRi).
Review-Stand: bereit für Johannes-Freigabe.
