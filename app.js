(() => {
  const $ = s => document.querySelector(s);
  const ta = $('#text');
  const body = $('#body');
  const seeMore = $('#see-more');

  // localStorage can throw (private mode, blocked storage). Never let it break the app.
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  // ---------- Editor ----------
  // execCommand keeps native undo/redo working; setRangeText is the fallback.
  function replaceSelection(fn) {
    let s = ta.selectionStart, e = ta.selectionEnd;
    if (s === e) { toast('Select some text first'); return; }
    const out = fn(ta.value.slice(s, e));
    ta.focus();
    if (!document.execCommand('insertText', false, out)) ta.setRangeText(out, s, e, 'end');
    ta.setSelectionRange(s, s + out.length);
    update();
  }

  function insert(str) {
    ta.focus();
    if (!document.execCommand('insertText', false, str)) {
      ta.setRangeText(str, ta.selectionStart, ta.selectionEnd, 'end');
    }
    update();
  }

  document.querySelectorAll('[data-fmt]').forEach(b =>
    b.addEventListener('click', () => replaceSelection(t => Fmt.toggle(t, b.dataset.fmt))));

  // Lists act on whole lines, so widen the selection to line edges first.
  document.querySelectorAll('[data-list]').forEach(b => b.addEventListener('click', () => {
    const v = ta.value;
    const s = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    let end = ta.selectionEnd;
    if (end > ta.selectionStart && v[end - 1] === '\n') end--;
    let e = v.indexOf('\n', end);
    if (e === -1) e = v.length;
    ta.setSelectionRange(s, e);
    if (s === e) { insert(b.dataset.list === 'bullet' ? '• ' : '1. '); return; }
    replaceSelection(t => Fmt.toggleList(t, b.dataset.list));
  }));

  $('#clear').addEventListener('click', () => replaceSelection(Fmt.plain));

  ta.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = { b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase()];
    if (k) { e.preventDefault(); replaceSelection(t => Fmt.toggle(t, k)); }
  });

  ta.addEventListener('input', update);
  for (const ev of ['keyup', 'click', 'select']) ta.addEventListener(ev, showNow);

  // ---------- Jay's rules ----------
  let lineIssues = {};

  function lineStart(i) {
    let pos = 0;
    const ls = ta.value.split('\n');
    for (let k = 0; k < i; k++) pos += ls[k].length + 1;
    return [pos, pos + (ls[i] || '').length];
  }

  // Live hint for the line the caret is on.
  function showNow() {
    const i = ta.value.slice(0, ta.selectionStart).split('\n').length - 1;
    const msgs = lineIssues[i] || [];
    $('#now').textContent = msgs.length ? '⚠ ' + msgs.join(' ') : '';
    ta.classList.toggle('warn', msgs.length > 0);
  }

  function runRules() {
    const { rules, lineIssues: li } = Rules.check(Fmt.plain(ta.value));
    lineIssues = li;
    const warns = rules.filter(r => r.status === 'warn').length;
    $('#rule-count').textContent = rules.length ? (warns ? `${warns} to fix` : 'all good') : '';
    $('#rule-count').className = 'badge ' + (warns ? 'warn' : 'ok');
    const pass = rules.filter(r => r.status !== 'warn').length;  // info items aren't failures
    $('#progress-text').innerHTML = rules.length ? `Rules <b>${pass} of ${rules.length}</b> passing` : '';
    $('#progress-bars').innerHTML = rules.map(r => `<i class="${r.status}"></i>`).join('');
    const ul = $('#auto-rules');
    ul.innerHTML = '';
    if (!rules.length) {
      ul.innerHTML = '<li class="hint">Start writing to see checks.</li>';
    }
    for (const r of rules) {
      const li = document.createElement('li');
      li.className = r.status;
      const icon = { ok: '✓', warn: '⚠', info: 'ℹ' }[r.status];
      li.innerHTML = `<span class="ic">${icon}</span><span><b></b> <span class="d"></span></span>`;
      li.querySelector('b').textContent = r.label;
      li.querySelector('.d').textContent = r.detail;
      if (r.lines.length) {
        const jump = document.createElement('button');
        jump.type = 'button';
        jump.className = 'jump';
        jump.textContent = 'line ' + r.lines.map(n => n + 1).join(', ');
        jump.title = 'Select this line in the editor';
        jump.addEventListener('click', () => {
          ta.focus();
          ta.setSelectionRange(...lineStart(r.lines[0]));
          showNow();
        });
        li.querySelector('span:last-child').append(' ', jump);
      }
      ul.appendChild(li);
    }
    showNow();
  }

  let manual = store.get('manual', []);
  function renderManual() {
    const ul = $('#manual-rules');
    ul.innerHTML = '';
    Rules.MANUAL.forEach((m, i) => {
      const li = document.createElement('li');
      const id = 'manual-' + i;
      li.innerHTML = `<input type="checkbox" id="${id}"><label for="${id}"></label>`;
      li.querySelector('label').textContent = m;
      const cb = li.querySelector('input');
      cb.checked = manual.includes(i);
      cb.addEventListener('change', () => {
        manual = cb.checked ? [...manual, i] : manual.filter(x => x !== i);
        store.set('manual', manual);
      });
      ul.appendChild(li);
    });
  }
  $('#reset-manual').addEventListener('click', () => { manual = []; store.set('manual', manual); renderManual(); });

  // ---------- Emojis ----------
  const DEFAULT_FAVS = ['🚀', '💡', '✅', '👉', '👇', '🔥', '📌', '🎯', '💪', '🙌', '📈', '✨', '🤝', '❤️', '👏', '→', '•'];
  let favs = store.get('favs', DEFAULT_FAVS);
  let editing = false;
  let dragFrom = null;

  function renderFavs() {
    const box = $('#favs');
    box.innerHTML = '';
    box.classList.toggle('editing', editing);
    favs.forEach((f, i) => {
      const b = document.createElement('button');
      b.textContent = f;
      b.title = editing ? 'Drag to move, click to remove' : 'Insert';
      if (editing) {
        b.draggable = true;
        b.addEventListener('dragstart', e => { dragFrom = i; b.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
        b.addEventListener('dragend', () => b.classList.remove('dragging'));
        b.addEventListener('dragover', e => { e.preventDefault(); b.classList.add('drop-target'); });
        b.addEventListener('dragleave', () => b.classList.remove('drop-target'));
        b.addEventListener('drop', e => {
          e.preventDefault();
          if (dragFrom === null || dragFrom === i) return renderFavs();
          favs.splice(i, 0, favs.splice(dragFrom, 1)[0]);
          dragFrom = null;
          saveFavs();
        });
      }
      b.addEventListener('click', () => {
        if (editing) { favs.splice(i, 1); saveFavs(); } else insert(f);
      });
      box.appendChild(b);
    });
  }
  function saveFavs() { store.set('favs', favs); renderFavs(); }
  function addFav(f) {
    f = f.trim();
    if (!f) return;
    if (favs.includes(f)) { toast(f + ' already in favourites'); return; }
    favs.push(f); saveFavs(); toast('Added ' + f);
  }

  $('#edit-favs').addEventListener('click', () => {
    editing = !editing;
    $('#edit-favs').textContent = editing ? 'Done' : 'Edit';
    $('#edit-favs').classList.toggle('on', editing);
    $('#fav-editor').hidden = !editing;
    if (editing) $('#picker').hidden = false;
    renderFavs();
  });
  $('#add-fav').addEventListener('submit', e => {
    e.preventDefault(); addFav($('#fav-input').value); $('#fav-input').value = '';
  });
  $('#reset-favs').addEventListener('click', () => { favs = [...DEFAULT_FAVS]; saveFavs(); });
  $('#more-emoji').addEventListener('click', () => { $('#picker').hidden = !$('#picker').hidden; });

  // Built once; clicking inserts, or adds to favourites while editing.
  const picker = $('#picker');
  for (const [group, list] of Object.entries(window.EMOJIS)) {
    const h = document.createElement('div');
    h.className = 'group'; h.textContent = group;
    picker.appendChild(h);
    const row = document.createElement('div');
    row.className = 'grid';
    list.split(' ').filter(Boolean).forEach(em => {
      const b = document.createElement('button');
      b.textContent = em;
      b.addEventListener('click', () => editing ? addFav(em) : insert(em));
      row.appendChild(b);
    });
    picker.appendChild(row);
  }

  // ---------- Preview ----------
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // LinkedIn colours hashtags, @mentions and links blue.
  const linkify = s => esc(s).replace(/(https?:\/\/[^\s]+|#[\p{L}\p{N}_]+|@[\p{L}\p{N}_]+)/gu, '<span class="link">$1</span>');

  let view = 'collapsed';

  function update() {
    const t = ta.value;
    body.innerHTML = linkify(t);
    $('#count').textContent = t.length;
    $('#count').parentElement.classList.toggle('over', t.length > 3000);
    store.set('draft', t);
    runRules();
    layoutSeeMore();
  }

  // Show "…more" only when text actually overflows the 3-line clamp.
  function layoutSeeMore() {
    body.classList.toggle('collapsed', view === 'collapsed');
    seeMore.hidden = !(view === 'collapsed' && body.scrollHeight > body.clientHeight + 1);
  }

  function setView(v) {
    view = v;
    document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    layoutSeeMore();
  }
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  seeMore.addEventListener('click', () => setView('expanded'));

  document.querySelectorAll('[data-device]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[data-device]').forEach(x => x.classList.toggle('on', x === b));
    $('#card').className = 'card ' + b.dataset.device;
    layoutSeeMore();
  }));
  window.addEventListener('resize', layoutSeeMore);

  // Image: local only, never uploaded anywhere.
  const img = $('#post-img');
  $('#img').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    if (img.src) URL.revokeObjectURL(img.src);
    img.src = URL.createObjectURL(f);
    img.hidden = false; $('#img-remove').hidden = false;
  });
  $('#img-remove').addEventListener('click', () => {
    URL.revokeObjectURL(img.src); img.removeAttribute('src');
    img.hidden = true; $('#img-remove').hidden = true; $('#img').value = '';
  });

  // Profile: saved edits win, then window.PROFILE defaults, then placeholders.
  const P = window.PROFILE || {};
  const initial = () => { $('#avatar-initial').textContent = ($('#name').textContent.trim()[0] || 'Y').toUpperCase(); };
  for (const id of ['name', 'headline']) {
    const el = $('#' + id);
    const placeholder = el.textContent;
    const saved = store.get(id, null);
    el.textContent = saved && saved !== placeholder ? saved : (P[id] || placeholder);
    el.addEventListener('input', () => { store.set(id, el.textContent); if (id === 'name') initial(); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
  }
  initial();
  const avatarImg = $('#avatar-img');
  function showAvatar(src) {
    avatarImg.hidden = !src;
    $('#avatar-initial').hidden = !!src;
    if (src) avatarImg.src = src;
  }
  showAvatar(store.get('avatar', null) || P.avatar);
  // Photo is shrunk to 160px so it fits in browser storage.
  $('#avatar-file').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 160;
      const s = Math.min(im.width, im.height);
      c.getContext('2d').drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 160, 160);
      const url = c.toDataURL('image/jpeg', 0.85);
      URL.revokeObjectURL(im.src);
      store.set('avatar', url);
      showAvatar(url);
    };
    im.src = URL.createObjectURL(f);
  });

  // Your own earlier post under the preview, so the feed looks real. Only shown when
  // window.PROFILE.demo is set (the private build), never in the public repo.
  if (P.demo) {
    const d = P.demo;
    const box = $('#feed-below');
    box.innerHTML = `<p class="demo-label">Earlier in your feed</p>
      <article class="card desktop demo">
        <div class="author">
          <div class="avatar"><img alt=""></div>
          <div class="who-text">
            <div class="name-row"><span class="name"></span><span class="in-badge">in</span><span class="you">• You</span></div>
            <div class="headline"></div>
            <div class="when">${esc(d.age)} • ${$('.when svg').outerHTML}</div>
          </div>
          <span class="dots" aria-hidden="true">•••</span>
        </div>
        <div class="body-wrap">
          <div class="body collapsed">${(d.mentions || []).reduce((h, m) => h.split(esc(m)).join(`<span class="link">${esc(m)}</span>`), linkify(d.text))}</div>
          <button class="see-more" type="button">…more</button>
        </div>
        <div class="counts"><span><span class="heart-mini">❤️</span><span class="num">${esc(d.reactions)}</span></span><span>${esc(d.comments)} comments</span></div>
        ${$('#card .actions').outerHTML}
      </article>`;
    const card = box.querySelector('.demo');
    const img = card.querySelector('.avatar img');
    img.src = avatarImg.src || '';
    img.hidden = !avatarImg.src;
    card.querySelector('.name').textContent = $('#name').textContent;
    card.querySelector('.headline').textContent = $('#headline').textContent;
    card.querySelector('.see-more').addEventListener('click', e => {
      card.querySelector('.body').classList.remove('collapsed');
      e.currentTarget.hidden = true;
    });
  }

  // ---------- Theme ----------
  const root = document.documentElement;
  const isDark = () => (root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
  function applyTheme(t) {
    if (t) root.dataset.theme = t;
    $('#theme').textContent = isDark() ? '☀ Light' : '☾ Dark';
  }
  applyTheme(store.get('theme', null));
  $('#theme').addEventListener('click', () => {
    const t = isDark() ? 'light' : 'dark';
    store.set('theme', t);
    applyTheme(t);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());

  // Rules list open/closed is remembered.
  const rulesBox = $('#rules');
  rulesBox.open = store.get('rules-open', true);
  rulesBox.addEventListener('toggle', () => store.set('rules-open', rulesBox.open));

  // ---------- Copy ----------
  // The text already holds the Unicode styled characters, so a plain-text copy
  // pastes into LinkedIn looking exactly like the editor.
  $('#copy').addEventListener('click', async () => {
    const t = ta.value;
    if (!t) { toast('Nothing to copy'); return; }
    try { await navigator.clipboard.writeText(t); }
    catch {
      ta.focus(); ta.select(); document.execCommand('copy');
    }
    toast('Copied. Paste into LinkedIn.');
  });

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
  }

  // ---------- Init ----------
  ta.value = store.get('draft', '');
  renderFavs();
  renderManual();
  update();
})();
