(function () {
  'use strict';

  // =========================================================================
  // Content model
  // =========================================================================

  const ROOT_POOL = [
    // semitone-from-A4 values, spanning a comfortable C3-A4 range
    -21, -19, -17, -16, -14, -12, -9, -7, -5, -4, -2, 0,
    // C3,  D3,  E3,  F3,  G3,  A3,  C4, D4, E4, F4, G4, A4
  ];

  const INTERVALS = [
    { name: 'Unison', semitones: 0 },
    { name: 'Minor 2nd', semitones: 1 },
    { name: 'Major 2nd', semitones: 2 },
    { name: 'Minor 3rd', semitones: 3 },
    { name: 'Major 3rd', semitones: 4 },
    { name: 'Perfect 4th', semitones: 5 },
    { name: 'Tritone', semitones: 6 },
    { name: 'Perfect 5th', semitones: 7 },
    { name: 'Minor 6th', semitones: 8 },
    { name: 'Major 6th', semitones: 9 },
    { name: 'Minor 7th', semitones: 10 },
    { name: 'Major 7th', semitones: 11 },
    { name: 'Octave', semitones: 12 },
  ];

  const INTERVAL_BY_NAME = {};
  INTERVALS.forEach(function (iv) { INTERVAL_BY_NAME[iv.name] = iv; });

  const DIFFICULTY_SETS = {
    easy: ['Unison', 'Major 2nd', 'Perfect 5th', 'Octave'],
    medium: ['Unison', 'Major 2nd', 'Minor 3rd', 'Major 3rd', 'Perfect 4th', 'Perfect 5th', 'Minor 7th', 'Octave'],
    hard: INTERVALS.map(function (i) { return i.name; }),
  };

  const TOTAL_ROUNDS = 15;
  const FREE_REPLAYS_HARD = 2; // first 2 replays free at Hard; 3rd+ costs points
  const HARD_REPLAY_PENALTY = 8;

  const STORAGE_PREFIX = 'intervalEars.';

  // =========================================================================
  // Audio helpers (exact spec)
  // =========================================================================

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

  function freq(semitoneFromA4) {
    return 440 * Math.pow(2, semitoneFromA4 / 12);
  }

  function playTone(ctx, frequency, startTime, duration) {
    if (duration === undefined) duration = 0.7;
    const osc = ctx.createOscillator();
    osc.type = 'sine'; // sine is cleanest for pure interval-quality recognition
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.3, startTime + 0.015); // 15ms attack, avoids click
    gain.gain.setValueAtTime(0.3, startTime + duration - 0.05);
    gain.gain.linearRampToValueAtTime(0, startTime + duration); // 50ms release, avoids click
    osc.connect(gain).connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
    return duration;
  }

  // Plays root then root+interval, sequentially. Returns total duration (seconds) from `now`.
  function playInterval(ctx, rootSemitone, intervalSemitones, onDone) {
    const now = ctx.currentTime + 0.05; // small lead-time avoids clipping the very start
    const noteDuration = 0.7;
    const gap = 0.15;
    playTone(ctx, freq(rootSemitone), now, noteDuration);
    playTone(ctx, freq(rootSemitone + intervalSemitones), now + noteDuration + gap, noteDuration);
    const totalMs = (0.05 + noteDuration + gap + noteDuration + 0.05) * 1000;
    if (onDone) {
      setTimeout(onDone, totalMs);
    }
    return totalMs;
  }

  // Plays two full intervals back-to-back (for reinforcement / A-B comparison).
  function playTwoIntervalsSequence(ctx, first, second, onDone) {
    const noteDuration = 0.7;
    const gap = 0.15;
    const betweenGroups = 0.35;
    let t = ctx.currentTime + 0.05;

    playTone(ctx, freq(first.root), t, noteDuration);
    t += noteDuration + gap;
    playTone(ctx, freq(first.root + first.interval), t, noteDuration);
    t += noteDuration + betweenGroups;

    playTone(ctx, freq(second.root), t, noteDuration);
    t += noteDuration + gap;
    playTone(ctx, freq(second.root + second.interval), t, noteDuration);
    t += noteDuration;

    const totalMs = (t - ctx.currentTime) * 1000;
    if (onDone) {
      setTimeout(onDone, totalMs);
    }
    return totalMs;
  }

  // Short pleasant sine "ding" for correct answers.
  function playDing(ctx) {
    const now = ctx.currentTime + 0.02;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.01);
    gain.gain.setValueAtTime(0.25, now + 0.14);
    gain.gain.linearRampToValueAtTime(0, now + 0.32);
    gain.connect(ctx.destination);

    [880, 1318.5].forEach(function (f, i) { // A5 + E6 -- a bright little chime
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      osc.connect(gain);
      osc.start(now + i * 0.02);
      osc.stop(now + 0.34);
    });
    return 380;
  }

  // Short quiet buzz for incorrect answers.
  function playBuzz(ctx) {
    const now = ctx.currentTime + 0.02;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.linearRampToValueAtTime(110, now + 0.22);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.015);
    gain.gain.setValueAtTime(0.16, now + 0.16);
    gain.gain.linearRampToValueAtTime(0, now + 0.24);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.26);
    return 280;
  }

  // Distinct 3-note ascending arpeggio fanfare for a new best (C5-E5-G5).
  function playFanfare(ctx) {
    const now = ctx.currentTime + 0.03;
    const notes = [
      523.25, // C5
      659.25, // E5
      783.99, // G5
    ];
    const noteDur = 0.16;
    notes.forEach(function (f, i) {
      const start = now + i * 0.1;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.28, start + 0.015);
      gain.gain.setValueAtTime(0.28, start + noteDur - 0.04);
      gain.gain.linearRampToValueAtTime(0, start + noteDur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + noteDur + 0.02);
    });
    // Final held chord flourish
    const chordStart = now + notes.length * 0.1 + 0.02;
    [523.25, 659.25, 783.99].forEach(function (f) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, chordStart);
      gain.gain.linearRampToValueAtTime(0.22, chordStart + 0.02);
      gain.gain.setValueAtTime(0.22, chordStart + 0.4);
      gain.gain.linearRampToValueAtTime(0, chordStart + 0.55);
      osc.connect(gain).connect(ctx.destination);
      osc.start(chordStart);
      osc.stop(chordStart + 0.57);
    });
    return (chordStart - now + 0.6) * 1000;
  }

  // =========================================================================
  // Persistence
  // =========================================================================

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

  // =========================================================================
  // Game state
  // =========================================================================

  const state = {
    difficulty: 'easy',
    score: 0,
    streak: 0,
    bestStreak: 0,
    round: 0, // 1-indexed while playing
    replaysThisRound: 0,
    history: [], // { interval, correct, replays }
    currentRoot: null,
    currentIntervalName: null,
    lastIntervalName: null, // to avoid immediate repeat
    answered: false,
  };

  // =========================================================================
  // DOM references
  // =========================================================================

  const startScreen = document.getElementById('start-screen');
  const gameScreen = document.getElementById('game-screen');
  const resultsScreen = document.getElementById('results-screen');

  const difficultySelect = document.getElementById('difficulty-select');
  const startBtn = document.getElementById('start-btn');
  const bestPreview = document.getElementById('best-preview');

  const statScore = document.getElementById('stat-score');
  const statStreak = document.getElementById('stat-streak');
  const statRoundLabel = document.getElementById('stat-round-label');
  const roundProgressFill = document.getElementById('round-progress-fill');
  const roundProgressTrack = roundProgressFill.parentElement;

  const playBtn = document.getElementById('play-btn');
  const playHint = document.getElementById('play-hint');
  const replayCounter = document.getElementById('replay-counter');
  const replayCount = document.getElementById('replay-count');

  const answerGrid = document.getElementById('answer-grid');

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

  // =========================================================================
  // Utility
  // =========================================================================

  function randomFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function showScreen(screen) {
    [startScreen, gameScreen, resultsScreen].forEach(function (s) {
      s.hidden = s !== screen;
    });
  }

  function updateBestPreview() {
    const best = getBest(state.difficulty);
    if (best) {
      bestPreview.textContent =
        'Best on ' + capitalize(state.difficulty) + ': ' + best.accuracy + '% accuracy (Grade ' + best.grade + ')';
    } else {
      bestPreview.textContent = 'No best score yet on ' + capitalize(state.difficulty) + ' — set one now!';
    }
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function gradeFor(accuracy) {
    if (accuracy >= 95) return 'S';
    if (accuracy >= 85) return 'A';
    if (accuracy >= 70) return 'B';
    return 'C';
  }

  // =========================================================================
  // Start screen — difficulty selection
  // =========================================================================

  difficultySelect.addEventListener('click', function (e) {
    const btn = e.target.closest('.difficulty-option');
    if (!btn) return;
    setDifficulty(btn.dataset.difficulty);
  });

  function setDifficulty(difficulty) {
    state.difficulty = difficulty;
    Array.from(difficultySelect.querySelectorAll('.difficulty-option')).forEach(function (btn) {
      const active = btn.dataset.difficulty === difficulty;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    updateBestPreview();
  }

  startBtn.addEventListener('click', function () {
    ensureAudioContext(); // unlock audio on this user gesture
    startSession();
  });

  // =========================================================================
  // Session / round lifecycle
  // =========================================================================

  function startSession() {
    state.score = 0;
    state.streak = 0;
    state.bestStreak = 0;
    state.round = 0;
    state.history = [];
    state.lastIntervalName = null;

    buildAnswerGrid();
    showScreen(gameScreen);
    nextRound();
  }

  function buildAnswerGrid() {
    const names = DIFFICULTY_SETS[state.difficulty];
    answerGrid.innerHTML = '';
    names.forEach(function (name) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'answer-btn';
      btn.dataset.interval = name;
      btn.textContent = name;
      btn.addEventListener('click', function () {
        handleAnswer(name);
      });
      answerGrid.appendChild(btn);
    });
  }

  function nextRound() {
    state.round += 1;
    state.replaysThisRound = 0;
    state.answered = false;
    playHint.dataset.played = 'false';

    // Draw a root and an interval, avoiding an immediate repeat of the interval name.
    const names = DIFFICULTY_SETS[state.difficulty];
    let intervalName = randomFrom(names);
    if (names.length > 1) {
      let guard = 0;
      while (intervalName === state.lastIntervalName && guard < 20) {
        intervalName = randomFrom(names);
        guard += 1;
      }
    }
    state.lastIntervalName = intervalName;
    state.currentIntervalName = intervalName;
    state.currentRoot = randomFrom(ROOT_POOL);

    // Reset UI for the new round.
    feedbackStrip.hidden = true;
    replayCounter.hidden = true;
    replayCount.textContent = '0';
    playHint.textContent = 'Click Play or press Space to listen';
    Array.from(answerGrid.querySelectorAll('.answer-btn')).forEach(function (btn) {
      btn.disabled = false;
      btn.classList.remove('is-correct', 'is-incorrect', 'is-reveal');
    });

    updateStatBar();
  }

  function updateStatBar() {
    statScore.textContent = String(state.score);
    statStreak.textContent = String(state.streak);
    statRoundLabel.textContent = 'Round ' + state.round + '/' + TOTAL_ROUNDS;
    const pct = ((state.round - 1) / TOTAL_ROUNDS) * 100;
    roundProgressFill.style.width = pct + '%';
    roundProgressTrack.setAttribute('aria-valuenow', String(state.round - 1));
    roundProgressTrack.setAttribute('aria-valuemax', String(TOTAL_ROUNDS));
  }

  // =========================================================================
  // Playback
  // =========================================================================

  let playbackBusy = false;

  function setPlayingVisual(on) {
    playBtn.classList.toggle('is-playing', on);
  }

  playBtn.addEventListener('click', function () {
    triggerPlayback();
  });

  function triggerPlayback() {
    if (state.answered || playbackBusy) return;
    const ctx = ensureAudioContext();

    const isFirstListen = playHint.dataset.played !== 'true';

    if (!isFirstListen) {
      // This is a replay. At Hard difficulty, the 3rd+ replay costs points.
      state.replaysThisRound += 1;
      if (state.difficulty === 'hard' && state.replaysThisRound > FREE_REPLAYS_HARD) {
        state.score = Math.max(0, state.score - HARD_REPLAY_PENALTY);
        updateStatBar();
      }
      replayCounter.hidden = false;
      replayCount.textContent = String(state.replaysThisRound);
    } else {
      playHint.dataset.played = 'true';
      playHint.textContent = 'Listening…';
    }

    playbackBusy = true;
    setPlayingVisual(true);
    const iv = INTERVAL_BY_NAME[state.currentIntervalName];
    playInterval(ctx, state.currentRoot, iv.semitones, function () {
      setPlayingVisual(false);
      playbackBusy = false;
      playHint.textContent = 'Press Play again to replay, or choose an interval below';
    });
  }

  // =========================================================================
  // Answering
  // =========================================================================

  function handleAnswer(chosenName) {
    if (state.answered || playbackBusy) return;
    state.answered = true;

    const ctx = ensureAudioContext();
    const correctName = state.currentIntervalName;
    const correct = chosenName === correctName;
    const root = state.currentRoot;
    const correctIv = INTERVAL_BY_NAME[correctName];
    const chosenIv = INTERVAL_BY_NAME[chosenName];

    Array.from(answerGrid.querySelectorAll('.answer-btn')).forEach(function (btn) {
      btn.disabled = true;
    });

    const chosenBtn = answerGrid.querySelector('[data-interval="' + cssEscape(chosenName) + '"]');
    const correctBtn = answerGrid.querySelector('[data-interval="' + cssEscape(correctName) + '"]');

    if (correct) {
      state.streak += 1;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      const basePoints = Math.max(20, 100 - state.replaysThisRound * 10);
      state.score += basePoints;

      if (chosenBtn) chosenBtn.classList.add('is-correct');

      feedbackText.textContent = 'Correct! That was a ' + correctName + '.';
      feedbackText.className = 'feedback-text is-correct';
    } else {
      state.streak = 0;

      if (chosenBtn) chosenBtn.classList.add('is-incorrect');
      if (correctBtn) correctBtn.classList.add('is-reveal');

      feedbackText.textContent =
        'Not quite — you heard a ' + correctName + ', you picked ' + chosenName + '.';
      feedbackText.className = 'feedback-text is-incorrect';
    }

    state.history.push({ interval: correctName, correct: correct, replays: state.replaysThisRound });
    updateStatBar();
    feedbackStrip.hidden = false;
    nextBtn.focus();

    // Sequence: confirming ding/buzz first, then reinforcement / A-B replay.
    playbackBusy = true;
    setPlayingVisual(true);

    if (correct) {
      const dingMs = playDing(ctx);
      setTimeout(function () {
        // Replay the actual interval once more, back-to-back, as reinforcement.
        playToneReinforcement(ctx, root, correctIv.semitones, function () {
          setPlayingVisual(false);
          playbackBusy = false;
        });
      }, dingMs + 120);
    } else {
      const buzzMs = playBuzz(ctx);
      setTimeout(function () {
        // A/B replay: correct interval, then the (wrong) interval the player picked.
        playTwoIntervalsSequence(
          ctx,
          { root: root, interval: correctIv.semitones },
          { root: root, interval: chosenIv.semitones },
          function () {
            setPlayingVisual(false);
            playbackBusy = false;
          }
        );
      }, buzzMs + 120);
    }
  }

  // Replays a single interval (root + target) once, for correct-answer reinforcement.
  function playToneReinforcement(ctx, root, intervalSemitones, onDone) {
    playInterval(ctx, root, intervalSemitones, onDone);
  }

  function cssEscape(str) {
    if (window.CSS && window.CSS.escape) return window.CSS.escape(str);
    return str.replace(/["\\]/g, '\\$&');
  }

  nextBtn.addEventListener('click', function () {
    if (state.round >= TOTAL_ROUNDS) {
      finishSession();
    } else {
      nextRound();
      playBtn.focus();
    }
  });

  // =========================================================================
  // Keyboard accessibility
  // =========================================================================

  document.addEventListener('keydown', function (e) {
    if (e.code !== 'Space') return;
    if (gameScreen.hidden) return; // only relevant during gameplay

    const active = document.activeElement;

    // Space is the dedicated play/replay control. Answer selection is handled
    // via click or Tab+Enter, so a focused answer-btn should NOT "activate"
    // on Space the way a native button normally would — instead, Space always
    // plays/replays the current round's audio. The one exception is the
    // feedback strip's "Next Round" button, which should keep its native
    // Space-activation behavior since it isn't part of the answer grid.
    if (active === nextBtn) return;

    e.preventDefault();
    triggerPlayback();
  });

  // =========================================================================
  // Results
  // =========================================================================

  function finishSession() {
    const total = state.history.length;
    const correctCount = state.history.filter(function (h) { return h.correct; }).length;
    const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const totalReplays = state.history.reduce(function (sum, h) { return sum + h.replays; }, 0);
    const avgReplays = total > 0 ? (totalReplays / total) : 0;
    const grade = gradeFor(accuracy);

    const previousBest = getBest(state.difficulty);
    const isNewBest = !previousBest || accuracy > previousBest.accuracy;

    resultsGrade.textContent = grade;
    resultAccuracy.textContent = accuracy + '%';
    resultReplays.textContent = avgReplays.toFixed(1);
    resultStreak.textContent = String(state.bestStreak);
    resultScore.textContent = String(state.score);

    if (isNewBest) {
      setBest(state.difficulty, {
        accuracy: accuracy,
        grade: grade,
        score: state.score,
        bestStreak: state.bestStreak,
        avgReplays: avgReplays,
        date: new Date().toISOString().slice(0, 10),
      });
      bannerBest.hidden = false;
      resultsBestLine.textContent = 'You just set a new best for ' + capitalize(state.difficulty) + '!';

      const ctx = ensureAudioContext();
      playFanfare(ctx);
    } else {
      bannerBest.hidden = true;
      resultsBestLine.textContent = previousBest
        ? 'Best on ' + capitalize(state.difficulty) + ': ' + previousBest.accuracy + '% (Grade ' + previousBest.grade + ')'
        : '';
    }

    showScreen(resultsScreen);
  }

  playAgainBtn.addEventListener('click', function () {
    ensureAudioContext();
    startSession();
  });

  // =========================================================================
  // Init
  // =========================================================================

  setDifficulty('easy');
  showScreen(startScreen);
})();
