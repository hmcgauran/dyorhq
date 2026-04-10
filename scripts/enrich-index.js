/**
 * enrich-index.js — DYOR HQ v2
 *
 * Fetches live prices from the Google Sheet and enriches the canonical
 * reports/index.json with priceStored, datePublished, lastRefreshed,
 * universe, sector, and exchange fields.
 *
 * Run as part of the build process:
 *   node scripts/enrich-index.js
 *
 * Requires: gws CLI authenticated for shugmcgug@gmail.com
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SHEET_ID = '1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM';
const CANONICAL_INDEX = path.join(__dirname, '..', 'reports', 'index.json');
const PUBLIC_INDEX = path.join(__dirname, '..', 'public', 'reports-index.json');

const TABS = ['Fortune 100', 'S&P 100 Companies'];
const WATCHLIST_TAB = 'Sheet1'; // default tab

// ─── Helpers ────────────────────────────────────────

function normaliseHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[%]/g, ' % ')
    .replace(/[^a-z0-9%]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Normalise sheet ticker to canonical form
// LON:AVCT -> AVCT.L, ETS:SOFI -> SOFI, etc.
function normaliseSheetTicker(ticker) {
  if (!ticker) return null;
  const t = String(ticker).trim().toUpperCase();
  if (t.startsWith('LON:')) return t.slice(4) + '.L';
  if (t.startsWith('ETS:')) return t.slice(4);
  if (t.startsWith('EPA:')) return t.slice(4);
  if (t.startsWith('ETR:')) return t.slice(4);
  if (t.endsWith('.OB')) return t.slice(0, -3);
  return t;
}

function runGws(args) {
  try {
    const result = execFileSync('gws', args, {
      maxBuffer: 1024 * 1024 * 8,
      encoding: 'utf-8'
    });
    return JSON.parse(result);
  } catch (err) {
    console.error('[enrich] gws error:', err.message);
    return null;
  }
}

function loadTab(tabName) {
  console.log(`[enrich] Loading tab: ${tabName}`);
  // Quote sheet name if it contains special chars (ampersand)
  const rangeStr = tabName.includes('&')
    ? `'${tabName}'!A:ZZ`
    : `${tabName}!A:ZZ`;
  const data = runGws([
    'sheets', 'spreadsheets', 'values', 'get',
    '--params', JSON.stringify({ spreadsheetId: SHEET_ID, range: rangeStr })
  ]);
  if (!data || !Array.isArray(data.values)) return [];
  const rows = data.values;
  if (!rows.length) return [];

  // Header row = row 0
  const headers = rows[0].map(h => normaliseHeader(h));

  // Find ticker column: first look for 'Ticker' header, then 'Symbol', then 'Ticker' in col B specifically
  let tickerIdx = headers.findIndex(h =>
    ['ticker', 'symbol', 'googlefinance symbol'].includes(h)
  );
  if (tickerIdx < 0) {
    // Fortune 100 tab: col A=Company, col B=Ticker
    // S&P 100 tab: col A=Company, col B=ticker (empty header)
    // Check if col B header normalises to 'ticker' or is empty (col B is ticker in both tabs)
    const colB = headers[1] || '';
    if (colB === 'ticker' || colB === 'symbol') {
      tickerIdx = 1;
    } else {
      // Fall back to first column with empty header that isn't column 0 (Company)
      tickerIdx = headers.findIndex((h, i) => !h && i > 0);
    }
  }
  const priceIdx = headers.findIndex(h =>
    ['price', 'current price', 'current price default', 'last price'].includes(h)
  );
  const sectorIdx = headers.findIndex(h =>
    ['sector', 'industry sector'].includes(h)
  );
  const exchangeIdx = headers.findIndex(h =>
    ['exchange', 'market'].includes(h)
  );

  const quotes = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length) continue;
    const ticker = String(row[tickerIdx] || '').trim().toUpperCase();
    const priceRaw = priceIdx >= 0 ? row[priceIdx] : null;
    const price = parseFloat(String(priceRaw || '').replace(/[,$£€]/g, '')) || null;
    if (!ticker) continue;
    const canonical = normaliseSheetTicker(ticker);
    quotes.push({
      ticker: canonical,
      rawTicker: ticker,
      price: Number.isFinite(price) ? price : null,
      sector: sectorIdx >= 0 ? String(row[sectorIdx] || '').trim() : null,
      exchange: exchangeIdx >= 0 ? String(row[exchangeIdx] || '').trim() : null
    });
  }
  console.log(`[enrich]   ${quotes.length} rows from ${tabName}`);
  return quotes;
}

function buildPriceMap() {
  const map = {};
  // Default watchlist tab
  const watchlist = loadTab(WATCHLIST_TAB);
  watchlist.forEach(q => { map[q.ticker] = { ...q, universes: ['watchlist'] }; });

  // Fortune 100 tab
  const fortune = loadTab('Fortune 100');
  fortune.forEach(q => {
    if (map[q.ticker]) {
      if (!map[q.ticker].universes.includes('fortune100')) map[q.ticker].universes.push('fortune100');
      if (q.sector) map[q.ticker].sector = q.sector;
      if (q.exchange) map[q.ticker].exchange = q.exchange;
    } else {
      map[q.ticker] = { ...q, universes: ['fortune100'] };
    }
  });

  // S&P 100 tab
  const sp100 = loadTab('S&P 100 Companies');
  sp100.forEach(q => {
    if (map[q.ticker]) {
      if (!map[q.ticker].universes.includes('sp100')) map[q.ticker].universes.push('sp100');
      if (q.sector) map[q.ticker].sector = q.sector;
      if (q.exchange) map[q.ticker].exchange = q.exchange;
    } else {
      map[q.ticker] = { ...q, universes: ['sp100'] };
    }
  });

  return map;
}

function parseNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const text = String(v || '').trim();
  if (!text) return null;
  const cleaned = text.replace(/[,$£€]/g, '').replace(/\(([^)]+)\)/, '-$1').replace(/%$/, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ─── Main ────────────────────────────────────────────

console.log('[enrich] Starting index enrichment...');
const now = new Date().toISOString();

// Build price map from all tabs
const priceMap = buildPriceMap();
const tickersWithPrices = Object.keys(priceMap).length;
console.log(`[enrich] Price map built: ${tickersWithPrices} tickers`);

// Read canonical index
if (!fs.existsSync(CANONICAL_INDEX)) {
  console.error('[enrich] Canonical index not found:', CANONICAL_INDEX);
  process.exit(1);
}

const canonical = JSON.parse(fs.readFileSync(CANONICAL_INDEX, 'utf-8'));
console.log(`[enrich] Canonical entries: ${canonical.length}`);

// Enrich each entry
let enriched = 0;
let withPrice = 0;
let missingPrice = [];

canonical.forEach(entry => {
  const ticker = String(entry.ticker || '').toUpperCase();
  const sheetData = priceMap[ticker];

  // datePublished: use ISO datePublished if available; ISO date field otherwise
  // Never overwrite date/datePublished with HTML-sourced non-ISO dates
  if (!entry.datePublished && entry.date) {
    entry.datePublished = entry.date;
  }
  // Always normalise date to match datePublished (both ISO)
  if (entry.datePublished) {
    entry.date = entry.datePublished;
  }

  // lastRefreshed: now (this run)
  entry.lastRefreshed = now;

  // priceStored: from sheet
  if (sheetData && sheetData.price) {
    entry.priceStored = sheetData.price;
    withPrice++;
  } else {
    entry.priceStored = null;
    missingPrice.push(ticker);
  }

  // universe: default watchlist unless assigned in sheet
  entry.universes = sheetData?.universes || entry.universes || ['watchlist'];

  // sector, exchange from sheet
  if (sheetData) {
    if (sheetData.sector) entry.sector = sheetData.sector;
    if (sheetData.exchange) entry.exchange = sheetData.exchange;
  }

  // Ensure null instead of undefined for optional fields
  if (!entry.sector) entry.sector = null;
  if (!entry.exchange) entry.exchange = null;
  if (!entry.isin) entry.isin = null;

  enriched++;
});

console.log(`[enrich] Enriched: ${enriched} entries, ${withPrice} with price`);
// Write enriched canonical index
fs.writeFileSync(CANONICAL_INDEX, JSON.stringify(canonical, null, 2));
console.log(`[enrich] Wrote: ${CANONICAL_INDEX}`);

// Write public derived index
fs.writeFileSync(PUBLIC_INDEX, JSON.stringify(canonical, null, 2));
console.log(`[enrich] Wrote: ${PUBLIC_INDEX}`);

if (missingPrice.length) {
  console.warn(`[enrich] No price found for: ${missingPrice.join(', ')}`);
}

console.log('[enrich] Done.');
