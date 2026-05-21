# HEIMDALL Flux Card

A power flow card for Home Assistant, adapted for **dual-battery setups**.

> ⚠️ **This is a personal fork of [Power Flux Card](https://github.com/jayjojayson/power-flux-card) by [@jayjojayson](https://github.com/jayjojayson) (MIT License).**
>
> If you need a **universal single-battery solution**, please use the original card.
> The original is mature, actively maintained, and supports all standard energy-flow setups.
>
> ⭐ **Please star and support the original**: https://github.com/jayjojayson/power-flux-card
> ☕ **Support the original author**: https://www.paypal.me/quadFlyerFW

---

## Why this fork exists

The original Power Flux Card supports one battery system. This fork extends it for the specific use case of the **HEIMDALL home energy management system**, which coordinates **two independent battery systems** (LG RESU + Marstek Venus) and five large consumers (EV, washing machine, dryer, dishwasher, heat pump).

This is not a replacement for the original — it is a specialized derivative for a specific topology.

---

## Differences from upstream

| Feature                       | Upstream Power Flux Card | HEIMDALL Flux Card        |
|-------------------------------|--------------------------|---------------------------|
| Battery systems supported     | 1                        | 2 (independent)           |
| Top-row bubbles               | 3 (Solar, Grid, Battery) | 4 (Solar, Grid, Bat1, Bat2)|
| Consumer bubbles              | up to 5 (3+2 layout)     | 5 (3+2 layout, same)      |
| Pipe count                    | ~10                      | 12                        |
| Solar→Battery pipes           | 1                        | 2 (one per battery)       |
| Compact-View                  | 1 dominant-flow bar      | 2 bars side by side       |
| Donut-Chart segments          | 3 (PV/Battery/Grid)      | 4 (PV/Bat1/Bat2/Grid)     |
| Editor                        | full visual editor       | full visual editor (mirrored for 2nd battery) |
| Languages                     | DE / EN                  | DE / EN                   |
| License                       | MIT                      | MIT (preserved)           |

---

## Installation

> 🚧 **Status: Work in progress.** First functional release coming soon.
> Installation instructions will be added with the first release tag.

For now, this repository contains the upstream code with attribution adjustments. Layout and logic changes are being implemented incrementally.

---

## Configuration

The configuration interface is identical to the upstream card, with these additions:
- A **second battery section** in the visual editor
- Sign-mode selector per battery (signed power vs. split charge/discharge entities)
- Animation toggles consolidated in a single editor panel

Full configuration reference will be added with the first release.

---

## 🙏 Credits & Acknowledgements

This card is based on **[Power Flux Card](https://github.com/jayjojayson/power-flux-card)** (MIT License) — Copyright © [jayjojayson](https://github.com/jayjojayson).

The upstream project provides the **entire foundation** of this card:

- The complete card architecture (lit-html, ES modules, visual editor)
- The SVG layout system, bubble framework, and pipe animation engine
- The compact-view (evcc-inspired bar layout)
- The visual editor with all its options and translations
- The neon-glow, comet-tail, donut-chart, and tinted-background effects
- The German/English localization framework

➡️ **Please star the original**: https://github.com/jayjojayson/power-flux-card
➡️ **Support the original author**: https://www.paypal.me/quadFlyerFW

The original README, unmodified, is preserved at [`docs/UPSTREAM-README.md`](docs/UPSTREAM-README.md) for reference.

### Modifications in this fork

All modifications by **Johannes ([@JochenRi](https://github.com/JochenRi))** for the HEIMDALL home energy management system:

- Top-row layout extended from 3 to 4 bubbles (second battery added)
- New pipe paths: Solar→Battery1 and Solar→Battery2 routed as separate geometric paths
- Per-battery signed-power logic with sign-mode selector
- Compact-View redesigned as two side-by-side bars (one per battery)
- Donut-Chart extended from 3 to 4 segments
- Editor mirrored for second battery section

---

## 📄 License

MIT License — see [LICENSE](LICENSE).

This project preserves all copyright notices from the upstream project. The MIT license terms apply to both the upstream code and the modifications.
