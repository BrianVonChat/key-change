# Degree Detective — dropping in real recorded audio

The game ships fully synthesized and needs **zero** audio files. But the harmonic bed
(the chord or cadence that establishes the key) sounds even better as real piano.
Record it whenever you like and drop the files in — no code changes needed.

## How it works

On load the game requests `audio/manifest.json` once. If it isn't there, you'll see a
single quiet 404 in the network tab — that's expected and fine; the game stays on synth.
If it *is* there, the game lazily fetches and caches each recording the first time a
round needs that key, and plays it instead of the synth context. The mystery note on
top stays synthesized **until you record a note pack** (see `notes` below) — then it
becomes real piano too, along with the walk-home and compare notes in the feedback.
Anything you haven't recorded yet simply stays synth, note by note.

## Setup

Create an `audio/` folder next to this file, containing `manifest.json`:

```json
{
  "contexts": {
    "C": "context-C.m4a",
    "Db": "context-Db.m4a",
    "G": ["context-G.m4a", "context-G-broken.m4a", { "file": "context-G-inv1.m4a" }]
  },
  "cadences": {
    "C": { "file": "cadence-C.m4a", "noteAt": 5.2 }
  },
  "notes": {
    "C3": "note-C3.m4a",
    "Db3": "note-Db3.m4a",
    "D3": "note-D3.m4a"
  }
}
```

- `contexts` are used in **Chord** mode, `cadences` in **Cadence** mode.
- Key names use flat spellings: `C Db D Eb E F Gb G Ab A Bb B`.
- Any audio format `decodeAudioData` handles works: `.m4a` (AAC), `.mp3`, `.wav`.
- An entry is either a plain filename, or `{ "file": "...", "noteAt": seconds }`.
  `noteAt` pins exactly when the mystery note enters, measured from the
  start of the file. Use it for cadences played at a natural tempo — set it a
  half-second or so after the final tonic chord lands. Without it, the note enters
  1.1 s into a context file, or at 55% of a cadence file's length.
- **Recorded several takes of the same key? Make the entry an array** (see `G` above),
  mixing plain filenames and `{ file, noteAt }` freely. Root position, inversions,
  unusual voicings, broken chords — each round picks one variant at random and sticks
  with it for that round's replays, so the player learns the *function*, not one
  familiar recording.
- `notes` is the **note pack**: single piano notes covering the 36 chromatic notes
  `C3`–`B5` (flat spellings, octave numbers 3–5 — that range covers every pitch the
  game can ask for). When a note is listed, the mystery note and the feedback's
  walk-home / compare notes play your piano instead of synth.
- **Partial coverage is fine everywhere.** Any key, mode, or single note not listed
  simply falls back to synth, so you can record a few pieces at a time.

## What to record

| | Contexts | Cadences |
|---|---|---|
| Content | One sustained tonic **major chord** (root position, a low root helps) | **I–IV–V–I**, ending sustained on the final I |
| Length | 2–4 s including natural decay | 2–4 s including natural decay |

- Format: WAV, or MP3 at 192 kbps or higher.
- Keep loudness roughly consistent across keys so no key jumps out.

## Auditioning a specific key

Append `?key=C` (or `Db`, `Eb`, `Gb`, `Ab`, `Bb`, any of the 12 flat-spelled
names) to the game URL and every round locks to that key, on every difficulty —
so you can listen to one key's recordings without replaying sessions until it
comes up. Players never see this; without the parameter the game behaves
normally.

## Timing tip

Chord files: let the chord ring from the very start of the file — the mystery note
enters 1.1 s in. Cadence files: play at whatever tempo feels musical and hold the
final I chord a good while; the integration step measures where that final chord
lands and pins the note entry with `noteAt`, so there's no pacing to hit.

## Recording a whole batch in one take

No need to export 36 little files by hand. Record a batch as **one continuous
take** — the items in order, with a good 2 seconds of silence between them — and
let the splitter cut, trim, name, and pitch-check everything:

```
node scripts/split-take.js my-take.wav --type notes --out staging
node scripts/split-take.js my-take.wav --type contexts --order C,Db,D --out staging
node scripts/split-take.js my-take.wav --type cadences --order C,G,F --out staging
```

`--type notes` expects the full chromatic run C3 → B5, low to high. The tool
verifies every item's pitch (±40 cents), counts each cadence's chords, measures
where the final chord lands, and prints the exact manifest JSON to paste in —
cadence `noteAt` values included. If it finds a different number of items than
expected, it tells you which one to re-record. Recording extra variants of keys
you already have? Add `--suffix v2` to keep the filenames apart.
