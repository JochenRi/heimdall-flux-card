# HEIMDALL Flux Card — Spezifikation v2.1

**Version:** 2.1
**Datum:** 21.05.2026
**Status:** Definiert, freigegeben, bereit für Phase 2 (erste Code-Änderung)
**Vorgängerversion:** v2.0 vom 21.05.2026

**Verhältnis zu v2.0:** v2.1 ergänzt v2.0 um Erkenntnisse aus der ersten Live-Installation der Card in einem produktiven HEIMDALL-System. Alle Entscheidungen aus v2.0 gelten weiter, sofern nicht hier explizit überschrieben oder korrigiert. Diese Datei ist als **Delta-Dokument** zu lesen — die vollständige v2.0 bleibt der Referenz-Korpus.

---

## Änderungsprotokoll v2.0 → v2.1

| Bereich | Art | Was |
|---|---|---|
| Block H.1 (Sensor-Mapping) | **Präzisierung** | SoC-Mapping heißt explizit `battery_soc`; `battery_charge` ist im Upstream-Schema die Lade-Watt-Variable für split-entity-Setups (war in v2.0 grundsätzlich korrekt, aber nicht prominent genug hervorgehoben — dadurch entstand in der ersten Beispiel-YAML eine Verwechslung). |
| Block C / E.1 | **Erweiterung** | Vorzeichen-Schalter pro Speicher-Bubble im Editor (signed/split/auto/invert) |
| Block C / E.1 | **Erweiterung** | Einheiten-Drop-down pro Bubble im Editor (auto/W/kW/custom) |
| Block C / E.1 | **Erweiterung** | `show_label_with_secondary` Toggle pro Verbraucher-Bubble |
| Block K (Performance) | **Empfehlung** | Default für `update_throttle_ms` empfohlen als 5000 ms bei 30-s-Sensoren wie evcc |
| Block L (Forecast) | **Konkretisierung** | `forecast_data_mode` (synthetic/attribute/off) als Editor-Dropdown. evcc-Forecast nicht extrahierbar dokumentiert. |
| **Neu Block N** | **Live-Verifikation** | HEIMDALL-Referenz-Sensor-Mapping nach Live-Installation verifiziert |
| **Neu Block O** | **Bewährte Defaults** | `show_consumer_always: true` als HEMS-Default-Empfehlung |

---

## Zweck dieses Updates

Während der ersten Live-Installation der Card in einem produktiven HEIMDALL-System wurden konkrete Erkenntnisse gewonnen, die das Spec-Schema präzisieren:

1. Das Upstream-Sensor-Schema unterscheidet `battery_soc` (Prozent) von `battery_charge` (Watt-Ladeleistung). Beide Felder sind in v2.0 Block H.1 erwähnt, aber in der ersten Beispiel-YAML aus dem Live-Setup wurden sie verwechselt. v2.1 hebt die Unterscheidung explizit hervor.
2. Reale Sensor-Werte aus produktiven HEMS-Systemen (evcc, Marstek Modbus, SolarEdge) bringen Einheiten- und Vorzeichen-Heterogenität mit, die der Editor abfangen muss — ohne Hardcoding.
3. Sekundärsensoren und Labels stehen im Upstream im Verdrängungswettbewerb (entweder/oder). Das ist als UX-Limit erkannt; Spec definiert Editor-Toggle.
4. Forecast-Daten von evcc sind **nicht** an HA exportiert — die Card muss die Glocke aus den verfügbaren HA-nativen Forecast-Sensoren selbst rendern.

Diese Erkenntnisse fließen in v2.1 ein.

---

## Block H.1 — Präzisierung: Sensor-Mapping (Ergänzung zu v2.0)

### Korrektes Upstream-Schema (explizit)

v2.0 Block H.1 hat die Felder grundsätzlich korrekt aufgeführt, aber nicht prominent zwischen `battery_soc` (Prozent) und `battery_charge` (Watt) unterschieden. Die Live-Verifikation hat gezeigt, dass diese Unterscheidung **bei der Beispiel-YAML-Konfiguration** kritisch ist — bei Verwechslung erscheint die Card mit „0%" SoC statt 80%, weil die Card `battery_charge` als Lade-Watt interpretiert.

