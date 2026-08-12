# HEIMDALL PV Forecast Card — Spezifikation v1.0

**Datum:** 2026-05-23
**Status:** Draft, awaiting review
**Repo:** https://github.com/JochenRi/heimdall-flux-card (Sub-Card im selben Repo)

## 1. Ziel

Eine zweite Lovelace-Card `heimdall-pv-forecast-card`, die im selben Repo wie `heimdall-flux-card` lebt. Sie zeigt eine PV-Forecast-Glocke mit JETZT-Marker, Tagestotal Heute/Morgen, und ein selbstlernendes Korrektursystem das die rohe Open-Meteo-Vorhersage nachjustiert basierend auf gemessenen Vortagswerten.

Variante 2 (Inline kompakt) wird in Phase 1 gebaut. Variante 1 (Popup-Vollansicht) und Variante 3 (beide) sind out-of-scope.

## 2. Architektur-Übersicht

Das System teilt sich auf zwei Welten auf — HA-Backend macht die Daten-Beschaffung und Berechnung, die Card macht nur Visualisierung.

### 2.1 Backend (in Home Assistant, kein Card-Code)

Pyscript-basiert (Python in HA). Ein Skript `pv_forecast_hourly.py` läuft stündlich, ruft die Open-Meteo-API für die drei Strings ab, wendet die Standard-PV-Formel an (Ross-Modell + STC-Korrektur), summiert die Strings, schreibt das Ergebnis in einen HA-Sensor mit Stunden-Array als Attribut.

Ein zweites Skript läuft täglich um 23:55 lokal, vergleicht heute's Forecast-Tagestotal mit dem tatsächlich gemessenen PV-Tagestotal, berechnet einen Korrekturfaktor (clamped), schiebt ihn in den 7-Tage-Ringpuffer und aktualisiert den aktiven Korrekturfaktor (Median der letzten 7).

### 2.2 Frontend (die Card)

Liest einen einzigen Sensor (`sensor.heimdall_pv_forecast_hourly`) und sein `hourly_watts`-Attribut. Multipliziert die Werte mit dem Lernsystem-Korrekturfaktor. Rendert eine SVG-Glocke. Liest Sunrise/Sunset von `sun.sun` und Tagestotal von vorhandenen Sensoren.

## 3. Backend-Spezifikation

### 3.1 Open-Meteo-API-Call

URL-Template, ein Call pro String:

```
https://api.open-meteo.com/v1/forecast?
  latitude=<lat>&longitude=<lon>
  &azimuth=<az>&tilt=<tilt>
  &minutely_15=temperature_2m,global_tilted_irradiance
  &daily=sunrise,sunset
  &forecast_days=2
  &timezone=auto
  &timeformat=unixtime
```

Drei String-Konfigurationen (aus den bestehenden Forecast.Solar-Configs übernommen):

| String | Lat | Lon | Azimut HA-Konvention | Tilt | kWp |
|---|---|---|---|---|---|
| OST | `<lat>` | `<lon>` | 90° (Ost) | 25° | 2.4 |
| SÜD | `<lat>` | `<lon>` | 180° (Süd) | 25° | 4.8 |
| WEST | `<lat>` | `<lon>` | 270° (West) | 25° | 2.4 |

Lat/Lon werden zur Laufzeit aus `zone.home` gelesen und sind hier bewusst nicht
ausgeschrieben. Alle drei Strings stehen am selben Ort.

Rate-Limit-Budget: 3 Calls pro Stunde × 24 h = 72/Tag. Open-Meteo Free Tier 10.000/Tag. Faktor 138 Reserve.

### 3.2 Watt-Berechnung pro 15-Min-Slot pro String

Direkte Portierung der Formel aus `rany2/open-meteo-solar-forecast` (MIT, geprüft):

```python
ALPHA_TEMP = -0.004       # °C⁻¹, Temperaturkoeffizient
G_STC = 1000.0            # W/m², Standard-Test-Bedingungen
TEMP_STC_CELL = 25.0      # °C
ROSS_K = 0.0342           # "Not so well cooled" (Standard für Aufdach-PV)

def calc_power_w(gti_wm2, temp_amb_c, dc_wp):
    """Berechnet die Wechselrichter-Eingangsleistung pro String in W."""
    if gti_wm2 is None or temp_amb_c is None:
        return 0
    temp_cell = temp_amb_c + gti_wm2 * ROSS_K
    power = dc_wp * (gti_wm2 / G_STC)
    power *= 1 + ALPHA_TEMP * (temp_cell - TEMP_STC_CELL)
    return max(0, int(power))
```

