# Installation

*A how-to guide for installing and updating the card.*

## HACS (custom repository) — recommended

This card is distributed as a **HACS custom repository**.

1. Open **HACS** in Home Assistant.
2. Open the three-dot menu (top right) → **Custom repositories**.
3. Add `https://github.com/JochenRi/heimdall-flux-card` with category **Dashboard**.
4. Search for **HEIMDALL Flux Card** and click **Download**.
5. Reload your browser.

HACS registers the resource automatically at
`/hacsfiles/heimdall-flux-card/power-flux-card.js` (type `module`).

One-click add (opens your Home Assistant):
<https://my.home-assistant.io/redirect/hacs_repository/?owner=JochenRi&repository=heimdall-flux-card&category=dashboard>

## Manual installation

1. Download `power-flux-card.js` from the
   [latest release](https://github.com/JochenRi/heimdall-flux-card/releases/latest).
2. Copy it to `config/www/heimdall-flux-card/power-flux-card.js`.
3. Register it as a dashboard resource — **Settings → Dashboards → ⋮ → Resources → Add resource**:
   - URL: `/local/heimdall-flux-card/power-flux-card.js`
   - Type: **JavaScript Module**

### YAML-mode dashboards

If your Lovelace is in YAML mode, add the resource yourself:

```yaml
resources:
  - url: /hacsfiles/heimdall-flux-card/power-flux-card.js  # HACS install
    type: module
  # or, for a manual install:
  # - url: /local/heimdall-flux-card/power-flux-card.js
  #   type: module
```

## Updating

- **HACS:** open the card in HACS and click **Update** when a new release is
  offered. Then hard-refresh the browser (or, in the Companion App, reset the
  frontend cache).
- **Manual:** download the new `power-flux-card.js`, replace the file, and
  hard-refresh.
