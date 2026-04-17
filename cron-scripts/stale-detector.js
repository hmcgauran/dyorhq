/**
 * cron-scripts/stale-detector.js
 * Flags reports where current market data has diverged significantly from last-written values.
 *
 * Output: state/stale-candidates.json
 * {
 *   generatedAt: ISO string,
 *   stale:     [{ ticker, company, lastReportDate, triggers, currentPrice, priceAtLastReport, currentMktCap, marketCapAtLastReport, currentPE, peAtLastReport }],
 *   deferred:  [{ ticker, company, reason }],
 *   unresolvable: [{ ticker, companyName, reason }]
 * }
 *
 * Spec thresholds:
 *   price move    > 15%  → stale
 *   market cap    > 20%  → stale
 *   P/E change    > 20 pts → stale
 * LSE/AIM tickers outside 08:00–16:30 GMT → deferred
 * RNS material score >= 7 filed after last report date → stale by event
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { resolveTicker } = require('./lib/ticker-resolver');

const SHEET_ID = '1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM';
const STATE_DIR = path.join(__dirname, '..', 'state');
const OUTPUT_PATH = path.join(STATE_DIR, 'stale-candidates.json');
const RESEARCH_DIR = path.join(__dirname, '..', '..', 'research');

// ─────────────────────────────────────────────
// isLSEOpen() — spec verbatim
// ─────────────────────────────────────────────
function isLSEOpen() {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  const utcTime = utcHour * 60 + utcMinute;
  const open  = 8  * 60;      // 08:00 GMT
  const close = 16 * 60 + 30; // 16:30 GMT
  const day = now.getUTCDay();
  return day >= 1 && day <= 5 && utcTime >= open && utcTime < close;
}

// ─────────────────────────────────────────────
// Load Google Sheet — loadGoogleFinanceSheet()
// Returns array of row objects keyed by column header name
// ─────────────────────────────────────────────
function loadGoogleFinanceSheet() {
  const raw = execFileSync('gws', [
    'sheets', 'spreadsheets', 'values', 'get', '--params',
    JSON.stringify({
      spreadsheetId: SHEET_ID,
      range: 'Sheet1!A:ZZ',
      valueRenderOption: 'FORMATTED_VALUE',
    }),
  ], { encoding: 'utf8' });

  let jsonStr = raw.trim();
  if (!jsonStr.startsWith('{')) {
    const brace = jsonStr.indexOf('{');
    if (brace >= 0) jsonStr = jsonStr.slice(brace);
  }

  const { values = [], majorDimension } = JSON.parse(jsonStr);
  if (!values || values.length === 0) return [];

  const headers = values[0];
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = row[i] ?? null; });
    return obj;
  });
}

// ─────────────────────────────────────────────
// Check RNS material score in research/{slug}/rns/
// Returns true if any RNS was filed after lastReportDate with Material score >= 7
// ─────────────────────────────────────────────
function hasMaterialRNS(slug, lastReportDate) {
  const rnsDir = path.join(RESEARCH_DIR, slug, 'rns');
  if (!fs.existsSync(rnsDir)) return false;

  const lastDate = new Date(lastReportDate);
  const files = fs.readdirSync(rnsDir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    // Skip archive files
    if (file.includes('_archive')) continue;

    const content = fs.readFileSync(path.join(rnsDir, file), 'utf8');

    // Extract Material score: N/10 or Assessment: MATERIAL
    let score = null;
    const scoreMatch = content.match(/Material score:\s*(\d+)\/10/i);
    if (scoreMatch) score = parseInt(scoreMatch[1], 10);
    const assessmentMatch = content.match(/Assessment:\s*MATERIAL/i);
    const isMaterial = assessmentMatch || (score !== null && score >= 7);

    if (!isMaterial) continue;

    // Extract RNS date from filename (YYYY-MM-DD prefix) or content
    let rnsDate = null;
    const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      rnsDate = new Date(dateMatch[1]);
    } else {
      const contentDateMatch = content.match(/\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})/);
      if (contentDateMatch) rnsDate = new Date(contentDateMatch[1]);
    }

    if (!rnsDate) continue;

    // Flag if RNS date is after the last report date
    if (rnsDate > lastDate) return true;
  }

  return false;
}

// ─────────────────────────────────────────────
// Slug builder — matches how research/ directory is organised
// ─────────────────────────────────────────────
function slugFromFile(file) {
  return file.replace(/\.html$/, '').toLowerCase();
}

// ─────────────────────────────────────────────
// Main stale detection run
// ─────────────────────────────────────────────
function runStaleDetector() {
  const index = require('../reports/index.json');
  const sheet = loadGoogleFinanceSheet();
  const indexByTicker = new Map(index.map(e => [e.ticker, e]));

  const stale = [];
  const deferred = [];
  const unresolvable = [];

  for (const entry of index) {
    const { ticker, company, file, date: lastReportDate, exchange } = entry;
    const slug = slugFromFile(file || '');

    // ── Step 1: Resolve sheet row via ticker resolver ─────────────────────
    const sheetRow = sheet.find(r => {
      const rTicker = r.Ticker || r.ticker || '';
      return rTicker.toUpperCase() === ticker.toUpperCase();
    });

    let resolvedRow = null;
    if (sheetRow) {
      resolvedRow = sheetRow;
    } else {
      // Try by normalised ticker
      const normTicker = ticker.replace(/^[A-Z\-]+:/i, '').trim().toUpperCase();
      resolvedRow = sheet.find(r => {
        const rTicker = (r.Ticker || r.ticker || '').replace(/^[A-Z\-]+:/i, '').trim().toUpperCase();
        return rTicker === normTicker;
      }) || null;
    }

    if (!resolvedRow) {
      unresolvable.push({ ticker, company, reason: 'No sheet match found' });
      continue;
    }

    // ── Step 2: Check LSE hours ───────────────────────────────────────────
    const isLSE = exchange && (exchange.toUpperCase().includes('LSE') || exchange.toUpperCase().includes('AIM'));
    if (isLSE && !isLSEOpen()) {
      deferred.push({ ticker, company, reason: 'LSE outside market hours' });
      continue;
    }

    // ── Step 3: Compute deltas ────────────────────────────────────────────
    const currentPrice = parseFloat(resolvedRow.price) || null;
    const currentMktCap = parseFloat(resolvedRow.marketCap) || null;
    const currentPE = parseFloat(resolvedRow.pe) || null;
    const priceAtLastReport = entry.priceAtLastReport;
    const marketCapAtLastReport = entry.marketCapAtLastReport;
    const peAtLastReport = entry.peAtLastReport;

    const triggers = [];
    let isStale = false;

    if (priceAtLastReport && currentPrice && priceAtLastReport > 0) {
      const priceDelta = Math.abs(currentPrice - priceAtLastReport) / priceAtLastReport;
      if (priceDelta > 0.15) {
        const pct = ((priceDelta - 1) * 100).toFixed(1);
        triggers.push(`price: ${pct}%`);
        isStale = true;
      }
    }

    if (marketCapAtLastReport && currentMktCap && marketCapAtLastReport > 0) {
      const mktCapDelta = Math.abs(currentMktCap - marketCapAtLastReport) / marketCapAtLastReport;
      if (mktCapDelta > 0.20) {
        const pct = ((mktCapDelta - 1) * 100).toFixed(1);
        triggers.push(`marketCap: ${pct}%`);
        isStale = true;
      }
    }

    if (peAtLastReport !== null && currentPE !== null && !isNaN(peAtLastReport) && !isNaN(currentPE)) {
      const peDelta = Math.abs(currentPE - peAtLastReport);
      if (peDelta > 20) {
        triggers.push(`PE: ${peDelta.toFixed(0)} pts`);
        isStale = true;
      }
    }

    // ── Step 4: Check for material RNS after last report date ────────────
    if (!isStale && slug && hasMaterialRNS(slug, lastReportDate)) {
      triggers.push('material RNS event');
      isStale = true;
    }

    if (isStale) {
      stale.push({
        ticker,
        company,
        lastReportDate,
        triggers,
        currentPrice: currentPrice || null,
        priceAtLastReport: priceAtLastReport || null,
        currentMktCap: currentMktCap || null,
        marketCapAtLastReport: marketCapAtLastReport || null,
        currentPE: currentPE || null,
        peAtLastReport: peAtLastReport || null,
      });
    }
  }

  const result = {
    generatedAt: new Date().toISOString(),
    stale,
    deferred,
    unresolvable,
  };

  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2), 'utf8');

  console.log(`Stale detector complete.`);
  console.log(`  Stale:       ${stale.length}`);
  console.log(`  Deferred:    ${deferred.length}`);
  console.log(`  Unresolvable: ${unresolvable.length}`);
  console.log(`  Output: ${OUTPUT_PATH}`);

  return result;
}

if (require.main === module) {
  runStaleDetector();
}

module.exports = { runStaleDetector, isLSEOpen, loadGoogleFinanceSheet };
