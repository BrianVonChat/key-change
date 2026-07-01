(function () {
  'use strict';

  /* ================================================================
     CONSTANTS & GEOMETRY
     ================================================================ */
  const WHITE_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const BLACK_AFTER = { C: 'C#', D: 'D#', F: 'F#', G: 'G#', A: 'A#' }; // no black after E or B
  const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  // Computer-keyboard passthrough legend, in left-to-right visual order.
  // Black keys skip the gap after E (and after B) naturally because this
  // array lines up 1:1 with the 5 *actual* black keys in an octave
  // (C#, D#, F#, G#, A#) — not with white-key slots.
  const WHITE_KEY_LETTERS = ['A', 'S', 'D', 'F', 'G', 'H', 'J'];
  const BLACK_KEY_LETTERS = ['W', 'E', 'T', 'Y', 'U'];

  const TOTAL_ROUNDS = 20;
  const ROUND_TIME_MS = 12000; // 12s at "Easy"
  const HINT_CHARGES = 3;
  const HOME_START_OCTAVE = 4; // 1-octave default: C4-B4

  /**
   * Build an ordered array of key descriptors for `numOctaves` starting at
   * `startOctave`. Order matches left-to-right visual/geometric order,
   * white keys interleaved with the black key that follows them.
   */
  function buildKeys(startOctave, numOctaves) {
    const keys = [];
    for (let o = 0; o < numOctaves; o++) {
      WHITE_LETTERS.forEach((letter) => {
        keys.push({ name: letter + (startOctave + o), letter, isWhite: true });
        if (BLACK_AFTER[letter]) {
          keys.push({ name: BLACK_AFTER[letter] + (startOctave + o), letter: BLACK_AFTER[letter], isWhite: false });
        }
      });
    }
    return keys;
  }

  /** e.g. "C#4" -> 466.16 (Hz), using equal temperament relative to A4=440. */
  function noteToFrequency(name) {
    const m = name.match(/^([A-G])(#?)(\d)$/);
    if (!m) return 440;
    const [, letter, sharp, octaveStr] = m;
    const octave = parseInt(octaveStr, 10);
    const semitoneFromC0 = SEMITONES[letter] + (sharp ? 1 : 0) + octave * 12;
    const semitoneFromA4 = semitoneFromC0 - (9 + 4 * 12);
    return 440 * Math.pow(2, semitoneFromA4 / 12);
  }

  function noteLetterOnly(name) {
    // "C#4" -> "C#", "D4" -> "D"
    return name.slice(0, -1);
  }

  /* ================================================================
     AUDIO
     ================================================================ */
  let audioCtx = null;

  function ensureAudioContext() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  /** Correct-answer tone: the actual pitch of the key, percussive pluck. */
  function playCorrectTone(freq) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.35, now + 0.005); // quick attack ~5ms
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.255); // exponential decay ~250ms

    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  /** Wrong-answer tone: quiet low muted buzz/thunk — NEVER the pressed key's pitch. */
  function playWrongTone() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 80;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  /** New-best fanfare: 3-note ascending arpeggio, C5-E5-G5, ~100ms each. */
  function playFanfare() {
    if (!audioCtx) return;
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    const start = audioCtx.currentTime;
    notes.forEach((freq, i) => {
      const t = start + i * 0.11;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.12);
    });
  }

  /* ================================================================
     PERSISTENCE
     ================================================================ */
  const STORAGE_KEY = 'keyQuest.best';

  function loadBest() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) return parsed;
      return null;
    } catch (e) {
      return null;
    }
  }

  function saveBest(best) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(best));
    } catch (e) {
      /* localStorage unavailable — silently ignore */
    }
  }

  /* ================================================================
     STATE
     ================================================================ */
  const state = {
    numOctaves: 1, // 1, 2, or "full" -> stored as number of octaves (full = 7)
    rangeMode: '1', // '1' | '2' | 'full'
    startOctave: HOME_START_OCTAVE,
    windowOctaves: 1, // how many octaves visible at once in the viewport window
    windowStartOctave: HOME_START_OCTAVE, // left edge of the visible window
    allKeys: [], // full set of keys in the chosen range
    score: 0,
    combo: 0,
    bestComboThisSession: 0,
    round: 0, // 1-indexed current round
    hintsLeft: HINT_CHARGES,
    sessionResults: [], // { correct, timeToFindMs, attempts }
    lastTargetName: null,
    currentTarget: null, // key descriptor
    isRelativePhrasing: false,
    relativeDescriptor: null, // { text, targetName }
    roundStartTime: 0,
    roundAttempts: 0,
    roundTimerId: null,
    roundTimeoutId: null,
    hintTimeoutId: null,
    hintUsedThisRound: false,
    awaitingNext: false,
  };

  const FULL_KEYBOARD_OCTAVES = 5; // C2-B6, a reasonably full 61-key-ish span
  const FULL_KEYBOARD_START = 2;

  /* ================================================================
     DOM REFS
     ================================================================ */
  const startScreen = document.getElementById('start-screen');
  const gameScreen = document.getElementById('game-screen');
  const resultsScreen = document.getElementById('results-screen');

  const startPreview = document.getElementById('start-preview');
  const rangeOptions = Array.from(document.querySelectorAll('.range-option'));
  const startBtn = document.getElementById('start-btn');
  const bestPreview = document.getElementById('best-preview');

  const statScore = document.getElementById('stat-score');
  const statCombo = document.getElementById('stat-combo');
  const statRoundLabel = document.getElementById('stat-round-label');
  const roundProgressFill = document.getElementById('round-progress-fill');
  const roundProgressTrack = roundProgressFill.parentElement;
  const hintBtn = document.getElementById('hint-btn');
  const skipBtn = document.getElementById('skip-btn');

  const calloutCard = document.getElementById('callout-card');
  const calloutTarget = document.getElementById('callout-target');
  const timeBudgetFill = document.getElementById('time-budget-fill');
  const roundMessage = document.getElementById('round-message');

  const octaveLeftBtn = document.getElementById('octave-left');
  const octaveRightBtn = document.getElementById('octave-right');
  const keyboardViewport = document.getElementById('keyboard-viewport');
  const keyboardEl = document.getElementById('keyboard');
  const legendRow = document.getElementById('legend-row');

  const resultsHeading = document.getElementById('results-heading');
  const bannerBest = document.getElementById('banner-best');
  const resultAccuracy = document.getElementById('result-accuracy');
  const resultCombo = document.getElementById('result-combo');
  const resultTime = document.getElementById('result-time');
  const resultScore = document.getElementById('result-score');
  const resultsBestLine = document.getElementById('results-best-line');
  const playAgainBtn = document.getElementById('play-again-btn');

  /* ================================================================
     START SCREEN
     ================================================================ */
  function renderStartPreview() {
    // A small static, non-interactive 1-octave preview (C4-B4) purely for flavor.
    startPreview.innerHTML = '';
    const keys = buildKeys(4, 1);
    const numWhite = keys.filter((k) => k.isWhite).length;
    const whiteWidthPct = 100 / numWhite;
    let whiteIndex = -1;
    keys.forEach((key) => {
      const el = document.createElement('div');
      if (key.isWhite) {
        whiteIndex++;
        el.className = 'key key--white';
        el.style.left = (whiteIndex * whiteWidthPct) + '%';
        el.style.width = whiteWidthPct + '%';
      } else {
        el.className = 'key key--black';
        const blackWidthPct = whiteWidthPct * 0.6;
        el.style.left = ((whiteIndex + 1) * whiteWidthPct - blackWidthPct / 2) + '%';
        el.style.width = blackWidthPct + '%';
      }
      startPreview.appendChild(el);
    });
  }

  function updateBestPreview() {
    const best = loadBest();
    if (!best) {
      bestPreview.textContent = 'No session completed yet — set the first best!';
      return;
    }
    const acc = Math.round((best.accuracy || 0) * 100);
    bestPreview.textContent = `Best so far: ${acc}% accuracy, combo of ${best.bestCombo || 0}.`;
  }

  rangeOptions.forEach((btn) => {
    btn.addEventListener('click', () => {
      rangeOptions.forEach((b) => {
        b.classList.remove('is-active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-pressed', 'true');
      state.rangeMode = btn.dataset.range;
    });
  });

  startBtn.addEventListener('click', () => {
    ensureAudioContext();
    beginSession();
  });

  /* ================================================================
     SESSION SETUP
     ================================================================ */
  function beginSession() {
    // Reset state
    state.score = 0;
    state.combo = 0;
    state.bestComboThisSession = 0;
    state.round = 0;
    state.hintsLeft = HINT_CHARGES;
    state.sessionResults = [];
    state.lastTargetName = null;
    state.hintUsedThisRound = false;

    applyRangeMode(state.rangeMode);

    startScreen.hidden = true;
    resultsScreen.hidden = true;
    gameScreen.hidden = false;

    updateHintButton();
    updateSkipButton();
    renderLegend();

    nextRound();
  }

  function applyRangeMode(mode) {
    if (mode === '1') {
      state.numOctaves = 1;
      state.startOctave = HOME_START_OCTAVE;
      state.windowOctaves = 1;
    } else if (mode === '2') {
      state.numOctaves = 2;
      state.startOctave = HOME_START_OCTAVE;
      state.windowOctaves = 2;
    } else {
      state.numOctaves = FULL_KEYBOARD_OCTAVES;
      state.startOctave = FULL_KEYBOARD_START;
      state.windowOctaves = 2; // full keyboard: scrollable/windowed, 2 octaves visible at a time
    }
    state.allKeys = buildKeys(state.startOctave, state.numOctaves);
    state.windowStartOctave = state.startOctave;
    updateOctaveNavVisibility();
  }

  /* ================================================================
     ADAPTIVE DIFFICULTY (every 5 rounds)
     ================================================================ */
  function maybeWidenRange() {
    if (state.round % 5 !== 0) return;
    const last5 = state.sessionResults.slice(-5);
    if (last5.length < 5) return;
    const accuracyLast5 = last5.filter((r) => r.attempts === 1).length / 5;
    if (accuracyLast5 <= 0.7) return;

    if (state.rangeMode === '1') {
      state.rangeMode = '2';
      applyRangeMode('2');
      renderLegend();
      showRoundMessage('Nice accuracy — widening to 2 Octaves!', 'hint');
    } else if (state.rangeMode === '2') {
      state.rangeMode = 'full';
      applyRangeMode('full');
      renderLegend();
      showRoundMessage('Great work — unlocking the Full Keyboard!', 'hint');
    }
    // already full: hold steady, nothing to widen to.
  }

  /* ================================================================
     ROUND LIFECYCLE
     ================================================================ */
  function pickTarget() {
    const candidates = state.allKeys.filter((k) => k.name !== state.lastTargetName);
    const pool = candidates.length > 0 ? candidates : state.allKeys;
    const target = pool[Math.floor(Math.random() * pool.length)];
    state.lastTargetName = target.name;
    return target;
  }

  /** Occasionally (later rounds) phrase relatively instead of by letter name. */
  function maybeBuildRelativeDescriptor(target) {
    if (state.round < 8) return null; // only kick in at higher rounds
    if (Math.random() > 0.35) return null; // occasional, not constant

    const idx = state.allKeys.findIndex((k) => k.name === target.name);
    const prev = state.allKeys[idx - 1];
    const next = state.allKeys[idx + 1];
    if (prev && next) {
      return { text: `Find: the note between ${noteLetterOnly(prev.name)} and ${noteLetterOnly(next.name)}` };
    }
    return null;
  }

  function nextRound() {
    clearRoundTimers();
    state.round++;
    state.roundAttempts = 0;
    state.hintUsedThisRound = false;
    state.awaitingNext = false;

    if (state.round > TOTAL_ROUNDS) {
      finishSession();
      return;
    }

    state.currentTarget = pickTarget();
    state.relativeDescriptor = maybeBuildRelativeDescriptor(state.currentTarget);
    state.isRelativePhrasing = !!state.relativeDescriptor;

    // Ensure the target's octave is visible; scroll/window to it.
    focusWindowOnOctave(octaveOfKeyName(state.currentTarget.name));

    renderKeyboard();
    renderCallout();
    updateStatBar();
    clearKeyFlashes();
    roundMessage.textContent = '';
    roundMessage.className = 'round-message';

    state.roundStartTime = performance.now();
    startTimeBudget();
  }

  function octaveOfKeyName(name) {
    const m = name.match(/(\d)$/);
    return m ? parseInt(m[1], 10) : state.startOctave;
  }

  function startTimeBudget() {
    timeBudgetFill.style.width = '100%';
    timeBudgetFill.classList.remove('is-urgent');
    const tickMs = 100;
    let elapsed = 0;
    state.roundTimerId = setInterval(() => {
      elapsed += tickMs;
      const pct = Math.max(0, 100 - (elapsed / ROUND_TIME_MS) * 100);
      timeBudgetFill.style.width = pct + '%';
      if (pct <= 25) timeBudgetFill.classList.add('is-urgent');
    }, tickMs);

    state.roundTimeoutId = setTimeout(() => {
      handleRoundTimeout();
    }, ROUND_TIME_MS);
  }

  function clearRoundTimers() {
    if (state.roundTimerId) clearInterval(state.roundTimerId);
    if (state.roundTimeoutId) clearTimeout(state.roundTimeoutId);
    if (state.hintTimeoutId) clearTimeout(state.hintTimeoutId);
    state.roundTimerId = null;
    state.roundTimeoutId = null;
    state.hintTimeoutId = null;
  }

  function handleRoundTimeout() {
    if (state.awaitingNext) return;
    state.awaitingNext = true;
    clearRoundTimers();
    state.combo = 0;
    state.sessionResults.push({ correct: false, timeToFindMs: ROUND_TIME_MS, attempts: state.roundAttempts || 1 });
    showRoundMessage("Time's up! The note was " + noteLetterOnly(state.currentTarget.name) + '.', 'wrong');
    flashCorrectKey(false);
    updateStatBar();
    setTimeout(() => {
      maybeWidenRange();
      nextRound();
    }, 1400);
  }

  function handleSkip() {
    if (state.awaitingNext) return;
    state.awaitingNext = true;
    clearRoundTimers();
    state.combo = 0;
    state.sessionResults.push({ correct: false, timeToFindMs: performance.now() - state.roundStartTime, attempts: state.roundAttempts || 1 });
    updateStatBar();
    maybeWidenRange();
    nextRound();
  }

  /* ================================================================
     KEY PRESS HANDLING (mouse/touch/keyboard all funnel here)
     ================================================================ */
  function handleKeyPress(keyName, keyEl) {
    if (state.awaitingNext || gameScreen.hidden) return;
    if (!audioCtx) ensureAudioContext();

    state.roundAttempts++;
    const isCorrect = keyName === state.currentTarget.name;

    if (isCorrect) {
      state.awaitingNext = true;
      clearRoundTimers();
      const timeToFindMs = performance.now() - state.roundStartTime;
      const firstTry = state.roundAttempts === 1;

      state.score += firstTry ? 100 : 40;
      if (firstTry) {
        state.combo++;
        if (state.combo > state.bestComboThisSession) state.bestComboThisSession = state.combo;
      } else {
        state.combo = 0;
      }

      state.sessionResults.push({ correct: true, timeToFindMs, attempts: state.roundAttempts });

      playCorrectTone(noteToFrequency(keyName));
      flashKey(keyEl, true);
      calloutCard.classList.add('is-correct');
      showRoundMessage(firstTry ? 'Nice! First try.' : 'Correct!', 'correct');
      updateStatBar();

      setTimeout(() => {
        calloutCard.classList.remove('is-correct');
        maybeWidenRange();
        nextRound();
      }, 650);
    } else {
      state.combo = 0;
      playWrongTone();
      flashKey(keyEl, false);
      calloutCard.classList.add('is-wrong');
      showRoundMessage('Not quite — try again!', 'wrong');
      updateStatBar();
      setTimeout(() => calloutCard.classList.remove('is-wrong'), 300);
    }
  }

  function flashKey(keyEl, correct) {
    if (!keyEl) return;
    keyEl.classList.remove('is-correct', 'is-wrong');
    // force reflow so animation can restart if same class reapplied quickly
    void keyEl.offsetWidth;
    keyEl.classList.add(correct ? 'is-correct' : 'is-wrong');

    if (correct) {
      const ripple = document.createElement('span');
      ripple.className = 'key-ripple';
      keyEl.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    }

    setTimeout(() => {
      keyEl.classList.remove('is-correct', 'is-wrong');
    }, correct ? 650 : 350);
  }

  /** Used for timeout feedback where there's no click origin — flash the target key. */
  function flashCorrectKey(correct) {
    const el = keyboardEl.querySelector(`[data-note="${cssEscape(state.currentTarget.name)}"]`);
    if (el) flashKey(el, correct);
  }

  function cssEscape(s) {
    return s.replace(/#/g, '\\#');
  }

  function clearKeyFlashes() {
    keyboardEl.querySelectorAll('.key').forEach((el) => {
      el.classList.remove('is-correct', 'is-wrong', 'is-hinting');
      el.querySelectorAll('.key-ripple').forEach((r) => r.remove());
    });
  }

  function showRoundMessage(text, kind) {
    roundMessage.textContent = text;
    roundMessage.className = 'round-message' + (kind ? ' is-' + kind : '');
  }

  /* ================================================================
     HINT POWER-UP
     ================================================================ */
  hintBtn.addEventListener('click', useHint);

  function useHint() {
    if (state.hintsLeft <= 0 || state.awaitingNext || state.hintUsedThisRound) return;
    state.hintsLeft--;
    state.hintUsedThisRound = true;
    updateHintButton();

    const el = keyboardEl.querySelector(`[data-note="${cssEscape(state.currentTarget.name)}"]`);
    if (el) {
      el.classList.add('is-hinting');
      state.hintTimeoutId = setTimeout(() => el.classList.remove('is-hinting'), 1800);
    }
    showRoundMessage('Hint: watch for the glowing key.', 'hint');
  }

  function updateHintButton() {
    hintBtn.textContent = `Hint ×${state.hintsLeft}`;
    hintBtn.disabled = state.hintsLeft <= 0;
  }

  skipBtn.addEventListener('click', handleSkip);

  function updateSkipButton() {
    skipBtn.disabled = false;
  }

  /* ================================================================
     RENDERING: STAT BAR
     ================================================================ */
  function updateStatBar() {
    statScore.textContent = String(state.score);
    statCombo.textContent = String(state.combo);
    const roundDisplay = Math.min(state.round, TOTAL_ROUNDS);
    statRoundLabel.textContent = `Round ${roundDisplay}/${TOTAL_ROUNDS}`;
    const pct = (roundDisplay / TOTAL_ROUNDS) * 100;
    roundProgressFill.style.width = pct + '%';
    roundProgressTrack.setAttribute('aria-valuenow', String(roundDisplay));
  }

  /* ================================================================
     RENDERING: CALLOUT
     ================================================================ */
  function renderCallout() {
    if (state.isRelativePhrasing && state.relativeDescriptor) {
      calloutTarget.textContent = state.relativeDescriptor.text;
      calloutTarget.classList.add('is-relative');
    } else {
      calloutTarget.textContent = noteLetterOnly(state.currentTarget.name);
      calloutTarget.classList.remove('is-relative');
    }
  }

  /* ================================================================
     RENDERING: KEYBOARD
     ================================================================ */
  function getVisibleKeys() {
    const startO = state.windowStartOctave;
    const endO = startO + state.windowOctaves - 1;
    return state.allKeys.filter((k) => {
      const o = octaveOfKeyName(k.name);
      return o >= startO && o <= endO;
    });
  }

  function renderKeyboard() {
    keyboardEl.innerHTML = '';
    const visibleKeys = getVisibleKeys();
    const numWhiteVisible = visibleKeys.filter((k) => k.isWhite).length;

    // Determine a comfortable pixel width per white key, respecting viewport size.
    const viewportWidth = keyboardViewport.clientWidth || 600;
    const minWhiteKeyWidth = 42; // px, keeps keys tappable even when scrollable
    const idealWhiteKeyWidth = viewportWidth / numWhiteVisible;
    const whiteKeyWidth = Math.max(minWhiteKeyWidth, idealWhiteKeyWidth);
    const totalWidth = whiteKeyWidth * numWhiteVisible;
    keyboardEl.style.width = totalWidth + 'px';

    const blackKeyWidth = whiteKeyWidth * 0.6;

    let whiteIndex = -1;
    visibleKeys.forEach((key) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.note = key.name;
      btn.setAttribute('aria-label', 'Key ' + key.name.replace('#', ' sharp '));

      if (key.isWhite) {
        whiteIndex++;
        btn.className = 'key key--white';
        btn.style.left = (whiteIndex * whiteKeyWidth) + 'px';
        btn.style.width = whiteKeyWidth + 'px';
      } else {
        btn.className = 'key key--black';
        btn.style.left = ((whiteIndex + 1) * whiteKeyWidth - blackKeyWidth / 2) + 'px';
        btn.style.width = blackKeyWidth + 'px';
      }

      btn.addEventListener('click', () => handleKeyPress(key.name, btn));
      keyboardEl.appendChild(btn);
    });

    renderLegend();
    updateOctaveNavVisibility();
  }

  /** Scroll/window the visible octave range so `octave` is inside it. */
  function focusWindowOnOctave(octave) {
    const maxStart = state.startOctave + state.numOctaves - state.windowOctaves;
    let newStart = state.windowStartOctave;

    if (octave < state.windowStartOctave) {
      newStart = octave;
    } else if (octave > state.windowStartOctave + state.windowOctaves - 1) {
      newStart = octave - state.windowOctaves + 1;
    }
    newStart = Math.max(state.startOctave, Math.min(maxStart, newStart));
    state.windowStartOctave = newStart;

    // For scrollable full-keyboard mode, also scroll the viewport smoothly.
    requestAnimationFrame(() => {
      const targetEl = keyboardEl.querySelector(`[data-note="${cssEscape(state.currentTarget.name)}"]`);
      if (targetEl && keyboardViewport.scrollWidth > keyboardViewport.clientWidth) {
        const targetLeft = targetEl.offsetLeft - keyboardViewport.clientWidth / 2 + targetEl.offsetWidth / 2;
        keyboardViewport.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
      } else if (keyboardViewport.scrollWidth > keyboardViewport.clientWidth) {
        keyboardViewport.scrollTo({ left: 0, behavior: 'smooth' });
      }
    });
  }

  function shiftWindow(direction) {
    const maxStart = state.startOctave + state.numOctaves - state.windowOctaves;
    if (maxStart <= state.startOctave) return; // nothing to shift, whole range visible
    let newStart = state.windowStartOctave + direction;
    newStart = Math.max(state.startOctave, Math.min(maxStart, newStart));
    if (newStart === state.windowStartOctave) return;
    state.windowStartOctave = newStart;
    renderKeyboard();
  }

  function updateOctaveNavVisibility() {
    const maxStart = state.startOctave + state.numOctaves - state.windowOctaves;
    const canShift = maxStart > state.startOctave;
    octaveLeftBtn.hidden = !canShift || state.windowStartOctave <= state.startOctave;
    octaveRightBtn.hidden = !canShift || state.windowStartOctave >= maxStart;
  }

  octaveLeftBtn.addEventListener('click', () => shiftWindow(-1));
  octaveRightBtn.addEventListener('click', () => shiftWindow(1));

  /* ================================================================
     LEGEND (computer-keyboard mapping) — recomputed on window shift
     ================================================================ */
  function renderLegend() {
    legendRow.innerHTML = '';
    const visibleKeys = getVisibleKeys();
    const whiteKeys = visibleKeys.filter((k) => k.isWhite);
    const blackKeys = visibleKeys.filter((k) => !k.isWhite);

    // Only show the legend for the first octave-window's worth of letters
    // (7 white + 5 black), matching the fixed QWERTY layout regardless of
    // how many octaves are visible, per spec: legend maps to "currently
    // visible octave" — we map the first visible octave window.
    const firstOctaveWhite = whiteKeys.slice(0, 7);
    const firstOctaveBlack = blackKeys.slice(0, 5);

    firstOctaveWhite.forEach((key, i) => {
      const el = document.createElement('span');
      el.className = 'legend-key';
      el.innerHTML = `<span class="legend-letter">${WHITE_KEY_LETTERS[i]}</span><span>${noteLetterOnly(key.name)}</span>`;
      legendRow.appendChild(el);
    });
    firstOctaveBlack.forEach((key, i) => {
      const letter = BLACK_KEY_LETTERS[i];
      const el = document.createElement('span');
      el.className = 'legend-key is-black';
      el.innerHTML = `<span class="legend-letter">${letter}</span><span>${noteLetterOnly(key.name)}</span>`;
      legendRow.appendChild(el);
    });

    // Build lookup maps used by the physical-keyboard event handler.
    state._legendWhiteMap = {};
    state._legendBlackMap = {};
    firstOctaveWhite.forEach((key, i) => {
      state._legendWhiteMap[WHITE_KEY_LETTERS[i]] = key.name;
    });
    firstOctaveBlack.forEach((key, i) => {
      state._legendBlackMap[BLACK_KEY_LETTERS[i]] = key.name;
    });
  }

  /* ================================================================
     PHYSICAL KEYBOARD PASSTHROUGH
     ================================================================ */
  document.addEventListener('keydown', (e) => {
    if (gameScreen.hidden) return;

    // Don't hijack Tab/Enter/Space navigation on focusable controls.
    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    if (e.key === 'Tab') return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      shiftWindow(-1);
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      shiftWindow(1);
      return;
    }

    // If focus is currently on a button (hint/skip/octave nav) and user hits
    // Enter/Space, let the native click handler deal with it rather than
    // reinterpreting the key as a note letter.
    if ((e.key === 'Enter' || e.key === ' ') && activeTag === 'BUTTON') return;

    const letter = e.key.length === 1 ? e.key.toUpperCase() : '';
    if (!letter) return;

    let noteName = null;
    if (state._legendWhiteMap && state._legendWhiteMap[letter]) {
      noteName = state._legendWhiteMap[letter];
    } else if (state._legendBlackMap && state._legendBlackMap[letter]) {
      noteName = state._legendBlackMap[letter];
    }
    if (!noteName) return;

    e.preventDefault();
    const el = keyboardEl.querySelector(`[data-note="${cssEscape(noteName)}"]`);
    if (el) {
      el.classList.add('key--kbd-active');
      setTimeout(() => el.classList.remove('key--kbd-active'), 120);
    }
    handleKeyPress(noteName, el);
  });

  /* ================================================================
     RESULTS SCREEN
     ================================================================ */
  function finishSession() {
    clearRoundTimers();
    gameScreen.hidden = true;
    resultsScreen.hidden = false;

    const total = state.sessionResults.length;
    const correctFirstTry = state.sessionResults.filter((r) => r.attempts === 1 && r.correct).length;
    const correctAny = state.sessionResults.filter((r) => r.correct).length;
    const accuracy = total > 0 ? correctFirstTry / total : 0;
    const avgTimeMs = total > 0
      ? state.sessionResults.reduce((sum, r) => sum + r.timeToFindMs, 0) / total
      : 0;

    resultAccuracy.textContent = Math.round(accuracy * 100) + '%';
    resultCombo.textContent = String(state.bestComboThisSession);
    resultTime.textContent = (avgTimeMs / 1000).toFixed(1) + 's';
    resultScore.textContent = String(state.score);

    const prevBest = loadBest();
    const isNewBest = !prevBest
      || accuracy > prevBest.accuracy
      || (accuracy === prevBest.accuracy && state.bestComboThisSession > (prevBest.bestCombo || 0));

    if (isNewBest) {
      saveBest({ accuracy, bestCombo: state.bestComboThisSession, avgTimeMs, score: state.score, date: new Date().toISOString().slice(0, 10) });
      bannerBest.hidden = false;
      resultsHeading.textContent = 'New Best — Quest Complete!';
      resultsBestLine.textContent = 'You just set a new personal best. Great job!';
      playFanfare();
    } else {
      bannerBest.hidden = true;
      resultsHeading.textContent = 'Quest Complete!';
      const bestAcc = Math.round((prevBest.accuracy || 0) * 100);
      resultsBestLine.textContent = `Your best remains ${bestAcc}% accuracy with a combo of ${prevBest.bestCombo || 0}. Keep going!`;
    }

    void correctAny; // retained for potential future display; accuracy uses first-try definition per spec
  }

  playAgainBtn.addEventListener('click', () => {
    resultsScreen.hidden = true;
    startScreen.hidden = false;
    updateBestPreview();
  });

  /* ================================================================
     RESIZE HANDLING — keep key layout in sync with viewport width
     ================================================================ */
  let resizeRaf = null;
  window.addEventListener('resize', () => {
    if (!gameScreen.hidden) {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(renderKeyboard);
    }
  });

  /* ================================================================
     INIT
     ================================================================ */
  renderStartPreview();
  updateBestPreview();
})();
