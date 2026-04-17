#!/usr/bin/env node
/**
 * scripts/isin-openfigi-slow.js
 * Phase 2 Step B (retry): Resolve ISIN for remaining gap tickers via OpenFIGI.
 * Uses longer delays and exponential backoff to handle rate limiting.
 * Writes results to logs/isin-openfigi-slow.json
 */
const fs = require('fs');
const https = require('https');

const LOGS_DIR = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4/logs';
const INDEX_PATH = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4/reports/index.json';
const SHEET_ID = '1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpPost(url, body, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

function normaliseTicker(raw) {
  let t = String(raw || '').trim();
  t = t.replace(/^[A-Z\-]+:/i, '').trim();
  t = t.replace(/\s*\([^)]*\)/g, '').trim();
  t = t.replace(/\.(L|AX|TO|V)$/i, '').trim();
  t = t.replace(/\s+(TSX-V|TSX|LSE|NYSE|ISE|ASX|BME)$/i, '').trim();
  return t.toUpperCase();
}

const TICKERS_TO_RESOLVE = [
  { bare: 'GOOGL',  figiTicker: 'GOOGL', exchange: 'US' },
  { bare: 'AVCT.L', figiTicker: 'AVCT',  exchange: 'GB' },
  { bare: 'GGP.L',  figiTicker: 'GGP',   exchange: 'GB' },
  { bare: 'KYGA.L', figiTicker: 'KYGA',  exchange: 'GB' },
  { bare: 'KBGGY',  figiTicker: 'KBGGY', exchange: 'NO' },
  { bare: 'MDB',    figiTicker: 'MDB',   exchange: 'US' },
  { bare: 'PL',     figiTicker: 'PL',    exchange: 'US' },
  { bare: 'ALRIB',  figiTicker: 'ALRIB', exchange: 'FP' },
  { bare: 'SHOP',   figiTicker: 'SHOP',  exchange: 'US' },
  { bare: 'SIVE.ST',figiTicker: 'SIVE',  exchange: 'SS' },
  { bare: 'TBN',    figiTicker: 'TBN',   exchange: 'AU' },
  { bare: 'TDY',    figiTicker: 'TDY',   exchange: 'US' },
  { bare: 'XPEV',   figiTicker: 'XPEV',  exchange: 'US' },
];

async function lookupWithRetry(ticker, exchange, maxAttempts = 5) {
  let lastResult;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await httpPost('https://api.openfigi.com/v3/search', [
        { idType: 'TICKER', idValue: ticker, exchangeCode: exchange }
      ]);
      lastResult = result;
      if (result.status === 200) {
        const parsed = JSON.parse(result.body);
        if (parsed && Array.isArray(parsed) && parsed[0]?.data?.length > 0) {
          return { isin: parsed[0].data[0].figi, attempts: attempt };
        }
        return { isin: null, attempts: attempt, noResult: true };
      } else if (result.status === 429) {
        const delay = Math.min(30000 * Math.pow(2, attempt - 1), 120000);
        console.log(`  [${ticker}] 429, retry in ${delay/1000}s (attempt ${attempt}/${maxAttempts})`);
        await sleep(delay);
      } else {
        return { isin: null, attempts: attempt, httpStatus: result.status };
      }
    } catch (e) {
      if (attempt < maxAttempts) await sleep(5000 * attempt);
      else return { isin: null, attempts: attempt, error: e.message };
    }
  }
  return { isin: null, attempts: maxAttempts, exhausted: true, lastResult };
}

async function main() {
  console.log('\nStep B — OpenFIGI ISIN lookup (with retry/backoff):');
  console.log('');

  const results = [];
  for (const { bare, figiTicker, exchange } of TICKERS_TO_RESOLVE) {
    process.stdout.write(`  ${bare} (${exchange})... `);
    const result = await lookupWithRetry(figiTicker, exchange);
    if (result.isin) {
      console.log(`-> ${result.isin} (${result.attempts} attempts)`);
      results.push({ bare, figiTicker, exchange, isin: result.isin, status: 'resolved' });
    } else {
      console.log(`-> NOT RESOLVED after ${result.attempts} attempts`);
      results.push({ bare, figiTicker, exchange, isin: null, status: 'unresolved', result });
    }
    // Inter-request delay to avoid burst triggering 429
    await sleep(2000);
  }

  const resolved = results.filter(r => r.status === 'resolved');
  console.log(`\n  Resolved: ${resolved.length}/${TICKERS_TO_RESOLVE.length}`);

  if (resolved.length > 0) {
    // Apply to index
    const indexEntries = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
    const resolvedMap = {};
    resolved.forEach(r => { resolvedMap[r.bare] = r.isin; });

    let applied = 0;
    indexEntries.forEach(entry => {
      const bare = normaliseTicker(entry.ticker);
      if (resolvedMap[bare] && entry.isin === 'NEEDS-REVIEW') {
        entry.isin = resolvedMap[bare];
        applied++;
      }
    });

    fs.writeFileSync(INDEX_PATH, JSON.stringify(indexEntries, null, 2), 'utf8');
    console.log(`  Applied ${applied} ISINs to index.`);
  }

  const log = { generatedAt: new Date().toISOString(), results };
  fs.writeFileSync(`${LOGS_DIR}/isin-openfigi-slow.json`, JSON.stringify(log, null, 2));
  console.log('\n  Log: logs/isin-openfigi-slow.json');
  console.log('\n  Unresolved (manual lookup required):');
  results.filter(r => r.status === 'unresolved').forEach(r => console.log('   ', r.bare, `(${r.exchange})`));
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });