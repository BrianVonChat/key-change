#!/usr/bin/env node
/* ==========================================================================
   split-take.js — one-take batch splitter for Degree Detective audio.

   Record a whole batch as ONE continuous WAV — the items in a stated order
   with ~2 seconds of silence between them — and this tool cuts it into
   per-item files, pitch-checks every item, and prints the manifest JSON
   fragment to paste into games/degree-detective/audio/manifest.json.

   Usage:
     node scripts/split-take.js <input.wav> --type notes --out <dir>
     node scripts/split-take.js <input.wav> --type contexts --order C,Db,D --out <dir>
     node scripts/split-take.js <input.wav> --type cadences --order C,G,F --out <dir>

   Options:
     --type    notes | contexts | cadences
               "notes" expects the full chromatic run C3 → B5 (36 items,
               low to high) and needs no --order.
     --order   Comma-separated keys in recorded order. Flat spellings:
               C Db D Eb E F Gb G Ab A Bb B. Required for contexts/cadences.
     --out     Output directory (created if missing). Required.
     --suffix  Optional tag added to filenames (context-C-<suffix>.wav) —
               handy when recording extra VARIANTS of keys you already have.

   Input:  16- or 24-bit PCM WAV, mono or stereo, any sample rate.
   Output: trimmed 16-bit WAVs named per convention + a verification report.
   Zero dependencies — plain Node, like the other scripts in this folder.
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

/* =========================================================================
   Tunables (seconds unless noted)
   ========================================================================= */

const FRAME_MS = 10;          // RMS envelope frame length
const NOISE_FLOOR = 0.02;     // silence = frame RMS below 2% of peak frame RMS
const MIN_GAP_SEC = 1.2;      // a silent run this long separates items
const MIN_ITEM_SEC = 0.12;    // active runs shorter than this are ignored (clicks)
const PRE_ROLL_SEC = 0.05;    // kept before each item's onset
const TAIL_PAD_SEC = 0.25;    // silence kept after each item for natural decay
const FADE_IN_SEC = 0.01;
const FADE_OUT_SEC = 0.05;
const CENTS_TOLERANCE = 40;   // pitch verification pass/fail threshold
const CADENCE_ONSETS_EXPECTED = 4; // I – IV – V – I
const NOTE_AT_AFTER_FINAL = 0.6;   // manifest noteAt = final-chord onset + this

const PITCH_CLASSES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/* =========================================================================
   CLI
   ========================================================================= */

function printUsage() {
  console.log([
    'Usage:',
    '  node scripts/split-take.js <input.wav> --type notes --out <dir>',
    '  node scripts/split-take.js <input.wav> --type contexts --order C,Db,D --out <dir>',
    '  node scripts/split-take.js <input.wav> --type cadences --order C,G,F --out <dir>',
    '',
    'Options:',
    '  --type    notes | contexts | cadences ("notes" = chromatic C3→B5, 36 items)',
    '  --order   comma-separated keys in recorded order (flats: C,Db,D,Eb,E,F,Gb,G,Ab,A,Bb,B)',
    '  --out     output directory (created if missing)',
    '  --suffix  optional filename tag for extra variants (context-C-<suffix>.wav)',
  ].join('\n'));
}

function fail(msg) {
  console.error('Error: ' + msg + '\n');
  printUsage();
  process.exit(1);
}

function parseArgs(argv) {
  const args = { input: null, type: null, order: null, out: null, suffix: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--type') args.type = argv[++i];
    else if (a === '--order') args.order = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--suffix') args.suffix = argv[++i];
    else if (a === '--help' || a === '-h') { printUsage(); process.exit(0); }
    else if (a && a[0] !== '-' && !args.input) args.input = a;
    else fail('unrecognized argument "' + a + '"');
  }
  if (!args.input) fail('missing input WAV file');
  if (!fs.existsSync(args.input)) fail('input file not found: ' + args.input);
  if (['notes', 'contexts', 'cadences'].indexOf(args.type) === -1) {
    fail('--type must be notes, contexts, or cadences');
  }
  if (!args.out) fail('missing --out directory');
  if (args.type === 'notes') {
    if (args.order) fail('--order is not used with --type notes (order is fixed: C3→B5)');
  } else {
    if (!args.order) fail('--order is required for --type ' + args.type);
    args.orderKeys = args.order.split(',').map(function (k) { return k.trim(); });
    args.orderKeys.forEach(function (k) {
      if (PITCH_CLASSES.indexOf(k) === -1) {
        fail('unknown key "' + k + '" in --order (use flat spellings: ' + PITCH_CLASSES.join(' ') + ')');
      }
    });
  }
  if (args.suffix && !/^[A-Za-z0-9-]+$/.test(args.suffix)) {
    fail('--suffix must be letters/digits/dashes only');
  }
  return args;
}

