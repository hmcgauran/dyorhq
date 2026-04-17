#!/usr/bin/env node
/**
 * scripts/isin-openfigi-v2.js
 * Phase 2 Step B (corrected): Resolve ISIN for gap tickers via OpenFIGI v3 mapping API.
 * Correct format: POST /v3/mapping with [{idType:'TICKER', idValue: ticker, exchCode: exchange}]
 * Then resolve FIGI -> ISIN via /v3/search.
 */
const fs = require('fs');
const https = require('https');

const LOGS_DIR  = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4/logs';
const INDEX_PATH = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4/reports/index.json';

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

// Map index tickers to OpenFIGI lookup params
// exchange: use country/market code that OpenFIGI understands
const TICKERS = [
  { bare: 'GOOGL',    figiTicker: 'GOOGL',  exchCode: 'US' },
  { bare: 'AVCT.L',   figiTicker: 'AVCT',   exchCode: 'LN' },
  { bare: 'GGP.L',    figiTicker: 'GGP',    exchCode: 'LN' },
  { bare: 'KYGA.L',   figiTicker: 'KYGA',   exchCode: 'LN' },
  { bare: 'KBGGY',    figiTicker: 'KBGGY',  exchCode: 'NO' },
  { bare: 'MDB',      figiTicker: 'MDB',    exchCode: 'US' },
  { bare: 'PL',       figiTicker: 'PL',     exchCode: 'US' },
  { bare: 'ALRIB',    figiTicker: 'ALRIB',   exchCode: 'FP' },
  { bare: 'SHOP',     figiTicker: 'SHOP',  exchCode: 'US' },
  { bare: 'SIVE.ST',  figiTicker: 'SIVE',  exchCode: 'SS' },
  { bare: 'TBN',      figiTicker: 'TBN',    exchCode: 'AU' },
  { bare: 'TDY',      figiTicker: 'TDY',   exchCode: 'US' },
  { bare: 'XPEV',     figiTicker: 'XPEV',   exchCode: 'US' },
];

async function lookupFigi(ticker, exchCode) {
  const r = await httpPost('https://api.openfigi.com/v3/mapping', [
    { idType: 'TICKER', idValue: ticker, exchCode }
  ]);
  if (r.status !== 200) return null;
  const parsed = JSON.parse(r.body);
  if (Array.isArray(parsed) && parsed[0]?.data?.length > 0) {
    return parsed[0].data[0].figi;
  }
  return null;
}

async function figiToIsin(figi) {
  const r = await httpPost('https://api.openfigi.com/v3/search', { idType: 'FIGI', idValue: figi });
  if (r.status !== 200) return null;
  const parsed = JSON.parse(r.body);
  if (parsed?.data?.length > 0) {
    return parsed.data[0].isin || null;
  }
  return null;
}

async function main() {
  console.log('\nStep B — OpenFIGI ISIN lookup (v3/mapping + v3/search):');
  console.log('');

  const results = [];
  for (const { bare, figiTicker, exchCode } of TICKERS) {
    process.stdout.write(`  ${bare} (${exchCode})... `);

    const figi = await lookupFigi(figiTicker, exchCode);
    if (!figi) {
      console.log('FIGI not found');
      results.push({ bare, figiTicker, exchCode, figi: null, isin: null, status: 'no_figi' });
      await sleep(1500);
      continue;
    }
    process.stdout.write(`FIGI=${figi}... `);

    const isin = await figiToIsin(figi);
    if (isin) {
      console.log(`ISIN=${isin}`);
      results.push({ bare, figiTicker, exchCode, figi, isin, status: 'resolved' });
    } else {
      console.log('ISIN not found from FIGI');
      results.push({ bare, figiTicker, exchCode, figi, isin: null, status: 'no_isin' });
    }
    await sleep(1500);
  }

  const resolved = results.filter(r => r.status === 'resolved');
  console.log(`\n  Resolved: ${resolved.length}/${TICKERS.length}`);

  // Apply to index
  if (resolved.length > 0) {
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
  fs.writeFileSync(`${LOGS_DIR}/isin-openfigi-v2.json`, JSON.stringify(log, null, 2));

  console.log('\n  Log: logs/isin-openfigi-v2.json');
  console.log('\n  Unresolved:');
  results.filter(r => r.status !== 'resolved').forEach(r => {
    console.log(`   ${r.bare}: ${r.status}`);
  });
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });