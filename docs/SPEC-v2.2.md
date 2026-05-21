# HEIMDALL Flux Card — Spezifikation v2.2

**Version:** 2.2
**Datum:** 21.05.2026 (Abend, nach Phase-3-Implementierung)
**Status:** Phase 2 + 3 vollständig deployed und live verifiziert. Bereit für Phase 4.
**Vorgänger:** SPEC-v2.1.md (Live-Verifikation), SPEC-v2.0.md (Hauptspezifikation)

---

## Änderungsprotokoll v2.1 → v2.2

Diese Spezifikation konsolidiert die Erkenntnisse einer intensiven Implementierungs-Session am 21.05.2026 nachmittags-abends. **Keine strukturellen Spec-Änderungen**, aber wichtige Detail-Präzisierungen, Workflow-Erkenntnisse und Sensor-Korrekturen.

**Was wurde in dieser Session implementiert:** 13 atomare Code-Commits (Phasen 2.1, 2.2, 3, 2.3, 3.5, 3.6, 3.7, 3.8, 3.11, 3.12, 3.13, 3.14, 3.15). Eine vollständig funktionsfähige Dual-Battery-Card mit symmetrischen Pipes, korrekter Vorzeichen-Logik, und konsistentem Editor-Toggle-Verhalten.

**Neue Erkenntnisse die in diese Spec einfließen:**
- HACS-Update-Workflow (kein automatisches Pull nach GitHub-Push)
- Custom-Element-Konflikt mit Upstream-Card (war Stundenlanges Cache-Mysterium)
- Korrekter Marstek-Sensor für signed Battery-Leistung (`batterieleistung` statt `ac_leistung`)
- Pipe-Symmetrie-Strategie (LG und Solar als Master, andere spiegeln)
- Spec-Konsistenz: pathGridToBatt entfernt, charge-via-house für beide Speicher

---

## Zweck dieses Updates

Heute haben wir die **gesamte Pipe-Geometrie** der Card umgesetzt — von 3-Bubble-Layout zu 4-Bubble-Layout, von asymmetrischen zu symmetrischen Pipes, von Upstream-Pipe-Logik zu HEIMDALL-spezifischer Speicher-via-House-Architektur. Diese Spec dokumentiert was wir gelernt haben, damit kein Wissen verloren geht und Phase 4 (Editor) auf einer soliden Basis aufbaut.

---

## Block H.2 — Sensor-Korrektur: Marstek Venus

**Bug aufgedeckt während Live-Test (21.05.2026 abends):** Sensor `marstek_venus_modbus_ac_leistung` ist **unsigned** (immer positiv). Beim Entladen lieferte er 149 W (positiv), obwohl Venus tatsächlich entlädt. Die Card interpretierte das als Ladestrom und animierte fälschlicherweise Solar→Venus.

**Korrektur:** Verwendung von `sensor.marstek_venus_modbus_batterieleistung` (signed):
- Negativ = entladend (Card-Konvention: entladend)
- Positiv = ladend (Card-Konvention: ladend)
- **Direkt mit Card-Konvention kompatibel** — kein `invert_venus` nötig

**Hinweis zum Wert-Unterschied:** `batterieleistung` ist der DC-Wert (intern), `ac_leistung` der AC-Wert (am Ausgang). Differenz durch Wirkungsgrad (~20-30 W). Für die Card-Logik ist DC der korrekte Sensor, weil er das echte Vorzeichen liefert.

**Empfehlung für Spec H (Sensor-Mapping):**

```yaml
# FALSCH (führt zu Vorzeichen-Bug):
venus: sensor.marstek_venus_modbus_ac_leistung

# RICHTIG (signed, direkt kompatibel):
venus: sensor.marstek_venus_modbus_batterieleistung
```

---

## Block O.1 — HACS-Update-Workflow (kritisch!)

