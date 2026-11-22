// Jay's LinkedIn writing rules, checked automatically where text alone can tell.
// Hints only: nothing here blocks writing or copying.
(function (root) {
  const MAX_PARA_LINES = 3;   // flag the 4th line in a row
  const MAX_HOOK_WORDS = 12;
  const MAX_SENTENCE_WORDS = 15;
  const BUZZ = ['best', 'synergy', 'synergies', 'next-gen', 'next gen', 'leverage', 'game-changer',
    'game changer', 'cutting-edge', 'world-class', 'innovative', 'disruptive', 'paradigm', 'holistic',
    'seamless', 'robust', 'revolutionize', 'revolutionary', 'thought leader', 'rockstar', 'ninja', 'very'];
  const LIST = /^(\p{Extended_Pictographic}|[•◦▪▸►→\-–*]|\d+[.)]\s|[a-z][.)]\s)/u;
  const SUB = /^↳/;
  const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter() : null;
  const firstChar = s => seg ? seg.segment(s)[Symbol.iterator]().next().value.segment : [...s][0];
  const words = s => s.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w));
  const buzzRe = BUZZ.map(b => [b, new RegExp(`(^|[^\\p{L}])${b}([^\\p{L}]|$)`, 'iu')]);

  // text must be plain (no Unicode-styled letters), so pass it through Fmt.plain first.
  function check(text) {
    const lines = text.split('\n');
    const rules = [];
    const lineIssues = {};
    const flag = (i, msg) => (lineIssues[i] ||= []).push(msg);
    const add = (id, label, status, detail = '', ls = []) =>
      rules.push({ id, label, status, detail, lines: [...new Set(ls)] });

    const filled = lines.map((l, i) => [l.trim(), i]).filter(([l]) => l);
    if (!filled.length) return { rules, lineIssues };

    // Hook: first line, short, followed by a blank line.
    const [hook, hi] = filled[0];
    const hw = words(hook).length;
    if (hw > MAX_HOOK_WORDS) flag(hi, `Hook is ${hw} words. Aim for ${MAX_HOOK_WORDS} or fewer.`);
    add('hook', `Hook is ${MAX_HOOK_WORDS} words or fewer`, hw > MAX_HOOK_WORDS ? 'warn' : 'ok', `${hw} words`, hw > MAX_HOOK_WORDS ? [hi] : []);
    const gap = hi + 1 >= lines.length || !lines[hi + 1].trim();
    if (!gap) flag(hi + 1, 'Leave a blank line after the hook.');
    add('gap', 'Blank line after the hook', gap ? 'ok' : 'warn', '', gap ? [] : [hi + 1]);

    // Paragraphs: count consecutive text lines; list lines don't count.
    const over = [];
    let run = 0;
    lines.forEach((l, i) => {
      const t = l.trim();
      if (!t || LIST.test(t) || SUB.test(t)) { run = 0; return; }
      if (++run > MAX_PARA_LINES) {
        over.push(i);
        flag(i, `Line ${run} in a row. Keep paragraphs to ${MAX_PARA_LINES} lines, then a blank line.`);
      }
    });
    add('para', `Paragraphs are ${MAX_PARA_LINES} lines or fewer`, over.length ? 'warn' : 'ok', over.length ? `${over.length} line(s) over` : '', over);

    // Sentences.
    const longS = [];
    lines.forEach((l, i) => {
      for (const s of l.split(/(?<=[.!?])\s+/)) {
        const n = words(s).length;
        if (n > MAX_SENTENCE_WORDS) { longS.push(i); flag(i, `Sentence has ${n} words. Break it under ${MAX_SENTENCE_WORDS + 1}.`); }
      }
    });
    add('sent', `Sentences are ${MAX_SENTENCE_WORDS} words or fewer`, longS.length ? 'warn' : 'ok', longS.length ? `${longS.length} long` : '', longS);

    // Lists: runs of marker lines (↳ sub-points don't count as items).
    const listBad = [];
    for (let i = 0; i < lines.length;) {
      if (!LIST.test(lines[i].trim())) { i++; continue; }
      const start = i, marks = [];
      for (; i < lines.length && (LIST.test(lines[i].trim()) || SUB.test(lines[i].trim())); i++) {
        if (!SUB.test(lines[i].trim())) { const t = lines[i].trim(); marks.push(/^\d+[.)]\s/.test(t) ? '#' : /^[a-z][.)]\s/.test(t) ? 'a' : firstChar(t)); }
      }
      const n = marks.length, kinds = new Set(marks);
      const pairs = [...kinds].every(m => m === '❌' || m === '✅');
      if (n >= 2 && !pairs && (n < 3 || n > 6)) { listBad.push(start); flag(start, `List has ${n} items. Aim for 3 to 6.`); }
      if (kinds.size > 1 && !pairs) { listBad.push(start); flag(start, 'Use the same marker on every list item.'); }
    }
    add('list', 'Lists: 3 to 6 items, same marker', listBad.length ? 'warn' : 'ok', '', listBad);

    // ❌/✅ pairs.
    const xs = lines.map((l, i) => [l.trim(), i]).filter(([l]) => l.startsWith('❌')).map(([, i]) => i);
    add('pairs', '❌/✅ pairs used at most twice', xs.length > 2 ? 'warn' : 'ok', xs.length ? `${xs.length} used` : '', xs.length > 2 ? xs : []);

    // Buzzwords and "very".
    const found = new Set(), buzzLines = [];
    lines.forEach((l, i) => {
      const hit = buzzRe.filter(([, re]) => re.test(l)).map(([b]) => b);
      if (hit.length) { hit.forEach(b => found.add(b)); buzzLines.push(i); flag(i, `Cut: ${hit.join(', ')}.`); }
    });
    add('buzz', 'No buzzwords or "very"', found.size ? 'warn' : 'ok', [...found].join(', '), buzzLines);

    // Specific numbers.
    const num = /\d/.test(text);
    add('num', 'Uses a specific number', num ? 'ok' : 'info', num ? '' : 'Add one if you can.');

    // Length.
    const wc = words(text).length, cut = Math.round(wc * 0.8);
    if (wc > 200) add('len', 'Short post: 80 to 200 words', 'warn', `${wc} words. Split into labeled sections or use a carousel. A 20% cut is about ${cut}.`);
    else if (wc < 80) add('len', 'Short post: 80 to 200 words', 'info', `${wc} words so far.`);
    else add('len', 'Short post: 80 to 200 words', 'ok', `${wc} words. A 20% cut is about ${cut}.`);

    // Ending: an easy question near the end (P.S. lines ignored).
    const tail = filled.filter(([l]) => !/^p\.?\s?s\b/i.test(l)).slice(-2);
    const q = tail.some(([l]) => l.includes('?'));
    add('question', 'Ends with an easy question', q ? 'ok' : 'warn', q ? '' : 'Ask a yes/no or simple-choice question.');

    return { rules, lineIssues };
  }

  // Things only you can judge.
  const MANUAL = [
    'One main point',
    'Wrote the strongest line first',
    'First 3 lines state the point together',
    'One takeaway line, on its own line',
    'Everyday words. Clear beats clever',
    'Active voice where possible',
    'Cut about 20% on the final read',
    'Read it aloud: sounds like you talking',
    'Written to one person, not a crowd',
    'One line of genuine thanks or feeling',
  ];

  const api = { check, MANUAL };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Rules = api;
})(this);
