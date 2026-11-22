// Small offline spell checker. Word list: words.js (US + UK English, from SCOWL/Hunspell).
// Suggestions = known words one edit away (then two), ranked so typical typing slips
// (swapped or doubled letters) and very common words come first.
(function (root) {
  let dict = null;
  const LETTERS = "abcdefghijklmnopqrstuvwxyz'";

  // Very common words win ties ("teh" -> "the", not "tea").
  const COMMON = new Set(('the be to of and a in that have i it for not on with he as you do at this but his by ' +
    'from they we say her she or an will my one all would there their what so up out if about who get which go me ' +
    'when make can like time no just him know take people into year your good some could them see other than then ' +
    'now look only come its over think also back after use two how our work first well way even new want because ' +
    'any these give day most us is are was were has had been being does did done said made going things thing ' +
    'really very much more many need help post write writing read team life world business growth career learn ' +
    'learned learning share sharing thought great better best right still every never always something someone ' +
    'everyone today tomorrow week month here where why while again same through before between under each few ' +
    'those own such too should might must may using used build building product design designer project company ' +
    'job role skill skills idea ideas start started story stories mobile checked looks with without').split(' '));

  function load(text) { dict = new Set(text.split('\n')); }
  const ready = () => !!dict;

  function known(w) {
    if (!w) return false;
    if (dict.has(w) || dict.has(w.toLowerCase())) return true;
    if (/'s$/i.test(w)) return known(w.slice(0, -2));      // possessive: "Jay's"
    return false;
  }

  // All strings one edit away, with a cost: swaps and doubled letters are cheap,
  // changing the first letter is dear.
  function edits1(w) {
    const out = new Map();
    const put = (x, c) => { if (!out.has(x) || out.get(x) > c) out.set(x, c); };
    for (let i = 0; i <= w.length; i++) {
      const a = w.slice(0, i), b = w.slice(i);
      const first = i === 0 ? 0.5 : 0;
      if (b) put(a + b.slice(1), (b[0] === b[1] || b[0] === a.slice(-1) ? 0.4 : 1) + first);   // delete
      if (b.length > 1) put(a + b[1] + b[0] + b.slice(2), 0.2);                              // swap
      for (const c of LETTERS) {
        if (b) put(a + c + b.slice(1), 1 + first);                                           // replace
        put(a + c + b, (c === b[0] || c === a.slice(-1) ? 0.4 : 1) + first);                 // insert
      }
    }
    return out;
  }

  function matchCase(orig, s) {
    if (orig.length > 1 && orig === orig.toUpperCase()) return s.toUpperCase();
    if (orig[0] === orig[0].toUpperCase()) return s[0].toUpperCase() + s.slice(1);
    return s;
  }

  function suggest(word, n = 5) {
    if (!dict) return [];
    const w = word.toLowerCase();
    const cand = new Map();                                       // word -> cost
    const e1 = edits1(w);
    for (const [x, c] of e1) if (x !== w && dict.has(x)) cand.set(x, c);
    if (cand.size < n && w.length > 3) {
      let added = 0;
      for (const [a, c1] of e1) {
        for (const [x, c2] of edits1(a)) {
          if (x !== w && !cand.has(x) && dict.has(x)) { cand.set(x, 1 + c1 + c2); added++; }
        }
        if (added > 60) break;
      }
    }
    const score = (x, c) => c - (COMMON.has(x) ? 0.9 : 0) + Math.abs(x.length - w.length) * 0.05;
    const best = Math.min(9, ...[...cand].map(([x, c]) => score(x, c)));
    // Two words run together: "alot" -> "a lot" always; longer splits only when nothing closer fits.
    for (let i = 1; i < w.length; i++) {
      const l = w.slice(0, i), r = w.slice(i);
      if (!dict.has(l) || !dict.has(r) || r.length < 2) continue;
      const ok = x => COMMON.has(x) || x.length > 3;
      if (l === 'a' || l === 'i') cand.set(l + ' ' + r, 0.1);
      else if (best > 0.5 && ok(l) && ok(r)) cand.set(l + ' ' + r, 0.6);
    }
    return [...cand].map(([x, c]) => [x, x.includes(' ') ? c : score(x, c)])
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .slice(0, n).map(([x]) => matchCase(word, x));
  }

  // Misspelled words in text: [{ start, end, word, plain }]. Skips links, #tags, @names,
  // acronyms (ALL CAPS), names with inner capitals (LinkedIn, SaaS) and non-English letters.
  function find(text, plainFn = s => s, ignored = []) {
    if (!dict) return [];
    const ign = new Set(ignored.map(x => x.toLowerCase()));
    const skip = [];
    for (const m of text.matchAll(/https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+/g)) skip.push([m.index, m.index + m[0].length]);
    const out = [];
    for (const m of text.matchAll(/[\p{L}\p{M}'’]+/gu)) {
      const start = m.index, end = start + m[0].length;
      if (skip.some(([a, b]) => start >= a && start < b)) continue;
      if (/[#@]/.test(text[start - 1] || '')) continue;
      const plain = plainFn(m[0]).replace(/[̶̲]/g, '').replace(/’/g, "'").replace(/^'+|'+$/g, '');
      if (plain.length < 2 || /[^A-Za-z']/.test(plain)) continue;
      if (/[A-Z]/.test(plain.slice(1))) continue;
      if (ign.has(plain.toLowerCase()) || known(plain)) continue;
      out.push({ start, end, word: m[0], plain });
    }
    return out;
  }

  const api = { load, ready, known, suggest, find };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Spell = api;
})(this);
