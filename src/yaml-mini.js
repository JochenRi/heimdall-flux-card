/**
 * yaml-mini.js -- a compact, dependency-free YAML subset for HEIMDALL Flux Card.
 *
 * Scope (deliberately limited to what Home Assistant card configs use):
 *   - block mappings (key: value), nested by indentation
 *   - block sequences (- item), including sequences of mappings
 *   - flow scalars: strings, numbers, booleans, null
 *   - quoted strings ("..." and '...') for values containing special chars
 *   - inline flow collections [a, b] and {k: v} (parsed; dumped only for [])
 *   - comments (# ...) on their own line or trailing a value
 *
 * NOT supported (not used by HA card configs): anchors/aliases, tags,
 * multi-line block scalars (| and >), complex keys, multiple documents.
 *
 * Exposes: yamlMiniParse(text) -> value, yamlMiniDump(value) -> text.
 * Both are written to be stable forever -- no external dependencies.
 */

function yamlMiniParse(text) {
  if (text == null) return undefined;
  const rawLines = String(text).replace(/\r\n?/g, '\n').split('\n');

  // Tokenize into {indent, content} skipping blank/comment-only lines.
  const lines = [];
  for (const raw of rawLines) {
    // strip trailing comment (only when # is preceded by whitespace or at start,
    // to avoid breaking values like "#ff0000")
    let line = raw;
    // remove a comment that starts the line or follows whitespace, but not
    // inside quotes. Simple heuristic sufficient for card configs.
    line = stripComment(line);
    if (line.trim() === '') continue;
    const indent = line.length - line.trimStart().length;
    lines.push({ indent, content: line.trim() });
  }
  if (lines.length === 0) return undefined;

  let pos = 0;

  function peek() { return lines[pos]; }

  function parseBlock(minIndent) {
    const first = peek();
    if (!first || first.indent < minIndent) return undefined;
    if (first.content.startsWith('- ') || first.content === '-') {
      return parseSequence(first.indent);
    }
    return parseMapping(first.indent);
  }

  function parseSequence(indent) {
    const arr = [];
    while (pos < lines.length) {
      const line = peek();
      if (!line || line.indent !== indent) break;
      if (!(line.content === '-' || line.content.startsWith('- '))) break;
      pos++;
      const after = line.content === '-' ? '' : line.content.slice(2).trim();
      if (after === '') {
        // value is a nested block on the following lines
        const child = parseBlock(indent + 1);
        arr.push(child === undefined ? null : child);
      } else if (isInlineKey(after)) {
        // "- key: value" -> a mapping whose first key sits on the dash line.
        // Re-inject the remainder as a virtual line at indent+2 and parse a map.
        const virtualIndent = indent + 2;
        const injected = [{ indent: virtualIndent, content: after }];
        // collect subsequent lines that belong to this map item (indent > dash)
        while (pos < lines.length && lines[pos].indent > indent) {
          injected.push(lines[pos]);
          pos++;
        }
        arr.push(parseMappingFrom(injected, virtualIndent));
      } else {
        arr.push(parseScalar(after));
      }
    }
    return arr;
  }

  function parseMapping(indent) {
    const map = {};
    while (pos < lines.length) {
      const line = peek();
      if (!line || line.indent !== indent) break;
      if (line.content === '-' || line.content.startsWith('- ')) break;
      const { key, rest } = splitKey(line.content);
      pos++;
      if (rest === '') {
        // nested block (map or seq) or empty
        const next = peek();
        if (next && next.indent > indent) {
          map[key] = parseBlock(indent + 1);
        } else {
          map[key] = null;
        }
      } else {
        map[key] = parseScalar(rest);
      }
    }
    return map;
  }

  // Parse a mapping from an explicit line array (used for "- key: value" items).
  function parseMappingFrom(injectedLines, indent) {
    const savedLines = lines.slice();
    const savedPos = pos;
    // temporarily splice: easiest is a small sub-parser
    const sub = injectedLines;
    let p = 0;
    function subPeek() { return sub[p]; }
    function subParseBlock(minIndent) {
      const f = subPeek();
      if (!f || f.indent < minIndent) return undefined;
      if (f.content === '-' || f.content.startsWith('- ')) return subParseSeq(f.indent);
      return subParseMap(f.indent);
    }
    function subParseSeq(ind) {
      const arr = [];
      while (p < sub.length) {
        const l = subPeek();
        if (!l || l.indent !== ind) break;
        if (!(l.content === '-' || l.content.startsWith('- '))) break;
        p++;
        const after = l.content === '-' ? '' : l.content.slice(2).trim();
        if (after === '') arr.push(subParseBlock(ind + 1) ?? null);
        else if (isInlineKey(after)) {
          const vi = ind + 2;
          const inj = [{ indent: vi, content: after }];
          while (p < sub.length && sub[p].indent > ind) { inj.push(sub[p]); p++; }
          // recurse via a fresh sub-parse
          arr.push(parseInjected(inj, vi));
        } else arr.push(parseScalar(after));
      }
      return arr;
    }
    function subParseMap(ind) {
      const m = {};
      while (p < sub.length) {
        const l = subPeek();
        if (!l || l.indent !== ind) break;
        if (l.content === '-' || l.content.startsWith('- ')) break;
        const { key, rest } = splitKey(l.content);
        p++;
        if (rest === '') {
          const n = subPeek();
          if (n && n.indent > ind) m[key] = subParseBlock(ind + 1);
          else m[key] = null;
        } else m[key] = parseScalar(rest);
      }
      return m;
    }
    const result = subParseMap(indent);
    // restore (lines/pos untouched here since we consumed injected separately)
    void savedLines; void savedPos;
    return result;
  }

  // Standalone injected-array parser (no shared state) for nested "- key:" maps.
  function parseInjected(arr, indent) {
    let p = 0;
    function pk() { return arr[p]; }
    function blk(mi) {
      const f = pk(); if (!f || f.indent < mi) return undefined;
      if (f.content === '-' || f.content.startsWith('- ')) return seq(f.indent);
      return mp(f.indent);
    }
    function seq(ind) {
      const a = [];
      while (p < arr.length) {
        const l = pk(); if (!l || l.indent !== ind) break;
        if (!(l.content === '-' || l.content.startsWith('- '))) break;
        p++; const af = l.content === '-' ? '' : l.content.slice(2).trim();
        if (af === '') a.push(blk(ind + 1) ?? null);
        else if (isInlineKey(af)) {
          const vi = ind + 2; const inj = [{ indent: vi, content: af }];
          while (p < arr.length && arr[p].indent > ind) { inj.push(arr[p]); p++; }
          a.push(parseInjected(inj, vi));
        } else a.push(parseScalar(af));
      }
      return a;
    }
    function mp(ind) {
      const m = {};
      while (p < arr.length) {
        const l = pk(); if (!l || l.indent !== ind) break;
        if (l.content === '-' || l.content.startsWith('- ')) break;
        const { key, rest } = splitKey(l.content); p++;
        if (rest === '') { const n = pk(); m[key] = (n && n.indent > ind) ? blk(ind + 1) : null; }
        else m[key] = parseScalar(rest);
      }
      return m;
    }
    return mp(indent);
  }

  const result = parseBlock(lines[0].indent);
  return result;
}

