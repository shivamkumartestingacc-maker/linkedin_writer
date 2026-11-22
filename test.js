// Run: node test.js
const assert = require('assert');
const { plain, toggle, toggleList } = require('./format.js');

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
console.log('ok');
