# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-08-12

Adds a fifth source bubble for a balcony plant / behind-the-meter PV array
whose panels feed a battery's DC inputs directly.

### Added

- **BKW source bubble** (`entities.bkw`) modelling an array that is invisible
  to the main solar reading because it sits behind the storage unit. Its
  output is split into three pipes: pass-through to the house, charge into
  battery 2, and export to the grid.
- **Production ring** comparing energy harvested today against energy still
  expected today (`bkw_donut_produced_today` / `bkw_donut_forecast_today`).
- **Value rotation** with three daily slots and an inline **sparkline**, both
  behaving exactly like their counterparts on the solar bubble.
- **Dedicated editor section** covering entity, label, icon, four colours,
  enable/unit/threshold, all three pipe-label offsets, rotation, ring and
  sparkline.
- Colour variables `--bkw-color`, `--pipe-bkw-color`, `--text-bkw-color` and
  `--icon-bkw-color`, tracking the solar bubble by default so a colour change
  there carries over, while remaining individually overridable.

### Changed

- **Grid export is now apportioned between producers.** Previously the whole
  measured export was subtracted from the roof, which only held while the roof
  was the sole exporter. With a second source feeding the same AC bus, the
  roof's house share collapsed to zero and its pipe disappeared. The
  battery-side feed now covers house demand first and the roof carries the
  remainder of the export.
- **Row 1 rearranged** onto a uniform 140 px grid with the middle bubble
  centred over the house, making room for the fifth source.

### Fixed

- House demand for the flow split is derived from the balance
  (generation − export) instead of the configured house sensor. A house sensor
  that drops out intermittently is tolerable as a displayed value, but as a
  computation input every dropout propagated into all pipes at once and the
  card flickered.

## [1.0.0] - 2026-06-06

First stable release. A dual-battery adaptation of
[Power Flux Card](https://github.com/jayjojayson/power-flux-card) by
[@jayjojayson](https://github.com/jayjojayson) (MIT), built for the HEIMDALL
home energy management system.

### Added

- Four sources in the top row: Solar, Grid, and two independent batteries
  (LG + Venus), each with its own state of charge and signed power.
- Up to seven consumer bubbles (e.g. EV, washing machine, dryer, dishwasher,
  heat pump, climate, pump), each individually enabled and configured.
- House bubble with a 4-segment donut (PV / Battery 1 / Battery 2 / Grid),
  in a live mode and a daily-mix (kWh) mode.
- Per-bubble overlays, configured independently for every bubble: an inner
  donut with a configurable maximum, an outer charge-mix ring (PV / LG /
  Venus / Grid over day, month, or year, with configurable segment colors),
  a value rotation between up to three daily sensors, and an inline sparkline.
- Separate Solar to Battery 1 and Solar to Battery 2 pipes, routed as two
  distinct paths that never overlap.
- Signed-power logic per battery (positive = charging, negative =
  discharging) with a sign-mode selector.
- Animated card backgrounds (Aurora, Slow Flow), honoring
  `prefers-reduced-motion`.
- Optional side panels (left and right) that collapse into a single stacked
  column on narrow / mobile screens.
- Full visual editor with collapsible sections for every bubble.
- German / English localization.

[Unreleased]: https://github.com/JochenRi/heimdall-flux-card/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/JochenRi/heimdall-flux-card/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/JochenRi/heimdall-flux-card/releases/tag/v1.0.0
