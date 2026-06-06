# Troubleshooting

*Problem-oriented how-tos for the most common issues.*

## A change isn't showing up

The browser is caching the old card.

- **Desktop:** hard-refresh (Ctrl/Cmd+Shift+R), or open dev tools → Network →
  "Disable cache" and reload.
- **Companion App (mobile):** App settings → Companion App → **Reset frontend
  cache**, then reopen the app.

After a HACS update, also confirm the new version is installed in HACS.

## A bubble is empty / shows no value

The bubble's main sensor isn't assigned, or the entity is `unavailable`.
Open the bubble's section in the editor and check the sensor. For batteries,
check both the power and the state-of-charge sensors.

## The editor preview looks cramped

When the card has side panels enabled, the narrow editor column squeezes the
wide three-column layout. While editing the bubbles, open the editor's
**Seiten-Panels** section and switch **Seiten-Panels aktivieren** off for a
clean preview; switch it back on when you're done.

For very large editor sections, you can also use Home Assistant's
**Show code editor** button instead of the visual editor.

## The top bubbles overlap something above them on mobile

This is governed by `card_offset_y`. On a live dashboard the offset applies; in
the stacked mobile layout it is neutralized automatically. If you still see
overlap, check that the card above isn't overlapping due to a dashboard
`background` setting on the section (that is a dashboard setting, not a card bug).

## Side panels don't appear

Side panels need a wide card. Use a **panel-mode** view or a full-column
section. In a narrow column the panels intentionally collapse below/around the
flow.

## Still stuck?

Open the [bug report form](https://github.com/JochenRi/heimdall-flux-card/issues/new/choose)
with your card version, Home Assistant version, and the card YAML. For general
or single-battery questions, the [original card](https://github.com/jayjojayson/power-flux-card)
and the Home Assistant community are the better place.
