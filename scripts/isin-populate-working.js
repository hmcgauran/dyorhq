#!/usr/bin/env node
/**
 * isin-populate.js — batched ISIN population
 *
 * Finds tickers missing ISIN in Google Sheet, looks them up via Brave Search,
 * and writes all results back in a SINGLE Google Sheets API call.
 *
 * Usage: node scripts/isin-populate-working.js [--limit N]
 *
 * Steps:
 *   1. Fetch all rows from Sheet1 via gws
 *   2. Identify rows where column W (ISIN) is empty/missing
 *   3. Look up ISINs via Brave Search (with local cache)
 *   4. Write ALL found ISINs in one batchUpdate call — one API operation total
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

// Load .env
const ENV_FILE = path.join(__dirname, '..', '.env');
if (fs.existsSync(ENV_FILE)) {
  fs.readFileSync(ENV_FILE, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  });
}

const SHEET_ID     = '1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM';
const CACHE_FILE   = '/Users/hughmcgauran/.openclaw/workspace/state/isin-cache.json';
const FIXES_FILE   = '/tmp/isin-fixes.csv';
const LOG_FILE     = '/tmp/isin-populate-log.txt';
const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY;

// ── Helpers ──────────────────────────────────────────────────────────────────
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function gwsGet(range) {
  const raw = execSync(
    'gws sheets spreadsheets values get --params \'' +
    JSON.stringify({ spreadsheetId: SHEET_ID, range, valueRenderOption: 'FORMATTED_VALUE' }) +
    '\' --format=json',
    { encoding: 'utf8', timeout: 30000 }
  );
  const jsonStart = raw.indexOf('{');
  if (jsonStart === -1) throw new Error('No JSON in gws output: ' + raw.slice(0, 200));
  return JSON.parse(raw.slice(jsonStart));
}

/**
 * Batch write all ISINs in a single API call.
 * data: [ { row: 2, isin: 'GB00B4XYZ123' }, ... ]
 * Google Sheets batchUpdate accepts per-range writes in one request.
 */
function gwsBatchUpdate(data) {
  if (!data.length) return;

  // Build the batch data array — each entry is a separate range write
  const batchData = data.map(({ row, isin }) => ({
    range: `Sheet1!W${row}:W${row}`,
    values: [[isin]],
  }));

  const payload = JSON.stringify({
    valueInputOption: 'USER_ENTERED',
    data: batchData,
  });

  // Use gws sheets spreadsheets values batchUpdate
  const raw = execSync(
    'gws sheets spreadsheets values batchUpdate --params \'' +
    JSON.stringify({ spreadsheetId: SHEET_ID }) +
    '\' --json=\'' + payload + '\'',
    { encoding: 'utf8', timeout: 60000 }
  );
  // gws may prefix output with keyring message — find JSON
  const jsonStart = raw.indexOf('{');
  if (jsonStart === -1) return; // assume success if no error thrown
  const result = JSON.parse(raw.slice(jsonStart));
  if (result.error) throw new Error('batchUpdate error: ' + JSON.stringify(result.error));
  return result;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function braveSearch(query) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', '3');
    https.get(url.toString(), {
      headers: { 'Accept': 'application/json', 'X-Subscription-Token': BRAVE_API_KEY },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 200) resolve(JSON.parse(data));
        else if (res.statusCode === 429) reject(new Error('RATE_LIMIT'));
        else reject(new Error(`HTTP ${res.statusCode}`));
      });
    }).on('error', reject);
  });
}

function extractIsin(text) {
  if (!text) return null;
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{9}[0-9]\b/);
  return match ? match[0] : null;
}

