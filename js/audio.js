/*
 * Chord playback. Uses recorded acoustic guitar samples (tonejs-instruments, CC-BY 3.0),
 * pitch-shifted to the nearest note, and falls back to a Karplus-Strong synth while they
 * load or when they can't be fetched (e.g. when the page is opened from file://).
 */
(function () {
  const SAMPLE_DIR = 'assets/samples/';
  // One recording every 3 semitones; the rest are pitch-shifted by at most 1 semitone.
  const SAMPLES = { E2: 40, G2: 43, As2: 46, Cs3: 49, E3: 52, G3: 55, As3: 58, Cs4: 61, E4: 64, G4: 67, As4: 70, Cs5: 73, D5: 74 };

  let ctx = null;
  let master = null;
  const synthCache = new Map();
  let samples = null;        // Map midi -> AudioBuffer once loaded
  let loading = null;
  const live = new Set();    // voices scheduled on the live context, so they can be stopped

  /** Gain and compressor chain shared by live playback and offline rendering. */
  function chain(c) {
    const gain = c.createGain();
    gain.gain.value = 0.6;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    gain.connect(comp).connect(c.destination);
    return gain;
  }

  function context() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = chain(ctx);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function loadSamples() {
    if (loading) return loading;
    const c = context();
    loading = Promise.all(Object.entries(SAMPLES).map(async ([name, midi]) => {
      const res = await fetch(SAMPLE_DIR + name + '.mp3');
      if (!res.ok) throw new Error(name);
      const data = await res.arrayBuffer();
      const buf = await new Promise((resolve, reject) => c.decodeAudioData(data, resolve, reject));
      return [midi, buf];
    })).then(entries => { samples = new Map(entries); return samples; })
      .catch(() => { samples = null; return null; });
    return loading;
  }

  /** Wait briefly for the samples so the first strum sounds right, but never block for long. */
  function ready(timeout = 1500) {
    context();
    if (samples) return Promise.resolve(samples);
    return Promise.race([loadSamples(), new Promise(res => setTimeout(() => res(null), timeout))]);
  }

  function nearestSample(midi) {
    let best = null;
    for (const m of samples.keys()) if (best == null || Math.abs(m - midi) < Math.abs(best - midi)) best = m;
    return best;
  }

  function synthBuffer(midi) {
    if (synthCache.has(midi)) return synthCache.get(midi);
    const c = context();
    const sr = c.sampleRate;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const len = Math.floor(sr * 2.8);
    const buf = c.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    const period = Math.max(2, Math.round(sr / freq));
    const ring = new Float32Array(period);
    let prev = 0;
    for (let i = 0; i < period; i++) {
      // Low-passed noise gives a softer, nylon-ish attack.
      prev = prev * 0.55 + (Math.random() * 2 - 1) * 0.45;
      ring[i] = prev;
    }
    const decay = 0.9965 - Math.max(0, midi - 60) * 0.00012;
    for (let i = 0; i < len; i++) {
      const j = i % period;
      out[i] = ring[j];
      ring[j] = decay * 0.5 * (ring[j] + ring[(j + 1) % period]);
    }
    synthCache.set(midi, buf);
    return buf;
  }

  /**
   * One plucked note on context c, routed to dest. `ring` is how long it sustains before
   * fading; returns the voice so live playback can cut it short.
   */
  // The voice currently ringing on each string, per context: a new note on a string damps the old one.
  const stringVoices = new WeakMap();
  function damp(c, string, when) {
    if (string == null) return;
    let map = stringVoices.get(c);
    if (!map) stringVoices.set(c, (map = new Map()));
    const prev = map.get(string);
    if (prev && prev.until > when) {
      try {
        prev.g.gain.cancelScheduledValues(when);
        prev.g.gain.setTargetAtTime(0, when, 0.012);
      } catch { /* already finished */ }
    }
    return map;
  }

  function voice(c, dest, midi, when, gain, ring, string) {
    const src = c.createBufferSource();
    let level = gain;
    // A few cents of drift per note stands in for a real player's touch.
    const cents = (Math.random() - 0.5) * 8;
    if (samples) {
      const base = nearestSample(midi);
      src.buffer = samples.get(base);
      src.playbackRate.value = Math.pow(2, (midi - base + cents / 100) / 12);
    } else {
      src.buffer = synthBuffer(midi);
      level *= 0.55;
    }
    const g = c.createGain();
    g.gain.setValueAtTime(level, when);
    g.gain.setTargetAtTime(0, when + ring, ring > 1 ? 0.35 : 0.08);
    src.connect(g).connect(dest);
    src.start(when);
    const end = when + ring + (ring > 1 ? 2 : 0.6);
    src.stop(end);
    const v = { src, g, until: end };
    damp(c, string, when)?.set(string, v);
    return v;
  }

  // Shared white noise for pick attacks and muted strokes.
  const noiseCache = new WeakMap();
  function noise(c) {
    if (!noiseCache.has(c)) {
      const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.25), c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noiseCache.set(c, buf);
    }
    return noiseCache.get(c);
  }

  /** Short filtered noise burst: the pick or the palm hitting the strings. */
  function burst(c, dest, when, { gain, freq, q = 0.9, decay }) {
    const src = c.createBufferSource();
    src.buffer = noise(c);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    src.connect(f).connect(g).connect(dest);
    src.start(when);
    src.stop(when + decay + 0.02);
    return { src, g };
  }

  const midiOf = n => (typeof n === 'number' ? n : n.m);
  const stringOf = n => (typeof n === 'number' ? null : n.s);

  /** Notes in string order. Up-strums go high to low and a bit faster. */
  /**
   * Notes in string order (numbers, or { m, s } with the string index). Up-strums go high
   * to low and a bit faster; the first strings the pick meets sound strongest.
   */
  function strumOn(c, dest, notes, when, { gain = 0.8, up = false, ring = 2.6, gap } = {}) {
    const order = up ? notes.slice().reverse() : notes;
    const step = gap ?? (up ? 0.009 : 0.013);
    let t = when;
    const voices = order.map((n, i) => {
      const v = voice(c, dest, midiOf(n), t, gain * (1 - i * 0.05) * (0.9 + Math.random() * 0.15), ring, stringOf(n));
      t += step * (0.75 + Math.random() * 0.5);
      return v;
    });
    // A faint pick scrape gives the stroke its edge.
    if (notes.length > 2) voices.push(burst(c, dest, when, { gain: gain * 0.05, freq: up ? 3200 : 2400, decay: 0.03 }));
    return voices;
  }

  /** Muted stroke ("chasquido"): the strumming hand slaps the strings, with a hint of pitch. */
  function chuckOn(c, dest, notes, when, gain = 0.6) {
    const out = [burst(c, dest, when, { gain: gain * 0.35, freq: 1500, q: 0.7, decay: 0.07 })];
    notes.forEach((n, i) => out.push(voice(c, dest, midiOf(n), when + i * 0.006, gain * 0.28, 0.035, stringOf(n))));
    return out;
  }

  function track(voices) {
    voices.forEach(v => { live.add(v); v.src.onended = () => live.delete(v); });
  }

  /** Strum a list of midi notes in string order (lowest string first). */
  async function strum(notes, gap = 0.04) {
    await ready();
    track(strumOn(ctx, master, notes, ctx.currentTime + 0.02, { gap }));
  }

  async function pluck(midi) {
    await ready(600);
    track([voice(ctx, master, midi, ctx.currentTime + 0.01, 0.85, 2.6)]);
  }

  /** Schedule a strum at an absolute time on the live context (for the sequencer). */
  function strumAt(notes, when, opts) {
    context();
    track(strumOn(ctx, master, notes, when, opts));
  }

  function chuckAt(notes, when, gain) {
    context();
    track(chuckOn(ctx, master, notes, when, gain));
  }

  function clickOn(c, dest, when, accent) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.frequency.value = accent ? 1760 : 1320;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(accent ? 0.35 : 0.2, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    osc.connect(g).connect(dest);
    osc.start(when);
    osc.stop(when + 0.06);
    return { src: osc, g };
  }

  function clickAt(when, accent) {
    context();
    track([clickOn(ctx, master, when, accent)]);
  }

  /** Fade out everything that is sounding or scheduled. */
  function stopAll() {
    if (!ctx) return;
    const now = ctx.currentTime;
    live.forEach(v => {
      try {
        v.g.gain.cancelScheduledValues(now);
        v.g.gain.setTargetAtTime(0, now, 0.04);
        v.src.stop(now + 0.3);
      } catch { /* already stopped */ }
    });
    live.clear();
  }

  /**
   * Render a list of events to a WAV blob.
   * events: [{ time, notes, gain, up, ring }] or [{ time, click: true, accent }]
   */
  async function renderWav(events, seconds) {
    await ready(4000);
    const sr = 44100;
    const off = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
    const dest = chain(off);
    events.forEach(e => {
      if (e.click) clickOn(off, dest, e.time, e.accent);
      else if (e.chuck) chuckOn(off, dest, e.notes, e.time, e.gain);
      else strumOn(off, dest, e.notes, e.time, e);
    });
    const buf = await off.startRendering();
    return encodeWav(buf);
  }

  function encodeWav(buf) {
    const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
    const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
    const str = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); data.setUint32(4, 36 + len * ch * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
    data.setUint32(24, sr, true); data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true);
    str(36, 'data'); data.setUint32(40, len * ch * 2, true);
    const chans = [...Array(ch)].map((_, i) => buf.getChannelData(i));
    let o = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < ch; c++) {
        const v = Math.max(-1, Math.min(1, chans[c][i]));
        data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
        o += 2;
      }
    }
    return new Blob([data], { type: 'audio/wav' });
  }

  // Start fetching on the first interaction so the first strum is usually already sampled.
  window.addEventListener('pointerdown', function warm() {
    window.removeEventListener('pointerdown', warm);
    context();
    loadSamples();
  }, { once: true });

  window.Sound = {
    strum, pluck, ready, strumAt, chuckAt, clickAt, stopAll, renderWav,
    now: () => context().currentTime,
  };
})();