### Verbindliches Schema ab v2.1

| Card-Feld | Bedeutung | Einheit | Beispiel-Wert |
|---|---|---|---|
| `entities.battery` | Speicher-Leistung (signed: + lädt, − entlädt) | W oder kW | `sensor.speicher_lg_leistung` |
| `entities.battery_soc` | Ladezustand des Speichers | Prozent (0–100) | `sensor.solaredge_i1_b1_state_of_energy` |
| `entities.battery_charge` | (Optional) Separater Lade-Watt-Sensor für split-entity-Setups | W | nicht in HEIMDALL verwendet |
| `entities.battery_discharge` | (Optional) Separater Entlade-Watt-Sensor für split-entity-Setups | W | nicht in HEIMDALL verwendet |

**Wichtig:** In der ersten Beispiel-YAML, die während der Live-Installation getestet wurde, war `battery_charge` versehentlich auf einen SoC-Sensor gemappt. Das führte zu „0%"-Anzeige statt korrektem SoC. Spec v2.0 Block H.1 selbst war konsistent, aber nicht prominent genug. v2.1 macht den Unterschied explizit.

### Korrigierte v2.0 Block H.1 Liste

```yaml
# Card-Defaults im Editor (Platzhalter, vom Nutzer überschreibbar):
sensor.solar_power
sensor.grid_power
sensor.battery_1_power           # Leistung (signed) — Card-Feld: battery
sensor.battery_1_soc             # SoC in % — Card-Feld: battery_soc
sensor.battery_2_power           # Leistung (signed) — Card-Feld: venus
sensor.battery_2_soc             # SoC in % — Card-Feld: venus_soc
sensor.home_consumption
sensor.consumer_1_power … sensor.consumer_5_power
# Sekundärsensoren pro Bubble (optional, im Editor als secondary_X gemappt)
```

---

## Block C/E.1 — Erweiterung: Vorzeichen-Schalter pro Speicher

### Problem in v2.0

v2.0 sagte „Auto-Detect signed vs. split entity" auf Basis Anzahl Entitäten. In der Live-Verifikation hat sich gezeigt: Auch bei signed Sensoren ist die **Konvention** nicht standardisiert:

- `sensor.evcc_battery_power = -1975` → evcc-Konvention: **negativ = entladend**
- `sensor.marstek_venus_modbus_ac_leistung = -1975` (AC) → vermutlich auch negativ = entladend an AC-Seite
- `sensor.marstek_venus_modbus_batterieleistung = +1875` → **positiv = entladend** an DC-Seite (umgekehrt!)

Auto-Detect kann das nicht zuverlässig erkennen. Daher: **Editor-Drop-down pro Speicher**.

### Editor-Feld `<storage>_sign_mode` (z.B. `lg_sign_mode`, `venus_sign_mode`)

```
Wertebereich:
  - "auto"                  → Card versucht aus Sensor-Namen abzuleiten (Heuristik)
  - "positive_is_charge"    → + = Laden, − = Entladen (Card-interne Konvention)
  - "positive_is_discharge" → + = Entladen, − = Laden (Card invertiert intern)
  - "invert"                → Alias zu positive_is_discharge

Default: "auto"
```

### Editor-Implementierung

```
┌──────────────────────────────────────┐
│  Speicher LG                          │
│                                       │
│  Hauptsensor: [sensor.speicher_lg_…] │
│  SoC-Sensor:  [sensor.solaredge_…_  │
│                state_of_energy]      │
│                                       │
│  Vorzeichen-Konvention:               │
│    ( ) Auto (Standardheuristik)      │
│    (•) + = Laden, − = Entladen       │
│    ( ) + = Entladen, − = Laden       │
│                                       │
│  [✓] Sensor invertieren (zusätzlich) │
└──────────────────────────────────────┘
```

Card-interne Konvention bleibt: **positiv = laden**, **negativ = entladen**. Editor-Schalter mappt User-Sensor-Konvention darauf.

---

## Block C/E.1 — Erweiterung: Einheiten-Drop-down pro Bubble

