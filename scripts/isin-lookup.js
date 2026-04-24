#!/usr/bin/env node
'use strict';

/**
 * isin-lookup.js
 *
 * Multi-tier ISIN lookup for all tickers in state/sheet-latest.json.
 * Replaces the collection of isin-openfigi-*.js and isin-populate-working.js.
 *
 * Tier 1 — OpenFIGI /v3/mapping (primary, all markets)
 *   Batch POST of up to 10 identifiers per request. Handles non-US markets best;
 *   some US equities have isin populated, others null (Tier 2 covers the gaps).
 *   Rate: 25 jobs/7-sec window unauthenticated; set OPENFIGI_API_KEY for 250 req/min.
 *
 * Tier 2 — Brave Search (targeted, all markets)
 *   Query: "{company}" ISIN  — targeted at sites that prominently list ISINs.
 *   Extracts the 12-char ISIN pattern from search result snippets.
 *   Rate: 1 req/sec (200ms delay, env-overridable).
 *
 * Tier 3 — Playwright DOM extraction (last resort)
 *   Visits stockanalysis.com (US), marketbeat.com (non-US) and extracts ISIN
 *   from the rendered page. Only runs for tickers that failed Tiers 1 and 2.
 *   Requires: npm install playwright && npx playwright install chromium
 *
 * Outputs:
 *   state/isin-cache.json          — local cache, keyed by bare ticker
 *   state/isin-lookup-log.jsonl    — per-run log
 *   Writes found ISINs back to Google Sheet via gws batchUpdate (single API call).
 *
 * Usage:
 *   node scripts/isin-lookup.js                    # all tickers missing ISIN
 *   node scripts/isin-lookup.js --ticker=MP        # single ticker
 *   node scripts/isin-lookup.js --dry-run          # preview only, no sheet write
 *   node scripts/isin-lookup.js --force            # re-lookup even if cached
 *   node scripts/isin-lookup.js --tier=1           # OpenFIGI only
 *   node scripts/isin-lookup.js --tier=2           # Brave only
 *   node scripts/isin-lookup.js --tier=3           # Playwright only
 *   node scripts/isin-lookup.js --no-playwright    # skip Tier 3 even if installed
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const { execSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT          = path.resolve(__dirname, '..');
const STATE_DIR     = path.join(ROOT, 'state');
const SNAPSHOT_FILE = path.join(STATE_DIR, 'sheet-latest.json');
const CACHE_FILE    = path.join(STATE_DIR, 'isin-cache.json');
const LOG_FILE      = path.join(STATE_DIR, 'isin-lookup-log.jsonl');

const SHEET_ID      = '1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM';
const BRAVE_API_KEY = process.env.BRAVE_API_KEY || process.env.BRAVE_SEARCH_API_KEY;
const FIGI_API_KEY  = process.env.OPENFIGI_API_KEY || '';

// Rate limits — env-overridable
// Brave: Free=2000/mo (no strict per-sec limit, ~1/sec safe); Pro=5/sec; Business=100/sec
const BRAVE_DELAY_MS   = parseInt(process.env.BRAVE_RATE_LIMIT_MS  || '1000', 10);
// OpenFIGI: unauth=25 jobs/7-sec window; auth=250 req/min
// We batch 10 per request, so: unauth→min 2800ms between batches, auth→300ms
const FIGI_BATCH_SIZE  = FIGI_API_KEY ? 20 : 10;
const FIGI_BATCH_DELAY = FIGI_API_KEY ? 300 : 2800; // ms between batch requests

const PREFIX_RE = /^(NYSE|NASDAQ|EPA|ASX|LON|LSE|FRA|CVE|BME|TSE|TSX|HKEX):/i;
const ISIN_RE   = /\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/g;

// OpenFIGI exchCode mapping from pipeline ticker prefixes
const FIGI_EXCH = {
  '':       'US',   // no prefix = US exchange
  'NYSE':   'US',
  'NASDAQ': 'US',
  'LON':    'LN',
  'LSE':    'LN',
  'EPA':    'FP',   // Euronext Paris
  'ASX':    'AU',
  'FRA':    'GF',   // Frankfurt
  'CVE':    'CV',   // TSX Venture
  'BME':    'SM',   // Madrid
  'TSE':    'JP',   // Tokyo
  'TSX':    'CN',   // Toronto
  'HKEX':   'HK',
};

const args           = process.argv.slice(2);
const TICKER_FILTER  = (args.find(a => a.startsWith('--ticker='))?.split('=')[1] || '').toUpperCase() || null;
const DRY_RUN        = args.includes('--dry-run');
const FORCE          = args.includes('--force');
const TIER_ONLY      = args.find(a => a.startsWith('--tier='))?.split('=')[1] || null;
const NO_PLAYWRIGHT  = args.includes('--no-playwright');

// ── Utilities ─────────────────────────────────────────────────────────────────

function log(obj) {
  const entry = typeof obj === 'string'
    ? { ts: new Date().toISOString(), msg: obj }
    : { ts: new Date().toISOString(), ...obj };
  try { fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n'); } catch {}
  console.log(typeof obj === 'string' ? obj : JSON.stringify(obj));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractPrefix(rawTicker) {
  const m = (rawTicker || '').match(/^([A-Z]+):/i);
  return m ? m[1].toUpperCase() : '';
}

function bareTicker(raw) {
  return (raw || '').replace(PREFIX_RE, '').trim().toUpperCase();
}

function isValidIsin(s) {
  return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(s || '');
}

function extractIsin(text) {
  if (!text) return null;
  ISIN_RE.lastIndex = 0;
  const matches = text.match(ISIN_RE);
  // Return the first valid-format match
  return matches ? matches[0] : null;
}

// ── Load snapshot and cache ───────────────────────────────────────────────────

function loadSnapshot() {
  if (!fs.existsSync(SNAPSHOT_FILE)) {
    throw new Error('state/sheet-latest.json not found — run sync-sheet.js first');
  }
  return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
}

function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); }
  catch { return {}; }
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// ── Tier 1: OpenFIGI /v3/mapping ─────────────────────────────────────────────
// Returns { ticker → isin } for all tickers in the batch.
// OpenFIGI mapping response includes `isin` field when available.
// Note: `isin` is populated for most non-US equities; often null for US equities.

async function openFigiPost(jobs) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(jobs);
    const headers = {
      'Content-Type':  'application/json',
      'Accept':        'application/json',
      'Content-Length': Buffer.byteLength(body),
    };
    if (FIGI_API_KEY) headers['X-OPENFIGI-APIKEY'] = FIGI_API_KEY;

    const req = https.request({
      hostname: 'api.openfigi.com',
      path:     '/v3/mapping',
      method:   'POST',
      headers,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('OpenFIGI JSON parse error')); }
        } else if (res.statusCode === 429) {
          reject(new Error('OPENFIGI_RATE_LIMIT'));
        } else {
          reject(new Error(`OpenFIGI HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('OPENFIGI_TIMEOUT')); });
    req.write(body);
    req.end();
  });
}

async function tierOpenFigi(entries) {
  const results = {}; // bare → isin

  // Build jobs array: one job per ticker with correct exchCode
  const jobs = entries.map(({ bare, prefix, company }) => ({
    _bare: bare, // not sent to API — used for matching response
    idType:        'TICKER',
    idValue:       bare,
    exchCode:      FIGI_EXCH[prefix] || 'US',
    marketSecDes:  'Equity',
    securityType:  'Common Stock',
  }));

  // Process in batches
  for (let i = 0; i < jobs.length; i += FIGI_BATCH_SIZE) {
    const batch     = jobs.slice(i, i + FIGI_BATCH_SIZE);
    const apiBatch  = batch.map(({ _bare, ...rest }) => rest); // strip internal field

    try {
      const response = await openFigiPost(apiBatch);

      for (let j = 0; j < batch.length; j++) {
        const bare = batch[j]._bare;
        const item = response[j];

        if (!item || item.error || !Array.isArray(item.data) || item.data.length === 0) continue;

        // Prefer a result where isin is directly populated
        for (const d of item.data) {
          if (isValidIsin(d.isin)) {
            results[bare] = d.isin;
            break;
          }
        }

        // Secondary attempt: check compositeFIGI or shareClassFIGI for ISIN pattern
        // (some older formats embed ISIN-like strings in these fields)
        if (!results[bare]) {
          for (const d of item.data) {
            const candidate = extractIsin(
              `${d.name || ''} ${d.uniqueId || ''} ${d.securityType2 || ''}`
            );
            if (candidate) {
              results[bare] = candidate;
              break;
            }
          }
        }
      }
    } catch (e) {
      if (e.message === 'OPENFIGI_RATE_LIMIT') {
        log(`  OpenFIGI rate limit hit — waiting 10s`);
        await sleep(10000);
        i -= FIGI_BATCH_SIZE; // retry this batch
        continue;
      }
      log(`  OpenFIGI batch error: ${e.message}`);
    }

    if (i + FIGI_BATCH_SIZE < jobs.length) {
      await sleep(FIGI_BATCH_DELAY);
    }
  }

  return results;
}

// ── Tier 2: Brave Search ──────────────────────────────────────────────────────

async function braveSearch(query) {
  if (!BRAVE_API_KEY) throw new Error('BRAVE_API_KEY not set');
  return new Promise((resolve, reject) => {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', '5');
    https.get(url.toString(), {
      headers: { 'Accept': 'application/json', 'X-Subscription-Token': BRAVE_API_KEY },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Brave JSON parse error')); }
        } else if (res.statusCode === 429) {
          reject(new Error('BRAVE_RATE_LIMIT'));
        } else {
          reject(new Error(`Brave HTTP ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

async function tierBrave(entries) {
  const results = {};

  for (const { bare, company } of entries) {
    // Targeted query: company name + ISIN — most financial data sites list ISIN prominently
    const query = `"${company}" ISIN`;
    try {
      const r = await braveSearch(query);
      for (const hit of (r.web?.results || [])) {
        const text = `${hit.title || ''} ${hit.description || ''}`;
        const isin = extractIsin(text);
        if (isin) {
          results[bare] = isin;
          break;
        }
      }
    } catch (e) {
      if (e.message === 'BRAVE_RATE_LIMIT') {
        log(`  Brave rate limit hit — waiting 5s`);
        await sleep(5000);
        // Do not retry — just log as not found for this pass
      } else {
        log(`  Brave error for ${bare}: ${e.message}`);
      }
    }
    await sleep(BRAVE_DELAY_MS);
  }

  return results;
}

// ── Tier 3: Playwright ────────────────────────────────────────────────────────

function playwrightAvailable() {
  if (NO_PLAYWRIGHT) return false;
  try { require.resolve('playwright'); return true; }
  catch { return false; }
}

async function tierPlaywright(entries) {
  if (!playwrightAvailable()) {
    log('  Playwright not installed — Tier 3 skipped');
    log('  Install: npm install playwright && npx playwright install chromium');
    return {};
  }

  const { chromium } = require('playwright');
  const results  = {};
  const browser  = await chromium.launch({ headless: true });
  const context  = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
               '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  await context.route('**/*.{png,jpg,jpeg,gif,webp,woff,woff2,mp4}', r => r.abort());
  const page = await context.newPage();

  for (const { bare, prefix, company } of entries) {
    // Choose target URL based on exchange
    let targetUrl;
    const lowerBare = bare.toLowerCase();

    if (!prefix || prefix === 'NYSE' || prefix === 'NASDAQ') {
      // US: stockanalysis.com is reliable and freely accessible
      targetUrl = `https://stockanalysis.com/stocks/${lowerBare}/`;
    } else if (prefix === 'LON' || prefix === 'LSE') {
      // UK: London Stock Exchange instrument page
      targetUrl = `https://www.londonstockexchange.com/stock/${lowerBare}/company-page`;
    } else {
      // Fallback: marketbeat.com — covers most global markets
      targetUrl = `https://www.marketbeat.com/stocks/${FIGI_EXCH[prefix] || 'US'}/${lowerBare}/`;
    }

    try {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1000);
      const bodyText = await page.innerText('body').catch(() => '');
      const isin = extractIsin(bodyText);
      if (isin) {
        results[bare] = isin;
        log(`  [${bare}] Playwright: ${isin} (${targetUrl})`);
      }
    } catch (e) {
      log(`  [${bare}] Playwright error: ${e.message?.slice(0, 80)}`);
    }
    await sleep(2000);
  }

  await browser.close();
  return results;
}