Wo `gti_wm2` = `global_tilted_irradiance` aus Open-Meteo, `temp_amb_c` = `temperature_2m`, `dc_wp` = kWp × 1000.

### 3.3 Slot-Aggregation auf Stunden

Open-Meteo liefert 15-Min-Slots. Wir mitteln auf 60-Min-Slots: Stunden-Watt = Durchschnitt der vier 15-Min-Slots dieser Stunde.

### 3.4 Output-Sensor

**`sensor.heimdall_pv_forecast_hourly`** (Template-Sensor, beschrieben von Pyscript via `state.set()`):

- **State:** Aktueller Stunden-Watt-Wert (W), für schnellen Zugriff
- **Attribute:**
  - `hourly_watts`: Array von 48 Stunden-Werten (heute 0–23, morgen 24–47). Werte in W.
  - `hourly_times`: Array von 48 ISO-Timestamps (UTC), korrespondierend zu `hourly_watts`
  - `sunrise_today`, `sunset_today`, `sunrise_tomorrow`, `sunset_tomorrow`: ISO-Timestamps (UTC)
  - `peak_today_time`, `peak_today_watts`: Peak-Zeitpunkt und -Wert für heute
  - `last_update`: ISO-Timestamp wann das Skript zuletzt lief
  - `correction_factor_applied`: Bool, immer false — die Card multipliziert selbst mit dem Korrekturfaktor

**Wichtig:** Das Backend liefert die **rohen** Open-Meteo-Werte. Die Lernsystem-Korrektur wird in der Card angewandt. Begründung: so kann das Lernsystem ein/aus geschaltet werden ohne Backend-Neustart, und ein Reset-Button im Editor wirkt sofort.

### 3.5 Lernsystem-Backend

**Helper-Anlage** (einmalig in Phase F.3):

- `input_number.heimdall_pv_correction_factor` — aktueller Faktor, default 1.0, min 0.3, max 2.0, step 0.01
- `input_number.heimdall_pv_correction_d0` … `_d6` — 7-Tage-Ringpuffer der Tagesfaktoren, default 1.0 jeweils
- `input_number.heimdall_pv_correction_ring_index` — aktueller Ring-Schreibindex 0..6, default 0
- `input_boolean.heimdall_pv_learning_enabled` — Master-Toggle, default on

**Daily-Update-Job** (Pyscript, triggert um 23:55 lokal):

```python
@time_trigger("cron(55 23 * * *)")
def update_correction_factor():
    if input_boolean.heimdall_pv_learning_enabled == "off":
        return

    forecast_today = float(state.get("sensor.heimdall_pv_forecast_today_kwh"))  # heute's Forecast-Total
    actual_today = float(state.get("sensor.solar_panel_production_daily"))       # gemessen

    if forecast_today < 1.0 or actual_today < 1.0:
        return  # zu wenig Daten, dunkler Wintertag, kein sinnvoller Vergleich

    raw_factor = actual_today / forecast_today
    raw_factor = max(0.3, min(2.0, raw_factor))  # clamp

    idx = int(float(state.get("input_number.heimdall_pv_correction_ring_index")))
    state.set(f"input_number.heimdall_pv_correction_d{idx}", raw_factor)
    state.set("input_number.heimdall_pv_correction_ring_index", (idx + 1) % 7)

    # Neuer aktiver Faktor = Median der letzten 7
    values = [float(state.get(f"input_number.heimdall_pv_correction_d{i}")) for i in range(7)]
    values.sort()
    median = values[3]
    state.set("input_number.heimdall_pv_correction_factor", median)
```

**Begründung Median statt Mittelwert:** robust gegen Ausreißer (z.B. ein Tag bei dem Wechselrichter ausgefallen war). Mittelwert würde durch einen 0-Tag den Faktor unrealistisch absenken.

**Begründung Clamp 0.3–2.0:** Außerhalb dieses Bereichs ist meistens ein Datenproblem schuld (Sensor unavailable, Forecast-API-Fehler), nicht echte Diskrepanz. Clamping verhindert Lernsystem-Vergiftung.

**Reset-Button** in Card-Editor ruft `script.heimdall_pv_correction_reset` auf, das alle 7 Tagesfaktoren auf 1.0 setzt + den aktiven Faktor auf 1.0 + den Ring-Index auf 0.

## 4. Frontend-Spezifikation

