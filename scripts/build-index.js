#!/usr/bin/env node
// Aggregates games/*/manifest.json into the root games.json index that
// the homepage fetches at runtime. Rewrites `thumbnail`/`entry` to be
// root-relative so the homepage never needs to know a game's folder path.
// Zero dependencies.

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const GAMES_DIR = path.join(ROOT_DIR, 'games');
const OUTPUT_PATH = path.join(ROOT_DIR, 'games.json');

const folders = fs.readdirSync(GAMES_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const games = [];

for (const folder of folders) {
  const manifestPath = path.join(GAMES_DIR, folder, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.warn(`Skipping "${folder}" — no manifest.json found.`);
    continue;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const entry = `games/${folder}/${manifest.entry || 'index.html'}`;
  const thumbnail = manifest.thumbnail ? `games/${folder}/${manifest.thumbnail}` : '';

  games.push({
    ...manifest,
    entry,
    thumbnail,
  });
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(games, null, 2) + '\n');
console.log(`Wrote ${games.length} game(s) to games.json`);
