#!/usr/bin/env node
'use strict';

/**
 * check-research-coverage.js
 * Checks which public HTML reports have a matching research directory.
 * Matches by canonical slug from index.json (or slugLib.researchSlug as fallback).
 */

const fs = require('fs');
const path = require('path');

const ROOT = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4';
const PUBLIC_DIR = path.join(ROOT, 'public', 'reports');
const RESEARCH_DIR = path.join(ROOT, 'research');
const INDEX_PATH = path.join(ROOT, 'reports', 'index.json');

const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
const slugLib = require('../cron-scripts/lib/research-slug');

// ticker -> canonical slug (from index, with slugLib fallback)
const TICKER_TO_SLUG = {};
index.forEach(e => { if (!e.ticker) return; TICKER_TO_SLUG[e.ticker] = e.slug || slugLib.researchSlug(e.ticker); });

// Reverse: canonical slug -> ticker
const SLUG_TO_TICKER = {};
Object.entries(TICKER_TO_SLUG).forEach(([t, s]) => { SLUG_TO_TICKER[s] = t; });

// All research dirs (actual filesystem)
const researchDirs = new Set(fs.readdirSync(RESEARCH_DIR).filter(e => {
  try { return fs.statSync(path.join(RESEARCH_DIR, e)).isDirectory(); } catch { return false; }
}));

// All public HTML slugs
const publicSlugs = fs.readdirSync(PUBLIC_DIR).filter(f => f.endsWith('.html')).map(f => f.replace('.html', ''));

// For each public slug, resolve it to the actual research dir it should have
function resolveResearchDir(reportSlug) {
  // 1. Exact match in research dirs
  if (researchDirs.has(reportSlug)) return reportSlug;

  // 2. Try: this slug IS a canonical slug for some ticker in the index
  if (SLUG_TO_TICKER[reportSlug]) {
    const canonicalSlug = TICKER_TO_SLUG[SLUG_TO_TICKER[reportSlug]];
    if (canonicalSlug && researchDirs.has(canonicalSlug)) return canonicalSlug;
  }

  // 3. Try: find ticker whose canonical slug == this slug
  const tickerEntry = Object.entries(TICKER_TO_SLUG).find(([, s]) => s === reportSlug);
  if (tickerEntry && researchDirs.has(reportSlug)) return reportSlug;

  // 4. Try: this slug is a ticker prefix -> get canonical slug
  const tickerAttempt = reportSlug.toUpperCase().replace(/[^A-Z]/g, '');
  if (tickerAttempt && TICKER_TO_SLUG[tickerAttempt]) {
    const canonical = TICKER_TO_SLUG[tickerAttempt];
    if (researchDirs.has(canonical)) return canonical;
  }

  // 5. Try: slug is suffix of any canonical slug that exists as research dir
  for (const [ticker, canonicalSlug] of Object.entries(TICKER_TO_SLUG)) {
    if (researchDirs.has(canonicalSlug) && canonicalSlug.endsWith(reportSlug)) {
      return canonicalSlug;
    }
  }

  return null; // no match
}

const noResearch = [];
const withResearch = [];

for (const reportSlug of publicSlugs) {
  const actualDir = resolveResearchDir(reportSlug);
  if (!actualDir) {
    noResearch.push(reportSlug);
  } else {
    withResearch.push({ reportSlug, actualDir });
  }
}

console.log('Public reports: ' + publicSlugs.length);
console.log('Research dirs:  ' + researchDirs.size);
console.log('WITH research:  ' + withResearch.length);
console.log('WITHOUT research: ' + noResearch.length);
console.log('');
if (noResearch.length) {
  console.log('Reports without research directory:');
  noResearch.sort().forEach(slug => {
    const dataPath = path.join(ROOT, 'reports', 'data', slug + '.json');
    const hasData = fs.existsSync(dataPath);
    console.log('  ' + slug + ' | data:' + hasData);
  });
}