// ── Write ISINs back to Google Sheet ─────────────────────────────────────────
// Uses sheet row index derived from snapshot position (snapshot.tickers[i] = row i+2).

function writeToSheet(updates) {
  if (updates.length === 0) return;

  const batchData = updates.map(({ row, isin }) => ({
    range:  `Sheet1!W${row}:W${row}`,
    values: [[isin]],
  }));

  const payload = JSON.stringify({
    valueInputOption: 'USER_ENTERED',
    data: batchData,
  });

  execSync(
    `gws sheets spreadsheets values batchUpdate --params '${JSON.stringify({ spreadsheetId: SHEET_ID })}' --json='${payload}'`,
    { encoding: 'utf8', timeout: 60000 }
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`=== isin-lookup.js | ticker=${TICKER_FILTER || 'all'} | dry-run=${DRY_RUN} | force=${FORCE} | tier=${TIER_ONLY || 'all'} ===\n`);

  const snapshot = loadSnapshot();
  const cache    = loadCache();

  // Build work list: tickers missing ISIN, with their sheet row numbers
  const needsLookup = [];

  snapshot.tickers.forEach((entry, i) => {
    const rawTicker = (entry.ticker || '').trim();
    if (!rawTicker || rawTicker === 'Ticker') return;

    const bare    = bareTicker(rawTicker);
    const prefix  = extractPrefix(rawTicker);
    const company = (entry.companyName || bare).trim();
    const isin    = (entry.isin || '').trim();
    const row     = i + 2; // row 1 = header, tickers start at row 2

    if (TICKER_FILTER && bare !== TICKER_FILTER) return;

    const isinMissing = !isin || isin.startsWith('#') || isin.startsWith('BBG') ||
                        isin === 'N/A' || isin.length !== 12;

    // Also lookup if cached value looks wrong
    const cachedIsin  = cache[bare];
    const cacheValid  = isValidIsin(cachedIsin);

    if (isinMissing || FORCE) {
      if (cacheValid && !FORCE) {
        // Already in cache — use it without API call
        needsLookup.push({ bare, prefix, company, row, cachedIsin, skipLookup: true });
      } else {
        needsLookup.push({ bare, prefix, company, row, cachedIsin: null, skipLookup: false });
      }
    }
  });

  if (needsLookup.length === 0) {
    console.log('All tickers already have valid ISINs — nothing to do.');
    return;
  }

  // Separate cache hits from actual lookups needed
  const fromCache    = needsLookup.filter(e => e.skipLookup);
  const toLookup     = needsLookup.filter(e => !e.skipLookup);

  console.log(`Missing ISINs: ${needsLookup.length}`);
  console.log(`  From cache:  ${fromCache.length}`);
  console.log(`  Need lookup: ${toLookup.length}\n`);

  const found    = {}; // bare → isin (all tiers combined)
  const notFound = []; // bare tickers that failed all tiers

  // ── Run tiers ──────────────────────────────────────────────────────────────

  let remaining = [...toLookup];

  // Tier 1: OpenFIGI
  if (remaining.length > 0 && (!TIER_ONLY || TIER_ONLY === '1')) {
    console.log(`Tier 1 — OpenFIGI (${remaining.length} tickers, batch=${FIGI_BATCH_SIZE})...`);
    const r1 = await tierOpenFigi(remaining);
    for (const [bare, isin] of Object.entries(r1)) {
      found[bare] = isin;
      cache[bare] = isin;
      console.log(`  [${bare}] T1 OpenFIGI: ${isin}`);
    }
    remaining = remaining.filter(e => !found[e.bare]);
    console.log(`  → ${Object.keys(r1).length} resolved, ${remaining.length} remaining\n`);
  }

  // Tier 2: Brave Search
  if (remaining.length > 0 && (!TIER_ONLY || TIER_ONLY === '2') && BRAVE_API_KEY) {
    console.log(`Tier 2 — Brave Search (${remaining.length} tickers, delay=${BRAVE_DELAY_MS}ms)...`);
    const r2 = await tierBrave(remaining);
    for (const [bare, isin] of Object.entries(r2)) {
      found[bare] = isin;
      cache[bare] = isin;
      console.log(`  [${bare}] T2 Brave: ${isin}`);
    }
    remaining = remaining.filter(e => !found[e.bare]);
    console.log(`  → ${Object.keys(r2).length} resolved, ${remaining.length} remaining\n`);
  } else if (!BRAVE_API_KEY && (!TIER_ONLY || TIER_ONLY === '2')) {
    console.log('Tier 2 — Brave Search: skipped (BRAVE_API_KEY not set)\n');
  }

  // Tier 3: Playwright
  if (remaining.length > 0 && (!TIER_ONLY || TIER_ONLY === '3') && !NO_PLAYWRIGHT) {
    console.log(`Tier 3 — Playwright (${remaining.length} tickers)...`);
    const r3 = await tierPlaywright(remaining);
    for (const [bare, isin] of Object.entries(r3)) {
      found[bare] = isin;
      cache[bare] = isin;
      console.log(`  [${bare}] T3 Playwright: ${isin}`);
    }
    remaining = remaining.filter(e => !found[e.bare]);
    console.log(`  → ${Object.keys(r3).length} resolved, ${remaining.length} remaining\n`);
  }

  // Anything still remaining
  for (const { bare } of remaining) notFound.push(bare);

  // ── Save cache ────────────────────────────────────────────────────────────
  saveCache(cache);

  // ── Build write list ──────────────────────────────────────────────────────
  const toWrite = [];

  // From fresh lookups
  for (const { bare, row } of toLookup) {
    const isin = found[bare];
    if (isin) toWrite.push({ bare, row, isin });
  }
  // From cache hits
  for (const { bare, row, cachedIsin } of fromCache) {
    toWrite.push({ bare, row, isin: cachedIsin });
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`Results:`);
  console.log(`  Found (fresh):  ${Object.keys(found).length}`);
  console.log(`  Found (cache):  ${fromCache.length}`);
  console.log(`  Not found:      ${notFound.length}`);
  if (notFound.length > 0) {
    console.log(`  Not found tickers: ${notFound.join(', ')}`);
    console.log(`  → These need manual lookup or a dedicated data source.`);
  }
  console.log('');

  if (toWrite.length === 0) {
    console.log('Nothing to write to sheet.');
    return;
  }

  // ── Write to sheet ────────────────────────────────────────────────────────
  if (DRY_RUN) {
    console.log(`Dry run — would write ${toWrite.length} ISINs to sheet:`);
    for (const { bare, row, isin } of toWrite.slice(0, 20)) {
      console.log(`  Row ${row}: ${bare} → ${isin}`);
    }
    if (toWrite.length > 20) console.log(`  ... and ${toWrite.length - 20} more`);
    return;
  }

  console.log(`Writing ${toWrite.length} ISINs to Google Sheet (single batch call)...`);
  try {
    writeToSheet(toWrite);
    console.log(`  Done.`);
  } catch (e) {
    console.error(`  BATCH WRITE FAILED: ${e.message}`);
    console.error(`  Individual row data saved in cache — re-run after fixing gws auth.`);
    process.exit(1);
  }

  log({ event: 'complete', found: Object.keys(found).length, fromCache: fromCache.length,
        notFound: notFound.length, written: toWrite.length });
  console.log('\nDone. Run sync-sheet.js to pull the updated ISINs into the local snapshot.');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
