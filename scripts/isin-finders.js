#!/usr/bin/env node
/**
 * isin-populate.js
 * Finds tickers missing ISIN in Google Sheet, looks them up, and writes back.
 * 
 * Usage: node /tmp/isin-populate.js [--limit N]
 * 
 * Steps:
 * 1. Fetch all rows from Sheet1 via gws
 * 2. Identify rows where column W (ISIN) is empty/wrong
 * 3. Look up ISIN via SEC EDGAR (US), LSE (UK), or web search (other)
 * 4. Write all fixes to /tmp/isin-updates.csv (dry run — actual update commands)
 * 5. Apply updates via gws
 */
'use strict';

const fs = require('fs');
const { execSync } = require('child_process');
const https = require('https');

const SHEET_ID = '1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM';
const STATE_DIR = '/tmp';
const FIXES_FILE = '/tmp/isin-fixes.csv';
const COMMANDS_FILE = '/tmp/isin-gws-update-commands.txt';
const LOG_FILE = '/tmp/isin-populate-log.txt';
const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY;

// ── Helpers ────────────────────────────────────────────────────────────────
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function gwsGet(range) {
  const raw = execSync(
    'gws sheets spreadsheets values get --params \'' +
    JSON.stringify({ spreadsheetId: SHEET_ID, range, valueRenderOption: 'FORMATTED_VALUE' }) +
    '\' --format=json 2>&1',
    { encoding: 'utf8', timeout: 30 }
  );
  try { return JSON.parse(raw); }
  catch { console.error('GWS parse error, raw:', raw.slice(0, 300)); throw new Error(raw); }
}

