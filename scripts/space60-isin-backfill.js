#!/usr/bin/env node
/**
 * space60-isin-backfill.js
 * Fetches ISINs from OpenFIGI for the 44 Space 60 tickers and writes to Google Sheet column W.
 */
const { execSync } = require('child_process');
const fs = require('fs');

const SHEET_ID = '1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM';
const LOG_FILE = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4/logs/space60-isin-backfill.json';

const SPACE60_TICKERS = [
  'MP','AA','TECK','ALM','FCX',
  'CRS','MTRN','HXL','ATI','GLW','PKE',
  'ADI','MCHP','QRVO','MRCY','TTMI','COHR','LITE','AVGO','NVDA',
  'APD','NEU',
  'TDY','APH','KRMN','RBC','PH','MOG.A','AME','GHM','APTV',
  'RDW','RKLB','KTOS','FLY','NOC','VOYG','MDA','LUNR',
  'GILT','VSAT','GSAT','BKSY','IRDM'
];

const OPENFIGI_URL = 'https://api.openfigi.com/v3/mapping';

function getSheetRows(range) {
  const raw = execSync('gws sheets spreadsheets values get --params \'' +
    JSON.stringify({ spreadsheetId: SHEET_ID, range, valueRenderOption: 'FORMATTED_VALUE' }) +
    '\' --format=json 2>/dev/null', { encoding: 'utf8' });
  return JSON.parse(raw).values || [];
}

function writeSheetCell(row, value) {
  const cell = 'W' + row;
  execSync('gws sheets spreadsheets values update --params \'' +
    JSON.stringify({ spreadsheetId: SHEET_ID, range: 'Sheet1!' + cell + ':' + cell, valueInputOption: 'USER_ENTERED' }) +
    '\' --json=\'{"values":[[' + JSON.stringify(value) + ']]}\' 2>/dev/null', { encoding: 'utf8' });
}

function fetchISIN(ticker) {
  const body = JSON.stringify([{ idType: 'TICKER', idValue: ticker }]);
  try {
    const raw = execSync('curl -s -X POST "' + OPENFIGI_URL + '" -H "Content-Type: application/json" -d \'' + body.replace(/'/g, "'\\''") + '\'', { encoding: 'utf8', timeout: 10000 });
    const data = JSON.parse(raw);
    if (Array.isArray(data) && data[0]?.data?.[0]?.figi) {
      return data[0].data[0].figi;
    }
  } catch {}
  return null;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('Fetching ISINs for', SPACE60_TICKERS.length, 'Space 60 tickers...');

  // Load current sheet to map ticker -> row number
  const allRows = getSheetRows('Sheet1!A336:A466');
  const tickerToRow = {};
  allRows.forEach((row, i) => {
    const t = String(row[0] || '').trim();
    if (t) tickerToRow[t] = 336 + i;
  });

  console.log('Sheet rows loaded:', Object.keys(tickerToRow).length);
  const results = [];
  const errors = [];

  for (const ticker of SPACE60_TICKERS) {
    const row = tickerToRow[ticker];
    if (!row) {
      console.log('[SKIP]', ticker, '- not in sheet rows 336-466');
      continue;
    }

    const isin = fetchISIN(ticker);
    if (isin) {
      writeSheetCell(row, isin);
      results.push({ ticker, row, isin });
      console.log('[OK]', ticker, '-> row', row, '-> ISIN', isin);
    } else {
      errors.push({ ticker, row });
      console.log('[MISS]', ticker, '- no ISIN from OpenFIGI');
    }

    await delay(100); // Rate limit
  }

  const report = { generatedAt: new Date().toISOString(), total: SPACE60_TICKERS.length, fetched: results.length, failed: errors.length, results, errors };
  fs.writeFileSync(LOG_FILE, JSON.stringify(report, null, 2));
  console.log('\nDone. fetched:', results.length, '| failed:', errors.length);
  console.log('Log:', LOG_FILE);
}

run().catch(e => { console.error(e); process.exit(1); });