### Problem in v2.0

v2.0 ging implizit von „alle Werte in Watt" aus. Live-Verifikation zeigte: Quellen mischen die Einheit:

- `sensor.evcc_pv_power = 5567` → **Watt** (`unit_of_measurement: W`)
- `sensor.evcc_tesla_mobile_connector_charge_power = 0.0015` → **Kilowatt** (`unit_of_measurement: kW`)
- `sensor.marstek_venus_modbus_batterieleistung = 1875` → **Watt**

Card-Anzeige wird falsch um Faktor 1000, wenn die Einheit nicht erkannt wird.

### Editor-Feld `<bubble>_unit_mode`

```
Wertebereich:
  - "auto"   → Card liest unit_of_measurement-Attribut des Sensors (Default)
  - "W"      → Wert direkt als Watt verwenden
  - "kW"     → Wert × 1000 für interne Berechnung
  - "custom" → benutzerdefinierter Multiplikator über zweites Feld

Default: "auto"
```

### Card-Interne Logik

```javascript
function readValueAsWatts(stateObj, config) {
  const rawValue = parseFloat(stateObj.state);
  const mode = config.unit_mode ?? "auto";
  switch (mode) {
    case "auto":
      const unit = stateObj.attributes.unit_of_measurement || "W";
      return (unit === "kW" || unit === "Kilowatt") ? rawValue * 1000 : rawValue;
    case "W":     return rawValue;
    case "kW":    return rawValue * 1000;
    case "custom": return rawValue * (config.unit_multiplier ?? 1);
  }
}
```

**Wichtig:** Diese Logik wird **pro Bubble** angewendet, nicht global. Solar kann in W konfiguriert sein, Tesla in kW — Card normalisiert beide intern auf W.

### Anwendung auf bestehende Upstream-Felder

Upstream hat bereits `consumer_X_unit_kw` (bool). Das wird in v2.1 erweitert:
- Wenn `unit_mode` gesetzt ist → neuer Mechanismus aktiv
- Wenn nur `consumer_X_unit_kw` gesetzt (Legacy) → wie Upstream
- Default: `auto` greift, `consumer_X_unit_kw` als Fallback

So bleibt **Backward Compatibility** für Bestandskonfigurationen.

---

## Block E.1 — Erweiterung: `show_label_with_secondary` Toggle

### Beobachtetes Verhalten in v2.0/Upstream

Aktuell zeigt die Card pro Verbraucher-Bubble **entweder** den Label-Text **oder** den Sekundärwert — nicht beides. Code-Stelle: `renderSecondaryOrLabel` in `power-flux-card.js` Z. 1330.

```javascript
if (hasSecondary) {
  return secondaryValue;    // z.B. "55%" für Tesla SoC
}
return labelText;            // z.B. "TESLA"
```

**Realer Effekt:** Bei aktivierten Sekundärsensoren verschwinden Labels wie „TESLA" oder „BWWP" — User sieht nur noch Werte ohne Beschriftung. Das ist über das Icon kompensierbar, aber UX-suboptimal.

### Editor-Feld `consumer_<N>_show_label_with_secondary`

```
Default: false (Upstream-Verhalten beibehalten)
true:    Label + Sekundärwert in zwei Zeilen anzeigen (Label oben klein, Wert größer)
```

Spec Block E.1 erweitert pro Verbraucher um diesen Toggle.

### Implementierungs-Hinweis

Bubble-Höhe muss bei Bedarf um 10–15 px wachsen, wenn 3 Zeilen statt 2 angezeigt werden (Label klein, Sekundärwert, Hauptwert). Da Bubbles in v2.1 100×100 px sind, ist genug Platz. Bei Kompakt-View ggf. abschalten.

---

## Block K — Performance: Empfehlung für Default `update_throttle_ms`

### Erkenntnis aus Live-System

evcc-Sensoren refreshen alle 30 s. Marstek-Modbus alle ~1 s. SolarEdge ~10 s. **Mix führt zu unregelmäßigen Render-Bursts**.

### Empfehlung

Default-Wert für `update_throttle_ms` von **0** (in v2.0) auf **5000 ms** ändern für die Spec-Empfehlung. Begründung:

