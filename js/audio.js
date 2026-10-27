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

  function context() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.6;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      master.connect(comp).connect(ctx.destination);
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
    if (samples) return Promise.resolve(samples);
    return Promise.race([loadSamples(), new Promise(res => setTimeout(() => res(null), timeout))]);
  }

  function nearestSample(midi) {
    let best = null;
    for (const m of samples.keys()) if (best == null || Math.abs(m - midi) < Math.abs(best - midi)) best = m;
    return best;
  }

  function sampleNote(midi, when, gain) {
    const c = context();
    const base = nearestSample(midi);
    const src = c.createBufferSource();
    src.buffer = samples.get(base);
    src.playbackRate.value = Math.pow(2, (midi - base) / 12);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.setTargetAtTime(0, when + 2.6, 0.35);
    src.connect(g).connect(master);
    src.start(when);
    src.stop(when + 4.5);
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

  function synthNote(midi, when, gain) {
    const c = context();
    const src = c.createBufferSource();
    src.buffer = synthBuffer(midi);
    const g = c.createGain();
    g.gain.setValueAtTime(gain * 0.55, when);
    g.gain.setTargetAtTime(0, when + 1.9, 0.25);
    src.connect(g).connect(master);
    src.start(when);
    src.stop(when + 3);
  }

  const note = (midi, when, gain) => (samples ? sampleNote : synthNote)(midi, when, gain);

  /** Strum a list of midi notes in string order (lowest string first). */
  async function strum(notes, gap = 0.04) {
    context();
    await ready();
    const t = ctx.currentTime + 0.02;
    notes.forEach((m, i) => note(m, t + i * gap, 0.8 - i * 0.03));
  }

  async function pluck(midi) {
    context();
    await ready(600);
    note(midi, ctx.currentTime + 0.01, 0.85);
  }

  // Start fetching on the first interaction so the first strum is usually already sampled.
  window.addEventListener('pointerdown', function warm() {
    window.removeEventListener('pointerdown', warm);
    context();
    loadSamples();
  }, { once: true });

  window.Sound = { strum, pluck };
})();