**Erkenntnis aus mehrstündigem Cache-Debugging:** HACS pullt **nicht automatisch** nach jedem GitHub-Push. HACS prüft Repositories nur alle 500 Minuten via GitHub-API.

**Bewährter Workflow nach jedem Code-Push (von Entwickler an Endnutzer):**

1. **HACS öffnen** → Repository „HEIMDALL Flux Card" anklicken
2. **Drei-Punkte-Menü (⋮)** → **„Update information"**
   - Triggert manuelle Prüfung gegen GitHub
   - 5-10 Sekunden warten
3. Status zeigt jetzt **„Pending update"**
4. **⋮ → „Redownload"**
   - Lädt aktuelle Version vom Repo
5. Browser-Cache leeren:
   - **F12** → DevTools öffnen
   - **Rechtsklick auf Refresh-Knopf** → **„Cache leeren und hartes Neuladen"**
6. Test-Dashboard öffnen und verifizieren

**Wenn man Schritte 2-3 überspringt:** HACS zeigt zwar „installiert: Version X" in der UI, aber die **Datei auf der Festplatte ist noch alt**. Browser-Cache-Clear allein hilft nicht — die Datei am Server muss erst aktualisiert werden.

**Diese Workflow-Schritte sollten in das `docs/README-de.md` für Endnutzer aufgenommen werden.**

---

## Block P — Custom-Element-Konflikt mit Upstream-Card

**Wichtiger Befund:** Wenn ein Nutzer **gleichzeitig** den Upstream `jayjojayson/power-flux-card` und unseren Fork `JochenRi/heimdall-flux-card` installiert hat, kommt es zu einem **Custom-Element-Konflikt**:

Beide Cards registrieren intern denselben Custom-Element-Namen `power-flux-card`. Web Components erlauben nur eine Registrierung pro Tab. Die zuerst geladene Card gewinnt, die zweite wird mit Fehler abgewiesen:

```
Uncaught DOMException: Failed to execute 'define' on 'CustomElementRegistry':
the name "power-flux-card" has already been used with this registry
```

**Symptom für Nutzer:** Card lädt nicht oder zeigt alte Version, Browser-Cache-Clear hilft nicht.

**Diagnose:**
- Dashboard → ⋮ → Ressourcen anzeigen
- Wenn **zwei** Einträge mit URL `/hacsfiles/*power-flux*` → Konflikt

**Behebung:**
1. HACS → Upstream-Card (`jayjojayson/power-flux-card`) entfernen
2. Resource `/hacsfiles/power-flux-card/power-flux-card.js` aus Dashboard-Ressourcen löschen
3. Browser-Tab schließen, neu öffnen

**Langfristige Lösung (Phase 5+):** Custom-Element-Namen ändern von `power-flux-card` zu `heimdall-flux-card`. Das wäre ein **Breaking Change** (alle YAML-Configs müssten geändert werden), daher deferred auf v1.0.0-Release.

---

## Block A.1 — Layout-Korrektur (Bubble-Positionen)

**Phase 2.2 Implementierung** verwendete diese Bubble-Positionen:

```
.node-solar    { top: 80px;  left: 10px;  }   → cx=55,  cy=125
.node-grid     { top: 80px;  left: 170px; }   → cx=215, cy=125
.node-battery  { top: 80px;  left: 330px; }   → cx=375, cy=125
.node-venus    { top: 80px;  left: 490px; }   → cx=535, cy=125

.node-house    { top: 245px; left: 265px; }   → cx=310, cy=290

.node-c1       { top: 400px; left: 40px;  }   → cx=85,  cy=445
.node-c2       { top: 400px; left: 265px; }   → cx=310, cy=445
.node-c3       { top: 400px; left: 490px; }   → cx=535, cy=445
.node-c4       { top: 510px; left: 150px; }   → cx=195, cy=555
.node-c5       { top: 510px; left: 380px; }   → cx=425, cy=555
```