- Bei 5-s-Throttling verarbeitet die Card maximal 12 Updates/Min statt potentiell 60+
- Performance auf älteren Tablets dramatisch verbessert
- Visuell für den User nicht spürbar (PV-Werte ändern sich nicht schneller als ihre Refresh-Rate)
- Editor-konfigurierbar bleibt — Power-User kann auf 0 setzen für Live-Echtzeit-Anzeige

### Empfehlung für Phase 4

Sammel-Toggles erweitern:

```
performance_mode:
  - "full"      → update_throttle_ms: 0
  - "balanced"  → update_throttle_ms: 1000   (Default)
  - "low"       → update_throttle_ms: 5000
  - "tablet"    → update_throttle_ms: 10000  (NEU für sehr alte Tablets)
```

---

## Block L — Forecast: `forecast_data_mode` Editor-Dropdown

### Recherche-Befund

evcc rendert eine sehr schöne Forecast-Glocke (Screenshot aus User-Vorlage), aber **exportiert die Daten nicht als HA-Sensor**. Quelle ist Forecast.Solar/Solcast/Open-Meteo — dieselbe Quelle, die auch HA direkt nutzt.

### Drei Implementierungs-Pfade in der Card

```
forecast_data_mode:
  - "off"        → Forecast-Modul deaktiviert (Default falls keine Sensoren)
  - "synthetic"  → Card berechnet Gauß-Glocke aus Tagestotal + Spitzenzeit + Sonnenstand
  - "attribute"  → Card liest 24h-Watt-Array aus Sensor-Attribut

Default: "synthetic" (wenn forecast_today_sensor gesetzt)
```

### Algorithmus „synthetic"

```python
peakHour     = sensor.power_highest_peak_time_today.hour
sunriseHour  = sun.sun.attributes.next_rising.hour
sunsetHour   = sun.sun.attributes.next_setting.hour
todayTotal   = sensor.forecast_today_sensor.state  # kWh
peakPower    = todayTotal * 2 / (sunsetHour - sunriseHour)  # W-Peak (Gauß-Approximation)
sigma        = (sunsetHour - sunriseHour) / 4
nowPower     = sensor.evcc_pv_power  # für Live-Punkt auf der Kurve

for hour in 0..23:
  glockenwert = peakPower * exp(-((hour - peakHour)^2) / (2 * sigma^2))
```

### Algorithmus „attribute"

Card liest aus `forecast_hourly_attribute` ein Array `[{start, end, value}, ...]` (Stunden-Watt). Format-kompatibel zu evcc und Solcast.

### Spec-Defaults für HEIMDALL

```yaml
forecast_data_mode: synthetic
forecast_today_sensor: sensor.solar_forecast_gesamt_heute   # 20.333 kWh
forecast_peak_time_sensor: sensor.power_highest_peak_time_today
forecast_sunrise_sensor: sun.sun  # attribute: next_rising
forecast_sunset_sensor: sun.sun  # attribute: next_setting
forecast_live_sensor: sensor.evcc_pv_power
```

---

## Block N — Live-Verifikation: HEIMDALL-Referenz-Sensor-Mapping

Nach erster Installation der Card in einem produktiven HEIMDALL-System wurde das folgende Sensor-Mapping verifiziert. Es dient als Referenz für andere Multi-Speicher-HEMS-User.

### Verifizierte Sensoren (Stand 21.05.2026, HEIMDALL bei @JochenRi)

