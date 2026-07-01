// Beat Keeper — rhythm training game.
// All timing is driven off the Web Audio clock (audioContext.currentTime),
// never setTimeout/setInterval alone, so the game stays sample-accurate
// over a full 8-measure pattern instead of drifting.
(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Constants & difficulty grammar
  // ---------------------------------------------------------------------

  var MEASURES = 8;
  var BEATS_PER_MEASURE = 4;
  var PERFECT_WINDOW = 0.04; // seconds
  var GOOD_WINDOW = 0.09; // seconds
  var MISS_SWEEP_GRACE = 0.12; // seconds after scheduled time before auto-miss
  var LOOKAHEAD = 0.1; // seconds — how far ahead we schedule audio
  var SCHEDULER_INTERVAL_MS = 25; // how often the scheduler timer fires
  var COUNTIN_BEATS = 4;
  var PIXELS_PER_SECOND = 220; // horizontal scroll speed on the highway
  var HIT_LINE_FRACTION = 0.18; // ~15-20% from the left edge

  var DIFFICULTIES = {
    easy: {
      label: 'Easy',
      bpmMin: 70,
      bpmMax: 100,
      tempoRamp: false,
      pickSubdivision: function () { return 1; },
      pickType: function () {
        return Math.random() < 0.85 ? 'note' : 'rest';
      }
    },
    medium: {
      label: 'Medium',
      bpmMin: 85,
      bpmMax: 110,
      tempoRamp: false,
      pickSubdivision: function () {
        return Math.random() < 0.35 ? 2 : 1;
      },
      pickType: function () {
        return Math.random() < 0.82 ? 'note' : 'rest';
      }
    },
    hard: {
      label: 'Hard',
      bpmMin: 100,
      bpmMax: 120,
      tempoRamp: true,
      pickSubdivision: function () {
        var r = Math.random();
        if (r < 0.3) return 2;
        return 1;
      },
      pickType: function () {
        // occasional syncopation: rests appear a bit more often, and
        // hit notes still dominate so the groove stays playable.
        return Math.random() < 0.78 ? 'note' : 'rest';
      }
    }
  };

  // ---------------------------------------------------------------------
  // DOM references
  // ---------------------------------------------------------------------

  var startScreen = document.getElementById('start-screen');
  var countinScreen = document.getElementById('countin-screen');
  var gameScreen = document.getElementById('game-screen');
  var resultsScreen = document.getElementById('results-screen');

  var difficultyOptions = document.querySelectorAll('.difficulty-option');
  var startBtn = document.getElementById('start-btn');
  var tempoIndicator = document.getElementById('tempo-indicator');
  var bestPreview = document.getElementById('best-preview');

  var countinNumber = document.getElementById('countin-number');

  var statScore = document.getElementById('stat-score');
  var statAccuracy = document.getElementById('stat-accuracy');
  var comboPill = document.getElementById('combo-pill');
  var comboValue = document.getElementById('combo-value');

  var canvas = document.getElementById('highway-canvas');
  var ctx2d = canvas.getContext('2d');

  var progressLabel = document.getElementById('progress-label');
  var progressFill = document.getElementById('progress-fill');
  var progressTrack = document.querySelector('.progress-strip .progress-track');

  var tapZone = document.getElementById('tap-zone');

  var resultsHeading = document.querySelector('.results-heading');
  var bannerBest = document.getElementById('banner-best');
  var gradeBadge = document.getElementById('grade-badge');
  var resultScore = document.getElementById('result-score');
  var resultAccuracy = document.getElementById('result-accuracy');
  var resultCombo = document.getElementById('result-combo');
  var resultPerfect = document.getElementById('result-perfect');
  var resultGood = document.getElementById('result-good');
  var resultMiss = document.getElementById('result-miss');
  var resultsBestLine = document.getElementById('results-best-line');
  var playAgainBtn = document.getElementById('play-again-btn');

  // ---------------------------------------------------------------------
  // Persisted state
  // ---------------------------------------------------------------------

  var STORAGE_PREFIX = 'beatKeeper.';

  function loadBest(difficulty) {
    try {
      var raw = localStorage.getItem(STORAGE_PREFIX + 'best.' + difficulty);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveBest(difficulty, data) {
    try {
      localStorage.setItem(STORAGE_PREFIX + 'best.' + difficulty, JSON.stringify(data));
    } catch (e) {
      /* localStorage unavailable — game still works, just without persistence */
    }
  }

  // ---------------------------------------------------------------------
  // Selection state
  // ---------------------------------------------------------------------

  var selectedDifficulty = 'easy';

  function updateBestPreview() {
    var best = loadBest(selectedDifficulty);
    if (best) {
      bestPreview.textContent = 'Best (' + DIFFICULTIES[selectedDifficulty].label + '): ' +
        best.score + ' pts — ' + best.accuracy + '% accuracy (' + best.grade + ')';
    } else {
      bestPreview.textContent = 'No best score yet for ' + DIFFICULTIES[selectedDifficulty].label + '. Play to set one!';
    }
  }

  difficultyOptions.forEach(function (btn) {
    btn.addEventListener('click', function () {
      difficultyOptions.forEach(function (b) {
        b.classList.remove('is-active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-pressed', 'true');
      selectedDifficulty = btn.getAttribute('data-difficulty');
      var d = DIFFICULTIES[selectedDifficulty];
      tempoIndicator.textContent = 'Tempo: ' + d.bpmMin + '–' + d.bpmMax + ' BPM';
      updateBestPreview();
    });
  });

  updateBestPreview();

  // ---------------------------------------------------------------------
  // Audio engine
  // ---------------------------------------------------------------------

  var audioCtx = null;

  function ensureAudioContext() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // Equal-temperament frequency helper, kept for consistency across the
  // platform's games even though Beat Keeper mostly uses percussive clicks.
  function noteFreq(semitonesFromA4) {
    return 440 * Math.pow(2, semitonesFromA4 / 12);
  }

  // Short, sharp metronome tick. accented = the 4th count-in click (pitched
  // down slightly to signal "go").
  function scheduleTick(time, accented) {
    var ac = audioCtx;
    var osc = ac.createOscillator();
    var gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = accented ? 700 : 1000;
    gain.gain.setValueAtTime(0.28, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(time);
    osc.stop(time + 0.03);
  }

  // Bright two-partial chime for a Perfect hit.
  function schedulePerfectChime(time) {
    var ac = audioCtx;
    [1200, 1800].forEach(function (freq) {
      var osc = ac.createOscillator();
      var gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, time);
      gain.gain.exponentialRampToValueAtTime(0.22, time + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(time);
      osc.stop(time + 0.07);
    });
  }

  // Plainer single tone for a Good hit.
  function scheduleGoodTone(time) {
    var ac = audioCtx;
    var osc = ac.createOscillator();
    var gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = 800;
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(0.16, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(time);
    osc.stop(time + 0.07);
  }

  // Quiet, unobtrusive thud for an off-target/"too soon" tap. Never harsh.
  function scheduleMissThud(time) {
    var ac = audioCtx;
    var osc = ac.createOscillator();
    var gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = 160;
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(0.05, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.09);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(time);
    osc.stop(time + 0.1);
  }

  // Distinct 3-note ascending arpeggio fanfare for a new-best moment.
  // C5, E5, G5 — semitones from A4: C5=+3, E5=+7, G5=+10.
  function playNewBestFanfare() {
    var ac = ensureAudioContext();
    var now = ac.currentTime + 0.02;
    var semis = [3, 7, 10];
    semis.forEach(function (s, i) {
      var t = now + i * 0.11;
      var freq = noteFreq(s);
      var osc = ac.createOscillator();
      var gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.11);
    });
  }

  // ---------------------------------------------------------------------
  // Pattern generation
  // ---------------------------------------------------------------------

  function generatePattern(bpmStart, measures, grammar) {
    var slots = [];
    var t = 0;
    var bpm = bpmStart;
    var beatDuration = 60 / bpm;

    for (var m = 0; m < measures; m++) {
      if (grammar.tempoRamp && m > 0 && m % 2 === 0) {
        bpm += 5;
        beatDuration = 60 / bpm;
      }
      for (var beat = 0; beat < BEATS_PER_MEASURE; beat++) {
        var subdivisions = grammar.pickSubdivision();
        var subDur = beatDuration / subdivisions;
        for (var s = 0; s < subdivisions; s++) {
          slots.push({
            time: t,
            type: grammar.pickType(),
            measure: m,
            hit: null // null = unjudged, or 'perfect' | 'good' | 'miss' | 'toosoon'
          });
          t += subDur;
        }
      }
    }

    // Guarantee the pattern isn't all rests (extremely unlikely, but keep
    // the groove meaningful) by forcing the first slot to be a note.
    if (slots.length && slots.every(function (sl) { return sl.type === 'rest'; })) {
      slots[0].type = 'note';
    }

    return { slots: slots, totalDuration: t, finalBpm: bpm };
  }

  // ---------------------------------------------------------------------
  // Lookahead scheduler for the click track (metronome ticks on every
  // quarter-note beat throughout the pattern, plus the count-in).
  // ---------------------------------------------------------------------

  function Scheduler(audioCtx) {
    this.audioCtx = audioCtx;
    this.queue = []; // [{ time, accented, played }]
    this.timerId = null;
  }

  Scheduler.prototype.setQueue = function (events) {
    this.queue = events;
  };

  Scheduler.prototype.start = function () {
    var self = this;
    this.tick();
    this.timerId = setInterval(function () { self.tick(); }, SCHEDULER_INTERVAL_MS);
  };

  Scheduler.prototype.stop = function () {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  };

  Scheduler.prototype.tick = function () {
    var now = this.audioCtx.currentTime;
    for (var i = 0; i < this.queue.length; i++) {
      var ev = this.queue[i];
      if (!ev.played && ev.time < now + LOOKAHEAD) {
        ev.played = true;
        scheduleTick(ev.time, ev.accented);
      }
    }
  };

  // ---------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------

  var state = null;

  function multiplierFor(combo) {
    if (combo >= 30) return 4;
    if (combo >= 20) return 3;
    if (combo >= 10) return 2;
    return 1;
  }

  function gradeFromAccuracy(acc) {
    if (acc >= 95) return 'S';
    if (acc >= 85) return 'A';
    if (acc >= 70) return 'B';
    return 'C';
  }

  function createGameState(difficulty) {
    var grammar = DIFFICULTIES[difficulty];
    var bpm = grammar.bpmMin + Math.random() * (grammar.bpmMax - grammar.bpmMin);
    bpm = Math.round(bpm);
    var pattern = generatePattern(bpm, MEASURES, grammar);

    return {
      difficulty: difficulty,
      bpm: bpm,
      pattern: pattern,
      score: 0,
      combo: 0,
      maxCombo: 0,
      multiplier: 1,
      perfectCount: 0,
      goodCount: 0,
      missCount: 0,
      tapAttempts: 0,
      currentMeasure: 0,
      patternStartTime: 0, // audioCtx.currentTime at which slot.time=0 occurs
      finished: false,
      floaters: [], // { text, x, startTime, color }
      lastBeatPulse: -1 // index of last beat used for the hit-line pulse ring
    };
  }

  // ---------------------------------------------------------------------
  // Screen management
  // ---------------------------------------------------------------------

  function showScreen(el) {
    [startScreen, countinScreen, gameScreen, resultsScreen].forEach(function (s) {
      s.hidden = (s !== el);
    });
  }

  // ---------------------------------------------------------------------
  // Start flow: count-in, then pattern playback
  // ---------------------------------------------------------------------

  var rafId = null;
  var scheduler = null;
  var countinTimeouts = [];

  function clearCountinTimeouts() {
    countinTimeouts.forEach(function (id) { clearTimeout(id); });
    countinTimeouts = [];
  }

  function startGame() {
    var ac = ensureAudioContext();
    state = createGameState(selectedDifficulty);

    showScreen(countinScreen);

    var beatDuration = 60 / state.bpm;
    var now = ac.currentTime + 0.05;

    // Schedule the 4-beat count-in as audio-clock events (4th tick accented).
    var countinEvents = [];
    for (var i = 0; i < COUNTIN_BEATS; i++) {
      countinEvents.push({ time: now + i * beatDuration, accented: (i === COUNTIN_BEATS - 1), played: false });
    }

    // patternStartTime is exactly when count-in ends.
    state.patternStartTime = now + COUNTIN_BEATS * beatDuration;

    // Build the full click-track queue: count-in ticks + one tick per quarter
    // note across the whole pattern (using the pattern's evolving BPM so the
    // beat visual/audio pulse stays locked to tempo ramps on Hard).
    var beatEvents = countinEvents.slice();
    var bpm = state.bpm;
    var grammar = DIFFICULTIES[state.difficulty];
    var t = 0;
    for (var m = 0; m < MEASURES; m++) {
      if (grammar.tempoRamp && m > 0 && m % 2 === 0) {
        bpm += 5;
      }
      var bd = 60 / bpm;
      for (var beat = 0; beat < BEATS_PER_MEASURE; beat++) {
        beatEvents.push({ time: state.patternStartTime + t, accented: false, played: false });
        t += bd;
      }
    }

    scheduler = new Scheduler(ac);
    scheduler.setQueue(beatEvents);
    scheduler.start();

    // Visual count-in numbers, synced approximately to the same audio-clock
    // schedule via small setTimeout offsets from "now" (these are cosmetic —
    // the actual sound and gameplay timing never depend on setTimeout).
    clearCountinTimeouts();
    var msUntilStart = (now - ac.currentTime) * 1000;
    for (var c = 0; c < COUNTIN_BEATS; c++) {
      (function (count) {
        var delay = Math.max(0, msUntilStart + count * beatDuration * 1000);
        countinTimeouts.push(setTimeout(function () {
          countinNumber.textContent = String(count + 1);
          countinNumber.classList.remove('countin-number');
          void countinNumber.offsetWidth; // restart animation
          countinNumber.classList.add('countin-number');
        }, delay));
      })(c);
    }

    var delayToGame = Math.max(0, msUntilStart + COUNTIN_BEATS * beatDuration * 1000 - 120);
    countinTimeouts.push(setTimeout(function () {
      showScreen(gameScreen);
      resizeCanvas();
      resetHud();
    }, delayToGame));

    if (!rafId) {
      rafId = requestAnimationFrame(loop);
    }
  }

  function resetHud() {
    statScore.textContent = '0';
    statAccuracy.textContent = '100%';
    comboValue.textContent = 'x1';
    comboPill.className = 'combo-pill';
    progressLabel.textContent = 'Measure 1 / ' + MEASURES;
    progressFill.style.width = '0%';
    progressTrack.setAttribute('aria-valuenow', '0');
  }

  // ---------------------------------------------------------------------
  // Tap handling & grading
  // ---------------------------------------------------------------------

  function findNearestUnjudgedSlot(tapTime) {
    if (!state) return null;
    var slots = state.pattern.slots;
    var best = null;
    var bestDist = Infinity;
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      if (slot.hit !== null) continue;
      var absoluteTime = state.patternStartTime + slot.time;
      var dist = Math.abs(absoluteTime - tapTime);
      // Only consider slots within a reasonably generous capture window so a
      // tap doesn't get attributed to a note several beats away.
      if (dist < GOOD_WINDOW * 3 && dist < bestDist) {
        bestDist = dist;
        best = slot;
      }
    }
    return best;
  }

  function addFloater(text, color) {
    state.floaters.push({
      text: text,
      color: color,
      startTime: performance.now()
    });
  }

  function updateAccuracyDisplay() {
    var judged = state.perfectCount + state.goodCount + state.missCount;
    var acc = judged === 0 ? 100 : Math.round(((state.perfectCount + state.goodCount) / judged) * 100);
    statAccuracy.textContent = acc + '%';
    return acc;
  }

  function updateComboDisplay(milestoneHit) {
    comboValue.textContent = 'x' + state.multiplier;
    var cls = 'combo-pill';
    if (state.multiplier === 2) cls += ' is-x2';
    else if (state.multiplier === 3) cls += ' is-x3';
    else if (state.multiplier === 4) cls += ' is-x4';
    if (milestoneHit) cls += ' is-pulse';
    comboPill.className = cls;
    if (milestoneHit) {
      // restart animation cleanly on repeat milestones
      window.setTimeout(function () {
        comboPill.classList.remove('is-pulse');
      }, 420);
    }
  }

  // Score contribution for a judged hit at the multiplier in effect at the
  // moment of the hit (multiplier is recomputed from combo just before this
  // is called, so it reflects the combo *including* the hit that just
  // landed — see judgeTap).
  function scoreForHit(kind, multiplierAtHit) {
    if (kind === 'perfect') return 100 * multiplierAtHit;
    if (kind === 'good') return 50 * multiplierAtHit;
    return 0;
  }

  function judgeTap() {
    if (!state || state.finished || !audioCtx) return;
    var tapTime = audioCtx.currentTime;
    state.tapAttempts++;

    var slot = findNearestUnjudgedSlot(tapTime);

    if (!slot) {
      // Nothing nearby to judge against — a stray tap. Quiet thud, no score.
      scheduleMissThud(tapTime);
      return;
    }

    var absoluteTime = state.patternStartTime + slot.time;
    var dist = Math.abs(absoluteTime - tapTime);

    if (slot.type === 'rest') {
      // Tapped a rest that shouldn't be tapped: "Too Soon!" miss, regardless
      // of timing distance (as long as it's the closest slot).
      if (dist <= GOOD_WINDOW) {
        slot.hit = 'toosoon';
        state.missCount++;
        state.combo = 0;
        state.multiplier = multiplierFor(state.combo);
        updateComboDisplay(false);
        addFloater('Too Soon!', 'var(--color-miss)');
        scheduleMissThud(tapTime);
        updateAccuracyDisplay();
      } else {
        scheduleMissThud(tapTime);
      }
      return;
    }

    // slot.type === 'note'
    if (dist <= PERFECT_WINDOW) {
      var multBefore = state.multiplier;
      state.combo++;
      state.multiplier = multiplierFor(state.combo);
      var points = scoreForHit('perfect', state.multiplier);
      state.score += points;
      state.perfectCount++;
      slot.hit = 'perfect';
      if (state.combo > state.maxCombo) state.maxCombo = state.combo;
      updateComboDisplay(state.multiplier !== multBefore && state.multiplier > 1);
      statScore.textContent = String(state.score);
      updateAccuracyDisplay();
      addFloater('Perfect!', 'var(--color-perfect)');
      schedulePerfectChime(tapTime);
    } else if (dist <= GOOD_WINDOW) {
      var multBefore2 = state.multiplier;
      state.combo++;
      state.multiplier = multiplierFor(state.combo);
      var points2 = scoreForHit('good', state.multiplier);
      state.score += points2;
      state.goodCount++;
      slot.hit = 'good';
      if (state.combo > state.maxCombo) state.maxCombo = state.combo;
      updateComboDisplay(state.multiplier !== multBefore2 && state.multiplier > 1);
      statScore.textContent = String(state.score);
      updateAccuracyDisplay();
      addFloater('Good', 'var(--color-good)');
      scheduleGoodTone(tapTime);
    } else {
      // Too far from any note to count as a hit — quiet stray tap, don't
      // consume the slot (it will still be auto-swept as a miss later, or
      // caught by a better-timed tap).
      scheduleMissThud(tapTime);
    }
  }

  function sweepMissedSlots() {
    if (!state || !audioCtx) return;
    var now = audioCtx.currentTime;
    var slots = state.pattern.slots;
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      if (slot.hit === null && slot.type === 'note') {
        var absoluteTime = state.patternStartTime + slot.time;
        if (absoluteTime < now - MISS_SWEEP_GRACE) {
          slot.hit = 'miss';
          state.missCount++;
          state.combo = 0;
          state.multiplier = multiplierFor(state.combo);
          updateComboDisplay(false);
          updateAccuracyDisplay();
        }
      } else if (slot.hit === null && slot.type === 'rest') {
        var absoluteTime2 = state.patternStartTime + slot.time;
        if (absoluteTime2 < now - MISS_SWEEP_GRACE) {
          // Un-tapped rests are correctly "not tapped" — mark resolved but
          // don't penalize; they simply don't count toward judged accuracy.
          slot.hit = 'rest-ok';
        }
      }
    }
  }

  function handleTapPress() {
    ensureAudioContext();
    if (!state || state.finished) return;
    judgeTap();
    tapZone.classList.add('is-pressed');
    window.setTimeout(function () {
      tapZone.classList.remove('is-pressed');
    }, 100);
  }

  tapZone.addEventListener('click', handleTapPress);
  tapZone.addEventListener('keydown', function (e) {
    // Native <button> already fires 'click' on Enter/Space, so avoid double
    // handling here; this listener exists only to stop page scroll on Space.
    if (e.code === 'Space') {
      e.preventDefault();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (gameScreen.hidden) return;
    if (e.code === 'Space' || e.code === 'Enter' || e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handleTapPress();
    }
  });

  // ---------------------------------------------------------------------
  // Canvas rendering (requestAnimationFrame draw loop)
  // ---------------------------------------------------------------------

  function resizeCanvas() {
    var rect = canvas.parentElement.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas._cssWidth = rect.width;
    canvas._cssHeight = rect.height;
  }

  window.addEventListener('resize', function () {
    if (!gameScreen.hidden) resizeCanvas();
  });

  function drawHighway() {
    var w = canvas._cssWidth || canvas.clientWidth;
    var h = canvas._cssHeight || canvas.clientHeight;
    ctx2d.clearRect(0, 0, w, h);

    var hitLineX = w * HIT_LINE_FRACTION;
    var laneY = h / 2;
    var radius = Math.max(10, Math.min(20, h * 0.14));

    // Lane line
    ctx2d.strokeStyle = 'rgba(107, 95, 86, 0.25)';
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    ctx2d.moveTo(0, laneY);
    ctx2d.lineTo(w, laneY);
    ctx2d.stroke();

    // Hit line
    ctx2d.strokeStyle = '#2E6E62';
    ctx2d.lineWidth = 3;
    ctx2d.beginPath();
    ctx2d.moveTo(hitLineX, laneY - h * 0.32);
    ctx2d.lineTo(hitLineX, laneY + h * 0.32);
    ctx2d.stroke();

    // Pulsing ring synced to the beat (visual metronome), driven by the
    // audio clock rather than a frame counter.
    if (state && audioCtx) {
      var beatDuration = 60 / state.bpm;
      var sinceStart = audioCtx.currentTime - state.patternStartTime;
      var phase = ((sinceStart % beatDuration) + beatDuration) % beatDuration;
      var pulse = 1 - (phase / beatDuration); // 1 at beat onset, fading to 0
      var ringRadius = radius + pulse * radius * 0.9;
      ctx2d.beginPath();
      ctx2d.arc(hitLineX, laneY, ringRadius, 0, Math.PI * 2);
      ctx2d.strokeStyle = 'rgba(46, 110, 98, ' + (0.5 * pulse).toFixed(3) + ')';
      ctx2d.lineWidth = 2;
      ctx2d.stroke();
    }

    // Markers
    if (state && audioCtx) {
      var now = audioCtx.currentTime;
      var slots = state.pattern.slots;
      for (var i = 0; i < slots.length; i++) {
        var slot = slots[i];
        var absoluteTime = state.patternStartTime + slot.time;
        var x = hitLineX + (absoluteTime - now) * PIXELS_PER_SECOND;
        if (x < -radius * 2 || x > w + radius * 2) continue;
        // Once a note/rest has been judged it pops/fades quickly rather than
        // continuing to scroll past, per spec ("flash/pop and disappear").
        if (slot.hit !== null) {
          var age = now - absoluteTime; // time since it was judged-eligible
          if (slot.hit === 'rest-ok') continue; // silently resolved, no draw
          if (age > 0.18) continue; // fully faded
        }

        drawMarker(x, laneY, radius, slot);
      }
    }

    // Floating judgment text just above the hit line.
    if (state) {
      var nowMs = performance.now();
      state.floaters = state.floaters.filter(function (f) {
        return nowMs - f.startTime < 800;
      });
      state.floaters.forEach(function (f) {
        var t = (nowMs - f.startTime) / 800;
        var alpha = 1 - t;
        var yOffset = -t * 40;
        ctx2d.save();
        ctx2d.globalAlpha = Math.max(0, alpha);
        ctx2d.fillStyle = resolveColor(f.color);
        ctx2d.font = '700 20px Georgia, serif';
        ctx2d.textAlign = 'center';
        ctx2d.fillText(f.text, hitLineX, laneY - h * 0.34 + yOffset);
        ctx2d.restore();
      });
    }
  }

  var colorCache = {};
  function resolveColor(cssVarExpr) {
    if (colorCache[cssVarExpr]) return colorCache[cssVarExpr];
    var match = /var\((--[a-z-]+)\)/.exec(cssVarExpr);
    var resolved = cssVarExpr;
    if (match) {
      var val = getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim();
      resolved = val || '#2B2420';
    }
    colorCache[cssVarExpr] = resolved;
    return resolved;
  }

  function drawMarker(x, y, radius, slot) {
    var fadeScale = 1;
    var fadeAlpha = 1;
    if (slot.hit !== null && audioCtx) {
      var age = audioCtx.currentTime - (state.patternStartTime + slot.time);
      var t = Math.min(1, Math.max(0, age / 0.18));
      fadeScale = 1 + t * 0.6;
      fadeAlpha = 1 - t;
    }

    ctx2d.save();
    ctx2d.globalAlpha = Math.max(0, fadeAlpha);

    if (slot.type === 'rest') {
      // Hollow/outlined marker — rests must be visually distinguishable at
      // a glance from filled hit-notes.
      ctx2d.beginPath();
      ctx2d.arc(x, y, radius * 0.72 * fadeScale, 0, Math.PI * 2);
      ctx2d.lineWidth = 3;
      ctx2d.strokeStyle = slot.hit === 'toosoon' ? '#C1512C' : 'rgba(107, 95, 86, 0.65)';
      ctx2d.stroke();
    } else {
      ctx2d.beginPath();
      ctx2d.arc(x, y, radius * fadeScale, 0, Math.PI * 2);
      var fill;
      if (slot.hit === 'perfect') fill = '#B5790C';
      else if (slot.hit === 'good') fill = '#2E6E62';
      else if (slot.hit === 'miss') fill = 'rgba(107, 95, 86, 0.55)';
      else fill = '#D9633B';
      ctx2d.fillStyle = fill;
      ctx2d.fill();
    }

    ctx2d.restore();
  }

  // ---------------------------------------------------------------------
  // Main loop — drives visuals every frame from the audio clock; game
  // logic (miss sweeping, progress, completion) is checked each frame too.
  // ---------------------------------------------------------------------

  function loop() {
    rafId = requestAnimationFrame(loop);

    if (!gameScreen.hidden && state && audioCtx) {
      sweepMissedSlots();
      updateProgress();
      drawHighway();
      checkCompletion();
    }
  }

  function updateProgress() {
    if (!state || !audioCtx) return;
    var now = audioCtx.currentTime;
    var elapsed = now - state.patternStartTime;
    var measureDuration = state.pattern.totalDuration / MEASURES;
    var measure = Math.min(MEASURES - 1, Math.max(0, Math.floor(elapsed / Math.max(0.0001, measureDuration))));
    if (measure !== state.currentMeasure) {
      state.currentMeasure = measure;
    }
    var displayMeasure = Math.min(MEASURES, measure + 1);
    progressLabel.textContent = 'Measure ' + displayMeasure + ' / ' + MEASURES;
    var pct = Math.min(100, Math.max(0, (elapsed / state.pattern.totalDuration) * 100));
    progressFill.style.width = pct + '%';
    progressTrack.setAttribute('aria-valuenow', String(displayMeasure));
  }

  function checkCompletion() {
    if (!state || state.finished || !audioCtx) return;
    var now = audioCtx.currentTime;
    if (now > state.patternStartTime + state.pattern.totalDuration + MISS_SWEEP_GRACE + 0.05) {
      state.finished = true;
      finishGame();
    }
  }

  // ---------------------------------------------------------------------
  // Results
  // ---------------------------------------------------------------------

  function finishGame() {
    if (scheduler) scheduler.stop();

    var acc = updateAccuracyDisplay();
    var accNum = parseInt(statAccuracy.textContent, 10) || 0;
    var grade = gradeFromAccuracy(accNum);

    var best = loadBest(state.difficulty);
    var isNewBest = !best || state.score > best.score;

    resultScore.textContent = String(state.score);
    resultAccuracy.textContent = accNum + '%';
    resultCombo.textContent = String(state.maxCombo);
    resultPerfect.textContent = String(state.perfectCount);
    resultGood.textContent = String(state.goodCount);
    resultMiss.textContent = String(state.missCount);

    gradeBadge.textContent = grade;
    gradeBadge.className = 'grade-badge grade-' + grade;

    resultsHeading.textContent = 'Pattern Complete!';

    if (best) {
      resultsBestLine.textContent = 'Previous best (' + DIFFICULTIES[state.difficulty].label + '): ' +
        best.score + ' pts — ' + best.accuracy + '% (' + best.grade + ')';
    } else {
      resultsBestLine.textContent = 'First run recorded for ' + DIFFICULTIES[state.difficulty].label + '!';
    }

    if (isNewBest) {
      saveBest(state.difficulty, { score: state.score, accuracy: accNum, grade: grade });
      bannerBest.hidden = false;
      playNewBestFanfare();
    } else {
      bannerBest.hidden = true;
    }

    showScreen(resultsScreen);
    updateBestPreview();
  }

  // ---------------------------------------------------------------------
  // Wiring: start / play again
  // ---------------------------------------------------------------------

  startBtn.addEventListener('click', startGame);

  playAgainBtn.addEventListener('click', function () {
    startGame();
  });

  // Keep canvas sized correctly if the game screen becomes visible after a
  // layout shift (e.g. orientation change while on another screen).
  showScreen(startScreen);
}());