**Beobachtung zur Symmetrie:**
- Solar (cx=55) ↔ Venus (cx=535) — Spiegel-Asymmetrie: Solar 5px enger am Rand
- Grid (cx=215) ↔ LG (cx=375) — beide gleich weit von Mitte (95px Abstand)
- Verbraucher-Reihen perfekt symmetrisch um cx=310

Die kleine Asymmetrie Solar/Venus könnte in Phase 4 oder als Polish-Step korrigiert werden (Solar auf cx=85 verschieben), ist aber bisher visuell unproblematisch.

---

## Block B.1 — Pipe-Symmetrie-Strategie (Phase 3.12 Erkenntnis)

**Master-Pipes (visuell schön, nicht ändern):**
- `pathSolarHouse`: `M 55 170 Q 55 290 265 290` (Außen-Bubble → Haus-links)
- `pathBattHouse`: `M 375 170 Q 375 290 355 290` (Innen-Bubble → Haus-rechts)

**Daraus gespiegelt (Phase 3.12):**
- `pathVenusHouse`: `M 535 170 Q 535 290 355 290` (Spiegel von Solar→Haus, Charakter-treu)
- `pathGridImport`: `M 215 170 Q 215 290 265 290` (Spiegel von LG→Haus)
- `pathHouseExport`: `M 265 290 Q 215 290 215 170` (gespiegelter Rückweg)

**Symmetrie-Prinzip:**
- Alle vier Pipes haben **identischen Charakter**: vertikaler Bogen mit Kontrollpunkt direkt unter Source-Bubble, dann horizontales Abbiegen zum Haus-Anker
- Außen-Bubbles (Solar/Venus) → Haus-Außen-Anker
- Innen-Bubbles (Grid/LG) → Haus-Außen-Anker (gleicher Anker wie Außen — Bogen-Endpunkt symmetrisch)

**Aktualisierte Pipe-Pfade in v2.2 Codebase (nach allen Korrekturen):**

```js
// Top-Reihe Solar-Arcs (flach, innerhalb viewBox, sichtbar)
pathSolarBatt:  "M 55 80 Q 215 35 375 80"
pathSolarVenus: "M 55 80 Q 295 15 535 80"

// Bubble → Haus (gespiegelt)
pathSolarHouse: "M 55 170 Q 55 290 265 290"
pathVenusHouse: "M 535 170 Q 535 290 355 290"

// Bubble (innen) → Haus
pathGridImport: "M 215 170 Q 215 290 265 290"
pathBattHouse:  "M 375 170 Q 375 290 355 290"

// Export-Rückweg
pathGridExport: "M 100 125 Q 135 155 170 125"
pathHouseExport: "M 265 290 Q 215 290 215 170"

// Haus → Speicher (für charge_via_house)
pathHouseToBatt:  "M 355 290 Q 375 290 375 170"
pathHouseToVenus: "M 355 290 Q 535 290 535 170"

// Haus → Verbraucher
pathHouseC1: "M 265 290 Q 85 290 85 400"
pathHouseC2: "M 310 335 L 310 400"
pathHouseC3: "M 355 290 Q 535 290 535 400"
pathHouseC4: "M 265 290 Q 175 400 195 510"
pathHouseC5: "M 355 290 Q 445 400 425 510"
```

**Anzahl Pipes: 12** (wie in v2.0 spezifiziert). `pathGridToBatt` aus v2.0 entfällt definitiv (siehe Block B.2).

---

## Block B.2 — pathGridToBatt entfernt (Phase 3.13)

**Spec v2.0 Block B** sagte bereits: „Netzladung der Speicher wird über die Fluss-Kette dargestellt — `Grid→Haus + Haus→Speicher`. **Es gibt keinen direkten** `Grid→LG`/`Grid→Venus`-Pfad. Upstream-`pathGridToBatt` entfällt."

**Phase 3 (initialer Pipe-Update)** hatte den `pathGridToBatt` „erstmal behalten" mit der Notiz „removal deferred". **Phase 3.13** hat das aufgeräumt — konsistent mit der Spec-Vorgabe.

