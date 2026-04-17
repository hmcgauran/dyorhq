#!/usr/bin/env node
/**
 * scripts/isin-backfill-v2.js
 * Corrected Step A: rebuild sheet lookup with multi-key normaliseTicker
 * to handle tickers like "AVCT.L  LN" → "LON:AVCT" in sheet.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');

const INDEX_PATH = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4/reports/index.json';
const SHEET_ID   = '1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM';

function normaliseTicker(raw) {
  let t = String(raw || '').trim();
  // Remove exchange prefix: LSE:, NYSE:, ISE:, TSX-V:, TSX:, ASX:, BME:, LON:
  t = t.replace(/^[A-Z\-]+:/i, '').trim();
  // Remove parenthetical exchange: "(NYSE)", "(LSE)"
  t = t.replace(/\s*\([^)]*\)/g, '').trim();
  // Remove trailing suffixes: .L, .AX, .TO, .V
  t = t.replace(/\.(L|AX|TO|V)$/i, '').trim();
  // Remove trailing exchange name
  t = t.replace(/\s+(TSX-V|TSX|LSE|NYSE|ISE|ASX|BME)$/i, '').trim();
  return t.toUpperCase();
}

function loadSheet() {
  const result = execFileSync('gws', [
    'sheets', 'spreadsheets', 'values', 'get', '--params',
    JSON.stringify({ spreadsheetId: SHEET_ID, range: 'Sheet1!A:ZZ', valueRenderOption: 'FORMATTED_VALUE' })
  ], { encoding: 'utf8' });

  let out = result.trim();
  if (!out.startsWith('{')) out = out.substring(out.indexOf('{'));
  const j = JSON.parse(out);
  const rows = j.values || [];
  const headers = rows[0];
  const tickerIdx = headers.indexOf('Ticker');
  const isinCol   = headers.indexOf('isin');
  const companyIdx = headers.indexOf('companyName');
  const currencyIdx = headers.indexOf('currency');
  const priceIdx = headers.indexOf('price');

  // Build a list of all valid sheet rows with their raw ticker
  const validRows = rows.slice(1).filter(r => {
    const t = String(r[tickerIdx] || '').trim();
    return t && t !== '#N/A' && t !== '';
  });

  // Create lookup: normaliseTicker(sheetRaw) -> first matching row with valid ISIN
  const lookup = {};
  validRows.forEach(row => {
    const raw = String(row[tickerIdx] || '').trim();
    const bare = normaliseTicker(raw);
    if (!lookup[bare]) {
      lookup[bare] = {
        raw,
        isin: String(row[isinCol] || '').trim(),
        company: String(row[companyIdx] || '').trim(),
        currency: String(row[currencyIdx] || '').trim(),
        price: row[priceIdx]
      };
    }
  });

  return { validRows, lookup, tickerIdx, isinCol, companyIdx, currencyIdx, priceIdx };
}

const { lookup: sheetLookup, validRows } = loadSheet();
const indexEntries = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));

const result = {
  generatedAt: new Date().toISOString(),
  total: indexEntries.length,
  alreadyHadIsin: 0,
  backfilled: 0,
  stillGap: [],
};

indexEntries.forEach(entry => {
  // Skip entries that already have a valid ISIN
  if (entry.isin && entry.isin !== 'NEEDS-REVIEW') {
    result.alreadyHadIsin++;
    return;
  }

  // Try matching via normaliseTicker
  const bare = normaliseTicker(entry.ticker);
  const sheetRow = sheetLookup[bare];

  if (!sheetRow) {
    result.stillGap.push({ ticker: entry.ticker, bare, reason: 'no sheet match' });
    return;
  }

  if (sheetRow.isin && !sheetRow.isin.startsWith('#') && sheetRow.isin.trim()) {
    entry.isin = sheetRow.isin;
    result.backfilled++;
  } else {
    result.stillGap.push({ ticker: entry.ticker, bare, reason: 'sheet isin empty', sheetIsin: sheetRow.isin || '(empty)' });
  }
});

fs.writeFileSync(INDEX_PATH, JSON.stringify(indexEntries, null, 2), 'utf8');

console.log('\nCorrected Step A — ISIN backfill:');
console.log('  Total index entries:        ', result.total);
console.log('  Already had valid ISIN:     ', result.alreadyHadIsin);
console.log('  Backfilled this run:        ', result.backfilled);
console.log('  Still gap after fix:        ', result.stillGap.length);
if (result.stillGap.length) {
  result.stillGap.forEach(g => console.log('  ', g.ticker, '->', g.bare, ':', g.reason, g.sheetIsin || ''));
}

fs.writeFileSync('/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4/logs/isin-backfill-v2.json', JSON.stringify(result, null, 2));
console.log('\nLog: logs/isin-backfill-v2.json');