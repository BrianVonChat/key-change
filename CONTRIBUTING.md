# Contributing a Game

Thanks for wanting to add a game! You don't need to be a professional web
developer — plain HTML/CSS/JS (or help from an AI coding assistant) is
totally fine. Here's the process.

## 1. Fork and clone the repo

Fork [BrianVonChat/key-change](https://github.com/BrianVonChat/key-change) on
GitHub, then clone your fork:

```
git clone https://github.com/<your-username>/key-change.git
cd key-change
```

## 2. Create your game folder

Inside `games/`, create a new folder named after your game in kebab-case
(lowercase, hyphens, no spaces) — this is your game's "slug."
Example: `games/chord-builder/`

## 3. Add your files

At minimum, your folder needs:
- `index.html` — your game's entry point (this is what loads when someone opens your game)
- `manifest.json` — metadata about your game (template + field guide below)

Recommended:
- `thumbnail.png` (or `.jpg`/`.webp`/`.svg`) — roughly 400×300, shown on the homepage card
- Any CSS/JS/image/audio files your game needs, organized however you like

Your game should:
- Be fully self-contained inside your folder (no build step, no external
  dependencies, no backend/server/database, no paid API keys)
- Work reasonably well on both desktop and mobile screen sizes
- Not reach outside its own folder — except optionally linking to
  `../../assets/css/variables.css` if you want to match the site's look.
  You're also completely free to style your game however you like.

## 4. Fill in manifest.json

Copy this template into `games/<your-slug>/manifest.json`:

```json
{
  "slug": "your-game-slug",
  "title": "Your Game's Display Name",
  "author": "Your Name or GitHub handle",
  "authorUrl": "",
  "description": "One or two sentences describing what the player does.",
  "category": ["theory"],
  "difficulty": "beginner",
  "thumbnail": "thumbnail.png",
  "entry": "index.html",
  "dateAdded": "YYYY-MM-DD",
  "version": "1.0.0",
  "instrumentFocus": "piano",
  "tags": []
}
```

Field guide:

| Field | What to put |
|---|---|
| `slug` | Must exactly match your folder name |
| `title` | Shown as the card heading |
| `author` | Your name or handle — gets credit on your card! |
| `authorUrl` | Optional link to your GitHub/site |
| `description` | Keep it under ~200 characters |
| `category` | One or more of: `piano`, `rhythm`, `ear-training`, `theory`, `keyboard-geography` |
| `difficulty` | Exactly one of: `beginner`, `intermediate`, `advanced` |
| `thumbnail` | Filename of your thumbnail image, or `""` for a default |
| `entry` | Leave as `"index.html"` |
| `dateAdded` | Today's date, `YYYY-MM-DD` |
| `version` | Optional, e.g. `"1.0.0"` |
| `instrumentFocus` | Optional free text, e.g. `"piano"`, `"any"` |
| `tags` | Optional extra keywords for search, e.g. `["flashcards", "major-scales"]` |

## 5. Regenerate the games index

Run:

```
node scripts/build-index.js
```

This reads every `games/*/manifest.json` and rewrites the root `games.json`
so the homepage picks up your new game. Commit the updated `games.json`
along with your new folder.

## 6. Validate before opening your PR

Run:

```
node scripts/validate-manifest.js
```

This checks that your manifest has all required fields, a valid
`difficulty` value, recognized `category` values, and that your folder name
matches your `slug`. Fix anything it flags. (No Node installed? That's OK —
a maintainer can run this for you.)

## 7. Open a pull request

Please include:
- A short description of your game
- A screenshot or GIF if possible
- Confirmation you've tested it in at least one browser

A maintainer will review, may suggest small changes, and merge. Once
merged, your game appears on the homepage automatically — no other code
changes needed.

## Using an AI coding assistant?

Totally fine! A good starting prompt is:

> Help me build a browser game about [your idea] using only plain HTML,
> CSS, and JavaScript — no frameworks, no build tools, no external
> dependencies, no backend. It should live in a single self-contained
> folder with an `index.html` entry point.

Then follow steps 2–7 above with the files it generates.

## Questions or stuck?

Open an issue/discussion, or reach out to the project maintainer directly —
happy to help.
