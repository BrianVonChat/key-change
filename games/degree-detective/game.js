/* ==========================================================================
   Degree Detective — functional ear training for Key Change
   A chord establishes the key; a mystery note rings on top; the player
   names its scale degree. Movable-do method: on a correct answer the note
   audibly "walks home" to the tonic along its resolution path; on a miss
   the correct and chosen degrees are compared over the same context.
   Plain vanilla JS + Web Audio. No dependencies.
   ========================================================================== */
(function () {
  'use strict';

  /* =======================================================================
     Core data tables (platform spec — verbatim)
     ======================================================================= */

  // 12 chromatic degrees over a major tonic; semis = semitones above tonic
  const DEGREES = [
    { id: '1',  semis: 0,  label: '1',  solfege: 'do',  diatonic: true  },
    { id: 'b2', semis: 1,  label: '♭2', solfege: 'ra',  diatonic: false },
    { id: '2',  semis: 2,  label: '2',  solfege: 're',  diatonic: true  },
    { id: 'b3', semis: 3,  label: '♭3', solfege: 'me',  diatonic: false },
    { id: '3',  semis: 4,  label: '3',  solfege: 'mi',  diatonic: true  },
    { id: '4',  semis: 5,  label: '4',  solfege: 'fa',  diatonic: true  },
    { id: 's4', semis: 6,  label: '♯4', solfege: 'fi',  diatonic: false },
    { id: '5',  semis: 7,  label: '5',  solfege: 'sol', diatonic: true  },
    { id: 'b6', semis: 8,  label: '♭6', solfege: 'le',  diatonic: false },
    { id: '6',  semis: 9,  label: '6',  solfege: 'la',  diatonic: true  },
    { id: 'b7', semis: 10, label: '♭7', solfege: 'te',  diatonic: false },
    { id: '7',  semis: 11, label: '7',  solfege: 'ti',  diatonic: true  },
  ];

  // 12 major keys; tonic = semitones from A4, placing the tonic in octave 3
  const KEYS = [
    { name: 'C',  file: 'C',  tonic: -21 }, { name: 'D♭', file: 'Db', tonic: -20 },
    { name: 'D',  file: 'D',  tonic: -19 }, { name: 'E♭', file: 'Eb', tonic: -18 },
    { name: 'E',  file: 'E',  tonic: -17 }, { name: 'F',  file: 'F',  tonic: -16 },
    { name: 'G♭', file: 'Gb', tonic: -15 }, { name: 'G',  file: 'G',  tonic: -14 },
    { name: 'A♭', file: 'Ab', tonic: -13 }, { name: 'A',  file: 'A',  tonic: -12 },
    { name: 'B♭', file: 'Bb', tonic: -11 }, { name: 'B',  file: 'B',  tonic: -10 },
  ];

  // Resolution walk-home paths (semitone offsets from tonic), played on a
  // correct answer — the method's signature reinforcement. Displaced targets
  // (Hard, +12) transpose the whole path +12.
  const RESOLUTIONS = {
    '1':  [0],
    'b2': [1, 0],
    '2':  [2, 0],
    'b3': [3, 2, 0],
    '3':  [4, 2, 0],
    '4':  [5, 4, 2, 0],
    's4': [6, 7, 9, 11, 12],
    '5':  [7, 9, 11, 12],
    'b6': [8, 7, 4, 0],
    '6':  [9, 7, 4, 0],
    'b7': [10, 9, 7, 4, 0],
    '7':  [11, 12],
  };

  const DEGREE_BY_ID = {};
  DEGREES.forEach(function (d) { DEGREE_BY_ID[d.id] = d; });

  const DIATONIC_IDS = DEGREES.filter(function (d) { return d.diatonic; }).map(function (d) { return d.id; });
  const ALL_IDS = DEGREES.map(function (d) { return d.id; });

  const DIFFICULTY_SETS = {
    easy: DIATONIC_IDS,   // the 7 diatonic degrees
    medium: ALL_IDS,      // all 12
    hard: ALL_IDS,        // all 12, may be displaced an octave up
  };

  // Spoken names for aria-labels ("flat six")
  const ARIA_NAMES = {
    '1': 'one', 'b2': 'flat two', '2': 'two', 'b3': 'flat three',
    '3': 'three', '4': 'four', 's4': 'sharp four', '5': 'five',
    'b6': 'flat six', '6': 'six', 'b7': 'flat seven', '7': 'seven',
  };

  // Completes "That's the ♭6 (le) — <hint>", matching each RESOLUTIONS path.
  const RESOLUTION_HINTS = {
    '1':  'home itself — the note of rest.',
    'b2': 'hear it slide down a half step onto home.',
    '2':  'hear it step down onto home.',
    'b3': 'hear its dark color settle through the 2 to home.',
    '3':  'hear it walk down 3–2–1 to home.',
    '4':  'hear it lean onto the 3 and stroll on home.',
    's4': 'hear it push up to the 5 and climb all the way home.',
    '5':  'hear it climb 5–6–7 up to home.',
    'b6': 'hear it settle to the 5 and home.',
    '6':  'hear it drop to the 5 and fall home.',
    'b7': 'hear it sink through the 6 and 5, all the way home.',
    '7':  'hear its pull — it lifts straight up to home.',
  };

  // Piano-geometry placement in a 14-column grid (Medium/Hard).
  // Chromatic row: gap over cols 6–8 (E–F, no black key) and none past the 7.
  const GRID_COLUMNS = {
    '1': '1 / 3', '2': '3 / 5', '3': '5 / 7', '4': '7 / 9',
    '5': '9 / 11', '6': '11 / 13', '7': '13 / 15',
    'b2': '2 / 4', 'b3': '4 / 6', 's4': '8 / 10', 'b6': '10 / 12', 'b7': '12 / 14',
  };

  // Matches the site's piano-game black-key convention (QWERTY row).
  const CHROMATIC_HOTKEYS = { W: 'b2', E: 'b3', T: 's4', Y: 'b6', U: 'b7' };

  const TOTAL_ROUNDS = 15;
  const STORAGE_PREFIX = 'degreeDetective.';

  // Synth tonic-chord voicing: major triad + sub-octave root.
  const CHORD_OFFSETS = [0, 4, 7, -12];
  const CHORD_GAINS = [0.16, 0.12, 0.12, 0.09];

  /* =======================================================================
     Pure helpers (also exercised by the headless test harness)
     ======================================================================= */

  function freq(semitonesFromA4) {
    return 440 * Math.pow(2, semitonesFromA4 / 12);
  }

  function scoreFor(replaysUsed) {
    return Math.max(20, 100 - 10 * replaysUsed);
  }

  function gradeFor(accuracy) {
    if (accuracy >= 95) return 'S';
    if (accuracy >= 85) return 'A';
    if (accuracy >= 70) return 'B';
    return 'C';
  }

  // Uniform draw from pool, deterministically avoiding an immediate repeat
  // (keyFn(pick) !== lastKey) whenever the pool allows it.
  function drawNoRepeat(pool, lastKey, keyFn) {
    keyFn = keyFn || function (x) { return x; };
    const eligible = pool.filter(function (item) { return keyFn(item) !== lastKey; });
    const source = eligible.length > 0 ? eligible : pool;
    return source[Math.floor(Math.random() * source.length)];
  }

  function targetSemisFor(degreeId, displacement) {
    return DEGREE_BY_ID[degreeId].semis + (displacement || 0);
  }

  function resolutionPathFor(degreeId, displacement) {
    const shift = displacement || 0;
    return RESOLUTIONS[degreeId].map(function (s) { return s + shift; });
  }

  // Degree identity is a pitch class: a displaced target maps back to the
  // same degree id (Hard answers by pitch class, not octave).
  function degreeIdForPitchClass(semisFromTonic) {
    const pc = ((semisFromTonic % 12) + 12) % 12;
    for (let i = 0; i < DEGREES.length; i++) {
      if (DEGREES[i].semis === pc) return DEGREES[i].id;
    }
    return null;
  }

  /* =======================================================================
     Audio engine
     ======================================================================= */

  let audioCtx = null;
  let masterGain = null;  // everything routes through here
  let chordBus = null;    // lowpass ~1800Hz -> masterGain, shared by synth chords

  function ensureAudioContext() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 1;
      masterGain.connect(audioCtx.destination);
      chordBus = audioCtx.createBiquadFilter();
      chordBus.type = 'lowpass';
      chordBus.frequency.value = 1800;
      chordBus.connect(masterGain);
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // --- Active-node tracking: no audio pileup, ever. -----------------------
  // Every scheduled sound registers here; stopAllAudio() fades and kills
  // them and bumps `playbackToken`, which invalidates pending UI timeouts.

  let activeNodes = [];
  let playbackToken = 0;

  function trackNodes(source, gain) {
    activeNodes.push({ source: source, gain: gain });
  }

  function schedule(fn, ms) {
    const token = playbackToken;
    window.setTimeout(function () {
      if (token === playbackToken) fn();
    }, Math.max(0, ms));
  }

  function stopAllAudio() {
    playbackToken += 1;
    if (!audioCtx) { activeNodes = []; return; }
    const now = audioCtx.currentTime;
    const old = activeNodes;
    activeNodes = [];
    old.forEach(function (entry) {
      try {
        if (entry.gain) {
          entry.gain.gain.cancelScheduledValues(now);
          entry.gain.gain.setValueAtTime(entry.gain.gain.value, now);
          entry.gain.gain.linearRampToValueAtTime(0, now + 0.05); // fade, no click
        }
      } catch (e) { /* node may already be gone */ }
      try { if (entry.source) entry.source.stop(now + 0.06); } catch (e) { /* ditto */ }
    });
    window.setTimeout(function () {
      old.forEach(function (entry) {
        try { if (entry.source) entry.source.disconnect(); } catch (e) { /* noop */ }
        try { if (entry.gain) entry.gain.disconnect(); } catch (e) { /* noop */ }
      });
    }, 150);
  }

  // --- Primitive tones ----------------------------------------------------

  // Standard anti-click envelope: 15ms linear attack, 50ms linear release.
  function playTone(ctx, dest, frequency, startTime, duration, type, peak) {
    type = type || 'sine';
    peak = (peak === undefined) ? 0.3 : peak;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(peak, startTime + 0.015);
    gain.gain.setValueAtTime(peak, Math.max(startTime + 0.015, startTime + duration - 0.05));
    gain.gain.linearRampToValueAtTime(0, startTime + duration);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
    trackNodes(osc, gain);
  }

  // One sustained synth chord strike: sine voices, each doubled by a ±3-cent
  // detuned twin at half gain, all through the shared lowpass chord bus.
  function scheduleChord(ctx, tonicSemis, offsets, gains, when, total, opts) {
    opts = opts || {};
    const attack = opts.attack !== undefined ? opts.attack : 0.05;
    const release = opts.release !== undefined ? opts.release : 0.3;
    const level = opts.level !== undefined ? opts.level : 1;

    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, when);
    bus.gain.linearRampToValueAtTime(level, when + attack);
    bus.gain.setValueAtTime(level, Math.max(when + attack, when + total - release));
    bus.gain.linearRampToValueAtTime(0, when + total);
    bus.connect(chordBus);
    trackNodes(null, bus);

    offsets.forEach(function (offset, i) {
      const f = freq(tonicSemis + offset);
      const voices = [
        { detune: 0, amp: gains[i] },
        { detune: (i % 2 === 0) ? 3 : -3, amp: gains[i] / 2 }, // warmth twin
      ];
      voices.forEach(function (v) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;
        osc.detune.value = v.detune;
        const vg = ctx.createGain();
        vg.gain.value = v.amp;
        osc.connect(vg);
        vg.connect(bus);
        osc.start(when);
        osc.stop(when + total + 0.05);
        trackNodes(osc, vg);
      });
    });
  }

  // Sustained tonic chord context (~3.2s total, 50ms attack, 300ms release).
  function scheduleChordContext(ctx, tonicSemis, when) {
    scheduleChord(ctx, tonicSemis, CHORD_OFFSETS, CHORD_GAINS, when, 3.2, { attack: 0.05, release: 0.3 });
    return 3.2;
  }

  // I–IV–V–I cadence: 0.55s per chord back-to-back, final I sustains ~2.5s.
  function scheduleCadenceContext(ctx, tonicSemis, when) {
    const PLAN = [
      { triad: [0, 4, 7],     root: 0, start: 0,    total: 0.58, release: 0.14 },
      { triad: [5, 9, 12],    root: 5, start: 0.55, total: 0.58, release: 0.14 },
      { triad: [7, 11, 14],   root: 7, start: 1.1,  total: 0.58, release: 0.14 },
      { triad: [0, 4, 7, 12], root: 0, start: 1.65, total: 2.5,  release: 0.3  },
    ];
    PLAN.forEach(function (chord) {
      const offsets = [chord.root - 12].concat(chord.triad); // sub-octave root first
      const gains = [0.09];
      chord.triad.forEach(function (off, i) {
        gains.push(i === 0 ? 0.16 : (i === 3 ? 0.10 : 0.12));
      });
      scheduleChord(ctx, tonicSemis, offsets, gains, when + chord.start, chord.total, {
        attack: 0.04, release: chord.release,
      });
    });
    return 1.65 + 2.5; // ~4.15s
  }

  // Recorded context (drop-in piano) through the master gain.
  function playBuffer(ctx, buffer, when) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(1, when);
    src.connect(gain);
    gain.connect(masterGain);
    src.start(when);
    trackNodes(src, gain);
  }

  // --- Feedback sounds ------------------------------------------------------

  function playDing(ctx, when) {
    playTone(ctx, masterGain, 987.77, when, 0.18, 'sine', 0.2);          // B5
    playTone(ctx, masterGain, 1318.51, when + 0.06, 0.22, 'sine', 0.15); // E6
    return 0.35;
  }

  // Quiet low thunk — a pitch sweep, deliberately NOT any degree's pitch.
  function playThunk(ctx, when) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, when);
    osc.frequency.linearRampToValueAtTime(100, when + 0.2);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(0.14, when + 0.015);
    gain.gain.setValueAtTime(0.14, when + 0.15);
    gain.gain.linearRampToValueAtTime(0, when + 0.22);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(when);
    osc.stop(when + 0.25);
    trackNodes(osc, gain);
    return 0.3;
  }

  // New-best fanfare: C5–E5–G5 ascending sines, ~100ms each.
  function playFanfare(ctx) {
    const t0 = ctx.currentTime + 0.05;
    [523.25, 659.25, 783.99].forEach(function (f, i) {
      playTone(ctx, masterGain, f, t0 + i * 0.1, 0.14, 'sine', 0.26);
    });
  }

  // Correct answer: soft chord re-strike + the note walks home (triangle).
  function playResolution(ctx, tonicSemis, degreeId, displacement, when) {
    const path = resolutionPathFor(degreeId, displacement);
    const walkLen = 0.35 + path.length * 0.16 + 0.1;
    const chordTotal = Math.max(1.6, walkLen + 0.45);
    scheduleChord(ctx, tonicSemis, CHORD_OFFSETS, CHORD_GAINS, when, chordTotal, {
      attack: 0.05, release: 0.3, level: 0.6, // soft re-strike
    });
    path.forEach(function (semis, i) {
      playTone(ctx, masterGain, freq(tonicSemis + semis), when + 0.35 + i * 0.16, 0.24, 'triangle', 0.18);
    });
    return chordTotal;
  }

  // Wrong answer: one chord strike, correct note, tiny gap, chosen note —
  // both in context, so the difference is heard, not punished.
  function playComparison(ctx, tonicSemis, correctSemis, chosenSemis, when) {
    const total = 3.2;
    scheduleChord(ctx, tonicSemis, CHORD_OFFSETS, CHORD_GAINS, when, total, { attack: 0.05, release: 0.3 });
    playTone(ctx, masterGain, freq(tonicSemis + correctSemis), when + 0.55, 0.9, 'triangle', 0.22);
    playTone(ctx, masterGain, freq(tonicSemis + chosenSemis), when + 1.6, 0.9, 'triangle', 0.22);
    return total;
  }

  /* =======================================================================
     Optional recorded-audio drop-in (see README.md)
     ======================================================================= */

  const recorded = {
    manifest: null, // { contexts: {C: "file.mp3", ...}, cadences: {...} } or null
    cache: {},      // "<mode>:<keyFile>" -> { status: 'loading'|'ready'|'failed', buffer }
  };

  function initRecordedManifest() {
    if (typeof fetch !== 'function') return;
    try {
      fetch('audio/manifest.json')
        .then(function (res) {
          if (!res.ok) throw new Error('no recorded-audio manifest');
          return res.json();
        })
        .then(function (json) {
          if (json && typeof json === 'object') recorded.manifest = json;
        })
        .catch(function () {
          recorded.manifest = null; // synth only — exactly one quiet failed request
        });
    } catch (e) {
      recorded.manifest = null;
    }
  }

  // Lazily fetch + decode the buffer for a key/mode the first time a round
  // needs it. Never blocks playback: synth is used until the buffer is ready.
  function prefetchBuffer(keyFile, mode) {
    if (!recorded.manifest || !audioCtx) return;
    const table = mode === 'cadence' ? recorded.manifest.cadences : recorded.manifest.contexts;
    if (!table || !table[keyFile]) return;
    // Entries are either "file.m4a" or { file: "file.m4a", noteAt: seconds } —
    // noteAt pins when the mystery note enters, so cadences can be played at
    // any natural tempo rather than to a fixed proportion of the file.
    const spec = table[keyFile];
    const fileName = typeof spec === 'string' ? spec : spec && spec.file;
    if (!fileName) return;
    const noteAt = (spec && typeof spec === 'object' && typeof spec.noteAt === 'number') ? spec.noteAt : null;
    const cacheKey = mode + ':' + keyFile;
    if (recorded.cache[cacheKey]) return;
    const entry = { status: 'loading', buffer: null, noteAt: noteAt };
    recorded.cache[cacheKey] = entry;
    fetch('audio/' + fileName)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.arrayBuffer();
      })
      .then(function (arrayBuffer) { return audioCtx.decodeAudioData(arrayBuffer); })
      .then(function (buffer) {
        entry.status = 'ready';
        entry.buffer = buffer;
      })
      .catch(function () {
        entry.status = 'failed'; // synth fallback for this key
      });
  }

  function getReadyBuffer(keyFile, mode) {
    const entry = recorded.cache[mode + ':' + keyFile];
    return (entry && entry.status === 'ready') ? { buffer: entry.buffer, noteAt: entry.noteAt } : null;
  }

  /* =======================================================================
     Persistence
     ======================================================================= */

  function getBest(difficulty) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + 'best.' + difficulty);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setBest(difficulty, data) {
    try {
      localStorage.setItem(STORAGE_PREFIX + 'best.' + difficulty, JSON.stringify(data));
    } catch (e) {
      /* localStorage unavailable — silently no-op */
    }
  }

  /* =======================================================================
     Game state
     ======================================================================= */

  const state = {
    difficulty: 'easy',
    contextMode: 'chord',   // 'chord' | 'cadence'
    sessionKey: null,       // Easy: fixed key for the whole session
    round: 0,               // 1-indexed while playing
    score: 0,
    streak: 0,
    bestStreak: 0,
    history: [],            // { correct, replays }
    currentKey: null,
    currentDegreeId: null,
    displacement: 0,        // 0 or +12 (Hard only)
    lastKeyName: null,
    lastDegreeId: null,
    replaysThisRound: 0,
    playedThisRound: false,
    targetHeard: false,     // answers unlock once the mystery note has sounded
    answered: false,
  };

  /* =======================================================================
     DOM references
     ======================================================================= */

  const startScreen = document.getElementById('start-screen');
  const gameScreen = document.getElementById('game-screen');
  const resultsScreen = document.getElementById('results-screen');

  const difficultySelect = document.getElementById('difficulty-select');
  const modeSelect = document.getElementById('mode-select');
  const bestPreview = document.getElementById('best-preview');
  const startBtn = document.getElementById('start-btn');

  const statScore = document.getElementById('stat-score');
  const statStreak = document.getElementById('stat-streak');
  const statRoundLabel = document.getElementById('stat-round-label');
  const roundProgressFill = document.getElementById('round-progress-fill');
  const roundProgressTrack = roundProgressFill.parentElement;

  const keyName = document.getElementById('key-name');
  const playBtn = document.getElementById('play-btn');
  const playHint = document.getElementById('play-hint');
  const replayCounter = document.getElementById('replay-counter');
  const replayCount = document.getElementById('replay-count');

  const degreeGrid = document.getElementById('degree-grid');
  const hotkeyLegend = document.getElementById('hotkey-legend');

  const feedbackStrip = document.getElementById('feedback-strip');
  const feedbackText = document.getElementById('feedback-text');
  const nextBtn = document.getElementById('next-btn');

  const resultsGrade = document.getElementById('results-grade');
  const bannerBest = document.getElementById('banner-best');
  const resultAccuracy = document.getElementById('result-accuracy');
  const resultReplays = document.getElementById('result-replays');
  const resultStreak = document.getElementById('result-streak');
  const resultScore = document.getElementById('result-score');
  const resultsBestLine = document.getElementById('results-best-line');
  const playAgainBtn = document.getElementById('play-again-btn');

  /* =======================================================================
     UI helpers
     ======================================================================= */

  function showScreen(screen) {
    [startScreen, gameScreen, resultsScreen].forEach(function (s) {
      s.hidden = s !== screen;
    });
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function updateBestPreview() {
    const best = getBest(state.difficulty);
    if (best) {
      bestPreview.textContent = 'Best on ' + capitalize(state.difficulty) + ': ' +
        best.accuracy + '% accuracy · Grade ' + (best.grade || gradeFor(best.accuracy)) +
        ' · streak ' + best.streak;
    } else {
      bestPreview.textContent = 'No best yet on ' + capitalize(state.difficulty) + ' — set one!';
    }
  }

  function setPlaying(on) {
    playBtn.classList.toggle('is-playing', on);
  }

  function updateStatBar() {
    statScore.textContent = String(state.score);
    statStreak.textContent = String(state.streak);
    statRoundLabel.textContent = 'Round ' + Math.min(state.round, TOTAL_ROUNDS) + '/' + TOTAL_ROUNDS;
    const done = state.history.length;
    roundProgressFill.style.width = ((done / TOTAL_ROUNDS) * 100) + '%';
    roundProgressTrack.setAttribute('aria-valuenow', String(done));
  }

  function setAnswersEnabled(enabled) {
    Array.prototype.forEach.call(degreeGrid.querySelectorAll('.degree-btn'), function (btn) {
      btn.disabled = !enabled;
    });
  }

  /* =======================================================================
     Start screen — difficulty + context-mode pickers
     ======================================================================= */

  difficultySelect.addEventListener('click', function (e) {
    const btn = e.target.closest('.select-pill');
    if (!btn) return;
    setDifficulty(btn.dataset.difficulty);
  });

  modeSelect.addEventListener('click', function (e) {
    const btn = e.target.closest('.select-pill');
    if (!btn) return;
    setContextMode(btn.dataset.mode);
  });

  function setDifficulty(difficulty) {
    state.difficulty = difficulty;
    Array.prototype.forEach.call(difficultySelect.querySelectorAll('.select-pill'), function (btn) {
      const active = btn.dataset.difficulty === difficulty;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    updateBestPreview();
  }

  function setContextMode(mode) {
    state.contextMode = mode;
    Array.prototype.forEach.call(modeSelect.querySelectorAll('.select-pill'), function (btn) {
      const active = btn.dataset.mode === mode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  startBtn.addEventListener('click', function () {
    ensureAudioContext(); // unlock audio on this user gesture
    startSession();
  });

  /* =======================================================================
     Session / round lifecycle
     ======================================================================= */

  function startSession() {
    stopAllAudio();
    state.round = 0;
    state.score = 0;
    state.streak = 0;
    state.bestStreak = 0;
    state.history = [];
    state.lastKeyName = null;
    state.lastDegreeId = null;
    // Easy anchors one random key for the whole session (random per session,
    // so absolute pitches can't be memorized across sessions).
    state.sessionKey = KEYS[Math.floor(Math.random() * KEYS.length)];

    buildDegreeGrid();
    showScreen(gameScreen);
    nextRound();
  }

  function buildDegreeGrid() {
    const pool = DIFFICULTY_SETS[state.difficulty];
    const fullGrid = state.difficulty !== 'easy';
    degreeGrid.innerHTML = '';
    degreeGrid.classList.toggle('degree-grid--full', fullGrid);
    degreeGrid.classList.toggle('degree-grid--diatonic', !fullGrid);

    DEGREES.forEach(function (deg) {
      if (pool.indexOf(deg.id) === -1) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'degree-btn ' + (deg.diatonic ? 'degree-btn--diatonic' : 'degree-btn--chromatic');
      btn.dataset.degree = deg.id;
      btn.setAttribute('aria-label', ARIA_NAMES[deg.id] + ' (' + deg.solfege + ')');
      if (fullGrid) btn.style.gridColumn = GRID_COLUMNS[deg.id];

      const label = document.createElement('span');
      label.className = 'degree-btn__label';
      label.textContent = deg.label;
      const solfege = document.createElement('span');
      solfege.className = 'degree-btn__solfege';
      solfege.textContent = deg.solfege;
      btn.appendChild(label);
      btn.appendChild(solfege);

      btn.addEventListener('click', function () { submitAnswer(deg.id); });
      degreeGrid.appendChild(btn);
    });

    hotkeyLegend.textContent = fullGrid
      ? 'Hotkeys: 1–7 diatonic · W E T Y U = ♭2 ♭3 ♯4 ♭6 ♭7 · Space plays · Enter next'
      : 'Hotkeys: 1–7 answer · Space plays · Enter next';
  }

  function nextRound() {
    stopAllAudio();
    state.round += 1;
    state.replaysThisRound = 0;
    state.playedThisRound = false;
    state.targetHeard = false;
    state.answered = false;

    // Key: Easy keeps the session anchor; Medium/Hard change every round.
    if (state.difficulty === 'easy') {
      state.currentKey = state.sessionKey;
    } else {
      state.currentKey = drawNoRepeat(KEYS, state.lastKeyName, function (k) { return k.name; });
      state.lastKeyName = state.currentKey.name;
    }

    // Degree: no immediate repeat of the previous round's degree id.
    state.currentDegreeId = drawNoRepeat(DIFFICULTY_SETS[state.difficulty], state.lastDegreeId);
    state.lastDegreeId = state.currentDegreeId;

    // Hard only: 50% chance the target sits an octave up (same degree id).
    state.displacement = (state.difficulty === 'hard' && Math.random() < 0.5) ? 12 : 0;

    // Kick off the recorded-audio prefetch for this key/mode (no-op if
    // there is no drop-in manifest).
    prefetchBuffer(state.currentKey.file, state.contextMode);

    // Reset round UI.
    keyName.textContent = 'Key of ' + state.currentKey.name + ' major';
    feedbackStrip.hidden = true;
    feedbackText.textContent = '';
    feedbackText.className = 'feedback-text';
    replayCounter.hidden = true;
    replayCount.textContent = '0';
    nextBtn.textContent = state.round >= TOTAL_ROUNDS ? 'See results' : 'Next round';
    playHint.textContent = 'Click Play or press Space to listen';
    setPlaying(false);
    Array.prototype.forEach.call(degreeGrid.querySelectorAll('.degree-btn'), function (btn) {
      btn.disabled = true; // unlocked once the mystery note has sounded
      btn.classList.remove('is-correct', 'is-incorrect', 'is-reveal');
    });

    updateStatBar();
    playBtn.focus();
  }

  /* =======================================================================
     Round playback (context + mystery note)
     ======================================================================= */

  playBtn.addEventListener('click', triggerPlayback);

  function triggerPlayback() {
    if (state.answered) return;
    const ctx = ensureAudioContext();

    if (state.playedThisRound) {
      state.replaysThisRound += 1;
      replayCounter.hidden = false;
      replayCount.textContent = String(state.replaysThisRound);
    } else {
      state.playedThisRound = true;
      playHint.textContent = 'Listening…';
    }

    playRound(ctx);
  }

  function playRound(ctx) {
    stopAllAudio(); // re-trigger replaces the current playback — no pileup
    setPlaying(true);

    const t0 = ctx.currentTime + 0.08;
    const tonic = state.currentKey.tonic;
    const targetSemis = targetSemisFor(state.currentDegreeId, state.displacement);

    let targetAt;
    let totalDur;
    const rec = getReadyBuffer(state.currentKey.file, state.contextMode);

    if (rec) {
      // Recorded piano context; the mystery note stays synthesized on top
      // (timbral contrast helps it stand out).
      const buffer = rec.buffer;
      playBuffer(ctx, buffer, t0);
      if (rec.noteAt != null) {
        targetAt = t0 + Math.min(Math.max(rec.noteAt, 0.2), buffer.duration + 1);
      } else if (state.contextMode === 'cadence') {
        targetAt = t0 + Math.max(1.1, buffer.duration * 0.55);
      } else {
        targetAt = t0 + Math.min(1.1, Math.max(0.35, buffer.duration - 0.9));
      }
      totalDur = Math.max(buffer.duration, (targetAt - t0) + 0.9) + 0.1;
    } else if (state.contextMode === 'cadence') {
      totalDur = scheduleCadenceContext(ctx, tonic, t0);
      targetAt = t0 + 1.65 + 0.4; // 0.4s after the final I strikes
    } else {
      totalDur = scheduleChordContext(ctx, tonic, t0);
      targetAt = t0 + 1.1; // 1.1s after chord onset
    }

    // The mystery note: triangle so it pops over the sine/piano bed.
    playTone(ctx, masterGain, freq(tonic + targetSemis), targetAt, 0.9, 'triangle', 0.22);

    // Unlock answering shortly after the target becomes audible.
    schedule(function () {
      if (state.answered) return;
      state.targetHeard = true;
      setAnswersEnabled(true);
      playHint.textContent = 'Name the degree — or press Space to replay';
    }, (targetAt - ctx.currentTime + 0.35) * 1000);

    schedule(function () {
      setPlaying(false);
      if (!state.answered) {
        playHint.textContent = 'Replay with Space, or answer below';
      }
    }, (t0 - ctx.currentTime + totalDur) * 1000 + 80);
  }

  /* =======================================================================
     Answering
     ======================================================================= */

  function submitAnswer(degreeId) {
    if (state.answered || !state.targetHeard) return;
    state.answered = true;
    stopAllAudio();

    const ctx = ensureAudioContext();
    const correctId = state.currentDegreeId;
    const correct = degreeId === correctId;
    const correctDeg = DEGREE_BY_ID[correctId];
    const chosenDeg = DEGREE_BY_ID[degreeId];
    const tonic = state.currentKey.tonic;

    setAnswersEnabled(false);
    setPlaying(false);
    const chosenBtn = degreeGrid.querySelector('[data-degree="' + degreeId + '"]');
    const correctBtn = degreeGrid.querySelector('[data-degree="' + correctId + '"]');

    const t0 = ctx.currentTime + 0.08;

    if (correct) {
      state.streak += 1;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      state.score += scoreFor(state.replaysThisRound);

      if (chosenBtn) chosenBtn.classList.add('is-correct');
      feedbackText.textContent = 'That’s the ' + correctDeg.label + ' (' + correctDeg.solfege + ') — ' +
        RESOLUTION_HINTS[correctId];
      feedbackText.className = 'feedback-text is-correct';

      // Ding, then the signature reinforcement: the note walks home.
      const dingLen = playDing(ctx, t0);
      playResolution(ctx, tonic, correctId, state.displacement, t0 + dingLen + 0.1);
    } else {
      state.streak = 0;

      if (chosenBtn) chosenBtn.classList.add('is-incorrect');
      if (correctBtn) correctBtn.classList.add('is-reveal');
      feedbackText.textContent = 'You heard the ' + correctDeg.label + '; you picked the ' +
        chosenDeg.label + '. Compare:';
      feedbackText.className = 'feedback-text is-incorrect';

      // Thunk, then the A/B teach: correct degree, tiny gap, chosen degree,
      // both over the same context chord.
      const thunkLen = playThunk(ctx, t0);
      playComparison(
        ctx, tonic,
        targetSemisFor(correctId, state.displacement),
        targetSemisFor(degreeId, state.displacement),
        t0 + thunkLen + 0.15
      );
    }

    state.history.push({ correct: correct, replays: state.replaysThisRound });
    updateStatBar();
    feedbackStrip.hidden = false;
    nextBtn.focus();
  }

  nextBtn.addEventListener('click', advance);

  function advance() {
    stopAllAudio();
    if (state.round >= TOTAL_ROUNDS) {
      finishSession();
    } else {
      nextRound();
    }
  }

  /* =======================================================================
     Keyboard controls
     ======================================================================= */

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (gameScreen.hidden) return;
    const active = document.activeElement;

    // Space always plays/replays (except on the Next button, which keeps
    // its native Space activation).
    if (e.code === 'Space') {
      if (active === nextBtn) return;
      e.preventDefault();
      triggerPlayback();
      return;
    }

    // Enter advances once feedback is showing (native activation already
    // covers the case where the Next button itself is focused).
    if (e.key === 'Enter') {
      if (!feedbackStrip.hidden && active !== nextBtn) {
        e.preventDefault();
        advance();
      }
      return;
    }

    if (state.answered) return;

    // Digits 1–7 answer the diatonic degrees.
    if (e.key >= '1' && e.key <= '7') {
      submitAnswer(e.key);
      return;
    }

    // W/E/T/Y/U answer the chromatic degrees (site piano black-key rule).
    const chromaticId = CHROMATIC_HOTKEYS[e.key.length === 1 ? e.key.toUpperCase() : ''];
    if (chromaticId && DIFFICULTY_SETS[state.difficulty].indexOf(chromaticId) !== -1) {
      submitAnswer(chromaticId);
    }
  });

  /* =======================================================================
     Results
     ======================================================================= */

  function finishSession() {
    const total = state.history.length;
    const correctCount = state.history.filter(function (h) { return h.correct; }).length;
    const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const totalReplays = state.history.reduce(function (sum, h) { return sum + h.replays; }, 0);
    const avgReplays = total > 0 ? totalReplays / total : 0;
    const grade = gradeFor(accuracy);

    const previousBest = getBest(state.difficulty);
    const isNewBest = !previousBest ||
      accuracy > previousBest.accuracy ||
      (accuracy === previousBest.accuracy && state.score > previousBest.score);

    resultsGrade.textContent = grade;
    resultAccuracy.textContent = accuracy + '%';
    resultReplays.textContent = avgReplays.toFixed(1);
    resultStreak.textContent = String(state.bestStreak);
    resultScore.textContent = String(state.score);

    if (isNewBest) {
      setBest(state.difficulty, {
        accuracy: accuracy,
        score: state.score,
        streak: state.bestStreak,
        grade: grade,
        date: new Date().toISOString().slice(0, 10),
      });
      bannerBest.hidden = false;
      resultsBestLine.textContent = previousBest
        ? 'You beat your previous best on ' + capitalize(state.difficulty) +
          ' (' + previousBest.accuracy + '% · score ' + previousBest.score + ')!'
        : 'First session on ' + capitalize(state.difficulty) + ' — benchmark set!';
      playFanfare(ensureAudioContext());
    } else {
      bannerBest.hidden = true;
      resultsBestLine.textContent = 'Best on ' + capitalize(state.difficulty) + ': ' +
        previousBest.accuracy + '% · score ' + previousBest.score +
        ' · streak ' + previousBest.streak;
    }

    showScreen(resultsScreen);
    playAgainBtn.focus();
  }

  playAgainBtn.addEventListener('click', function () {
    ensureAudioContext();
    startSession();
  });

  /* =======================================================================
     Init
     ======================================================================= */

  setDifficulty('easy');
  setContextMode('chord');
  showScreen(startScreen);
  initRecordedManifest();

  // Small hook for the headless test harness (pure logic only; harmless in
  // production and handy in the console).
  window.__degreeDetective = {
    DEGREES: DEGREES,
    KEYS: KEYS,
    RESOLUTIONS: RESOLUTIONS,
    DIFFICULTY_SETS: DIFFICULTY_SETS,
    freq: freq,
    scoreFor: scoreFor,
    gradeFor: gradeFor,
    drawNoRepeat: drawNoRepeat,
    targetSemisFor: targetSemisFor,
    resolutionPathFor: resolutionPathFor,
    degreeIdForPitchClass: degreeIdForPitchClass,
  };
})();