function isInlineKey(s) {
  // crude: "key: ..." where key has no spaces before colon and a colon exists
  const m = s.match(/^[^:\s][^:]*:(\s|$)/);
  return !!m;
}

function splitKey(s) {
  // split on first ": " or trailing ":"
  let idx = -1;
  let inS = false, inD = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === ':' && !inS && !inD) {
      if (i === s.length - 1 || s[i + 1] === ' ') { idx = i; break; }
    }
  }
  if (idx === -1) return { key: unquote(s.trim()), rest: '' };
  const key = unquote(s.slice(0, idx).trim());
  const rest = s.slice(idx + 1).trim();
  return { key, rest };
}

function stripComment(line) {
  let inS = false, inD = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === '#' && !inS && !inD) {
      if (i === 0 || line[i - 1] === ' ' || line[i - 1] === '\t') {
        return line.slice(0, i);
      }
    }
  }
  return line;
}

function parseScalar(s) {
  s = s.trim();
  if (s === '') return null;
  // inline flow sequence
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    if (inner === '') return [];
    return splitFlow(inner).map(parseScalar);
  }
  // inline flow mapping
  if (s.startsWith('{') && s.endsWith('}')) {
    const inner = s.slice(1, -1).trim();
    const obj = {};
    if (inner === '') return obj;
    for (const part of splitFlow(inner)) {
      const { key, rest } = splitKey(part);
      obj[key] = parseScalar(rest);
    }
    return obj;
  }
  // quoted
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return unquote(s);
  }
  // booleans / null
  if (s === 'true' || s === 'True') return true;
  if (s === 'false' || s === 'False') return false;
  if (s === 'null' || s === '~' || s === 'Null') return null;
  // number
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
  return s;
}

function splitFlow(s) {
  // split on commas at depth 0, respecting quotes and brackets
  const out = [];
  let depth = 0, inS = false, inD = false, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (!inS && !inD) {
      if (c === '[' || c === '{') depth++;
      else if (c === ']' || c === '}') depth--;
      else if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    }
    cur += c;
  }
  if (cur.trim() !== '') out.push(cur.trim());
  return out;
}

function unquote(s) {
  s = s.trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  return s;
}

function yamlMiniDump(value, indent = 0) {
  const pad = '  '.repeat(indent);
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return dumpScalarString(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value.map((item) => {
      if (item !== null && typeof item === 'object') {
        const dumped = yamlMiniDump(item, indent + 1);
        // place first line after "- ", rest indented
        const lines = dumped.split('\n');
        const firstStripped = lines[0].replace(/^ +/, '');
        const restLines = lines.slice(1);
        return `${pad}- ${firstStripped}` + (restLines.length ? '\n' + restLines.join('\n') : '');
      }
      return `${pad}- ${yamlMiniDump(item, 0)}`;
    }).join('\n');
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    return keys.map((k) => {
      const v = value[k];
      const keyStr = dumpKey(k);
      if (v !== null && typeof v === 'object' && !(Array.isArray(v) && v.length === 0) && !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)) {
        return `${pad}${keyStr}:\n${yamlMiniDump(v, indent + 1)}`;
      }
      return `${pad}${keyStr}: ${yamlMiniDump(v, 0)}`;
    }).join('\n');
  }
  return String(value);
}

function dumpKey(k) {
  if (/^[A-Za-z0-9_][A-Za-z0-9_]*$/.test(k)) return k;
  return JSON.stringify(k);
}

function dumpScalarString(s) {
  if (s === '') return '""';
  // quote if it could be misread as another type or contains special chars
  const needsQuote = /^(true|false|null|True|False|Null|~)$/.test(s)
    || /^-?\d+(\.\d+)?$/.test(s)
    || /^[\s]|[\s]$/.test(s)
    || /[:#\[\]{},&*!|>'"%@`]/.test(s)
    || s.includes('\n');
  if (!needsQuote) return s;
  if (s.includes('\n') || s.includes('"')) {
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
  }
  return '"' + s + '"';
}

export { yamlMiniParse, yamlMiniDump };