/* =========================================================================
   Pitch math
   ========================================================================= */

function noteFreq(pcIndex, octave) {
  const semisFromA4 = (octave * 12 + pcIndex) - 57; // A4 = 57 semitones above C0
  return 440 * Math.pow(2, semisFromA4 / 12);
}

// The fixed chromatic order for --type notes: C3, Db3, … B5.
const NOTE_RUN = [];
for (let oct = 3; oct <= 5; oct++) {
  for (let pc = 0; pc < 12; pc++) {
    NOTE_RUN.push({ name: PITCH_CLASSES[pc] + oct, pc: pc, freq: noteFreq(pc, oct) });
  }
}

function centsBetween(f, ref) {
  return 1200 * Math.log2(f / ref);
}

function nearestNoteName(f) {
  const semis = Math.round(12 * Math.log2(f / 440)); // from A4
  const fromC0 = semis + 57;
  const name = PITCH_CLASSES[((fromC0 % 12) + 12) % 12] + Math.floor(fromC0 / 12);
  return { name: name, cents: centsBetween(f, 440 * Math.pow(2, semis / 12)) };
}

// Cents from f to the NEAREST octave of a pitch class (root check, any octave).
function centsToPitchClass(f, pcIndex) {
  const semisFromC0 = 12 * Math.log2(f / 440) + 57;
  const rel = semisFromC0 - pcIndex;
  return (rel - Math.round(rel / 12) * 12) * 100;
}

// The root of a standard-voicing take is the BASS: the lowest peak that
// genuinely rings. Neither "strongest peak" (real pianos often ring the fifth
// louder — it's the low root's 3rd harmonic) nor "expected pitch class present
// anywhere" (a C chord contains a real G, and deep partials brush every pitch
// class — the 9th harmonic of C is a D) can tell roots apart. The lowest
// strongly-ringing peak can, because the guide's voicing puts the root lowest.
function bassPeak(peaks) {
  if (!peaks || peaks.length === 0) return null;
  const floor = peaks[0].mag * 0.08;
  let lowest = null;
  for (let i = 0; i < peaks.length; i++) {
    const p = peaks[i];
    if (p.mag >= floor && p.freq <= 1000 && (!lowest || p.freq < lowest.freq)) lowest = p;
  }
  return lowest || peaks[0];
}

// WARN-only sanity net for chord segments: a prominent low peak whose pitch
// class is outside the expected major triad (root, 3rd, 5th) suggests a wrong
// chord or wrong quality. Never a FAIL — high piano partials are inharmonic.
function oddChordTone(peaks, rootPc, tolCents) {
  const chordPcs = [rootPc % 12, (rootPc + 4) % 12, (rootPc + 7) % 12];
  const low = peaks.filter(function (p) { return p.freq < 500; }).slice(0, 3);
  for (let i = 0; i < low.length; i++) {
    const inChord = chordPcs.some(function (pc) {
      return Math.abs(centsToPitchClass(low[i].freq, pc)) <= tolCents;
    });
    if (!inChord) return nearestNoteName(low[i].freq);
  }
  return null;
}

/* =========================================================================
   WAV in / WAV out (chunk-walking parser — JUNK/bext/etc. are skipped)
   ========================================================================= */

