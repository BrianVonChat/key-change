# Degree Detective — dropping in real recorded audio

The game ships fully synthesized and needs **zero** audio files. But the harmonic bed
(the chord or cadence that establishes the key) sounds even better as real piano.
Record it whenever you like and drop the files in — no code changes needed.

## How it works

On load the game requests `audio/manifest.json` once. If it isn't there, you'll see a
single quiet 404 in the network tab — that's expected and fine; the game stays on synth.
If it *is* there, the game lazily fetches and caches each recording the first time a
round needs that key, and plays it instead of the synth context. **The mystery note on
top always stays synthesized** — that's on purpose: the timbral contrast helps it stand
out from the bed.

## Setup

Create an `audio/` folder next to this file, containing `manifest.json`:

```json
{
  "contexts": {
    "C": "context-C.mp3",
    "Db": "context-Db.mp3"
  },
  "cadences": {
    "C": "cadence-C.mp3"
  }
}
```

- `contexts` are used in **Chord** mode, `cadences` in **Cadence** mode.
- Key names use flat spellings: `C Db D Eb E F Gb G Ab A Bb B`.
- **Partial coverage is fine.** Any key (or mode) not listed simply falls back to synth,
  so you can record a few keys at a time.

## What to record

| | Contexts | Cadences |
|---|---|---|
| Content | One sustained tonic **major chord** (root position, a low root helps) | **I–IV–V–I**, ending sustained on the final I |
| Length | 2–4 s including natural decay | 2–4 s including natural decay |

- Format: WAV, or MP3 at 192 kbps or higher.
- Keep loudness roughly consistent across keys so no key jumps out.

## Timing tip

The synthesized mystery note enters **1.1 s** into a chord file, and at about **55%**
of a cadence file's length. So: let chord recordings ring from the very start, and in
cadence recordings land the final I chord before the halfway point so the note arrives
over the sustained tonic.
