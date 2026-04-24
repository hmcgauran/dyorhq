#!/usr/bin/env node
'use strict';

/**
 * batch-web-research.js
 *
 * Runs Brave Search web research for tickers sourced from the Google Sheet.
 * The Sheet is the single source of truth for ticker, company name, and slug.
 * research/{slug}/ directories are created here if they don't already exist.
 *
 * Modes:
 *   --ticker=MP               Single ticker. Always runs, ignores checkpoint.
 *   --tickers=MP,BABA,JD      Specific list. Always runs, ignores checkpoint.
 *   --batch                   All sheet tickers not yet in checkpoint.
 *   (no flags)                Scheduled refresh: tickers with stale web JSON (>maxAgeDays).
 *
 * Options:
 *   --force                   Bypass checkpoint in batch/scheduled mode.
 *
 * 4 queries per ticker:
 *   1. {TICKER} {COMPANY} earnings Q1 2026
 *   2. {TICKER} {COMPANY} news April 2026
 *   3. {TICKER} {COMPANY} stock analysis
 *   4. {TICKER} {COMPANY} guidance 2026
 *
 * Output: research/{slug}/web-YYYY-MM-DD.json
 * Errors are non-fatal: individual ticker failures are logged and skipped.
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT          = path.resolve(__dirname, '..');
const RESEARCH_DIR  = path.join(ROOT, 'research');
const SNAPSHOT_FILE = path.join(ROOT, 'state', 'sheet-latest.json');
const PREFIX_RE     = /^(NYSE|NASDAQ|EPA|ASX|LON|LSE |FRA|CVE|BME|TSE|TSX|HKEX):/i;

const API_KEY         = process.env.BRAVE_API_KEY || process.env.BRAVE_SEARCH_API_KEY;
const MAX_AGE_DAYS    = parseInt(process.env.WEB_RESEARCH_MAX_AGE_DAYS || '30', 10);
const BATCH_MODE      = process.argv.includes('--batch');
const FORCE           = process.argv.includes('--force');
const CHECKPOINT_FILE = path.join(ROOT, 'state', 'web-research-checkpoint.json');
const LOG_FILE        = path.join(ROOT, 'state', 'web-research-log.jsonl');
const RATE_LIMIT_MS   = 20; // 50 req/sec on Brave Free tier
const TODAY           = new Date().toISOString().slice(0, 10);

// ── Helpers ───────────────────────────────────────────────────────────────────
function bareTicker(t) {
  return (t || '').replace(PREFIX_RE, '').trim().toUpperCase();
}

function log(msg) {
  const entry = { ts: new Date().toISOString(), msg };
  try { fs.writeFileSync(LOG_FILE, JSON.stringify(entry) + '\n', { flag: 'a' }); } catch {}
  console.log(msg);
}

function checkpointRead() {
  try { return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8')); }
  catch { return { done: [], last: null }; }
}

function checkpointWrite(cp) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Sheet snapshot → ticker map ───────────────────────────────────────────────
// Reads from state/sheet-latest.json (written by sync-sheet.js).
// Returns { BARE_TICKER: { ticker, company, slug } }
function fetchSheetMap() {
  if (!fs.existsSync(SNAPSHOT_FILE)) {
    throw new Error('state/sheet-latest.json not found — run sync-sheet.js first');
  }
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
  const map = {};
  for (const entry of snapshot.tickers) {
    const rawTicker = (entry.ticker || '').trim();
    if (!rawTicker || rawTicker === 'Ticker') continue;
    const bare    = bareTicker(rawTicker);
    if (!bare) continue;
    const company = (entry.companyName || bare).trim();
    const slug    = entry.research_slug || entry.slug ||
                    company.toLowerCase().replace(/[^a-z0-9]/g, '') ||
                    bare.toLowerCase();
    map[bare] = { ticker: rawTicker, company, slug };
  }
  return map;
}

// ── Brave Search ──────────────────────────────────────────────────────────────
async function braveSearch(query) {
  return new Promise((resolve, reject) => {
    if (!API_KEY) { reject(new Error('BRAVE_SEARCH_API_KEY not set')); return; }
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', '5');
    url.searchParams.set('freshness', 'py');
    https.get(url.toString(), {
      headers: { 'Accept': 'application/json', 'X-Subscription-Token': API_KEY },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('JSON parse error')); }
        } else if (res.statusCode === 429) {
          reject(new Error('RATE_LIMIT'));
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

// ── Web research per ticker ───────────────────────────────────────────────────
async function researchTicker(ticker, company, slug) {
  const dir = path.join(RESEARCH_DIR, slug);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log(`  [${ticker}] Created research directory: research/${slug}/`);
  }

  const queries = [
    `${ticker} ${company} earnings Q1 2026`,
    `${ticker} ${company} news April 2026`,
    `${ticker} ${company} stock analysis`,
    `${ticker} ${company} guidance 2026`,
  ];

  const results = [];
  for (const query of queries) {
    try {
      const res  = await braveSearch(query);
      const hits = (res.web?.results || []).slice(0, 5).map(r => ({
        title:   r.title,
        url:     r.url,
        snippet: (r.description || '').slice(0, 200),
      }));
      results.push({ query, hits, count: hits.length });
    } catch (e) {
      results.push({ query, error: e.message, hits: [] });
    }
    await sleep(RATE_LIMIT_MS);
  }

  const outputPath   = path.join(dir, `brave-web-${TODAY}.json`);
  const successCount = results.filter(r => r.hits.length > 0).length;
  const artifact = {
    ticker, company, slug,
    date: TODAY,
    source: 'brave',
    queries: results,
    summary: results.filter(r => r.hits.length > 0)
      .map(r => `[${r.query}](${r.hits[0].url}) ${r.hits[0].title} — ${r.hits[0].snippet}`.slice(0, 250))
      .join('\n'),
    gatheredAt: new Date().toISOString(),
  };

  fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2));
  log(`  [${ticker}] ${successCount}/${queries.length} queries OK → research/${slug}/brave-web-${TODAY}.json`);
  return artifact;
}

// ── Check if web JSON is stale ────────────────────────────────────────────────
function webJsonAge(slug) {
  const dir = path.join(RESEARCH_DIR, slug);
  if (!fs.existsSync(dir)) return Infinity;
  const files = fs.readdirSync(dir).filter(f => /^brave-web-\d{4}-\d{2}-\d{2}\.json$/.test(f));
  if (!files.length) return Infinity;
  const latest = files.sort().at(-1);
  const date   = latest.match(/^brave-web-(\d{4}-\d{2}-\d{2})\.json$/)[1];
  return (Date.now() - new Date(date)) / (1000 * 60 * 60 * 24);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!API_KEY) { console.error('ERROR: BRAVE_SEARCH_API_KEY not set'); process.exit(1); }

  // Parse --ticker / --tickers flags
  const tickerArg  = process.argv.find(a => a.startsWith('--ticker='));
  const tickersArg = process.argv.find(a => a.startsWith('--tickers='));
  const SINGLE_TICKER = tickerArg
    ? bareTicker(tickerArg.split('=')[1])
    : null;
  const TICKER_LIST = tickersArg
    ? tickersArg.split('=')[1].split(',').map(t => bareTicker(t))
    : null;

  if (SINGLE_TICKER) {
    log(`=== batch-web-research.js | SINGLE: ${SINGLE_TICKER} ===`);
  } else if (TICKER_LIST) {
    log(`=== batch-web-research.js | LIST: ${TICKER_LIST.join(', ')} (${TICKER_LIST.length}) ===`);
  } else {
    log(`=== batch-web-research.js | batch=${BATCH_MODE} | maxAge=${MAX_AGE_DAYS}d | force=${FORCE} ===`);
  }

  // Load snapshot — single source of truth for ticker, company, slug
  log('Reading sheet snapshot...');
  let sheetMap;
  try {
    sheetMap = fetchSheetMap();
  } catch (e) {
    console.error(`ERROR: Could not read Google Sheet: ${e.message}`);
    process.exit(1);
  }
  log(`  ${Object.keys(sheetMap).length} tickers in sheet`);

  const cp = checkpointRead();

  let toProcess;
  if (SINGLE_TICKER) {
    // Single ticker: always run, no checkpoint check
    const entry = sheetMap[SINGLE_TICKER];
    if (!entry) {
      console.error(`ERROR: ${SINGLE_TICKER} not found in Google Sheet`);
      process.exit(1);
    }
    toProcess = [entry];
  } else if (TICKER_LIST) {
    // Specific list: always run, no checkpoint check
    toProcess = [];
    for (const t of TICKER_LIST) {
      if (sheetMap[t]) {
        toProcess.push(sheetMap[t]);
      } else {
        log(`WARNING: ${t} not found in sheet — skipping`);
      }
    }
  } else {
    // Batch / scheduled: all sheet tickers, respecting checkpoint + staleness
    toProcess = Object.entries(sheetMap)
      .map(([bare, entry]) => ({ bare, ...entry }))
      .filter(({ bare, slug }) => {
        if (BATCH_MODE) return FORCE || !cp.done.includes(bare);
        return FORCE || (!cp.done.includes(bare) && webJsonAge(slug) > MAX_AGE_DAYS);
      });
  }

  log(`To process: ${toProcess.length} | Checkpoint done: ${cp.done.length}`);

  let done = 0, errors = 0;
  for (const { ticker, company, slug } of toProcess) {
    const bare = bareTicker(ticker);
    process.stdout.write(`[${done + errors + 1}/${toProcess.length}] ${bare} (${slug}) ... `);
    try {
      await researchTicker(bare, company, slug);
      if (!cp.done.includes(bare)) { cp.done.push(bare); }
      cp.last = bare;
      checkpointWrite(cp);
      done++;
      process.stdout.write('OK\n');
    } catch (e) {
      errors++;
      log(`ERROR ${bare}: ${e.message}`);
      if (!cp.done.includes(bare)) { cp.done.push(bare); }
      cp.last = bare;
      checkpointWrite(cp);
      process.stdout.write('FAIL\n');
    }
    await sleep(RATE_LIMIT_MS);
  }

  log(`=== Done. ok=${done} errors=${errors} ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
