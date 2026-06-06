# Contributing

Thanks for your interest in HEIMDALL Flux Card.

> **Please note:** this is a **personal fork** of
> [Power Flux Card](https://github.com/jayjojayson/power-flux-card) by
> [@jayjojayson](https://github.com/jayjojayson), specialized for a
> dual-battery setup. If you need a **universal, single-battery** power-flow
> card, please use and support the original — it is the better choice for
> most setups and the foundation this fork is built on.

## Reporting issues

Issues that are specific to this dual-battery fork are welcome via the
[bug report form](https://github.com/JochenRi/heimdall-flux-card/issues/new/choose).
General Home Assistant questions and feature ideas for the universal card
belong with the upstream project or the Home Assistant community.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/power-flux-card.js` | The card |
| `src/power-flux-card-editor.js` | The visual editor |
| `src/lang-de.js`, `src/lang-en.js` | German / English strings |
| `dist/power-flux-card.js` | Bundled output (committed, loaded by HACS) |
| `build.js` | Bundler |

## Building

The project uses a small custom bundler — no framework toolchain.

```bash
node build.js                    # bundles src/ into dist/power-flux-card.js
node --check dist/power-flux-card.js   # syntax-check the output
```

Always commit the rebuilt `dist/power-flux-card.js` together with your `src/`
changes — HACS loads the bundled file directly.

## Commit style

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`. Keep each commit to one
logical change.

## License

By contributing you agree that your contributions are licensed under the
[MIT License](LICENSE), the same as the upstream project.
