#!/usr/bin/env python3
"""
Editor coverage audit.

For every bubble, compares what the CARD reads against what the EDITOR offers,
and exits non-zero on any difference. Run before every commit of the editor
refactor.

Why this exists: the same comparison done by hand produced two wrong answers in
one session -- first because dynamically built keys were not expanded, then
because colour-picker label arguments were counted as keys. A wrong measuring
tool is worse than no measurement, so the tool is now code that can be
re-checked instead of a command typed from memory.

Three sources are read:
  1. src/power-flux-card.js        -- what the card reads
  2. src/power-flux-card-editor.js -- what the editor offers as markup
  3. bubbleFields() in the editor  -- what the editor offers via schema

Every template literal that builds a key is expanded using variable domains
that are PROVEN from the call sites, not assumed. An unknown variable is a hard
error, never a silent skip -- that is exactly how keys got missed before.

Usage:
    python3 tools/audit-editor-coverage.py            # all bubbles
    python3 tools/audit-editor-coverage.py solar bkw  # selected bubbles
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CARD = ROOT / 'src' / 'power-flux-card.js'
EDITOR = ROOT / 'src' / 'power-flux-card-editor.js'

CONSUMERS = ['consumer_%d' % i for i in range(1, 8)]

# Variable domains. Each one is proven from the call sites named in the comment;
# if a function is ever called with a new prefix, this table must grow with it.
DOMAINS = {
    # _renderSparklineForSource(...) and _fetchAllSparklines both iterate these
    'prefix': ['solar', 'grid', 'battery', 'venus', 'bkw', 'house'] + CONSUMERS,
    # renderConsumer(..., configKey, ...) call sites
    'configKey': CONSUMERS,
    'idx': [str(i) for i in range(1, 8)],
    'n': ['1', '2', '3'],
    'slotNum': ['1', '2', '3'],          # for (const slotNum of [1,2,3])
    'side': ['indoor', 'outdoor'],
    'period': ['day', 'month', 'year'],  # const period = ... 'month' | 'year' | 'day'
    # Editor-side loop variables. Deliberately named so they cannot collide
    # with a differently-scoped variable of the same generic name.
    # The editor now renders only the configured period's sensors, but all
    # three remain reachable by switching the period -- so the audit expands
    # all of them. It measures reachability, not what is on screen at once.
    'mixPeriod': ['day', 'month', 'year'],
    # One domain per bubble: the mix ring has different destinations per
    # source. Solar splits four ways, the grid meter only two.
    'solarMixTarget': ['house', 'lg', 'venus', 'grid'],
    'gridMixTarget': ['import', 'export'],
    'batteryMixTarget': ['pv', 'grid'],
    'venusMixTarget': ['pv', 'grid'],
    'houseMixTarget': ['self', 'grid'],
    'consumerMixTarget': ['pv', 'lg', 'venus', 'grid'],
}

# Bubbles and the keys that belong to them but do not carry the prefix.
BUBBLES = ['solar', 'grid', 'battery', 'venus', 'bkw', 'house', 'power'] + CONSUMERS

# Keys that belong to a section without carrying its prefix. Each one verified
# in the markup of the section named.
# Carry a bubble prefix but belong to the card-wide portals group: a portal
# describes a crossing, not the tile it happens to touch.
PORTAL_KEYS = {'temp_portal_offset_x', 'temp_portal_offset_y',
               'power_portal_offset_x', 'power_portal_offset_y'}

SECTION_OWNED = {
    'house': {'donut_today_mode', 'donut_today_solar', 'donut_today_battery',
              'donut_today_venus', 'donut_today_grid'},
    'solar': {'pv_donut_today_mode', 'pv_donut_produced_today',
              'pv_donut_forecast_today'},
    'battery': {'hide_solar_to_battery_pipe'},
    'venus': {'hide_solar_to_venus_pipe'},
    'power': {'power_enabled', 'power_offset_x', 'power_offset_y',
              'power_pulse_enabled', 'power_pulse_threshold', 'power_autarkie',
              'power_lg_nutzbar', 'power_lg_reichweite', 'power_venus_nutzbar',
              'power_venus_reichweite'},
}

EXTRA_KEYS = {
    b: {f'color_{b}', f'color_pipe_{b}', f'color_text_{b}', f'color_icon_{b}',
        f'color_secondary_{b}', f'show_flow_rate_{b}', f'show_label_{b}',
        f'secondary_{b}', f'invert_{b}'}
    for b in BUBBLES
}

# Rotation is NOT offered for the house bubble: _getBubbleRotationDisplay is
# never called with 'house'. Without this the expansion would invent nine keys
# that no code path can reach.
ROTATION_PREFIXES = {'solar', 'grid', 'battery', 'venus', 'bkw'} | set(CONSUMERS)


class AuditError(RuntimeError):
    pass


def expand(tpl, where):
    """`a_${var}_b` -> concrete keys. Unknown variable is a hard error."""
    variables = re.findall(r'\$\{\s*(\w+)\s*\}', tpl)
    if not variables:
        return [tpl]
    for v in variables:
        if v not in DOMAINS:
            raise AuditError(
                f'unknown template variable ${{{v}}} in {where}: `{tpl}`\n'
                f'    Add its proven domain to DOMAINS, or the audit is blind '
                f'to every key it builds.')
    out = [tpl]
    for v in variables:
        out = [o.replace('${%s}' % v, val).replace('${ %s }' % v, val)
               for o in out for val in DOMAINS[v]]
    return out


def strip_comments(src):
    """Remove // and /* */ comments.

    Prose is not code: "e.g. toggling panels" made the alias pattern read an
    entity key called "g", and a catch block's e.message became a config key.
    Harmless while every result was intersected with the entity-key universe,
    not harmless once card-wide keys are checked too.
    """
    src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
    return re.sub(r'(^|[^:])//[^\n]*', r'\1', src)


def read_card_keys():
    """Everything the card reads: config.<key> and config.entities.<key>."""
    src = strip_comments(CARD.read_text())
    keys = set()

    for pat in [r'\bthis\.config\??\.(?!entities\b)([A-Za-z_]\w*)',
                r'\bcfg\??\.(?!entities\b)([A-Za-z_]\w*)',
                r'\.entities\??\.([A-Za-z_]\w*)',
                r'\b(?:ent|tEnts|entities)\??\.([A-Za-z_]\w*)']:
        keys.update(m.group(1) for m in re.finditer(pat, src))

    # The one-letter alias `e` is also the conventional name for an error and
    # for an event, so `e.message` in a catch block read as a config key. It is
    # only honoured inside a function that actually assigns it from
    # config.entities.
    for fn in re.finditer(r'\n    \w+\([^)]*\)\s*\{', src):
        start = fn.end()
        nxt = re.search(r'\n    \w+\([^)]*\)\s*\{', src[start:])
        body = src[start:start + (nxt.start() if nxt else len(src) - start)]
        if not re.search(r'(?:const|let)\s+e\s*=\s*[\w.?]*entities', body):
            continue
        keys.update(m.group(1) for m in re.finditer(r'\be\??\.([A-Za-z_]\w*)', body))

    for pat in [r"\b(?:this\.config|cfg)\??\.?\[\s*'([A-Za-z0-9_]+)'\s*\]",
                r"\.entities\s*(?:\|\|\s*\{\})?\s*\)?\??\.?\[\s*'([A-Za-z0-9_]+)'\s*\]",
                r"\b(?:ent|tEnts|entities)\s*\[\s*'([A-Za-z0-9_]+)'\s*\]"]:
        keys.update(m.group(1) for m in re.finditer(pat, src))

    # colorMap drives this.config[configKey] through Object.entries
    for cm in re.finditer(r'const colorMap = \{(.*?)\n\s*\};', src, re.S):
        keys.update(re.findall(r"'([a-z0-9_]+)'\s*:", cm.group(1)))

    # _pv('key') -- the tile's generic entity reader
    keys.update(re.findall(r"_pv\('([A-Za-z0-9_]+)'\)", src))

    # Local helpers that wrap a reader take the key as an argument, so the
    # literal sits at the CALL site, not next to any config access. The power
    # tile's runtime(hKey, kKey) is one; finding it by name would only work
    # until the next one appears. Any local arrow function whose body calls
    # _pv( is treated as a reader and its call-site literals collected.
    for fn in re.finditer(r'const (\w+) = \([^)]*\) => \{(.*?)\n        \};', src, re.S):
        name, body = fn.group(1), fn.group(2)
        if '_pv(' not in body:
            continue
        for call in re.finditer(r'\b%s\(([^)]*)\)' % re.escape(name), src):
            keys.update(re.findall(r"'([A-Za-z0-9_]+)'", call.group(1)))

    # Every key-shaped template literal, wherever it sits. Keys are built into
    # variables before use (const sensorKey = `...`), so restricting this to
    # bracket subscripts would miss them.
    for m in re.finditer(r'`([A-Za-z0-9_$\{\} ]+)`', src):
        tpl = m.group(1).strip()
        if '${' not in tpl:
            continue
        # A config key never contains a space. This excludes CSS values such as
        # `${dashSize} ${gapSize}` without weakening the unknown-variable rule
        # for anything that could actually be a key.
        if ' ' in tpl:
            continue
        line = src[:m.start()].count('\n') + 1
        keys.update(expand(tpl, f'{CARD.name}:{line}'))

    # Drop rotation keys for prefixes that never reach the rotation helper.
    keys = {k for k in keys
            if '_rotate_' not in k
            or any(k.startswith(p + '_rotate_') for p in ROTATION_PREFIXES)}
    return keys


def read_editor_markup_keys():
    """What the editor offers as hand-written markup, per section."""
    ed = EDITOR.read_text()
    starts = sorted((m.start(), m.group(1))
                    for m in re.finditer(r'^    (_render\w+View)\(', ed, re.M))
    sections = {}
    for i, (pos, name) in enumerate(starts):
        end = starts[i + 1][0] if i + 1 < len(starts) else len(ed)
        chunk = ed[pos:end]
        keys = set(re.findall(
            r"\.configValue=\$\{\s*['\"]([A-Za-z0-9_]+)['\"]\s*\}", chunk))
        keys.update(re.findall(
            r"_renderEntitySelector\([^,]*,[^,]*,\s*['\"]([A-Za-z0-9_]+)['\"]",
            chunk))
        for pat in [r'\.configValue=\$\{\s*`([^`]+)`\s*\}',
                    r'_renderEntitySelector\([^,]*,[^,]*,\s*`([^`]+)`']:
            for m in re.finditer(pat, chunk):
                keys.update(expand(m.group(1), f'{name} (markup)'))
        # Colour pickers: only the leading key arguments count. Counting the
        # label arguments too is the mistake this audit was written to prevent.
        for m in re.finditer(r'_renderColorPicker(Quad|Quint)?\((.*?)\)\s*}',
                             chunk, re.S):
            kind, args = m.group(1), m.group(2)
            n_keys = {None: 1, 'Quad': 4, 'Quint': 5}[kind]
            parts, depth, cur = [], 0, ''
            for ch in args:
                if ch in '([{':
                    depth += 1
                elif ch in ')]}':
                    depth -= 1
                if ch == ',' and depth == 0:
                    parts.append(cur)
                    cur = ''
                else:
                    cur += ch
            parts.append(cur)
            for arg in parts[:n_keys]:
                arg = arg.strip()
                lit = re.fullmatch(r"['\"]([A-Za-z0-9_]+)['\"]", arg)
                if lit:
                    keys.add(lit.group(1))
                    continue
                tpl = re.fullmatch(r'`([^`]+)`', arg)
                if tpl:
                    keys.update(expand(tpl.group(1), f'{name} (colour)'))
        sections[name] = keys
    return sections


def read_editor_schema_keys():
    """What the editor offers via bubbleFields() -- asked, not re-implemented."""
    ed = EDITOR.read_text()
    a = ed.index('const SPARKLINE_LAYERS')
    b = ed.index('const fireEvent')
    module = ROOT / '.audit-bubblefields.cjs'
    module.write_text(ed[a:b] + '\nmodule.exports={bubbleFields,BUBBLE_CAPS,flattenFields};\n')
    try:
        out = subprocess.run(
            ['node', '-e', f'''
const {{bubbleFields,BUBBLE_CAPS,flattenFields}}=require({json.dumps(str(module))});
const groups=['sensors','behavior','offsets','rotation','soc','donut','mix','sparkline'];
const res={{}};
for(const p of Object.keys(BUBBLE_CAPS)){{
  const keys=[];
  for(const g of groups) for(const f of flattenFields(bubbleFields(p,g))) keys.push(f.key);
  res[p]=keys;
}}
for(const g of ['sizing','appearance','display','debug','panels','portals'])
  res['__global__:'+g]=flattenFields(bubbleFields('__global__',g)).map(f=>f.key);
process.stdout.write(JSON.stringify(res));
'''], capture_output=True, text=True, check=True)
    finally:
        module.unlink(missing_ok=True)
    return {p: set(v) for p, v in json.loads(out.stdout).items()}


def keys_from_power_section():
    """The power section predates bubbleFields and builds its own ha-form
    schema, so neither the markup walk nor the schema call sees it."""
    src = EDITOR.read_text()
    keys = set()
    block = re.search(r'const POWER_FLUX_EDITOR_POWER_KEYS = \[(.*?)\];', src, re.S)
    if block:
        keys.update(re.findall(r"'([A-Za-z0-9_]+)'", block.group(1)))
    schema = re.search(r'_powerSchema\(\) \{(.*?)\n    \}', src, re.S)
    if schema:
        keys.update(re.findall(r"name: '([A-Za-z0-9_]+)'", schema.group(1)))
    return keys


def keys_for(bubble, pool):
    own = {k for k in pool
           if (k == bubble or k.startswith(bubble + '_')
               or k in EXTRA_KEYS.get(bubble, set())
               or k in SECTION_OWNED.get(bubble, set()))
           and k not in PORTAL_KEYS}
    # consumer_1 must not swallow keys of consumer_1x -- no such bubble exists,
    # but guard anyway so a future rename cannot corrupt the comparison.
    return own


SECTION_OF = {
    'solar': '_renderSolarView', 'grid': '_renderGridView',
    'battery': '_renderBatteryView', 'venus': '_renderVenusView',
    'bkw': '_renderBkwView', 'house': '_renderDonutView',
    'consumer_1': '_renderConsumer1View', 'consumer_2': '_renderConsumer2View',
    'consumer_3': '_renderConsumer3View', 'consumer_4': '_renderConsumer4View',
    'consumer_5': '_renderConsumer5View', 'consumer_6': '_renderConsumer6View',
    'consumer_7': '_renderConsumer7View',
    'power': '_renderPowerView',
}


def main(argv):
    wanted = argv[1:] or BUBBLES
    card = read_card_keys()
    markup = read_editor_markup_keys()
    schema = read_editor_schema_keys()

    failed = False
    # Which section a key lives in is a matter of taste -- grid_to_battery sits
    # in the battery section, the house fields sit in the main view. The
    # question this audit answers is whether the editor offers it AT ALL, so
    # the markup side is the union over every section.
    all_markup = set().union(*markup.values()) if markup else set()
    all_markup |= keys_from_power_section()

    global_schema = set()
    for g in ('sizing', 'appearance', 'display', 'debug', 'panels', 'portals'):
        global_schema |= set(schema.get('__global__:' + g, []))

    gaps = json.loads((ROOT / 'tools' / 'audit-known-gaps.json').read_text())
    known_missing = set(gaps['missing_in_editor'])
    known_surplus = set(gaps['surplus_in_editor'])

    print(f'{"bubble":<12}{"card":>6}{"editor":>8}   verdict')
    print('-' * 62)
    for bubble in wanted:
        want = keys_for(bubble, card)
        have = keys_for(bubble, all_markup | schema.get(bubble, set()))
        missing = sorted(want - have)
        surplus = sorted(have - want)
        section = SECTION_OF.get(bubble)
        overlap = sorted(markup.get(section, set()) & schema.get(bubble, set()))

        verdict = 'ok'
        new_missing = [k for k in missing if k not in known_missing]
        new_surplus = [k for k in surplus if k not in known_surplus]
        old = [k for k in missing if k in known_missing] + \
              [k for k in surplus if k in known_surplus]

        if new_missing or new_surplus or overlap:
            verdict = 'MISMATCH'
            failed = True
        elif old:
            verdict = f'ok ({len(old)} known)'
        print(f'{bubble:<12}{len(want):>6}{len(have):>8}   {verdict}')
        for k in new_missing:
            print(f'    card reads, editor does not offer : {k}')
        for k in new_surplus:
            print(f'    editor offers, card never reads   : {k}')
        for k in overlap:
            print(f'    offered twice (markup and schema) : {k}')
        for k in old:
            print(f'    known, still open                 : {k}')

    # Card-wide keys belong to no bubble. Without this block a global option
    # the card reads could go missing from the editor and no per-bubble check
    # would ever notice -- which is how show_flow_rates and animation_threshold
    # stayed unreachable for as long as they did.
    if set(wanted) == set(BUBBLES):
        bubble_keys = set()
        for b in BUBBLES:
            bubble_keys |= keys_for(b, card) | keys_for(b, all_markup)
        g_want = {k for k in card if k not in bubble_keys}
        g_have = {k for k in (all_markup | global_schema) if k not in bubble_keys}
        g_missing = sorted(k for k in g_want - g_have if k not in known_missing)
        g_old = sorted(k for k in g_want - g_have if k in known_missing)
        verdict = 'ok' if not g_missing else 'MISMATCH'
        if g_missing:
            failed = True
        elif g_old:
            verdict = f'ok ({len(g_old)} known)'
        print(f'{"(card-wide)":<12}{len(g_want):>6}{len(g_have):>8}   {verdict}')
        for k in g_missing:
            print(f'    card reads, editor does not offer : {k}')
        for k in g_old:
            print(f'    known, still open                 : {k}')

    print('-' * 62)
    print('FAILED' if failed else 'all checked bubbles match')
    return 1 if failed else 0


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv))
    except AuditError as exc:
        print(f'audit aborted: {exc}', file=sys.stderr)
        sys.exit(2)
