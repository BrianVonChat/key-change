/**
 * MusicNotation — shared vector renderer for musical symbols.
 *
 * THE RULE (applies to every game in this repo): musical symbols that sit on
 * a staff — clefs, accidentals, and any future rests/notes/ornaments — are
 * NEVER rendered as Unicode text characters or font glyphs (e.g. \u{1D11E},
 * '\u266F'). Fonts don't reliably cover those code points; the browser
 * silently substitutes an arbitrary fallback font, so the symbol's size and
 * baseline become platform lottery (the classic bug: a tiny clef floating in
 * the wrong place). Symbols are also never sized/positioned with hand-tuned
 * pixel constants.
 *
 * Instead, symbols are embedded SVG paths in STAFF-SPACE units (1 unit = the
 * gap between adjacent staff lines, y grows downward) with the origin on the
 * symbol's engraving anchor:
 *   - treble clef: origin on the G line (2nd staff line from the bottom)
 *   - bass clef:   origin on the F line (4th staff line from the bottom)
 *   - accidentals: origin at the vertical center of the note they modify
 * Placement is then pure math from the staff geometry: translate to the
 * anchor, scale by lineSpacing. Same geometry on every OS/browser, no fonts.
 *
 * (Plain-text ♯/♭ inline in prose, button labels, etc. is fine — this rule
 * is about symbols positioned against staff lines.)
 *
 * Glyph outlines derived from Bravura, (c) Steinberg Media Technologies GmbH,
 * licensed under the SIL Open Font License 1.1 (via VexFlow's Bravura glyph
 * data). https://github.com/steinbergmedia/bravura
 *
 * Usage (plain script, no modules — exposes window.MusicNotation):
 *   svg.appendChild(MusicNotation.clef('treble', {
 *     x: staffLeft + 0.5 * lineSpacing,  // left edge of the glyph
 *     bottomLineY: baselineY,            // y of the BOTTOM staff line
 *     lineSpacing: lineSpacing,          // px between adjacent staff lines
 *     className: 'staff-clef'            // fill comes from CSS
 *   }));
 *   svg.appendChild(MusicNotation.accidental('sharp', {
 *     x: noteX - 1.5 * lineSpacing,      // horizontal CENTER of the glyph
 *     y: stepToY(step),                  // y of the note line/space it modifies
 *     lineSpacing: lineSpacing,
 *     className: 'accidental'
 *   }));
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // Bounding boxes are in staff spaces relative to the anchor (y-down, so
  // negative "top" is above the anchor line). Widths: right - left.
  var GLYPHS = {
    trebleClef: {
      left: 0, right: 2.684, top: -4.392, bottom: 2.632,
      d: 'M1.503 -1.661C1.497 -1.708 1.503 -1.711 1.528 -1.736C1.961 -2.139 2.289 -2.647 2.289 -3.261C2.289 -3.608 2.192 -3.953 2.028 -4.192C1.967 -4.281 1.864 -4.392 1.819 -4.392C1.764 -4.392 1.639 -4.289 1.561 -4.2C1.264 -3.872 1.167 -3.372 1.167 -2.956C1.167 -2.725 1.197 -2.464 1.225 -2.3C1.233 -2.253 1.236 -2.244 1.189 -2.203C0.611 -1.728 0 -1.156 0 -0.347C0 0.347 0.475 1.008 1.456 1.008C1.547 1.008 1.653 1 1.733 0.983C1.775 0.975 1.783 0.972 1.792 1.019C1.839 1.289 1.9 1.636 1.9 1.825C1.9 2.417 1.5 2.489 1.264 2.489C1.047 2.489 0.944 2.425 0.944 2.372C0.944 2.344 0.981 2.333 1.072 2.303C1.197 2.267 1.339 2.161 1.339 1.928C1.339 1.708 1.2 1.519 0.956 1.519C0.689 1.519 0.528 1.733 0.528 1.981C0.528 2.239 0.683 2.633 1.289 2.633C1.556 2.633 2.075 2.511 2.075 1.833C2.075 1.603 2.003 1.225 1.961 0.975C1.953 0.928 1.956 0.933 2.011 0.908C2.417 0.747 2.683 0.408 2.683 -0.044C2.683 -0.556 2.308 -1.008 1.719 -1.008C1.617 -1.008 1.617 -1.008 1.603 -1.081ZM1.881 -3.772C2.011 -3.772 2.119 -3.664 2.119 -3.444C2.119 -3 1.739 -2.639 1.425 -2.364C1.397 -2.339 1.381 -2.344 1.372 -2.397C1.356 -2.5 1.347 -2.636 1.347 -2.764C1.347 -3.389 1.636 -3.772 1.881 -3.772ZM1.444 -1.047C1.456 -0.972 1.456 -0.975 1.383 -0.953C1.033 -0.833 0.803 -0.517 0.803 -0.175C0.803 0.183 0.992 0.439 1.264 0.533C1.297 0.544 1.344 0.556 1.372 0.556C1.403 0.556 1.419 0.536 1.419 0.511C1.419 0.483 1.389 0.472 1.361 0.461C1.192 0.389 1.072 0.217 1.072 0.033C1.072 -0.197 1.228 -0.367 1.472 -0.436C1.536 -0.453 1.544 -0.447 1.553 -0.403L1.753 0.789C1.761 0.833 1.756 0.833 1.697 0.844C1.633 0.856 1.553 0.864 1.472 0.864C0.772 0.864 0.319 0.475 0.319 -0.081C0.319 -0.317 0.361 -0.633 0.692 -1.008C0.933 -1.275 1.117 -1.425 1.303 -1.575C1.344 -1.608 1.353 -1.603 1.361 -1.561ZM1.719 -0.411C1.711 -0.461 1.717 -0.472 1.764 -0.467C2.089 -0.439 2.356 -0.167 2.356 0.183C2.356 0.436 2.203 0.639 1.981 0.753C1.933 0.775 1.925 0.775 1.917 0.728Z'
    },
    bassClef: {
      left: -0.02, right: 2.736, top: -1.048, bottom: 2.54,
      d: 'M1.008 -1.047C0.311 -1.047 0 -0.539 0 -0.156C0 0.164 0.167 0.439 0.492 0.439C0.744 0.439 0.917 0.264 0.917 0.017C0.917 -0.239 0.728 -0.4 0.533 -0.4C0.425 -0.4 0.383 -0.372 0.333 -0.372C0.281 -0.372 0.267 -0.403 0.267 -0.444C0.267 -0.603 0.508 -0.897 0.917 -0.897C1.339 -0.897 1.525 -0.481 1.525 0.147C1.525 1.264 0.972 1.889 0.039 2.419C0.003 2.439 -0.019 2.461 -0.019 2.492C-0.019 2.517 -0.003 2.539 0.033 2.539C0.053 2.539 0.075 2.533 0.1 2.519C1.083 2.039 2.125 1.328 2.125 0.111C2.125 -0.583 1.7 -1.047 1.008 -1.047ZM2.517 -0.719C2.392 -0.719 2.297 -0.625 2.297 -0.5C2.297 -0.375 2.392 -0.281 2.517 -0.281C2.639 -0.281 2.736 -0.375 2.736 -0.5C2.736 -0.625 2.639 -0.719 2.517 -0.719ZM2.519 0.283C2.397 0.283 2.303 0.375 2.303 0.5C2.303 0.625 2.397 0.717 2.519 0.717C2.644 0.717 2.736 0.625 2.736 0.5C2.736 0.375 2.644 0.283 2.519 0.283Z'
    },
    sharp: {
      left: 0, right: 0.996, top: -1.4, bottom: 1.392,
      d: 'M0.947 -0.472C0.975 -0.483 0.997 -0.517 0.997 -0.539L0.997 -0.825C0.997 -0.844 0.983 -0.856 0.967 -0.856C0.961 -0.856 0.956 -0.856 0.947 -0.853C0.947 -0.853 0.867 -0.819 0.847 -0.817C0.819 -0.817 0.792 -0.836 0.792 -0.867L0.792 -1.356C0.792 -1.381 0.767 -1.4 0.736 -1.4C0.697 -1.4 0.672 -1.381 0.672 -1.356L0.672 -0.836C0.667 -0.797 0.656 -0.744 0.619 -0.719C0.572 -0.692 0.436 -0.636 0.367 -0.619C0.333 -0.619 0.319 -0.667 0.319 -0.7L0.319 -1.181C0.319 -1.203 0.292 -1.225 0.264 -1.225C0.225 -1.225 0.2 -1.203 0.2 -1.181L0.2 -0.639C0.2 -0.583 0.175 -0.544 0.153 -0.533C0.128 -0.519 0.047 -0.489 0.047 -0.489C0.019 -0.481 0 -0.447 0 -0.425L0 -0.139C0 -0.117 0.011 -0.103 0.036 -0.103L0.044 -0.108C0.047 -0.108 0.108 -0.133 0.139 -0.147L0.144 -0.153C0.175 -0.153 0.2 -0.111 0.2 -0.081L0.2 0.317C0.2 0.361 0.181 0.397 0.156 0.408C0.133 0.417 0.047 0.453 0.047 0.453C0.019 0.461 0 0.492 0 0.517L0 0.8C0 0.825 0.011 0.836 0.036 0.836L0.044 0.833C0.047 0.833 0.103 0.808 0.139 0.797C0.144 0.792 0.147 0.792 0.153 0.792C0.181 0.792 0.2 0.836 0.2 0.856L0.2 1.347C0.2 1.372 0.225 1.392 0.253 1.392C0.292 1.392 0.319 1.372 0.319 1.347L0.319 0.792C0.319 0.739 0.339 0.711 0.361 0.703L0.603 0.603C0.603 0.603 0.608 0.603 0.608 0.603L0.617 0.6C0.653 0.6 0.672 0.647 0.672 0.672L0.672 1.172C0.672 1.197 0.697 1.217 0.725 1.217C0.767 1.217 0.792 1.197 0.792 1.172L0.792 0.603C0.792 0.572 0.808 0.525 0.836 0.511C0.864 0.5 0.947 0.467 0.947 0.467C0.975 0.456 0.997 0.425 0.997 0.4L0.997 0.117C0.997 0.097 0.983 0.083 0.967 0.083C0.961 0.083 0.956 0.083 0.947 0.089L0.844 0.128C0.819 0.128 0.792 0.103 0.792 0.056L0.792 -0.317C0.792 -0.344 0.811 -0.419 0.844 -0.433ZM0.672 0.181C0.647 0.261 0.461 0.339 0.367 0.339C0.344 0.339 0.325 0.333 0.319 0.319C0.311 0.303 0.308 0.217 0.308 0.119C0.308 -0.003 0.311 -0.144 0.319 -0.175C0.328 -0.244 0.511 -0.328 0.611 -0.328C0.639 -0.328 0.664 -0.319 0.672 -0.303C0.681 -0.283 0.689 -0.183 0.689 -0.075C0.689 0.033 0.681 0.144 0.672 0.181Z'
    },
    flat: {
      left: 0, right: 0.904, top: -1.756, bottom: 0.7,
      d: 'M0.047 0.681C0.061 0.697 0.072 0.7 0.083 0.7C0.097 0.7 0.108 0.692 0.108 0.692C0.228 0.625 0.325 0.517 0.425 0.447C0.781 0.2 0.903 -0.044 0.903 -0.228C0.903 -0.456 0.728 -0.6 0.544 -0.611C0.475 -0.611 0.381 -0.581 0.325 -0.544C0.3 -0.525 0.256 -0.489 0.236 -0.489C0.228 -0.489 0.225 -0.489 0.217 -0.492C0.189 -0.503 0.172 -0.533 0.172 -0.561C0.175 -0.647 0.2 -1.608 0.2 -1.689C0.2 -1.733 0.164 -1.756 0.125 -1.756C0.067 -1.756 0.003 -1.717 0 -1.644C0 -1.644 0.017 0.639 0.047 0.681ZM0.189 0.325C0.189 0.325 0.175 0.083 0.175 -0.075C0.175 -0.139 0.181 -0.189 0.183 -0.203C0.211 -0.283 0.372 -0.4 0.464 -0.4C0.581 -0.4 0.628 -0.267 0.628 -0.167C0.628 0.047 0.444 0.264 0.272 0.372C0.256 0.381 0.244 0.383 0.233 0.383C0.197 0.383 0.189 0.344 0.189 0.325Z'
    },
    natural: {
      left: 0, right: 0.672, top: -1.364, bottom: 1.34,
      d: 'M0.564 -0.725C0.556 -0.725 0.553 -0.719 0.547 -0.719C0.547 -0.719 0.292 -0.628 0.189 -0.628C0.164 -0.628 0.147 -0.633 0.147 -0.647L0.147 -1.317C0.147 -1.344 0.125 -1.364 0.1 -1.364L0.047 -1.364C0.019 -1.364 0 -1.344 0 -1.317L0 0.744C0 0.767 0.011 0.781 0.036 0.781L0.044 0.775C0.047 0.775 0.056 0.775 0.061 0.772C0.117 0.747 0.339 0.653 0.456 0.653C0.497 0.653 0.525 0.664 0.525 0.697L0.525 1.292C0.525 1.319 0.544 1.339 0.572 1.339L0.625 1.339C0.647 1.339 0.672 1.319 0.672 1.292L0.672 -0.717C0.672 -0.736 0.656 -0.747 0.639 -0.747C0.636 -0.747 0.628 -0.747 0.625 -0.744ZM0.147 -0.156C0.147 -0.211 0.392 -0.317 0.489 -0.317C0.511 -0.317 0.525 -0.311 0.525 -0.297L0.525 0.117C0.525 0.189 0.297 0.281 0.197 0.281C0.167 0.281 0.147 0.272 0.147 0.256Z'
    }
  };

  function makeGlyph(glyph, translateX, anchorY, lineSpacing, className) {
    var g = document.createElementNS(SVG_NS, 'g');
    if (className) g.setAttribute('class', className);
    g.setAttribute('transform',
      'translate(' + translateX + ' ' + anchorY + ') scale(' + lineSpacing + ')');
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', glyph.d);
    // No fill attribute on purpose: fill inherits from the group's CSS class.
    g.appendChild(path);
    return g;
  }

  /**
   * Draw a clef, correctly sized and anchored, from staff geometry alone.
   * type: 'treble' | 'bass'
   * opts: { x, bottomLineY, lineSpacing, className? }
   *   x            left edge of the glyph
   *   bottomLineY  y of the bottom staff line
   *   lineSpacing  px between adjacent staff lines
   */
  function clef(type, opts) {
    var glyph = type === 'bass' ? GLYPHS.bassClef : GLYPHS.trebleClef;
    // Anchor line, counted up from the bottom staff line:
    // treble anchors on the G line (1 line up), bass on the F line (3 up).
    var linesUp = type === 'bass' ? 3 : 1;
    var anchorY = opts.bottomLineY - linesUp * opts.lineSpacing;
    return makeGlyph(glyph, opts.x - glyph.left * opts.lineSpacing,
      anchorY, opts.lineSpacing, opts.className);
  }

  /** Width of a clef in px at a given staff scale (for laying out what follows). */
  function clefWidth(type, lineSpacing) {
    var glyph = type === 'bass' ? GLYPHS.bassClef : GLYPHS.trebleClef;
    return (glyph.right - glyph.left) * lineSpacing;
  }

  /**
   * Draw an accidental centered on the line/space of the note it modifies.
   * type: 'sharp' | 'flat' | 'natural'
   * opts: { x, y, lineSpacing, className? }
   *   x  horizontal center of the glyph
   *   y  y of the note's line/space (vertical engraving anchor)
   */
  function accidental(type, opts) {
    var glyph = GLYPHS[type];
    if (!glyph) throw new Error('MusicNotation: unknown accidental "' + type + '"');
    var centerX = (glyph.left + glyph.right) / 2;
    return makeGlyph(glyph, opts.x - centerX * opts.lineSpacing,
      opts.y, opts.lineSpacing, opts.className);
  }

  window.MusicNotation = {
    clef: clef,
    clefWidth: clefWidth,
    accidental: accidental,
    GLYPHS: GLYPHS
  };
})();
