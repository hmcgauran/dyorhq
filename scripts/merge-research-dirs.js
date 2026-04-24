#!/usr/bin/env node
'use strict';

/**
 * merge-research-dirs.js
 * Merges duplicate research directories per company.
 * Canonical: slugLib.researchSlug(ticker).
 * Stale dirs merged in, collisions renamed with _old_{date}.
 * Handles subdirectories (e.g. rns/) recursively.
 * Safe to re-run: skips already-moved files.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RESEARCH_DIR = path.join(ROOT, 'research');
const slugLib = require('../cron-scripts/lib/research-slug');

const INDEX_PATH = path.join(ROOT, 'reports', 'index.json');
const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));

const TICKER_TO_SLUG = {};
index.forEach(e => { if (!e.ticker) return; TICKER_TO_SLUG[e.ticker] = slugLib.researchSlug(e.ticker); });

const SLUG_TO_TICKERS = {};
Object.entries(TICKER_TO_SLUG).forEach(([ticker, slug]) => {
  if (!SLUG_TO_TICKERS[slug]) SLUG_TO_TICKERS[slug] = [];
  SLUG_TO_TICKERS[slug].push(ticker);
});

const allDirs = fs.readdirSync(RESEARCH_DIR).filter(e => {
  try { return fs.statSync(path.join(RESEARCH_DIR, e)).isDirectory(); } catch { return false; }
});

function findCanonicalSlug(dir) {
  if (SLUG_TO_TICKERS[dir]) return dir;
  for (const [ticker, slug] of Object.entries(TICKER_TO_SLUG)) {
    if (slug === dir) return slug;
  }
  const tickerAttempt = dir.toUpperCase().replace(/[^A-Z]/g, '');
  if (tickerAttempt && TICKER_TO_SLUG[tickerAttempt]) return TICKER_TO_SLUG[tickerAttempt];
  for (const [ticker, slug] of Object.entries(TICKER_TO_SLUG)) {
    if (slug !== dir && slug.endsWith(dir) && slug.toLowerCase().startsWith(ticker.toLowerCase().slice(0, 4))) {
      return slug;
    }
  }
  return null;
}

const groups = {};
for (const dir of allDirs) {
  const canonical = findCanonicalSlug(dir);
  if (!canonical) continue;
  if (!groups[canonical]) groups[canonical] = { canonical: null, stale: [] };
  if (dir === canonical) groups[canonical].canonical = dir;
  else groups[canonical].stale.push(dir);
}

const duplicates = Object.entries(groups).filter(([, g]) => g.stale.length > 0);
console.log('Companies with duplicates:', duplicates.length);

const dateSuffix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
let totalFilesMerged = 0, totalDirsRemoved = 0;

function safeMove(srcItem, destItem) {
  try {
    if (!fs.existsSync(srcItem)) {
      console.log('  [SKIP] already moved: ' + srcItem.replace(RESEARCH_DIR + '/', ''));
      return false;
    }
    if (fs.existsSync(destItem)) {
      const ext = path.extname(path.basename(destItem));
      const base = path.basename(destItem, ext);
      const newName = base + '_old_' + dateSuffix + ext;
      const renamedPath = path.join(path.dirname(destItem), newName);
      fs.renameSync(srcItem, renamedPath);
      console.log('  [COLLISION] ' + srcItem.replace(RESEARCH_DIR + '/', '') + ' -> ' + renamedPath.replace(RESEARCH_DIR + '/', ''));
    } else {
      fs.renameSync(srcItem, destItem);
      console.log('  [MOVE]      ' + srcItem.replace(RESEARCH_DIR + '/', '') + ' -> ' + destItem.replace(RESEARCH_DIR + '/', ''));
    }
    return true;
  } catch (e) {
    console.log('  [WARN] ' + e.code + ' for ' + srcItem.replace(RESEARCH_DIR + '/', '') + ': ' + e.message);
    return false;
  }
}

function mergeDir(srcPath, destPath) {
  if (!fs.existsSync(srcPath)) return;
  let items;
  try { items = fs.readdirSync(srcPath); } catch (e) { return; }
  for (const item of items) {
    const srcItem = path.join(srcPath, item);
    const destItem = path.join(destPath, item);
    let stat;
    try { stat = fs.statSync(srcItem); } catch (e) { continue; }
    if (stat.isDirectory()) {
      if (!fs.existsSync(destItem)) fs.mkdirSync(destItem, { recursive: true });
      mergeDir(srcItem, destItem);
      try { fs.rmdirSync(srcItem); } catch (e) { /* ignore */ }
    } else {
      if (safeMove(srcItem, destItem)) totalFilesMerged++;
    }
  }
  try { fs.rmdirSync(srcPath); } catch (e) { /* ignore */ }
}

for (const [canonical, group] of duplicates) {
  const destDir = group.canonical || canonical;
  const destPath = path.join(RESEARCH_DIR, destDir);
  console.log('\n' + canonical + ':');
  console.log('  Keep: ' + destDir + '/');
  for (const src of group.stale) {
    const srcPath = path.join(RESEARCH_DIR, src);
    let items = [];
    try { items = fs.readdirSync(srcPath); } catch (e) { console.log('  [SKIP] already gone: ' + src); continue; }
    console.log('  Absorb: ' + src + '/ (' + items.length + ' items)');
    mergeDir(srcPath, destPath);
    try { fs.rmdirSync(srcPath); } catch (e) { /* ignore */ }
    console.log('  [RM DIR] ' + src);
    totalDirsRemoved++;
  }
}

console.log('\nDone. Files merged: ' + totalFilesMerged + ' | Dirs removed: ' + totalDirsRemoved);
