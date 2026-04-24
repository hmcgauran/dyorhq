#!/usr/bin/env node
'use strict';
const { execSync } = require('child_process');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const SHEET_ID = '1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM';

function gwsGet(range) {
  const params = JSON.stringify({ spreadsheetId: SHEET_ID, range, valueRenderOption: 'FORMATTED_VALUE' });
  const raw = execSync(
    'gws sheets spreadsheets values get --params \'' + params + '\' --format=json',
    { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, timeout: 60000, cwd: __dirname }
  );
  const jsonStart = raw.indexOf('{');
  if (jsonStart === -1) throw new Error('No JSON in gws output: ' + raw.slice(0, 200));
  return JSON.parse(raw.slice(jsonStart));
}

const HEADERS = [
  'ticker','price','open','high','low','volume','marketCap','updatedAt','delay',
  'avgVolume','pe','eps','52wHigh','52wLow','change','changePct','prevClose',
  'sharesOut','currency','companyName','universe','portfolioStatus','isin',
  'beta','canonical_ticker','slug','universe_tags','primaryExchange','country',
  'sector','industry','ticker_aliases','report_file','research_slug','hasReport',
  'hasResearch','reportDate','researchDate','lastRnsDate','needsRefresh',
  'thesisStatus','priority','companyNameNormalised'
];

const NUMERIC_FIELDS = new Set([
  'price','open','high','low','volume','marketCap','avgVolume','pe','eps',
  '52wHigh','52wLow','change','changePct','prevClose','sharesOut','beta',
  'delay','priority'
]);

function coerce(key, val) {
  if (val === '' || val === '#N/A' || val === '#REF!' || val == null) return null;
  if (NUMERIC_FIELDS.has(key)) {
    const n = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }
  return val;
}

console.log('Fetching sheet...');
const data = gwsGet('Sheet1!A:AQ');
const rows = data.values || [];
if (rows.length < 2) throw new Error('Fewer than 2 rows — aborting');

const tickers = [];
for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const obj = {};
  for (let j = 0; j < HEADERS.length; j++) {
    obj[HEADERS[j]] = coerce(HEADERS[j], row[j] ?? null);
  }
  if (!obj.ticker || obj.ticker === 'Ticker') continue;
  if (!obj.research_slug && obj.slug) obj.research_slug = obj.slug;
  if (!obj.research_slug && obj.companyName) {
    obj.research_slug = obj.companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  tickers.push(obj);
}

const ROOT = require('path').resolve(__dirname, '..');
const STATE_DIR = require('path').join(ROOT, 'state');
const LATEST = require('path').join(STATE_DIR, 'sheet-latest.json');
const snapshot = { downloadedAt: new Date().toISOString(), rowCount: tickers.length, tickers };
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const fs = require('fs');
fs.writeFileSync(require('path').join(STATE_DIR, 'sheet-' + ts + '.json'), JSON.stringify(snapshot, null, 2));
fs.writeFileSync(LATEST, JSON.stringify(snapshot, null, 2));
console.log('Downloaded ' + tickers.length + ' tickers');

// Verify new tickers
const newCheck = ['EPA:AI','STM','EPA:IFX','YSS','EPA:SESG','TSAT'];
console.log('\nNew ticker check:');
for (const t of newCheck) {
  const row = tickers.find(r => r.ticker === t);
  if (row) {
    console.log('  ' + t + ': universe=\"' + (row.universe || '') + '\" | slug=\"' + (row.research_slug || '') + '\"');
  } else {
    console.log('  ' + t + ': NOT FOUND');
  }
}

// Check ETL
const etl = tickers.find(r => r.ticker === 'ETL');
console.log('  ETL: ' + (etl ? 'found as \"' + etl.ticker + '\"' : 'NOT FOUND'));