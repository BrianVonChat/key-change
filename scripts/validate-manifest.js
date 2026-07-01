#!/usr/bin/env node
// Validates every games/*/manifest.json. Exits non-zero on any error
// (warnings are printed but don't fail the check). Zero dependencies —
// runs the same locally or in CI.

const fs = require('fs');
const path = require('path');

const GAMES_DIR = path.join(__dirname, '..', 'games');
const VALID_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const VALID_CATEGORIES = ['piano', 'rhythm', 'ear-training', 'theory', 'keyboard-geography'];
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const errors = [];
const warnings = [];

const folders = fs.readdirSync(GAMES_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

for (const folder of folders) {
  const manifestPath = path.join(GAMES_DIR, folder, 'manifest.json');
  const indexPath = path.join(GAMES_DIR, folder, 'index.html');

  if (!fs.existsSync(manifestPath)) {
    errors.push(`[${folder}] missing manifest.json`);
    continue;
  }
  if (!fs.existsSync(indexPath)) {
    errors.push(`[${folder}] missing index.html`);
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    errors.push(`[${folder}] manifest.json is not valid JSON: ${e.message}`);
    continue;
  }

  const required = ['slug', 'title', 'author', 'description', 'category', 'difficulty', 'entry', 'dateAdded'];
  for (const field of required) {
    if (manifest[field] === undefined || manifest[field] === '') {
      errors.push(`[${folder}] missing required field "${field}"`);
    }
  }

  if (manifest.slug && manifest.slug !== folder) {
    errors.push(`[${folder}] manifest "slug" ("${manifest.slug}") does not match folder name`);
  }
  if (manifest.slug && !SLUG_RE.test(manifest.slug)) {
    errors.push(`[${folder}] "slug" must be lowercase kebab-case`);
  }
  if (manifest.difficulty && !VALID_DIFFICULTIES.includes(manifest.difficulty)) {
    errors.push(`[${folder}] "difficulty" must be one of ${VALID_DIFFICULTIES.join(', ')}`);
  }
  if (manifest.category) {
    if (!Array.isArray(manifest.category) || manifest.category.length === 0) {
      errors.push(`[${folder}] "category" must be a non-empty array`);
    } else {
      for (const c of manifest.category) {
        if (!VALID_CATEGORIES.includes(c)) {
          errors.push(`[${folder}] unrecognized category "${c}" — must be one of ${VALID_CATEGORIES.join(', ')}`);
        }
      }
    }
  }
  if (manifest.entry && manifest.entry !== 'index.html') {
    errors.push(`[${folder}] "entry" must be "index.html"`);
  }
  if (manifest.dateAdded && !/^\d{4}-\d{2}-\d{2}$/.test(manifest.dateAdded)) {
    errors.push(`[${folder}] "dateAdded" must be YYYY-MM-DD`);
  }
  if (manifest.description && manifest.description.length > 200) {
    warnings.push(`[${folder}] description is long (${manifest.description.length} chars) — consider trimming`);
  }
  if (manifest.thumbnail) {
    const thumbPath = path.join(GAMES_DIR, folder, manifest.thumbnail);
    if (!fs.existsSync(thumbPath)) {
      warnings.push(`[${folder}] thumbnail "${manifest.thumbnail}" not found — placeholder will be used`);
    }
  }
}

warnings.forEach((w) => console.warn('WARNING: ' + w));
errors.forEach((e) => console.error('ERROR: ' + e));

if (errors.length > 0) {
  console.error(`\n${errors.length} error(s) found. Fix these before merging.`);
  process.exit(1);
} else {
  console.log(`All ${folders.length} game manifests look good.`);
  process.exit(0);
}
