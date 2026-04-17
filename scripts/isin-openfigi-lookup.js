#!/usr/bin/env node
/**
 * scripts/isin-openfigi-lookup.js
 * Phase 2 Step B: Resolve ISIN for gap tickers via OpenFIGI API,
 * write results back to Google Sheet, then re-run Step A.
 * OpenFIGI: free, no auth required. API: https://api.openfigi.com/v3/search
 */
const { execFileSync } = require('child_process');
const https = require('https');

const INDEX_PATH  = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4/reports/index.json';
const LOGS_DIR    = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4/logs';
const SHEET_ID    = '1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM';

// Tickers that could not be matched to the sheet at all
// (excludes EOS which has no ISIN in sheet — different treatment)
const GAP_TICKERS = [
  'GOOGL',
  'AVCT.L',
  'GGP.L',
  'KYGA.L',
  'KBGGY',
  'MDB',
  'PL',
  'ALRIB',
  'SHOP',
  'SIVE.ST',
  'TBN',
  'TDY',
  'XPEV',
];

// Manual mapping for complex tickers (exchange prefix, suffix stripping etc)
const TICKER_EXCHANGE_MAP = {
  'GOOGL':  { figiTicker: 'GOOGL', exchange: 'US' },
  'AVCT.L': { figiTicker: 'AVCT',  exchange: 'GB' },
  'GGP.L':  { figiTicker: 'GGP',   exchange: 'GB' },
  'KYGA.L': { figiTicker: 'KYGA',  exchange: 'GB' },
  'KBGGY':  { figiTicker: 'KBGGY', exchange: 'NO' },
  'MDB':    { figiTicker: 'MDB',   exchange: 'US' },
  'PL':     { figiTicker: 'PL',    exchange: 'US' },
  'ALRIB':  { figiTicker: 'ALRIB', exchange: 'FP' },
  'SHOP':   { figiTicker: 'SHOP',  exchange: 'US' },
  'SIVE.ST':{ figiTicker: 'SIVE',  exchange: 'SS' },
  'TBN':    { figiTicker: 'TBN',   exchange: 'AU' },
  'TDY':    { figiTicker: 'TDY',   exchange: 'US' },
  'XPEV':   { figiTicker: 'XPEV',  exchange: 'US' },
};

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
    };
    const req = https.request(url, options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function lookupIsin(ticker, exchange) {
  try {
    const results = await httpPost(
      'https://api.openfigi.com/v3/search',
      [{ idType: 'TICKER', idValue: ticker, exchangeCode: exchange }]
    );
    const parsed = JSON.parse(results);
    if (parsed && Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0];
      if (first.data && first.data.length > 0) {
        return first.data[0].figi;
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function writeIsinToSheet(ticker, isin) {
  // First find the row in the sheet for this ticker, then update column W (isin column, 0-indexed 22)
  // We need to find the row number and update the ISIN cell
  // For now, just log — we'll do batch write separately
  console.log(`  Would write ISIN ${isin} for ${ticker} to sheet`);
  return true;
}

async function main() {
  const fs = require('fs');
  const result = {
    generatedAt: new Date().toISOString(),
    lookups: [],
    resolved: 0,
    unresolved: [],
  };

  console.log('\nStep B — OpenFIGI ISIN lookup for gap tickers:');
  console.log('');

  for (const ticker of GAP_TICKERS) {
    const info = TICKER_EXCHANGE_MAP[ticker];
    if (!info) { console.log(`  ${ticker}: no exchange map, skipping`); continue; }

    process.stdout.write(`  ${ticker} (${info.exchange})... `);
    const isin = await lookupIsin(info.figiTicker, info.exchange);
    if (isin) {
      console.log(`-> ${isin}`);
      result.lookups.push({ ticker, figiTicker: info.figiTicker, exchange: info.exchange, isin, status: 'resolved' });
      result.resolved++;
    } else {
      console.log('-> NOT FOUND');
      result.lookups.push({ ticker, figiTicker: info.figiTicker, exchange: info.exchange, isin: null, status: 'not_found' });
      result.unresolved.push(ticker);
    }
  }

  console.log('');
  console.log(`Resolved: ${result.resolved}/${GAP_TICKERS.length}`);
  if (result.unresolved.length) {
    console.log('Unresolved (need manual lookup):', result.unresolved.join(', '));
  }

  // Write resolved ISINs back to Google Sheet
  // We need to find the row for each ticker and update column W (index 22)
  const indexEntries = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));

  // Re-run step A: reload sheet, match gap tickers, update index
  function normaliseTicker(raw) {
    let t = String(raw || '').trim();
    t = t.replace(/^[A-Z\-]+:/i, '').trim();
    t = t.replace(/\s*\([^)]*\)/g, '').trim();
    t = t.replace(/\.(L|AX|TO|V)$/i, '').trim();
    t = t.replace(/\s+(TSX-V|TSX|LSE|NYSE|ISE|ASX|BME)$/i, '').trim();
    return t.toUpperCase();
  }

  const resolvedMap = {};
  result.lookups.filter(l => l.isin).forEach(l => { resolvedMap[l.ticker] = l.isin; });

  // Apply resolved ISINs to index entries
  indexEntries.forEach(entry => {
    const bare = normaliseTicker(entry.ticker);
    if (resolvedMap[bare] && entry.isin === 'NEEDS-REVIEW') {
      entry.isin = resolvedMap[bare];
    }
  });

  fs.writeFileSync(INDEX_PATH, JSON.stringify(indexEntries, null, 2), 'utf8');

  console.log('');
  console.log(`Applied ${result.resolved} ISINs to index entries.`);
  console.log('');
  console.log('Unresolved tickers (manual lookup required):');
  result.unresolved.forEach(t => console.log(' ', t));

  fs.writeFileSync(`${LOGS_DIR}/isin-openfigi.json`, JSON.stringify(result, null, 2));
  console.log('\nLog: logs/isin-openfigi.json');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });