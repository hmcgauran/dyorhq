#!/usr/bin/env node
'use strict';

/**
 * migrate-annual-reports-slug.js
 * Moves 10-K files from ticker-named directories to proper slug-named directories.
 * Also updates the manifest.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RESEARCH_DIR = path.join(ROOT, 'research');
const MANIFEST_FILE = path.join(ROOT, 'state', 'annual-reports-manifest.json');
const CHECKPOINT_FILE = path.join(ROOT, 'state', 'annual-reports-checkpoint.json');

const slugLib = require('../cron-scripts/lib/research-slug');

const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
const checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));

let moved = 0, skipped = 0, errors = 0;

Object.values(manifest).filter(e => e.status === 'ok').forEach(entry => {
  const { ticker, file } = entry;
  const correctSlug = slugLib.researchSlug(ticker);
  const correctDir = path.join(RESEARCH_DIR, correctSlug);
  const fileName = path.basename(file);
  const currentDir = path.dirname(file);

  if (path.basename(currentDir) === correctSlug) {
    // Already correct
    skipped++;
    return;
  }

  // Ensure correct directory exists
  if (!fs.existsSync(correctDir)) {
    fs.mkdirSync(correctDir, { recursive: true });
  }

  const destPath = path.join(correctDir, fileName);

  if (fs.existsSync(destPath)) {
    console.log(`  [SKIP] ${ticker}: ${fileName} already exists in ${correctSlug}`);
    skipped++;
    return;
  }

  try {
    fs.renameSync(file, destPath);
    // Update manifest path
    entry.file = destPath;
    entry.slug = correctSlug;
    console.log(`  [MOVE] ${ticker}: ${path.basename(currentDir)} -> ${correctSlug} (${fileName})`);
    moved++;
  } catch (e) {
    console.log(`  [ERROR] ${ticker}: ${e.message}`);
    errors++;
  }
});

fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));

// Update checkpoint slugs too
Object.keys(checkpoint).forEach(ticker => {
  if (checkpoint[ticker] !== 'done') return;
  const correctSlug = slugLib.researchSlug(ticker);
  if (ticker !== correctSlug) {
    checkpoint[correctSlug] = checkpoint[ticker];
    delete checkpoint[ticker];
  }
});
fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));

console.log(`\nDone. Moved: ${moved} | Skipped: ${skipped} | Errors: ${errors}`);
