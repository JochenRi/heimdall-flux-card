# Features explained

*Understanding-oriented: what each part of the card means and why it exists.
For exact option names, see the [Configuration reference](configuration.md).*

## The layout

The top row holds the four **sources**: Solar, Grid, and two independent
batteries (LG and Venus). The **house** sits in the middle. Below it are up to
**seven consumer bubbles**. Animated **pipes** connect them, each labelled with
its current power.

This four-source top row is the core difference from the upstream single-battery
card: the two batteries are fully independent, each with its own state of charge
and its own pipes.

## Sources

- **Solar** — current PV production.
- **Grid** — import or export. A single signed sensor (negative = export,
  positive = import) or split import/export entities.
- **Battery 1 (LG)** and **Battery 2 (Venus)** — each shows signed power
  (positive = charging, negative = discharging) and a state of charge. A
  sign-mode selector lets you use either one signed sensor or separate
  charge/discharge sensors.

## Pipes and flow direction

Pipes animate in the direction power is flowing. Solar has **two separate
pipes** to the batteries (Solar→LG and Solar→Venus) so they never overlap, even
when only one battery is charging. With *charge-via-house* enabled, solar
charging is routed through the house instead of a direct pipe — matching setups
where the inverter reports flow that way. A pipe is hidden when its value is
below its threshold.

## The house donut

The house bubble carries a four-segment donut showing where the home's energy
comes from: **PV / Battery 1 / Battery 2 / Grid**. It has two modes:

- **Live** — the instantaneous split right now.
- **Daily-mix** — the split over today's accumulated energy (kWh), using daily
  sensors.

## Per-bubble overlays

Every bubble can carry up to four independent overlays:

### Donut (inner ring)
A filled ring representing a secondary value against a configurable maximum —
a battery's state of charge (%), a boiler temperature (°C), a tank level (cm),
and so on. You set what the maximum means per bubble.

### Charge-mix ring (outer ring)
A four-segment ring outside the bubble showing how that device's energy was
sourced — **PV / LG / Venus / Grid** — over a chosen period (day, month, or
year). Segment colors are configurable; unset colors fall back to the matching
pipe color.

### Value rotation
Instead of only the live value, a bubble can rotate through up to three
additional daily values on a timer (e.g. live power → today's kWh → today's
cost).

### Sparkline
A small inline history graph drawn inside the bubble, behind or in front of the
value.

## Side panels

The card can render arbitrary Home Assistant cards in optional **left and right
panels** beside the flow (weather, a camera, entity tiles). This needs a wide
card (full-column or panel-mode view).

On **narrow / mobile screens** the panels automatically collapse into a single
stacked column so nothing overflows. You can toggle the panels on and off by
hand in the editor's **Seiten-Panels** section — useful when you want a clean,
unobstructed view while editing the bubbles.

## Animated backgrounds

An optional animated card background in two styles — **Aurora** and
**Slow Flow** — with adjustable duration, intensity, and saturation. The
animation honors the system's *reduced motion* preference.

## Climate / temperature bubble

An optional bubble showing indoor and outdoor temperature with min/max gauge
ranges and per-line sparklines.

## Localization

The card and its editor are fully bilingual: **German and English**, following
the active Home Assistant language.
