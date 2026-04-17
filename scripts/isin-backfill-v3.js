#!/usr/bin/env node
/**
 * scripts/isin-backfill-v3.js
 * Final corrected ISIN backfill with improved normaliseTicker.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');

const INDEX_PATH = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4/reports/index.json';
const SHEET_ID   = '1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM';

function normaliseTicker(raw) {
  let t = String(raw || '').trim();
  t = t.replace(/^[A-Z\-]+:/i, '').trim();
  t = t.replace(/\s*\/\s*.*$/, '').trim();
  t = t.replace(/\s*\([^)]*\)/g, '').trim();
  t = t.replace(/\.[A-Z]{1,4}(?:\s|$|$)/i, '').trim();
  t = t.replace(/\s+(LN|US|NO|SS|AU|FS|TK)$/i, '').trim();
  t = t.replace(/\s+(LSE|NYSE|TSX|ASX|AIM|NMS|CME)$/i, '').trim();
  return t.toUpperCase();
}

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

// Build lookup: normaliseTicker(sheetTicker) -> {isin, raw, company, currency, price}
const lookup = {};
rows.slice(1).forEach(row => {
  const t = String(row[tickerIdx] || '').trim();
  if (!t || t === '#N/A') return;
  const bare = normaliseTicker(t);
  if (!lookup[bare]) {
    lookup[bare] = {
      raw: t,
      isin: String(row[isinCol] || '').trim(),
      company: String(row[companyIdx] || '').trim(),
      currency: String(row[currencyIdx] || '').trim(),
      price: row[priceIdx]
    };
  }
});

const indexEntries = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));

const report = {
  generatedAt: new Date().toISOString(),
  total: indexEntries.length,
  alreadyHadIsin: 0,
  backfilled: [],
  stillGap: []
};

indexEntries.forEach(entry => {
  if (entry.isin && entry.isin !== 'NEEDS-REVIEW') {
    report.alreadyHadIsin++;
    return;
  }

  const bare = normaliseTicker(entry.ticker);
  const sheetRow = lookup[bare];

  if (!sheetRow) {
    report.stillGap.push({ ticker: entry.ticker, bare, reason: 'no sheet match' });
    return;
  }

  if (sheetRow.isin && !sheetRow.isin.startsWith('#') && sheetRow.isin.trim()) {
    entry.isin = sheetRow.isin;
    report.backfilled.push({ bare, isin: sheetRow.isin });
  } else {
    report.stillGap.push({ ticker: entry.ticker, bare, reason: 'sheet isin empty', sheetIsin: sheetRow.isin || '(empty)' });
  }
});

fs.writeFileSync(INDEX_PATH, JSON.stringify(indexEntries, null, 2), 'utf8');

console.log('\nCorrected Step A v3 — ISIN backfill:');
console.log('  Total entries:             ', report.total);
console.log('  Already had valid ISIN:    ', report.alreadyHadIsin);
console.log('  Backfilled this run:       ', report.backfilled.length);
report.backfilled.forEach(b => console.log('    ' + b.bare + ' -> ' + b.isin));
console.log('  Still gap:                 ', report.stillGap.length);
report.stillGap.forEach(g => console.log('    ' + g.ticker + ' -> ' + g.bare + ': ' + g.reason));

fs.writeFileSync('/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4/logs/isin-backfill-v3.json', JSON.stringify(report, null, 2));
console.log('\nLog: logs/isin-backfill-v3.json');