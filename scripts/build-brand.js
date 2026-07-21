#!/usr/bin/env node
// Assembles a white-label brand site (see brands/README.md) into an output
// directory: shared games/ + assets/ + a fresh games.json, overlaid with the
// brand's own homepage, favicon, and CSS. The brand's theme-tokens.css is
// APPENDED to assets/css/variables.css so the overrides win the cascade in
// every page that links it — which is how the shared games get re-themed
// without touching their source. Zero dependencies.
//
// Usage: node scripts/build-brand.js <brand-slug> [outDir]
//   e.g. node scripts/build-brand.js sdo-outreach          -> dist/
//        node scripts/build-brand.js sdo-outreach out/sdo  -> out/sdo/

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

const brandSlug = process.argv[2];
if (!brandSlug) {
  console.error('Usage: node scripts/build-brand.js <brand-slug> [outDir]');
  process.exit(1);
}

const brandDir = path.join(ROOT, 'brands', brandSlug);
const sitePath = path.join(brandDir, 'site.json');
if (!fs.existsSync(sitePath)) {
  console.error(`No such brand: brands/${brandSlug}/site.json not found.`);
  process.exit(1);
}
const site = JSON.parse(fs.readFileSync(sitePath, 'utf8'));

const outDir = path.resolve(ROOT, process.argv[3] || 'dist');
if (outDir === ROOT || !outDir.startsWith(ROOT + path.sep)) {
  console.error(`Refusing to build outside the repo (outDir: ${outDir}).`);
  process.exit(1);
}

// 1. Regenerate the shared games.json index.
execFileSync(process.execPath, [path.join(__dirname, 'build-index.js')], { stdio: 'inherit' });

// 2. Fresh output dir with the shared platform files.
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
for (const shared of ['games', 'assets', 'games.json', 'LICENSE']) {
  fs.cpSync(path.join(ROOT, shared), path.join(outDir, shared), { recursive: true });
}

// 3. Brand overlay.
const APPEND_BANNER = '\n/* ==== Brand overrides appended by scripts/build-brand.js ==== */\n';
for (const entry of fs.readdirSync(brandDir)) {
  if (entry === 'site.json') continue;
  if (entry === 'theme-tokens.css') {
    const variablesPath = path.join(outDir, 'assets', 'css', 'variables.css');
    const tokens = fs.readFileSync(path.join(brandDir, entry), 'utf8');
    fs.appendFileSync(variablesPath, APPEND_BANNER + tokens);
    continue;
  }
  fs.cpSync(path.join(brandDir, entry), path.join(outDir, entry), { recursive: true });
}

// 4. De-brand the shared game pages: their <title> carries the platform name.
let retitled = 0;
for (const folder of fs.readdirSync(path.join(outDir, 'games'))) {
  const pagePath = path.join(outDir, 'games', folder, 'index.html');
  if (!fs.existsSync(pagePath)) continue;
  const html = fs.readFileSync(pagePath, 'utf8');
  const rewritten = html.replace('— Key Change</title>', `— ${site.titleSuffix}</title>`);
  if (rewritten !== html) {
    fs.writeFileSync(pagePath, rewritten);
    retitled += 1;
  }
}

console.log(`Built brand "${site.name}" -> ${path.relative(ROOT, outDir)}/ (retitled ${retitled} game page(s))`);
