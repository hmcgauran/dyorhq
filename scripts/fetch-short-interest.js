#!/usr/bin/env node
'use strict';

/**
 * fetch-short-interest.js
 * Priority 4 of the data pipeline build-out.
 *
 * Fetches short interest data from FINRA Query API for US tickers:
 *   - Consolidated short interest (published twice-monthly)
 *   - Days to cover
 *   - % of float
 *   - Reg SHO daily short sale volume (optional, daily)
 *
 * Output: research/{slug}/short-interest-YYYY-MM-DD.json
 *
 * Uses FINRA Query API (free developer tier).
 * Rate-limit: 25 req/sec on free tier.
 * Checkpoint: state/short-interest-checkpoint.json
 *
 * Usage:
 *   node scripts/fetch-short-interest.js             # all US tickers
 *   node scripts/fetch-short-interest.js --limit=20 # first 20 (dry run)
 *   node scripts/fetch-short-interest.js NVDA MSFT  # specific tickers
 *   node scripts/fetch-short-interest.js --daily    # Reg SHO daily volume
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT = path.resolve(__dirname, '..');
const RESEARCH_DIR = path.join(ROOT, 'research');
const slugLib = require('../cron-scripts/lib/research-slug');

const API_KEY = process.env.FINRA_API_KEY;
const CHECKPOINT_FILE = path.join(ROOT, 'state', 'short-interest-checkpoint.json');
const LOG_FILE = path.join(ROOT, 'state', 'short-interest-log.jsonl');
const RATE_LIMIT_MS = 40; // 25 req/sec
const TODAY = new Date().toISOString().slice(0, 10);

const args = process.argv.slice(2);
const SPECIFIC_TICKERS = args.filter(a => /^[A-Z]{1,5}$/i.test(a) && !a.startsWith('--'));
const DAILY_MODE = args.includes('--daily');
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '9999', 10);

const US_EXCHANGES = new Set(['NYE', 'NMS', 'AMS', 'NASDAQ', 'NASDAQ Capital', 'NYE MKT', 'NASDAQ Global Select']);

function log(msg) {
  const entry = { ts: new Date().toISOString(), msg };
  try { fs.writeFileSync(LOG_FILE, JSON.stringify(entry) + '\n', { flag: 'a' }); } catch (e) {}
  console.log(msg);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function checkpointRead() {
  try { return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8')); }
  catch (e) { return { done: {}, last: null }; }
}

function checkpointWrite(cp) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2));
}

// ── FINRA API helper ─────────────────────────────────────────────────────────
async function finraGet(pathSuffix) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.finra.org${pathSuffix}`);
    const options = {
      headers: {
        'Accept': 'application/json',
        'X-API-Key': API_KEY,
      }
    };
    https.get(url.toString(), options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error('FINRA JSON parse error')); }
        } else if (res.statusCode === 429) {
          reject(new Error('FINRA_RATE_LIMIT'));
        } else {
          reject(new Error(`FINRA ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

// ── Fetch short interest for a ticker ──────────────────────────────────────
// FINRA Short Interest endpoint: GET /market/shortInterest
// Query params: ticker, exchangeCD (optional)
async function fetchShortInterest(ticker) {
  try {
    // Search for the symbol's short interest
    const data = await finraGet(`/market/shortInterest?ticker=${encodeURIComponent(ticker)}&country=US`);
    if (!data || !data.length) return null;
    // data is an array — take the most recent entry
    const entry = Array.isArray(data) ? data[0] : data;
    return {
      ticker,
      settlementDate: entry.settlementDate || entry.reportsForDate || null,
      shortVolume: entry.shortVolume || entry.totalShortVolume || null,
      totalVolume: entry.totalVolume || entry.aggregateVolume || null,
      daysToCover: entry.daysToCover || null,
      percentOfFloat: entry.percentOfFloat || entry.shortPercent || null,
      exchange: entry.exchange || null,
      fetchedAt: new Date().toISOString(),
    };
  } catch (e) {
    // Try alternate endpoint format
    try {
      const data = await finraGet(`/market/shortInterest?tickers=${encodeURIComponent(ticker)}`);
      if (!data || !data.length) return null;
      const entry = Array.isArray(data) ? data[0] : data;
      return {
        ticker,
        settlementDate: entry.settlementDate || null,
        shortVolume: entry.shortVolume || null,
        totalVolume: entry.totalVolume || null,
        daysToCover: entry.daysToCover || null,
        percentOfFloat: entry.percentOfFloat || null,
        fetchedAt: new Date().toISOString(),
      };
    } catch (e2) {
      return { ticker, error: e2.message || e.message, fetchedAt: new Date().toISOString() };
    }
  }
}

// ── Fetch Reg SHO Daily Short Sale Volume ────────────────────────────────────
// FINRA Reg SHO endpoint: GET /market/regSHO dailyShortSaleVolume
async function fetchRegSHO(ticker) {
  try {
    const todayStr = TODAY.replace(/-/g, '');
    const data = await finraGet(`/market/regSHOdailyShortSaleVolume?symbol=${encodeURIComponent(ticker)}&tradeDate=${todayStr}`);
    if (!data || !data.length) return null;
    const entry = Array.isArray(data) ? data[0] : data;
    return {
      ticker,
      tradeDate: entry.tradeDate || entry.date || todayStr,
      shortVolume: entry.shortVolume || null,
      totalVolume: entry.totalVolume || null,
      marketCode: entry.marketCode || null,
      fetchedAt: new Date().toISOString(),
    };
  } catch (e) {
    return { ticker, regSHOError: e.message, fetchedAt: new Date().toISOString() };
  }
}

// ── Store ───────────────────────────────────────────────────────────────────
async function storeShortInterest(ticker, slug, data, isDaily) {
  const dir = path.join(RESEARCH_DIR, slug);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filename = isDaily ? `short-interest-daily-${TODAY}.json` : `short-interest-${TODAY}.json`;
  const destPath = path.join(dir, filename);

  let existing = null;
  try { existing = JSON.parse(fs.readFileSync(destPath, 'utf8')); } catch (e) { /* no existing file */ }

  const artifact = existing && !isDaily
    ? { ...existing, ...data, updatedAt: new Date().toISOString() }
    : { ...(existing || {}), ...data, storedAt: new Date().toISOString() };

  fs.writeFileSync(destPath, JSON.stringify(artifact, null, 2));
  log(`  [${ticker}] -> ${filename} (shortVol=${data.shortVolume || data.shortVolume || 'N/A'})`);
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  if (!API_KEY) { console.error('ERROR: FINRA_API_KEY not set'); process.exit(1); }

  log(`=== fetch-short-interest.js | daily=${DAILY_MODE} | limit=${LIMIT} | tickers=${SPECIFIC_TICKERS.join(',') || 'all'} ===`);

  const INDEX_PATH = path.join(ROOT, 'reports', 'index.json');
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  const cp = checkpointRead();

  let tickers;
  if (SPECIFIC_TICKERS.length) {
    tickers = SPECIFIC_TICKERS.map(t => ({ ticker: t.toUpperCase(), exchange: 'NMS' }));
  } else {
    tickers = index.filter(e => e.ticker && US_EXCHANGES.has(e.exchange));
  }

  let processed = 0;
  for (const { ticker, exchange } of tickers) {
    if (processed >= LIMIT) break;

    const slug = slugLib.researchSlug(ticker);
    const key = DAILY_MODE ? `${ticker}-daily` : ticker;

    if (cp.done[key] && !process.argv.includes('--force')) {
      log(`[${ticker}] already done, skip`);
      processed++;
      continue;
    }

    process.stdout.write(`[${ticker}] ... `);
    try {
      const siData = await fetchShortInterest(ticker);
      await storeShortInterest(ticker, slug, siData, false);

      if (DAILY_MODE) {
        await sleep(RATE_LIMIT_MS);
        const dailyData = await fetchRegSHO(ticker);
        if (dailyData) await storeShortInterest(ticker, slug, dailyData, true);
      }

      cp.done[key] = true;
      cp.last = ticker;
      checkpointWrite(cp);
      processed++;
      process.stdout.write('OK\n');
    } catch (e) {
      log(`ERROR ${ticker}: ${e.message}`);
      cp.done[key] = { error: e.message };
      checkpointWrite(cp);
      processed++;
      process.stdout.write('FAIL\n');
    }

    await sleep(RATE_LIMIT_MS);
  }

  log(`=== Finished | processed=${processed} ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
