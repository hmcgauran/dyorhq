#!/usr/bin/env node
/**
 * scripts/migrate-index-v2.js
 * Migrates reports/index.json from v1 schema to v2 canonical schema.
 * Idempotent — safe to run multiple times.
 * convictionHistory backfilled from reports/data/{TICKER}.json → scores.history
 */

const fs = require('fs');
const path = require('path');

const INDEX_PATH = path.join(__dirname, '../reports/index.json');
const DATA_DIR   = path.join(__dirname, '../reports/data');
const LOGS_DIR   = path.join(__dirname, '../logs');

// ─── Normalisation helpers ───────────────────────────────────────────────────

function normaliseTicker(raw) {
  let t = String(raw || '').trim();
  // Remove exchange prefix: LSE:, NYSE:, ISE:, TSX-V:, TSX:, ASX:, BME:, etc.
  t = t.replace(/^[A-Z\-]+:/i, '').trim();
  // Remove parenthetical exchange: "(NYSE)", "(LSE)", etc.
  t = t.replace(/\s*\([^)]*\)/g, '').trim();
  // Remove trailing suffixes: .L, .AX, .TO, .V
  t = t.replace(/\.(L|AX|TO|V)$/i, '').trim();
  // Remove trailing exchange name: " TSX-V", " LSE", " NYSE", etc.
  t = t.replace(/\s+(TSX-V|TSX|LSE|NYSE|ISE|ASX|BME)$/i, '').trim();
  return t.toUpperCase();
}

function normaliseCompany(raw) {
  return raw
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\b(plc|ltd|inc|corp|sa|nv|ag|se|as|oy)\b/gi, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
    .trim();
}

function normaliseRecommendation(raw) {
  const r = String(raw || '').toLowerCase().trim();
  if (['strong buy', 'buy (strong)', 'buy - strong', 'buy (strong buy)', 'buy'].includes(r)) return 'BUY';
  if (['opportunistic buy', 'opportunistic', 'buy (opportunistic)'].includes(r)) return 'OPPORTUNISTIC BUY';
  if (['speculative buy', 'speculative', 'spec buy', 'spec'].includes(r)) return 'SPECULATIVE BUY';
  if (['reduce', 'avoid', 'sell', 'reduce - speculative', 'reduce (spec)'].includes(r)) return 'REDUCE';
  return 'NEEDS-REVIEW';
}

function normaliseDate(raw) {
  const s = String(raw || '').trim();
  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { value: s, ok: true };
  // Try native Date parsing
  const d = new Date(s);
  if (!isNaN(d)) {
    return { value: d.toISOString().split('T')[0], ok: true };
  }
  // Fallback
  return { value: 'NEEDS-REVIEW', ok: false };
}

function parsePrice(raw) {
  const s = String(raw || '');
  // Strip currency symbols, spaces
  const numeric = parseFloat(s.replace(/[^0-9.]/g, ''));
  if (isNaN(numeric)) return { value: null, original: s };
  return { value: numeric, original: s };
}

function inferCurrency(priceString, exchange) {
  const s = String(priceString || '');
  if (s.includes('GBX')) return 'GBX';
  if (s.includes('$')) return 'USD';
  const ex = String(exchange || '');
  if (/LSE|AIM/i.test(ex)) return 'GBX';
  if (/TSX/i.test(ex)) return 'CAD';
  if (/ASX/i.test(ex)) return 'AUD';
  if (/BME/i.test(ex)) return 'EUR';
  if (/NYSE|NASDAQ/i.test(ex)) return 'USD';
  return 'NEEDS-REVIEW';
}

// ─── Conviction history from data file ───────────────────────────────────────

