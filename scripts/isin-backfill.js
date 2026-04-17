#!/usr/bin/env node
/**
 * scripts/isin-backfill.js
 * Phase 2 Step A: ISIN backfill from sheet using correct gws invocation.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');

const INDEX_PATH = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4/reports/index.json';
const SHEET_ID   = '1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM';

function normaliseTicker(raw) {
  let t = String(raw || '').trim();
  t = t.replace(/^[A-Z\-]+:/i, '').trim();
  t = t.replace(/\s*\([^)]*\)/g, '').trim();
  t = t.replace(/\.(L|AX|TO|V)$/i, '').trim();
  t = t.replace(/\s+(TSX-V|TSX|LSE|NYSE|ISE|ASX|BME)$/i, '').trim();
  return t.toUpperCase();
}

function loadSheet() {
  // Use the exact same invocation pattern as rns-backfill.js
  const result = execFileSync('gws', [
    'sheets', 'spreadsheets', 'values', 'get', '--params',
    JSON.stringify({ spreadsheetId: SHEET_ID, range: 'Sheet1!A:ZZ', valueRenderOption: 'FORMATTED_VALUE' })
  ], { encoding: 'utf8' });

  let out = result;
  // Strip keyring line if present
  if (out.includes('\n') && !out.trim().startsWith('{')) {
    const lines = out.split('\n');
    const jsonStart = lines.findIndex(l => l.trim().startsWith('{'));
    if (jsonStart > 0) out = lines.slice(jsonStart).join('\n');
  }

  const sheetData = JSON.parse(out.trim());
  const rows = (sheetData.values || []);
  const headers = (rows[0] || []).map((h, i) => ({ h: String(h || '').trim(), i }));

  const tickerIdx  = headers.find(x => x.h === 'Ticker')?.i;
  const isinIdx   = headers.find(x => x.h === 'isin')?.i;
  const companyIdx = headers.find(x => x.h === 'companyName')?.i;
  const currencyIdx = headers.find(x => x.h === 'currency')?.i;

  return rows.slice(1).map(row => ({
    ticker:   String(row[tickerIdx] || '').trim(),
    isin:     String(row[isinIdx] || '').trim(),
    company:  String(row[companyIdx] || '').trim(),
    currency: String(row[currencyIdx] || '').trim(),
  }));
}

const sheetRows = loadSheet();

// Build lookup by normaliseTicker
const sheetByNorm = {};
sheetRows.forEach(r => {
  if (!r.ticker) return;
  const bare = normaliseTicker(r.ticker);
  if (!sheetByNorm[bare]) sheetByNorm[bare] = r;
});

const indexEntries = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));

const result = {
  generatedAt: new Date().toISOString(),
  total: indexEntries.length,
  alreadyHadIsin: 0,
  backfilled: 0,
  gap: [],
  sheetHasIsinCount: Object.values(sheetByNorm).filter(r => r.isin && !r.isin.startsWith('#') && r.isin.length > 0).length,
  sheetTickersCount: Object.keys(sheetByNorm).length,
};

indexEntries.forEach(entry => {
  const bare = normaliseTicker(entry.ticker);
  const sheetRow = sheetByNorm[bare];

  if (!sheetRow) {
    result.gap.push({ ticker: bare, reason: 'no sheet match', company: entry.company });
    return;
  }

  if (entry.isin && entry.isin !== 'NEEDS-REVIEW') {
    result.alreadyHadIsin++;
    return;
  }

  if (sheetRow.isin && !sheetRow.isin.startsWith('#') && sheetRow.isin.length > 0) {
    entry.isin = sheetRow.isin;
    result.backfilled++;
  } else {
    result.gap.push({
      ticker: bare,
      reason: 'sheet has no ISIN',
      company: entry.company,
      sheetCurrency: sheetRow.currency
    });
  }
});

fs.writeFileSync(INDEX_PATH, JSON.stringify(indexEntries, null, 2), 'utf8');

console.log('\nStep A — ISIN backfill from sheet:');
console.log('  Total index entries:        ', result.total);
console.log('  Sheet rows with data:        ', result.sheetTickersCount);
console.log('  Sheet rows with ISIN:        ', result.sheetHasIsinCount);
console.log('  Already had valid ISIN:      ', result.alreadyHadIsin);
console.log('  Backfilled from sheet:       ', result.backfilled);
console.log('  Gap (no ISIN in sheet):      ', result.gap.length);
if (result.gap.length) {
  console.log('');
  result.gap.forEach(g => console.log(`    ${g.ticker} | ${g.company || '-'} | ${g.reason} | currency: ${g.sheetCurrency || '-'}`));
}

fs.writeFileSync('/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4/logs/isin-backfill.json', JSON.stringify(result, null, 2));
console.log('\nLog: logs/isin-backfill.json');