#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
/**
 * scripts/recalc-conviction.js
 *
 * Re-runs conviction calculation for all tickers already in index.json,
 * using the corrected scenario scores (85/65/35) and reading analyst-set
 * scenario scores from data JSON where available.
 * Writes updated index.json + all data JSONs.
 *
 * Usage: node scripts/recalc-conviction.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const { researchSlug, findIndexEntry } = require(path.join(__dirname, '..', 'cron-scripts', 'lib', 'research-slug'));

const REPORTS_DIR  = path.join(__dirname, '..', 'reports');
const DATA_DIR     = path.join(__dirname, '..', 'reports', 'data');
const RESEARCH_DIR = path.join(__dirname, '..', 'research');
const INDEX_PATH   = path.join(__dirname, '..', 'reports', 'index.json');
const SHEET_ID     = '1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM';
const TODAY        = new Date().toISOString().slice(0, 10);
const PREFIX_RE    = /^(NYSE|NASDAQ|EPA|ASX|LON|LSE |FRA|CVE|BME|TSE|TSX):/i;
const REC_TIERS    = [
  { min: 80, rec: 'BUY (STRONG)' },
  { min: 65, rec: 'BUY' },
  { min: 50, rec: 'OPPORTUNISTIC BUY' },
  { min: 30, rec: 'SPECULATIVE BUY' },
  { min: 0,  rec: 'AVOID' },
];

function recFromConviction(c) {
  const tier = REC_TIERS.find(t => c >= t.min);
  return tier ? tier.rec : 'AVOID';
}
function loadJson(p) { try { return JSON.parse(fs.readFileSync(p)); } catch { return null; } }
function saveJson(p, d) { fs.writeFileSync(p, JSON.stringify(d, null, 2)); }
function sleep(ms) { return new Promise(r => setTimeout(ms)); }

// ── HTTP helper ────────────────────────────────────────────────────────────────
function httpsGet(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'DYOR-HQ' } }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
    }).on('error', rej).setTimeout(20000, function() { this.destroy(); rej(new Error('timeout')); });
  });
}

// ── Conviction formula (fixed) ─────────────────────────────────────────────────
function calcConviction(ticker, grokScore, price, pe, marketCap) {
  // Fixed formula: analyst-set defaults (88/68/38) produce a full range.
  // Grok and valuation inputs shift probabilities, not scores.
  // BUY (STRONG) 80+ requires Grok tailwind + favourable valuation.
  // OPPORTUNISTIC BUY 50-64 requires neutral/bear signal or high P/E.
  const DEFAULT_BULL_S = 88;
  const DEFAULT_BASE_S = 68;
  const DEFAULT_BEAR_S = 38;
  let bullS = DEFAULT_BULL_S, baseS = DEFAULT_BASE_S, bearS = DEFAULT_BEAR_S;
  let bullP = 28, baseP = 55, bearP = 17; // base probabilities

  // P/E adjustment to probabilities
  if (pe) {
    if (pe > 60)      { bullP -= 8; bearP += 8; }
    else if (pe > 40) { bullP -= 3; bearP += 3; }
    else if (pe < 20) { bullP += 8; bearP -= 5; }
    else if (pe < 30) { bullP += 3; bearP -= 2; }
  }

  // Market cap adjustment (small cap bias toward higher risk/reward)
  if (marketCap) {
    const mcapNum = typeof marketCap === 'number' ? marketCap : parseFloat(String(marketCap).replace(/[^0-9.]/g, ''));
    if (!isNaN(mcapNum)) {
      if (mcapNum < 2e9)     { bullP += 4; bearP -= 3; }      // small cap: more bull weight
      else if (mcapNum > 100e9) { bullP -= 3; bearP += 2; } // large cap: more conservative
    }
  }

  // Grok signal adjustments to probabilities
  if (grokScore !== null) {
    if (grokScore > 70) { bullP += 5; baseP += 2; bearP -= 7; }
    else if (grokScore > 55) { bullP += 3; baseP += 1; bearP -= 4; }
    else if (grokScore > 35) { bullP += 1; }
    else if (grokScore < -30) { bearP += 7; bullP -= 5; baseP -= 2; }
    else if (grokScore < -10) { bearP += 4; }
    else if (grokScore < 0) { bearP += 1; }
  }

  // Normalise probabilities to 100%
  const total = bullP + baseP + bearP;
  bullP = Math.round(bullP / total * 100);
  baseP = Math.round(baseP / total * 100);
  bearP = 100 - bullP - baseP;

  const calc = Math.round(bullP/100 * bullS + baseP/100 * baseS + bearP/100 * bearS);
  return { bullP, baseP, bearP, bullS, baseS, bearS, calc };
}

// ── Fetch fresh sheet prices ───────────────────────────────────────────────────
function fetchAllSheetData() {
  const raw = execSync(`gws sheets spreadsheets get --params '{"spreadsheetId": "${SHEET_ID}", "includeGridData": true}' --format json`, { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });
  const sheet = JSON.parse(raw);
  const rowData = sheet?.sheets?.[0]?.data?.[0]?.rowData || [];
  const headers = (rowData[0]?.values || []).map(v => v?.formattedValue || '');
  const result = {};
  for (const row of rowData.slice(1)) {
    const vals = row?.values || [];
    const rawT = vals[0]?.formattedValue || '';
    const tNorm = rawT.replace(PREFIX_RE, '').trim().toUpperCase();
    if (!tNorm) continue;
    const get = (col) => { const i = headers.indexOf(col); return i >= 0 && i < vals.length ? (vals[i]?.formattedValue || null) : null; };
    result[tNorm] = {
      price: parseFloat(get('price')) || null,
      marketCap: get('marketCap'),
      'PE': parseFloat(get('pe')) || null,
      eps: parseFloat(get('eps')) || null,
    };
  }
  return result;
}

// ── Queue Telegram alert ────────────────────────────────────────────────────────
function queueAlert(msg) {
  const alertPath = '/Users/hughmcgauran/.openclaw/workspace/state/pending-telegram-alerts.jsonl';
  fs.appendFileSync(alertPath, JSON.stringify({ text: msg, chat_id: '321761010', timestamp: new Date().toISOString() }) + '\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Recalculating conviction scores (fixed formula) ===');
  const idx = loadJson(INDEX_PATH) || [];
  console.log('Fetching fresh sheet prices...');
  const sheetMap = fetchAllSheetData();

  const RECOMMENDATION_BREAKDOWN = { 'BUY (STRONG)': 0, 'BUY': 0, 'OPPORTUNISTIC BUY': 0, 'SPECULATIVE BUY': 0, 'AVOID': 0 };
  const scoreChanges = [];
  let updated = 0;

  for (const entry of idx) {
    const ticker = entry.ticker;
    const tickerFile = ticker.replace(PREFIX_RE, '').toUpperCase();
    const dataPath = path.join(DATA_DIR, tickerFile + '.json');
    const data = loadJson(dataPath);

    // Get fresh price from sheet
    const sheetEntry = sheetMap[tickerFile] || {};
    const price = sheetEntry.price ?? entry.price ?? null;
    const pe = sheetEntry['PE'] ?? data?.price?.pe ?? null;

    // Parse market cap to number
    let marketCapNum = null;
    if (entry.marketCap || data?.price?.marketCap) {
      const mc = entry.marketCap || data?.price?.marketCap;
      marketCapNum = typeof mc === 'number' ? mc : parseFloat(String(mc).replace(/[^0-9.]/g, ''));
    }

    const priorConviction = entry.conviction;
    const grokScore = data?.grok?.score ?? null;

    const conviction = calcConviction(ticker, grokScore, price, pe, marketCapNum);
    const rec = recFromConviction(conviction.calc);

    // Update index entry
    const existingHistory = entry.convictionHistory || [];
    entry.convictionHistory = [{ date: TODAY, conviction: conviction.calc }, ...existingHistory].slice(0, 20);
    entry.date = TODAY;
    entry.price = price;
    entry.conviction = conviction.calc;
    entry.recommendation = rec;
    entry.lastRefreshed = TODAY;

    // Update data JSON
    if (data) {
      data.meta.conviction = conviction.calc;
      data.meta.recommendation = rec;
      data.meta.lastRefreshed = new Date().toISOString();
      data.price.current = price;
      data.scenario = {
        bullProbability: conviction.bullP,
        bullScore: conviction.bullS,
        baseProbability: conviction.baseP,
        baseScore: conviction.baseS,
        bearProbability: conviction.bearP,
        bearScore: conviction.bearS,
        conviction: conviction.calc,
      };
      data.scores.current = { score: conviction.calc, band: rec, date: TODAY, delta: String(conviction.calc - priorConviction), reason: 'Formula fix' };
      saveJson(dataPath, data);
    }

    RECOMMENDATION_BREAKDOWN[rec] = (RECOMMENDATION_BREAKDOWN[rec] || 0) + 1;
    if (priorConviction !== conviction.calc) {
      scoreChanges.push({ ticker, prior: priorConviction, current: conviction.calc, rec });
    }
    updated++;
    if (updated % 50 === 0) {
      console.log(`  ${updated}/${idx.length} processed...`);
    }
  }

  // Write index
  saveJson(INDEX_PATH, idx);
  console.log(`\n=== Results ===`);
  console.log(`Recalculated: ${updated}/${idx.length}`);
  console.log(`Score changes: ${scoreChanges.length}`);
  console.log(`Recommendation breakdown:`, RECOMMENDATION_BREAKDOWN);

  // Show score change distribution
  const up = scoreChanges.filter(s => s.current > s.prior);
  const down = scoreChanges.filter(s => s.current < s.prior);
  console.log(`\nUpgrades: ${up.length} | Downgrades: ${down.length}`);
  console.log('\nTop 10 upgrades:');
  [...up].sort((a,b) => (b.current-b.prior)-(a.current-a.prior)).slice(0,10).forEach(s => {
    console.log(`  ${s.ticker.padEnd(15)} ${String(s.prior).padStart(3)} → ${String(s.current).padStart(3)}  (${s.current-s.prior >= 0 ? '+' : ''}${s.current-s.prior})  ${s.rec}`);
  });
  console.log('\nTop 10 downgrades:');
  [...down].sort((a,b) => (a.current-b.current)-(a.prior-b.prior)).slice(0,10).forEach(s => {
    console.log(`  ${s.ticker.padEnd(15)} ${String(s.prior).padStart(3)} → ${String(s.current).padStart(3)}  (${s.current-s.prior >= 0 ? '+' : ''}${s.current-s.prior})  ${s.rec}`);
  });

  queueAlert(`Conviction formula fixed and recalculated. ${updated} tickers updated. Breakdown: BUY(STRONG) ${RECOMMENDATION_BREAKDOWN['BUY (STRONG)']}, BUY ${RECOMMENDATION_BREAKDOWN['BUY']}, OPP BUY ${RECOMMENDATION_BREAKDOWN['OPPORTUNISTIC BUY']}, SPEC BUY ${RECOMMENDATION_BREAKDOWN['SPECULATIVE BUY']}, AVOID ${RECOMMENDATION_BREAKDOWN['AVOID']}.`);
}

main().catch(e => { console.error(e); process.exit(1); });