function parseWav(file) {
  const b = fs.readFileSync(file);
  if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file');
  }
  let pos = 12, fmt = null, dataOff = -1, dataLen = 0;
  while (pos + 8 <= b.length) {
    const id = b.toString('ascii', pos, pos + 4);
    let size = b.readUInt32LE(pos + 4);
    if (pos + 8 + size > b.length) size = b.length - pos - 8; // tolerate a truncated final chunk
    if (id === 'fmt ') {
      fmt = {
        format: b.readUInt16LE(pos + 8),
        channels: b.readUInt16LE(pos + 10),
        sampleRate: b.readUInt32LE(pos + 12),
        bitsPerSample: b.readUInt16LE(pos + 22),
      };
    } else if (id === 'data') {
      dataOff = pos + 8;
      dataLen = size;
    }
    pos += 8 + size + (size % 2); // chunks are word-aligned
  }
  if (!fmt || dataOff < 0) throw new Error('missing fmt/data chunk');
  if (fmt.format !== 1 && fmt.format !== 0xFFFE) {
    throw new Error('unsupported WAV format tag ' + fmt.format + ' (need PCM)');
  }
  if (fmt.bitsPerSample !== 16 && fmt.bitsPerSample !== 24) {
    throw new Error('unsupported bit depth ' + fmt.bitsPerSample + ' (need 16 or 24)');
  }
  if (fmt.channels !== 1 && fmt.channels !== 2) {
    throw new Error('unsupported channel count ' + fmt.channels + ' (need mono or stereo)');
  }
  const bytesPer = fmt.bitsPerSample / 8;
  const frames = Math.floor(dataLen / (bytesPer * fmt.channels));
  const mono = new Float64Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < fmt.channels; c++) {
      sum += readSample(b, dataOff + (i * fmt.channels + c) * bytesPer, fmt.bitsPerSample);
    }
    mono[i] = sum / fmt.channels;
  }
  return { fmt: fmt, frames: frames, mono: mono, buf: b, dataOff: dataOff, bytesPer: bytesPer };
}

function readSample(b, off, bits) {
  if (bits === 16) return b.readInt16LE(off) / 32768;
  let v = b[off] | (b[off + 1] << 8) | (b[off + 2] << 16);
  if (v & 0x800000) v -= 0x1000000;
  return v / 8388608;
}

function extractChannels(parsed, fromSample, toSample) {
  const fmt = parsed.fmt;
  const out = [];
  for (let c = 0; c < fmt.channels; c++) out.push(new Float64Array(toSample - fromSample));
  for (let i = fromSample; i < toSample; i++) {
    for (let c = 0; c < fmt.channels; c++) {
      out[c][i - fromSample] = readSample(parsed.buf, parsed.dataOff + (i * fmt.channels + c) * parsed.bytesPer, fmt.bitsPerSample);
    }
  }
  return out;
}

function writeWav16(file, channels, sr, chanData) {
  const frames = chanData[0].length;
  const buf = Buffer.alloc(44 + frames * channels * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + frames * channels * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * channels * 2, 28); buf.writeUInt16LE(channels * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(frames * channels * 2, 40);
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, chanData[c][i]));
      buf.writeInt16LE(Math.round(v * 32767), 44 + (i * channels + c) * 2);
    }
  }
  fs.writeFileSync(file, buf);
}

/* =========================================================================
   Envelope, segmentation, onsets
   ========================================================================= */

function frameEnvelope(mono, sr) {
  const flen = Math.max(1, Math.floor(sr * FRAME_MS / 1000));
  const n = Math.floor(mono.length / flen);
  const e = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < flen; j++) { const v = mono[i * flen + j]; s += v * v; }
    e[i] = Math.sqrt(s / flen);
  }
  return { e: e, flen: flen };
}

function maxOf(arr, from, to) {
  let m = 0;
  const end = to === undefined ? arr.length : Math.min(to, arr.length);
  for (let i = from || 0; i < end; i++) if (arr[i] > m) m = arr[i];
  return m;
}

// Items = runs of frames above the noise floor. Gaps shorter than MIN_GAP_SEC
// (e.g. the space between the chords INSIDE one cadence) do not split; only
// the long between-item silences do.
function findSegments(env, flen) {
  const e = env.e;
  const thr = NOISE_FLOOR * maxOf(e);
  const minGapFrames = Math.round(MIN_GAP_SEC * 1000 / FRAME_MS);
  const minItemFrames = Math.round(MIN_ITEM_SEC * 1000 / FRAME_MS);
  const segs = [];
  let cur = null;
  let silentRun = 0;
  for (let i = 0; i < e.length; i++) {
    if (e[i] >= thr) {
      if (!cur) cur = { startFrame: i, endFrame: i };
      else cur.endFrame = i;
      silentRun = 0;
    } else if (cur) {
      silentRun += 1;
      if (silentRun >= minGapFrames) {
        segs.push(cur);
        cur = null;
        silentRun = 0;
      }
    }
  }
  if (cur) segs.push(cur);
  return segs
    .filter(function (s) { return s.endFrame - s.startFrame + 1 >= minItemFrames; })
    .map(function (s) {
      return { startSample: s.startFrame * flen, endSample: (s.endFrame + 1) * flen };
    });
}

