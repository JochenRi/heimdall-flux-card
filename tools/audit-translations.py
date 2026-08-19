#!/usr/bin/env python3
"""
Translation coverage audit.

Collects every key the editor asks _localize() for -- from markup and from the
schema generator alike -- and checks that both language files answer it.

Why this exists: _localize falls back to the raw key, so a missing translation
does not throw, does not log, and passes every syntax check. It just shows
"editor.solar_mix_house_label" to the user. Seven such keys had been sitting in
the solar section since phase 5.72 and were only noticed by looking at a
screenshot. The earlier audit missed them because it only checked keys coming
from the schema, not the ones written into markup.

Usage:
    python3 tools/audit-translations.py
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EDITOR = ROOT / 'src' / 'power-flux-card-editor.js'
LANGS = {'de': ROOT / 'src' / 'lang-de.js', 'en': ROOT / 'src' / 'lang-en.js'}

# Same rule as the coverage audit: a key built from an unknown variable is a
# hard error, never a silent skip.
DOMAINS = {
    'n': ['1', '2', '3'],
    'idx': [str(i) for i in range(1, 8)],
    'slotNum': ['1', '2', '3'],
    'mixPeriod': ['day', 'month', 'year'],
    'solarMixTarget': ['house', 'lg', 'venus', 'grid'],
    'gridMixTarget': ['import', 'export'],
    'batteryMixTarget': ['pv', 'grid'],
    'venusMixTarget': ['pv', 'grid'],
    'houseMixTarget': ['self', 'grid'],
    'period': ['day', 'month', 'year'],
    'side': ['indoor', 'outdoor'],
}


class AuditError(RuntimeError):
    pass


def expand(tpl, where):
    variables = re.findall(r'\$\{\s*([\w.]+)\s*\}', tpl)
    if not variables:
        return [tpl]
    for v in variables:
        if v not in DOMAINS:
            raise AuditError(
                f'unknown variable ${{{v}}} in {where}: `{tpl}`\n'
                f'    Add its proven domain to DOMAINS, or rewrite the template '
                f'so the key is unambiguous.')
    out = [tpl]
    for v in variables:
        out = [o.replace('${%s}' % v, val) for o in out for val in DOMAINS[v]]
    return out


def keys_from_markup():
    """Every _localize('editor.x') and _localize(`editor.${...}`) call."""
    src = EDITOR.read_text()
    keys = set()
    for m in re.finditer(r"_localize\(\s*'editor\.([A-Za-z0-9_]+)'\s*\)", src):
        keys.add(m.group(1))
    for m in re.finditer(r'_localize\(\s*`editor\.([^`]+)`\s*\)', src):
        tpl = m.group(1)
        # The generic schema builder resolves its own labels from field data
        # (_bubbleSchema, _bubbleLabel, and the power section's computeLabel), so
        # those call sites cannot be read statically. They are covered in
        # full by keys_from_schema() for the generic sections, and the power
        # section's five keys are checked separately below -- these are the
        # only places where skipping loses no coverage.
        if any(x in tpl for x in ('fld.', 's.name', '${k}')):
            continue
        line = src[:m.start()].count('\n') + 1
        keys.update(expand(tpl, f'{EDITOR.name}:{line}'))
    return keys


def keys_from_schema():
    """labelKey and option labels produced by bubbleFields()."""
    ed = EDITOR.read_text()
    a = ed.index('const SPARKLINE_LAYERS')
    b = ed.index('const fireEvent')
    module = ROOT / '.audit-translations.cjs'
    module.write_text(ed[a:b] + '\nmodule.exports={bubbleFields,BUBBLE_CAPS};\n')
    try:
        out = subprocess.run(['node', '-e', f'''
const {{bubbleFields,BUBBLE_CAPS}}=require({json.dumps(str(module))});
const groups=['sensors','behavior','offsets','rotation','soc','donut','mix','sparkline'];
const keys=new Set();
for(const p of Object.keys(BUBBLE_CAPS))
 for(const g of groups)
  for(const f of bubbleFields(p,g)){{
    if(f.labelKey && !f.labelKey.startsWith('__axis')) keys.add(f.labelKey);
    // An empty optionLabels prefix means literal values, shown untranslated.
    if(f.optionLabels)
      for(const v of f.selector.select.options)
        keys.add(f.optionLabels + String(v).replace(/-/g,''));
  }}
process.stdout.write(JSON.stringify([...keys]));
'''], capture_output=True, text=True, check=True)
    finally:
        module.unlink(missing_ok=True)
    return set(json.loads(out.stdout))


def defined_keys(path):
    """Keys defined in a language file's editor block.

    They are stored fully qualified and quoted -- "editor.bkw_section": "..." --
    so the prefix is part of the literal AND the entry has to sit inside the
    editor block. _localize reads lang.editor only; an "editor.*" entry that
    ends up in the card block is invisible to it. 108 entries were in exactly
    that state and this check did not see them, because it searched the whole
    file. Block bounds are now part of the check.
    """
    lines = path.read_text().split('\n')
    start = next(i for i, l in enumerate(lines) if re.match(r'^  editor\s*:\s*\{', l))
    depth = 0
    for end in range(start, len(lines)):
        depth += lines[end].count('{') - lines[end].count('}')
        if depth == 0:
            break
    body = '\n'.join(lines[start:end + 1])
    return set(re.findall(r'"editor\.([A-Za-z0-9_]+)"\s*:', body))


# The power section predates the generic schema and builds its labels from
# POWER_FLUX_EDITOR_POWER_KEYS via computeLabel. Checked explicitly so its keys
# are not silently exempt.
def keys_from_power_section():
    src = EDITOR.read_text()
    block = re.search(r'const POWER_FLUX_EDITOR_POWER_KEYS = \[(.*?)\];', src, re.S)
    keys = set(re.findall(r"'([A-Za-z0-9_]+)'", block.group(1))) if block else set()
    schema = re.search(r'_powerSchema\(\) \{(.*?)\n    \}', src, re.S)
    if schema:
        keys.update(re.findall(r"name: '([A-Za-z0-9_]+)'", schema.group(1)))
    return keys


def main():
    wanted = keys_from_markup() | keys_from_schema() | keys_from_power_section()
    have = {name: defined_keys(p) for name, p in LANGS.items()}

    missing = {}
    for key in sorted(wanted):
        gaps = [name for name, keys in have.items() if key not in keys]
        if gaps:
            missing[key] = gaps

    print(f'editor keys used : {len(wanted)}')
    for name, keys in have.items():
        print(f'defined in {name}     : {len(keys)}')
    print('-' * 62)
    if not missing:
        print('every key resolves in every language')
        return 0
    print(f'{len(missing)} key(s) fall back to the raw string:\n')
    for key, gaps in missing.items():
        print(f'    editor.{key:<38}missing in {", ".join(gaps)}')
    print('\nFAILED')
    return 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except AuditError as exc:
        print(f'audit aborted: {exc}', file=sys.stderr)
        sys.exit(2)
