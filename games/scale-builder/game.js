/* Scale Builder — build the major scale for a given key, one note at a time.
   Plain JS, no dependencies. See index.html / style.css in this folder.

   Input model: mouse/touch-first. Keys are real <button>s, so keyboard
   users can still Tab + Enter through them; there is deliberately NO
   QWERTY-to-piano mapping and NO letters printed on unplayed keys — on a
   piano, a letter on a key reads as a note name, so anything else lies. */

(() => {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const STORAGE_BEST_PREFIX = 'scaleBuilder.best.';
  const STORAGE_MASTERY = 'scaleBuilder.mastery';
  const SCALES_PER_SESSION = 10;
  const WRONG_TRIES_BEFORE_HINT = 2;

  // ---------------------------------------------------------------------
  // Pitch helper
  // ---------------------------------------------------------------------

  // Absolute semitone-from-A4 for a { letter, accidental('#'|'b'|''), octave }.
  // This is the single source of truth used for grading (never string
  // comparison), so enharmonics (D# key press vs Eb spelling) grade correctly.
  function absSemitone(letter, accidental, octave) {
    const letters = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    let semitoneFromC0 = letters[letter] + octave * 12;
    if (accidental === '#') semitoneFromC0 += 1;
    if (accidental === 'b') semitoneFromC0 -= 1;
    return semitoneFromC0 - (9 + 4 * 12);
  }

  function semitoneToFrequency(semitone) {
    return 440 * Math.pow(2, semitone / 12);
  }

  // ---------------------------------------------------------------------
  // Major scale pattern
  // ---------------------------------------------------------------------

  // Label for the interval just taken TO reach this degree (index = degree-1).
  const STEP_LABELS = ['—', 'Whole', 'Whole', 'Half', 'Whole', 'Whole', 'Whole', 'Half'];

  // ---------------------------------------------------------------------
  // Enharmonic spelling table — hand-authored, verified against
  // letter-name cycling + W-W-H-W-W-W-H semitone pattern + circle of fifths.
  // Each entry: display name, key-signature type/count, 7-letter spelling
  // (degree 8 always repeats degree 1's letter+accidental one octave up),
  // and difficulty tier (Easy / Medium / Hard pools, additive).
  // refOctave 4 for every key keeps all 13 scales inside the fixed
  // C4..C6 keyboard below (highest scale note: B major's B5).
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
      degrees.push({
        degree: i + 1,
        letter,
        accidental, // '' | '#' | 'b' — for DISPLAY only
        octave,
        semitone: absSemitone(letter, accidental, octave)
      });
    }
    // Degree 8 = tonic one octave up
    degrees.push({
      degree: 8,
      letter: key.tonicLetter,
      accidental: key.tonicAcc,
      octave: key.refOctave + 1,
      semitone: absSemitone(key.tonicLetter, key.tonicAcc, key.refOctave + 1)
    });
    return degrees;
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
        // just-built scale played back tonic-to-octave as a quick ascending run
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
      const parsed = JSON.parse(raw);
      // A corrupted value that parses to a primitive/array would make the
      // later `masteryMap[key] = ...` assignment throw in strict mode.
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
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

    keyboardWrap: document.getElementById('keyboard-wrap'),
    keyboard: document.getElementById('keyboard'),

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
    perfectScaleCount: 0,
    totalCorrectClicks: 0, // accuracy = correct clicks / all graded clicks
    totalWrongClicks: 0,
    currentKeyId: null,
    previousKeyId: null,
    scaleDegrees: [], // built from buildScaleDegrees(currentKeyId)
    currentDegree: 1, // degrees placed so far (1 = tonic pre-lit); next target index = currentDegree
    wrongAttemptsThisScale: 0,
    wrongTriesThisDegree: 0, // resets per degree; drives the hint pulse
    masteryMap: loadMastery(),
    inputLocked: false,
    transitioning: false, // true between scale end/skip and the next startScale
    hintTimer: null
  };

  // ---------------------------------------------------------------------
  // Piano keyboard model — ONE fixed two-octave keyboard, C4..C6.
  // Every scale in KEY_DATA fits inside it (tonics C4..B4, top note B5),
  // so nothing ever scrolls or shifts under the player's mouse.
  // ---------------------------------------------------------------------

  const WHITE_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  // Black key presence after a given white letter (true = black key exists
  // between this white key and the next one).
  const BLACK_AFTER = { C: true, D: true, E: false, F: true, G: true, A: true, B: false };

  function buildFixedKeyboardModel() {
    const whiteKeys = [];
    for (let oct = 4; oct <= 5; oct++) {
      WHITE_LETTERS.forEach((letter) => {
        whiteKeys.push({ letter, octave: oct, semitone: absSemitone(letter, '', oct) });
      });
    }
    // Close the keyboard on a final C so it reads as two complete octaves.
    whiteKeys.push({ letter: 'C', octave: 6, semitone: absSemitone('C', '', 6) });
    return whiteKeys;
  }

  const FIXED_WHITE_KEYS = buildFixedKeyboardModel();

  // ---------------------------------------------------------------------
  // Keyboard rendering
  // ---------------------------------------------------------------------

  // Keys never shrink below a tappable width; when the container is too
  // narrow (small phones in portrait), the wrap becomes finger-pannable
  // instead — the keyboard still never moves on its own.
  const MIN_WHITE_KEY_PX = 34;

  function renderKeyboard() {
    els.keyboard.innerHTML = '';
    const containerWidth = els.keyboardWrap.clientWidth || 640;
    const whiteCount = FIXED_WHITE_KEYS.length;
    const whiteKeyWidth = Math.max(containerWidth / whiteCount, MIN_WHITE_KEY_PX);
    const blackKeyWidth = whiteKeyWidth * 0.62;
    els.keyboard.style.width = `${whiteCount * whiteKeyWidth}px`;

    FIXED_WHITE_KEYS.forEach((wk, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'key key--white';
      btn.style.left = `${index * whiteKeyWidth}px`;
      btn.style.width = `${whiteKeyWidth}px`;
      btn.dataset.semitone = String(wk.semitone);
      btn.setAttribute('aria-label', `${wk.letter}${wk.octave}`);
      btn.addEventListener('click', () => handleKeyPress(wk.semitone, btn));
      els.keyboard.appendChild(btn);

      // Black key between this white key and the next (skip after the last
      // white key — its neighbor is off the keyboard).
      if (BLACK_AFTER[wk.letter] && index < whiteCount - 1) {
        const blackBtn = document.createElement('button');
        blackBtn.type = 'button';
        blackBtn.className = 'key key--black';
        blackBtn.style.left = `${(index + 1) * whiteKeyWidth - blackKeyWidth / 2}px`;
        blackBtn.style.width = `${blackKeyWidth}px`;
        const semitone = wk.semitone + 1;
        blackBtn.dataset.semitone = String(semitone);
        // Both enharmonic names — the game itself spells flats in flat keys.
        blackBtn.setAttribute('aria-label',
          `${wk.letter} sharp ${wk.octave}, also called ${FLAT_TWIN[wk.letter]} flat ${wk.octave}`);
        blackBtn.addEventListener('click', () => handleKeyPress(semitone, blackBtn));
        els.keyboard.appendChild(blackBtn);
      }
    });

    ensureKeyboardMarks(false);
  }

  // Flat-spelling twin of each black key, keyed by the white letter below it.
  const FLAT_TWIN = { C: 'D', D: 'E', F: 'G', G: 'A', A: 'B' };

  function findKeyButton(semitone) {
    return Array.from(els.keyboard.querySelectorAll('.key'))
      .find((k) => Number(k.dataset.semitone) === semitone);
  }

  // Ensure a mark exists for every degree placed so far: the lit tonic plus
  // a labeled pill on each placed key. Only MISSING marks are created, so
  // already-planted pills never re-run their pop animation; pass
  // animate=false (fresh render/resize) to plant without any animation.
  // The keyboard itself tells the story — unplayed keys stay completely clean.
  function ensureKeyboardMarks(animate) {
    if (!state.scaleDegrees.length) return;

    for (let i = 0; i < state.currentDegree && i < 8; i++) {
      const deg = state.scaleDegrees[i];
      const btn = findKeyButton(deg.semitone);
      if (!btn || btn.querySelector('.key-tag')) continue;

      btn.classList.add('is-placed');
      if (deg.degree === 1) btn.classList.add('is-tonic-lit');

      const tag = document.createElement('span');
      tag.className = 'key-tag'
        + (deg.degree === 1 || deg.degree === 8 ? ' is-tonic-tag' : '')
        + (animate ? '' : ' no-anim');
      tag.textContent = formatDegreeName(deg);
      btn.appendChild(tag);
    }
  }

  // Gentle scaffolding: after repeated misses on the same degree, pulse the
  // correct key briefly. Earned help — never shown up front. Restartable:
  // consecutive misses re-trigger the pulse even mid-animation.
  function pulseHint() {
    if (state.currentDegree >= 8) return;
    const target = state.scaleDegrees[state.currentDegree];
    const btn = findKeyButton(target.semitone);
    if (!btn) return;
    clearTimeout(state.hintTimer);
    btn.classList.remove('is-hint');
    void btn.offsetWidth; // force reflow so the animation restarts
    btn.classList.add('is-hint');
    state.hintTimer = setTimeout(() => btn.classList.remove('is-hint'), 1300);
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
    state.transitioning = false;
    state.wrongAttemptsThisScale = 0;
    state.wrongTriesThisDegree = 0;
    state.currentDegree = 1; // tonic already "placed"

    const keyId = pickNextKey();
    state.previousKeyId = keyId;
    state.currentKeyId = keyId;
    state.scaleDegrees = buildScaleDegrees(keyId);

    const key = KEY_DATA[keyId];
    els.promptHeading.textContent = `Build: ${key.display}`;
    renderKeySignature(keyId);
    renderRack();

    // Pre-fill tonic (degree 1) in the rack
    fillRackSlot(1, formatDegreeName(state.scaleDegrees[0]));

    els.feedbackStrip.textContent = 'The gold key is your starting note — click the next note of the scale.';
    els.feedbackStrip.className = 'feedback-strip';

    updateStats();
    renderKeyboard();

    // Sound the starting note so the ear knows where the scale begins.
    setTimeout(() => {
      Audio_.playCorrect(semitoneToFrequency(state.scaleDegrees[0].semitone));
    }, 250);
  }

  function handleKeyPress(semitone, btnEl) {
    if (state.inputLocked || !state.scaleDegrees.length) return;
    if (state.currentDegree >= 8) return; // scale already complete

    // Clicking a note that's already in the scale (the gold tonic included)
    // is friendly replay, never a mistake — kids poke the stickers they
    // earned, and it's how they hear their starting note again.
    const placed = state.scaleDegrees.find(
      (d, i) => i < state.currentDegree && d.semitone === semitone
    );
    if (placed) {
      Audio_.playCorrect(semitoneToFrequency(semitone));
      spawnRipple(btnEl);
      showFeedback(`${formatDegreeName(placed)} — already in your scale`, '');
      return;
    }

    const targetDeg = state.scaleDegrees[state.currentDegree]; // next degree to place
    const correct = semitone === targetDeg.semitone;

    if (correct) {
      state.inputLocked = true;
      state.totalCorrectClicks += 1;
      flashKey(btnEl, 'is-correct');
      spawnRipple(btnEl);

      Audio_.playCorrect(semitoneToFrequency(semitone));

      state.currentDegree += 1;
      state.wrongTriesThisDegree = 0;
      fillRackSlot(targetDeg.degree, formatDegreeName(targetDeg));

      const label = STEP_LABELS[targetDeg.degree - 1];
      showFeedback(`${label} Step`, label === 'Half' ? 'is-half' : 'is-whole');

      ensureKeyboardMarks(true);

      if (state.currentDegree >= 8) {
        state.transitioning = true;
        setTimeout(completeScale, 550);
      } else {
        setTimeout(() => { state.inputLocked = false; }, 250);
      }
    } else {
      flashKey(btnEl, 'is-wrong');
      Audio_.playIncorrect();
      state.wrongAttemptsThisScale += 1;
      state.totalWrongClicks += 1;
      state.wrongTriesThisDegree += 1;
      if (state.wrongTriesThisDegree >= WRONG_TRIES_BEFORE_HINT) {
        showFeedback('Try again — watch the flashing key', 'is-wrong');
        pulseHint();
      } else {
        showFeedback('Try again', 'is-wrong');
      }
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
    state.transitioning = true;

    // Play the just-built scale back, tonic to octave
    const freqs = state.scaleDegrees.map((d) => semitoneToFrequency(d.semitone));
    Audio_.playScalePlayback(freqs);

    showFeedback('Scale complete!', 'is-complete');

    const wrongCount = state.wrongAttemptsThisScale;
    const isPerfect = wrongCount === 0;
    let scaleScore = Math.max(20, 100 - 10 * wrongCount);
    if (isPerfect) scaleScore += 50;

    state.score += scaleScore;
    state.scalesCompleted += 1;
    if (isPerfect) state.perfectScaleCount += 1;

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
    // Guarded against double-clicks and against firing while a completed
    // scale is being scored/transitioned — either would double-count.
    if (!state.scaleDegrees.length || state.inputLocked || state.transitioning) return;
    state.transitioning = true;
    // Skipping counts as neither perfect nor first-try-correct, but still
    // advances the session with a minimal score and marks progress.
    state.scalesCompleted += 1;
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

  // Honest per-click accuracy: correct clicks over all graded clicks.
  // (Friendly replays of placed notes are not graded.) A single slip should
  // read as a small dip, not a crash to 0%.
  function sessionAccuracyPct() {
    const attempts = state.totalCorrectClicks + state.totalWrongClicks;
    return attempts === 0 ? 100 : Math.round((state.totalCorrectClicks / attempts) * 100);
  }

  function updateStats() {
    els.statScore.textContent = String(state.score);
    els.statScales.textContent = `${state.scalesCompleted}/${SCALES_PER_SESSION}`;
    els.statAccuracy.textContent = `${sessionAccuracyPct()}%`;
  }

  // ---------------------------------------------------------------------
  // Session start / end
  // ---------------------------------------------------------------------

  function beginSession() {
    state.score = 0;
    state.scalesCompleted = 0;
    state.perfectScaleCount = 0;
    state.totalCorrectClicks = 0;
    state.totalWrongClicks = 0;
    state.transitioning = false;
    state.previousKeyId = null;

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
    const accuracyPct = sessionAccuracyPct();

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
    // Show only the current difficulty's pool: an Easy player shouldn't be
    // greeted by nine dash-marked F♯/C♯-type rows they've never seen. The
    // stored mastery map still spans every key ever played.
    const pool = DIFFICULTY_POOLS[state.difficulty];
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
