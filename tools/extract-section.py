#!/usr/bin/env python3
"""
Extract the controls of a legacy editor section.

Reading a 400-line section to find out which switch defaults to on is slow and
error-prone. This reads it out instead: key, control type, default, slider
range, translation key -- exactly the data the capability table needs.

The defaults follow the two idioms the old markup uses, and nothing else:
    .checked=${this._config.x !== false}   ->  default true
    .checked=${this._config.x === true}    ->  default false
Anything that matches neither is reported as UNKNOWN rather than guessed.

Usage:
    python3 tools/extract-section.py _renderGridView
"""

import re
import sys
from pathlib import Path

EDITOR = Path(__file__).resolve().parent.parent / 'src' / 'power-flux-card-editor.js'


def section(name):
    src = EDITOR.read_text()
    start = src.index(f'    {name}(')
    rest = src[start + 10:]
    nxt = re.search(r'\n    _render\w+\(', rest)
    return src[start:start + 10 + (nxt.start() if nxt else len(rest))]


def controls(body):
    out = []

    # Switches. The .checked expression may itself contain ${...} -- the
    # rotation slots read this._config[`x_${n}`] -- so braces are balanced
    # rather than matched with [^}]*. The first cut of this tool used the lazy
    # form and silently missed every dynamic switch.
    for m in re.finditer(r'<ha-switch\s*\n\s*\.checked=\$\{', body):
        i, depth = m.end(), 1
        while i < len(body) and depth:
            if body[i] == '{':
                depth += 1
            elif body[i] == '}':
                depth -= 1
            i += 1
        expr = body[m.end():i - 1]
        cv = re.match(r"\s*\n\s*\.configValue=\$\{\s*['\"`]([^'\"`]+)['\"`]\s*\}",
                      body[i:])
        if not cv:
            continue
        key = cv.group(1)
        if '!== false' in expr:
            default = 'true'
        elif '=== true' in expr:
            default = 'false'
        else:
            default = f'UNKNOWN({expr.strip()})'
        # The label lives in the sibling div, not on the switch.
        lbl = re.match(r"[\s\S]{0,200}?switch-label\">\$\{this\._localize\("
                       r"'editor\.([A-Za-z0-9_]+)'\)", body[i:])
        out.append(('switch', key, default, '', lbl.group(1) if lbl else ''))

    # selectors: number / select / text / icon
    for m in re.finditer(r'<ha-selector(.*?)</ha-selector>', body, re.S):
        blk = m.group(1)
        key = re.search(r"\.configValue=\$\{\s*['\"`]([^'\"`]+)['\"`]\s*\}", blk)
        if not key:
            continue
        key = key.group(1)
        num = re.search(r'number:\s*\{([^}]*)\}', blk)
        sel = re.search(r'select:\s*\{.*?options:\s*\[(.*?)\]', blk, re.S)
        label = re.search(r"\.label=\$\{this\._localize\('editor\.([A-Za-z0-9_]+)'\)", blk)
        dflt = re.search(r'!==\s*undefined\s*\?\s*this\._config\.[A-Za-z0-9_]+\s*:\s*([^\s}]+)', blk)
        if not dflt:
            dflt = re.search(r"\|\|\s*'([^']*)'", blk)
        kind = 'number' if num else ('select' if sel else
                                     ('text/icon' if 'SelectorSchema' in blk else '?'))
        rng = num.group(1).strip() if num else ''
        if sel:
            rng = ','.join(re.findall(r"value:\s*['\"]([^'\"]+)['\"]", sel.group(1)))
        out.append((kind, key, dflt.group(1) if dflt else '(none)', rng,
                    label.group(1) if label else ''))

    # entity pickers and colour pickers stay markup -- listed so nothing is lost
    ent = re.findall(r"_renderEntitySelector\([^,]*,[^,]*,\s*['\"`]([^'\"`]+)['\"`]", body)
    ent += [f'{p}' for p in re.findall(
        r'_renderEntitySelector\([^,]*,[^,]*,\s*`([^`]+)`', body)]
    col = []
    for m in re.finditer(r'_renderColorPicker(Quad|Quint)?\((.*?)\)\s*}', body, re.S):
        kind, args = m.group(1), m.group(2)
        n = {None: 1, 'Quad': 4, 'Quint': 5}[kind]
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
        for a in parts[:n]:
            a = a.strip()
            lit = re.fullmatch(r"['\"`]([^'\"`]+)['\"`]", a)
            if lit:
                col.append(lit.group(1))
        d = re.search(r"'(#[0-9a-fA-F]{6})'\s*\)\s*}$", m.group(0))
        if d:
            col[-1] += f'  default {d.group(1)}'
    return out, ent, col


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    body = section(sys.argv[1])
    ctrls, ent, col = controls(body)
    print(f'{sys.argv[1]}  ({body.count(chr(10))} lines)\n')
    print(f'{"type":<10}{"key":<34}{"default":<14}{"range/options":<34}label')
    print('-' * 110)
    for kind, key, dflt, rng, label in ctrls:
        print(f'{kind:<10}{key:<34}{dflt:<14}{rng:<34}{label}')
    print(f'\nentity pickers ({len(ent)}): ' + ', '.join(ent))
    print(f'\ncolour pickers ({len(col)}):')
    for c in col:
        print('   ', c)
    unknown = [c for c in ctrls if c[2].startswith('UNKNOWN')]
    if unknown:
        print('\nUNRESOLVED DEFAULTS -- read these by hand:')
        for u in unknown:
            print('   ', u)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
