# Development

*For contributors. See also [`../CONTRIBUTING.md`](../CONTRIBUTING.md).*

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/power-flux-card.js` | The card |
| `src/power-flux-card-editor.js` | The visual editor |
| `src/lang-de.js`, `src/lang-en.js` | German / English strings |
| `src/yaml-mini.js` | Small YAML helper |
| `dist/power-flux-card.js` | Bundled output (committed; HACS loads this) |
| `build.js` | The bundler |
| `docs/` | This documentation, design specs, and the preserved upstream README |

## Build

The project uses a small custom bundler — no framework toolchain, no `npm install`.

```bash
node build.js                          # bundle src/ into dist/power-flux-card.js
node --check dist/power-flux-card.js   # syntax-check the bundle
```

Always commit the rebuilt `dist/power-flux-card.js` together with `src/`
changes, because HACS loads the bundled file directly.

## Rendering architecture

- The card extends `LitElement`. `static get properties()` declares the
  reactive inputs (`hass`, `config`, plus internal state).
- The flow is drawn in a `.scale-wrapper` (design width 800px) that is scaled
  via an inline CSS `transform` to fit its host. Host width is measured with a
  `ResizeObserver`.
- Bubbles are positioned with absolute CSS in `.node-*` classes using design
  coordinates; pipes are SVG paths. There is no auto-layout engine — geometry
  is explicit.
- `ha-card` uses `overflow: visible` on purpose, so the outer charge-mix rings
  can extend past the bubble edges.
- Side panels: when enabled and wide enough, `render()` builds a three-column
  grid (left panel, flow, right panel). Below a width threshold it collapses to
  a single stacked column, kept in sync with the scale calculation.

## Versioning & releases

- The project follows [Semantic Versioning](https://semver.org) and
  [Keep a Changelog](https://keepachangelog.com).
- Each release has an annotated git tag (`vMAJOR.MINOR.PATCH`).
- Publishing a GitHub Release triggers a workflow that attaches
  `dist/power-flux-card.js` to the release.

## Attribution

This is a fork of [Power Flux Card](https://github.com/jayjojayson/power-flux-card)
(MIT). The git history is preserved, so every upstream line is traceable via
`git blame`. The unmodified upstream README is kept at
[`UPSTREAM-README.md`](UPSTREAM-README.md).