| Card-Feld | Sensor | Einheit | Wert (Beispiel) | Anmerkung |
|---|---|---|---|---|
| `solar` | `sensor.evcc_pv_power` | W | 5567 | evcc-Aggregat über 3 PV-Anlagen |
| `grid` | `sensor.evcc_grid_power` | W | -1640 (Export) | Signed, neg = Export |
| `battery` (LG) | `sensor.speicher_lg_leistung` | W | 0 (eingefroren) | Signed |
| `battery_soc` (LG) | `sensor.solaredge_i1_b1_state_of_energy` | % | 80 | |
| `venus` (geplant Phase 2) | `sensor.marstek_venus_modbus_ac_leistung` | W | -1975 (entladend) | Signed |
| `venus_soc` (geplant Phase 2) | `sensor.marstek_venus_modbus_soc_batterie` | % | 58 | |
| `house` | `sensor.evcc_home_power` | W | 1229 | |
| `consumer_1` (Tesla) | `sensor.power_charger_em0_power` | W | 2 | Shelly EM, direkt in W (besser als evcc kW) |
| `secondary_consumer_1` | `sensor.tesla_soc_frozen` | % | 55 | HEIMDALL-eigener Tesla-SoC |
| `consumer_2` (Waschen) | `sensor.power_waschmaschine_leistung` | W | 0.3 | Sehr klein → `show_consumer_always` |
| `consumer_3` (Trockner) | `sensor.power_waschetrockner_leistung` | W | 580 | |
| `consumer_4` (Spüler) | `sensor.geschirrspuler_leistung` | W | 0.8 | Sehr klein → `show_consumer_always` |
| `consumer_5` (BWWP) | `sensor.bwwp_power_pv` | W | 749 | PV-Anteil; alternativ `bwwp_energie_gesamt` für Gesamt |
| `secondary_consumer_5` | `sensor.bwwp_temp_temperature` | °C | 64.8 | |

### Forecast-Sensoren (Phase 7a)

| Card-Feld | Sensor | Einheit | Wert (Beispiel) |
|---|---|---|---|
| `forecast_today_sensor` | `sensor.solar_forecast_gesamt_heute` | kWh | 20.333 |
| `forecast_tomorrow_sensor` | `sensor.solar_forecast_gesamt_morgen` | kWh | 28.6 |
| `forecast_peak_time_sensor` | `sensor.power_highest_peak_time_today` | timestamp | 2026-05-21T10:00:00+00:00 |
| `forecast_live_sensor` | `sensor.evcc_pv_power` ODER `sensor.power_production_now` | W | 5567 / 412 |
| `forecast_learning_actual_sensor` | `sensor.solar_panel_production_daily` | kWh | 30.676 (kumulierte heutige PV-Erzeugung) |

### Was fehlt in HEIMDALL (für Phase 7a relevant)

- **Kein 24h-Watt-Array-Attribut** in Forecast.Solar-Sensoren → `synthetic` Modus erforderlich, oder Solcast/Open-Meteo nachinstallieren
- **Trockner-Sensor war zunächst unklar** — `sensor.power_waschetrockner_leistung` als korrekter Sensor identifiziert
- **Tesla via evcc lieferte kW (Skalierungsproblem)** — durch `sensor.power_charger_em0_power` (Shelly EM, W) ersetzt

---

## Block O — Bewährte Defaults für HEMS-Kontext

Aus der Live-Erprobung haben sich einige Default-Werte als sinnvoll erwiesen, die vom Upstream-Default abweichen:

| Feld | Upstream-Default | HEIMDALL-Empfohlener Default | Begründung |
|---|---|---|---|
| `show_consumer_always` | `false` | **`true`** | Stand-by-Verbraucher (Waschmaschine 0.3 W) sollen sichtbar bleiben |
| `update_throttle_ms` | `0` (kein Throttling) | **`5000`** | 5-s-Throttling für 30-s-evcc-Sensoren |
| `hide_inactive_flows` | `true` | `true` (unverändert) | Pipes nur bei aktivem Fluss |
| `show_neon_glow` | `true` | `true` (unverändert) | Visuell schön, performant |
| `show_comet_tail` | `false` | `false` (unverändert) | Default-aus für Tablet-Performance |
| `forecast_data_mode` | — (neu) | `synthetic` | Funktioniert ohne Setup-Aufwand |

### Spec-Empfehlung für Default-Konfiguration in `getStubConfig()`

Wird in Phase 4 (Editor-Erweiterung) implementiert. Bis dahin: README-Doku mit empfohlenen YAML-Beispielen.

---

## Konsolidierte Editor-Erweiterungen für Phase 4

Auf Basis dieser v2.1-Erkenntnisse ergibt sich folgende konkrete Editor-Erweiterung für Phase 4:

### Pro Speicher-Bubble (LG, Venus)

