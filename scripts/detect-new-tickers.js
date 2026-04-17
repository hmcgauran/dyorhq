#!/usr/bin/env node
/**
 * scripts/detect-new-tickers.js
 *
 * Reads Column A from the Google Sheet (all rows, no skipping),
 * matches against reports/index.json using three-tier resolver,
 * writes unmatched tickers to state/new-tickers.json.
 *
 * Usage: node scripts/detect-new-tickers.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SHEET_ID = '1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM';
const INDEX_PATH = path.join(__dirname, '..', 'reports', 'index.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'state', 'new-tickers.json');

// Strip exchange prefixes and suffixes for comparison
const PREFIX_RE  = /^(NYSE|NASDAQ|EPA|ASX|LON|LSE |FRA|CVE|BME|TSE|TSX|HKEX):/i;
const SUFFIX_RE  = /\.(L|AX|TO|V)(?=\s|$)/i;
const SPACE_EX_RE = /\s+(LN|LSE|ISE|TSX|ASE|NYSE|NASDAQ|EPA|ASX|BME|FRA|CVE|TSE|SGX|HKEX)$/i;

function normaliseForMatch(str) {
  return (str || '').replace(PREFIX_RE, '').replace(SUFFIX_RE, '').replace(SPACE_EX_RE, '').replace(/\s{2,}/g, ' ').trim().toUpperCase();
}
function normaliseTicker(str) {
  return (str || '').trim();
}

// ── Three-tier resolver ────────────────────────────────────────────────────────
function resolveTicker(sheetTicker, idx) {
  const n = normaliseForMatch(sheetTicker);
  if (!n) return null;

  // Tier 1: exact match on normalised ticker
  if (idx.find(e => normaliseForMatch(e.ticker) === n)) return 'exact';

  // Tier 2: file slug match
  const slug = n.toLowerCase().replace(/[^a-z0-9]/g, '') + '.html';
  if (idx.find(e => e.file && e.file.toLowerCase() === slug)) return 'slug:' + slug;

  // Tier 3: canonical_ticker match
  const ct = idx.find(e => (e.canonical_ticker || '').toUpperCase() === n);
  if (ct) return 'canonical:' + ct.ticker;

  // Tier 4: company name match (partial, last resort)
  const cn = idx.find(e => (e.company || '').toUpperCase().includes(n) || n.includes((e.company || '').toUpperCase()));
  if (cn) return 'company:' + cn.ticker;

  return null;
}

// ── Fetch Column A from Google Sheet via GWS CLI ────────────────────────────────
function fetchColumnA() {
  const raw = execSync(
    `gws sheets spreadsheets get --params '{"spreadsheetId": "${SHEET_ID}", "includeGridData": true}' --format json 2>/dev/null`,
    { maxBuffer: 80 * 1024 * 1024 }
  ).toString('utf8');

  const sheet = JSON.parse(raw);
  const rowData = sheet?.sheets?.[0]?.data?.[0]?.rowData || [];

  const results = [];
  for (let i = 1; i < rowData.length; i++) {
    const row = rowData[i];
    const vals = row?.values || [];
    if (!vals || vals.length === 0) continue;

    // Column A is always index 0, regardless of header alignment
    const raw = vals[0];
    let ticker;
    if (typeof raw === 'string') {
      ticker = raw.trim();
    } else if (raw && typeof raw === 'object') {
      ticker = (raw.formattedValue || raw.effectiveValue || '').toString().trim();
    } else {
      ticker = String(raw || '').trim();
    }

    // Skip empty, header duplicates, and garbage
    if (!ticker || ticker === 'Ticker' || ticker === '[object Object]' || ticker === '#REF!' || ticker === '#N/A') {
      continue;
    }

    results.push({ row: i + 1, ticker });
  }

  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  console.log('Reading index...');
  const idx = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  console.log(`  ${idx.length} entries in index`);

  console.log('Fetching sheet Column A...');
  const sheetTickers = fetchColumnA();
  console.log(`  ${sheetTickers.length} valid rows in sheet`);

  const matched = [];
  const unmatched = [];

  for (const { row, ticker } of sheetTickers) {
    const result = resolveTicker(ticker, idx);
    if (result) {
      matched.push({ row, ticker, match: result });
    } else {
      unmatched.push({ row, ticker });
    }
  }

  console.log(`\n  Matched  : ${matched.length}`);
  console.log(`  Unmatched: ${unmatched.length}`);

  if (unmatched.length > 0) {
    console.log(`\nUnmatched (${unmatched.length}):`);
    // Group by exchange prefix
    const byPrefix = {};
    for (const u of unmatched) {
      const prefix = u.ticker.match(/^[A-Z]+:/)?.[0] || '(no prefix)';
      if (!byPrefix[prefix]) byPrefix[prefix] = [];
      byPrefix[prefix].push(u.ticker);
    }
    for (const [prefix, tickers] of Object.entries(byPrefix)) {
      console.log(`  ${prefix} (${tickers.length}): ${tickers.slice(0, 5).join(', ')}${tickers.length > 5 ? '...' : ''}`);
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    sheetRows: sheetTickers.length,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    unmatched,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\nWritten: ${OUTPUT_PATH}`);
  return output;
}

main();
