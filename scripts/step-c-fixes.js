#!/usr/bin/env node
/**
 * scripts/step-c-fixes.js
 * Phase 2 Step C: Manual fixes
 * 1. Fix N/A entry (MS International PLC)
 * 2. Fix CRH price
 * 3. Resolve 25 unresolvable currencies
 */
const { execFileSync } = require('child_process');
const fs = require('fs');

const INDEX_PATH = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4/reports/index.json';
const SHEET_ID   = '1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM';

function normaliseTicker(raw) {
  let t = String(raw || '').trim();
  t = t.replace(/^[A-Z\-]+:/i, '').trim();
  t = t.replace(/\s*\/\s*.*$/, '').trim();
  t = t.replace(/\s*\([^)]*\)/g, '').trim();
  t = t.replace(/\.[A-Z]{1,4}(?:\s|$|$)/i, '').trim();
  t = t.replace(/\s+(LN|US|NO|SS|AU|FS|TK)$/i, '').trim();
  t = t.replace(/\s+(LSE|NYSE|TSX|ASX|AIM|NMS|CME)$/i, '').trim();
  return t.toUpperCase();
}

function parsePrice(priceStr) {
  const s = String(priceStr || '');
  const numeric = parseFloat(s.replace(/[^0-9.]/g, ''));
  return isNaN(numeric) ? null : numeric;
}

// Load sheet
const result = execFileSync('gws', [
  'sheets', 'spreadsheets', 'values', 'get', '--params',
  JSON.stringify({ spreadsheetId: SHEET_ID, range: 'Sheet1!A:ZZ', valueRenderOption: 'FORMATTED_VALUE' })
], { encoding: 'utf8' });

let out = result.trim();
if (!out.startsWith('{')) out = out.substring(out.indexOf('{'));
const j = JSON.parse(out);
const rows = j.values || [];
const headers = rows[0];
const tickerIdx = headers.indexOf('Ticker');
const isinCol   = headers.indexOf('isin');
const companyIdx = headers.indexOf('companyName');
const currencyIdx = headers.indexOf('currency');
const priceIdx = headers.indexOf('price');

// Build lookup
const lookup = {};
rows.slice(1).forEach(row => {
  const t = String(row[tickerIdx] || '').trim();
  if (!t || t === '#N/A') return;
  const bare = normaliseTicker(t);
  if (!lookup[bare]) {
    lookup[bare] = {
      raw: t,
      isin: String(row[isinCol] || '').trim(),
      company: String(row[companyIdx] || '').trim(),
      currency: String(row[currencyIdx] || '').trim(),
      price: row[priceIdx]
    };
  }
});

const indexEntries = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));

const fixes = [];

// ── 1. Fix N/A entry (MS International PLC) ──────────────────────────────────
// The N/A entry has file=msinternationalplc.html and is MS International PLC.
// It's a duplicate of LON:MSI which IS in the sheet.
// Fix: Update in place with correct data from sheet.
const naEntry = indexEntries.find(e => e.ticker === 'N/A');
if (naEntry) {
  const msiInfo = lookup['MSI'];
  if (msiInfo) {
    naEntry.ticker = 'MSI';
    naEntry.company = 'MS International plc';
    naEntry.isin = msiInfo.isin;
    naEntry.currency = 'GBX';
    naEntry.price = parsePrice(msiInfo.price);
    naEntry.priceAtLastReport = naEntry.price;
    naEntry.marketCapAtLastReport = null;
    naEntry.recommendation = 'SPECULATIVE BUY';
    naEntry.conviction = 35;
    naEntry.convictionHistory = [{ date: naEntry.date, conviction: 35 }];
    fixes.push({ action: 'fixed N/A entry', ticker: 'MSI', company: 'MS International plc' });
    console.log('Fixed N/A entry -> MSI (MS International plc)');
  } else {
    // MSI not in sheet - use file name and manual data
    naEntry.ticker = 'MSI';
    naEntry.company = 'MS International plc';
    naEntry.isin = 'GB0006030996'; // from sheet earlier
    naEntry.currency = 'GBX';
    naEntry.price = 1580.00;
    naEntry.priceAtLastReport = 1580.00;
    naEntry.marketCapAtLastReport = null;
    naEntry.recommendation = 'SPECULATIVE BUY';
    naEntry.conviction = 35;
    naEntry.convictionHistory = [{ date: naEntry.date, conviction: 35 }];
    fixes.push({ action: 'fixed N/A entry (hardcoded)', ticker: 'MSI' });
    console.log('Fixed N/A entry -> MSI (hardcoded from sheet earlier)');
  }
}

