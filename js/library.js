/*
 * Progression library for the composer: typical chord sequences per genre, each with the key,
 * meter, tempo and strumming style it is usually played in. One chord per bar. Tempos are in
 * beats per minute; in 6/8 the beat is the dotted quarter.
 */
(function () {
  const GENRES = [
    { id: 'pop', label: 'Pop' },
    { id: 'rock', label: 'Rock' },
    { id: 'blues', label: 'Blues' },
    { id: 'jazz', label: 'Jazz' },
    { id: 'bossa', label: 'Bossa nova' },
    { id: 'folklore', label: 'Folklore' },
    { id: 'tango', label: 'Tango' },
    { id: 'latino', label: 'Latino' },
    { id: 'reggae', label: 'Reggae' },
    { id: 'soul', label: 'Soul y funk' },
    { id: 'folk', label: 'Folk y country' },
    { id: 'balada', label: 'Baladas' },
  ];

  // g genre, n name, k key, m mode, t meter (4, 3 or 6 for 6/8), bpm, st style, c chords
  const ITEMS = [
    // Pop
    { g: 'pop', n: 'I–V–vi–IV', k: 'C', m: 'major', t: 4, bpm: 100, st: 'pop', c: 'C G Am F' },
    { g: 'pop', n: 'vi–IV–I–V', k: 'C', m: 'major', t: 4, bpm: 92, st: 'pop', c: 'Am F C G' },
    { g: 'pop', n: 'I–vi–IV–V, años 50', k: 'G', m: 'major', t: 6, bpm: 60, st: 'balada', c: 'G Em C D' },
    { g: 'pop', n: 'Canon de Pachelbel', k: 'D', m: 'major', t: 4, bpm: 72, st: 'arpegio', c: 'D A Bm F#m G D G A' },
    { g: 'pop', n: 'Pop en menor i–VI–III–VII', k: 'E', m: 'minor', t: 4, bpm: 96, st: 'pop', c: 'Em C G D' },

    // Rock
    { g: 'rock', n: 'I–IV–V–IV', k: 'D', m: 'major', t: 4, bpm: 126, st: 'ritmico', c: 'D G A G' },
    { g: 'rock', n: 'Mixolidio I–♭VII–IV–I', k: 'D', m: 'major', t: 4, bpm: 116, st: 'ritmico', c: 'D C G D' },
    { g: 'rock', n: 'Eólico i–♭VII–♭VI–♭VII', k: 'A', m: 'minor', t: 4, bpm: 108, st: 'ritmico', c: 'Am G F G' },
    { g: 'rock', n: 'Punk I–V–vi–IV', k: 'E', m: 'major', t: 4, bpm: 168, st: 'ritmico', c: 'E B C#m A' },

    // Blues
    { g: 'blues', n: 'Blues de 12 compases', k: 'A', m: 'major', t: 4, bpm: 96, st: 'shuffle', c: 'A7 A7 A7 A7 D7 D7 A7 A7 E7 D7 A7 E7' },
    { g: 'blues', n: 'Blues con cambio rápido', k: 'E', m: 'major', t: 4, bpm: 112, st: 'shuffle', c: 'E7 A7 E7 E7 A7 A7 E7 E7 B7 A7 E7 B7' },
    { g: 'blues', n: 'Blues de 8 compases', k: 'C', m: 'major', t: 4, bpm: 100, st: 'shuffle', c: 'C7 G7 F7 F7 C7 G7 C7 G7' },
    { g: 'blues', n: 'Blues menor', k: 'A', m: 'minor', t: 4, bpm: 70, st: 'shuffle', c: 'Am7 Am7 Am7 Am7 Dm7 Dm7 Am7 Am7 F7 E7 Am7 E7' },

    // Jazz
    { g: 'jazz', n: 'ii–V–I mayor', k: 'C', m: 'major', t: 4, bpm: 120, st: 'swing', c: 'Dm7 G7 Cmaj7 Cmaj7' },
    { g: 'jazz', n: 'ii–V–i menor', k: 'C', m: 'minor', t: 4, bpm: 110, st: 'swing', c: 'Dm7b5 G7 Cm6 Cm6' },
    { g: 'jazz', n: 'Vuelta I–VI7–ii–V', k: 'C', m: 'major', t: 4, bpm: 140, st: 'swing', c: 'Cmaj7 A7 Dm7 G7' },
    { g: 'jazz', n: 'Ciclo de cuartas', k: 'G', m: 'minor', t: 4, bpm: 120, st: 'swing', c: 'Cm7 F7 Bbmaj7 Ebmaj7 Am7b5 D7 Gm6 Gm6' },
    { g: 'jazz', n: 'Rhythm changes, sección A', k: 'Bb', m: 'major', t: 4, bpm: 160, st: 'swing', c: 'Bbmaj7 G7 Cm7 F7 Dm7 G7 Cm7 F7' },
    { g: 'jazz', n: 'Blues de jazz', k: 'F', m: 'major', t: 4, bpm: 130, st: 'swing', c: 'F7 Bb7 F7 Cm7 Bb7 Bdim7 F7 D7 Gm7 C7 F7 C7' },

    // Bossa nova
    { g: 'bossa', n: 'I–II7–ii–♭II7', k: 'F', m: 'major', t: 4, bpm: 128, st: 'bossa', c: 'Fmaj7 Fmaj7 G7 G7 Gm7 Gb7 Fmaj7 Gb7' },
    { g: 'bossa', n: 'Bossa en menor', k: 'C', m: 'minor', t: 4, bpm: 132, st: 'bossa', c: 'Cm7 Cm7 Fm7 Fm7 Dm7b5 G7 Cm7 Cm7 Ebm7 Ab7 Dbmaj7 Dbmaj7 Dm7b5 G7 Cm7 G7' },
    { g: 'bossa', n: 'I–II7–ii–V', k: 'F', m: 'major', t: 4, bpm: 124, st: 'bossa', c: 'Fmaj7 G7 Gm7 C7' },
    { g: 'bossa', n: 'Cromático descendente', k: 'Bb', m: 'major', t: 4, bpm: 132, st: 'bossa', c: 'Dm7 Db7 Cm7 B7' },
    { g: 'bossa', n: 'ii–V–I–VI7', k: 'C', m: 'major', t: 4, bpm: 120, st: 'bossa', c: 'Dm7 G7 Cmaj7 A7' },

    // Folklore argentino
    { g: 'folklore', n: 'Zamba en menor', k: 'A', m: 'minor', t: 6, bpm: 60, st: 'zamba', c: 'Am E7 Am A7 Dm Am E7 Am' },
    { g: 'folklore', n: 'Zamba en mayor', k: 'G', m: 'major', t: 6, bpm: 62, st: 'zamba', c: 'G D7 G G7 C G D7 G' },
    { g: 'folklore', n: 'Chacarera en menor', k: 'D', m: 'minor', t: 6, bpm: 96, st: 'chacarera', c: 'Dm A7 Dm A7 Gm Dm A7 Dm' },
    { g: 'folklore', n: 'Chacarera en Mi menor', k: 'E', m: 'minor', t: 6, bpm: 100, st: 'chacarera', c: 'Em B7 Em E7 Am Em B7 Em' },
    { g: 'folklore', n: 'Vals criollo', k: 'G', m: 'major', t: 3, bpm: 156, st: 'vals', c: 'G G D7 D7 D7 D7 G G G7 G7 C C G D7 G G' },

    // Tango
    { g: 'tango', n: 'Tango en menor', k: 'D', m: 'minor', t: 4, bpm: 120, st: 'marcato', c: 'Dm Dm A7 A7 A7 A7 Dm D7 Gm Gm Dm Dm A7 A7 Dm Dm' },
    { g: 'tango', n: 'i–iv–V7–i', k: 'A', m: 'minor', t: 4, bpm: 116, st: 'marcato', c: 'Am Dm E7 Am' },
    { g: 'tango', n: 'Milonga', k: 'G', m: 'major', t: 4, bpm: 150, st: 'milonga', c: 'G G D7 D7 D7 D7 G G' },

    // Latino
    { g: 'latino', n: 'Cadencia andaluza', k: 'A', m: 'minor', t: 4, bpm: 100, st: 'ritmico', c: 'Am G F E' },
    { g: 'latino', n: 'Bolero', k: 'C', m: 'major', t: 4, bpm: 72, st: 'arpegio', c: 'Cmaj7 Am7 Dm7 G7' },
    { g: 'latino', n: 'Cumbia en menor', k: 'A', m: 'minor', t: 4, bpm: 96, st: 'ritmico', c: 'Am G C E7' },

    // Reggae
    { g: 'reggae', n: 'I–IV–V–IV', k: 'G', m: 'major', t: 4, bpm: 76, st: 'reggae', c: 'G C D C' },
    { g: 'reggae', n: 'i–iv en menor', k: 'A', m: 'minor', t: 4, bpm: 72, st: 'reggae', c: 'Am Dm Am Dm' },
    { g: 'reggae', n: 'I–vi–IV–V', k: 'C', m: 'major', t: 4, bpm: 80, st: 'reggae', c: 'C Am F G' },

    // Soul y funk
    { g: 'soul', n: 'Neo soul IV–iii–ii–I', k: 'C', m: 'major', t: 4, bpm: 76, st: 'arpegio', c: 'Fmaj7 Em7 Dm7 Cmaj7' },
    { g: 'soul', n: 'Vamp de funk', k: 'E', m: 'major', t: 4, bpm: 104, st: 'ritmico', c: 'E9 E9 A9 E9' },
    { g: 'soul', n: 'Vamp dórico i–IV', k: 'A', m: 'minor', t: 4, bpm: 116, st: 'ritmico', c: 'Am7 D9 Am7 D9' },

    // Folk y country
    { g: 'folk', n: 'I–IV–I–V', k: 'G', m: 'major', t: 4, bpm: 100, st: 'folk', c: 'G C G D' },
    { g: 'folk', n: 'Country', k: 'G', m: 'major', t: 4, bpm: 112, st: 'folk', c: 'G G C C D D G G' },
    { g: 'folk', n: 'Vals folk', k: 'C', m: 'major', t: 3, bpm: 120, st: 'vals', c: 'C F G7 C' },
    { g: 'folk', n: 'Celta i–♭VII–♭VI–♭VII', k: 'E', m: 'minor', t: 6, bpm: 96, st: 'balada', c: 'Em D C D' },

    // Baladas
    { g: 'balada', n: 'Línea cliché', k: 'A', m: 'minor', t: 4, bpm: 72, st: 'arpegio', c: 'Am AmMaj7 Am7 Am6' },
    { g: 'balada', n: 'I–V–vi–iii–IV–I–IV–V', k: 'C', m: 'major', t: 4, bpm: 72, st: 'balada', c: 'C G Am Em F C F G' },
    { g: 'balada', n: 'Balada en 6/8', k: 'D', m: 'major', t: 6, bpm: 60, st: 'balada', c: 'D F#m G A' },
    { g: 'balada', n: 'Balada en 3/4', k: 'G', m: 'major', t: 3, bpm: 84, st: 'arpegio', c: 'G D Em C' },
  ];

  window.Library = { GENRES, ITEMS };
})();