```
[Hauptsensor (signed Leistung)]
[SoC-Sensor (Prozent)]
[Vorzeichen-Konvention: auto / +laden / +entladen / invert]
[Einheit: auto / W / kW / custom]
[Custom-Multiplikator: <wenn Einheit=custom>]
[watt_threshold (Auto-kW-Umschaltung)]
[Glow on/off]
[Tinted Background on/off]
```

### Pro Verbraucher-Bubble (c1–c5)

```
[Hauptsensor]
[Sekundärsensor (optional)]
[Label]
[Icon (MDI-Picker)]
[Farbe]
[Show label with secondary value: bool]   # NEU in v2.1
[Einheit: auto / W / kW / custom]         # NEU in v2.1
[Custom-Multiplikator]
[watt_threshold]
[show_when_zero / show_consumer_always]   # promoviert in eigene Sektion
```

### Globale Sektion „Verhalten"

```
[show_consumer_always: bool, Default: true für HEMS]
[hide_inactive_flows: bool, Default: true]
[update_throttle_ms: int, Default: 5000]
[max_animated_pipes: int, Default: 12]
[performance_mode: full/balanced/low/tablet, Default: balanced]
```

---

## Phasenplan v2.1 — keine strukturellen Änderungen

Phasenplan aus v2.0 bleibt unverändert in Reihenfolge und Phasen-Inhalten. v2.1 ist eine Detail-Präzisierung, keine Umstellung.

**Stand der Phasen am 21.05.2026, 14:00 (lokal):**

- ✅ Phase 0 — Vorbereitung (Repo-Fork, README, LICENSE, hacs.json) — KOMPLETT
- ✅ Phase 0.5 — Spec v2.0 + Build-System-Konvention — KOMPLETT
- ✅ Phase 0.7 — Live-Installation in HEIMDALL und Verifikation — KOMPLETT (diese v2.1 ist deren Ergebnis)
- ⏭️ **Phase 1 — Architektur-Vorbereitung (Performance-Audit, CSS-Schema, Build-Verifikation) — KOMPLETT** (im Chat-Kontext dokumentiert)
- ⏭️ **Phase 2 — Erste Code-Änderung (viewBox 420→620, Venus-Bubble hinzu) — STARTET ALS NÄCHSTES**

---

## Konsequenzen für Phase 2 (nächster Code-Eingriff)

Phase 2 wird wie in v2.0 geplant durchgeführt. v2.1-Korrekturen wirken sich auf Phase 2 minimal aus:

1. **Geometrie-Umstellung** (Block A aus v2.0) — unverändert übernommen
2. **Venus-Bubble einfügen** — verwendet `entities.venus` (Leistung) und `entities.venus_soc` (SoC, NICHT `venus_charge`)
3. **Editor-Sektion „Venus" einbauen** — spiegelt die LG-Sektion mit der korrigierten Feldnomenklatur

Phase-2-Detail-Plan: siehe v2.0 Phasenplan plus diese v2.1 Korrektur zur Feldbenennung.

---

## Anhang — Erkenntnis-Quellen v2.1

1. **Live-Installation 21.05.2026 13:00–14:00** im HEIMDALL-System (@JochenRi): Card via HACS installiert, YAML schrittweise verfeinert, Verhalten visuell verifiziert.
2. **HA-Sensor-Inventur via MCP-Tools**: alle relevanten Power-/SoC-/Forecast-Sensoren des HEIMDALL-Systems durchgekämmt und gegen Card-Anforderungen abgeglichen.
3. **Code-Audit `src/power-flux-card.js`**: zentrale Render- und Mapping-Funktionen gelesen, um Schema-Realität zu verifizieren (statt aus dem Hut zu raten).
4. **Recherche evcc-Forecast-Export**: bestätigt nicht möglich; evcc UI ist evcc-intern, keine HA-Sensoren mit `forecast`-Attribut.

---

**Ende der v2.1-Spezifikation.**

Stand: 21.05.2026, 14:00 lokal.
Erstellt von: Claude (im Auftrag von @JochenRi), Vertrauensmodus.
Review-Stand: bereit für Commit.