async function searchIsin(ticker, company) {
  try {
    const r = await braveSearch(`${ticker} ${company} ISIN`);
    for (const hit of (r.web?.results || [])) {
      const desc = (hit.description || '') + ' ' + (hit.title || '');
      const isin = extractIsin(desc);
      if (isin) return isin;
    }
    return null;
  } catch (e) {
    log(`  Brave error: ${e.message}`);
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  fs.writeFileSync(LOG_FILE, ''); // clear log
  log('Starting ISIN populate (batched writes)');

  const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1]) || 9999;

  // 1. Fetch all rows
  log('Step 1: Fetching Sheet1!A:W');
  const sheet = gwsGet('Sheet1!A:W');
  const rows = sheet.values || [];
  log(`Total rows (incl header): ${rows.length}`);

  if (rows.length < 2) { log('ERROR: no data rows'); return; }

  const headers   = rows[0];
  const tickerIdx  = headers.indexOf('Ticker');
  const isinIdx    = headers.indexOf('isin');
  const companyIdx = headers.indexOf('companyName');

  if (tickerIdx === -1 || isinIdx === -1 || companyIdx === -1) {
    log('ERROR: required column not found. Headers: ' + JSON.stringify(headers));
    return;
  }

  // 2. Find rows needing ISIN
  const needsFix = [];
  for (let i = 1; i < rows.length; i++) {
    const ticker = rows[i][tickerIdx] || '';
    const isin   = rows[i][isinIdx]   || '';
    const company = rows[i][companyIdx] || '';
    if (!ticker || ticker === '#N/A') continue;
    if (!isin || isin === '' || isin.startsWith('#') || isin.startsWith('BBG')) {
      needsFix.push({ row: i + 1, ticker, company });
    }
  }

  log(`Found ${needsFix.length} rows missing ISIN (limit: ${LIMIT})`);

  // 3. Load cache
  let cache = {};
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      for (const [k, v] of Object.entries(raw)) {
        // Normalise legacy object entries {isin: "..."} to plain strings
        cache[k] = (typeof v === 'object' && v !== null && typeof v.isin === 'string')
          ? v.isin : (typeof v === 'string' ? v : null);
      }
    } catch (e) { log('Cache load error: ' + e.message); }
  }

  // 4. Look up missing ISINs
  const toWrite = []; // { row, ticker, isin }
  const notFound = [];

  for (const { row, ticker, company } of needsFix.slice(0, LIMIT)) {
    // Cache hit
    if (cache[ticker] && cache[ticker].length === 12) {
      log(`  [${ticker}] cache hit: ${cache[ticker]}`);
      toWrite.push({ row, ticker, isin: cache[ticker] });
      continue;
    }

    // Cache miss — search
    log(`  [${ticker}] searching...`);
    const found = await searchIsin(ticker, company);

    if (found) {
      log(`  [${ticker}] found: ${found}`);
      cache[ticker] = found;
      toWrite.push({ row, ticker, isin: found });
    } else {
      log(`  [${ticker}] NOT FOUND`);
      notFound.push({ row, ticker });
    }

    await sleep(500); // Brave rate limit — reads only, writes are batched
  }

  // 5. Save updated cache
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  log(`Cache saved: ${Object.keys(cache).length} entries`);

  // 6. Write fixes CSV (for audit)
  fs.writeFileSync(FIXES_FILE, 'row,ticker,isin,status\n');
  for (const { row, ticker, isin } of toWrite) {
    fs.appendFileSync(FIXES_FILE, `${row},${ticker},${isin},FOUND\n`);
  }
  for (const { row, ticker } of notFound) {
    fs.appendFileSync(FIXES_FILE, `${row},${ticker},,MISSING\n`);
  }
  log(`Fixes CSV: ${FIXES_FILE}`);

  // 7. Batch write to Google Sheet — ONE API CALL regardless of count
  log(`\nBatch writing ${toWrite.length} ISINs to sheet...`);
  if (toWrite.length > 0) {
    try {
      const t0 = Date.now();
      gwsBatchUpdate(toWrite);
      log(`  Batch write OK (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    } catch (e) {
      log(`  BATCH WRITE FAILED: ${e.message}`);
      log('  Falling back to individual writes...');
      // Fallback: per-row writes with 1s delay each (slow but works)
      for (const { row, ticker, isin } of toWrite) {
        try {
          execSync(
            'gws sheets spreadsheets values update --params \'' +
            JSON.stringify({ spreadsheetId: SHEET_ID, range: `Sheet1!W${row}:W${row}`, valueInputOption: 'USER_ENTERED' }) +
            '\' --json=\'{"values":[["' + isin + '"]]}\'',
            { encoding: 'utf8', timeout: 20000 }
          );
          log(`  Wrote row ${row}: ${ticker} -> ${isin}`);
        } catch (e2) {
          log(`  FAILED row ${row}: ${e2.message}`);
        }
        await sleep(1000);
      }
    }
  }

  log(`\nDone. Written: ${toWrite.length} | Not found: ${notFound.length}`);
  log(`Log: ${LOG_FILE}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