### 4.1 Card-Layout (Variante 2 — Inline kompakt)

Layout-Schema:

```
┌─────────────────────────────────────────────────────────┐
│ PV FORECAST                                              │
│                                                          │
│      ╱╲              JETZT                              │
│   ╱  │ ╲             4.2 kW                             │
│  /   ●  \                                                │
│ ╱    ↓   ╲           HEUTE                              │
│         ╲╲╲          53 kWh erwartet                    │
└─────────────────────────────────────────────────────────┘
```

Aufteilung: Glocke links (~60%), Werte rechts (~40%). Höhe ca. 140-160px.

### 4.2 Glocken-Rendering

SVG mit `viewBox="0 0 240 140"` (Beispielwerte, in Implementierung verfeinert).

**Datenquelle:** `state_attr('sensor.heimdall_pv_forecast_hourly', 'hourly_watts')[0..23]` (nur heute) × `states('input_number.heimdall_pv_correction_factor')`.

**X-Achse:** 24 Stunden, 0 bis 23 Uhr. Tick-Marker bei 0, 6, 12, 18, 24.

**Y-Achse:** linear, von 0 bis Tages-Peak × 1.1.

**Pfad-Konstruktion:** Polyline mit 24 Punkten, dann mit `path d="M ... L ... L ... Z"` zu einer geschlossenen Fläche. Füllung mit Solar-Farb-Gradient (gelb/orange, deckungsgleich mit Flux-Card-Solar-Farbe `--neon-yellow`).

**JETZT-Linie:** vertikale gestrichelte Linie an Position `x = (current_hour + current_minute/60) / 24 * width`. Beschriftung "JETZT" oberhalb der Linie.

**Sunrise/Sunset-Marker:** kleine vertikale Tick-Marker an entsprechenden Positionen, mit Pfeil-Icons (▲ für rise, ▼ für set).

### 4.3 Werte-Block rechts

- **JETZT:** großer Wert in W oder kW (auto-Skalierung ab 1 kW). Mit Vorzeichenanimation falls aktuelle Stunde steigend/fallend in der Glocke.
- **HEUTE:** Tagestotal aus `sensor.solar_forecast_gesamt_heute` × Korrekturfaktor, mit Suffix "erwartet" — in kWh.

Schriftgrößen orientieren sich an dropqube/pv-forecast-card (Mockup-Vorlage).

### 4.4 Optionaler Lernsystem-Block

Nicht in Variante 2 Default sichtbar. Aber wenn der Editor-Toggle `show_learning_block` aktiviert ist, erscheint unterhalb der Card eine 30px-hohe Zeile:

```
LERNSYSTEM AKTIV  ·  Korrekturfaktor: 0.87  ·  7-Tage-Mittel  ▁▂▃▅▇▆▅
```

Die Sparkline rendert die 7 Tagesfaktoren als Mini-Balken. Inaktive Tage (default 1.0, noch nie aktualisiert) werden grau dargestellt.

### 4.5 Editor-Schema

| Sektion | Feld | Typ | Default |
|---|---|---|---|
| **Sensoren** | `forecast_hourly_sensor` | entity-picker | `sensor.heimdall_pv_forecast_hourly` |
|  | `forecast_today_sensor` | entity-picker | `sensor.solar_forecast_gesamt_heute` |
|  | `live_power_sensor` | entity-picker | `sensor.heimdall_pv_forecast_summe_now` |
|  | `sun_entity` | entity-picker | `sun.sun` |
| **Anzeige** | `show_now_line` | toggle | true |
|  | `show_sunrise_sunset` | toggle | true |
|  | `show_learning_block` | toggle | false |
|  | `forecast_color` | color-picker | `#EF9F27` |
|  | `subtitle_template` | text | `Heute bis {sunset}` |
| **Lernsystem** | `learning_enabled_entity` | entity-picker | `input_boolean.heimdall_pv_learning_enabled` |
|  | `correction_factor_entity` | entity-picker | `input_number.heimdall_pv_correction_factor` |
|  | `actual_today_sensor` | entity-picker | `sensor.solar_panel_production_daily` |
|  | `reset_script` | entity-picker | `script.heimdall_pv_correction_reset` |

## 5. Phasenplan

