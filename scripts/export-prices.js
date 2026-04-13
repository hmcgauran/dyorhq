/**
 * export-prices.js — DYOR HQ v2
 *
 * Fetches live prices from the Google Sheet and exports them to public/prices.json.
 * Run every 30 minutes via launchd:
 *   node scripts/export-prices.js
 *
 * Output: public/prices.json
 * Format:
 * {
 *   "timestamp": "2026-04-11T10:00:00.000Z",
 *   "tickers": {
 *     "AAPL": { "name": "Apple", "price": 260.48, "changePct": 1.23, "change": 3.17,
 *               "high": 262.00, "low": 258.10, "volume": 45210000, "avgVolume": 52000000,
 *               "marketCap": 3940000000000, "week52High": 199.62, "week52Low": 164.08,
 *               "pe": 34.5, "eps": 7.54, "currency": "USD", "exchange": "NASDAQ" },
 *     ...
 *   }
 * }
 *
 * Requires: gws CLI authenticated for shugmcgug@gmail.com
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SHEET_ID = '1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM';
const OUTPUT_FILE = path.join(__dirname, '..', 'public', 'prices.json');
const STATE_DIR = '/Users/hughmcgauran/.openclaw/workspace/state';

// ─── Normalised helpers from google-finance-sheet.js ───────────────────────

function normaliseHeader(value) {
  return String(value || '')
    .trim().toLowerCase()
    .replace(/[%]/g, ' % ')
    .replace(/[^a-z0-9%]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

const COLUMN_ALIASES = {
  ticker: ['ticker', 'symbol', 'quote symbol', 'googlefinance symbol', 'google finance symbol'],
  name: ['name', 'company', 'company name', 'security', 'description'],
  currentPrice: ['price', 'current price', 'current price default', 'last price', 'current', 'quote'],
  dailyChangePct: ['change %', 'daily % move', 'daily change %', '% change', 'day %', 'chg %', 'change pct', 'percentage change'],
  dailyChange: ['change', 'daily change', 'chg', 'day change', 'price change since close'],
  open: ['open', 'day open', "today s opening price"],
  high: ['high', 'day high', 'high price', "today s high"],
  low: ['low', 'day low', 'low price', "today s low"],
  volume: ['volume', 'vol', 'day volume', "today s trading volume"],
  avgVolume: ['avg volume', 'average volume', 'average vol', 'avg vol', 'average daily volume'],
  marketCap: ['market cap', 'mkt cap', 'marketcap', 'market capitalization'],
  week52High: ['52-week high', '52 week high', '52w high', 'year high'],
  week52Low: ['52-week low', '52 week low', '52w low', 'year low'],
  pe: ['p/e', 'pe', 'p/e ratio', 'price to earnings', 'price to earnings ratio'],
  eps: ['eps', 'earnings per share'],
  currency: ['currency', 'ccy', 'trading currency'],
  exchange: ['exchange', 'market'],
};

function looksLikeTicker(value) {
  const text = String(value || '').trim().toUpperCase();
  return Boolean(text) && /^[A-Z][A-Z0-9.-]{0,14}$/.test(text);
}

function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value || '').trim();
  if (!text) return null;
  const cleaned = text
    .replace(/[,$£€]/g, '')
    .replace(/\(([^)]+)\)/, '-$1')
    .replace(/\s+/g, '')
    .replace(/%$/, '');
  const match = cleaned.match(/^(-?\d+(?:\.\d+)?)([KMBT])?$/i);
  if (!match) return null;
  const base = Number.parseFloat(match[1]);
  if (!Number.isFinite(base)) return null;
  const mult = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[match[2]?.toUpperCase()] || 1;
  return base * mult;
}

function buildColumnMap(headers, sampleRows = []) {
  const map = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const index = headers.findIndex((h) => aliases.includes(h));
    if (index >= 0) map[field] = index;
  }
  if (!Number.isInteger(map.ticker)) {
    const tickerIndex = headers.findIndex((h, i) => {
      if (h) return false;
      const values = sampleRows.map(r => r[i]).filter(v => String(v||'').trim()).slice(0, 10);
      return values.length >= 2 && values.every(looksLikeTicker);
    });
    if (tickerIndex >= 0) map.ticker = tickerIndex;
  }
  return map;
}

function normaliseSheetTicker(ticker) {
  if (!ticker) return null;
  const t = String(ticker).trim().toUpperCase();
  if (t.startsWith('LON:')) return t.slice(4) + '.L';
  if (t.startsWith('EPA:')) return t.slice(4);
  if (t.startsWith('ETR:')) return t.slice(4);
  if (t.startsWith('ETS:')) return t.slice(4);
  if (t.endsWith('.OB')) return t.slice(0, -3);
  return t;
}

function getCell(row, index) {
  return Number.isInteger(index) ? row[index] : undefined;
}

function toQuote(row, columnMap) {
  const rawTicker = getCell(row, columnMap.ticker);
  if (!rawTicker) return null;
  const ticker = normaliseSheetTicker(rawTicker);
  if (!ticker) return null;

  const price = parseNumber(getCell(row, columnMap.currentPrice));
  const changePct = parseNumber(getCell(row, columnMap.dailyChangePct));
  const volume = parseNumber(getCell(row, columnMap.volume));
  const avgVolume = parseNumber(getCell(row, columnMap.avgVolume));
  const week52High = parseNumber(getCell(row, columnMap.week52High));
  const week52Low = parseNumber(getCell(row, columnMap.week52Low));

  return {
    ticker,
    name: String(getCell(row, columnMap.name) || '').trim() || null,
    ok: Number.isFinite(price) && price > 0,
    price: Number.isFinite(price) ? price : null,
    changePct: changePct ?? null,
    change: parseNumber(getCell(row, columnMap.dailyChange)) ?? null,
    open: parseNumber(getCell(row, columnMap.open)) ?? null,
    high: parseNumber(getCell(row, columnMap.high)) ?? null,
    low: parseNumber(getCell(row, columnMap.low)) ?? null,
    volume: volume ?? null,
    avgVolume: avgVolume ?? null,
    volumeRatio: Number.isFinite(volume) && Number.isFinite(avgVolume) && avgVolume > 0
      ? parseFloat((volume / avgVolume).toFixed(2)) : null,
    marketCap: parseNumber(getCell(row, columnMap.marketCap)) ?? null,
    week52High: week52High ?? null,
    week52Low: week52Low ?? null,
    pe: parseNumber(getCell(row, columnMap.pe)) ?? null,
    eps: parseNumber(getCell(row, columnMap.eps)) ?? null,
    currency: String(getCell(row, columnMap.currency) || '').trim() || null,
    exchange: String(getCell(row, columnMap.exchange) || '').trim() || null,
  };
}

// ─── GWS wrapper ────────────────────────────────────────────────────────────

function runGws(args) {
  try {
    const result = execFileSync('gws', args, { maxBuffer: 1024 * 1024 * 8, encoding: 'utf-8' });
    return JSON.parse(result);
  } catch (err) {
    console.error('[export] gws error:', err.message);
    return null;
  }
}

function loadTab(tabName) {
  const rangeStr = tabName.includes('&')
    ? `'${tabName}'!A:ZZ`
    : `${tabName}!A:ZZ`;
  const data = runGws([
    'sheets', 'spreadsheets', 'values', 'get',
    '--params', JSON.stringify({ spreadsheetId: SHEET_ID, range: rangeStr })
  ]);
  if (!data || !Array.isArray(data.values)) return { rows: [], columnMap: {} };

  const rows = data.values;
  if (!rows.length) return { rows: [], columnMap: {} };

  // Detect header row
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const rowHeaders = rows[i].map(normaliseHeader);
    const hasTicker = rowHeaders.some(h => COLUMN_ALIASES.ticker.includes(h));
    const hasPrice = rowHeaders.some(h => COLUMN_ALIASES.currentPrice.includes(h));
    const nextRow = rows[i + 1];
    const firstColTicker = nextRow && looksLikeTicker(nextRow[0]);
    if (hasTicker || firstColTicker) { headerRowIndex = i; break; }
  }

  const rawHeaders = rows[headerRowIndex].map(c => String(c||'').trim());
  const headers = rawHeaders.map(normaliseHeader);
  const sampleRows = rows.slice(headerRowIndex + 1, headerRowIndex + 11);
  const columnMap = buildColumnMap(headers, sampleRows);

  const dataRows = rows.slice(headerRowIndex + 1)
    .filter(row => Array.isArray(row) && row.some(c => String(c||'').trim()));

  return { rows: dataRows, columnMap };
}

// ─── Main ───────────────────────────────────────────────────────────────────

console.log('[export-prices] Starting at', new Date().toISOString());

const timestamp = new Date().toISOString();
const tickers = {}; // { ticker: quote }

// Load all tabs — add tabs here as needed
const tabs = ['Sheet1', 'Fortune 100', 'S&P 100 Companies'];

for (const tab of tabs) {
  console.log(`[export-prices] Loading tab: ${tab}`);
  const { rows, columnMap } = loadTab(tab);

  for (const row of rows) {
    const quote = toQuote(row, columnMap);
    if (!quote) continue;
    if (!tickers[quote.ticker]) {
      tickers[quote.ticker] = quote;
    } else {
      // Merge: prefer non-null fields from new quote
      const existing = tickers[quote.ticker];
      for (const key of Object.keys(quote)) {
        if (quote[key] !== null && existing[key] === null) {
          existing[key] = quote[key];
        }
      }
    }
  }
}

const output = {
  timestamp,
  generatedAt: new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' }),
  prices: tickers,  // key MUST be 'prices' for JS compatibility
  summary: {
    total: Object.keys(tickers).length,
    withPrice: Object.values(tickers).filter(q => q.price !== null).length,
    withChangePct: Object.values(tickers).filter(q => q.changePct !== null).length,
  }
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

// Also archive a timestamped copy for time-series analysis
const archiveDir = path.join(STATE_DIR, 'price-archive');
try {
  fs.mkdirSync(archiveDir, { recursive: true });
  const archiveFile = path.join(archiveDir, `${timestamp.slice(0, 13).replace('T','-')}.json`);
  fs.writeFileSync(archiveFile, JSON.stringify(output, null, 2));
} catch (e) {
  console.warn('[export-prices] Archive write failed:', e.message);
}

console.log(`[export-prices] Done. ${output.summary.total} tickers, ${output.summary.withPrice} with prices.`);
console.log(`[export-prices] Wrote: ${OUTPUT_FILE}`);