**Entfernt:**
- `pathGridToBatt` Konstante
- bg-path Render-Zeile
- flow-line Render-Zeile
- Watt-Label-Element
- `styleGridBatt` Konstante (jetzt unused)

**Beibehalten (für Compact-View und Donut-Chart):**
- `gridToBatt`-Berechnungslogik (Z. 712-735, 1134-1156)
- `gridTotalToCons`-Berechnung
- Donut-Chart `pctBatt`-Anteil

**Ergebnis:** Visuell sauberer, Spec-konsistent, beide Speicher (LG + Venus) folgen demselben Pattern.

---

## Block O.2 — Defaults für HEIMDALL-Setup (aktualisiert)

In Erweiterung zu Spec v2.1 Block O — bewährte Defaults nach Live-Implementierung:

```yaml
type: custom:power-flux-card

entities:
  # PV
  solar: sensor.evcc_pv_power

  # Grid (signed: + = import, - = export, oder grid_export separat)
  grid: sensor.evcc_grid_power

  # LG Battery (signed)
  battery: sensor.speicher_lg_leistung
  battery_soc: sensor.solaredge_i1_b1_state_of_energy

  # Marstek Venus — WICHTIG: batterieleistung, nicht ac_leistung!
  venus: sensor.marstek_venus_modbus_batterieleistung
  venus_soc: sensor.marstek_venus_modbus_soc_batterie

  # Hausverbrauch (gesamt)
  house: sensor.evcc_home_power

  # Verbraucher
  consumer_1: sensor.power_charger_em0_power           # Tesla
  consumer_2: sensor.power_waschmaschine_leistung      # Waschmaschine
  consumer_3: sensor.power_waschetrockner_leistung     # Wäschetrockner
  consumer_4: sensor.geschirrspuler_leistung           # Spülmaschine
  consumer_5: sensor.warmepumpe_power_power            # BWWP

  # Sekundärwerte
  secondary_consumer_1: sensor.tesla_soc_frozen        # Tesla SoC
  secondary_consumer_5: sensor.bwwp_temp_temperature   # BWWP Temperatur

# Verbraucher-Labels
consumer_1_label: Tesla
consumer_1_icon: mdi:ev-plug-tesla
consumer_2_label: Waschen
consumer_2_icon: mdi:washing-machine
consumer_3_label: Trockner
consumer_3_icon: mdi:tumble-dryer
consumer_4_label: Spüler
consumer_4_icon: mdi:dishwasher
consumer_5_label: BWWP
consumer_5_icon: mdi:water-boiler

# Verhalten
show_consumer_always: true        # Verbraucher immer anzeigen, auch bei 0 W
hide_inactive_flows: false        # Topologie sichtbar (gedämpfte Hintergrund-Pipes)

# HEIMDALL-spezifisch (NEU in v2.2): Speicher laden via Haus
battery_charge_via_house: true    # LG lädt aus Hausstrom (kein direkter Solar→LG-Animation)
venus_charge_via_house: true      # Venus lädt aus Hausstrom (kein direkter Solar→Venus-Animation)

# Animations-Optionen
zoom: 1
show_dashed_line: true            # Dashed-Animation aktiv
show_comet_tail: false            # Comet-Tail deaktiviert (entweder/oder mit Dashed)
show_neon_glow: false             # Neon-Glow deaktiviert (entlastet Performance)
show_donut_border: false
show_tinted_background: false
use_colored_values: false
hide_consumer_icons: false
compact_view: false
compact_details: false
```

**Begründung für `*_charge_via_house: true`:**

Im HEIMDALL-Setup speist Marstek sein Lade-Strom über das **Hausnetz** (AC-coupled). Die Spec sagt: Netzladung soll über `Grid→Haus + Haus→Speicher`-Kette visualisiert werden — keine direkte `Grid→Speicher`-Pipe. Mit `charge_via_house: true` zeigt die Card bei aktiver Ladung den Hausstrom-Pfad statt einer direkten Solar→Speicher-Animation. Das ist physisch korrekter.

