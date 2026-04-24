#!/usr/bin/env node
'use strict';

/**
 * bootstrap-pipeline.js
 *
 * One-time script. Inspects the existing research/ directories and
 * state/sheet-latest.json to build the initial state/pipeline.json.
 *
 * For each ticker in the sheet snapshot it checks:
 *   - directory:   does research/{slug}/ exist?
 *   - webResearch: does research/{slug}/brave-web-*.json exist?
 *   - edgar:        does research/{slug}/8-K-*.md or 10-K-*.md exist?
 *   - duckWeb:      does research/{slug}/duck-web-*.json exist?
 *   - articleFetch: does research/{slug}/playwright-*.json exist?
 *   - grok:         does research/{slug}/grok-*.json exist?
 *   - paperclip:    does research/{slug}/paperclip-*.json exist?
 *
 * Run ONCE after sync-sheet.js to seed pipeline.json from existing work.
 * Safe to re-run — only adds missing entries, never overwrites existing ones.
 *
 * Usage:
 *   node scripts/bootstrap-pipeline.js
 *   node scripts/bootstrap-pipeline.js --dry-run   # show counts, no write
 */

const fs   = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT          = path.resolve(__dirname, '..');
const RESEARCH_DIR  = path.join(ROOT, 'research');
const STATE_DIR     = path.join(ROOT, 'state');
const SNAPSHOT_FILE = path.join(STATE_DIR, 'sheet-latest.json');
const PIPELINE_FILE = path.join(STATE_DIR, 'pipeline.json');
const TODAY         = new Date().toISOString().slice(0, 10);

const DRY_RUN = process.argv.includes('--dry-run');

const NON_US_PREFIX_RE = /^(EPA|ASX|LON|LSE|FRA|CVE|BME|TSE|TSX|HKEX):/i;

function hasFiles(dir, pattern) {
  if (!fs.existsSync(dir)) return false;
  return fs.readdirSync(dir).some(f => pattern.test(f));
}

function main() {
  if (!fs.existsSync(SNAPSHOT_FILE)) {
    console.error('state/sheet-latest.json not found. Run sync-sheet.js first.');
    process.exit(1);
  }

  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
  let pipeline = {};
  try { pipeline = JSON.parse(fs.readFileSync(PIPELINE_FILE, 'utf8')); }
  catch { /* first run — start fresh */ }

  let added = 0, skipped = 0, updated = 0;

  for (const entry of snapshot.tickers) {
    const ticker = (entry.ticker || '').toUpperCase();
    if (!ticker) continue;

    const slug = entry.research_slug || entry.slug || ticker.toLowerCase().replace(/[^a-z0-9]/g, '');
    const dir  = path.join(RESEARCH_DIR, slug);

    const hasDir          = fs.existsSync(dir);
    const hasWeb          = hasFiles(dir, /^brave-web-.*\.json$/);
    const hasEdgar        = hasFiles(dir, /^(8-K|10-K|10-Q)-\d{4}-\d{2}-\d{2}\.md$/);
    const hasDuckWeb      = hasFiles(dir, /^duck-web-.*\.json$/);
    const hasPlaywright   = hasFiles(dir, /^playwright-.*\.json$/);
    const hasGrok         = hasFiles(dir, /^grok-.*\.json$/);
    const hasPaperclip    = hasFiles(dir, /^paperclip-.*\.json$/);

    const edgarEligible = !NON_US_PREFIX_RE.test(entry.ticker || '');

    // If already in pipeline.json, only fill in missing stages
    if (pipeline[ticker]) {
      const stages = pipeline[ticker].stages;
      let changed = false;
      if (!stages.directory    && hasDir)         { stages.directory    = TODAY; changed = true; }
      if (!stages.webResearch  && hasWeb)         { stages.webResearch  = TODAY; changed = true; }
      if (!stages.edgar        && hasEdgar)       { stages.edgar        = TODAY; changed = true; }
      if (!stages.duckWeb      && hasDuckWeb)     { stages.duckWeb      = TODAY; changed = true; }
      if (!stages.articleFetch && hasPlaywright)  { stages.articleFetch = TODAY; changed = true; }
      if (!stages.grok         && hasGrok)        { stages.grok         = TODAY; changed = true; }
      if (!stages.paperclip    && hasPaperclip)   { stages.paperclip    = TODAY; changed = true; }
      // Mark ineligible tickers so they don't show as pending
      if (!stages.edgar && !edgarEligible) { stages.edgar = 'N/A'; changed = true; }
      if (changed) updated++;
      else skipped++;
      continue;
    }

    // New entry
    pipeline[ticker] = {
      addedAt: TODAY,
      company: entry.companyName || ticker,
      slug,
      stages: {
        directory:    hasDir        ? TODAY : null,
        webResearch:  hasWeb        ? TODAY : null,
        edgar:        hasEdgar      ? TODAY : (edgarEligible ? null : 'N/A'),
        duckWeb:      hasDuckWeb    ? TODAY : null,
        articleFetch: hasPlaywright ? TODAY : null,
        grok:         hasGrok       ? TODAY : null,
        paperclip:    hasPaperclip  ? TODAY : null,
      },
    };
    added++;
  }

  console.log(`Snapshot : ${snapshot.rowCount} tickers`);
  console.log(`Added    : ${added}`);
  console.log(`Updated  : ${updated} (filled missing stage entries)`);
  console.log(`Skipped  : ${skipped} (already complete in pipeline.json)`);
  console.log('');

  // Summary of what still needs doing
  const incomplete = Object.entries(pipeline).filter(([, v]) => {
    const s = v.stages;
    return !s.directory || !s.webResearch || (!s.edgar && s.edgar !== 'N/A') ||
           !s.duckWeb || (!s.articleFetch && s.articleFetch !== 'N/A') || !s.grok;
    // paperclip excluded — 'SKIP' is a valid terminal state for non-life-sciences tickers
    // articleFetch 'N/A' means playwright is not installed — not a blocker
  });

  if (incomplete.length > 0) {
    console.log(`Tickers with incomplete stages (${incomplete.length}):`);
    for (const [ticker, v] of incomplete) {
      const s = v.stages;
      const pending = [
        !s.directory                                        ? 'directory'    : null,
        !s.webResearch                                      ? 'webResearch'  : null,
        (!s.edgar && s.edgar !== 'N/A')                     ? 'edgar'        : null,
        !s.duckWeb                                          ? 'duckWeb'      : null,
        (!s.articleFetch && s.articleFetch !== 'N/A')       ? 'articleFetch' : null,
        !s.grok                                             ? 'grok'         : null,
        (!s.paperclip && s.paperclip !== 'SKIP')            ? 'paperclip'    : null,
      ].filter(Boolean).join(', ');
      console.log(`  ${ticker.padEnd(12)} missing: ${pending}`);
    }
    console.log('');
  } else {
    console.log('All tickers have complete pipeline stages.');
  }

  if (DRY_RUN) {
    console.log('Dry run — pipeline.json not written.');
    return;
  }

  fs.writeFileSync(PIPELINE_FILE, JSON.stringify(pipeline, null, 2));
  console.log(`Written: state/pipeline.json (${Object.keys(pipeline).length} tickers)`);
}

main();
