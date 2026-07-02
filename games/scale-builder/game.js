/* Scale Builder — build the major scale for a given key, one note at a time.
   Plain JS, no dependencies. See index.html / style.css in this folder. */

(() => {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const STORAGE_BEST_PREFIX = 'scaleBuilder.best.';
  const STORAGE_MASTERY = 'scaleBuilder.mastery';
  const SCALES_PER_SESSION = 10;

  // ---------------------------------------------------------------------
  // Frequency helper (shared platform convention)
  // ---------------------------------------------------------------------

  function noteToFrequency(name) { // e.g. "C#4"
    const letters = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const m = name.match(/^([A-G])(#?)(\d)$/);
    const [, letter, sharp, octaveStr] = m;
    const octave = parseInt(octaveStr, 10);
    const semitoneFromC0 = letters[letter] + (sharp ? 1 : 0) + octave * 12;
    const semitoneFromA4 = semitoneFromC0 - (9 + 4 * 12);
    return 440 * Math.pow(2, semitoneFromA4 / 12);
  }

  // Absolute semitone-from-A4 for a { letter, accidental('#'|''), octave } triple.
  // This is the single source of truth used for grading (never string comparison).
  function absSemitone(letter, accidental, octave) {
    const letters = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const semitoneFromC0 = letters[letter] + (accidental === '#' ? 1 : 0) + octave * 12;
    return semitoneFromC0 - (9 + 4 * 12);
  }

  // ---------------------------------------------------------------------
  // Major scale pattern
  // ---------------------------------------------------------------------

  // Semitones from tonic, cumulative, degrees 1-8 (degree 8 = octave of tonic).
  const MAJOR_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11, 12];
  // Label for the interval just taken TO reach this degree (index = degree-1).
  const STEP_LABELS = ['—', 'Whole', 'Whole', 'Half', 'Whole', 'Whole', 'Whole', 'Half'];

  // ---------------------------------------------------------------------
  // Enharmonic spelling table — hand-authored, verified against
  // letter-name cycling + W-W-H-W-W-W-H semitone pattern + circle of fifths.
  // Each entry: display name, key-signature type/count, 7-letter spelling
  // (degree 8 always repeats degree 1's letter+accidental one octave up),
  // and difficulty tier (Easy / Medium / Hard pools, additive).
  // ---------------------------------------------------------------------

  const KEY_DATA = {
    C:  { display: 'C Major',   tonicLetter: 'C', tonicAcc: '',  refOctave: 4, sig: { type: 'none', count: 0 },
          spelling: ['C', 'D', 'E', 'F', 'G', 'A', 'B'], tier: 'easy' },
    G:  { display: 'G Major',   tonicLetter: 'G', tonicAcc: '',  refOctave: 4, sig: { type: 'sharp', count: 1 },
          spelling: ['G', 'A', 'B', 'C', 'D', 'E', 'F#'], tier: 'easy' },
    D:  { display: 'D Major',   tonicLetter: 'D', tonicAcc: '',  refOctave: 4, sig: { type: 'sharp', count: 2 },
          spelling: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'], tier: 'easy' },
    F:  { display: 'F Major',   tonicLetter: 'F', tonicAcc: '',  refOctave: 4, sig: { type: 'flat', count: 1 },
          spelling: ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'], tier: 'easy' },
    A:  { display: 'A Major',   tonicLetter: 'A', tonicAcc: '',  refOctave: 4, sig: { type: 'sharp', count: 3 },
          spelling: ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#'], tier: 'medium' },
    E:  { display: 'E Major',   tonicLetter: 'E', tonicAcc: '',  refOctave: 4, sig: { type: 'sharp', count: 4 },
          spelling: ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#'], tier: 'medium' },
    Bb: { display: 'B♭ Major', tonicLetter: 'B', tonicAcc: 'b', refOctave: 4, sig: { type: 'flat', count: 2 },
          spelling: ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A'], tier: 'medium' },
    Eb: { display: 'E♭ Major', tonicLetter: 'E', tonicAcc: 'b', refOctave: 4, sig: { type: 'flat', count: 3 },
          spelling: ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D'], tier: 'medium' },
    B:  { display: 'B Major',   tonicLetter: 'B', tonicAcc: '',  refOctave: 4, sig: { type: 'sharp', count: 5 },
          spelling: ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#'], tier: 'hard' },
    FSharp: { display: 'F♯ Major', tonicLetter: 'F', tonicAcc: '#', refOctave: 4, sig: { type: 'sharp', count: 6 },
          spelling: ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#'], tier: 'hard' },
    CSharp: { display: 'C♯ Major', tonicLetter: 'C', tonicAcc: '#', refOctave: 4, sig: { type: 'sharp', count: 7 },
          spelling: ['C#', 'D#', 'E#', 'F#', 'G#', 'A#', 'B#'], tier: 'hard' },
    Ab: { display: 'A♭ Major', tonicLetter: 'A', tonicAcc: 'b', refOctave: 4, sig: { type: 'flat', count: 4 },
          spelling: ['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G'], tier: 'hard' },
    Db: { display: 'D♭ Major', tonicLetter: 'D', tonicAcc: 'b', refOctave: 4, sig: { type: 'flat', count: 5 },
          spelling: ['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C'], tier: 'hard' }
  };

  const DIFFICULTY_POOLS = {
    easy: ['C', 'G', 'D', 'F'],
    medium: ['C', 'G', 'D', 'F', 'A', 'E', 'Bb', 'Eb'],
    hard: Object.keys(KEY_DATA)
  };

  // Parse a spelling token like "F#" or "Bb" -> { letter, accidental }
  function parseSpelledNote(token) {
    const m = token.match(/^([A-G])(#|b)?$/);
    return { letter: m[1], accidental: m[2] === 'b' ? 'b' : (m[2] === '#' ? '#' : '') };
  }

  // Build the full 8-degree scale for a key, resolving octave numbers.
  // Degree 1 = tonic at refOctave. Octave increments each time the scale
  // wraps past B going up (letter index resets below the tonic's letter).
  function buildScaleDegrees(keyId) {
    const key = KEY_DATA[keyId];
    const LETTER_ORDER = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const tonicLetterIdx = LETTER_ORDER.indexOf(key.tonicLetter);

    const degrees = [];
    for (let i = 0; i < 7; i++) {
      const { letter, accidental } = parseSpelledNote(key.spelling[i]);
      const letterIdx = LETTER_ORDER.indexOf(letter);
      // octave bumps by 1 once the letter cycle has wrapped past B relative to tonic
      const wrapped = letterIdx < tonicLetterIdx;
      const octave = key.refOctave + (wrapped ? 1 : 0);
      const acc = accidental === 'b' ? '#' : accidental; // normalize: flats handled via absSemitone below
      degrees.push({
        degree: i + 1,
        letter,
        accidental, // '' | '#' | 'b' — for DISPLAY only
        octave,
        semitone: absSemitoneFlatAware(letter, accidental, octave)
      });
    }
    // Degree 8 = tonic one octave up
    const tonicAcc = key.tonicAcc;
    degrees.push({
      degree: 8,
      letter: key.tonicLetter,
      accidental: tonicAcc,
      octave: key.refOctave + 1,
      semitone: absSemitoneFlatAware(key.tonicLetter, tonicAcc, key.refOctave + 1)
    });
    return degrees;
  }

  // Like absSemitone, but also accepts 'b' for flats (for display-spelled degrees).
  function absSemitoneFlatAware(letter, accidental, octave) {
    const letters = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    let semitoneFromC0 = letters[letter] + octave * 12;
    if (accidental === '#') semitoneFromC0 += 1;
    if (accidental === 'b') semitoneFromC0 -= 1;
    return semitoneFromC0 - (9 + 4 * 12);
  }

  function tonicSemitone(keyId) {
    const key = KEY_DATA[keyId];
    return absSemitoneFlatAware(key.tonicLetter, key.tonicAcc, key.refOctave);
  }

  // ---------------------------------------------------------------------
  // Key-signature reference glyph positions (standard treble-clef engraving
  // order). Step 0 = E4 (bottom treble line), same convention as the
  // staff-sprint sibling game: stepToY(step) = baselineY - step*(lineSpacing/2).
  // ---------------------------------------------------------------------

  const SHARP_GLYPH_STEPS = [8, 5, 9, 6, 3, 7, 4]; // F# C# G# D# A# E# B#
  const FLAT_GLYPH_STEPS = [4, 7, 3, 6, 2, 5, 1];  // Bb Eb Ab Db Gb Cb Fb

  // ---------------------------------------------------------------------
  // Audio engine — single lazily-created AudioContext
  // ---------------------------------------------------------------------

  const Audio_ = (() => {
    let ctx = null;

    function ensureCtx() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    function playTone({ freq, duration, type = 'sine', gain = 0.2, delay = 0 }) {
      const c = ensureCtx();
      const start = c.currentTime + delay;
      const osc = c.createOscillator();
      const amp = c.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);

      // ~5ms quick attack, ~250ms exponential decay release
      amp.gain.setValueAtTime(0.0001, start);
      amp.gain.exponentialRampToValueAtTime(gain, start + 0.005);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + duration / 1000);

      osc.connect(amp).connect(c.destination);
      osc.start(start);
      osc.stop(start + duration / 1000 + 0.05);
    }

    return {
      unlock() { ensureCtx(); },

      playCorrect(freq) {
        // pleasant tone at the actual pitch
        playTone({ freq, duration: 260, type: 'triangle', gain: 0.22 });
      },

      playIncorrect() {
        // quiet muted thunk — never the pressed key's real pitch
        playTone({ freq: 80, duration: 60, type: 'square', gain: 0.07 });
      },

      playScalePlayback(freqs) {
        // just-built scale played back top to bottom as a quick ascending run
        freqs.forEach((f, i) => {
          playTone({ freq: f, duration: 150, type: 'sine', gain: 0.18, delay: i * 0.15 });
        });
      },

      playFanfare() {
        // 3-note ascending arpeggio fanfare, C5-E5-G5, ~100ms each
        const notes = [523.25, 659.25, 783.99];
        notes.forEach((f, i) => {
          playTone({ freq: f, duration: 110, type: 'sine', gain: 0.2, delay: i * 0.11 });
        });
      }
    };
  })();

  // ---------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------

  function loadBest(difficulty) {
    try {
      const raw = localStorage.getItem(STORAGE_BEST_PREFIX + difficulty);
      if (!raw) return { score: 0, accuracy: 0 };
      const parsed = JSON.parse(raw);
      return {
        score: Number(parsed.score) || 0,
        accuracy: Number(parsed.accuracy) || 0
      };
    } catch (e) {
      return { score: 0, accuracy: 0 };
    }
  }

  function saveBest(difficulty, best) {
    try {
      localStorage.setItem(STORAGE_BEST_PREFIX + difficulty, JSON.stringify(best));
    } catch (e) {
      /* localStorage unavailable — silently ignore, game still works */
    }
  }

  function loadMastery() {
    try {
      const raw = localStorage.getItem(STORAGE_MASTERY);
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch (e) {
      return {};
    }
  }

  function saveMastery(map) {
    try {
      localStorage.setItem(STORAGE_MASTERY, JSON.stringify(map));
    } catch (e) {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------------
  // DOM references
  // ---------------------------------------------------------------------

  const els = {
    startScreen: document.getElementById('start-screen'),
    gameScreen: document.getElementById('game-screen'),
    resultsScreen: document.getElementById('results-screen'),

    difficultyOptions: Array.from(document.querySelectorAll('.difficulty-option')),
    startBtn: document.getElementById('start-btn'),
    bestPreview: document.getElementById('best-preview'),

    statScore: document.getElementById('stat-score'),
    statScales: document.getElementById('stat-scales'),
    statAccuracy: document.getElementById('stat-accuracy'),
    skipBtn: document.getElementById('skip-btn'),

    promptHeading: document.getElementById('prompt-heading'),
    keySigSvg: document.getElementById('key-sig-svg'),

    rack: document.getElementById('rack'),
    feedbackStrip: document.getElementById('feedback-strip'),

    keyboardViewport: document.getElementById('keyboard-viewport'),
    keyboard: document.getElementById('keyboard'),
    octaveLeft: document.getElementById('octave-left'),
    octaveRight: document.getElementById('octave-right'),
    legendRow: document.getElementById('legend-row'),

    resultsHeading: document.querySelector('.results-heading'),
    bannerBest: document.getElementById('banner-best'),
    gradeBadge: document.getElementById('grade-badge'),
    resultScore: document.getElementById('result-score'),
    resultAccuracy: document.getElementById('result-accuracy'),
    resultPerfect: document.getElementById('result-perfect'),
    resultsBestLine: document.getElementById('results-best-line'),
    masteryChecklist: document.getElementById('mastery-checklist'),
    playAgainBtn: document.getElementById('play-again-btn')
  };

  // ---------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------

  const state = {
    difficulty: 'easy',
    score: 0,
    scalesCompleted: 0,
    firstTryCorrectCount: 0, // for accuracy = first-try-correct rate
    perfectScaleCount: 0,
    accuracyLog: [], // one bool per scale: true if zero wrong attempts
    currentKeyId: null,
    previousKeyId: null,
    scaleDegrees: [], // built from buildScaleDegrees(currentKeyId)
    currentDegree: 1, // degree just placed (1 = tonic pre-lit); next target = currentDegree+1
    wrongAttemptsThisScale: 0,
    hadWrongThisScaleDegree: false,
    masteryMap: loadMastery(),
    keysUsedThisSession: [],
    inputLocked: false,
    keyboardWindowStartWhiteIndex: 0 // index into full white-key letter sequence
  };

  // ---------------------------------------------------------------------
  // Piano keyboard model
  // ---------------------------------------------------------------------

  // Full chromatic white-key letter order, spanning a wide range so any
  // tonic + up to 2 octaves of scale degrees fits comfortably.
  const WHITE_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  // Black key presence after a given white letter (true = black key exists
  // between this white key and the next one).
  const BLACK_AFTER = { C: true, D: true, E: false, F: true, G: true, A: true, B: false };

  const KEYBOARD_LOW_OCTAVE = 2;
  const KEYBOARD_HIGH_OCTAVE = 6;
  const VISIBLE_WHITE_KEYS = 14; // 2 octaves visible at once in the viewport

  // Build the full renderable key list: white keys first (in order), each
  // with an absolute semitone-from-A4, letter, octave; black keys derived
  // from the white key immediately to their left.
  function buildFullKeyboardModel() {
    const whiteKeys = [];
    for (let oct = KEYBOARD_LOW_OCTAVE; oct <= KEYBOARD_HIGH_OCTAVE; oct++) {
      WHITE_LETTERS.forEach((letter) => {
        whiteKeys.push({
          type: 'white',
          letter,
          accidental: '',
          octave: oct,
          semitone: absSemitone(letter, '', oct)
        });
      });
    }
    return whiteKeys;
  }

  const FULL_WHITE_KEYS = buildFullKeyboardModel();

  // Computer-keyboard mapping (shared platform convention, same as Key Quest):
  // white keys A S D F G H J (7 keys = 1 octave), black keys W E T Y U.
  const WHITE_KEY_MAP = ['A', 'S', 'D', 'F', 'G', 'H', 'J'];
  const BLACK_KEY_MAP_BY_LETTER = { C: 'W', D: 'E', F: 'T', G: 'Y', A: 'U' };

  // ---------------------------------------------------------------------
  // Keyboard rendering — geometry formulas per shared platform convention
  // ---------------------------------------------------------------------

  function renderKeyboard() {
    els.keyboard.innerHTML = '';
    const containerWidth = els.keyboardViewport.clientWidth || 640;
    const whiteKeyWidth = containerWidth / VISIBLE_WHITE_KEYS;
    const blackKeyWidth = whiteKeyWidth * 0.6;
    const totalWhiteKeys = FULL_WHITE_KEYS.length;

    els.keyboard.style.width = `${totalWhiteKeys * whiteKeyWidth}px`;

    // White keys
    FULL_WHITE_KEYS.forEach((wk, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'key key--white';
      btn.style.left = `${index * whiteKeyWidth}px`;
      btn.style.width = `${whiteKeyWidth}px`;
      btn.dataset.semitone = String(wk.semitone);
      btn.dataset.letter = wk.letter;
      btn.dataset.accidental = '';
      btn.dataset.octave = String(wk.octave);
      btn.setAttribute('aria-label', `${wk.letter}${wk.octave}`);

      const mapIdx = index % 7;
      const mapLetter = WHITE_KEY_MAP[mapIdx];
      const letterSpan = document.createElement('span');
      letterSpan.className = 'key-letter';
      letterSpan.textContent = mapLetter;
      btn.appendChild(letterSpan);

      btn.addEventListener('click', () => handleKeyPress(wk.semitone, btn));
      els.keyboard.appendChild(btn);

      // Black key immediately after this white key, if one exists
      if (BLACK_AFTER[wk.letter]) {
        const blackBtn = document.createElement('button');
        blackBtn.type = 'button';
        blackBtn.className = 'key key--black';
        const left = (index + 1) * whiteKeyWidth - blackKeyWidth / 2;
        blackBtn.style.left = `${left}px`;
        blackBtn.style.width = `${blackKeyWidth}px`;
        const semitone = wk.semitone + 1;
        blackBtn.dataset.semitone = String(semitone);
        blackBtn.dataset.letter = wk.letter;
        blackBtn.dataset.accidental = '#';
        blackBtn.dataset.octave = String(wk.octave);
        blackBtn.setAttribute('aria-label', `${wk.letter}${'♯'}${wk.octave}`);

        const blackMapLetter = BLACK_KEY_MAP_BY_LETTER[wk.letter];
        if (blackMapLetter) {
          const bSpan = document.createElement('span');
          bSpan.className = 'key-letter';
          bSpan.textContent = blackMapLetter;
          blackBtn.appendChild(bSpan);
        }

        blackBtn.addEventListener('click', () => handleKeyPress(semitone, blackBtn));
        els.keyboard.appendChild(blackBtn);
      }
    });

    renderLegend();
    highlightKeyboardState();
    centerKeyboardOnDegree();
  }

  function renderLegend() {
    els.legendRow.innerHTML = '';
    const items = [
      { letter: 'A', black: false }, { letter: 'W', black: true },
      { letter: 'S', black: false }, { letter: 'E', black: true },
      { letter: 'D', black: false },
      { letter: 'F', black: false }, { letter: 'T', black: true },
      { letter: 'G', black: false }, { letter: 'Y', black: true },
      { letter: 'H', black: false }, { letter: 'U', black: true },
      { letter: 'J', black: false }
    ];
    items.forEach((item) => {
      const chip = document.createElement('span');
      chip.className = 'legend-key' + (item.black ? ' is-black' : '');
      chip.innerHTML = `<span class="legend-letter">${item.letter}</span>`;
      els.legendRow.appendChild(chip);
    });
  }

  function findKeyButton(semitone) {
    return Array.from(els.keyboard.querySelectorAll('.key'))
      .find((k) => Number(k.dataset.semitone) === semitone);
  }

  function highlightKeyboardState() {
    // clear previous highlight classes
    els.keyboard.querySelectorAll('.key').forEach((k) => {
      k.classList.remove('is-tonic-lit', 'is-next-degree');
    });

    if (!state.scaleDegrees.length) return;

    const tonicDeg = state.scaleDegrees[0];
    const tonicBtn = findKeyButton(tonicDeg.semitone);
    if (tonicBtn) tonicBtn.classList.add('is-tonic-lit');

    if (state.currentDegree < 8) {
      const nextDeg = state.scaleDegrees[state.currentDegree]; // index = currentDegree (0-based next)
      const nextBtn = findKeyButton(nextDeg.semitone);
      if (nextBtn) nextBtn.classList.add('is-next-degree');
    }
  }

  // Auto-scroll/center the keyboard viewport so the active degree's
  // neighborhood stays in view as currentDegree advances.
  function centerKeyboardOnDegree() {
    if (!state.scaleDegrees.length) return;
    const containerWidth = els.keyboardViewport.clientWidth || 640;
    const whiteKeyWidth = containerWidth / VISIBLE_WHITE_KEYS;

    // Target: the next degree to be played (or tonic if scale just started/finished)
    const targetIdx = Math.min(state.currentDegree, 7); // 0-based degree index into scaleDegrees array
    const targetDeg = state.scaleDegrees[targetIdx] || state.scaleDegrees[0];

    // Find the nearest matching white-key index (for black keys, use the
    // preceding white key position so centering stays visually sensible).
    let refWhiteIndex = FULL_WHITE_KEYS.findIndex(
      (wk) => wk.semitone === targetDeg.semitone
    );
    if (refWhiteIndex === -1) {
      // it's a black key (sharp) — find nearest white key at semitone-1
      refWhiteIndex = FULL_WHITE_KEYS.findIndex(
        (wk) => wk.semitone === targetDeg.semitone - 1
      );
    }
    if (refWhiteIndex === -1) refWhiteIndex = 0;

    // Also make sure the tonic and the octave (degree 8) are reachable in
    // the same window when possible: bias the center between tonic and the
    // furthest degree already placed/upcoming.
    const tonicWhiteIndex = FULL_WHITE_KEYS.findIndex(
      (wk) => wk.semitone === state.scaleDegrees[0].semitone
    );
    const lastDeg = state.scaleDegrees[7];
    let lastWhiteIndex = FULL_WHITE_KEYS.findIndex((wk) => wk.semitone === lastDeg.semitone);
    if (lastWhiteIndex === -1) {
      lastWhiteIndex = FULL_WHITE_KEYS.findIndex((wk) => wk.semitone === lastDeg.semitone - 1);
    }

    // Pick a window that keeps [tonic .. currently relevant degree] visible,
    // growing toward the octave as currentDegree advances.
    const relevantHighIndex = Math.max(refWhiteIndex, tonicWhiteIndex);
    const spanWidth = Math.max(relevantHighIndex - tonicWhiteIndex, 0);

    let startIndex;
    if (spanWidth < VISIBLE_WHITE_KEYS - 2) {
      // both tonic and target fit — center window around their midpoint,
      // but keep tonic comfortably inside (not flush at the edge)
      const midpoint = (tonicWhiteIndex + relevantHighIndex) / 2;
      startIndex = Math.round(midpoint - VISIBLE_WHITE_KEYS / 2);
    } else {
      // target has scrolled far from tonic — follow the target directly
      startIndex = Math.round(refWhiteIndex - VISIBLE_WHITE_KEYS / 2);
    }

    startIndex = Math.max(0, Math.min(startIndex, FULL_WHITE_KEYS.length - VISIBLE_WHITE_KEYS));
    state.keyboardWindowStartWhiteIndex = startIndex;

    const scrollLeft = startIndex * whiteKeyWidth;
    els.keyboardViewport.scrollTo({ left: scrollLeft, behavior: 'smooth' });

    updateOctaveNavState(startIndex, whiteKeyWidth);
  }

  function updateOctaveNavState(startIndex, whiteKeyWidth) {
    els.octaveLeft.disabled = startIndex <= 0;
    els.octaveRight.disabled = startIndex >= FULL_WHITE_KEYS.length - VISIBLE_WHITE_KEYS;
  }

  function shiftKeyboardWindow(direction) {
    const containerWidth = els.keyboardViewport.clientWidth || 640;
    const whiteKeyWidth = containerWidth / VISIBLE_WHITE_KEYS;
    let startIndex = state.keyboardWindowStartWhiteIndex + direction * 7; // shift by an octave
    startIndex = Math.max(0, Math.min(startIndex, FULL_WHITE_KEYS.length - VISIBLE_WHITE_KEYS));
    state.keyboardWindowStartWhiteIndex = startIndex;
    els.keyboardViewport.scrollTo({ left: startIndex * whiteKeyWidth, behavior: 'smooth' });
    updateOctaveNavState(startIndex, whiteKeyWidth);
  }

  // ---------------------------------------------------------------------
  // Key-signature reference SVG (per-key lookup, standard engraving order)
  // ---------------------------------------------------------------------

  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function renderKeySignature(keyId) {
    const svg = els.keySigSvg;
    svg.innerHTML = '';
    const key = KEY_DATA[keyId];

    const lineSpacing = 8;
    const baselineY = 48; // bottom staff line (viewBox 0 0 150 64)
    const staffLeft = 34;
    const staffRight = 146;

    function stepToY(step) {
      return baselineY - step * (lineSpacing / 2);
    }

    // 5 staff lines (steps 0,2,4,6,8)
    for (let s = 0; s <= 8; s += 2) {
      const y = stepToY(s);
      svg.appendChild(svgEl('line', {
        x1: staffLeft, y1: y, x2: staffRight, y2: y, class: 'key-sig-staffline'
      }));
    }

    // Treble clef — shared vector glyph, anchored/scaled from the staff
    // geometry (never a font character; see assets/js/notation.js).
    const clefX = staffLeft + 2;
    svg.appendChild(MusicNotation.clef('treble', {
      x: clefX,
      bottomLineY: baselineY,
      lineSpacing: lineSpacing,
      className: 'key-sig-clef'
    }));

    // Accidental glyphs, laid out after the clef in engraving order
    const steps = key.sig.type === 'sharp' ? SHARP_GLYPH_STEPS : (key.sig.type === 'flat' ? FLAT_GLYPH_STEPS : []);
    const count = key.sig.count;
    const startX = clefX + MusicNotation.clefWidth('treble', lineSpacing) + 6;
    const glyphSpacing = 10;

    for (let i = 0; i < count; i++) {
      svg.appendChild(MusicNotation.accidental(key.sig.type, {
        x: startX + i * glyphSpacing,
        y: stepToY(steps[i]),
        lineSpacing: lineSpacing,
        className: 'key-sig-accidental'
      }));
    }
  }

  // ---------------------------------------------------------------------
  // Scale rack rendering
  // ---------------------------------------------------------------------

  function renderRack() {
    els.rack.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const slot = document.createElement('div');
      slot.className = 'rack-slot' + (i === 0 ? ' is-tonic' : '');
      slot.dataset.degree = String(i + 1);

      const notehead = document.createElement('div');
      notehead.className = 'rack-notehead';
      const degreeLabel = document.createElement('span');
      degreeLabel.className = 'rack-degree';
      degreeLabel.textContent = String(i + 1);
      const nameLabel = document.createElement('span');
      nameLabel.className = 'rack-name';

      slot.appendChild(notehead);
      slot.appendChild(degreeLabel);
      slot.appendChild(nameLabel);
      els.rack.appendChild(slot);
    }
  }

  function fillRackSlot(degreeNum, displayName) {
    const slot = els.rack.querySelector(`.rack-slot[data-degree="${degreeNum}"]`);
    if (!slot) return;
    slot.classList.add('is-filled');
    const nameLabel = slot.querySelector('.rack-name');
    if (nameLabel) nameLabel.textContent = displayName;
  }

  function formatDegreeName(deg) {
    const accGlyph = deg.accidental === '#' ? '♯' : (deg.accidental === 'b' ? '♭' : '');
    return `${deg.letter}${accGlyph}`;
  }

  // ---------------------------------------------------------------------
  // Round / scale lifecycle
  // ---------------------------------------------------------------------

  function pickNextKey() {
    const pool = DIFFICULTY_POOLS[state.difficulty];
    let candidates = pool.filter((k) => k !== state.previousKeyId);
    if (candidates.length === 0) candidates = pool;
    const keyId = candidates[Math.floor(Math.random() * candidates.length)];
    return keyId;
  }

  function startScale() {
    state.inputLocked = false;
    state.wrongAttemptsThisScale = 0;
    state.currentDegree = 1; // tonic already "placed"

    const keyId = pickNextKey();
    state.previousKeyId = keyId;
    state.currentKeyId = keyId;
    state.scaleDegrees = buildScaleDegrees(keyId);
    state.keysUsedThisSession.push(keyId);

    const key = KEY_DATA[keyId];
    els.promptHeading.textContent = `Build: ${key.display}`;
    renderKeySignature(keyId);
    renderRack();

    // Pre-fill tonic (degree 1) in the rack
    fillRackSlot(1, formatDegreeName(state.scaleDegrees[0]));

    els.feedbackStrip.textContent = 'Tonic is lit — build up from here.';
    els.feedbackStrip.className = 'feedback-strip';

    updateStats();
    renderKeyboard();
  }

  function handleKeyPress(semitone, btnEl) {
    if (state.inputLocked || !state.scaleDegrees.length) return;
    if (state.currentDegree >= 8) return; // scale already complete

    const targetDeg = state.scaleDegrees[state.currentDegree]; // next degree to place (0-indexed = currentDegree)
    const correct = semitone === targetDeg.semitone;

    if (correct) {
      state.inputLocked = true;
      flashKey(btnEl, 'is-correct');
      spawnRipple(btnEl);

      const freq = 440 * Math.pow(2, semitone / 12);
      Audio_.playCorrect(freq);

      state.currentDegree += 1;
      fillRackSlot(targetDeg.degree, formatDegreeName(targetDeg));

      const label = STEP_LABELS[targetDeg.degree - 1];
      showFeedback(`${label} Step`, label === 'Half' ? 'is-half' : 'is-whole');

      highlightKeyboardState();
      centerKeyboardOnDegree();

      if (state.currentDegree >= 8) {
        setTimeout(completeScale, 550);
      } else {
        setTimeout(() => { state.inputLocked = false; }, 400);
      }
    } else {
      flashKey(btnEl, 'is-wrong');
      Audio_.playIncorrect();
      state.wrongAttemptsThisScale += 1;
      showFeedback('Try again', 'is-wrong');
      // no lock — unlimited retries allowed, rack does not advance
    }
  }

  function flashKey(btnEl, cls) {
    if (!btnEl) return;
    btnEl.classList.add(cls);
    setTimeout(() => btnEl.classList.remove(cls), 400);
  }

  function spawnRipple(btnEl) {
    if (!btnEl) return;
    const ripple = document.createElement('span');
    ripple.className = 'key-ripple';
    btnEl.appendChild(ripple);
    setTimeout(() => ripple.remove(), 520);
  }

  function showFeedback(text, cls) {
    els.feedbackStrip.textContent = text;
    els.feedbackStrip.className = 'feedback-strip ' + cls;
  }

  function completeScale() {
    // Play the just-built scale back top-to-bottom (well, tonic-to-octave)
    const freqs = state.scaleDegrees.map((d) => 440 * Math.pow(2, d.semitone / 12));
    Audio_.playScalePlayback(freqs);

    showFeedback('Scale complete!', 'is-complete');

    const wrongCount = state.wrongAttemptsThisScale;
    const isPerfect = wrongCount === 0;
    let scaleScore = Math.max(20, 100 - 10 * wrongCount);
    if (isPerfect) scaleScore += 50;

    state.score += scaleScore;
    state.scalesCompleted += 1;
    if (isPerfect) {
      state.perfectScaleCount += 1;
      state.firstTryCorrectCount += 1;
    }
    state.accuracyLog.push(isPerfect);

    // Update mastery map
    state.masteryMap[state.currentKeyId] = isPerfect ? 'perfect' : 'completed';
    saveMastery(state.masteryMap);

    updateStats();

    setTimeout(() => {
      if (state.scalesCompleted >= SCALES_PER_SESSION) {
        endSession();
      } else {
        startScale();
      }
    }, 1400);
  }

  function skipScale() {
    if (!state.scaleDegrees.length) return;
    // Skipping counts as neither perfect nor first-try-correct, but still
    // advances the session with a minimal score and marks progress.
    state.scalesCompleted += 1;
    state.accuracyLog.push(false);
    state.score += 20;
    state.masteryMap[state.currentKeyId] = state.masteryMap[state.currentKeyId] || 'completed';
    saveMastery(state.masteryMap);

    updateStats();
    showFeedback('Skipped', 'is-wrong');

    if (state.scalesCompleted >= SCALES_PER_SESSION) {
      setTimeout(endSession, 400);
    } else {
      setTimeout(startScale, 400);
    }
  }

  function updateStats() {
    els.statScore.textContent = String(state.score);
    els.statScales.textContent = `${state.scalesCompleted}/${SCALES_PER_SESSION}`;
    const total = state.accuracyLog.length;
    const accuracyPct = total === 0 ? 100 : Math.round((state.firstTryCorrectCount / total) * 100);
    els.statAccuracy.textContent = `${accuracyPct}%`;
  }

  // ---------------------------------------------------------------------
  // Session start / end
  // ---------------------------------------------------------------------

  function beginSession() {
    state.score = 0;
    state.scalesCompleted = 0;
    state.firstTryCorrectCount = 0;
    state.perfectScaleCount = 0;
    state.accuracyLog = [];
    state.previousKeyId = null;
    state.keysUsedThisSession = [];

    els.startScreen.hidden = true;
    els.resultsScreen.hidden = true;
    els.gameScreen.hidden = false;

    startScale();
  }

  function gradeForAccuracy(pct) {
    if (pct >= 95) return 'S';
    if (pct >= 85) return 'A';
    if (pct >= 70) return 'B';
    return 'C';
  }

  function endSession() {
    const total = state.accuracyLog.length || 1;
    const accuracyPct = Math.round((state.firstTryCorrectCount / total) * 100);

    const best = loadBest(state.difficulty);
    const isNewBest = state.score > best.score || accuracyPct > best.accuracy;

    if (state.score > best.score) best.score = state.score;
    if (accuracyPct > best.accuracy) best.accuracy = accuracyPct;
    saveBest(state.difficulty, best);

    els.resultScore.textContent = String(state.score);
    els.resultAccuracy.textContent = `${accuracyPct}%`;
    els.resultPerfect.textContent = String(state.perfectScaleCount);
    els.gradeBadge.textContent = gradeForAccuracy(accuracyPct);
    els.resultsBestLine.textContent =
      `Best for ${capitalize(state.difficulty)}: ${best.score} pts, ${best.accuracy}% accuracy`;
    els.bannerBest.hidden = !isNewBest;

    renderMasteryChecklist();

    els.gameScreen.hidden = true;
    els.resultsScreen.hidden = false;

    if (isNewBest) {
      Audio_.playFanfare();
    }
  }

  function renderMasteryChecklist() {
    els.masteryChecklist.innerHTML = '';
    // Show the full 13-key set (not just the current difficulty's pool) so
    // the checklist reflects true long-horizon progress across every
    // session/difficulty ever played, per the mastery map's purpose.
    const pool = Object.keys(KEY_DATA);
    pool.forEach((keyId) => {
      const key = KEY_DATA[keyId];
      const status = state.masteryMap[keyId] || null;
      const item = document.createElement('div');
      item.className = 'mastery-item ' + (
        status === 'perfect' ? 'is-perfect' : (status === 'completed' ? 'is-completed' : 'is-untouched')
      );
      const icon = status === 'perfect' ? '★' : (status === 'completed' ? '✓' : '—');
      item.textContent = `${icon} ${key.display}`;
      els.masteryChecklist.appendChild(item);
    });
  }

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // ---------------------------------------------------------------------
  // Best-preview on start screen
  // ---------------------------------------------------------------------

  function updateBestPreview() {
    const best = loadBest(state.difficulty);
    if (best.score === 0 && best.accuracy === 0) {
      els.bestPreview.textContent = '';
    } else {
      els.bestPreview.textContent = `Best (${capitalize(state.difficulty)}): ${best.score} pts · ${best.accuracy}% accuracy`;
    }
  }

  // ---------------------------------------------------------------------
  // Input wiring
  // ---------------------------------------------------------------------

  els.difficultyOptions.forEach((opt) => {
    opt.addEventListener('click', () => {
      els.difficultyOptions.forEach((o) => {
        o.classList.remove('is-active');
        o.setAttribute('aria-pressed', 'false');
      });
      opt.classList.add('is-active');
      opt.setAttribute('aria-pressed', 'true');
      state.difficulty = opt.dataset.difficulty;
      updateBestPreview();
    });
  });

  els.startBtn.addEventListener('click', () => {
    Audio_.unlock();
    beginSession();
  });

  els.skipBtn.addEventListener('click', () => {
    skipScale();
  });

  els.playAgainBtn.addEventListener('click', () => {
    beginSession();
  });

  els.octaveLeft.addEventListener('click', () => shiftKeyboardWindow(-1));
  els.octaveRight.addEventListener('click', () => shiftKeyboardWindow(1));

  // Computer-keyboard mapping: A S D F G H J for white keys, W E T Y U for
  // black keys, applied to whichever octave window is currently visible.
  document.addEventListener('keydown', (e) => {
    if (els.gameScreen.hidden) return;
    const key = e.key.toUpperCase();

    const whiteIdx = WHITE_KEY_MAP.indexOf(key);
    const blackLetterEntry = Object.entries(BLACK_KEY_MAP_BY_LETTER).find(([, v]) => v === key);

    if (whiteIdx === -1 && !blackLetterEntry) return;
    e.preventDefault();

    // Map the pressed computer key to an absolute semitone within the
    // currently visible keyboard window.
    const startIndex = state.keyboardWindowStartWhiteIndex;

    if (whiteIdx !== -1) {
      // find the first white key at or after startIndex whose position in
      // the 7-letter cycle matches whiteIdx, within the visible window
      const candidateIndex = startIndex + whiteIdx;
      const wk = FULL_WHITE_KEYS[candidateIndex];
      if (wk) {
        const btn = findKeyButton(wk.semitone);
        handleKeyPress(wk.semitone, btn);
      }
    } else if (blackLetterEntry) {
      const [letter] = blackLetterEntry;
      // find the white key with this letter within the visible window, then +1 semitone
      for (let i = startIndex; i < startIndex + VISIBLE_WHITE_KEYS && i < FULL_WHITE_KEYS.length; i++) {
        if (FULL_WHITE_KEYS[i].letter === letter) {
          const semitone = FULL_WHITE_KEYS[i].semitone + 1;
          const btn = findKeyButton(semitone);
          handleKeyPress(semitone, btn);
          break;
        }
      }
    }
  });

  window.addEventListener('resize', debounce(() => {
    if (!els.gameScreen.hidden) renderKeyboard();
  }, 150));

  function debounce(fn, delayMs) {
    let timer = null;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delayMs);
    };
  }

  // ---------------------------------------------------------------------
  // Initial paint
  // ---------------------------------------------------------------------

  updateBestPreview();

})();
