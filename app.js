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
  function applyList(kind, emoji) {
    const v = ta.value;
    const s = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    let end = ta.selectionEnd;
    if (end > ta.selectionStart && v[end - 1] === '\n') end--;
    let e = v.indexOf('\n', end);
    if (e === -1) e = v.length;
    ta.setSelectionRange(s, e);
    if (s === e) { insert(Fmt.marker(kind, 1, emoji)); return; }
    replaceSelection(t => Fmt.toggleList(t, kind, emoji));
  }
  document.querySelectorAll('[data-list]').forEach(b => b.addEventListener('click', () => applyList(b.dataset.list)));

  // Emoji list: choose the starter from your favourites; it is remembered for next time.
  let starter = store.get('starter', '📌');
  const pop = $('#starter-pop');
  $('#emoji-list-mark').textContent = starter;
  function openStarter(open) {
    pop.hidden = !open;
    $('#emoji-list').setAttribute('aria-expanded', open);
    if (!open) return;
    const grid = $('#starter-grid');
    grid.innerHTML = '';
    favs.forEach(f => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = f;
      b.classList.toggle('on', f === starter);
      b.addEventListener('click', () => {
        starter = f; store.set('starter', f);
        $('#emoji-list-mark').textContent = f;
        openStarter(false);
        applyList('emoji', f);
      });
      grid.appendChild(b);
    });
  }
  $('#emoji-list').addEventListener('click', e => { e.stopPropagation(); openStarter(pop.hidden); });
  document.addEventListener('click', e => { if (!pop.hidden && !pop.contains(e.target)) openStarter(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) openStarter(false); });

  $('#clear').addEventListener('click', () => replaceSelection(Fmt.plain));
  // Native undo history (execCommand keeps it for our formatting too).
  $('#undo').addEventListener('click', () => { ta.focus(); document.execCommand('undo'); update(); });
  $('#redo').addEventListener('click', () => { ta.focus(); document.execCommand('redo'); update(); });

  ta.addEventListener('keydown', e => {
    // Enter on a list line starts the next item with the same marker (next number or letter).
    // Enter on an empty item ends the list. Shift+Enter always makes a plain new line.
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.isComposing && ta.selectionStart === ta.selectionEnd) {
      const v = ta.value, pos = ta.selectionStart;
      const ls = v.lastIndexOf('\n', pos - 1) + 1;
      let le = v.indexOf('\n', pos); if (le === -1) le = v.length;
      const c = Fmt.continueList(v.slice(ls, le));
      if (c && pos >= ls + c.len) {
        e.preventDefault();
        if (c.empty) {
          ta.setSelectionRange(ls, ls + c.len);
          if (!document.execCommand('delete')) ta.setRangeText('', ls, ls + c.len, 'end');
          ta.setSelectionRange(ls, ls);
          update();
        }
        else insert('\n' + c.next);
        return;
      }
    }
    if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); focusFav(0); return; }
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = { b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase()];
    if (k) { e.preventDefault(); replaceSelection(t => Fmt.toggle(t, k)); }
  });

  // Paste always lands as clean plain text. Cmd/Ctrl+Shift+V (with or without Option)
  // also removes bold/italic styling. Browsers don't say which keys made a paste, so remember them.
  let purePaste = false;
  ta.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'v') purePaste = true;
  });
  ta.addEventListener('paste', e => {
    const raw = e.clipboardData && e.clipboardData.getData('text/plain');
    const pure = purePaste;
    purePaste = false;
    if (!raw) return;
    e.preventDefault();
    insert(Fmt.cleanPaste(raw, pure));
    if (pure) toast('Pasted as plain text');
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
      b.tabIndex = -1;  // reached with Option/Alt+Down, then arrow keys
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
  // Keyboard: Option/Alt+Down in the text jumps into the favourites. Arrows move,
  // Enter drops the emoji at the cursor, Esc (or Up from the first row) goes back to the text.
  const favBox = $('#favs');
  function focusFav(i) {
    const btns = [...favBox.children];
    if (!btns.length) return;
    i = Math.max(0, Math.min(btns.length - 1, i));
    btns.forEach((b, k) => b.classList.toggle('kbd', k === i));
    favBox.classList.add('kbd-nav');
    btns[i].focus();
  }
  function leaveFavs() {
    favBox.classList.remove('kbd-nav');
    [...favBox.children].forEach(b => b.classList.remove('kbd'));
    ta.focus();
  }
  favBox.addEventListener('keydown', e => {
    const btns = [...favBox.children];
    const i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    const cols = btns.filter(b => b.offsetTop === btns[0].offsetTop).length || 1;
    const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key];
    if (move !== undefined) {
      e.preventDefault();
      if (e.key === 'ArrowUp' && i < cols) return leaveFavs();
      return focusFav(i + move);
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (editing) return;
      leaveFavs();
      insert(btns[i].textContent);
    } else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); leaveFavs(); }
  });
  favBox.addEventListener('focusout', e => { if (!favBox.contains(e.relatedTarget)) favBox.classList.remove('kbd-nav'); });

  function saveFavs() { store.set('favs', favs); renderFavs(); }
  function addFav(f) {
    f = f.trim();
    if (!f) return;
    if (favs.includes(f)) { toast(f + ' already in favourites'); return; }
    favs.push(f); saveFavs(); toast('Added ' + f);
  }

  $('#edit-favs').addEventListener('click', () => {
    editing = !editing;
    $('#edit-favs').title = editing ? 'Done editing favourites' : 'Edit favourite emojis';
    $('#edit-favs').setAttribute('aria-pressed', editing);
    $('#edit-favs').classList.toggle('on', editing);
    $('#fav-editor').hidden = !editing;
    showPicker(editing || !$('#picker').hidden);
    renderFavs();
  });
  $('#add-fav').addEventListener('submit', e => {
    e.preventDefault(); addFav($('#fav-input').value); $('#fav-input').value = '';
  });
  $('#reset-favs').addEventListener('click', () => { favs = [...DEFAULT_FAVS]; saveFavs(); });
  function showPicker(on) {
    $('#picker').hidden = !on;
    $('#more-emoji').classList.toggle('on', on);
    $('#more-emoji').setAttribute('aria-pressed', on);
  }
  $('#more-emoji').addEventListener('click', () => showPicker($('#picker').hidden));

  // Built once; clicking inserts, or adds to favourites while editing.
  // A sticky row of tabs (one per category) scrolls to that category.
  const picker = $('#picker');
  const tabs = document.createElement('div');
  tabs.className = 'picker-tabs';
  tabs.setAttribute('role', 'tablist');
  picker.appendChild(tabs);
  const heads = [];
  for (const [group, list] of Object.entries(window.EMOJIS)) {
    const h = document.createElement('div');
    h.className = 'group'; h.textContent = group;
    picker.appendChild(h);
    heads.push(h);
    const tab = document.createElement('button');
    tab.type = 'button'; tab.title = group; tab.setAttribute('aria-label', group);
    tab.textContent = list.split(' ').find(Boolean);
    tab.addEventListener('click', () => picker.scrollTo({ top: h.offsetTop - tabs.offsetHeight, behavior: 'smooth' }));
    tabs.appendChild(tab);
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
  // Highlight the tab of the category at the top of the list.
  const markTab = () => {
    let i = 0;
    heads.forEach((h, k) => { if (h.offsetTop - tabs.offsetHeight <= picker.scrollTop + 4) i = k; });
    [...tabs.children].forEach((t, k) => t.classList.toggle('on', k === i));
  };
  picker.addEventListener('scroll', markTab);
  markTab();

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
    // Grow with the text, like a page (the column scrolls, not the box).
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
    runRules();
    layoutSeeMore();
  }

  // Show "…more" only when text actually overflows the 3-line clamp.
  // Measure against the 3-line clamp, then show "…more" (collapsed) or "…see less" (expanded).
  function layoutSeeMore() {
    body.classList.add('collapsed');
    const long = body.scrollHeight > body.clientHeight + 1;
    body.classList.toggle('collapsed', view === 'collapsed');
    seeMore.hidden = !(view === 'collapsed' && long);
    $('#see-less').hidden = !(view === 'expanded' && long);
  }

  function setView(v) {
    view = v;
    document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    layoutSeeMore();
  }
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  seeMore.addEventListener('click', () => setView('expanded'));
  $('#see-less').addEventListener('click', () => setView('collapsed'));

  document.querySelectorAll('[data-device]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[data-device]').forEach(x => x.classList.toggle('on', x === b));
    $('#card').className = 'card ' + b.dataset.device;
    layoutSeeMore();
  }));
  window.addEventListener('resize', layoutSeeMore);

  // Image: an editable sample graphic in the chosen shape, or your own upload (stays on your computer).
  const img = $('#post-img');
  let imgMode = store.get('img-mode', 'landscape');
  let uploaded = null;
  function showImage() {
    $('#card').dataset.img = imgMode;
    document.querySelectorAll('[data-img]').forEach(b => b.classList.toggle('on', b.dataset.img === imgMode));
    img.hidden = imgMode === 'none' || !uploaded;
    if (!img.hidden) img.src = uploaded;
    $('#sample-img').hidden = imgMode === 'none' || !!uploaded;
    $('#img-remove').hidden = !uploaded;
  }
  document.querySelectorAll('[data-img]').forEach(b => b.addEventListener('click', () => {
    imgMode = b.dataset.img; store.set('img-mode', imgMode); showImage();
  }));
  $('#img').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    if (uploaded) URL.revokeObjectURL(uploaded);
    uploaded = URL.createObjectURL(f);
    if (imgMode === 'none') imgMode = 'landscape';
    showImage();
  });
  $('#img-remove').addEventListener('click', () => {
    URL.revokeObjectURL(uploaded); uploaded = null; $('#img').value = ''; showImage();
  });
  showImage();

  // Profile: saved edits win, then window.PROFILE defaults, then placeholders.
  const P = window.PROFILE || {};
  const initial = () => { $('#avatar-initial').textContent = ($('#name').textContent.trim()[0] || 'Y').toUpperCase(); };
  for (const id of ['name', 'headline', 'sample-text']) {
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

  // ---------- Resizable split ----------
  // Left column width in %, kept between 25 and 75. Saved per browser.
  const split = $('.split'), divider = $('#divider');
  const setLeft = pct => {
    pct = Math.min(75, Math.max(25, pct));
    split.style.setProperty('--left', pct + '%');
    divider.setAttribute('aria-valuenow', Math.round(pct));
    layoutSeeMore();
    return pct;
  };
  let leftPct = setLeft(store.get('left', 50));
  divider.addEventListener('pointerdown', e => {
    divider.setPointerCapture(e.pointerId);
    divider.classList.add('dragging');
    document.body.classList.add('resizing');
  });
  divider.addEventListener('pointermove', e => {
    if (!divider.hasPointerCapture(e.pointerId)) return;
    const r = split.getBoundingClientRect();
    leftPct = setLeft((e.clientX - r.left) / r.width * 100);
  });
  divider.addEventListener('pointerup', () => {
    divider.classList.remove('dragging');
    document.body.classList.remove('resizing');
    store.set('left', leftPct);
  });
  divider.addEventListener('dblclick', () => store.set('left', leftPct = setLeft(50)));
  divider.addEventListener('keydown', e => {
    const step = { ArrowLeft: -2, ArrowRight: 2 }[e.key];
    if (step) { e.preventDefault(); store.set('left', leftPct = setLeft(leftPct + step)); }
  });

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
  const copy = async () => {
    const t = ta.value;
    if (!t) { toast('Nothing to copy'); return; }
    try { await navigator.clipboard.writeText(t); }
    catch {
      ta.focus(); ta.select(); document.execCommand('copy');
    }
    toast('Copied. Paste into LinkedIn.');
  };
  document.querySelectorAll('.js-copy').forEach(b => b.addEventListener('click', copy));

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
