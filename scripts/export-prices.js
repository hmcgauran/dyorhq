/**
 * export-prices.js — DYOR HQ v2
 *
 * Fetches live prices from the Google Sheet and exports them to public/prices.json.
 * This file is deployed with the site — the browser reads it locally, no API calls needed.
 *
 * Run once daily via launchd:
 *   node scripts/export-prices.js
 *
 * Output: public/prices.json
 * Format: { "timestamp": "...", "prices": { "AAPL": 189.45, "AVCT.L": 0.66, ... } }
 *
 * Requires: gws CLI authenticated for shugmcgug@gmail.com
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SHEET_ID = '1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM';
const OUTPUT_FILE = path.join(__dirname, '..', 'public', 'prices.json');

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
    console.error('[export] gws error:', err.message);
    return null;
  }
}

function loadTab(tabName) {
  console.log(`[export] Loading tab: ${tabName}`);
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

  const headers = rows[0].map(h => normaliseHeader(h));

  // Ticker column
  let tickerIdx = headers.findIndex(h =>
    ['ticker', 'symbol', 'googlefinance symbol'].includes(h)
  );
  if (tickerIdx < 0) {
    const companyIdx = headers.findIndex(h => h === 'company');
    tickerIdx = headers.findIndex((h, i) => !h && i !== companyIdx);
  }

  // Price column
  const priceIdx = headers.findIndex(h =>
    ['price', 'current price', 'current price default', 'last price'].includes(h)
  );

  const tickers = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length) continue;
    const rawTicker = row[tickerIdx] || '';
    const canonical = normaliseSheetTicker(rawTicker);
    const priceRaw = priceIdx >= 0 ? row[priceIdx] : null;
    const price = parseFloat(String(priceRaw || '').replace(/[,$£€]/g, '')) || null;
    if (!canonical) continue;
    tickers.push({ ticker: canonical, price });
  }
  return tickers;
}

// ─── Main ────────────────────────────────────────────

console.log('[export] Starting price export...');
const timestamp = new Date().toISOString();

const allTickers = new Map();

// Load all three tabs
const tabs = [
  { name: 'Sheet1', universe: 'watchlist' },
  { name: 'Fortune 100', universe: 'fortune100' },
  { name: 'S&P 100 Companies', universe: 'sp100' }
];

tabs.forEach(({ name, universe }) => {
  const rows = loadTab(name);
  rows.forEach(({ ticker, price }) => {
    if (!allTickers.has(ticker)) {
      allTickers.set(ticker, { price, universes: [] });
    }
    const entry = allTickers.get(ticker);
    entry.universes.push(universe);
    if (price !== null) entry.price = price; // prefer non-null price
  });
});

// Build output
const prices = {};
let populated = 0;
allTickers.forEach((data, ticker) => {
  prices[ticker] = data.price;
  if (data.price !== null) populated++;
});

const output = { timestamp, prices };
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

console.log(`[export] Total tickers: ${allTickers.size}, with prices: ${populated}`);
console.log(`[export] Wrote: ${OUTPUT_FILE}`);
console.log('[export] Done.');
