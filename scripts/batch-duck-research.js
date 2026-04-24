#!/usr/bin/env node
'use strict';

/**
 * batch-duck-research.js
 *
 * DuckDuckGo web research — secondary/supplementary leg alongside Brave.
 * Reads ticker list from state/sheet-latest.json (written by sync-sheet.js).
 *
 * 4 queries per ticker:
 *   1. {TICKER} {COMPANY} earnings results
 *   2. {TICKER} {COMPANY} analyst price target
 *   3. {TICKER} {COMPANY} news
 *   4. {TICKER} {COMPANY} competitors competitive landscape
 *
 * Output: research/{slug}/duck-web-YYYY-MM-DD.json
 *
 * Usage:
 *   node scripts/batch-duck-research.js --ticker=MP
 *   node scripts/batch-duck-research.js --batch
 *   node scripts/batch-duck-research.js --ticker=MP --force
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT          = path.resolve(__dirname, '..');
const RESEARCH_DIR  = path.join(ROOT, 'research');
const SNAPSHOT_FILE = path.join(ROOT, 'state', 'sheet-latest.json');
const LOG_FILE      = path.join(ROOT, 'state', 'duck-research-log.jsonl');
const TODAY         = new Date().toISOString().slice(0, 10);
const RATE_LIMIT_MS = 2000; // polite delay between DDG requests

const PREFIX_RE = /^(NYSE|NASDAQ|EPA|ASX|LON|LSE |FRA|CVE|BME|TSE|TSX|HKEX):/i;

const args          = process.argv.slice(2);
const TICKER_FILTER = (args.find(a => a.startsWith('--ticker='))?.split('=')[1] || '').toUpperCase() || null;
const FORCE         = args.includes('--force');
const BATCH_MODE    = args.includes('--batch');

function log(msg) {
  const entry = { ts: new Date().toISOString(), msg };
  try { fs.writeFileSync(LOG_FILE, JSON.stringify(entry) + '\n', { flag: 'a' }); } catch {}
  console.log(msg);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function bareTicker(t) { return (t || '').replace(PREFIX_RE, '').trim().toUpperCase(); }

// ── Load snapshot ─────────────────────────────────────────────────────────────
function loadSheetMap() {
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
                    company.toLowerCase().replace(/[^a-z0-9]/g, '') || bare.toLowerCase();
    map[bare] = { ticker: rawTicker, company, slug };
  }
  return map;
}

// ── DuckDuckGo search via Lite endpoint ───────────────────────────────────────
async function duckSearch(query) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({ q: query, kl: 'en-us' }).toString();
    const options = {
      hostname: 'lite.duckduckgo.com',
      path: '/lite/',
      method: 'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent':     'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept':         'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    };
    const req = https.request(options, res => {
      if (res.statusCode >= 300 && res.statusCode < 400) {
        // DDG redirected — treat as empty result
        res.resume();
        resolve([]);
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(parseResults(Buffer.concat(chunks).toString('utf8')));
        } else {
          reject(new Error(`DDG HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('DDG_TIMEOUT')); });
    req.write(body);
    req.end();
  });
}

// Parse DDG Lite HTML — extract result links and snippets
function parseResults(html) {
  const results = [];

  // Result links: <a class="result-link" href="...">Title</a>
  const linkRe    = /<a[^>]+class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  // Snippets: <td class="result-snippet">...</td>
  const snippetRe = /<td[^>]+class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

  const links = [];
  let m;
  while ((m = linkRe.exec(html)) !== null && links.length < 5) {
    const url   = m[1].trim();
    const title = m[2].replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
    if (url && title) links.push({ url, title });
  }

  const snippets = [];
  while ((m = snippetRe.exec(html)) !== null && snippets.length < 5) {
    const text = m[1].replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").trim();
    if (text) snippets.push(text);
  }

  for (let i = 0; i < links.length; i++) {
    results.push({
      title:   links[i].title,
      url:     links[i].url,
      snippet: snippets[i] || '',
    });
  }
  return results;
}

// ── Research one ticker ───────────────────────────────────────────────────────
async function researchTicker(bare, company, slug) {
  const dir = path.join(RESEARCH_DIR, slug);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const outFile = path.join(dir, `duck-web-${TODAY}.json`);
  if (fs.existsSync(outFile) && !FORCE) {
    log(`  [${bare}] duck-web-${TODAY}.json already exists — skipping`);
    return;
  }

  const queries = [
    `${bare} ${company} earnings results`,
    `${bare} ${company} analyst price target`,
    `${bare} ${company} news`,
    `${bare} ${company} competitors competitive landscape`,
  ];

  const queryResults = [];
  for (const query of queries) {
    try {
      const hits = await duckSearch(query);
      queryResults.push({ query, hits, count: hits.length });
      log(`  [${bare}] "${query}" → ${hits.length} results`);
    } catch (e) {
      queryResults.push({ query, error: e.message, hits: [] });
      log(`  [${bare}] "${query}" → ERROR: ${e.message}`);
    }
    await sleep(RATE_LIMIT_MS);
  }

  const artifact = {
    ticker:     bare,
    company,
    slug,
    date:       TODAY,
    source:     'duckduckgo',
    queries:    queryResults,
    gatheredAt: new Date().toISOString(),
  };

  fs.writeFileSync(outFile, JSON.stringify(artifact, null, 2));
  const ok = queryResults.filter(r => r.hits.length > 0).length;
  log(`  [${bare}] duck-web-${TODAY}.json written (${ok}/${queries.length} queries OK)`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  log(`=== batch-duck-research.js | ticker=${TICKER_FILTER || 'all'} | force=${FORCE} ===`);

  const sheetMap = loadSheetMap();
  log(`  ${Object.keys(sheetMap).length} tickers in snapshot`);

  let toProcess;
  if (TICKER_FILTER) {
    const entry = sheetMap[TICKER_FILTER];
    if (!entry) { console.error(`ERROR: ${TICKER_FILTER} not found in snapshot`); process.exit(1); }
    toProcess = [{ bare: TICKER_FILTER, ...entry }];
  } else if (BATCH_MODE) {
    toProcess = Object.entries(sheetMap).map(([bare, entry]) => ({ bare, ...entry }));
  } else {
    console.error('ERROR: --ticker=TICKER or --batch required');
    process.exit(1);
  }

  let done = 0, errors = 0;
  for (const { bare, company, slug } of toProcess) {
    process.stdout.write(`[${done + errors + 1}/${toProcess.length}] ${bare} (${slug}) ... `);
    try {
      await researchTicker(bare, company, slug);
      done++;
      process.stdout.write('OK\n');
    } catch (e) {
      errors++;
      log(`ERROR ${bare}: ${e.message}`);
      process.stdout.write('FAIL\n');
    }
  }

  log(`=== Done. ok=${done} errors=${errors} ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
