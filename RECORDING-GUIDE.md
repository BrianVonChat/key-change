# Recording guide — the Key Change audio program

The complete recording plan for turning the synthesized ear-training audio into real
piano. You hand me raw takes; I split, trim, pitch-verify, loudness-match, encode,
wire the manifests, and deploy. You never bounce individual files or name anything.

**Status: Phase 0 (pilot) is shipped and approved.** Your piano measured −2.5 cents
from A440 — green light, no compensation needed.

| Take | What | Playing time | Why / unlocks |
|---|---|---|---|
| ✅ Pilot | C major context + cadence | done | Live on the site now |
| 1 | Note pack: 36 chromatic singles, C3→B5 | ~8 min | **Replaces the synth mystery-note sound everywhere, all 12 keys, immediately** |
| 2 | Major contexts: 12 chords, C→B chromatic | ~5 min | Chord mode fully real piano |
| 3 | Major cadences: 12 cadences, C→B | ~8 min | Cadence mode fully real piano |
| 4+ | Variation pilots on C (inversions, voicings, broken) | ~5 min | Taste-test before mass-recording variations |
| later | Variation sets across keys · minor keys · chord qualities | — | Minor mode, chord-ID game, richer variety |

---

## The one-take protocol (no more bouncing)

Each batch above is **one continuous recording, bounced once, named anything you
like.** Play the items in the listed order and leave **about 2 seconds of clear
silence between items** — that's the whole discipline. A splitter tool cuts the take
at the silences, trims each item, and **pitch-verifies every segment against what it
expects** (so if you skip a note or play D♭ twice, the report says "segment 14
expected A3, measured B♭3" and you re-record just that item, not the take).

For cadence takes, the gaps between chords *within* one cadence are short and
musical; only the 2-second gaps between *cadences* mark the cuts — so play
naturally, at any tempo. The final-chord timing of each cadence is measured per
file automatically.

## The four non-negotiables

1. **Tune to A = 440.** (Your piano passed — re-verify with a tuner app after the
   next tuning visit or big weather swing.)
2. **Block chords, no rolling** — except, of course, in deliberately broken/arpeggiated
   variation takes.
3. **Same core voicing for the standard sets.** Left hand: root octave below middle C.
   Right hand: close-position chord just below middle C. Mezzo-forte, pedal, let ring.
   (Variation takes intentionally break this rule — that's their job.)
4. **One take, one sitting** — same instrument, mic position, and level within a take.

Leave ~2s of silence at the very start of a take too, and let the last item ring out
fully before stopping the recorder.

## Format and delivery

- **WAV, 44.1 or 48 kHz, 16- or 24-bit, mono or stereo.** One file per take, named
  whatever makes sense to you ("major contexts take 2.wav" is perfect).
- Drop takes in the usual iCloud folder (`audio samples for ear training/`) — a
  subfolder per batch keeps it tidy as this grows. Say the word and I'll take it
  from there.

---

## Take 1 — the note pack (record this first)

**36 single notes, chromatic from C3 up to B5** (the C an octave below middle C,
rising to the B nearly two octaves above middle C). One note every ~3 seconds:
strike, let it sing for a couple of seconds, 2s gap, next note.

- Mezzo-forte, pedal, **as consistent a velocity as you can manage** — evenness
  across the 36 is the entire challenge of this take.
- Why first: these notes replace the synthesized mystery-note sound in every round,
  every key, both modes — including the resolution walk-home and the wrong-answer
  comparison. It's the biggest audible upgrade per minute of playing, and it doesn't
  wait on any other take.

## Takes 2 and 3 — major contexts and cadences

- **Take 2 — contexts:** 12 sustained tonic major chords, chromatic order
  C, D♭, D, E♭, E, F, G♭, G, A♭, A, B♭, B. Standard voicing, ring 3–4s each, 2s gaps.
- **Take 3 — cadences:** 12 I–IV–V–I cadences, same chromatic order, any musical
  tempo, hold each final chord ~3s, 2s gaps between cadences.

## Take 4+ — variations (pilot on C first)

Variety in how the harmony is presented builds recognition that generalizes instead
of anchoring to one voicing's exact sound. The game picks randomly among a key's
recorded presentations each round (replays within a round always replay the same one).

Pilot these on **C only** first — one short take, a few presentations with 2s gaps —
and play them in the game before recording any across all keys:

- First inversion, second inversion
- An open / spread voicing (or any "unconventional" voicing you like)
- A broken chord: arpeggiated pattern that **ends grounded on the tonic**, then rings
- A "sequential" presentation: chord rings and fully decays — the mystery note will be
  timed to arrive *after* the ring, in silence (this is just a timing value on my
  side; record the chord alone and let it decay naturally)

**One guardrail:** every variation must still unambiguously establish the tonic.
Inversions and voicings are fine because the pitch collection says "C major" clearly;
a broken pattern should start or land on the tonic. If a presentation could make a
listener unsure what key they're in, it doesn't belong in the pool.

When the C pilots feel right in-game, record each variation type as its own take
across all 12 keys (chromatic order, 2s gaps), one take per type.

## Later phases (same protocol when you're ready)

- **Minor keys:** one take of 12 minor contexts + one take of 12 i–iv–V–i cadences
  (V stays major — in C minor: Cm–Fm–G–Cm). Unlocks the minor-mode toggle.
- **Chord qualities:** one take of 28 chords — maj, min, dim, aug, dom7, maj7, min7
  on C, then the same seven on E♭, G♭, A. Unlocks the chord-ID game. (Full 84 across
  all 12 roots is an optional fidelity upgrade later.)
- **Progressions:** design conversation first — nothing to record yet.

---

## What happens after you hand me a take

1. Split at the silences; trim every segment's attack to spec.
2. **Pitch-verify every segment** against the expected item — you get a pass/fail
   report naming anything that needs a re-record.
3. Loudness-match the batch, encode web copies, wire the manifest (including
   per-cadence and per-variation note timing), verify in the browser, deploy.
4. You play it live and tell me what to adjust.
