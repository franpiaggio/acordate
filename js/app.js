/* Editor state, UI wiring, sharing and export. */
(function () {
  const T = window.Theory;
  const D = window.Diagram;
  const $ = id => document.getElementById(id);

  const STORE_PREFS = 'acorde.prefs.v1';
  const STORE_FAVS = 'acorde.sheet.v1';

  const PALETTES = {
    screen: { bg: 'transparent', ink: 'var(--ink)', soft: 'var(--soft)', line: 'var(--diagram-line)', dot: 'var(--ink)', dotText: 'var(--surface)', root: 'var(--accent)' },
    light: { bg: '#FFFFFF', ink: '#1C1F23', soft: '#6E737B', line: '#3A3E44', dot: '#1C1F23', dotText: '#FFFFFF', root: '#2E46E8' },
    dark: { bg: '#16181B', ink: '#EDEEEA', soft: '#9298A0', line: '#C9CCC5', dot: '#EDEEEA', dotText: '#16181B', root: '#8494FF' },
  };
  PALETTES.none = { ...PALETTES.light, bg: 'transparent' };

  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  };

  const prefs = Object.assign({
    rows: 5, labels: 'fingers', showFingers: true, showNotes: false, markRoot: false, lefty: false, sound: true,
    format: 'png', size: 2, bg: 'light', theme: null,
  }, read(STORE_PREFS, {}));

  const state = {
    instrument: 'guitar',
    name: 'D', nameAuto: true,
    frets: T.parseFrets('xx0232', 6),
    fingers: T.parseFingers('---132', 6),
    fingersAuto: true,
    fullBarre: false,
    startFret: null,
    lib: { root: 2, quality: '' },
  };
  let favs = read(STORE_FAVS, []);
  let lastPlaced = null;

  const chord = () => ({
    instrument: state.instrument, frets: state.frets, fingers: state.fingers,
    fullBarre: state.fullBarre, startFret: state.startFret,
  });
  const inst = () => T.INSTRUMENTS[state.instrument];

  /** Root of a chord: from its name when it parses, otherwise from what the notes sound like. */
  function rootOf(c) {
    const parsed = T.parseChordName(c.name);
    if (parsed) return parsed.root;
    const d = T.parseChordName(T.detect(c.frets, c.instrument) || '');
    return d ? d.root : null;
  }
  const rootPc = () => rootOf({ name: state.name, frets: state.frets, instrument: state.instrument });

  /* ---------- Rendering ---------- */

  function renderBoard() {
    const r = D.render(chord(), {
      rows: prefs.rows, colors: PALETTES.screen, showFingers: prefs.showFingers, showNotes: prefs.showNotes, labels: prefs.labels,
      lefty: prefs.lefty, markRoot: prefs.markRoot, rootPc: rootPc(), interactive: true,
    });
    const board = $('board');
    board.innerHTML = r.svg;
    const svg = board.querySelector('svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Diagrama de ${state.name || 'acorde'}: ${describe()}`);
    if (lastPlaced != null) {
      board.querySelector(`.dot[data-s="${lastPlaced}"]`)?.classList.add('pop');
      lastPlaced = null;
    }
    $('fret-label').textContent = state.startFret ? `${r.base}fr` : 'Auto';
    $('fret-up').disabled = r.base <= 1;
    $('fret-down').disabled = r.base >= 20;
  }

  function describe() {
    return state.frets.map((f, s) => `${inst().strings[s]} ${f < 0 ? 'apagada' : f === 0 ? 'al aire' : 'traste ' + f}`).join(', ');
  }

  function renderDetected() {
    const el = $('detected');
    const found = T.detect(state.frets, state.instrument);
    el.textContent = '';
    if (found && found !== state.name.trim()) {
      el.append('Suena como ');
      const b = document.createElement('b');
      b.textContent = found;
      el.append(b);
      const use = document.createElement('button');
      use.type = 'button';
      use.textContent = 'Usar nombre';
      use.onclick = () => { state.name = found; state.nameAuto = true; update(); };
      el.append(use);
    } else if (!prefs.showNotes) {
      const notes = state.frets.map((f, s) => (f >= 0 ? T.noteName(inst().midi[s] + f) : null)).filter(Boolean);
      el.textContent = notes.length ? notes.map(pretty).join('   ') : 'Sin notas';
    }
    if (!T.autoFinger(state.frets)) {
      const warn = document.createElement('span');
      warn.className = 'warn';
      warn.textContent = 'Esta forma necesita más de 4 dedos';
      el.append(warn);
    }
  }

  const pretty = n => n.replace('#', '♯').replace(/([A-G])b/, '$1♭');

  function renderCode() {
    $('code-frets').textContent = T.fretsCode(state.frets);
    $('code-fingers').textContent = T.fingersCode(state.fingers);
  }

  function renderTools() {
    $('auto-fingers').hidden = state.fingersAuto;
    const saved = favIndex() !== -1;
    $('fav').setAttribute('aria-pressed', String(saved));
    $('fav-label').textContent = saved ? 'Guardado' : 'Guardar';
  }

  function update({ hash = true } = {}) {
    const nameInput = $('name');
    if (document.activeElement !== nameInput) nameInput.value = state.name;
    renderBoard();
    renderDetected();
    renderCode();
    renderTools();
    markVoicing();
    if (hash) writeHash();
  }

  /* ---------- Editing ---------- */

  function refreshAuto() {
    // No playable fingering: show no numbers rather than leftovers from the previous shape.
    if (state.fingersAuto) state.fingers = T.autoFinger(state.frets) || state.frets.map(() => '');
    if (state.nameAuto) state.name = T.detect(state.frets, state.instrument) || state.name;
  }

  function pluckString(s) {
    if (!prefs.sound) return;
    const f = state.frets[s];
    if (f >= 0) window.Sound.pluck(inst().midi[s] + f);
  }

  $('board').addEventListener('click', e => {
    const target = e.target.closest('[data-f]');
    if (!target) return;
    const s = +target.dataset.s;
    const kind = target.dataset.f;
    if (kind === 'toggle') {
      state.frets[s] = state.frets[s] === 0 ? -1 : 0;
      state.fingers[s] = '';
      state.fingersAuto = true;
    } else {
      const f = +kind;
      if (state.frets[s] === f) {
        openFingerPop(s);
        pluckString(s);
        return;
      } else {
        state.frets[s] = f;
        state.fingersAuto = true;
        lastPlaced = s;
      }
    }
    refreshAuto();
    update();
    pluckString(s);
  });

  /* Small menu on an existing note: pick its finger or remove it. */
  let popString = null;
  function openFingerPop(s) {
    const pop = $('finger-pop');
    const dot = $('board').querySelector(`.dot[data-s="${s}"]`);
    const cell = $('board').querySelector(`.cell[data-s="${s}"][data-f="${state.frets[s]}"]`);
    const anchor = (dot && dot.getBoundingClientRect().width ? dot : cell).getBoundingClientRect();
    const wrap = pop.parentElement.getBoundingClientRect();
    popString = s;
    pop.hidden = false;
    pop.querySelectorAll('[data-finger]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.finger === state.fingers[s])));
    const w = pop.offsetWidth, h = pop.offsetHeight;
    const cx = anchor.left + anchor.width / 2 - wrap.left;
    const left = Math.min(Math.max(cx - w / 2, 0), wrap.width - w);
    // Sit above the note; flip below when there is no room.
    const above = anchor.top - wrap.top - h - 12;
    const below = above < -8;
    pop.classList.toggle('below', below);
    pop.style.left = left + 'px';
    pop.style.top = (below ? anchor.bottom - wrap.top + 12 : above) + 'px';
    pop.style.setProperty('--arrow', (cx - left) + 'px');
    pop.querySelector(`[data-finger="${state.fingers[s]}"]`)?.focus({ preventScroll: true });
  }
  function closeFingerPop() {
    $('finger-pop').hidden = true;
    popString = null;
  }
  $('finger-options').addEventListener('click', e => {
    const b = e.target.closest('[data-finger]');
    if (!b || popString == null) return;
    // Picking the current finger again clears the number.
    state.fingers[popString] = b.dataset.finger === state.fingers[popString] ? '' : b.dataset.finger;
    state.fingersAuto = false;
    closeFingerPop();
    update();
  });
  $('remove-note').addEventListener('click', () => {
    if (popString == null) return;
    state.frets[popString] = 0;
    state.fingers[popString] = '';
    state.fingersAuto = true;
    closeFingerPop();
    refreshAuto();
    update();
  });
  document.addEventListener('pointerdown', e => {
    if (popString != null && !e.target.closest('#finger-pop') && !e.target.closest('.cell.on')) closeFingerPop();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && popString != null) closeFingerPop(); });
  $('auto-fingers').addEventListener('click', () => { state.fingersAuto = true; refreshAuto(); update(); });

  $('name').addEventListener('input', e => {
    state.name = e.target.value;
    state.nameAuto = false;
    renderDetected();
    renderBoard();
    writeHash();
  });
  $('name').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
  $('name').addEventListener('blur', () => {
    if (!state.name.trim()) { state.nameAuto = true; refreshAuto(); update(); }
  });

  $('clear').addEventListener('click', () => {
    state.frets = state.frets.map(() => 0);
    state.startFret = null;
    state.nameAuto = true;
    state.fingersAuto = true;
    closeFingerPop();
    refreshAuto();
    update();
  });

  function shiftWindow(delta) {
    const base = D.windowStart(chord(), prefs.rows);
    const next = Math.min(20, Math.max(1, base + delta));
    state.startFret = next;
    update();
  }
  $('fret-up').addEventListener('click', () => shiftWindow(-1));
  $('fret-down').addEventListener('click', () => shiftWindow(1));
  $('fret-label').addEventListener('dblclick', () => { state.startFret = null; update(); });

  $('copy-code').addEventListener('click', async () => {
    const text = `${T.fretsCode(state.frets)} ${T.fingersCode(state.fingers)}`;
    try { await navigator.clipboard.writeText(text); toast('Código copiado'); } catch { toast('No se pudo copiar el código'); }
  });

  /* ---------- Segmented controls and switches ---------- */

  function segmented(id, value, onChange) {
    const el = $(id);
    const set = v => el.querySelectorAll('[role=radio]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.value === String(v))));
    set(value);
    el.addEventListener('click', e => {
      const b = e.target.closest('[role=radio]');
      if (!b) return;
      set(b.dataset.value);
      onChange(b.dataset.value);
    });
    el.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const items = [...el.querySelectorAll('[role=radio]')];
      const i = items.indexOf(document.activeElement);
      const next = items[(i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
      next.focus();
      next.click();
    });
    return set;
  }

  const setInstrument = segmented('instrument', state.instrument, v => switchInstrument(v));
  segmented('labels', prefs.labels, v => { prefs.labels = v; savePrefs(); renderBoard(); renderVoicings(); renderFavs(); });
  segmented('format', prefs.format, v => { prefs.format = v; savePrefs(); });
  segmented('size', prefs.size, v => { prefs.size = +v; savePrefs(); });
  segmented('bg', prefs.bg, v => { prefs.bg = v; savePrefs(); });

  function savePrefs() { write(STORE_PREFS, prefs); }

  const switches = { 'opt-fingers': 'showFingers', 'opt-notes': 'showNotes', 'opt-root': 'markRoot', 'opt-lefty': 'lefty', 'opt-sound': 'sound' };
  Object.entries(switches).forEach(([id, key]) => {
    $(id).checked = prefs[key];
    $(id).addEventListener('change', e => { prefs[key] = e.target.checked; savePrefs(); renderBoard(); renderDetected(); renderVoicings(); renderFavs(); });
  });
  $('opt-barre').addEventListener('change', e => { state.fullBarre = e.target.checked; update(); });

  document.querySelectorAll('.stepper [data-step]').forEach(b => b.addEventListener('click', () => {
    prefs.rows = Math.min(7, Math.max(3, prefs.rows + +b.dataset.step));
    $('rows-out').textContent = prefs.rows;
    savePrefs();
    update({ hash: false });
    renderVoicings();
    renderFavs();
  }));
  $('rows-out').textContent = prefs.rows;

  function switchInstrument(id) {
    if (id === state.instrument) return;
    state.instrument = id;
    const parsed = T.parseChordName(state.name) || { root: state.lib.root, quality: state.lib.quality };
    const v = T.findVoicings(parsed.root, parsed.quality, id)[0];
    const n = T.INSTRUMENTS[id].strings.length;
    if (v) loadVoicing(v);
    else { state.frets = new Array(n).fill(0); state.fingers = new Array(n).fill(''); refreshAuto(); }
    state.lib.root = parsed.root;
    state.lib.quality = parsed.quality;
    renderLibrary();
    update();
  }

  /* ---------- Settings dialog ---------- */

  const settings = $('settings');
  $('open-settings').addEventListener('click', () => settings.showModal());
  $('close-settings').addEventListener('click', () => settings.close());
  // A click on the backdrop lands on the dialog element itself.
  settings.addEventListener('click', e => { if (e.target === settings) settings.close(); });

  /* ---------- Theme ---------- */

  function applyTheme() {
    if (prefs.theme) document.documentElement.dataset.theme = prefs.theme;
    else delete document.documentElement.dataset.theme;
  }
  $('theme').addEventListener('click', () => {
    const dark = prefs.theme ? prefs.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    prefs.theme = dark ? 'light' : 'dark';
    savePrefs();
    applyTheme();
  });
  applyTheme();

  /* ---------- Library ---------- */

  function renderLibrary() {
    const roots = $('roots');
    roots.innerHTML = '';
    T.NOTES.forEach((n, i) => {
      const b = document.createElement('button');
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(i === state.lib.root));
      b.textContent = pretty(n);
      b.onclick = () => { state.lib.root = i; renderLibrary(); loadVoicing(currentVoicings()[0]); update(); };
      roots.append(b);
    });
    const qs = $('qualities');
    qs.innerHTML = '';
    T.QUALITIES.forEach(q => {
      const b = document.createElement('button');
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(q.id === state.lib.quality));
      b.textContent = q.label;
      b.onclick = () => { state.lib.quality = q.id; renderLibrary(); loadVoicing(currentVoicings()[0]); update(); };
      qs.append(b);
    });
    renderVoicings();
  }

  let voicingCache = { key: '', list: [] };
  function currentVoicings() {
    const key = `${state.instrument}|${state.lib.root}|${state.lib.quality}`;
    if (voicingCache.key !== key) voicingCache = { key, list: T.findVoicings(state.lib.root, state.lib.quality, state.instrument) };
    return voicingCache.list;
  }

  function renderVoicings() {
    const list = currentVoicings();
    const box = $('voicings');
    const name = T.chordName(state.lib.root, state.lib.quality);
    $('voicings-title').textContent = `Posiciones de ${pretty(name)}`;
    $('voicings-count').textContent = list.length ? `${list.length}` : '';
    box.innerHTML = '';
    if (!list.length) {
      box.innerHTML = '<p class="empty">No hay posiciones cómodas para este acorde en este instrumento.</p>';
      return;
    }
    list.forEach((v, i) => {
      const b = document.createElement('button');
      b.className = 'voicing';
      b.setAttribute('role', 'listitem');
      const r = D.render({ instrument: state.instrument, frets: v.frets, fingers: v.fingers }, {
        rows: prefs.rows, colors: PALETTES.screen, showFingers: prefs.showFingers, lefty: prefs.lefty,
        labels: prefs.labels, rootPc: state.lib.root, markRoot: prefs.markRoot,
      });
      const fretted = v.frets.filter(f => f > 0);
      const low = fretted.length ? Math.min(...fretted) : 0;
      b.innerHTML = r.svg + `<span>${v.frets.includes(0) && low <= 3 ? 'Abierto' : 'Traste ' + low}</span>`;
      b.setAttribute('aria-label', `${name}, posición ${i + 1}: ${T.fretsCode(v.frets)}`);
      b.dataset.code = v.frets.join(',');
      b.onclick = () => { loadVoicing(v); update(); };
      box.append(b);
    });
    markVoicing();
  }

  function markVoicing() {
    const code = state.frets.join(',');
    document.querySelectorAll('.voicing').forEach(b => b.setAttribute('aria-current', String(b.dataset.code === code)));
  }

  function loadVoicing(v) {
    if (!v) return;
    state.name = v.name;
    state.nameAuto = true;
    state.frets = v.frets.slice();
    state.fingers = v.fingers.slice();
    state.fingersAuto = true;
    state.startFret = null;
    state.fullBarre = false;
    $('opt-barre').checked = false;
    lastPlaced = null;
  }

  $('search').addEventListener('input', e => {
    const parsed = T.parseChordName(e.target.value);
    if (!parsed) return;
    state.lib.root = parsed.root;
    state.lib.quality = parsed.quality;
    renderLibrary();
  });
  $('search').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const parsed = T.parseChordName(e.target.value);
    if (!parsed) { toast('No reconozco ese acorde. Prueba con C, Am7 o F#maj7.'); return; }
    const v = currentVoicings()[0];
    if (v) { loadVoicing(v); update(); e.target.blur(); }
  });

  /* ---------- URL hash (name.png?p=frets&f=fingers, the classic chord-link format) ---------- */

  function hashFor(c, name) {
    let h = `${encodeURIComponent(name || 'Acorde')}.png?p=${T.fretsCode(c.frets)}&f=${T.fingersCode(c.fingers)}`;
    h += `&s=${prefs.size}&b=${!!c.fullBarre}`;
    if (c.instrument === 'ukulele') h += '&i=uke';
    if (c.startFret) h += `&w=${c.startFret}`;
    return h;
  }

  let hashTimer = null;
  function writeHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => { if (view === 'editor') history.replaceState(null, '', '#' + hashFor(chord(), state.name)); }, 150);
  }

  function readHash() {
    const raw = location.hash.slice(1);
    if (!raw) return false;
    const [namePart, query = ''] = raw.split('?');
    const get = re => (query.match(re) || [])[1];
    const p = get(/(?:^|&)p(?:os)?=([^&]+)/);
    if (!p) return false;
    const instrument = get(/(?:^|&)i=([^&]+)/) === 'uke' ? 'ukulele' : 'guitar';
    const n = T.INSTRUMENTS[instrument].strings.length;
    const f = decodeURIComponent(get(/(?:^|&)f(?:ingers)?=([^&]+)/) || '');
    state.instrument = instrument;
    state.name = decodeURIComponent(namePart).replace(/\.png$/, '');
    state.nameAuto = false;
    state.frets = T.parseFrets(decodeURIComponent(p), n);
    state.fingers = f ? T.parseFingers(f, n) : T.autoFinger(state.frets) || new Array(n).fill('');
    state.fingersAuto = !f || T.fingersCode(T.autoFinger(state.frets) || []) === T.fingersCode(state.fingers);
    state.fullBarre = /(?:^|&)(?:full_)?b(?:arre)?=true/.test(query);
    const w = +get(/(?:^|&)w=(\d+)/);
    state.startFret = w > 0 ? w : null;
    $('opt-barre').checked = state.fullBarre;
    const parsed = T.parseChordName(state.name);
    if (parsed) { state.lib.root = parsed.root; state.lib.quality = parsed.quality; }
    return true;
  }

  window.addEventListener('hashchange', () => {
    if (location.hash === '#favoritos') { showView('favs'); return; }
    if (location.hash.slice(1) === hashFor(chord(), state.name)) return;
    if (readHash()) { setInstrument(state.instrument); renderLibrary(); update({ hash: false }); }
  });

  /* ---------- Export ---------- */

  let fontCssPromise = null;
  function fontCss() {
    // Embed the typeface so downloads look the same everywhere.
    fontCssPromise ||= (async () => {
      try {
        const css = await (await fetch('https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@600;700;800&display=swap')).text();
        const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)].filter(m => m[1] === 'latin').map(m => m[2]);
        const out = [];
        for (const b of blocks) {
          const url = (b.match(/url\(([^)]+)\)/) || [])[1];
          const weight = (b.match(/font-weight:\s*(\d+)/) || [])[1];
          if (!url) continue;
          const blob = await (await fetch(url)).blob();
          const data = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
          out.push(`@font-face{font-family:'Schibsted Grotesk';font-weight:${weight};src:url(${data}) format('woff2');}`);
        }
        return out.join('');
      } catch {
        return '';
      }
    })();
    return fontCssPromise;
  }

  function exportOptions(css) {
    return {
      rows: prefs.rows, colors: PALETTES[prefs.bg], showFingers: prefs.showFingers, showNotes: prefs.showNotes,
      lefty: prefs.lefty, markRoot: prefs.markRoot, labels: prefs.labels, fontCss: css,
    };
  }

  async function chordSvg() {
    const css = await fontCss();
    return D.render(chord(), { ...exportOptions(css), title: state.name.trim() || ' ', rootPc: rootPc() });
  }

  async function sheetSvg() {
    const css = await fontCss();
    const items = favs.map(c => D.render(c, { ...exportOptions(''), title: c.name || ' ', rootPc: rootOf(c) }));
    const cols = Math.min(items.length, items.length <= 4 ? items.length : items.length <= 6 ? 3 : 4);
    const cw = Math.max(...items.map(i => i.width));
    const ch = Math.max(...items.map(i => i.height));
    const gap = 24, pad = 40;
    const rows = Math.ceil(items.length / cols);
    const W = pad * 2 + cols * cw + (cols - 1) * gap;
    const H = pad * 2 + rows * ch + (rows - 1) * gap;
    const bg = PALETTES[prefs.bg].bg;
    const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`];
    if (css) parts.push(`<style>${css}</style>`);
    if (bg !== 'transparent') parts.push(`<rect width="${W}" height="${H}" fill="${bg}"/>`);
    items.forEach((it, i) => {
      const x = pad + (i % cols) * (cw + gap) + (cw - it.width) / 2;
      const y = pad + Math.floor(i / cols) * (ch + gap);
      parts.push(it.svg.replace('<svg ', `<svg x="${x}" y="${y}" `));
    });
    parts.push('</svg>');
    return { svg: parts.join(''), width: W, height: H };
  }

  function svgToPng({ svg, width, height }, scale) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('png'))), 'image/png');
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('svg')); };
      img.src = url;
    });
  }

  const slug = s => (s || 'acorde').trim().replace(/#/g, 'sharp').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'acorde';

  function save(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function download(build, base) {
    try {
      const out = await build();
      if (prefs.format === 'svg') save(new Blob([out.svg], { type: 'image/svg+xml' }), `${base}.svg`);
      else save(await svgToPng(out, prefs.size), `${base}.png`);
      toast(prefs.format === 'svg' ? 'SVG descargado' : 'PNG descargado');
    } catch {
      toast('No se pudo crear la imagen. Prueba con SVG.');
    }
  }

  $('download').addEventListener('click', () => download(chordSvg, slug(state.name)));
  $('favs-download').addEventListener('click', () => download(sheetSvg, 'acordes-favoritos'));

  $('copy').addEventListener('click', async () => {
    try {
      const png = chordSvg().then(out => svgToPng(out, Math.max(2, prefs.size)));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      toast('Imagen copiada');
    } catch {
      toast('Tu navegador no permite copiar imágenes. Usa Descargar.');
    }
  });

  $('share').addEventListener('click', async () => {
    const url = location.origin + location.pathname + '#' + hashFor(chord(), state.name);
    history.replaceState(null, '', url);
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title: state.name, url }); return; } catch { /* cancelled */ return; }
    }
    try { await navigator.clipboard.writeText(url); toast('Enlace copiado'); } catch { toast('Copia el enlace desde la barra de direcciones'); }
  });

  /* ---------- Sound ---------- */

  function play() {
    const notes = state.frets.map((f, s) => (f >= 0 ? inst().midi[s] + f : null)).filter(n => n != null);
    if (!notes.length) { toast('Todas las cuerdas están apagadas'); return; }
    // Ukulele is re-entrant, so strum in string order rather than by pitch.
    window.Sound.strum(notes);
    const b = $('play');
    b.classList.remove('playing');
    void b.offsetWidth;
    b.classList.add('playing');
  }
  $('play').addEventListener('click', play);

  /* ---------- Favorites ---------- */

  const sameChord = (a, b) => a.instrument === b.instrument && a.frets.join() === b.frets.join() && a.name === b.name;
  function favIndex() {
    const cur = { instrument: state.instrument, frets: state.frets, name: state.name.trim() || 'Acorde' };
    return favs.findIndex(f => sameChord(f, cur));
  }
  function saveFavs() { write(STORE_FAVS, favs); }

  function openChord(c) {
    const p = T.parseChordName(c.name);
    Object.assign(state, {
      instrument: c.instrument, name: c.name, nameAuto: false, frets: c.frets.slice(), fingers: c.fingers.slice(),
      fingersAuto: T.fingersCode(T.autoFinger(c.frets) || []) === T.fingersCode(c.fingers), fullBarre: c.fullBarre, startFret: c.startFret,
    });
    $('opt-barre').checked = !!c.fullBarre;
    setInstrument(c.instrument);
    if (p) { state.lib.root = p.root; state.lib.quality = p.quality; }
    renderLibrary();
    showView('editor', true);
    update();
  }

  function renderFavs() {
    const list = $('favs');
    list.innerHTML = '';
    const n = favs.length;
    $('fav-count').hidden = !n;
    $('fav-count').textContent = n;
    $('favs-head').hidden = !n;
    $('favs-empty').hidden = !!n;
    $('favs-note').textContent = n ? `${n} ${n === 1 ? 'acorde guardado' : 'acordes guardados'}. Toca uno para abrirlo en el editor.` : '';
    favs.forEach((c, i) => {
      const li = document.createElement('li');
      const card = document.createElement('button');
      card.className = 'fav-card';
      const p = T.parseChordName(c.name);
      card.innerHTML = D.render(c, {
        rows: prefs.rows, colors: PALETTES.screen, title: c.name || ' ', showFingers: prefs.showFingers, labels: prefs.labels,
        showNotes: prefs.showNotes, lefty: prefs.lefty, markRoot: prefs.markRoot, rootPc: rootOf(c),
      }).svg + (c.instrument === 'ukulele' ? '<span class="tag">Ukelele</span>' : '');
      card.setAttribute('aria-label', `Abrir ${c.name} en el editor`);
      card.onclick = () => openChord(c);
      const rm = document.createElement('button');
      rm.className = 'remove';
      rm.setAttribute('aria-label', `Quitar ${c.name} de favoritos`);
      rm.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      rm.onclick = () => removeFav(i);
      li.append(card, rm);
      list.append(li);
    });
    renderTools();
  }

  function removeFav(i) {
    const [removed] = favs.splice(i, 1);
    saveFavs();
    renderFavs();
    toast(`${removed.name} quitado de favoritos`, () => { favs.splice(i, 0, removed); saveFavs(); renderFavs(); });
  }

  $('fav').addEventListener('click', () => {
    const i = favIndex();
    if (i !== -1) { removeFav(i); return; }
    favs.push({ ...chord(), frets: state.frets.slice(), fingers: state.fingers.slice(), name: state.name.trim() || 'Acorde' });
    saveFavs();
    renderFavs();
    toast(`${state.name.trim() || 'Acorde'} guardado en favoritos`);
  });
  $('favs-clear').addEventListener('click', () => {
    const removed = favs;
    favs = [];
    saveFavs();
    renderFavs();
    toast('Favoritos vaciados', () => { favs = removed; saveFavs(); renderFavs(); });
  });

  /* ---------- Views ---------- */

  let view = 'editor';
  function showView(next, push) {
    view = next;
    $('view-editor').hidden = next !== 'editor';
    $('view-favs').hidden = next !== 'favs';
    document.querySelectorAll('.views [data-view]').forEach(b => {
      if (b.dataset.view === next) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    closeFingerPop();
    if (push) {
      const url = next === 'favs' ? '#favoritos' : '#' + hashFor(chord(), state.name);
      if (location.hash !== url) history.pushState(null, '', url);
    }
    window.scrollTo(0, 0);
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-view]');
    if (b && b.tagName === 'BUTTON') showView(b.dataset.view, true);
  });
  window.addEventListener('popstate', () => {
    if (location.hash === '#favoritos') { showView('favs'); return; }
    if (readHash()) { setInstrument(state.instrument); renderLibrary(); update({ hash: false }); }
    showView('editor');
  });

  /* ---------- Toast ---------- */

  let toastTimer = null;
  function toast(message, undo) {
    const el = $('toast');
    el.textContent = message;
    el.style.pointerEvents = undo ? 'auto' : 'none';
    if (undo) {
      const b = document.createElement('button');
      b.textContent = 'Deshacer';
      b.style.cssText = 'margin-left:12px;border:0;background:none;color:inherit;font-weight:800;text-decoration:underline;padding:0';
      b.onclick = () => { undo(); el.classList.remove('show'); };
      el.append(b);
    }
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), undo ? 5000 : 2200);
  }

  /* ---------- Keyboard ---------- */

  document.addEventListener('keydown', e => {
    const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if (typing) return;
    if (e.key === '/') { e.preventDefault(); $('search').focus(); }
    else if (e.key === ' ' && document.activeElement.tagName !== 'BUTTON') { e.preventDefault(); play(); }
  });

  /* ---------- Start ---------- */

  if (readHash()) setInstrument(state.instrument);
  renderLibrary();
  renderFavs();
  update({ hash: false });
  if (location.hash === '#favoritos') showView('favs');
  if ('requestIdleCallback' in window) requestIdleCallback(() => fontCss());
})();