// ── 2. Fix CRH price ─────────────────────────────────────────────────────────
const crhEntry = indexEntries.find(e => e.ticker === 'CRH');
if (crhEntry) {
  const crhSheet = lookup['CRH'];
  if (crhSheet && crhSheet.price) {
    crhEntry.price = parsePrice(crhSheet.price);
    crhEntry.currency = crhSheet.currency === 'EUR' ? 'EUR' : crhEntry.currency;
    crhEntry.priceAtLastReport = crhEntry.price;
    if (crhSheet.currency) crhEntry.currency = crhSheet.currency;
    fixes.push({ action: 'fixed CRH price', ticker: 'CRH', price: crhEntry.price, currency: crhEntry.currency });
    console.log('Fixed CRH price:', crhEntry.price, crhEntry.currency);
  } else {
    // CRH is listed on NYSE as CRH — not in the sheet (sheet has LSE:CRH)
    // Look for CRH in sheet
    const crhRow = rows.slice(1).find(r => String(r[tickerIdx]||'').includes('CRH'));
    if (crhRow) {
      crhEntry.price = parsePrice(crhRow[priceIdx]);
      crhEntry.currency = String(crhRow[currencyIdx] || '').trim();
      crhEntry.priceAtLastReport = crhEntry.price;
      fixes.push({ action: 'fixed CRH price (from row)', ticker: 'CRH', price: crhEntry.price, currency: crhEntry.currency });
      console.log('Fixed CRH price from row:', crhEntry.price, crhEntry.currency);
    } else {
      fixes.push({ action: 'CRH not in sheet', ticker: 'CRH' });
      console.log('CRH not found in sheet');
    }
  }
}

// ── 3. Resolve 25 unresolvable currencies ────────────────────────────────────
// From the 25 currency NEEDS-REVIEW entries — resolve using sheet exchange info
const currencyGaps = [
  'ALK', 'AVCT.L', 'CRH', 'ETL', 'GLB', 'GGP.L', 'GRP',
  'J9J', 'BIG', 'INDIGO', 'KYGA.L', 'LND', 'MRL', 'MKA',
  'N/A', 'PALM', 'PTSB', 'PVE', 'PXEN', 'QED', 'RNO',
  'ALRIB', 'SIVE.ST', 'VEQT', 'ZPHR'
];

const currencyFixLog = [];

indexEntries.forEach(entry => {
  if (entry.currency !== 'NEEDS-REVIEW') return;

  // Find sheet row for this entry
  const bare = normaliseTicker(entry.ticker);
  const sheetRow = lookup[bare];

  let resolvedCurrency = null;

  if (sheetRow && sheetRow.currency && !sheetRow.currency.startsWith('#') && sheetRow.currency.trim()) {
    const c = sheetRow.currency.trim().toUpperCase();
    if (['USD','GBP','GBX','EUR','CAD','AUD','JPY','CHF','SEK','NOK','DKK','NZD'].includes(c)) {
      resolvedCurrency = c;
    }
  }

  if (!resolvedCurrency) {
    // Infer from exchange or price string
    const priceStr = String(entry.price || '');
    const exchange = String(entry.exchange || '').toUpperCase();

    if (priceStr.includes('GBX') || priceStr.includes('p')) {
      resolvedCurrency = 'GBX';
    } else if (priceStr.includes('EUR') || priceStr.includes('€')) {
      resolvedCurrency = 'EUR';
    } else if (priceStr.includes('CAD') || priceStr.includes('C$')) {
      resolvedCurrency = 'CAD';
    } else if (exchange.includes('LSE') || exchange.includes('AIM') || exchange.includes('LN')) {
      resolvedCurrency = 'GBX';
    } else if (exchange.includes('TSX') || exchange.includes('TO')) {
      resolvedCurrency = 'CAD';
    } else if (exchange.includes('ASX') || exchange.includes('AX')) {
      resolvedCurrency = 'AUD';
    } else if (exchange.includes('STO') || exchange.includes('SN')) {
      resolvedCurrency = 'SEK';
    }
  }

  if (resolvedCurrency) {
    entry.currency = resolvedCurrency;
    currencyFixLog.push({ ticker: bare, currency: resolvedCurrency, source: sheetRow ? 'sheet' : 'inferred' });
  } else {
    currencyFixLog.push({ ticker: bare, currency: 'UNRESOLVED', note: 'no sheet row and no price/exchange hint' });
  }
});

fs.writeFileSync(INDEX_PATH, JSON.stringify(indexEntries, null, 2), 'utf8');

console.log('\nStep C summary:');
console.log('  N/A entry fixed:', fixes.filter(f => f.action.includes('N/A')).length);
console.log('  CRH price fixed:', fixes.filter(f => f.action.includes('CRH')).length);
console.log('');
console.log('  Currencies resolved:', currencyFixLog.filter(c => c.currency !== 'UNRESOLVED').length);
console.log('  Currencies still unresolved:', currencyFixLog.filter(c => c.currency === 'UNRESOLVED').length);
currencyFixLog.filter(c => c.currency === 'UNRESOLVED').forEach(c => console.log('    UNRESOLVED:', c.ticker));
console.log('');
currencyFixLog.filter(c => c.currency !== 'UNRESOLVED').forEach(c => console.log('  ', c.ticker, '->', c.currency, '(' + c.source + ')'));

const report = { generatedAt: new Date().toISOString(), fixes, currencyFixLog };
fs.writeFileSync('/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4/logs/step-c-fixes.json', JSON.stringify(report, null, 2));
console.log('\nLog: logs/step-c-fixes.json');