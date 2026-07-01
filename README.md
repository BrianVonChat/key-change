# Key Change

A free, community-built library of browser games for learning piano and
music — note reading, keyboard geography, rhythm, ear training, music
theory, and more. Piano-centric, open to anyone.

Anyone can play for free, and any musician-coder can contribute a new game.
See [CONTRIBUTING.md](CONTRIBUTING.md) to add your own.

## Running it locally

This is a plain static site — no build step, no dependencies. Any static
file server works, for example:

```
npx serve .
```

or

```
python3 -m http.server 8000
```

Then open the printed local URL in your browser.

## Project structure

```
index.html            Homepage / game gallery
assets/                Shared site styles, scripts, images (not game-specific)
games/<slug>/          One self-contained folder per game
games.json             Generated index of all games — see scripts/build-index.js
scripts/               Local tooling (index generation, manifest validation)
CONTRIBUTING.md        How to add a new game
```

Each game in `games/` is a fully self-contained mini-site (its own HTML/CSS/JS)
with a `manifest.json` describing it for the homepage gallery. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the full contract.

## License

MIT — see [LICENSE](LICENSE).
