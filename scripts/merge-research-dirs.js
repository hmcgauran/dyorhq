#!/usr/bin/env node
/**
 * scripts/merge-research-dirs.js
 *
 * Two-pass research directory standardisation.
 * Pass 1: Build tickerBase -> canonical company-slug map from index.
 * Pass 2: Scan all research dirs. Short dirs (< 8 chars) that aren't in
 *         the company slug set are ticker slugs — migrate to canonical.
 *         Also handle known alias mismatches (e.g. 3mco -> mmm3mco).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs   = require('fs');
const path = require('path');

const RESEARCH_DIR = path.join(__dirname, '..', 'research');
const INDEX_PATH   = path.join(__dirname, '..', 'reports', 'index.json');

function companySlug(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function tickerBase(ticker) {
  return (ticker || '')
    .split(/\s+/)[0]
    .replace(/\.[A-Z]{1,4}$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Short-name directory aliases not derivable from ticker base alone. */
const SLUG_ALIAS_MAP = {
  '3mco':    'mmm3mco',     // MMM / 3M Co
  'deereco': 'dedeerecompany', // DE / Deere & Company
  'rtxcorp': 'rtxrtxcorp',  // RTX / RTX Corp
};

function main() {
  const idx = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  const allDirs = fs.readdirSync(RESEARCH_DIR).filter(d => !d.startsWith('.'));

  // PASS 1: Build tickerBase -> canonical company slug map from index
  const tickerBaseMap = {};
  const companySlugSet = new Set();

  for (const entry of idx) {
    const base = tickerBase(entry.ticker);
    const cSlug = companySlug(entry.company);
    if (base) tickerBaseMap[base] = cSlug;
    if (cSlug) companySlugSet.add(cSlug);
  }

  console.log('Index entries:', idx.length, '| Company slug set:', companySlugSet.size);

  const log = [];
  let merged = 0, conflicts = 0;

  // PASS 2: For each research dir
  for (const dir of allDirs) {
    const srcDir = path.join(RESEARCH_DIR, dir);

    // Known aliases first (short-name dirs whose canonical slug we know)
    let canonicalSlug = SLUG_ALIAS_MAP[dir];

    // Skip if already a known company slug
    if (companySlugSet.has(dir) || dir.length >= 8) {
      continue;
    }

    // Ticker-base lookup
    if (!canonicalSlug) {
      canonicalSlug = tickerBaseMap[dir];
    }

    // Reverse company-slug lookup
    if (!canonicalSlug) {
      const reverseEntry = idx.find(e => companySlug(e.company) === dir);
      if (reverseEntry) canonicalSlug = companySlug(reverseEntry.company);
    }

    if (!canonicalSlug) {
      log.push(`UNKNOWN: dir "${dir}" has no index entry — leaving in place`);
      continue;
    }

    if (canonicalSlug === dir) {
      log.push(`OK: ${dir} (already correct)`);
      continue;
    }

    const dstDir = path.join(RESEARCH_DIR, canonicalSlug);

    if (!fs.existsSync(dstDir)) {
      fs.mkdirSync(dstDir, { recursive: true });
      log.push(`MKDIR: ${canonicalSlug}`);
    }

    const files = fs.readdirSync(srcDir).filter(f => !f.startsWith('.'));
    for (const file of files) {
      const srcFile = path.join(srcDir, file);
      const dstFile = path.join(dstDir, file);
      if (fs.existsSync(dstFile)) {
        log.push(`CONFLICT: ${dir}/${file} -> ${canonicalSlug}/${file} (kept destination)`);
        conflicts++;
      } else {
        fs.renameSync(srcFile, dstFile);
        log.push(`MERGE: ${dir}/${file} -> ${canonicalSlug}/${file}`);
      }
    }

    const remaining = fs.readdirSync(srcDir).filter(f => !f.startsWith('.'));
    if (remaining.length === 0) {
      fs.rmdirSync(srcDir);
      log.push(`RM EMPTY DIR: ${dir}`);
    } else {
      log.push(`KEEP NON-EMPTY SRC: ${dir} [${remaining.join(', ')}]`);
    }
    merged++;
  }

  console.log('\n=== MIGRATION LOG ===\n');
  for (const l of log) console.log(l);
  console.log(`\n=== SUMMARY ===`);
  console.log(`Dirs merged: ${merged}`);
  console.log(`Conflicts: ${conflicts}`);
  console.log(`Total log entries: ${log.length}`);

  fs.writeFileSync(
    path.join(__dirname, '..', 'logs', 'research-migration.log'),
    log.join('\n') + '\n',
    'utf8'
  );
  console.log('\nLog written to logs/research-migration.log');
}

main();
