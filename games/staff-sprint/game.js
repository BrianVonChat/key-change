/* Staff Sprint — note-reading flashcard sprint.
   Plain JS, no dependencies. See index.html / style.css in this folder. */

(() => {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const STORAGE_KEY = 'staffSprint.best';

  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

  // step 0 = E4 (bottom treble line). Matches the spec's reference mapping.
  function noteAtStep(step) {
    const E_INDEX = LETTERS.indexOf('E'); // 2
    const letterIndex = ((E_INDEX + step) % 7 + 7) % 7;
    const letter = LETTERS[letterIndex];
    const octave = 4 + Math.floor((E_INDEX + step) / 7);
    return { letter, octave };
  }

  // ---------------------------------------------------------------------
  // Difficulty configuration
  // ---------------------------------------------------------------------

  const DIFFICULTY = {
    easy: {
      label: 'Easy',
      roundSeconds: 8,
      stepPool: range(0, 8),           // staff lines/spaces only
      ledgerAllowed: false,
      accidentalChance: 0,
      grandStaff: false
    },
    medium: {
      label: 'Medium',
      roundSeconds: 5,
      stepPool: range(-4, 12),          // up to 2 ledger lines beyond the staff
      ledgerAllowed: true,
      accidentalChance: 0.18,
      grandStaff: false
    },
    hard: {
      label: 'Hard',
      roundSeconds: 3,
      stepPool: range(-6, 14),          // extended ledger range
      ledgerAllowed: true,
      accidentalChance: 0.22,
      grandStaff: true                  // alternates treble/bass per round
    }
  };

  function range(min, max) {
    const out = [];
    for (let i = min; i <= max; i++) out.push(i);
    return out;
  }

  // ---------------------------------------------------------------------
  // Audio engine — single lazily-created AudioContext
  // ---------------------------------------------------------------------

  const Audio_ = (() => {
    let ctx = null;
    let muted = false;

    function ensureCtx() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    function freqFromSemitones(semitonesFromA4) {
      return 440 * Math.pow(2, semitonesFromA4 / 12);
    }

    function playTone({ freq, duration, type = 'sine', gain = 0.2, delay = 0, detune = 0 }) {
      if (muted) return;
      const c = ensureCtx();
      const start = c.currentTime + delay;
      const osc = c.createOscillator();
      const amp = c.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      if (detune) osc.detune.setValueAtTime(detune, start);

      // quick attack / decay envelope
      amp.gain.setValueAtTime(0, start);
      amp.gain.linearRampToValueAtTime(gain, start + 0.012);
      amp.gain.linearRampToValueAtTime(0.0001, start + duration / 1000);

      osc.connect(amp).connect(c.destination);
      osc.start(start);
      osc.stop(start + duration / 1000 + 0.02);
    }

    return {
      unlock() { ensureCtx(); },
      setMuted(v) { muted = v; },
      isMuted() { return muted; },

      playReadyBlip() {
        playTone({ freq: freqFromSemitones(-9), duration: 90, type: 'sine', gain: 0.12 }); // ~A3-ish soft blip
      },

      playCorrect() {
        // 120ms sine ding, ~880Hz (A5)
        playTone({ freq: 880, duration: 120, type: 'sine', gain: 0.22 });
      },

      playIncorrect() {
        // 150ms low buzz, detuned sawtooth, quiet — never the wrong-answer's pitch
        playTone({ freq: 110, duration: 150, type: 'sawtooth', gain: 0.09, detune: -18 });
      },

      playHighScoreFanfare() {
        // C5 - E5 - G5 ascending arpeggio, ~100ms each
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

  function loadBest() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { score: 0, streak: 0 };
      const parsed = JSON.parse(raw);
      return {
        score: Number(parsed.score) || 0,
        streak: Number(parsed.streak) || 0
      };
    } catch (e) {
      return { score: 0, streak: 0 };
    }
  }

  function saveBest(best) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(best));
    } catch (e) {
      /* localStorage unavailable — silently ignore, game still works */
    }
  }

  // ---------------------------------------------------------------------
  // DOM references
  // ---------------------------------------------------------------------

  const els = {
    scoreValue: document.getElementById('score-value'),
    streakValue: document.getElementById('streak-value'),
    lives: document.getElementById('lives'),
    hearts: Array.from(document.querySelectorAll('.heart')),
    muteBtn: document.getElementById('mute-btn'),
    muteIcon: document.getElementById('mute-icon'),
    timerArc: document.getElementById('timer-arc'),
    banner: document.getElementById('streak-banner'),
    svg: document.getElementById('staff-svg'),
    floaters: document.getElementById('floaters'),
    controls: document.getElementById('letter-controls'),
    letterBtns: Array.from(document.querySelectorAll('.letter-btn')),
    startOverlay: document.getElementById('start-overlay'),
    startBtn: document.getElementById('start-btn'),
    difficultyPills: Array.from(document.querySelectorAll('.pill')),
    gameoverOverlay: document.getElementById('gameover-overlay'),
    newBestBanner: document.getElementById('new-best-banner'),
    finalScore: document.getElementById('final-score'),
    finalStreak: document.getElementById('final-streak'),
    finalNpm: document.getElementById('final-npm'),
    bestScore: document.getElementById('best-score'),
    retryBtn: document.getElementById('retry-btn')
  };

  const TIMER_CIRCUMFERENCE = 2 * Math.PI * 16; // r=16 in the 40x40 viewBox

  // ---------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------

  const state = {
    difficulty: 'easy',
    score: 0,
    streak: 0,
    bestStreakThisRun: 0,
    lives: 3,
    best: loadBest(),
    currentNote: null,       // { step, letter, octave, clef, accidental }
    previousStep: null,
    roundStartMs: 0,
    roundDurationMs: 0,
    rafId: null,
    roundActive: false,
    inputLocked: false,
    correctCount: 0,
    runStartMs: 0,
    speedFactor: 1
  };

  // ---------------------------------------------------------------------
  // Staff geometry (SVG, viewBox 0 0 500 220)
  // ---------------------------------------------------------------------

  // Single-staff geometry. Grand-staff mode computes its own scale inside
  // renderStaff(). Every symbol, notehead, and ledger size derives from the
  // staff's lineSpacing — see assets/js/notation.js for the rendering rule.
  const GEOM = {
    lineSpacing: 20,           // px between adjacent staff lines
    trebleBaselineY: 140,      // y of step-0 (bottom treble line, E4)
    staffLeft: 150,
    staffRight: 460
  };

  function stepToY(step, baselineY, ss) {
    // moving line -> space -> line is half a line-gap per step
    return baselineY - step * (ss / 2);
  }

  function clearSvg() {
    while (els.svg.firstChild) els.svg.removeChild(els.svg.firstChild);
  }

  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function drawStaffLines(baselineY, ss, cls) {
    const group = svgEl('g', { class: cls || '' });
    for (let i = 0; i <= 8; i += 2) {
      const y = stepToY(i, baselineY, ss);
      group.appendChild(svgEl('line', {
        x1: GEOM.staffLeft, y1: y, x2: GEOM.staffRight, y2: y,
        class: 'staff-line'
      }));
    }
    return group;
  }

  function drawClef(clef, baselineY, ss) {
    // Shared vector glyph: anchored to its reference line (G or F) and scaled
    // from lineSpacing. Never a font character — see assets/js/notation.js.
    return MusicNotation.clef(clef, {
      x: GEOM.staffLeft + 0.5 * ss,
      bottomLineY: baselineY,
      lineSpacing: ss,
      className: 'staff-clef'
    });
  }

  function drawLedgerLines(step, baselineY, ss) {
    const group = svgEl('g', { class: 'ledger-lines' });
    const cx = GEOM.staffLeft + (GEOM.staffRight - GEOM.staffLeft) / 2;
    const width = 1.8 * ss; // notehead width plus a bit of overhang each side

    if (step > 8) {
      // loop every even step strictly outside the staff up to and including the note's step
      for (let s = 10; s <= step; s += 2) {
        const y = stepToY(s, baselineY, ss);
        group.appendChild(svgEl('line', {
          x1: cx - width / 2, y1: y, x2: cx + width / 2, y2: y,
          class: 'ledger-line'
        }));
      }
    } else if (step < 0) {
      for (let s = -2; s >= step; s -= 2) {
        const y = stepToY(s, baselineY, ss);
        group.appendChild(svgEl('line', {
          x1: cx - width / 2, y1: y, x2: cx + width / 2, y2: y,
          class: 'ledger-line'
        }));
      }
    }
    return group;
  }

  function drawNote(step, baselineY, ss, accidental) {
    const group = svgEl('g', { class: 'note-group' });
    const cx = GEOM.staffLeft + (GEOM.staffRight - GEOM.staffLeft) / 2;
    const y = stepToY(step, baselineY, ss);

    // stem direction: up if on/below the middle line (step <= 4), else down
    const stemUp = step <= 4;
    // engraving proportions, in staff spaces: notehead ~1 space tall,
    // stem ~3.5 spaces long
    const noteheadRx = 0.65 * ss;
    const noteheadRy = 0.5 * ss;
    const stemLength = 3.5 * ss;

    if (accidental) {
      group.appendChild(MusicNotation.accidental(
        accidental === 'sharp' ? 'sharp' : 'flat',
        { x: cx - 1.5 * ss, y: y, lineSpacing: ss, className: 'accidental' }
      ));
    }

    const stem = svgEl('line', {
      x1: stemUp ? cx + noteheadRx - 1 : cx - noteheadRx + 1,
      y1: y,
      x2: stemUp ? cx + noteheadRx - 1 : cx - noteheadRx + 1,
      y2: stemUp ? y - stemLength : y + stemLength,
      class: 'note-stem',
      id: 'note-stem'
    });

    const head = svgEl('ellipse', {
      cx, cy: y, rx: noteheadRx, ry: noteheadRy,
      class: 'notehead',
      id: 'notehead',
      transform: `rotate(-18 ${cx} ${y})`
    });

    group.appendChild(stem);
    group.appendChild(head);
    return group;
  }

  function renderStaff() {
    clearSvg();
    const note = state.currentNote;
    if (!note) return;

    const cfg = DIFFICULTY[state.difficulty];

    if (cfg.grandStaff) {
      // Grand staff: draw both staves for visual context; the active clef
      // (chosen once per round) carries the note + ledger lines.
      // Smaller staff scale so the full hard-mode ledger range (steps -6..14
      // relative to either staff) fits the canvas without the two staves'
      // ledger territory overlapping: max note extent above a bottom line is
      // 14 * ss/2 + notehead, hence the staff positions below.
      const ss = 14;
      const trebleY = 112;
      const bassY = 220;

      els.svg.setAttribute('viewBox', '0 0 500 280');

      els.svg.appendChild(drawStaffLines(trebleY, ss));
      els.svg.appendChild(drawStaffLines(bassY, ss));
      els.svg.appendChild(drawClef('treble', trebleY, ss));
      els.svg.appendChild(drawClef('bass', bassY, ss));

      // barline joining the two staves (top treble line -> bottom bass line)
      els.svg.appendChild(svgEl('line', {
        x1: GEOM.staffLeft, y1: trebleY - 4 * ss, x2: GEOM.staffLeft, y2: bassY,
        class: 'staff-line'
      }));

      const activeBaseline = note.clef === 'treble' ? trebleY : bassY;
      els.svg.appendChild(drawLedgerLines(note.step, activeBaseline, ss));
      els.svg.appendChild(drawNote(note.step, activeBaseline, ss, note.accidental));

      // clef indicator, top-left
      const indicator = svgEl('text', {
        x: 14, y: 22, class: 'clef-indicator'
      });
      indicator.textContent = note.clef === 'treble' ? 'Treble clef' : 'Bass clef';
      els.svg.appendChild(indicator);
    } else {
      els.svg.setAttribute('viewBox', '0 0 500 220');
      const ss = GEOM.lineSpacing;
      const baselineY = GEOM.trebleBaselineY;
      els.svg.appendChild(drawStaffLines(baselineY, ss));
      els.svg.appendChild(drawClef('treble', baselineY, ss));
      els.svg.appendChild(drawLedgerLines(note.step, baselineY, ss));
      els.svg.appendChild(drawNote(note.step, baselineY, ss, note.accidental));
    }
  }

  function flashNote(kind) {
    // kind: 'correct' | 'incorrect'
    const head = document.getElementById('notehead');
    const stem = document.getElementById('note-stem');
    const cls = kind === 'correct' ? 'is-correct' : 'is-incorrect';
    if (head) head.classList.add(cls);
    if (stem) stem.classList.add(cls);
  }

  // ---------------------------------------------------------------------
  // Note selection
  // ---------------------------------------------------------------------

  function pickNextNote() {
    const cfg = DIFFICULTY[state.difficulty];
    const pool = cfg.stepPool;

    let step = pool[Math.floor(Math.random() * pool.length)];
    // reject-resample once if it repeats the previous pick
    if (step === state.previousStep) {
      const retry = pool[Math.floor(Math.random() * pool.length)];
      step = retry;
    }
    state.previousStep = step;

    const { letter, octave } = noteAtStep(step);

    let accidental = null;
    if (cfg.accidentalChance > 0 && Math.random() < cfg.accidentalChance) {
      accidental = Math.random() < 0.5 ? 'sharp' : 'flat';
    }

    // clef chosen once per round, held steady for the whole round
    let clef = 'treble';
    if (cfg.grandStaff) {
      clef = Math.random() < 0.5 ? 'treble' : 'bass';
    }

    return { step, letter, octave, accidental, clef };
  }

  // ---------------------------------------------------------------------
  // Round lifecycle
  // ---------------------------------------------------------------------

  function startRound() {
    state.inputLocked = false;
    state.currentNote = pickNextNote();
    renderStaff();

    const cfg = DIFFICULTY[state.difficulty];
    state.roundDurationMs = (cfg.roundSeconds * 1000) / state.speedFactor;
    state.roundStartMs = performance.now();
    state.roundActive = true;

    tickTimer();
  }

  function tickTimer() {
    if (!state.roundActive) return;

    const elapsed = performance.now() - state.roundStartMs;
    const remaining = Math.max(0, state.roundDurationMs - elapsed);
    const frac = remaining / state.roundDurationMs;

    const offset = TIMER_CIRCUMFERENCE * (1 - frac);
    els.timerArc.style.strokeDasharray = `${TIMER_CIRCUMFERENCE}px`;
    els.timerArc.style.strokeDashoffset = `${offset}px`;
    els.timerArc.classList.toggle('is-urgent', frac < 0.25);

    if (remaining <= 0) {
      state.roundActive = false;
      handleTimeout();
      return;
    }

    state.rafId = requestAnimationFrame(tickTimer);
  }

  function stopTimer() {
    state.roundActive = false;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }

  function handleTimeout() {
    if (state.inputLocked) return;
    state.inputLocked = true;
    stopTimer();
    flashNote('incorrect');
    Audio_.playIncorrect();
    pulseTeachButton();
    state.streak = 0;
    updateStats();
    loseLife();
  }

  function handleAnswer(letter) {
    if (!state.currentNote || state.inputLocked || !state.roundActive) return;
    state.inputLocked = true;
    stopTimer();

    const btn = els.letterBtns.find((b) => b.dataset.letter === letter);
    const correct = letter === state.currentNote.letter;

    if (correct) {
      flashNote('correct');
      if (btn) flashButton(btn, 'is-correct-flash');
      Audio_.playCorrect();

      state.streak += 1;
      state.correctCount += 1;
      state.bestStreakThisRun = Math.max(state.bestStreakThisRun, state.streak);

      const gained = 10 + Math.min(state.streak, 10) * 2;
      state.score += gained;
      spawnFloater(`+${gained}`);

      if (state.streak > 0 && state.streak % 10 === 0) {
        state.speedFactor = Math.min(state.speedFactor + 0.15, 2.2);
        showBanner(`Streak x${state.streak}!`);
      }

      updateStats();
      setTimeout(nextRoundOrEnd, 500);
    } else {
      flashNote('incorrect');
      if (btn) flashButton(btn, 'is-incorrect-flash');
      Audio_.playIncorrect();
      pulseTeachButton();

      state.streak = 0;
      updateStats();

      setTimeout(() => {
        loseLife();
      }, 500);
    }
  }

  function flashButton(btn, cls) {
    btn.classList.add(cls);
    setTimeout(() => btn.classList.remove(cls), 450);
  }

  function pulseTeachButton() {
    const correctLetter = state.currentNote.letter;
    const btn = els.letterBtns.find((b) => b.dataset.letter === correctLetter);
    if (!btn) return;
    btn.classList.add('is-teach-pulse');
    setTimeout(() => btn.classList.remove('is-teach-pulse'), 900);
  }

  function loseLife() {
    state.lives -= 1;
    const heartEl = els.hearts[state.lives]; // 0-indexed remaining count -> that heart is lost
    if (heartEl) heartEl.classList.add('is-lost');

    if (state.lives <= 0) {
      setTimeout(endGame, 500);
    } else {
      setTimeout(nextRoundOrEnd, 500);
    }
  }

  function nextRoundOrEnd() {
    if (state.lives <= 0) {
      endGame();
      return;
    }
    startRound();
  }

  function spawnFloater(text) {
    const el = document.createElement('span');
    el.className = 'floater';
    el.textContent = text;
    els.floaters.appendChild(el);
    setTimeout(() => el.remove(), 850);
  }

  function showBanner(text) {
    els.banner.textContent = text;
    els.banner.classList.add('is-visible');
    setTimeout(() => els.banner.classList.remove('is-visible'), 1400);
  }

  function updateStats() {
    els.scoreValue.textContent = String(state.score);
    els.streakValue.textContent = String(state.streak);
  }

  // ---------------------------------------------------------------------
  // Start / Game over
  // ---------------------------------------------------------------------

  function resetHearts() {
    els.hearts.forEach((h) => h.classList.remove('is-lost'));
  }

  function beginGame() {
    state.score = 0;
    state.streak = 0;
    state.bestStreakThisRun = 0;
    state.lives = 3;
    state.previousStep = null;
    state.correctCount = 0;
    state.speedFactor = 1;
    state.runStartMs = performance.now();

    resetHearts();
    updateStats();

    els.startOverlay.hidden = true;
    els.startOverlay.style.display = 'none';
    els.gameoverOverlay.hidden = true;

    startRound();
  }

  function endGame() {
    stopTimer();
    state.roundActive = false;

    const elapsedMin = Math.max((performance.now() - state.runStartMs) / 60000, 1 / 60);
    const npm = Math.round(state.correctCount / elapsedMin);

    const isNewBest = state.score > state.best.score || state.bestStreakThisRun > state.best.streak;

    if (state.score > state.best.score) state.best.score = state.score;
    if (state.bestStreakThisRun > state.best.streak) state.best.streak = state.bestStreakThisRun;
    saveBest(state.best);

    els.finalScore.textContent = String(state.score);
    els.finalStreak.textContent = String(state.bestStreakThisRun);
    els.finalNpm.textContent = String(npm);
    els.bestScore.textContent = String(state.best.score);

    els.newBestBanner.hidden = !isNewBest;

    els.gameoverOverlay.hidden = false;

    if (isNewBest) {
      Audio_.playHighScoreFanfare();
    }
  }

  // ---------------------------------------------------------------------
  // Input wiring
  // ---------------------------------------------------------------------

  els.difficultyPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      els.difficultyPills.forEach((p) => p.classList.remove('is-active'));
      pill.classList.add('is-active');
      state.difficulty = pill.dataset.difficulty;
    });
  });

  els.startBtn.addEventListener('click', () => {
    Audio_.unlock();
    Audio_.playReadyBlip();
    beginGame();
  });

  els.retryBtn.addEventListener('click', () => {
    els.gameoverOverlay.hidden = true;
    beginGame();
  });

  els.letterBtns.forEach((btn) => {
    btn.addEventListener('click', () => handleAnswer(btn.dataset.letter));
  });

  els.muteBtn.addEventListener('click', () => {
    const nowMuted = !Audio_.isMuted();
    Audio_.setMuted(nowMuted);
    els.muteBtn.setAttribute('aria-pressed', String(nowMuted));
    els.muteIcon.textContent = nowMuted ? '\u{1F507}' : '\u{1F50A}';
    els.muteBtn.setAttribute('aria-label', nowMuted ? 'Unmute sound' : 'Mute sound');
  });

  document.addEventListener('keydown', (e) => {
    const key = e.key;

    // Letter answers A-G, case-insensitive, only while a round is live and no overlay is shown
    if (/^[a-gA-G]$/.test(key) && els.startOverlay.style.display === 'none' && els.gameoverOverlay.hidden) {
      e.preventDefault();
      handleAnswer(key.toUpperCase());
      return;
    }

    // Enter/Space on Start/Retry are handled natively by <button> focus,
    // but also allow triggering Start/Retry when nothing is focused on them.
    if (key === 'Enter' || key === ' ') {
      if (!els.startOverlay.hidden && els.startOverlay.style.display !== 'none' && document.activeElement === document.body) {
        e.preventDefault();
        els.startBtn.click();
      } else if (!els.gameoverOverlay.hidden && document.activeElement === document.body) {
        e.preventDefault();
        els.retryBtn.click();
      }
    }
  });

  // ---------------------------------------------------------------------
  // Initial paint (idle staff preview behind the start overlay)
  // ---------------------------------------------------------------------

  (function initialPreview() {
    state.currentNote = { step: 4, letter: 'G', octave: 4, accidental: null, clef: 'treble' };
    renderStaff();
    els.timerArc.style.strokeDasharray = `${TIMER_CIRCUMFERENCE}px`;
    els.timerArc.style.strokeDashoffset = '0px';
  })();

})();
