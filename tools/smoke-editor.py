#!/usr/bin/env python3
"""
Editor smoke test.

Loads the built editor in Node with minimal stubs and calls render() for the
main view and every sub-view. A view that throws renders as an empty page in
Home Assistant -- no error card, no console entry the user would look at, just
nothing. Neither audit catches that: both read the source, neither runs it.

Written after shipping exactly that. A section rebuild replaced everything
between one render function and the next, and two small helper methods that
happened to sit in between went with it. Syntax check passed, both audits
passed, the sub-views all worked -- only the main menu called those helpers,
and the main menu is the first thing that opens.

It also compares the method inventory against a reference commit, so a
deletion is reported even if nothing happens to call the method during the
test.

Usage:
    python3 tools/smoke-editor.py                    # render every view
    python3 tools/smoke-editor.py <git-ref>          # also diff methods
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist' / 'power-flux-card.js'
EDITOR = ROOT / 'src' / 'power-flux-card-editor.js'

VIEWS = [None, 'solar', 'grid', 'battery', 'venus', 'bkw', 'donut', 'consumers',
         'side_panels', 'power', 'temp'] + [f'consumer_{i}' for i in range(1, 8)]

STUBS = '''
globalThis.customElements = {
  get(name) {
    if (name === 'ha-lit-element') {
      const C = class { requestUpdate(){} static get properties(){ return {}; } };
      C.prototype.html = (s, ...v) => ({ _t: 1 });
      C.prototype.css = C.prototype.html;
      return C;
    }
    return undefined;
  },
  define() {},
};
globalThis.window = { customCards: [] };
globalThis.document = { createElement: () => ({}) };
'''


def build_harness():
    src = DIST.read_text()
    lang_at = src.index('const lang_de =')
    editor_at = src.index('const ENTITY_FIELD_KINDS')
    end_at = src.index('customElements.define("power-flux-card-editor"')
    head = (src[lang_at:editor_at]
            .replace('const editorTranslations = {};', 'var editorTranslations = {};')
            .replace('const cardTranslations = {};', 'var cardTranslations = {};'))
    harness = ROOT / '.smoke-editor.js'
    harness.write_text(STUBS + head + src[editor_at:end_at]
                       + '\nmodule.exports = PowerFluxCardEditor;\n')
    return harness


def render_all(harness):
    script = f'''
const E = require({str(harness)!r});
const e = new E();
e.hass = {{ language: 'de', states: {{}}, entities: {{}}, devices: {{}}, themes: {{}} }};
e._config = {{ entities: {{}} }};
const out = [];
for (const v of {[('null' if v is None else v) for v in VIEWS]!r}) {{
  e._subView = (v === 'null') ? null : v;
  try {{ e.render(); out.push([v, 'ok', '']); }}
  catch (err) {{ out.push([v, 'THROWS', err.message]); }}
}}
process.stdout.write(JSON.stringify(out));
'''
    res = subprocess.run(['node', '-e', script], capture_output=True, text=True)
    if res.returncode != 0:
        print('harness failed to load:\n' + res.stderr.strip()[:800], file=sys.stderr)
        return None
    import json
    return json.loads(res.stdout)


def methods(text):
    return set(re.findall(r'^    (\w+)\(', text, re.M))


def main():
    harness = build_harness()
    try:
        results = render_all(harness)
    finally:
        harness.unlink(missing_ok=True)
    if results is None:
        return 2

    failed = False
    for name, status, msg in results:
        label = 'main view' if name == 'null' else name
        if status == 'ok':
            print(f'  {label:<16}ok')
        else:
            failed = True
            print(f'  {label:<16}THROWS: {msg}')

    if len(sys.argv) > 1:
        ref = sys.argv[1]
        before = subprocess.run(
            ['git', 'show', f'{ref}:src/power-flux-card-editor.js'],
            capture_output=True, text=True, cwd=ROOT)
        if before.returncode == 0:
            lost = sorted(methods(before.stdout) - methods(EDITOR.read_text()))
            print()
            if lost:
                failed = True
                print(f'methods lost since {ref}:')
                for m in lost:
                    print(f'    {m}')
            else:
                print(f'no methods lost since {ref}')

    print('-' * 46)
    print('FAILED' if failed else 'every view renders')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
