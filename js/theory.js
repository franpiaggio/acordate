/* Music theory: notes, chord qualities, detection, voicing search, fingering. */
(function () {
  const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const ALIASES = { 'Db': 1, 'D#': 3, 'Gb': 6, 'G#': 8, 'A#': 10, 'Cb': 11, 'B#': 0, 'E#': 5, 'Fb': 4 };

  const INSTRUMENTS = {
    guitar: { label: 'Guitarra', strings: ['E', 'A', 'D', 'G', 'B', 'e'], midi: [40, 45, 50, 55, 59, 64], span: 4, bassRoot: true, minPlayed: 4 },
    ukulele: { label: 'Ukelele', strings: ['G', 'C', 'E', 'A'], midi: [67, 60, 64, 69], span: 4, bassRoot: false, minPlayed: 4 },
  };

  // Ordered by how common they are; the order also breaks ties in detection.
  const QUALITIES = [
    { id: '', label: 'Mayor', iv: [0, 4, 7] },
    { id: 'm', label: 'Menor', iv: [0, 3, 7] },
    { id: '7', label: '7', iv: [0, 4, 7, 10] },
    { id: 'm7', label: 'm7', iv: [0, 3, 7, 10] },
    { id: 'maj7', label: 'maj7', iv: [0, 4, 7, 11] },
    { id: 'sus2', label: 'sus2', iv: [0, 2, 7] },
    { id: 'sus4', label: 'sus4', iv: [0, 5, 7] },
    { id: '5', label: '5', iv: [0, 7] },
    { id: 'add9', label: 'add9', iv: [0, 2, 4, 7] },
    { id: '6', label: '6', iv: [0, 4, 7, 9] },
    { id: 'm6', label: 'm6', iv: [0, 3, 7, 9] },
    { id: '9', label: '9', iv: [0, 2, 4, 7, 10] },
    { id: '7sus4', label: '7sus4', iv: [0, 5, 7, 10] },
    { id: 'dim', label: 'dim', iv: [0, 3, 6] },
    { id: 'dim7', label: 'dim7', iv: [0, 3, 6, 9] },
    { id: 'm7b5', label: 'm7♭5', iv: [0, 3, 6, 10] },
    { id: 'aug', label: 'aug', iv: [0, 4, 8] },
    { id: 'madd9', label: 'm(add9)', iv: [0, 2, 3, 7] },
    { id: 'maj9', label: 'maj9', iv: [0, 2, 4, 7, 11] },
    { id: 'm9', label: 'm9', iv: [0, 2, 3, 7, 10] },
    { id: 'mMaj7', label: 'm(maj7)', iv: [0, 3, 7, 11] },
  ];
  const QUALITY_BY_ID = Object.fromEntries(QUALITIES.map(q => [q.id, q]));

  const QUALITY_ALIASES = {
    '': '', 'maj': '', 'M': '', 'major': '', 'mayor': '',
    'm': 'm', 'min': 'm', '-': 'm', 'menor': 'm', 'mi': 'm',
    '7': '7', 'dom7': '7',
    'm7': 'm7', 'min7': 'm7', '-7': 'm7',
    'maj7': 'maj7', 'M7': 'maj7', 'Δ': 'maj7', 'Δ7': 'maj7', 'ma7': 'maj7', '7M': 'maj7',
    'sus2': 'sus2', '2': 'sus2', 'sus4': 'sus4', 'sus': 'sus4', '4': 'sus4',
    '5': '5', 'add9': 'add9', 'add2': 'add9', '6': '6', 'm6': 'm6', 'min6': 'm6', '9': '9',
    '7sus4': '7sus4', '7sus': '7sus4', 'dim': 'dim', '°': 'dim', 'o': 'dim',
    'dim7': 'dim7', '°7': 'dim7', 'o7': 'dim7', 'm7b5': 'm7b5', 'ø': 'm7b5', 'ø7': 'm7b5', 'm7♭5': 'm7b5',
    'aug': 'aug', '+': 'aug', 'madd9': 'madd9', 'm(add9)': 'madd9', 'maj9': 'maj9', 'M9': 'maj9',
    'm9': 'm9', 'min9': 'm9', 'mMaj7': 'mMaj7', 'm(maj7)': 'mMaj7', 'mM7': 'mMaj7',
  };

  // Well known open shapes, used as the first voicing when they exist.
  const OPEN = {
    guitar: {
      'C': ['x32010', '-32-1-'], 'C7': ['x32310', '-3241-'], 'Cmaj7': ['x32000', '-32---'], 'Cadd9': ['x32030', '-21-3-'],
      'Csus2': ['x30033', '-1--34'], 'Csus4': ['x33011', '-34-11'],
      'D': ['xx0232', '---132'], 'Dm': ['xx0231', '---231'], 'D7': ['xx0212', '---213'], 'Dm7': ['xx0211', '---211'],
      'Dmaj7': ['xx0222', '---123'], 'Dsus2': ['xx0230', '---13-'], 'Dsus4': ['xx0233', '---134'],
      'E': ['022100', '-231--'], 'Em': ['022000', '-23---'], 'E7': ['020100', '-2-1--'], 'Em7': ['020000', '-2----'],
      'Emaj7': ['021100', '-312--'], 'Esus4': ['022200', '-234--'], 'E5': ['022xxx', '-12---'],
      'F': ['133211', '134211'], 'Fmaj7': ['xx3210', '---321'], 'Fm': ['133111', '134111'],
      'G': ['320003', '21---3'], 'G7': ['320001', '32---1'], 'Gmaj7': ['320002', '32---1'], 'G6': ['320000', '21----'],
      'A': ['x02220', '--123-'], 'Am': ['x02210', '--231-'], 'A7': ['x02020', '--2-3-'], 'Am7': ['x02010', '--2-1-'],
      'Amaj7': ['x02120', '--213-'], 'Asus2': ['x02200', '--12--'], 'Asus4': ['x02230', '--123-'], 'A5': ['x022xx', '--12--'],
      'B7': ['x21202', '-213-4'], 'Bm': ['x24432', '-13421'], 'B': ['x24442', '-13331'], 'Bb': ['x13331', '-13331'],
      'Cm': ['x35543', '-13421'], 'C#': ['x46664', '-13331'], 'C#m': ['x46654', '-13421'], 'Eb': ['x68886', '-13331'],
      'F#': ['244322', '134211'], 'F#m': ['244222', '134111'], 'Gm': ['355333', '134111'], 'Ab': ['466544', '134211'],
      'Abm': ['466444', '134111'], 'Gm7': ['353333', '131111'], 'Cm7': ['x35343', '-13141'], 'Bm7': ['x24232', '-13141'],
      'F#m7': ['242222', '131111'], 'Fm7': ['131111', '131111'], 'Bb7': ['x13131', '-13141'], 'C#m7': ['x46454', '-13141'],
      'F7': ['131211', '131211'], 'F#7': ['242322', '131211'], 'Bbmaj7': ['x13231', '-13241'], 'Bbm': ['x13321', '-13421'], 'Ebm': ['x68876', '-13421'],
    },
    ukulele: {
      'C': ['0003', '---3'], 'Cm': ['0333', '-111'], 'C7': ['0001', '---1'], 'Cmaj7': ['0002', '---2'],
      'D': ['2220', '123-'], 'Dm': ['2210', '231-'], 'D7': ['2223', '1112'],
      'E': ['4442', '2341'], 'Em': ['0432', '-321'], 'E7': ['1202', '1-23'],
      'F': ['2010', '2-1-'], 'Fm': ['1013', '1-24'],
      'G': ['0232', '-132'], 'Gm': ['0231', '-231'], 'G7': ['0212', '-213'],
      'A': ['2100', '21--'], 'Am': ['2000', '2---'], 'A7': ['0100', '-1--'], 'Am7': ['0000', '----'],
      'B': ['4322', '3211'], 'Bm': ['4222', '3111'], 'Bb': ['3211', '3211'],
    },
  };

  const pc = n => ((n % 12) + 12) % 12;
  const noteName = p => NOTES[pc(p)];

  function parseNote(s) {
    if (!s) return null;
    const m = s.match(/^([A-Ga-g])([#b♯♭]?)/);
    if (!m) return null;
    const letter = m[1].toUpperCase();
    const acc = m[2].replace('♯', '#').replace('♭', 'b');
    const key = letter + acc;
    let p = NOTES.indexOf(key);
    if (p === -1) p = ALIASES[key];
    if (p === undefined || p === -1) p = NOTES.indexOf(letter);
    return { pc: p, len: m[0].length };
  }

  /** Parse "F#m7", "Bb maj7", "C/E" into {root, quality, bass}. */
  function parseChordName(str) {
    const s = (str || '').trim().replace(/\s+/g, '');
    const root = parseNote(s);
    if (!root) return null;
    let rest = s.slice(root.len);
    let bass = null;
    const slash = rest.indexOf('/');
    if (slash !== -1) {
      const b = parseNote(rest.slice(slash + 1));
      if (b) bass = b.pc;
      rest = rest.slice(0, slash);
    }
    const q = QUALITY_ALIASES[rest] ?? QUALITY_ALIASES[rest.toLowerCase()];
    if (q === undefined) return null;
    return { root: root.pc, quality: q, bass };
  }

  function chordName(root, quality, bass) {
    let n = noteName(root) + quality;
    if (bass != null && pc(bass) !== pc(root)) n += '/' + noteName(bass);
    return n;
  }

  /** Name the chord a set of frets produces. Returns null if nothing sensible. */
  function detect(frets, instrument) {
    const inst = INSTRUMENTS[instrument];
    const sounding = frets.map((f, i) => (f >= 0 ? inst.midi[i] + f : null)).filter(n => n != null);
    if (sounding.length < 2) return null;
    const pcs = [...new Set(sounding.map(pc))];
    const bass = pc(Math.min(...sounding));
    let best = null;
    for (const r of pcs) {
      const set = new Set(pcs.map(p => pc(p - r)));
      QUALITIES.forEach((q, qi) => {
        const ivs = new Set(q.iv);
        const extra = [...set].filter(i => !ivs.has(i)).length;
        if (extra) return;
        const missing = q.iv.filter(i => !set.has(i));
        // Only the fifth may be omitted, and only from chords with 4+ notes.
        if (missing.length > 1 || (missing.length === 1 && (missing[0] !== 7 || q.iv.length < 4))) return;
        let score = qi * 0.1 + missing.length * 3;
        if (r !== bass) score += 2;
        if (!best || score < best.score) best = { root: r, quality: q.id, score };
      });
    }
    if (!best) return null;
    return chordName(best.root, best.quality, best.root !== bass ? bass : null);
  }

  /** Assign fingers 1-4 to a set of frets, using a first-finger barre when needed. */
  function autoFinger(frets) {
    const fingers = frets.map(() => '');
    const fretted = frets.map((f, s) => ({ s, f })).filter(n => n.f > 0);
    if (!fretted.length) return fingers;
    const min = Math.min(...fretted.map(n => n.f));

    // Each finger sits near its natural fret (index on the lowest one), never reusing a finger.
    function place(notes, base, first) {
      const groups = [];
      notes.slice().sort((a, b) => a.f - b.f || a.s - b.s).forEach(n => {
        const g = groups[groups.length - 1];
        if (g && g.f === n.f) g.notes.push(n); else groups.push({ f: n.f, notes: [n] });
      });
      for (const mode of ['natural', 'merge', 'sequential']) {
        const merge = mode === 'merge';
        const out = {};
        let last = first - 1;
        for (const g of groups) {
          const want = mode === 'sequential' ? first : Math.min(4, g.f - base + first);
          const contiguous = g.notes[g.notes.length - 1].s - g.notes[0].s === g.notes.length - 1;
          if (merge && g.notes.length > 1 && contiguous) {
            last = Math.max(last + 1, want);
            g.notes.forEach(n => { out[n.s] = last; });
          } else {
            g.notes.forEach(n => { last = Math.max(last + 1, want); out[n.s] = last; });
          }
        }
        if (last <= 4) return out;
      }
      return null;
    }

    if (fretted.length <= 4) {
      const out = place(fretted, min, 1);
      if (out) {
        for (const s in out) fingers[s] = String(out[s]);
        return fingers;
      }
    }
    const atMin = fretted.filter(n => n.f === min).map(n => n.s);
    if (atMin.length < 2) return null;
    const from = Math.min(...atMin), to = Math.max(...atMin);
    for (let s = from; s <= to; s++) if (frets[s] < min) return null; // open or muted under the barre
    const rest = fretted.filter(n => n.f !== min || n.s < from || n.s > to);
    // Fingers above the barre start at 2.
    const shifted = rest.length ? place(rest, min + 1, 2) : {};
    if (!shifted) return null;
    for (let s = from; s <= to; s++) if (frets[s] === min) fingers[s] = '1';
    for (const s in shifted) fingers[s] = String(shifted[s]);
    return fingers;
  }

  /** Search playable voicings for a chord, one per neck position. */
  function findVoicings(root, quality, instrument, limit = 8) {
    const inst = INSTRUMENTS[instrument];
    const q = QUALITY_BY_ID[quality];
    if (!q) return [];
    const n = inst.midi.length;
    const tones = new Set(q.iv.map(i => pc(root + i)));
    const fifth = pc(root + 7);
    const required = [...tones].filter(t => !(t === fifth && q.iv.length >= 4));
    const found = new Map();

    for (let w = 1; w <= 12; w++) {
      const options = inst.midi.map(m => {
        const o = [-1];
        if (tones.has(pc(m))) o.push(0);
        for (let f = w; f < w + inst.span; f++) if (tones.has(pc(m + f))) o.push(f);
        return o;
      });
      const cur = new Array(n);
      (function walk(s) {
        if (s === n) return consider(cur.slice());
        for (const f of options[s]) { cur[s] = f; walk(s + 1); }
      })(0);
    }

    function consider(frets) {
      const played = frets.map((f, i) => (f >= 0 ? i : -1)).filter(i => i >= 0);
      if (played.length < Math.min(inst.minPlayed, n)) return;
      if (played[played.length - 1] - played[0] + 1 !== played.length) return; // no muted string in the middle
      const notes = played.map(i => inst.midi[i] + frets[i]);
      const have = new Set(notes.map(pc));
      if (!required.every(t => have.has(t))) return;
      if (inst.bassRoot && pc(Math.min(...notes)) !== root) return;
      const fretted = frets.filter(f => f > 0);
      const spread = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
      if (spread >= inst.span) return;
      const fingers = autoFinger(frets);
      if (!fingers) return;
      // A wide stretch is fine for a few fingers, not on top of a barre.
      if (spread >= 3 && fretted.length > 4) return;
      const key = frets.join(',');
      if (found.has(key)) return;
      const minF = fretted.length ? Math.min(...fretted) : 0;
      const opens = frets.filter(f => f === 0).length;
      // Mixing open strings with high positions is rarely playable.
      if (opens && Math.max(0, ...fretted) > 4) return;
      const barre = fingers.filter(x => x === '1').length > 1;
      const score = minF * 0.6 - played.length * 1.2 + (have.has(fifth) ? 0 : 1.5) + (barre ? 0.4 : 0) - opens * 0.3 + fretted.length * 0.1;
      found.set(key, { frets, fingers, minF, score });
    }

    const best = new Map();
    for (const v of found.values()) {
      const bucket = v.minF <= 1 ? 0 : v.minF;
      if (!best.has(bucket) || v.score < best.get(bucket).score) best.set(bucket, v);
    }
    const name = chordName(root, quality);
    let list = [...best.values()].sort((a, b) => a.minF - b.minF);
    const open = OPEN[instrument][name];
    if (open) {
      const frets = parseFrets(open[0], n);
      list = list.filter(v => v.frets.join(',') !== frets.join(','));
      list.unshift({ frets, fingers: parseFingers(open[1], n) });
    }
    return list.slice(0, limit).map(v => ({ name, frets: v.frets, fingers: v.fingers }));
  }

  /* Compact codes: "x32010" or "x-10-12-12-11-x" for frets; "-32-1-" or "T+1+3" for fingers. */
  function parseFrets(code, n) {
    const parts = code.includes('-') ? code.split('-') : code.split('');
    const out = [];
    for (let i = 0; i < n; i++) {
      const p = (parts[i] || 'x').toLowerCase();
      out.push(p === 'x' || p === '' || isNaN(+p) ? -1 : Math.min(24, Math.max(0, parseInt(p, 10))));
    }
    return out;
  }
  function fretsCode(frets) {
    const parts = frets.map(f => (f < 0 ? 'x' : String(f)));
    return parts.some(p => p.length > 1) ? parts.join('-') : parts.join('');
  }
  function parseFingers(code, n) {
    const parts = code.includes('+') ? code.split('+') : code.split('');
    const out = [];
    for (let i = 0; i < n; i++) {
      const p = (parts[i] || '').toUpperCase();
      out.push(/^[1-4T]$/.test(p) ? p : '');
    }
    return out;
  }
  function fingersCode(fingers) {
    return fingers.map(f => f || '-').join('');
  }

  /** Scale degree of a note relative to the root: 1, ♭3, 5, ♭7… Seconds read as 9 when the chord has a seventh. */
  const DEGREES = ['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♯5', '6', '♭7', '7'];
  function degree(notePc, rootPc, extended) {
    const i = pc(notePc - rootPc);
    if (extended && i === 2) return '9';
    if (extended && i === 1) return '♭9';
    return DEGREES[i];
  }

  /** Whether a set of sounding pitch classes includes a seventh above the root. */
  function hasSeventh(pcs, rootPc) {
    return pcs.some(p => [10, 11].includes(pc(p - rootPc)));
  }

  window.Theory = {
    degree, hasSeventh,
    NOTES, INSTRUMENTS, QUALITIES, QUALITY_BY_ID, pc, noteName, parseNote, parseChordName, chordName,
    detect, autoFinger, findVoicings, parseFrets, fretsCode, parseFingers, fingersCode,
  };
})();
