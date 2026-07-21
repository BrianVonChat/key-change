# Brand overlays (white-label front ends)

Key Change itself lives at the repo root and deploys unchanged. Each folder in
`brands/` is a **white-label front end** that reuses the same `games/` and
`assets/` but ships its own homepage, palette, and identity — assembled into a
standalone site by `scripts/build-brand.js`.

```
brands/<brand-slug>/
  site.json          required — { name, titleSuffix, homepage }
  index.html         the brand's homepage (same element IDs as the root one,
                     so the shared gallery JS works untouched)
  theme-tokens.css   :root overrides APPENDED to assets/css/variables.css in
                     the built output — because every game links variables.css,
                     overriding tokens re-themes all games automatically
  favicon.svg        brand favicon
  *                  anything else (e.g. brand.css) is copied to the site root
```

Build a brand site into `dist/`:

```sh
node scripts/build-brand.js sdo-outreach
```

The script copies `games/`, `assets/`, and a fresh `games.json` into `dist/`,
overlays the brand files, appends `theme-tokens.css` to `variables.css`, and
rewrites `— Key Change` page titles inside games to the brand's `titleSuffix`.

Each brand deploys as its own Netlify site from this same repo
(build command `node scripts/build-brand.js <brand-slug>`, publish `dist`),
so improvements to shared games reach every brand on the next deploy.
