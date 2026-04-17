#!/usr/bin/env node
/**
 * scripts/process-new-tickers.js
 *
 * Reads state/new-tickers.json, runs generate-report.js for each unmatched ticker.
 * Skips any ticker that already has a report (handles re-runs gracefully).
 *
 * Usage: node scripts/process-new-tickers.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const STATE_FILE = path.join(__dirname, '..', 'state', 'new-tickers.json');
const INDEX_PATH  = path.join(__dirname, '..', 'reports', 'index.json');
const PROJ_ROOT   = path.join(__dirname, '..');
const TODAY       = new Date().toISOString().slice(0, 10);

function log(msg) { console.log(`[${new Date().toLocaleTimeString()}] ${msg}`); }

function main() {
  if (!fs.existsSync(STATE_FILE)) {
    console.error('state/new-tickers.json not found. Run detect-new-tickers.js first.');
    process.exit(1);
  }

  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  const unmatched = state.unmatched || [];

  if (unmatched.length === 0) {
    log('No new tickers — nothing to process.');
    return;
  }

  const idx = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  const PREFIX_RE = /^(NYSE|NASDAQ|EPA|ASX|LON|LSE |FRA|CVE|BME|TSE|TSX):/i;

  for (const entry of unmatched) {
    const ticker = entry.ticker.replace(PREFIX_RE, '').toUpperCase();
    const alreadyHas = idx.find(e =>
      e.ticker.toUpperCase() === ticker ||
      (e.file || '').toLowerCase().replace(/\.html$/, '') === ticker.toLowerCase()
    );

    if (alreadyHas) {
      log(`SKIP ${ticker} — already has a report`);
      continue;
    }

    log(`Processing ${entry.ticker}...`);
    try {
      execSync(`node "${path.join(PROJ_ROOT, 'scripts', 'generate-report.js')}" "${entry.ticker}"`, {
        cwd: PROJ_ROOT,
        stdio: 'inherit',
        maxBuffer: 200 * 1024 * 1024,
      });
      log(`  -> ${ticker} complete`);
    } catch (e) {
      log(`  -> FAILED for ${entry.ticker}: ${e.message}`);
      // Continue with next ticker rather than aborting the whole batch
    }
  }
}

main();