---

## Block J.1 — Geklärte Detail-Entscheidungen v2.2

In Ergänzung zu Spec v2.0 Block J:

| ID | Frage | Entscheidung |
|---|---|---|
| J11 | Solar→Battery/Venus Hintergrund-Pipes bei `charge_via_house: true`? | Sichtbar als Topologie-Pfade. Style-Bedingung konsistent mit anderen Pipes (`hasSolar && hasBattery`). `hideInactive` steuert dann über `getPipeStyle` |
| J12 | Solar-Bogen-Höhe bei viewBox `0 0 620 H` | Kontrollpunkt y=35 (LG) / y=15 (Venus). Bogen-Spitze bei y=57/y=47, innerhalb viewBox, keine Clipping |
| J13 | `topShift`-Berechnung | Immer 0 wenn Top-Reihe sichtbar (Phase 3.11). Original-Logik mit conditional 50px war für HEIMDALL-Layout zu eng |
| J14 | Symmetrie der Pipes | LG→Haus und Solar→Haus als Master, Venus und Grid spiegeln. Mathematische Spiegelung um x=310 |
| J15 | Vorzeichen Marstek | `batterieleistung` (signed) statt `ac_leistung` (unsigned). Kein `invert_venus` nötig |
| J16 | `pathGridToBatt` aus Phase 3 behalten? | Nein, in Phase 3.13 entfernt. Spec v2.0 sagte schon: kein direkter Grid→Speicher-Pfad |
| J17 | `pathHouseExport` als Bogen statt Diagonale? | Ja (Phase 3.12). Symmetrisch zu `pathHouseToBatt`, konsistenter Bogen-Charakter |
| J18 | Editor-Toggle „Inaktive Röhren ausblenden" semantisch konsistent? | Ja (Phase 3.15). Alle Pipes (auch Solar-Bögen) folgen demselben `hideInactive`-Pattern |

---

## Block Q — Backup-Tags & Rollback-Strategie

Während der Phase-3-Implementierung wurden mehrere Backup-Tags gesetzt für sichere Rollbacks. Diese sind im Remote-Repo verfügbar:

| Tag | Was es bewahrt |
|---|---|
| `pre-phase-2-2026-05-21` | Vor allen Layout-Änderungen |
| `pre-phase-2-verified-2026-05-21` | Vor allen Layout-Änderungen, mit Live-Verifikation |
| `pre-rollback-to-3.8-2026-05-21` | Phase 3.10-Stand (Symmetrie-Versuche, später reverted) |
| `pre-phase-3.13-2026-05-21` | Vor Entfernung von pathGridToBatt |

**Rollback-Befehl:**
```bash
git reset --hard <TAG-NAME>
git push --force origin main
```

**HEIMDALL-Pattern:** Atomare Commits + Backup-Tags vor potenziell destruktiven Änderungen. Hat sich in dieser Session mehrfach bewährt.

---

## Block R — Phase-3 Implementierungs-Reihenfolge (gelernt)

**Was funktioniert hat:**
1. Erst Layout (viewBox, Bubble-Positionen) — minimal-invasiv
2. Pipe-Pfade gemäß neuer Geometrie — koordinatenbasiert
3. Neue Bubble (Venus) als statisches Element — Render erstmal ohne Logik
4. Sensor-Anbindung als optionale Erweiterung — backward-compatible
5. Pipes für neue Bubble — analog zu bestehenden Pipes
6. Visual-Polish und Symmetrie — am Ende