// First sample above 3% of the segment's local peak — the item's true onset.
function onsetIn(mono, startSample, endSample) {
  let localMax = 0;
  for (let i = startSample; i < endSample; i++) {
    const a = Math.abs(mono[i]);
    if (a > localMax) localMax = a;
  }
  const thr = 0.03 * localMax;
  for (let i = startSample; i < endSample; i++) {
    if (Math.abs(mono[i]) > thr) return i;
  }
  return startSample;
}

// Chord/note onsets INSIDE a range: frame-energy jumps, ≥0.28s apart.
// opts.jumpRatio (default 2.2) is the energy-jump sensitivity — a lower
// ratio hears an attack landing on top of a still-ringing previous note.
function internalOnsets(mono, sr, startSample, endSample, opts) {
  const jumpRatio = (opts && opts.jumpRatio) || 2.2;
  const floorFrac = (opts && opts.floorFrac) || 0.12;
  const lead = Math.max(0, startSample - Math.floor(0.2 * sr)); // include silence before chord 1
  const slice = mono.subarray(lead, endSample);
  const env = frameEnvelope(slice, sr);
  const e = env.e;
  const peak = maxOf(e);
  const onsets = [];
  let last = -Infinity;
  for (let i = 2; i < e.length; i++) {
    const prev = Math.max(e[i - 2], e[i - 1], 1e-6);
    if (e[i] > floorFrac * peak && e[i] / prev > jumpRatio && (i * env.flen - last) > 0.28 * sr) {
      onsets.push(i * env.flen);
      last = i * env.flen;
    }
  }
  // refine each onset back to the first sample above 3% of its local max
  return onsets.map(function (o) {
    let localMax = 0;
    const stop = Math.min(o + Math.floor(0.2 * sr), slice.length);
    for (let i = o; i < stop; i++) localMax = Math.max(localMax, Math.abs(slice[i]));
    let s = o;
    while (s > 0 && Math.abs(slice[s]) > 0.03 * localMax) s--;
    return lead + s;
  });
}

/* =========================================================================
   FFT pitch measurement (Hann window, parabolic peak interpolation)
   ========================================================================= */

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1, cwi = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j], ui = im[i + j];
        const vr = re[i + j + len / 2] * cwr - im[i + j + len / 2] * cwi;
        const vi = re[i + j + len / 2] * cwi + im[i + j + len / 2] * cwr;
        re[i + j] = ur + vr; im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
        const nwr = cwr * wr - cwi * wi; cwi = cwr * wi + cwi * wr; cwr = nwr;
      }
    }
  }
}

// Prominent spectral peaks between loHz and hiHz over [from, to), strongest
// first. Hann-windowed, zero-padded to N, sub-bin accuracy via log-parabola.
function spectrumPeaks(mono, sr, from, to, loHz, hiHz) {
  const N = 1 << 15; // 32768 — sub-cent resolution with interpolation
  const avail = Math.min(to, mono.length) - from;
  const L = Math.min(N, avail);
  if (L < Math.floor(0.15 * sr)) return null; // too short to measure
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < L; i++) {
    const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (L - 1)); // Hann
    re[i] = mono[from + i] * w;
  }
  fft(re, im);
  const half = N / 2;
  const mag = new Float64Array(half);
  for (let i = 0; i < half; i++) mag[i] = Math.hypot(re[i], im[i]);
  const hzPerBin = sr / N;
  const lo = Math.max(1, Math.ceil(loHz / hzPerBin));
  const hi = Math.min(half - 2, Math.floor(hiHz / hzPerBin));
  const maxMag = maxOf(mag, lo, hi + 1);
  if (maxMag <= 0) return null;
  const peaks = [];
  for (let i = lo + 1; i < hi; i++) {
    if (mag[i] > mag[i - 1] && mag[i] > mag[i + 1] && mag[i] > 0.03 * maxMag) {
      const a = Math.log(mag[i - 1] + 1e-12), b0 = Math.log(mag[i] + 1e-12), c = Math.log(mag[i + 1] + 1e-12);
      const denom = a - 2 * b0 + c;
      const delta = denom !== 0 ? 0.5 * (a - c) / denom : 0;
      peaks.push({ freq: (i + delta) * hzPerBin, mag: mag[i] });
      i += 2;
    }
  }
  peaks.sort(function (x, y) { return y.mag - x.mag; });
  return peaks;
}

