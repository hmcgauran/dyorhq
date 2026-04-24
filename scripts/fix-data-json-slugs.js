#!/usr/bin/env node
'use strict';

/**
 * fix-data-json-slugs.js
 * Maps reports/data/*.json filenames to canonical slug from index.json.
 * Performs renames (ticker-name -> slug-name) and deletes stale/malformed files.
 * Safe: logs every action before taking it.
 */

const fs = require('fs');
const path = require('path');

const ROOT = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4';
const DATA_DIR = path.join(ROOT, 'reports', 'data');
const INDEX_PATH = path.join(ROOT, 'reports', 'index.json');

const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
const slugLib = require('../cron-scripts/lib/research-slug');

// ticker -> canonical slug from index
const TICKER_TO_SLUG = {};
index.forEach(e => { if (!e.ticker) return; TICKER_TO_SLUG[e.ticker] = e.slug || slugLib.researchSlug(e.ticker); });

// slug -> ticker from index
const SLUG_TO_TICKER = {};
Object.entries(TICKER_TO_SLUG).forEach(([t, s]) => { SLUG_TO_TICKER[s] = t; });

const dataFiles = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
console.log('Data JSON files: ' + dataFiles.length);
console.log('');

// ── Step 1: Identify deletes (malformed/no-mapping files) ──────────────────────
const MALFORMED = dataFiles.filter(f => {
  // Exchange-suffixed, malformed tickers (not in index)
  const NO_MAPPING = ['AIB.json','AIBGY.json','C4X.json','COIN.json','DESP.json','FRA:KRZ.json',
    'GGP.L  LN.json','GL9.json','J9J.json','JET2.json','KBGGY  NO.json','KBGGY.json',
    'KRX.json','KRZ.json','KYGA.json','LON:DCC.json','LON:GFTU.json','MAB1.json',
    'MDB  US.json','MRSN.json','PL  US.json','PLCE.json','POLXF.json','SHOP  US.json',
    'SHOP.json','SOFI.json','TDY  US.json','TDY.json','W7L.json','XPEV  US.json','XPEV.json'];
  return NO_MAPPING.includes(f);
});

// ── Step 2: Identify renames ───────────────────────────────────────────────────
const renameMap = []; // {from, to, ticker}

for (const filename of dataFiles) {
  if (MALFORMED.includes(filename)) continue;
  if (filename.includes('  ')) return; // exchange-suffixed, skip

  const currentSlug = filename.replace('.json', '');
  const jsonPath = path.join(DATA_DIR, filename);

  let ticker = null;
  const tickerAttempt = currentSlug.toUpperCase().replace(/[^A-Z.]/g, '');
  if (tickerAttempt && TICKER_TO_SLUG[tickerAttempt]) ticker = tickerAttempt;
  if (!ticker && SLUG_TO_TICKER[currentSlug]) ticker = SLUG_TO_TICKER[currentSlug];
  if (!ticker) {
    try {
      const d = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      if (d.ticker && TICKER_TO_SLUG[d.ticker]) ticker = d.ticker;
    } catch(e) {}
  }
  if (!ticker) {
    for (const [t, s] of Object.entries(TICKER_TO_SLUG)) {
      if (s.endsWith(currentSlug) && s.toLowerCase().startsWith(t.toLowerCase().slice(0,4))) {
        ticker = t; break;
      }
    }
  }

  if (!ticker) continue;
  const canonicalSlug = TICKER_TO_SLUG[ticker];
  if (currentSlug !== canonicalSlug) {
    renameMap.push({ from: filename, to: canonicalSlug + '.json', ticker });
  }
}

// ── Execute ───────────────────────────────────────────────────────────────────
console.log('=== Delete malformed files (' + MALFORMED.length + ') ===');
MALFORMED.forEach(f => {
  const p = path.join(DATA_DIR, f);
  const size = fs.existsSync(p) ? fs.statSync(p).size : 0;
  console.log('  DELETE ' + f + ' (' + size + 'b)');
  if (size === 0 || !fs.existsSync(p)) {
    try { fs.unlinkSync(p); console.log('    -> deleted'); } catch(e) { console.log('    -> error: ' + e.message); }
  }
});

console.log('\n=== Rename files (' + renameMap.length + ') ===');
let renamed = 0, collisions = 0;
renameMap.forEach(({ from, to, ticker }) => {
  const src = path.join(DATA_DIR, from);
  const dest = path.join(DATA_DIR, to);
  if (fs.existsSync(dest)) {
    console.log('  COLLISION: ' + from + ' -> ' + to + ' (dest exists, skip)');
    collisions++;
    return;
  }
  fs.renameSync(src, dest);
  console.log('  ' + from + ' -> ' + to + ' [ticker:' + ticker + ']');
  renamed++;
});

console.log('\nDone. Renamed: ' + renamed + ' | Collisions: ' + collisions + ' | Deleted: ' + MALFORMED.length);
console.log('Remaining data files: ' + fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).length);
