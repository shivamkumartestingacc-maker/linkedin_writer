// Unicode "styled text" helpers. LinkedIn has no rich text, so bold/italic
// are faked with Mathematical Alphanumeric Symbols that survive copy/paste.
(function (root) {
  const STYLES = {
    // [A start, a start, 0 start or null]
    bold:       [0x1d5d4, 0x1d5ee, 0x1d7ec], // sans-serif bold
    italic:     [0x1d608, 0x1d622, null],    // sans-serif italic
    bolditalic: [0x1d63c, 0x1d656, 0x1d7ec], // sans-serif bold italic (digits fall back to bold)
    mono:       [0x1d670, 0x1d68a, 0x1d7f6], // monospace
  };
  const UNDERLINE = '̲';
  const STRIKE = '̶';

  // styled char -> { base, style }
  const reverse = new Map();
  for (const [name, [A, a, d]] of Object.entries(STYLES)) {
    for (let i = 0; i < 26; i++) {
      reverse.set(String.fromCodePoint(A + i), { base: String.fromCharCode(65 + i), style: name });
      reverse.set(String.fromCodePoint(a + i), { base: String.fromCharCode(97 + i), style: name });
    }
    if (d !== null && !reverse.has(String.fromCodePoint(d))) {
      for (let i = 0; i < 10; i++) {
        reverse.set(String.fromCodePoint(d + i), { base: String(i), style: name });
      }
    }
  }

  function plain(text) {
    let out = '';
    for (const ch of text) {
      if (ch === UNDERLINE || ch === STRIKE) continue;
      const r = reverse.get(ch);
      out += r ? r.base : ch;
    }
    return out;
  }

  function styleChar(ch, style) {
    if (!style) return ch;
    const [A, a, d] = STYLES[style];
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90) return String.fromCodePoint(A + c - 65);
    if (c >= 97 && c <= 122) return String.fromCodePoint(a + c - 97);
    if (c >= 48 && c <= 57 && d !== null) return String.fromCodePoint(d + c - 48);
    return ch;
  }

  // Current flags of a selection, read from its first letter/digit.
  function flags(text) {
    const f = { bold: false, italic: false, mono: false,
      underline: text.includes(UNDERLINE), strike: text.includes(STRIKE) };
    for (const ch of text) {
      const r = reverse.get(ch);
      if (r) {
        f.bold = r.style === 'bold' || r.style === 'bolditalic';
        f.italic = r.style === 'italic' || r.style === 'bolditalic';
        f.mono = r.style === 'mono';
        return f;
      }
      if (/[A-Za-z0-9]/.test(ch)) return f;
    }
    return f;
  }

  function render(text, f) {
    const style = f.mono ? 'mono'
      : f.bold && f.italic ? 'bolditalic'
      : f.bold ? 'bold' : f.italic ? 'italic' : null;
    let out = '';
    for (const ch of plain(text)) {
      out += styleChar(ch, style);
      if (ch !== '\n' && ch !== ' ') {
        if (f.underline) out += UNDERLINE;
        if (f.strike) out += STRIKE;
      }
    }
    return out;
  }

  // Toggle one flag (bold|italic|mono|underline|strike) on a selection.
  function toggle(text, flag) {
    const f = flags(text);
    f[flag] = !f[flag];
    if (flag === 'mono' && f.mono) { f.bold = f.italic = false; }
    if ((flag === 'bold' || flag === 'italic') && f[flag]) f.mono = false;
    return render(text, f);
  }

  // Toggle a line prefix ("• " or numbered) on every line of a selection.
  function toggleList(text, kind) {
    const lines = text.split('\n');
    const re = kind === 'bullet' ? /^• / : /^\d+\. /;
    const all = lines.filter(l => l.trim()).every(l => re.test(l));
    let n = 0;
    return lines.map(l => {
      if (!l.trim()) return l;
      if (all) return l.replace(re, '');
      const bare = l.replace(/^• |^\d+\. /, '');
      return kind === 'bullet' ? '• ' + bare : `${++n}. ` + bare;
    }).join('\n');
  }

  const api = { plain, toggle, toggleList, flags };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Fmt = api;
})(this);
