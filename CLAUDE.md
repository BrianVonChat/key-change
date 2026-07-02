# Music Games Website — project instructions

Static, dependency-free vanilla-JS site. Each game lives in `games/<name>/`
(index.html + game.js + style.css); shared code lives in `assets/js/`.

## Music notation rendering — MANDATORY

**Never render musical symbols (clefs, accidentals, notes, rests — anything
positioned on a staff) as Unicode text characters or font glyphs** (e.g.
`\u{1D11E}` 𝄞, `\u{1D122}`, ♯, ♭, ♮ inside SVG `<text>`). Ordinary fonts do
not contain these code points, so the browser silently substitutes an
arbitrary fallback font whose glyph size and baseline are unpredictable — the
symbol renders tiny and misplaced, differently on every OS/browser. This has
repeatedly produced broken clefs in this project.

**Never size or position a staff symbol with hand-tuned pixel constants**
("looks right on my screen"). All staff geometry must be computed from the
staff's `lineSpacing` (staff-space units) and the symbol's engraving anchor.

**Instead, always use the shared vector renderer `assets/js/notation.js`**
(`window.MusicNotation`, plain script include — no modules):

```js
// clef: pass the staff geometry, never the glyph position
svg.appendChild(MusicNotation.clef('treble', {
  x: staffLeft + 0.5 * lineSpacing, // left edge of glyph
  bottomLineY: baselineY,           // y of the BOTTOM staff line
  lineSpacing: lineSpacing,
  className: 'staff-clef'           // fill via CSS
}));

// accidental: centered on the note's line/space
svg.appendChild(MusicNotation.accidental('sharp', {
  x: noteX - 1.5 * lineSpacing, y: noteY,
  lineSpacing: lineSpacing, className: 'accidental'
}));
```

The module anchors glyphs per engraving rules automatically (treble clef
spiral on the G line, bass clef head on the F line, accidentals centered on
the note they modify) and scales everything from `lineSpacing`. Correct
proportions for reference: treble clef ≈ 7 staff-spaces tall (it MUST
overhang the staff above and below), bass clef ≈ 3.6, notehead ≈ 1 staff-space
tall, stem ≈ 3.5 staff-spaces.

If a game needs a symbol the module lacks (rest, natural, double-sharp…),
**add it to `assets/js/notation.js`** as an embedded SVG path in staff-space
units (Bravura/SMuFL-derived, y-down, origin on the engraving anchor) — never
a one-off in a single game.

Plain ♯/♭ inline in prose, headings, or button labels (HTML text flow) is
fine — the rule is about symbols positioned against staff lines.

Layout sanity rule: when placing staves in a viewBox, compute the extents
(highest/lowest note incl. ledger lines and stems, clef overhang) and derive
staff positions from them — don't guess margins.
