#!/usr/bin/env python3
"""
Move every translation entry into the block its prefix names.

108 entries prefixed "editor." sit inside the card: block of both language
files, and two "card." entries sit inside editor:. _localize looks a key up in
one dictionary only, so those 108 never resolve and the editor shows the raw
key -- silently, with no error anywhere.

Entries are moved with their preceding comment lines, so the grouping comments
travel with the group they describe. Values are never touched.

Run once; the audit then keeps it honest.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = [ROOT / 'src' / 'lang-de.js', ROOT / 'src' / 'lang-en.js']

KEY = re.compile(r'^\s*"(editor|card)\.[A-Za-z0-9_]+"\s*:')
COMMENT = re.compile(r'^\s*//')
BLANK = re.compile(r'^\s*$')


def block_bounds(lines, name):
    """Line indices (start_of_body, index_of_closing_brace) for a top block."""
    open_at = next(i for i, l in enumerate(lines)
                   if re.match(r'^  %s\s*:\s*\{' % name, l))
    depth = 0
    for i in range(open_at, len(lines)):
        depth += lines[i].count('{') - lines[i].count('}')
        if depth == 0:
            return open_at + 1, i
    raise RuntimeError(f'unterminated {name} block')


def split_block(lines, start, end, keep_prefix):
    """Return (kept_lines, moved_groups) for one block body."""
    kept, moved, pending = [], [], []
    for line in lines[start:end]:
        if COMMENT.match(line) or BLANK.match(line):
            pending.append(line)
            continue
        m = KEY.match(line)
        if m and m.group(1) != keep_prefix:
            moved.append(pending + [line])
            pending = []
            continue
        kept.extend(pending)
        pending = []
        kept.append(line)
    kept.extend(pending)
    return kept, moved


def process(path):
    lines = path.read_text().split('\n')
    e_start, e_end = block_bounds(lines, 'editor')
    c_start, c_end = block_bounds(lines, 'card')
    if e_start > c_start:
        raise RuntimeError('expected the editor block to come first')

    editor_kept, to_card = split_block(lines, e_start, e_end, 'editor')
    card_kept, to_editor = split_block(lines, c_start, c_end, 'card')

    moved_in = sum(len(g) for g in to_editor)
    moved_out = sum(len(g) for g in to_card)

    editor_body = editor_kept[:]
    if to_editor:
        if editor_body and not BLANK.match(editor_body[-1]):
            editor_body.append('')
        editor_body.append('    // Moved here from the card block: these are '
                           'editor strings and were')
        editor_body.append('    // unreachable while they sat in the card '
                           'dictionary.')
        for group in to_editor:
            editor_body.extend(group)

    card_body = card_kept[:]
    for group in to_card:
        card_body.extend(group)

    # Trailing comma hygiene: the last entry of a block keeps its comma, which
    # is valid JS and keeps future diffs to one line.
    out = (lines[:e_start] + editor_body + lines[e_end:c_start]
           + card_body + lines[c_end:])
    path.write_text('\n'.join(out))
    return moved_in, moved_out


def main():
    for path in FILES:
        into_editor, into_card = process(path)
        print(f'{path.name}: {into_editor} line(s) moved into editor, '
              f'{into_card} into card')
    return 0


if __name__ == '__main__':
    sys.exit(main())
