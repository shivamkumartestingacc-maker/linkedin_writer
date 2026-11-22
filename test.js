// Run: node test.js
const assert = require('assert');
const { plain, toggle, toggleList, continueList } = require('./format.js');

const b = toggle('Hello 2026', 'bold');
assert.strictEqual(b, '𝗛𝗲𝗹𝗹𝗼 𝟮𝟬𝟮𝟲');
assert.strictEqual(plain(b), 'Hello 2026');
assert.strictEqual(toggle(b, 'bold'), 'Hello 2026');            // toggle off
assert.strictEqual(toggle(b, 'italic'), '𝙃𝙚𝙡𝙡𝙤 𝟮𝟬𝟮𝟲');        // bold -> bold italic
assert.strictEqual(toggle(toggle(b, 'italic'), 'bold'), '𝘏𝘦𝘭𝘭𝘰 2026'); // -> italic only
assert.strictEqual(plain(toggle('ab', 'underline')), 'ab');
assert.strictEqual(toggle(toggle('ab', 'strike'), 'strike'), 'ab');
assert.strictEqual(toggle('Hi 👋', 'bold'), '𝗛𝗶 👋');          // emoji untouched
assert.strictEqual(toggleList('a\nb', 'bullet'), '• a\n• b');
assert.strictEqual(toggleList('• a\n• b', 'bullet'), 'a\nb');
assert.strictEqual(toggleList('a\n\nb', 'number'), '1. a\n\n2. b');
assert.strictEqual(toggleList('x\ny\nz', 'alpha'), 'a. x\nb. y\nc. z');
assert.strictEqual(toggleList('a. x\nb. y', 'alpha'), 'x\ny');
assert.strictEqual(toggleList('x\ny', 'emoji', '📌'), '📌 x\n📌 y');
assert.strictEqual(toggleList('📌 x\n📌 y', 'emoji', '👉'), '👉 x\n👉 y');           // switch marker
assert.strictEqual(toggleList('👉 x\n👉 y', 'emoji', '👉'), 'x\ny');                // toggle off
assert.strictEqual(toggleList('1. x\n2. y', 'alpha'), 'a. x\nb. y');
assert.deepStrictEqual(continueList('b. item'), { next: 'c. ', empty: false, len: 3 });
assert.strictEqual(continueList('9. x').next, '10. ');
assert.strictEqual(continueList('→ x').next, '→ ');
assert.strictEqual(continueList('👉🏽 x').next, '👉🏽 ');
assert.strictEqual(continueList('📌 ').empty, true);
assert.strictEqual(continueList('Plain line'), null);
assert.strictEqual(continueList('🚀Launch'), null);                                  // emoji needs a space after it
const { check } = require('./rules.js');
assert.strictEqual(check('Hook\n\na. x\nb. y\nc. z').rules.find(r => r.id === 'list').status, 'ok');
const st = (t, id) => check(t).rules.find(r => r.id === id).status;
const post = 'Short hook here.\n\nLine one.\nLine two.\nLine three.\nLine four is too many.\n\nWhat do you think?';
const r = check(post);
assert.strictEqual(st(post, 'hook'), 'ok');
assert.strictEqual(st(post, 'gap'), 'ok');
assert.strictEqual(st(post, 'para'), 'warn');
assert.deepStrictEqual(r.rules.find(x => x.id === 'para').lines, [5]);   // only the 4th line
assert.ok(r.lineIssues[5][0].startsWith('Line 4 in a row'));
assert.strictEqual(st(post, 'question'), 'ok');
assert.strictEqual(st('Hook\nno gap', 'gap'), 'warn');
assert.strictEqual(st('Hook\n\n👉 a\n👉 b\n👉 c\n👉 d', 'list'), 'ok');
assert.strictEqual(st('Hook\n\n👉 a\n📌 b\n👉 c', 'list'), 'warn');
assert.strictEqual(st('Hook\n\n❌ a\n✅ b', 'list'), 'ok');
assert.strictEqual(st('Hook\n\n👉 a\n👉 b\n👉 c\n👉 d\n👉 e\n👉 f\n👉 g\nx', 'para'), 'ok'); // list lines don't count
assert.strictEqual(st('This is the very best idea', 'buzz'), 'warn');
assert.strictEqual(st('Everybody loves this', 'buzz'), 'ok');               // "very" inside a word
assert.strictEqual(st('Hook\n\nP.S. thanks?\nDone.', 'question'), 'warn');
assert.strictEqual(st('one two three four five six seven eight nine ten eleven twelve thirteen', 'hook'), 'warn');
console.log('ok');
