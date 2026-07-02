# Recording guide — the Key Change audio program

This is the complete recording plan for turning the synthesized ear-training
audio into real piano, phase by phase. Every file you record slots into a
tested pipeline: you hand me raw takes, I trim, loudness-match, encode, wire
the manifest, and deploy. You never touch code or file plumbing.

**Work the phases in order.** Each one is immediately useful on its own, and
Phase 0 exists so you never record 20+ takes before hearing how one sounds in
the actual game.

| Phase | What | Files | Est. time | Status |
|---|---|---|---|---|
| 0 | Pilot: key of C only | 2 | ~15 min | **Game is live — works today** |
| 1 | All remaining major keys | 22 | ~1–1.5 h | **Works today** |
| 2 | Minor keys | 24 | ~1–1.5 h | Unlocks minor mode (small build on my side) |
| 3 | Chord qualities | 28 starter / 84 full | ~1 h / ~2.5 h | Unlocks a new chord-ID game (I'll build it) |
| 4 | Single piano notes | 36 | ~45 min | Unlocks all-piano mode + future dictation |
| 5 | Progressions | TBD | — | Future module — let's design it together first |

---

## The four non-negotiables

1. **Tune to A = 440.** The mystery notes and all other game audio are
   synthesized in equal temperament at A440. If your acoustic piano sits even
   slightly off, every round will sound subtly sour against the synth note. A
   digital piano or piano VST is guaranteed correct and is the safest source.
   If you record acoustic, have it tuned first and check with a tuner app.
2. **Block chords, no rolling.** All voices land together in one clean attack.
   A rolled chord smears the moment the harmony starts, which the game times
   against.
3. **Same voicing and register every time.** Left hand: the root as an octave
   (for C major, roughly the two Cs below middle C). Right hand: the
   close-position chord just below middle C. Mezzo-forte, sustain pedal down,
   let it ring.
4. **One phase, one sitting.** Same instrument, same mic position or patch,
   same level. Consistency across a phase matters more than absolute quality —
   one key sounding different from its neighbors is what players notice.

Also: leave ~half a second of silence before each attack, let every chord decay
naturally, and don't fade or trim anything yourself — I do precise trims on my
end. Don't stress exact durations; the targets below have slack built in.

## File format

- **WAV, 44.1 or 48 kHz, 16- or 24-bit, mono or stereo.** (High-bitrate M4A/MP3
  ≥192 kbps is acceptable if WAV is awkward, but WAV masters are preferred — I
  encode the web copies and you keep the originals for any future re-master.)
- One musical item per file.
- Name files as listed below if convenient — but a folder labeled with the
  phase and any consistent naming is fine; I'll rename.
- Flat spellings everywhere: `Db Eb Gb Ab Bb` (never `C#`, `F#`, etc.).
- Delivery: zip or folder via anything (AirDrop, Drive, straight into the repo
  under `games/degree-detective/audio/` if you like). I take it from there.

---

## Phase 0 — pilot (do this first)

Record just these two, send them, and I'll have them live the same day. Play a
few rounds on the real site, and only continue to Phase 1 once the register,
length, and tone feel right to your ear. Adjusting after 2 files is trivial;
after 24, it's a re-record.

- [ ] `context-C.wav` — sustained C major chord: one clean block attack, pedal,
      ring **3–4 s**. (The game drops the mystery note in 1.1 s after your
      attack, so the chord must still be singing well past that.)
- [ ] `cadence-C.wav` — **I–IV–V–I** in C (C–F–G–C): first three chords steady
      at about one per **0.7 s**, then hold the final C chord **at least as
      long as the first three took combined** (~2.5–3 s). The game plays the
      mystery note just past the halfway point of the file, which with this
      shape lands right on your sustained final chord.

## Phase 1 — the other 11 major keys (works today)

Same two recordings per key. Contexts first (all 12 done = Chord mode fully
real), then cadences.

**Contexts** — sustained tonic major chord, 3–4 s:

- [ ] `context-Db.wav`
- [ ] `context-D.wav`
- [ ] `context-Eb.wav`
- [ ] `context-E.wav`
- [ ] `context-F.wav`
- [ ] `context-Gb.wav`
- [ ] `context-G.wav`
- [ ] `context-Ab.wav`
- [ ] `context-A.wav`
- [ ] `context-Bb.wav`
- [ ] `context-B.wav`

**Cadences** — I–IV–V–I, final chord held:

- [ ] `cadence-Db.wav`
- [ ] `cadence-D.wav`
- [ ] `cadence-Eb.wav`
- [ ] `cadence-E.wav`
- [ ] `cadence-F.wav`
- [ ] `cadence-Gb.wav`
- [ ] `cadence-G.wav`
- [ ] `cadence-Ab.wav`
- [ ] `cadence-A.wav`
- [ ] `cadence-Bb.wav`
- [ ] `cadence-B.wav`

## Phase 2 — minor keys (unlocks minor mode)

Once these exist I'll add a major/minor toggle to Degree Detective — the game
logic is a small, planned extension; your audio contract doesn't change.

- **Minor contexts** (12): sustained tonic **minor** chord, same voicing rules.
  `context-Cm.wav`, `context-Dbm.wav`, … `context-Bm.wav`
- **Minor cadences** (12): **i–iv–V–i** — note the **V stays major** (harmonic
  minor cadence; in C minor that's Cm–Fm–G–Cm). Same shape as the major
  cadences: three steady chords, hold the final one.
  `cadence-Cm.wav`, … `cadence-Bm.wav`

## Phase 3 — chord qualities (new game: "name that chord")

A future module: a chord plays, the player names its quality. Seven qualities,
one block chord per file, ~3 s ring, root position, same register rules:

**major · minor · diminished · augmented · dominant 7 · major 7 · minor 7**

- **Starter set (28 files):** all 7 qualities on just four roots — **C, Eb, Gb,
  A**. The game pitch-shifts ±1 semitone to cover all 12 roots with no audible
  quality loss, so this small set makes the whole module real.
  Naming: `quality-C-maj.wav`, `quality-C-min.wav`, `quality-C-dim.wav`,
  `quality-C-aug.wav`, `quality-C-dom7.wav`, `quality-C-maj7.wav`,
  `quality-C-min7.wav`, then the same seven for Eb, Gb, A.
- **Full set (84 files):** the same 7 qualities on all 12 roots — zero
  pitch-shifting, maximum fidelity. Worth doing eventually; not needed to
  launch the module.

## Phase 4 — single piano notes (all-piano mode + dictation)

36 chromatic notes, **C3 up to B5** (the C an octave below middle C, up to the
B nearly two octaves above it). One note per file, mezzo-forte, pedal, ~2.5–3 s
ring. **Consistent velocity across all 36 is the whole challenge here** — on a
digital piano, consider fixing velocity in the patch settings.

Naming: `note-C3.wav`, `note-Db3.wav`, … `note-B5.wav`.

Unlocks: an advanced Degree Detective mode where the mystery note is real piano
too (same-timbre listening — harder and closer to real music), and it's the
raw material for a future melodic-dictation game.

## Phase 5 — progression recognition (later)

Hearing I–V–vi–IV vs. I–vi–IV–V etc. is a natural next module, but the useful
progression list and key coverage deserve a design conversation before you
record anything. Nothing to do yet.

---

## What happens after you hand me files

1. I trim silence to put each attack exactly where the game expects it.
2. I loudness-match everything in the batch so no key or chord jumps out.
3. I encode web copies, write the manifest, verify in the browser (the whole
   pipeline was smoke-tested end-to-end before this guide was written), commit,
   and deploy.
4. You play it on the live site and tell me what to adjust.
