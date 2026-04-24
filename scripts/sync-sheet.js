#!/usr/bin/env node
'use strict';

/**
 * sync-sheet.js
 *
 * Downloads the full Google Sheet as a local JSON snapshot.
 * This is the ONLY script that calls the Google Sheets API.
 * All downstream scripts read from state/sheet-latest.json.
 *
 * Output:
 *   state/sheet-YYYY-MM-DDTHHMMSS.json   — timestamped archive
 *   state/sheet-latest.json              — always points to most recent
 *
 * Usage:
 *   node scripts/sync-sheet.js
 */

const fs      = require('fs');
const path    = require('path');
const { execSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT       = path.resolve(__dirname, '..');
const STATE_DIR  = path.join(ROOT, 'state');
const LATEST     = path.join(STATE_DIR, 'sheet-latest.json');
const SHEET_ID   = '1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM';
const RANGE      = 'Sheet1!A:AQ';

// Column headers in sheet order — must match the sheet exactly
const HEADERS = [
  'ticker', 'price', 'open', 'high', 'low', 'volume', 'marketCap',
  'updatedAt', 'delay', 'avgVolume', 'pe', 'eps', '52wHigh', '52wLow',
  'change', 'changePct', 'prevClose', 'sharesOut', 'currency', 'companyName',
  'universe', 'portfolioStatus', 'isin', 'beta', 'canonical_ticker', 'slug',
  'universe_tags', 'primaryExchange', 'country', 'sector', 'industry',
  'ticker_aliases', 'report_file', 'research_slug', 'hasReport', 'hasResearch',
  'reportDate', 'researchDate', 'lastRnsDate', 'needsRefresh', 'thesisStatus',
  'priority', 'companyNameNormalised'
];

const NUMERIC_FIELDS = new Set([
  'price', 'open', 'high', 'low', 'volume', 'marketCap', 'avgVolume',
  'pe', 'eps', '52wHigh', '52wLow', 'change', 'changePct', 'prevClose',
  'sharesOut', 'beta', 'delay', 'priority'
]);

function coerce(key, val) {
  if (val === '' || val === '#N/A' || val === '#REF!' || val === null || val === undefined) return null;
  if (NUMERIC_FIELDS.has(key)) {
    const n = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }
  return val;
}

function gwsGet(range) {
  const raw = execSync(
    `gws sheets spreadsheets values get --params '${JSON.stringify({ spreadsheetId: SHEET_ID, range, valueRenderOption: 'FORMATTED_VALUE' })}' --format=json`,
    { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, timeout: 60000 }
  );
  const jsonStart = raw.indexOf('{');
  if (jsonStart === -1) throw new Error('No JSON in gws output: ' + raw.slice(0, 200));
  return JSON.parse(raw.slice(jsonStart));
}

function main() {
  console.log('Fetching sheet from Google Sheets API...');
  const data = gwsGet(RANGE);
  const rows = data.values || [];

  if (rows.length < 2) throw new Error('Sheet returned fewer than 2 rows — aborting');

  // Skip header row (row 0), map each data row to a named object
  const tickers = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const obj = {};
    for (let j = 0; j < HEADERS.length; j++) {
      obj[HEADERS[j]] = coerce(HEADERS[j], row[j] ?? null);
    }

    // Skip rows with no ticker or garbage ticker values
    if (!obj.ticker || obj.ticker === 'Ticker') continue;

    // Use research_slug if available, fall back to slug, then derive from companyName
    if (!obj.research_slug && obj.slug) obj.research_slug = obj.slug;
    if (!obj.research_slug && obj.companyName) {
      obj.research_slug = obj.companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    tickers.push(obj);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const snapshot = {
    downloadedAt: new Date().toISOString(),
    rowCount: tickers.length,
    tickers,
  };

  // Write timestamped archive
  const archivePath = path.join(STATE_DIR, `sheet-${ts}.json`);
  fs.writeFileSync(archivePath, JSON.stringify(snapshot, null, 2));

  // Write/overwrite latest
  fs.writeFileSync(LATEST, JSON.stringify(snapshot, null, 2));

  console.log(`Downloaded ${tickers.length} tickers`);
  console.log(`Archived : state/sheet-${ts}.json`);
  console.log(`Latest   : state/sheet-latest.json`);
}

main();
