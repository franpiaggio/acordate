/* Composer: pick a key, drop its chords into bars, loop them and export the progression. */
(function () {
  const T = window.Theory;
  const D = window.Diagram;
  const A = window.App;
  const S = window.Sound;
  const $ = id => document.getElementById(id);

  const STORE = 'acordate.comp.v1';
  const MAX_BARS = 32;
  const PRESETS = {
    major: [['I', 'V', 'vi', 'IV'], ['I', 'vi', 'IV', 'V'], ['vi', 'IV', 'I', 'V'], ['ii', 'V', 'I', 'I']],
    minor: [['i', 'VI', 'III', 'VII'], ['i', 'iv', 'V', 'i'], ['i', 'VII', 'VI', 'V'], ['ii°', 'V', 'i', 'i']],
  };

  const read = () => { try { return JSON.parse(localStorage.getItem(STORE)); } catch { return null; } };
  const comp = Object.assign(
    { key: 0, mode: 'major', meter: 4, bpm: 90, sevenths: false, metro: false, bars: [null, null, null, null], custom: [] },
    read() || {},
  );
  // A bar holds { name } for chords from the key, or { name, frets, fingers } for chords drawn by hand.
  const norm = b => (!b ? null : typeof b === 'string' ? { name: b } : b);
  comp.bars = comp.bars.map(norm);
  comp.custom ||= [];
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(comp)); } catch { /* storage unavailable */ } };

  let selected = null;
  const pretty = n => n.replace('#', '♯').replace(/([A-G])b/, '$1♭').replace('m7b5', 'm7♭5');

  /* ---------- Chord data ---------- */

  const voicingCache = new Map();
  function voicing(chord) {
    if (chord.frets) return { frets: chord.frets, fingers: chord.fingers || T.autoFinger(chord.frets) || chord.frets.map(() => '') };
    const name = chord.name;
    const key = A.instrument() + '|' + name;
    if (!voicingCache.has(key)) {
      const c = T.parseChordName(name);
      voicingCache.set(key, c ? T.findVoicings(c.root, c.quality, A.instrument())[0] || null : null);
    }
    return voicingCache.get(key);
  }
  function notesOf(chord) {
    const v = voicing(chord);
    if (!v) return [];
    const midi = T.INSTRUMENTS[A.instrument()].midi;
    return v.frets.map((f, s) => (f >= 0 ? { m: midi[s] + f, s } : null)).filter(Boolean);
  }
  const keyChords = () => T.keyChords(comp.key, comp.mode, comp.sevenths);

  function diagram(chord, opts = {}) {
    const v = voicing(chord);
    if (!v) return '';
    const c = T.parseChordName(chord.name) || T.parseChordName(T.detect(v.frets, A.instrument()) || '');
    const p = A.prefs;
    return D.render({ instrument: A.instrument(), frets: v.frets, fingers: v.fingers }, {
      rows: p.rows, colors: A.colors(), showFingers: p.showFingers, labels: p.labels, lefty: p.lefty,
      markRoot: p.markRoot, rootPc: c ? c.root : null, ...opts,
    });
  }

  /* ---------- Rendering ---------- */

  function renderControls() {
    const sel = $('comp-key');
    if (!sel.options.length) {
      T.NOTES.forEach((n, i) => sel.add(new Option(pretty(n), i)));
    }
    sel.value = comp.key;
    setMode(comp.mode);
    setMeter(comp.meter);
    $('bpm-out').textContent = comp.bpm;
    $('bars-out').textContent = comp.bars.length;
    $('comp-sevenths').checked = comp.sevenths;
    $('comp-metro').setAttribute('aria-pressed', String(comp.metro));
    renderStyles();
  }

  function renderStyles() {
    const sel = $('comp-style');
    sel.innerHTML = '';
    STYLES[comp.meter].forEach(x => sel.add(new Option(x.label, x.id)));
    sel.value = style().id;
  }

  function renderPalette() {
    const box = $('comp-chips');
    box.innerHTML = '';
    keyChords().forEach(k => {
      const b = document.createElement('button');
      b.className = 'chip' + (k.borrowed ? ' borrowed' : '');
      b.dataset.name = k.name;
      b.innerHTML = `<span class="roman">${k.roman}</span><span class="name">${pretty(k.name)}</span>`;
      b.title = k.borrowed ? `${k.name}: dominante prestada de la escala menor armónica` : k.name;
      box.append(b);
    });
    comp.custom.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'chip custom';
      b.dataset.custom = i;
      b.innerHTML = `<span class="roman">Tuyo</span><span class="name">${pretty(c.name)}</span>`;
      b.title = `${c.name}: ${T.fretsCode(c.frets)}`;
      box.append(b);
    });
    const add = document.createElement('button');
    add.className = 'chip add';
    add.id = 'comp-new';
    add.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span class="name">Crear acorde</span>';
    box.append(add);
    const presets = $('comp-presets');
    presets.innerHTML = '';
    PRESETS[comp.mode].forEach(p => {
      const b = document.createElement('button');
      b.className = 'preset';
      b.textContent = p.join(' – ');
      b.setAttribute('aria-label', `Probar la progresión ${p.join(', ')}`);
      b.onclick = () => applyPreset(p);
      presets.append(b);
    });
  }

  function renderBars() {
    const list = $('comp-bars');
    list.innerHTML = '';
    const empty = comp.bars.every(b => !b);
    comp.bars.forEach((bar, i) => {
      const name = bar?.name;
      const li = document.createElement('li');
      li.className = 'bar' + (name ? ' filled' : '') + (selected === i ? ' selected' : '');
      li.dataset.i = i;
      const roman = name ? T.romanIn(name, comp.key, comp.mode) : null;
      const beats = Array.from({ length: comp.meter }, () => '<i></i>').join('');
      li.innerHTML = `
        <button class="bar-body" aria-label="Compás ${i + 1}${name ? ': ' + name + '. Abrir para cambiarlo' : ', vacío'}">
          <span class="bar-num">${i + 1}</span>
          ${name ? `
            <span class="bar-name">${pretty(name)}</span>
            <span class="bar-roman">${roman || 'fuera de la tonalidad'}</span>
            <span class="bar-diagram">${diagram(bar).svg || ''}</span>`
          : `<span class="bar-empty">${empty && i === 0 ? 'Arrastra un acorde acá o toca uno de arriba' : ''}</span>`}
        </button>
        ${name ? `<span class="bar-tools">
          <button class="bar-clear" aria-label="Quitar ${name} del compás ${i + 1}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </span>` : ''}
        <span class="beats" aria-hidden="true">${beats}</span>`;
      list.append(li);
    });
    markPlayhead();
  }

  function render() {
    renderControls();
    renderPalette();
    renderBars();
  }

  function changed({ bars = true } = {}) {
    persist();
    if (bars) renderBars();
    if (!$('view-comp').hidden) history.replaceState(null, '', hash());
  }

  /* ---------- Editing ---------- */

  /** Tapping a chord fills the selected bar, or the first empty one, then moves on. */
  function addChord(chord) {
    let i = selected ?? comp.bars.findIndex(b => !b);
    if (i === -1) {
      if (comp.bars.length >= MAX_BARS) { A.toast('Llegaste al máximo de compases'); return; }
      comp.bars.push(null);
      i = comp.bars.length - 1;
      $('bars-out').textContent = comp.bars.length;
    }
    comp.bars[i] = { ...chord };
    selected = i + 1 < comp.bars.length ? i + 1 : null;
    changed();
    if (!playing) S.strum(notesOf(chord));
  }

  function applyPreset(romans) {
    const chords = keyChords();
    const byRoman = r => chords.find(k => k.roman === r && (r !== 'V' || comp.mode === 'major' || k.borrowed));
    const names = romans.map(r => byRoman(r)?.name || null);
    comp.bars = comp.bars.map((_, i) => (names[i % names.length] ? { name: names[i % names.length] } : null));
    selected = null;
    changed();
  }

  $('comp-chips').addEventListener('click', e => {
    if (suppressClick) return;
    const chip = e.target.closest('.chip');
    if (!chip) return;
    if (chip.id === 'comp-new') { openEditor(null); return; }
    addChord(chipChord(chip));
  });

  $('comp-bars').addEventListener('click', e => {
    if (suppressClick) return;
    const li = e.target.closest('.bar');
    if (!li) return;
    const i = +li.dataset.i;
    if (e.target.closest('.bar-clear')) {
      comp.bars[i] = null;
      changed();
      return;
    }
    if (comp.bars[i]) {
      if (!playing) S.strum(notesOf(comp.bars[i]));
      openEditor(i);
      return;
    }
    selected = selected === i ? null : i;
    renderBars();
  });

  /* ---------- Drag and drop (mouse drags at once, touch after a short hold) ---------- */

  let drag = null;
  let suppressClick = false;

  function onPointerDown(e) {
    if (e.button !== 0) return;
    const chip = e.target.closest('.chip:not(.add)');
    const bar = e.target.closest('.bar.filled');
    if (!chip && !bar) return;
    if (e.target.closest('.bar-tools')) return;
    const chord = chip ? chipChord(chip) : comp.bars[+bar.dataset.i];
    drag = { chord, name: chord.name, from: bar ? +bar.dataset.i : null, x: e.clientX, y: e.clientY, id: e.pointerId, active: false, el: chip || bar };
    if (e.pointerType === 'touch') {
      drag.timer = setTimeout(() => startDrag(drag.x, drag.y), 220);
    }
  }

  function startDrag(x, y) {
    if (!drag || drag.active) return;
    drag.active = true;
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.textContent = pretty(drag.name);
    document.body.append(ghost);
    drag.ghost = ghost;
    drag.el.classList.add('dragging');
    document.body.classList.add('is-dragging');
    if (navigator.vibrate) navigator.vibrate(8);
    moveGhost(x, y);
  }

  function moveGhost(x, y) {
    drag.ghost.style.transform = `translate(${x}px, ${y}px) translate(-50%, -60%)`;
    const over = document.elementFromPoint(x, y)?.closest('.bar');
    document.querySelectorAll('.bar.over').forEach(b => b !== over && b.classList.remove('over'));
    if (over) over.classList.add('over');
    drag.over = over ? +over.dataset.i : null;
    drag.outside = !document.elementFromPoint(x, y)?.closest('#comp-bars');
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dist = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    if (!drag.active) {
      if (e.pointerType === 'touch') {
        if (dist > 8) cancelDrag(); // a swipe: let the page scroll
        return;
      }
      if (dist < 5) return;
      startDrag(e.clientX, e.clientY);
    }
    moveGhost(e.clientX, e.clientY);
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.active) {
      const { chord, name, from, over, outside } = drag;
      if (over != null && over !== from) {
        if (from != null) [comp.bars[from], comp.bars[over]] = [comp.bars[over], comp.bars[from]];
        else comp.bars[over] = { ...chord };
        selected = null;
        changed();
      } else if (from != null && outside) {
        comp.bars[from] = null;
        changed();
        A.toast(`${name} quitado del compás ${from + 1}`, () => { comp.bars[from] = chord; changed(); });
      }
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
    }
    cancelDrag();
  }

  function cancelDrag() {
    if (!drag) return;
    clearTimeout(drag.timer);
    drag.ghost?.remove();
    drag.el.classList.remove('dragging');
    document.body.classList.remove('is-dragging');
    document.querySelectorAll('.bar.over').forEach(b => b.classList.remove('over'));
    drag = null;
  }

  const view = $('view-comp');
  view.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', cancelDrag);
  // While dragging on touch, keep the page from scrolling under the finger.
  document.addEventListener('touchmove', e => { if (drag?.active) e.preventDefault(); }, { passive: false });
  view.addEventListener('contextmenu', e => { if (drag) e.preventDefault(); });

  /* ---------- Controls ---------- */

  function segmented(id, onChange) {
    const el = $(id);
    const set = v => el.querySelectorAll('[role=radio]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.value === String(v))));
    el.addEventListener('click', e => {
      const b = e.target.closest('[role=radio]');
      if (!b) return;
      set(b.dataset.value);
      onChange(b.dataset.value);
    });
    return set;
  }
  const setMode = segmented('comp-mode', v => { comp.mode = v; renderPalette(); changed(); });
  const setMeter = segmented('comp-meter', v => { comp.meter = +v; renderStyles(); changed(); });
  $('comp-style').addEventListener('change', e => { comp.styles[comp.meter] = e.target.value; changed({ bars: false }); });

  $('comp-key').addEventListener('change', e => { comp.key = +e.target.value; renderPalette(); changed(); });
  $('comp-sevenths').addEventListener('change', e => { comp.sevenths = e.target.checked; renderPalette(); changed({ bars: false }); });

  function stepBpm(d) {
    comp.bpm = Math.min(200, Math.max(40, comp.bpm + d));
    $('bpm-out').textContent = comp.bpm;
    changed({ bars: false });
  }
  // Holding the button keeps changing the tempo.
  [['bpm-down', -1], ['bpm-up', 1]].forEach(([id, d]) => {
    let hold = null;
    const stop = () => { clearTimeout(hold); clearInterval(hold); };
    $(id).addEventListener('pointerdown', () => { stepBpm(d); hold = setTimeout(() => { hold = setInterval(() => stepBpm(d * 2), 70); }, 380); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => $(id).addEventListener(ev, stop));
    $(id).addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stepBpm(d); } });
  });

  $('bars-up').addEventListener('click', () => {
    if (comp.bars.length >= MAX_BARS) return;
    comp.bars.push(null);
    $('bars-out').textContent = comp.bars.length;
    changed();
  });
  $('bars-down').addEventListener('click', () => {
    if (comp.bars.length <= 1) return;
    comp.bars.pop();
    if (selected != null && selected >= comp.bars.length) selected = null;
    $('bars-out').textContent = comp.bars.length;
    changed();
  });

  $('comp-metro').addEventListener('click', () => {
    comp.metro = !comp.metro;
    $('comp-metro').setAttribute('aria-pressed', String(comp.metro));
    changed({ bars: false });
  });

  $('comp-clear').addEventListener('click', () => {
    if (comp.bars.every(b => !b)) return;
    const before = comp.bars.slice();
    comp.bars = comp.bars.map(() => null);
    selected = null;
    changed();
    A.toast('Compases vaciados', () => { comp.bars = before; changed(); });
  });

  /* ---------- Playback ---------- */

  let playing = false;
  let timer = null;
  let nextTime = 0;
  let step = 0;
  let queue = [];
  let raf = null;

  /*
   * Strumming styles on an eighth-note grid. D down, U up (top strings only), B bass note
   * (alt: the next string up), P one picked string: b/b2 bass side, r1..r3 from the top.
   */
  const D_ = g => ({ k: 'D', g }), U_ = g => ({ k: 'U', g }), B_ = (g, alt) => ({ k: 'B', g, alt }), P_ = (r, g = 0.5) => ({ k: 'P', r, g });
  const X_ = g => ({ k: 'X', g }); // muted stroke
  const STYLES = {
    4: [
      { id: 'suave', label: 'Un golpe', slots: [D_(0.72), 0, 0, 0, 0, 0, 0, 0] },
      { id: 'balada', label: 'Balada', slots: [D_(0.8), 0, D_(0.5), 0, D_(0.66), U_(0.4), D_(0.5), U_(0.36)] },
      { id: 'pop', label: 'Pop', slots: [D_(0.8), 0, D_(0.56), U_(0.42), 0, U_(0.44), D_(0.6), U_(0.38)] },
      { id: 'ritmico', label: 'Rítmico', slots: [D_(0.8), 0, X_(0.7), U_(0.4), 0, U_(0.42), X_(0.66), U_(0.38)] },
      { id: 'folk', label: 'Folk', slots: [B_(0.85), 0, D_(0.5), U_(0.3), B_(0.75, true), 0, D_(0.5), U_(0.3)] },
      { id: 'arpegio', label: 'Arpegio', slots: [P_('b', 0.72), P_('r3'), P_('r2'), P_('r1', 0.46), P_('b2', 0.6), P_('r3'), P_('r2'), P_('r1', 0.42)] },
    ],
    3: [
      { id: 'suave', label: 'Un golpe', slots: [D_(0.72), 0, 0, 0, 0, 0] },
      { id: 'vals', label: 'Vals', slots: [B_(0.85), 0, D_(0.46), 0, D_(0.42), 0] },
      { id: 'balada', label: 'Balada', slots: [D_(0.8), 0, D_(0.5), U_(0.4), D_(0.5), U_(0.36)] },
      { id: 'arpegio', label: 'Arpegio', slots: [P_('b', 0.72), P_('r3'), P_('r2'), P_('r1', 0.46), P_('r2'), P_('r3')] },
    ],
  };
  comp.styles ||= { 4: 'balada', 3: 'vals' };
  const style = () => STYLES[comp.meter].find(x => x.id === comp.styles[comp.meter]) || STYLES[comp.meter][0];

  const jitter = amount => (Math.random() - 0.5) * 2 * amount;

  /** Slots until the next strum or bass hit, wrapping into the next bar. */
  function slotsUntilNext(slots, from, kinds) {
    for (let d = 1; d <= slots.length; d++) if (slots[(from + d) % slots.length] && kinds.includes(slots[(from + d) % slots.length].k)) return { d, wraps: from + d >= slots.length };
    return { d: slots.length, wraps: true };
  }

  /** Events for one beat of the loop; used by live playback and by the audio and MIDI exports. */
  function beatEvents(s, t, withClick) {
    const total = comp.bars.length * comp.meter;
    const k = s % total;
    const bar = Math.floor(k / comp.meter), beat = k % comp.meter;
    const slotDur = 30 / comp.bpm;
    const out = [];
    const chord = comp.bars[bar];
    const nextEmpty = !comp.bars[(bar + 1) % comp.bars.length];
    if (chord) {
      const notes = notesOf(chord);
      const slots = style().slots;
      for (let h = 0; h < 2 && notes.length; h++) {
        const i = beat * 2 + h;
        const slot = slots[i];
        if (!slot) continue;
        // Small timing and loudness drift keeps it from sounding mechanical.
        const time = t + h * slotDur + jitter(i === 0 ? 0.003 : 0.007);
        const gain = slot.g * (0.92 + Math.random() * 0.14);
        const remaining = (slots.length - i) * slotDur;
        if (slot.k === 'X') {
          out.push({ time, chuck: true, notes: notes.slice(-Math.max(3, notes.length - 1)), gain });
        } else if (slot.k === 'D' || slot.k === 'U') {
          const next = slotsUntilNext(slots, i, ['D', 'U', 'B', 'X']);
          const ring = next.wraps && nextEmpty ? remaining + 2 : next.d * slotDur + 0.05;
          // Lighter strokes catch fewer strings: soft downs skip the bass, ups only reach the top ones.
          const set = slot.k === 'U' ? notes.slice(-Math.min(4, notes.length))
            : slot.g < 0.6 ? notes.slice(-Math.max(3, notes.length - 2)) : notes;
          // Harder strokes sweep faster: about 40-70 ms across six strings.
          const gap = slot.k === 'U' ? 0.007 + Math.random() * 0.004 : 0.016 - slot.g * 0.008 + Math.random() * 0.003;
          out.push({ time, notes: set, up: slot.k === 'U', gain, ring, gap });
        } else if (slot.k === 'B') {
          const n = slot.alt && notes.length > 1 ? notes[1] : notes[0];
          const next = slotsUntilNext(slots, i, ['B']);
          out.push({ time, notes: [n], gain, ring: next.wraps && nextEmpty ? remaining + 2 : next.d * slotDur + 0.1 });
        } else {
          const pick = { b: 0, b2: 1, r1: notes.length - 1, r2: notes.length - 2, r3: notes.length - 3 }[slot.r];
          const n = notes[Math.max(0, Math.min(notes.length - 1, pick))];
          out.push({ time, notes: [n], gain, ring: remaining + (nextEmpty ? 2 : 0.35) });
        }
      }
    }
    if (withClick) out.push({ time: t, click: true, accent: beat === 0 });
    return { out, bar, beat };
  }

  function tick() {
    const now = S.now();
    while (nextTime < now + 0.15) {
      const { out, bar, beat } = beatEvents(step, nextTime, comp.metro);
      out.forEach(e => (e.click ? S.clickAt(e.time, e.accent) : e.chuck ? S.chuckAt(e.notes, e.time, e.gain) : S.strumAt(e.notes, e.time, e)));
      queue.push({ t: nextTime, bar, beat });
      nextTime += 60 / comp.bpm;
      step++;
    }
  }

  function frame() {
    const now = S.now();
    let cur = null;
    while (queue.length && queue[0].t <= now) cur = queue.shift();
    if (cur) { playhead = cur; markPlayhead(); }
    raf = requestAnimationFrame(frame);
  }

  let playhead = null;
  function markPlayhead() {
    document.querySelectorAll('#comp-bars .bar').forEach(li => {
      const on = playing && playhead && +li.dataset.i === playhead.bar;
      li.classList.toggle('playing', !!on);
      li.querySelectorAll('.beats i').forEach((dot, b) => dot.classList.toggle('on', !!on && b <= playhead.beat));
    });
  }

  async function play() {
    if (comp.bars.every(b => !b)) { A.toast('Agrega acordes a los compases para escucharlos'); return; }
    playing = true;
    updatePlayButton();
    await S.ready();
    if (!playing) return;
    nextTime = S.now() + 0.08;
    step = 0;
    queue = [];
    tick();
    timer = setInterval(tick, 25);
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (!playing) return;
    playing = false;
    clearInterval(timer);
    cancelAnimationFrame(raf);
    S.stopAll();
    queue = [];
    playhead = null;
    markPlayhead();
    updatePlayButton();
  }

  function toggle() { playing ? stop() : play(); }

  function updatePlayButton() {
    const b = $('comp-play');
    b.classList.toggle('is-playing', playing);
    b.querySelector('span').textContent = playing ? 'Detener' : 'Reproducir';
  }
  $('comp-play').addEventListener('click', toggle);

  /* ---------- Export ---------- */

  const menu = $('comp-menu');
  const exportBtn = $('comp-export');
  function closeMenu() { menu.hidden = true; exportBtn.setAttribute('aria-expanded', 'false'); }
  exportBtn.addEventListener('click', () => {
    const open = menu.hidden;
    menu.hidden = !open;
    exportBtn.setAttribute('aria-expanded', String(open));
    if (open) menu.querySelector('button').focus();
  });
  document.addEventListener('pointerdown', e => { if (!menu.hidden && !e.target.closest('.menu-wrap')) closeMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { closeMenu(); exportBtn.focus(); } });

  menu.addEventListener('click', async e => {
    const b = e.target.closest('[data-export]');
    if (!b) return;
    closeMenu();
    const kind = b.dataset.export;
    if (kind === 'link') return copy(location.origin + location.pathname + hash(), 'Enlace copiado');
    if (comp.bars.every(x => !x)) { A.toast('Agrega acordes a los compases para exportar'); return; }
    try {
      if (kind === 'text') return copy(asText(), 'Progresión copiada como texto');
      if (kind === 'png') {
        A.toast('Preparando la imagen…');
        const out = await asSvg();
        A.save(await A.svgToPng(out, 2), `${fileBase()}.png`);
        A.toast('Imagen descargada');
      }
      if (kind === 'wav') {
        A.toast('Preparando el audio…');
        A.save(await asWav(), `${fileBase()}.wav`);
        A.toast('Audio descargado');
      }
      if (kind === 'midi') {
        A.save(asMidi(), `${fileBase()}.mid`);
        A.toast('MIDI descargado');
      }
    } catch {
      A.toast('No se pudo exportar. Prueba de nuevo.');
    }
  });

  async function copy(text, done) {
    try { await navigator.clipboard.writeText(text); A.toast(done); } catch { A.toast('No se pudo copiar'); }
  }

  const keyLabel = () => `${pretty(T.NOTES[comp.key])} ${comp.mode === 'major' ? 'mayor' : 'menor'}`;
  const fileBase = () => A.slug(`progresion-${T.NOTES[comp.key]}-${comp.mode === 'major' ? 'mayor' : 'menor'}`);

  function asText() {
    const cells = comp.bars.map(b => (b ? pretty(b.name) : '%'));
    const lines = [];
    for (let i = 0; i < cells.length; i += 4) lines.push('| ' + cells.slice(i, i + 4).join(' | ') + ' |');
    return `${keyLabel()}, ${comp.meter}/4, ${comp.bpm} bpm\n${lines.join('\n')}`;
  }

  async function asSvg() {
    const css = await A.fontCss();
    const colors = A.exportColors();
    const ink = colors.ink, soft = colors.soft, bg = colors.bg;
    const line = bg === '#16181B' ? '#30343A' : '#DCDED8';
    const cols = Math.min(4, comp.bars.length);
    const cellW = 300, cellH = 420, gap = 20, pad = 48, head = 70;
    const rows = Math.ceil(comp.bars.length / cols);
    const W = pad * 2 + cols * cellW + (cols - 1) * gap;
    const H = pad * 2 + head + rows * cellH + (rows - 1) * gap;
    const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${D.FONT.replace(/"/g, '&quot;')}">`];
    if (css) parts.push(`<style>${css}</style>`);
    if (bg !== 'transparent') parts.push(`<rect width="${W}" height="${H}" fill="${bg}"/>`);
    parts.push(`<text x="${pad}" y="${pad + 30}" font-size="34" font-weight="800" letter-spacing="-1" fill="${ink}">${keyLabel()}</text>`);
    parts.push(`<text x="${W - pad}" y="${pad + 30}" font-size="20" font-weight="600" text-anchor="end" fill="${soft}">${comp.meter}/4, ${comp.bpm} bpm</text>`);
    comp.bars.forEach((bar, i) => {
      const name = bar?.name;
      const x = pad + (i % cols) * (cellW + gap);
      const y = pad + head + Math.floor(i / cols) * (cellH + gap);
      parts.push(`<rect x="${x + 0.5}" y="${y + 0.5}" width="${cellW - 1}" height="${cellH - 1}" rx="22" fill="none" stroke="${line}" stroke-width="1.5"/>`);
      parts.push(`<text x="${x + 20}" y="${y + 32}" font-size="16" font-weight="600" fill="${soft}">${i + 1}</text>`);
      if (!name) {
        parts.push(`<text x="${x + cellW / 2}" y="${y + cellH / 2}" font-size="40" font-weight="700" text-anchor="middle" fill="${line}">%</text>`);
        return;
      }
      const roman = T.romanIn(name, comp.key, comp.mode);
      if (roman) parts.push(`<text x="${x + cellW - 20}" y="${y + 32}" font-size="16" font-weight="600" text-anchor="end" fill="${soft}">${roman}</text>`);
      const r = diagram(bar, { colors: { ...colors, bg: 'transparent' }, title: pretty(name) });
      const scale = Math.min((cellW - 40) / r.width, (cellH - 50) / r.height);
      const dw = r.width * scale, dh = r.height * scale;
      parts.push(r.svg.replace('<svg ', `<svg x="${x + (cellW - dw) / 2}" y="${y + 40 + (cellH - 50 - dh) / 2}" `).replace(/width="[\d.]+" height="[\d.]+"/, `width="${dw}" height="${dh}"`));
    });
    parts.push('</svg>');
    return { svg: parts.join(''), width: W, height: H };
  }

  function asWav() {
    const total = comp.bars.length * comp.meter;
    const beatDur = 60 / comp.bpm;
    const events = [];
    for (let s = 0; s < total; s++) events.push(...beatEvents(s, 0.05 + s * beatDur, false).out);
    // The last chord rings out instead of being cut at the bar line.
    const last = events[events.length - 1];
    if (last) last.ring = 2.4;
    return S.renderWav(events, 0.05 + total * beatDur + 3);
  }

  function asMidi() {
    const tpq = 480;
    const ev = [];
    const meta = (tick, bytes) => ev.push({ tick, bytes, order: 0 });
    const us = Math.round(60e6 / comp.bpm);
    meta(0, [0xff, 0x51, 0x03, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff]);
    meta(0, [0xff, 0x58, 0x04, comp.meter, 2, 24, 8]);
    meta(0, [0xc0, 25]); // acoustic steel guitar
    // Follow the strumming style; each stroke becomes notes that last as long as they ring.
    const beatDur = 60 / comp.bpm;
    const toTick = sec => Math.max(0, Math.round((sec / beatDur) * tpq));
    for (let st = 0; st < comp.bars.length * comp.meter; st++) {
      beatEvents(st, st * beatDur, false).out.filter(e => !e.chuck).forEach(e => {
        const vel = Math.max(20, Math.min(120, Math.round(e.gain * 130)));
        const order = e.up ? e.notes.slice().reverse() : e.notes;
        order.forEach(({ m }, j) => {
          const on = toTick(e.time + j * (e.gap || 0.02));
          ev.push({ tick: on, bytes: [0x90, m, vel], order: 2 });
          ev.push({ tick: Math.max(on + 1, toTick(e.time + Math.min(e.ring, 4))), bytes: [0x80, m, 0], order: 1 });
        });
      });
    }
    ev.sort((a, b) => a.tick - b.tick || a.order - b.order);
    const vlq = n => { const out = [n & 0x7f]; while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80); return out; };
    const track = [];
    let last = 0;
    ev.forEach(e => { track.push(...vlq(e.tick - last), ...e.bytes); last = e.tick; });
    track.push(0, 0xff, 0x2f, 0);
    const u32 = n => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
    const bytes = [
      0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, 0, 0, 1, (tpq >> 8) & 0xff, tpq & 0xff,
      0x4d, 0x54, 0x72, 0x6b, ...u32(track.length), ...track,
    ];
    return new Blob([new Uint8Array(bytes)], { type: 'audio/midi' });
  }

  function chipChord(chip) {
    if (chip.dataset.custom != null) return { ...comp.custom[+chip.dataset.custom] };
    return { name: chip.dataset.name };
  }

  /* ---------- Chord editor (draw any chord without leaving the composer) ---------- */

  const dlg = $('chord-dialog');
  const ed = { frets: [], name: '', nameAuto: true, startFret: null, target: null };

  function openEditor(barIndex) {
    const n = T.INSTRUMENTS[A.instrument()].strings.length;
    const bar = barIndex != null ? comp.bars[barIndex] : null;
    const v = bar ? voicing(bar) : null;
    ed.frets = v && v.frets.length === n ? v.frets.slice() : new Array(n).fill(0);
    ed.name = bar ? bar.name : '';
    ed.nameAuto = !bar;
    ed.startFret = null;
    ed.target = barIndex;
    $('ce-name').value = ed.name;
    const into = barIndex ?? selected ?? comp.bars.findIndex(b => !b);
    $('ce-save').textContent = barIndex != null ? 'Guardar cambios' : into >= 0 ? `Agregar al compás ${into + 1}` : 'Agregar al final';
    renderEditor();
    dlg.showModal();
  }

  function edChord() {
    return { instrument: A.instrument(), frets: ed.frets, fingers: T.autoFinger(ed.frets) || ed.frets.map(() => ''), startFret: ed.startFret };
  }

  function renderEditor() {
    const c = edChord();
    const detected = T.detect(ed.frets, A.instrument());
    if (ed.nameAuto) { ed.name = detected || ''; $('ce-name').value = ed.name; }
    const p = A.prefs;
    const root = T.parseChordName(ed.name) || T.parseChordName(detected || '');
    const r = D.render(c, {
      rows: p.rows, colors: A.colors(), showFingers: p.showFingers, labels: p.labels, lefty: p.lefty,
      markRoot: p.markRoot, rootPc: root ? root.root : null, interactive: true,
    });
    $('ce-board').innerHTML = r.svg;
    $('ce-fret').textContent = r.base === 1 ? 'Cejuela' : `${r.base}fr`;
    const notes = ed.frets.map((f, s) => (f >= 0 ? T.noteName(T.INSTRUMENTS[A.instrument()].midi[s] + f) : null)).filter(Boolean);
    const warn = T.autoFinger(ed.frets) ? '' : ' Necesita más de 4 dedos.';
    $('ce-info').textContent = (notes.length ? notes.map(pretty).join('  ') : 'Sin notas') + warn;
    $('ce-info').classList.toggle('warn', !!warn);
    $('ce-save').disabled = !ed.name.trim() || !notes.length;
    renderVariants(root);
  }

  const VARIANT_QUALITIES = ['', 'm', '7', 'maj7', 'm7', 'sus2', 'sus4', 'add9', '6', '9', 'dim', 'aug'];

  /** Other chord types on the same root, and other places to play the current one. */
  function renderVariants(parsed) {
    $('ce-variants-wrap').hidden = !parsed;
    $('ce-voicings-wrap').hidden = !parsed;
    if (!parsed) return;
    const box = $('ce-qualities');
    box.innerHTML = '';
    VARIANT_QUALITIES.forEach(q => {
      const b = document.createElement('button');
      const name = T.chordName(parsed.root, q);
      b.textContent = pretty(name);
      b.setAttribute('aria-pressed', String(q === parsed.quality));
      b.onclick = () => {
        const v = T.findVoicings(parsed.root, q, A.instrument())[0];
        ed.name = name;
        ed.nameAuto = false;
        $('ce-name').value = name;
        if (v) { ed.frets = v.frets.slice(); ed.startFret = null; }
        renderEditor();
        S.strum(notesOf({ frets: ed.frets }));
      };
      box.append(b);
    });
    const list = $('ce-voicings');
    list.innerHTML = '';
    const p = A.prefs;
    const cur = ed.frets.join();
    T.findVoicings(parsed.root, parsed.quality, A.instrument()).forEach(v => {
      const b = document.createElement('button');
      b.className = 'voicing';
      b.setAttribute('aria-current', String(v.frets.join() === cur));
      const fretted = v.frets.filter(f => f > 0);
      const low = fretted.length ? Math.min(...fretted) : 0;
      b.innerHTML = D.render({ instrument: A.instrument(), frets: v.frets, fingers: v.fingers }, {
        rows: p.rows, colors: A.colors(), showFingers: p.showFingers, labels: p.labels, lefty: p.lefty,
        markRoot: p.markRoot, rootPc: parsed.root,
      }).svg + `<span>${v.frets.includes(0) && low <= 3 ? 'Abierto' : 'Traste ' + low}</span>`;
      b.setAttribute('aria-label', `${v.name}: ${T.fretsCode(v.frets)}`);
      b.onclick = () => {
        ed.frets = v.frets.slice();
        ed.startFret = null;
        renderEditor();
        S.strum(notesOf({ frets: ed.frets }));
      };
      list.append(b);
    });
  }

  $('ce-board').addEventListener('click', e => {
    const t = e.target.closest('[data-f]');
    if (!t) return;
    const s = +t.dataset.s;
    if (t.dataset.f === 'toggle') ed.frets[s] = ed.frets[s] === 0 ? -1 : 0;
    else ed.frets[s] = ed.frets[s] === +t.dataset.f ? 0 : +t.dataset.f;
    renderEditor();
    if (A.prefs.sound && ed.frets[s] >= 0) S.pluck(T.INSTRUMENTS[A.instrument()].midi[s] + ed.frets[s]);
  });
  $('ce-name').addEventListener('input', e => { ed.name = e.target.value; ed.nameAuto = !ed.name.trim(); renderEditor(); });
  $('ce-up').addEventListener('click', () => { ed.startFret = Math.max(1, D.windowStart(edChord(), A.prefs.rows) - 1); renderEditor(); });
  $('ce-down').addEventListener('click', () => { ed.startFret = Math.min(20, D.windowStart(edChord(), A.prefs.rows) + 1); renderEditor(); });
  $('ce-clear').addEventListener('click', () => { ed.frets = ed.frets.map(() => 0); ed.startFret = null; ed.nameAuto = true; renderEditor(); });
  $('ce-play').addEventListener('click', () => S.strum(notesOf({ frets: ed.frets })));
  $('ce-cancel').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

  $('ce-save').addEventListener('click', () => {
    const chord = { name: ed.name.trim(), frets: ed.frets.slice(), fingers: T.autoFinger(ed.frets) || undefined };
    // Keep it in the palette for reuse, without duplicates.
    const key = c => c.name + '|' + c.frets.join();
    if (!comp.custom.some(c => key(c) === key(chord))) comp.custom = [chord, ...comp.custom].slice(0, 8);
    dlg.close();
    renderPalette();
    if (ed.target != null) {
      comp.bars[ed.target] = chord;
      changed();
    } else {
      addChord(chord);
    }
  });

  /* ---------- Link ---------- */

  function hash() {
    // Hand-drawn chords carry their frets: name~frets~fingers
    const seq = comp.bars.map(b => (!b ? '-' : encodeURIComponent(b.frets ? `${b.name}~${T.fretsCode(b.frets)}~${T.fingersCode(b.fingers || [])}` : b.name))).join(',');
    const uke = comp.bars.some(b => b?.frets) && A.instrument() === 'ukulele' ? '&i=uke' : '';
    return `#compositor?k=${comp.key}&m=${comp.mode}&t=${comp.meter}&bpm=${comp.bpm}${uke}&s=${seq}`;
  }

  function load(h) {
    const q = new URLSearchParams((h.split('?')[1] || ''));
    if (!q.has('s')) return;
    const k = +q.get('k');
    if (k >= 0 && k < 12) comp.key = k;
    if (['major', 'minor'].includes(q.get('m'))) comp.mode = q.get('m');
    if (['3', '4'].includes(q.get('t'))) comp.meter = +q.get('t');
    const bpm = +q.get('bpm');
    if (bpm >= 40 && bpm <= 200) comp.bpm = bpm;
    const bars = q.get('s').split(',').slice(0, MAX_BARS).map(x => {
      if (x === '-') return null;
      const [name, frets, fingers] = x.split('~');
      if (frets) {
        const inst = q.get('i') === 'uke' ? 'ukulele' : 'guitar';
        const n = T.INSTRUMENTS[inst].strings.length;
        return { name, frets: T.parseFrets(frets, n), fingers: fingers ? T.parseFingers(fingers, n) : undefined };
      }
      return T.parseChordName(name) ? { name } : null;
    });
    if (bars.length) comp.bars = bars;
    selected = null;
    persist();
    render();
  }

  A.onDiagramChange = () => { voicingCache.clear(); renderBars(); };

  window.Composer = { stop, toggle, hash, load };

  render();
  if (location.hash.startsWith('#compositor')) { load(location.hash); A.showView('comp'); }
})();