| # | Phase | Wo | Backup-Tag? | Aufwand |
|---|---|---|---|---|
| F.0 | Spec freigeben | Doku | — | erledigt |
| F.1 | Pyscript aktivieren + `pv_forecast_hourly.py` schreiben | HA-Backend | nein (kein Repo-Code) | 90 min |
| F.2 | Verifikation: Stunden-Werte plausibel | Logs/Templates | nein | 30 min |
| F.3 | Lernsystem-Helper + Reset-Script anlegen | HA-Backend | nein | 30 min |
| F.4 | Card-Skelett, registriert sich, Editor leer | Repo | ja | 60 min |
| F.5 | Glocken-SVG-Rendering | Repo | ja | 90 min |
| F.6 | JETZT-Marker + JETZT-Wert + Tagestotal-Anzeige | Repo | ja | 45 min |
| F.7 | Sunrise/Sunset-Marker | Repo | ja | 30 min |
| F.8 | Lernsystem-Block (Korrekturfaktor + Sparkline) | Repo | ja | 60 min |
| F.9 | Daily-Update-Pyscript | HA-Backend | nein | 30 min |
| F.10 | Editor: alle Felder + Sektionen | Repo | ja | 90 min |
| F.11 | i18n DE/EN, README, Release v0.1.0 | Repo | ja | 60 min |

**Gesamt-Schätzung:** ca. 10 Stunden über mehrere Sessions.

## 6. Card-Element-Naming und Repo-Struktur

```
src/
  power-flux-card.js                  (bestehend)
  power-flux-card-editor.js           (bestehend)
  heimdall-pv-forecast-card.js        (neu, F.4)
  heimdall-pv-forecast-editor.js      (neu, F.10)
  lang-de.js                          (erweitert in F.11)
  lang-en.js                          (erweitert in F.11)
```

Card-Element-Name in Lovelace: `custom:heimdall-pv-forecast-card`. Konsistent mit dem Naming-Schema des Hauptprojekts.

Build via `build.js` wird beide Cards bundeln (anpassen in F.4).

## 7. Out-of-Scope (explizit nicht in v1.0)

- Variante 1 (Popup-Vollansicht) — später nachrüstbar in v1.1
- Variante 3 (beide) — Folgt automatisch wenn V1 fertig
- 4-Tage-Vorschau (HEUTE/MORGEN/SA/SO) — start mit 2 Tagen (3a-Entscheidung)
- Click-Handler von Solar-Bubble (4b-Entscheidung: kein Popup)
- Mehrere Standorte / mehrere PV-Anlagen
- Historische Forecast-Genauigkeits-Statistiken
- Solcast / Forecast.Solar als alternative Backends

## 8. Risiken

| ID | Risiko | Mitigation |
|---|---|---|
| R1 | Pyscript-Aktivierung verhält sich anders als erwartet | Vor F.1 testen: kleines Hello-World-Skript bringen, prüfen ob es läuft. Wenn Probleme, Fallback auf REST-Sensor mit Jinja |
| R2 | Open-Meteo liefert null-Werte bei lokalen Outages | Pyscript: bei null-State Sensor-Update überspringen, alter Wert bleibt |
| R3 | Korrekturfaktor-Berechnung wird durch Sensor-Glitch verfälscht | Clamp 0.3–2.0 + Median statt Mittelwert |
| R4 | HA-Restart während Pyscript-Cycle | Pyscript ist nach Restart automatisch wieder aktiv, nächster stündlicher Cycle springt an |
| R5 | Card-Build-Konfiguration unterstützt 2. Card nicht | F.4 inkludiert `build.js`-Anpassung explizit |
| R6 | SVG-Glocken-Rendering bei dunklen Tagen sieht hässlich aus | F.5: Wenn `max(hourly_watts) < 50W`, zeige flachen grauen Strich statt Glocke |

## 9. Open Questions (vor F.1 zu klären)

- **Q1:** Pyscript-Aktivierung verlangt nun HA-Restart laut Tool-Output. Müssen wir den Restart einplanen oder können wir Pyscript anders aktivieren? → in F.1 zu klären
- **Q2:** `sensor.heimdall_pv_forecast_today_kwh` existiert noch nicht (wird in F.1 angelegt) — wird einfach `forecast_today` als Variable im Daily-Job aus dem Pyscript-Skript direkt berechnet, statt als separater HA-Sensor

## 10. Phase-0-Abschluss-Kriterium

Diese Spec wird in `docs/SPEC-Forecast-v1.0.md` ins Repo committed als atomarer Commit `docs(forecast): add v1.0 spec for PV forecast sub-card`. Mit dem Spec-Commit beginnt F.1.

---

**Ende der Spec v1.0.**