**Was nicht funktioniert hat:**
- **Phase 3.9** (verworfen, später reverted): Versuch, mehrere strukturelle Änderungen gleichzeitig zu machen (viewBox + topShift + Symmetrie). `topShift + 60` war ein Logik-Fehler, der Container-Verschiebung mit SVG-Höhe gleichsetzte
- **Lehre:** Strukturelle Änderungen (viewBox, Container-Höhe, topShift) und Geometrie-Änderungen (Pfade) **separate Commits**, nicht zusammen

---

## Block S — Anstehende Phasen (Status Stand 21.05.2026 Abend)

| Phase | Status | Nächste Schritte |
|---|---|---|
| 0–3.x | ✅ Vollständig deployed und verifiziert | Spec-Update (dieser Doku) |
| 4 — Editor | Pending | Venus-Sektion im Editor spiegeln, alle v2.1-Editor-Erweiterungen implementieren |
| 5 — Compact-View | Pending | 2-Balken-Layout für 2 Speicher |
| 6 — Donut-Chart | Pending | 4-Segment-Berechnung (PV/LG/Venus/Netz) |
| 7 — Polish | Pending | DE/EN-Übersetzungen, Screenshots, README finalisieren |
| 8 — Release v1.0.0 | Pending | HACS-Default-Registrierung, GitHub-Release-Tag |

**Vor Phase 4 abzuarbeiten:**
- Tesla `secondary_consumer_1` zeigt „unknown %" statt SoC — Sensor-State-Check (vermutlich offline-Zustand vom Tesla)
- BWWP `consumer_5` aktualisiert auf `sensor.warmepumpe_power_power` (siehe YAML in Block O.2)

---

## Block T — Endnutzer-Anleitung „Wenn die Card nicht aktualisiert"

**Diese Information sollte in `docs/README-de.md` aufgenommen werden, weil sie für jeden neuen Nutzer relevant ist.**

Wenn nach einem HACS-Update die Card unverändert aussieht oder Fehler zeigt:

**Schritt 1 — HACS forciert aktualisieren:**
1. HACS → HEIMDALL Flux Card → ⋮ → **„Update information"**
2. Status sollte auf „Pending update" wechseln
3. ⋮ → **„Redownload"**

**Schritt 2 — Browser-Cache hart leeren:**
1. F12 drücken (DevTools)
2. Rechtsklick auf Refresh-Knopf
3. **„Cache leeren und hartes Neuladen"** wählen

**Schritt 3 — Bei Custom-Element-Konflikt:**
1. Einstellungen → Dashboards → ⋮ → Ressourcen
2. Prüfen ob **zwei** `*power-flux-card*`-Einträge existieren
3. Falls ja: **Upstream-Card** (`/hacsfiles/power-flux-card/...`) löschen — nur den Fork behalten

**Schritt 4 — Letztes Mittel:**
1. HACS → HEIMDALL Flux Card komplett entfernen
2. HA-Software-Neustart (Einstellungen → System → ⋮ → Neu starten)
3. HACS → Drei-Punkte → Custom Repositories: `https://github.com/JochenRi/heimdall-flux-card`
4. Card neu installieren
5. YAML neu konfigurieren

---

## Anhang — Erkenntnis-Quellen v2.2

Diese Spec basiert auf folgenden Erkenntnissen aus der Session 21.05.2026 Abend:

1. **HACS-Doku** (https://www.hacs.xyz/docs/use/repositories/dashboard/) — Information zu „Update information" / „Redownload"
2. **HACS-Issue #53** (https://github.com/hacs/integration/issues/53) — 500-Minuten-Auto-Check-Intervall
3. **Live-Test** mit Marstek-Modbus-Integration — sensor.marstek_venus_modbus_batterieleistung als signed Quelle
4. **Custom Elements API-Doku** — Verbot mehrfacher Registrierungen pro Tab
5. **13 Code-Commits** mit jeweils empirischer Verifikation gegen HEIMDALL-Live-System

---

**Ende der Spezifikation v2.2.**

Status: Phase 2 + 3 vollständig. Spec konsolidiert. Bereit für Phase 4.