function loadConvictionHistory(ticker, entryDate) {
  const dataFile = path.join(DATA_DIR, `${ticker}.json`);
  if (!fs.existsSync(dataFile)) return null;

  let data;
  try {
    data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch {
    return null;
  }

  const history = data?.scores?.history;
  if (!Array.isArray(history) || history.length === 0) return null;

  return history
    .filter(h => h.score != null)
    .map(h => ({
      date: h.date && h.date.trim() !== '' ? h.date : entryDate,
      conviction: h.score
    }));
}

// ─── Main migration ───────────────────────────────────────────────────────────

const raw = fs.readFileSync(INDEX_PATH, 'utf8');
const entries = JSON.parse(raw);

const log = {
  generatedAt: new Date().toISOString(),
  total: entries.length,
  fields: {
    datesNormalised: 0,
    datesNeedsReview: [],
    pricesNormalised: 0,
    pricesNeedsReview: [],
    currenciesInferred: 0,
    currenciesNeedsReview: [],
    isinsNeedsReview: [],
    recommendationsNormalised: 0,
    recommendationsNeedsReview: [],
    reportUrlRemoved: 0,
    convictionHistoryBackfilled: 0,
    convictionHistoryNeedsReview: [],
    snapshotFieldsSet: 0,
    tickersWithExchangePrefix: []
  },
  migrated: []
};

const migrated = entries.map(entry => {
  const m = { original: {}, changes: [] };

  // ticker — strip exchange prefix
  const rawTicker = entry.ticker || '';
  const bareTicker = normaliseTicker(rawTicker);
  if (rawTicker !== bareTicker) {
    m.original.ticker = rawTicker;
    m.changes.push('ticker: stripped exchange prefix');
    log.fields.tickersWithExchangePrefix.push({ original: rawTicker, bare: bareTicker });
  }

  // company — strip exchange prefix from name
  const rawCompany = entry.company || '';
  let cleanCompany = rawCompany
    .replace(/^[A-Z\-]+:/i, '')  // strip leading exchange prefix
    .replace(/\s*-\s*$/, '')      // trailing " - " cleanup
    .trim();

  // ISIN
  const rawIsin = entry.isin || '';
  if (!rawIsin || !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i.test(rawIsin)) {
    m.original.isin = rawIsin;
    log.fields.isinsNeedsReview.push({ ticker: bareTicker, value: rawIsin || '(empty)' });
  }

  // date
  const dateNorm = normaliseDate(entry.date);
  if (!dateNorm.ok) {
    log.fields.datesNeedsReview.push({ ticker: bareTicker, value: entry.date });
  } else if (dateNorm.value !== entry.date) {
    m.original.date = entry.date;
    log.fields.datesNormalised++;
  }

  // recommendation
  const recNorm = normaliseRecommendation(entry.recommendation);
  if (recNorm === 'NEEDS-REVIEW') {
    log.fields.recommendationsNeedsReview.push({ ticker: bareTicker, value: entry.recommendation });
  } else if (recNorm !== entry.recommendation) {
    m.original.recommendation = entry.recommendation;
    log.fields.recommendationsNormalised++;
  }

  // price + currency
  const priceNorm = parsePrice(entry.price);
  const exchange = entry.exchange || (bareTicker.includes(':') ? '' : '');  // exchange may not exist in v1
  const currency = inferCurrency(entry.price, exchange);

  if (priceNorm.value === null) {
    log.fields.pricesNeedsReview.push({ ticker: bareTicker, value: entry.price });
  } else {
    log.fields.pricesNormalised++;
  }

  if (currency === 'NEEDS-REVIEW') {
    log.fields.currenciesNeedsReview.push({ ticker: bareTicker, price: entry.price, exchange: exchange });
  } else {
    log.fields.currenciesInferred++;
  }

  // marketCap — try to extract numeric
  let marketCapVal = null;
  if (typeof entry.marketCap === 'number') {
    marketCapVal = entry.marketCap;
  } else if (typeof entry.marketCap === 'string') {
    const mc = parseFloat(String(entry.marketCap).replace(/[^0-9.]/g, ''));
    if (!isNaN(mc)) marketCapVal = mc;
  }

  // report_url — remove
  if ('report_url' in entry) {
    log.fields.reportUrlRemoved++;
  }

  // convictionHistory — backfill from data file
  const entryDate = dateNorm.ok ? dateNorm.value : 'NEEDS-REVIEW';
  const history = loadConvictionHistory(bareTicker, entryDate);

  let convictionHistory;
  if (history && history.length > 0) {
    convictionHistory = history;
    log.fields.convictionHistoryBackfilled++;
    // Check for blank-date entries
    const blankDateEntries = history.filter(h => h.date === entryDate && entry.date === 'NEEDS-REVIEW');
    if (blankDateEntries.length > 0) {
      log.fields.convictionHistoryNeedsReview.push({ ticker: bareTicker, blankEntries: blankDateEntries.length });
    }
  } else {
    convictionHistory = [{ date: entryDate, conviction: entry.conviction }];
  }

  // Build v2 entry
  const v2 = {
    ticker:                  bareTicker,
    company:                 cleanCompany || bareTicker,
    isin:                    (/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i.test(rawIsin) ? rawIsin : 'NEEDS-REVIEW'),
    exchange:                entry.exchange || '',
    file:                    entry.file,
    date:                    dateNorm.value,
    recommendation:          recNorm,
    conviction:              entry.conviction,
    currency:                currency === 'NEEDS-REVIEW' ? 'NEEDS-REVIEW' : currency,
    price:                   priceNorm.value,
    marketCap:               marketCapVal,
    sector:                  entry.sector || null,
    summary:                 entry.summary || null,
    universes:               Array.isArray(entry.universes) ? entry.universes : [],
    priceAtLastReport:       priceNorm.value,
    marketCapAtLastReport:   marketCapVal,
    peAtLastReport:          entry.pe ?? null,
    convictionHistory:       convictionHistory
  };

  // Remove null optional fields
  if (v2.sector === null) delete v2.sector;
  if (v2.summary === null) delete v2.summary;

  m.ticker = bareTicker;
  m.v2 = v2;

  log.migrated.push(m);
  return v2;
});

// ─── Write migrated index ─────────────────────────────────────────────────────

fs.writeFileSync(INDEX_PATH, JSON.stringify(migrated, null, 2), 'utf8');

// ─── Print summary ───────────────────────────────────────────────────────────

const { fields } = log;
console.log('\nMigration summary:');
console.log(`  Total entries:             ${fields.total}`);
console.log(`  Dates normalised:          ${fields.datesNormalised}`);
console.log(`  Dates needing review:      ${fields.datesNeedsReview.length}`);
if (fields.datesNeedsReview.length) {
  fields.datesNeedsReview.forEach(d => console.log(`    ${d.ticker}: "${d.value}"`));
}
console.log(`  Prices normalised:         ${fields.pricesNormalised}`);
console.log(`  Prices needing review:      ${fields.pricesNeedsReview.length}`);
if (fields.pricesNeedsReview.length) {
  fields.pricesNeedsReview.forEach(p => console.log(`    ${p.ticker}: "${p.value}"`));
}
console.log(`  Currencies inferred:       ${fields.currenciesInferred}`);
console.log(`  Currencies needing review:  ${fields.currenciesNeedsReview.length}`);
if (fields.currenciesNeedsReview.length) {
  fields.currenciesNeedsReview.forEach(c => console.log(`    ${c.ticker}: price="${c.price}", exchange="${c.exchange}"`));
}
console.log(`  ISINs needing review:       ${fields.isinsNeedsReview.length}`);
if (fields.isinsNeedsReview.length) {
  fields.isinsNeedsReview.slice(0, 20).forEach(i => console.log(`    ${i.ticker}: "${i.value}"`));
  if (fields.isinsNeedsReview.length > 20) console.log(`    ... and ${fields.isinsNeedsReview.length - 20} more`);
}
console.log(`  Recommendations normalised: ${fields.recommendationsNormalised}`);
console.log(`  Recommendations needing review: ${fields.recommendationsNeedsReview.length}`);
if (fields.recommendationsNeedsReview.length) {
  fields.recommendationsNeedsReview.forEach(r => console.log(`    ${r.ticker}: "${r.value}"`));
}
console.log(`  report_url fields removed:  ${fields.reportUrlRemoved}`);
console.log(`  Conviction history backfilled from data files: ${fields.convictionHistoryBackfilled}`);
console.log(`  Conviction history entries needing review: ${fields.convictionHistoryNeedsReview.length}`);
if (fields.convictionHistoryNeedsReview.length) {
  fields.convictionHistoryNeedsReview.forEach(h => console.log(`    ${h.ticker}: ${h.blankEntries} blank-date entries mapped to entry date`));
}
console.log(`  Tickers with exchange prefix stripped: ${fields.tickersWithExchangePrefix.length}`);
if (fields.tickersWithExchangePrefix.length) {
  fields.tickersWithExchangePrefix.slice(0, 10).forEach(t => console.log(`    "${t.original}" → "${t.bare}"`));
  if (fields.tickersWithExchangePrefix.length > 10) console.log(`    ... and ${fields.tickersWithExchangePrefix.length - 10} more`);
}

// ─── Write migration log ─────────────────────────────────────────────────────

if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
const logFile = path.join(LOGS_DIR, `migration-v2-${Date.now()}.json`);
fs.writeFileSync(logFile, JSON.stringify(log, null, 2), 'utf8');
console.log(`\nMigration log written to: ${logFile}`);
console.log('\n⚠️  Build will FAIL until all NEEDS-REVIEW values are resolved manually.');