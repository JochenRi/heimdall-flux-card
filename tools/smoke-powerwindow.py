#!/usr/bin/env python3
"""Runtime smoke test for the power window's day renderer.

Why this exists
---------------
node --check proves the file parses. smoke-editor proves every editor view
renders. audit-translations proves every key resolves. audit-editor-coverage
proves the editor offers what the card reads.

None of them execute the window's day renderer, and on 2026-08-22 a single
stale variable (`hrs` left behind after a rename to `hh`) passed all four and
threw a ReferenceError the moment real data arrived. Lit aborts the update
when render() throws, so updated() never ran, the dialog's close() was never
called, and the window could not be shut -- a dead end reachable only by
clicking the tile on a running system.

What it does
------------
Pulls _pwDayPlan, _pwDayGrid and _renderPowerWindowDay straight out of the
source by brace matching, wraps them in a stub that provides the handful of
things they touch on the host, feeds them statistics-shaped data, and runs
them under node. A throw anywhere in that path fails the gate.

The data deliberately covers the shapes that broke things before:
  - a full seven consumers, so every stack slot is exercised
  - PV crossing the stack, so the surplus band has both states
  - grid swinging import to export, so both day totals are non-zero
  - a series with gaps, so the bucket-hold path runs
  - a single-slot day, so the too-short guard returns instead of throwing

Usage: python3 tools/smoke-powerwindow.py
"""

import io
import os
import re
import subprocess
import sys
import tempfile

CARD = os.path.join(os.path.dirname(__file__), '..', 'src', 'power-flux-card.js')
METHODS = ['_pwDayPlan', '_pwDayGrid', '_pwGuard', '_pwSoc', '_renderPowerWindowDay',
           '_renderPowerWindowStorage', '_renderPowerWindowBalance',
           '_renderPowerWindowSystem']
TIMEOUT = 30


def grab(src, name):
    """Return the full text of a class method, matched by brace depth."""
    m = re.search(r'\n(    (?:async )?%s\([^)]*\) \{)' % re.escape(name), src)
    if not m:
        raise SystemExit('method not found in card source: %s' % name)
    i = m.start(1)
    depth, j, in_tpl = 0, i, False
    while j < len(src):
        c = src[j]
        if c == '`':
            in_tpl = not in_tpl
        elif not in_tpl and c == '{':
            depth += 1
        elif not in_tpl and c == '}':
            depth -= 1
            if depth == 0:
                return src[i:j + 1]
        j += 1
    raise SystemExit('unbalanced braces while reading %s' % name)


HARNESS = """
// Tagged templates are collapsed to a marker: this gate asks whether the
// renderer RUNS, not what it paints. Every interpolation is still evaluated,
// which is exactly where the ReferenceError lived.
const html = (s, ...v) => ({ __tpl: v.length });

class Stub {
  constructor(cfg, day) {
    this.config = cfg;
    this._pwDay = day;
    this._pwDayBusy = false;
    this._pwDate = null;
  }
  _pwIsToday() { return true; }
  _localize(k) { return k; }
@@METHODS@@
}

const E = { house: 'h', solar: 's', bkw: 'b', battery: 'lg', venus: 've',
            grid_combined: 'g', consumer_1: 'c1', consumer_2: 'c2',
            consumer_3: 'c3', consumer_4: 'c4', consumer_5: 'c5',
            consumer_6: 'c6', consumer_7: 'c7' };
const cfg = { entities: E, invert_venus: true, invert_battery: false,
              battery_label: 'LG', venus_label: 'Venus',
              consumer_6_enabled: true, consumer_7_enabled: true };
const t = (k, fb) => fb;

function day(n, opts) {
  opts = opts || {};
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const start = t0.getTime();
  const mk = (f, skip) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      if (skip && i % skip === 0) continue;   // gaps -> bucket-hold path
      out.push({ t: start + i * 300000, v: f(i) });
    }
    return out;
  };
  const series = {};
  for (const id of Object.values(E)) series[id] = mk(i => 10 + (i % 37) * 3);
  series.s  = mk(i => Math.max(0, (i - n / 3) * 80));
  series.b  = mk(i => Math.max(0, (i - n / 3) * 12));
  series.g  = mk(i => (i > n * 0.6 ? -420 : 260));
  series.lg = mk(i => (i > n * 0.5 ? -300 : 900));
  series.c3 = mk(i => (i % 11 === 0 ? 1800 : 0), 5);
  if (opts.drop) for (const k of opts.drop) delete series[k];
  return { at: Date.now(), key: start, start, end: start + n * 300000,
           plan: null, period: opts.period || '5minute', series };
}

const cases = [
  ['full day, seven consumers', day(240)],
  ['short day, just after midnight', day(3)],
  ['single slot', day(1)],
  ['hourly fallback', day(24, { period: 'hour' })],
  ['storage series missing', day(120, { drop: ['lg', 've'] })],
  ['no series at all', { at: Date.now(), key: 0, start: 0, end: 0,
                         plan: [], period: '5minute', series: {} }],
];

let bad = 0;
for (const [name, d] of cases) {
  const stub = new Stub(cfg, d);
  try {
    d.plan = stub._pwDayPlan();
    const g = stub._pwDayGrid();
    stub._renderPowerWindowDay(t);
    stub._renderPowerWindowStorage(t);
    stub._renderPowerWindowBalance(t);
    stub._renderPowerWindowSystem(t);
    const slots = g ? g.slots.length : 0;
    console.log('  ' + name.padEnd(34) + 'ok'
                + (g ? '   ' + slots + ' slots' : '   guarded'));
  } catch (e) {
    bad++;
    console.log('  ' + name.padEnd(34) + 'THREW  ' + e.constructor.name
                + ': ' + e.message);
    console.log('      ' + (e.stack || '').split('\\n').slice(1, 3).join('\\n      '));
  }
}
process.exit(bad ? 1 : 0);
"""


def main():
    src = io.open(CARD, encoding='utf-8').read()
    body = '\n\n'.join(grab(src, m) for m in METHODS)
    code = HARNESS.replace('@@METHODS@@', body)

    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, 'smoke.mjs')
        io.open(path, 'w', encoding='utf-8').write(code)
        print('the day renderer, run against statistics-shaped data')
        print('-' * 62)
        try:
            r = subprocess.run([sys.executable and 'node', path],
                               capture_output=True, text=True, timeout=TIMEOUT)
        except subprocess.TimeoutExpired:
            print('  node did not finish within %ds -- probable infinite loop' % TIMEOUT)
            return 1
        sys.stdout.write(r.stdout)
        if r.stderr.strip():
            sys.stderr.write(r.stderr)
        print('-' * 62)
        print('every case renders' if r.returncode == 0 else 'FAILED')
        return r.returncode


if __name__ == '__main__':
    sys.exit(main())
