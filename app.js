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

  // ---------- Emojis ----------
  const DEFAULT_FAVS = ['🚀', '💡', '✅', '👉', '👇', '🔥', '📌', '🎯', '💪', '🙌', '📈', '✨', '🤝', '❤️', '👏', '→', '•'];
  let favs = store.get('favs', DEFAULT_FAVS);
  let editing = false;

  function renderFavs() {
    const box = $('#favs');
    box.innerHTML = '';
    box.classList.toggle('editing', editing);
    favs.forEach((f, i) => {
      const b = document.createElement('button');
      b.textContent = f;
      b.title = editing ? 'Remove' : 'Insert';
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

  // Profile fields persist.
  for (const id of ['name', 'headline']) {
    const el = $('#' + id);
    el.textContent = store.get(id, el.textContent);
    el.addEventListener('input', () => {
      store.set(id, el.textContent);
      if (id === 'name') $('#avatar').textContent = (el.textContent.trim()[0] || 'Y').toUpperCase();
    });
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
  }
  $('#avatar').textContent = ($('#name').textContent.trim()[0] || 'Y').toUpperCase();

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
  update();
})();