// Dominant fundamental: the strongest peak, unless a substantial peak sits
// at 1/2 or 1/3 of it (real piano notes can carry more energy in a harmonic
// than in the fundamental).
function pickFundamental(peaks) {
  if (!peaks || peaks.length === 0) return null;
  const top = peaks[0];
  let best = top;
  [2, 3].forEach(function (div) {
    const target = top.freq / div;
    if (target < 40) return;
    for (let i = 0; i < peaks.length; i++) {
      const p = peaks[i];
      if (Math.abs(centsBetween(p.freq, target)) < 60 && p.mag > 0.18 * top.mag) {
        if (p.freq < best.freq) best = p;
        break;
      }
    }
  });
  return best;
}

/* =========================================================================
   Main
   ========================================================================= */

const args = parseArgs(process.argv.slice(2));
const parsed = parseWav(args.input);
const sr = parsed.fmt.sampleRate;
const mono = parsed.mono;

console.log('Parsed ' + path.basename(args.input) + ': ' + sr + ' Hz, ' +
  parsed.fmt.channels + ' ch, ' + parsed.fmt.bitsPerSample + '-bit, ' +
  (parsed.frames / sr).toFixed(1) + 's');

// Notes-type takes split at note ONSETS, not silences: single notes have a
// sharp attack every time, but the gaps between them don't survive real
// playing — pacing tightens as a take settles in, and pedal ring fills
// whatever gap remains. (Silence still segments contexts/cadences, where
// internal chord changes must NOT split an item.)
let segments;
if (args.type === 'notes') {
  let onsets = internalOnsets(mono, sr, 0, mono.length).filter(function (o, i, all) {
    return i === 0 || o - all[i - 1] >= Math.floor(0.8 * sr); // notes come slower than 0.8s
  });
  // Rescue pass: a note struck over the previous note's ring makes a gentle
  // energy jump the first pass can miss — visible as a segment much longer
  // than its neighbors. Re-scan only those stretches with higher sensitivity.
  if (onsets.length < NOTE_RUN.length && onsets.length > 2) {
    const gaps = onsets.slice(1).map(function (o, i) { return o - onsets[i]; }).sort(function (a, b) { return a - b; });
    const medianGap = gaps[Math.floor(gaps.length / 2)];
    const rescued = [];
    onsets.forEach(function (o, i) {
      rescued.push(o);
      const end = i + 1 < onsets.length ? onsets[i + 1] : Math.min(o + Math.floor(4 * sr), mono.length);
      if (end - o > 1.6 * medianGap) {
        internalOnsets(mono, sr, o + Math.floor(0.4 * sr), end - Math.floor(0.2 * sr), { jumpRatio: 1.45, floorFrac: 0.08 })
          .forEach(function (extra) {
            if (extra - o >= Math.floor(0.8 * sr) && end - extra >= Math.floor(0.5 * sr)) rescued.push(extra);
          });
      }
    });
    onsets = rescued.sort(function (a, b) { return a - b; }).filter(function (o, i, all) {
      return i === 0 || o - all[i - 1] >= Math.floor(0.6 * sr);
    });
  }
  // End each note at the TROUGH before the next attack — the quietest 5ms in
  // the window leading up to the next onset. Onset estimates run a frame or
  // two late (energy jumps are detected after the attack has begun), so any
  // fixed "N ms before the onset" cut can land after the next hammer strike
  // and leak its attack into this note's tail. The trough can't.
  function troughBefore(nextOnset) {
    const hop = Math.floor(0.005 * sr);
    const from = Math.max(0, nextOnset - Math.floor(0.35 * sr));
    const to = nextOnset - Math.floor(0.01 * sr);
    let best = to, bestRms = Infinity;
    for (let s = from; s + hop <= to; s += hop) {
      let sum = 0;
      for (let j = 0; j < hop; j++) sum += mono[s + j] * mono[s + j];
      const rms = Math.sqrt(sum / hop);
      if (rms < bestRms) { bestRms = rms; best = s; }
    }
    return best;
  }
  segments = onsets.map(function (o, i) {
    const end = i + 1 < onsets.length
      ? troughBefore(onsets[i + 1])
      : Math.min(o + Math.floor(4 * sr), mono.length);
    return { startSample: Math.max(0, o - Math.floor(0.02 * sr)), endSample: end };
  });
} else {
  const env = frameEnvelope(mono, sr);
  segments = findSegments(env, env.flen).map(function (s) {
    return { startSample: s.startSample, endSample: Math.min(s.endSample, mono.length) };
  });
}

