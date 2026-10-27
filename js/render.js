/* Chord diagram renderer. Produces an SVG string used by the editor, the thumbnails and the exports. */
(function () {
  const T = window.Theory;
  const FONT = "'Schibsted Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif";

  const SG = 44;   // gap between strings
  const FG = 54;   // gap between frets
  const R = 15.5;  // dot radius
  const PAD_X = 50;

  /** Which fret the diagram window starts at (1 means the nut is visible). */
  function windowStart(chord, rows) {
    if (chord.startFret) return chord.startFret;
    const fretted = chord.frets.filter(f => f > 0);
    if (!fretted.length || Math.max(...fretted) <= rows) return 1;
    return Math.min(...fretted);
  }

  /** Number of fret rows needed to show the whole chord. */
  function rowCount(chord, rows) {
    const base = windowStart(chord, rows);
    const fretted = chord.frets.filter(f => f > 0);
    const need = fretted.length ? Math.max(...fretted) - base + 1 : 0;
    return Math.min(8, Math.max(rows, need));
  }

  /** Strings with the same finger on the same fret form a barre. */
  function barres(chord) {
    const groups = {};
    chord.frets.forEach((f, s) => {
      const fg = chord.fingers[s];
      if (f > 0 && fg) (groups[fg + '@' + f] ||= { finger: fg, fret: f, strings: [] }).strings.push(s);
    });
    const out = Object.values(groups).filter(g => g.strings.length > 1);
    if (chord.fullBarre) {
      const n = chord.frets.length;
      const first = out.find(g => g.finger === '1') || out[0];
      if (first) first.full = true;
      else {
        // No repeated finger yet: barre across all strings at the lowest fretted note.
        const fretted = chord.frets.map((f, s) => ({ f, s })).filter(x => x.f > 0);
        if (fretted.length) {
          const low = fretted.reduce((a, b) => (b.f < a.f ? b : a));
          out.push({ finger: chord.fingers[low.s], fret: low.f, strings: [low.s], full: true });
        }
      }
      out.forEach(g => { if (g.full) g.strings = [Math.min(...g.strings), n - 1]; });
    }
    return out;
  }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /**
   * opts: { rows, colors, title, showFingers, labels ('fingers' | 'degrees'), rootPc, showNotes, lefty, markRoot, interactive, fontCss }
   * colors: { bg, ink, soft, line, dot, dotText, root }
   */
  function render(chord, opts) {
    const n = chord.frets.length;
    const inst = T.INSTRUMENTS[chord.instrument];
    const rows = rowCount(chord, opts.rows || 5);
    const base = windowStart(chord, opts.rows || 5);
    const c = opts.colors;
    const titleH = opts.title ? 76 : 18;
    const markerH = 40;
    const top = titleH + markerH;
    const gridH = rows * FG;
    const notesH = opts.showNotes ? 44 : 26;
    const W = PAD_X * 2 + (n - 1) * SG;
    const H = top + gridH + notesH;
    const sx = s => PAD_X + (opts.lefty ? n - 1 - s : s) * SG;
    const fy = f => top + (f - base + 0.5) * FG;
    const st = (prop, v) => `style="${prop}:${v}"`;
    const out = [];

    out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${esc(FONT)}">`);
    if (opts.fontCss) out.push(`<style>${opts.fontCss}</style>`);
    if (c.bg && c.bg !== 'transparent') out.push(`<rect width="${W}" height="${H}" rx="0" ${st('fill', c.bg)}/>`);
    if (opts.title) {
      out.push(`<text x="${W / 2}" y="${titleH - 22}" text-anchor="middle" font-size="38" font-weight="700" letter-spacing="-1" ${st('fill', c.ink)}>${esc(opts.title)}</text>`);
    }

    // Frets
    for (let k = 0; k <= rows; k++) {
      const y = top + k * FG;
      out.push(`<line x1="${sx(0)}" x2="${sx(n - 1)}" y1="${y}" y2="${y}" stroke-width="2" ${st('stroke', c.line)}/>`);
    }
    if (base === 1) {
      out.push(`<rect x="${PAD_X - 1.5}" y="${top - 8}" width="${(n - 1) * SG + 3}" height="9" rx="2" ${st('fill', c.ink)}/>`);
    } else {
      out.push(`<text x="${PAD_X - 24}" y="${fy(base) + 6}" text-anchor="end" font-size="17" font-weight="600" ${st('fill', c.soft)}>${base}<tspan font-size="12" dx="1">fr</tspan></text>`);
    }

    // Strings: bass strings are drawn slightly heavier.
    for (let s = 0; s < n; s++) {
      const w = (2.6 - (1.2 * s) / Math.max(1, n - 1)).toFixed(2);
      out.push(`<line x1="${sx(s)}" x2="${sx(s)}" y1="${top}" y2="${top + gridH}" stroke-width="${chord.instrument === 'guitar' ? w : 1.8}" stroke-linecap="round" ${st('stroke', c.line)}/>`);
    }

    // Open and muted markers
    const my = top - 22;
    chord.frets.forEach((f, s) => {
      const x = sx(s);
      if (f === 0) out.push(`<circle cx="${x}" cy="${my}" r="7.5" fill="none" stroke-width="2.4" ${st('stroke', c.ink)}/>`);
      else if (f < 0) out.push(`<path d="M${x - 6.5} ${my - 6.5}L${x + 6.5} ${my + 6.5}M${x + 6.5} ${my - 6.5}L${x - 6.5} ${my + 6.5}" stroke-width="2.4" stroke-linecap="round" ${st('stroke', c.soft)}/>`);
    });

    const inWindow = f => f >= base && f < base + rows;
    const rootPc = opts.markRoot ? opts.rootPc : null;
    const notePc = s => T.pc(inst.midi[s] + chord.frets[s]);
    const isRoot = s => rootPc != null && chord.frets[s] >= 0 && notePc(s) === rootPc;
    // Degrees need a root; without one the dots fall back to finger numbers.
    const degrees = opts.labels === 'degrees' && opts.rootPc != null;
    const extended = degrees && T.hasSeventh(chord.frets.map((f, s) => (f >= 0 ? notePc(s) : null)).filter(p => p != null), opts.rootPc);
    const labelFor = s => (degrees ? T.degree(notePc(s), opts.rootPc, extended) : chord.fingers[s]);
    const dotText = (x, y, t) => `<text x="${x}" y="${y + (t.length > 1 ? 5.4 : 6.2)}" text-anchor="middle" font-size="${t.length > 1 ? 14.5 : 17.5}" font-weight="700" letter-spacing="${t.length > 1 ? -0.5 : 0}" ${st('fill', c.dotText)}>${t}</text>`;

    // Barres carry one finger number; the strings they cover need no separate dot.
    const covered = new Set();
    barres(chord).forEach(b => {
      if (!inWindow(b.fret)) return;
      const lo = Math.min(...b.strings), hi = Math.max(...b.strings);
      const x1 = Math.min(sx(lo), sx(hi)), x2 = Math.max(sx(lo), sx(hi));
      const y = fy(b.fret);
      out.push(`<rect class="barre" x="${x1 - R}" y="${y - R}" width="${x2 - x1 + 2 * R}" height="${2 * R}" rx="${R}" ${st('fill', c.dot)}/>`);
      // With degrees every note under the barre keeps its own dot and label.
      if (degrees) return;
      for (let s = lo; s <= hi; s++) if (chord.frets[s] === b.fret && chord.fingers[s] === b.finger) covered.add(s);
      if (opts.showFingers && b.finger) out.push(dotText(sx(lo), y, b.finger));
      covered.add('label:' + lo);
    });

    // Dots
    chord.frets.forEach((f, s) => {
      if (f <= 0 || !inWindow(f)) return;
      if (covered.has(s)) {
        out.push(`<g class="dot" data-s="${s}"></g>`);
        return;
      }
      const x = sx(s), y = fy(f);
      const fill = isRoot(s) ? c.root : c.dot;
      out.push(`<g class="dot" data-s="${s}"><circle cx="${x}" cy="${y}" r="${R}" ${st('fill', fill)}/>`);
      const label = opts.showFingers && !covered.has('label:' + s) ? labelFor(s) : '';
      if (label) out.push(dotText(x, y, label));
      out.push('</g>');
    });

    // Note names under the strings, or the tuning when notes are hidden
    const ny = top + gridH + 30;
    chord.frets.forEach((f, s) => {
      const x = sx(s);
      if (opts.showNotes) {
        const t = f >= 0 ? T.noteName(inst.midi[s] + f) : '';
        if (t) out.push(`<text x="${x}" y="${ny}" text-anchor="middle" font-size="15" font-weight="600" ${st('fill', isRoot(s) ? c.root : c.soft)}>${t.replace('b', '♭').replace('#', '♯')}</text>`);
      }
    });

    // Hit areas for the editor: row 0 is the open/muted row above the nut.
    if (opts.interactive) {
      for (let s = 0; s < n; s++) {
        const x = sx(s) - SG / 2;
        out.push(`<rect class="hit" data-s="${s}" data-f="toggle" x="${x + 7}" y="${titleH + 6}" width="${SG - 14}" height="${markerH - 10}" rx="9" fill="transparent"/>`);
        for (let k = 0; k < rows; k++) {
          const f = base + k;
          const has = chord.frets[s] === f;
          out.push(`<g class="cell${has ? ' on' : ''}" data-s="${s}" data-f="${f}"><rect x="${x}" y="${top + k * FG}" width="${SG}" height="${FG}" fill="transparent"/>${has ? '' : `<circle class="ghost" cx="${sx(s)}" cy="${fy(f)}" r="${R}"/>`}</g>`);
        }
      }
    }

    out.push('</svg>');
    return { svg: out.join(''), width: W, height: H, base, rows };
  }

  window.Diagram = { render, windowStart, rowCount, FONT };
})();
