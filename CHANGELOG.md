# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/JochenRi/heimdall-flux-card/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/JochenRi/heimdall-flux-card/releases/tag/v1.0.0