// Expected items
let expected; // [{ name, ... }] per item, or null entries in mismatch mode
if (args.type === 'notes') {
  expected = NOTE_RUN;
} else {
  expected = args.orderKeys.map(function (k) { return { name: k, pc: PITCH_CLASSES.indexOf(k) }; });
}

const countOk = segments.length === expected.length;
console.log('Found ' + segments.length + ' segment(s); expected ' + expected.length +
  (countOk ? ' — OK' : ' — MISMATCH'));
if (!countOk) {
  console.log('');
  console.log('!! Segment count does not match. Writing what was found as segment-NN.wav');
  console.log('!! with measured pitches, so you can spot the missing / extra item and');
  console.log('!! re-record. No manifest fragment will be printed.');
}

fs.mkdirSync(args.out, { recursive: true });

function outName(index) {
  if (!countOk) return 'segment-' + String(index + 1).padStart(2, '0') + '.wav';
  const item = expected[index];
  const tag = args.suffix ? '-' + args.suffix : '';
  if (args.type === 'notes') return 'note-' + item.name + tag + '.wav';
  if (args.type === 'contexts') return 'context-' + item.name + tag + '.wav';
  return 'cadence-' + item.name + tag + '.wav';
}

// Trim, fade, write each segment; measure everything for the report.
const results = [];
segments.forEach(function (seg, idx) {
  const onset = onsetIn(mono, seg.startSample, seg.endSample);
  const outStart = Math.max(0, onset - Math.floor(PRE_ROLL_SEC * sr));
  // Silence-split segments (contexts/cadences) end where energy dropped below
  // the noise floor, so padding restores the decay the threshold clipped.
  // Onset-split segments (notes) already end at the trough before the next
  // attack — padding them would leak that attack into this file's tail.
  const tailPad = args.type === 'notes' ? 0 : Math.floor(TAIL_PAD_SEC * sr);
  const outEnd = Math.min(mono.length, seg.endSample + tailPad);
  const chans = extractChannels(parsed, outStart, outEnd);
  const fadeIn = Math.floor(FADE_IN_SEC * sr), fadeOut = Math.floor(FADE_OUT_SEC * sr);
  for (let c = 0; c < chans.length; c++) {
    const ch = chans[c];
    for (let i = 0; i < fadeIn && i < ch.length; i++) ch[i] *= i / fadeIn;
    for (let i = 0; i < fadeOut && i < ch.length; i++) ch[ch.length - 1 - i] *= i / fadeOut;
  }
  const fileName = outName(idx);
  writeWav16(path.join(args.out, fileName), parsed.fmt.channels, sr, chans);

  const r = {
    index: idx,
    file: fileName,
    durationSec: chans[0].length / sr,
    status: 'PASS',
    detail: '',
  };

  if (args.type === 'cadences') {
    // Internal chord onsets + final-chord root + noteAt.
    const onsets = internalOnsets(mono, sr, seg.startSample, seg.endSample);
    r.onsetCount = onsets.length;
    const finalOnset = onsets.length > 0 ? onsets[onsets.length - 1] : onset;
    r.finalOnsetSec = (finalOnset - outStart) / sr;
    r.noteAt = Math.round((r.finalOnsetSec + NOTE_AT_AFTER_FINAL) * 10) / 10;
    const peaks = spectrumPeaks(mono, sr, finalOnset + Math.floor(0.15 * sr), seg.endSample, 45, 2200);
    if (peaks.length === 0) {
      r.status = 'FAIL';
      r.detail = 'could not measure the final chord (too short or too quiet)';
    } else {
      const item = countOk ? expected[idx] : null;
      const bass = bassPeak(peaks);
      const near = nearestNoteName(bass.freq);
      r.measured = bass.freq;
      r.measuredNote = near.name;
      if (item) {
        r.cents = centsToPitchClass(bass.freq, item.pc);
        if (Math.abs(r.cents) > CENTS_TOLERANCE) {
          r.status = 'FAIL';
          r.detail = 'final chord bass reads as ' + near.name + ' (' + fmtCents(near.cents) +
            '), not ' + item.name;
        } else {
          const odd = oddChordTone(peaks, item.pc, CENTS_TOLERANCE);
          if (r.onsetCount !== CADENCE_ONSETS_EXPECTED) {
            r.status = 'WARN';
            r.detail = 'heard ' + r.onsetCount + ' chord onsets (expected ' + CADENCE_ONSETS_EXPECTED + ')';
          } else if (odd) {
            r.status = 'WARN';
            r.detail = 'prominent ' + odd.name + ' in the final chord — double-check the chord/quality';
          }
        }
      }
    }
  } else {
    // Single measurement window over the sustain.
    const peaks = spectrumPeaks(mono, sr, onset + Math.floor(0.1 * sr), seg.endSample, 45, 2200);
    if (args.type === 'notes') {
      const fund = pickFundamental(peaks);
      if (!fund) {
        r.status = 'FAIL';
        r.detail = 'could not measure a fundamental (too short or too quiet)';
      } else {
        r.measured = fund.freq;
        const near = nearestNoteName(fund.freq);
        r.measuredNote = near.name;
        if (countOk) {
          const item = expected[idx];
          r.cents = centsBetween(fund.freq, item.freq);
          if (Math.abs(r.cents) > CENTS_TOLERANCE) {
            // Low piano notes often ring the 2nd harmonic louder than the
            // fundamental. If the "fundamental" we picked is the octave above
            // the expected note AND the true fundamental is present among the
            // peaks, the note is correct.
            const octaveUp = Math.abs(centsBetween(fund.freq, item.freq * 2)) <= CENTS_TOLERANCE;
            const trueFund = peaks.find(function (p) {
              return Math.abs(centsBetween(p.freq, item.freq)) <= CENTS_TOLERANCE;
            });
            if (octaveUp && trueFund) {
              r.measured = trueFund.freq;
              r.measuredNote = nearestNoteName(trueFund.freq).name;
              r.cents = centsBetween(trueFund.freq, item.freq);
            } else {
              r.status = 'FAIL';
              r.detail = 'sounds like ' + near.name + ' (' + fmtCents(near.cents) + '), expected ' + item.name;
            }
          }
        }
      }
    } else { // contexts
      if (!peaks || peaks.length === 0) {
        r.status = 'FAIL';
        r.detail = 'no measurable peaks (too short or too quiet)';
      } else {
        const bass = bassPeak(peaks);
        const near = nearestNoteName(bass.freq);
        r.measured = bass.freq;
        r.measuredNote = near.name;
        if (countOk) {
          const item = expected[idx];
          r.cents = centsToPitchClass(bass.freq, item.pc);
          if (Math.abs(r.cents) > CENTS_TOLERANCE) {
            r.status = 'FAIL';
            r.detail = 'chord bass reads as ' + near.name + ' (' + fmtCents(near.cents) +
              '), not a ' + item.name + ' root';
          } else {
            const odd = oddChordTone(peaks, item.pc, CENTS_TOLERANCE);
            if (odd) {
              r.status = 'WARN';
              r.detail = 'prominent ' + odd.name + ' in this chord — double-check the chord/quality';
            }
          }
        }
      }
    }
  }
  results.push(r);
});