function gwsUpdate(range, values) {
  execSync(
    'gws sheets spreadsheets values update --params \'' +
    JSON.stringify({ spreadsheetId: SHEET_ID, range, valueInputOption: 'USER_ENTERED' }) +
    '\' --json=\'{"values":' + JSON.stringify(values) + '}\' 2>&1',
    { encoding: 'utf8', timeout: 20 }
  );
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function braveSearch(query) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', '3');
    const options = {
      headers: { 'Accept': 'application/json', 'X-Subscription-Token': BRAVE_API_KEY }
    };
    https.get(url.toString(), options, res => {
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
  const match = text.match(/[A-Z]{2}[A-Z0-9]{9}[0-9]{2}/);
  return match ? match[0] : null;
}

function searchIsin(ticker, company) {
  return braveSearch(`${ticker} ${company} ISIN`).then(r => {
    for (const hit of (r.web?.results || [])) {
      const desc = (hit.description || '') + ' ' + (hit.title || '');
      const isin = extractIsin(desc);
      if (isin) return isin;
    }
    return null;
  }).catch(() => null);
}

// Fetch company name from SEC by CIK
function fetchCikIsin(cik) {
  if (!cik) return null;
  try {
    const url = `https://data.sec.gov/submissions/CIK${cik.padStart(10,'0')}.json`;
    const raw = execSync(`curl -s "${url}" -H "User-Agent: research@dyorhq.ai"`, { encoding: 'utf8', timeout: 10 });
    const data = JSON.parse(raw);
    const tickers = data.tickers || [];
    const sicDescription = data.sicDescription || '';
    // Get latest 10-K filing for country of incorporation hint
    return data.name; // We mainly use this to confirm company match
  } catch { return null; }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  fs.writeFileSync(LOG_FILE, ''); // clear log
  log('Starting ISIN populate script');
  
  const limitArg = process.argv.find(a => a.startsWith('--limit='));
  const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : null;
  
  log('Step 1: Fetching all sheet rows (A:W)');
  const sheet = gwsGet('Sheet1!A:W');
  const rows = sheet.values || [];
  log(`Total rows (incl header): ${rows.length}`);
  
  if (rows.length < 2) { log('ERROR: No data rows found'); return; }
  
  const headers = rows[0];
  const tickerIdx = headers.indexOf('Ticker');
  const isinIdx = headers.indexOf('isin');
  const companyIdx = headers.indexOf('companyName');
  
  log(`Columns: ticker=${tickerIdx}, isin=${isinIdx}, company=${companyIdx}`);
  
  const needsFix = []; // { row, ticker, company, currentIsin }
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const ticker = row[tickerIdx] || '';
    const isin = row[isinIdx] || '';
    const company = row[companyIdx] || '';
    
    if (!ticker || ticker === '#N/A') continue;
    
    const isinMissing = !isin || isin === '' || isin.startsWith('#') || isin.startsWith('BBG');
    
    if (isinMissing) {
      needsFix.push({ row: i + 1, ticker, company, currentIsin: isin });
      log(`  MISSING/INVALID: row ${i+1} | ${ticker} | current: "${isin}"`);
    }
  }
  
  log(`\nFound ${needsFix.length} rows needing ISIN`);
  if (LIMIT) { log(`Limiting to ${LIMIT} rows`); }
  
  // Load existing ISIN cache
  let cache = {};
  const cacheFile = '/Users/hughmcgauran/.openclaw/workspace/state/isin-cache.json';
  if (fs.existsSync(cacheFile)) {
    try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); }
    catch {}
  }
  
  const fixes = [];
  
  for (const entry of needsFix.slice(0, LIMIT || undefined)) {
    const { row, ticker, company } = entry;
    log(`\nLooking up: ${ticker} (${company})`);
    
    // Check cache first
    if (cache[ticker]) {
      log(`  Cache hit: ${cache[ticker]}`);
      fixes.push({ row, ticker, isin: cache[ticker] });
      continue;
    }
    
    // Try web search for ISIN
    const found = await searchIsin(ticker, company);
    
    if (found) {
      log(`  Found via web: ${found}`);
      cache[ticker] = found;
      fixes.push({ row, ticker, isin: found });
    } else {
      log(`  NOT FOUND — will log as MISSING`);
      fixes.push({ row, ticker, isin: null });
    }
    
    await sleep(500); // rate limit
  }
  
  // Save updated cache
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  log(`\nCache updated: ${cacheFile}`);
  
  // Write fixes CSV
  fs.writeFileSync(FIXES_FILE, 'row,ticker,isin,status\n');
  for (const f of fixes) {
    const status = f.isin ? 'FOUND' : 'MISSING';
    fs.appendFileSync(FIXES_FILE, `${f.row},${f.ticker},${f.isin || ''},${status}\n`);
  }
  log(`Fixes written to: ${FIXES_FILE}`);
  
  // Write gws update commands
  fs.writeFileSync(COMMANDS_FILE, '');
  for (const f of fixes) {
    if (f.isin) {
      const cmd = `gws sheets spreadsheets values update --params '{"spreadsheetId":"${SHEET_ID}","range":"Sheet1!W${f.row}:W${f.row}","valueInputOption":"USER_ENTERED"}' --json='{"values":[["${f.isin}"]]}'`;
      fs.appendFileSync(COMMANDS_FILE, cmd + '\n');
    }
  }
  log(`GWS commands written to: ${COMMANDS_FILE}`);
  
  // Apply updates
  const applied = fixes.filter(f => f.isin);
  log(`\nApplying ${applied.length} updates to sheet...`);
  
  for (const f of applied) {
    try {
      gwsUpdate(`Sheet1!W${f.row}:W${f.row}`, [[f.isin]]);
      log(`  Updated row ${f.row}: ${f.ticker} -> ${f.isin}`);
    } catch (e) {
      log(`  FAILED row ${f.row}: ${e.message}`);
    }
    await sleep(500);
  }
  
  log(`\nDone. Applied: ${applied.length} | Missing: ${fixes.length - applied.length}`);
  log(`Log: ${LOG_FILE}`);
  log(`Fixes CSV: ${FIXES_FILE}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