/* =========================================================================
   Report
   ========================================================================= */

function fmtCents(c) {
  return (c >= 0 ? '+' : '') + c.toFixed(1) + '¢';
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

console.log('');
results.forEach(function (r, i) {
  const parts = [
    pad((i + 1) + '/' + expected.length, 6),
    pad(r.file, args.type === 'notes' ? 18 : 22),
    pad(r.durationSec.toFixed(2) + 's', 7),
  ];
  if (countOk) {
    const item = expected[i];
    if (args.type === 'notes') {
      parts.push(pad('expect ' + item.name + ' ' + item.freq.toFixed(2) + ' Hz', 22));
    } else if (args.type === 'contexts') {
      parts.push(pad('expect root ' + item.name, 15));
    } else {
      parts.push(pad('expect key ' + item.name, 14));
    }
  }
  if (args.type === 'cadences') {
    parts.push(pad('onsets ' + (r.onsetCount === undefined ? '?' : r.onsetCount) +
      '/' + CADENCE_ONSETS_EXPECTED, 10));
    if (r.finalOnsetSec !== undefined) {
      parts.push(pad('final @ ' + r.finalOnsetSec.toFixed(2) + 's', 15));
    }
  }
  if (r.measured !== undefined) {
    parts.push(pad('measured ' + r.measured.toFixed(2) + ' Hz ≈ ' + r.measuredNote, 27));
  }
  if (r.cents !== undefined) parts.push(pad(fmtCents(r.cents), 8));
  parts.push(countOk ? r.status : '');
  const line = '  ' + parts.join(' ').replace(/\s+$/, '');
  console.log(line + (r.detail ? '\n         ↳ ' + r.detail : ''));
});

console.log('');
const fails = results.filter(function (r) { return r.status === 'FAIL'; });
const warns = results.filter(function (r) { return r.status === 'WARN'; });

if (!countOk) {
  console.log('Result: SEGMENT COUNT MISMATCH — found ' + segments.length + ', expected ' +
    expected.length + '. Compare the measured pitches above with your recording');
  console.log('order to spot which item is missing, merged, or extra, then re-record the take.');
  process.exit(1);
}

if (fails.length > 0) {
  console.log('Result: ' + fails.length + ' of ' + results.length + ' segment(s) FAILED verification — re-record: ' +
    fails.map(function (r) { return expected[r.index].name; }).join(', '));
} else if (warns.length > 0) {
  console.log('Result: all pitches verified; ' + warns.length + ' warning(s) above worth a listen.');
} else {
  console.log('Result: all ' + results.length + ' segments verified. ✓');
}

/* ---- Ready-to-paste manifest fragment ------------------------------------ */

function manifestFileName(wavName) {
  return wavName.replace(/\.wav$/i, '.m4a');
}

console.log('');
console.log('Manifest fragment for games/degree-detective/audio/manifest.json');
console.log('(filenames assume you convert the WAVs to .m4a — e.g. afconvert -f m4af -d aac;');
console.log(' if you ship the .wav files themselves, keep the .wav extension):');
console.log('');

if (args.type === 'notes') {
  const lines = results.map(function (r, i) {
    return '    "' + expected[i].name + '": "' + manifestFileName(r.file) + '"';
  });
  console.log('  "notes": {\n' + lines.join(',\n') + '\n  }');
} else if (args.type === 'contexts') {
  const lines = results.map(function (r, i) {
    return '    "' + expected[i].name + '": "' + manifestFileName(r.file) + '"';
  });
  console.log('  "contexts": {\n' + lines.join(',\n') + '\n  }');
  if (args.suffix) {
    console.log('');
    console.log('(These are extra variants — in the manifest, turn each key\'s entry into an');
    console.log(' array holding the existing file AND the new one, e.g.');
    console.log(' "C": ["context-C.m4a", "' + manifestFileName(results[0].file) + '"].)');
  }
} else {
  const lines = results.map(function (r, i) {
    return '    "' + expected[i].name + '": { "file": "' + manifestFileName(r.file) +
      '", "noteAt": ' + r.noteAt + ' }';
  });
  console.log('  "cadences": {\n' + lines.join(',\n') + '\n  }');
  if (args.suffix) {
    console.log('');
    console.log('(These are extra variants — in the manifest, turn each key\'s entry into an');
    console.log(' array holding the existing entry AND the new one.)');
  }
}

process.exit(fails.length > 0 ? 1 : 0);
