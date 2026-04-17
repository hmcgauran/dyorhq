#!/usr/bin/env node
/**
 * scripts/pre-commit-check.js
 *
 * Pre-commit quality checklist for new or rewritten DYOR HQ reports.
 * Checks: price, Grok, web research, scenario framework, recommendation tier,
 * HTML sections, summary artefacts, build.
 *
 * Usage:
 *   node scripts/pre-commit-check.js              # checks all reports dated today
 *   node scripts/pre-commit-check.js TICKER [...]  # checks specific tickers
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const TODAY = new Date().toISOString().slice(0, 10);
const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const DATA_DIR    = path.join(__dirname, '..', 'reports', 'data');
const RESEARCH_DIR = path.join(__dirname, '..', 'research');
const INDEX_PATH  = path.join(__dirname, '..', 'reports', 'index.json');
const US_EXCHANGES_RE = /^(NYSE|NASDAQ|EPA|ASX|LON|LSE |FRA|CVE|BME|TSE|TSX|HKEX):/i;

function isUSTicker(ticker) {
  const t = ticker.replace(US_EXCHANGES_RE, '').toUpperCase();
  return !t.startsWith('LON') && !t.startsWith('LSE') && !t.startsWith('ISE') &&
         !t.startsWith('TSX') && !t.startsWith('ASX') && !t.startsWith('FRA') &&
         !t.startsWith('BME') && !t.startsWith('CVE');
}

const SHEET_ID = '1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM';

const REC_TIERS = [
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

function loadJson(p) {
  try { return JSON.parse(fs.readFileSync(p)); }
  catch { return null; }
}

// ── Resolve slug for a ticker ────────────────────────────────────────────────────
function resolveSlug(ticker, idxEntry) {
  if (idxEntry?.file) return idxEntry.file.replace(/\.html$/, '');
  // Fallback: build from ticker
  return ticker.toLowerCase().replace(/[^a-z0-9]/g, '') + '.html';
}

// ── Fetch price from Google Sheet ─────────────────────────────────────────────
function fetchSheetPrice(ticker) {
  return new Promise(resolve => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?ranges=Sheet1&includeGridData=true&key=${process.env.GOOGLE_SHEETS_API_KEY || ''}`;
    const req = https.get(url, { headers: { 'User-Agent': 'DYOR-HQ' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const rows = JSON.parse(data).sheets?.[0]?.data?.[0]?.rowData || [];
          const headers = rows[0]?.values?.map(h => h?.formattedValue || '') || [];
          const tIdx = headers.indexOf('Ticker');
          const pIdx = headers.indexOf('price');
          const PREFIX_RE = /^(NYSE|NASDAQ|EPA|ASX|LON|LSE |FRA|CVE|BME|TSE|TSX):/i;
          const tNorm = ticker.replace(PREFIX_RE, '').toUpperCase();
          for (const row of rows.slice(1)) {
            const vals = row?.values || [];
            const raw = vals[tIdx]?.formattedValue || '';
            const nRaw = raw.replace(PREFIX_RE, '').trim().toUpperCase();
            if (nRaw === tNorm) {
              resolve({ price: vals[pIdx]?.formattedValue || null, source: 'sheet' });
              return;
            }
          }
          resolve({ price: null, source: 'not_in_sheet' });
        } catch { resolve({ price: null, source: 'sheet_error' }); }
      });
    });
    req.on('error', () => resolve({ price: null, source: 'network_error' }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ price: null, source: 'timeout' }); });
    req.end();
  });
}

// ── Check HTML sections ────────────────────────────────────────────────────────
const REQUIRED_SECTIONS = [
  'Executive Summary', 'Business Model', 'Financial Snapshot',
  'Recent Catalysts', 'Thesis Evaluation', 'Key Risks',
  'Who Should Own It', 'Recommendation', 'Entry',
  'Conviction Trend', 'Sources',
];

function checkSections(html) {
  return REQUIRED_SECTIONS.filter(s => {
    return !html.includes(`<h2>${s}</h2>`) && !html.includes(`<h2>${s} /`) && !html.includes(`<h2>${s} —`);
  });
}

// ── Parse scenario framework from JSON ─────────────────────────────────────────
function parseScenarios(data) {
  // Try multiple possible locations for the scenarios
  const sections = data?.sections || {};
  const keys = ['Thesis Evaluation', 'thesisEvaluation', 'Thesis', 'thesis'];
  for (const k of keys) {
    const t = sections[k];
    if (!t) continue;
    // Direct scenarios object
    const sc = t.scenarios || t;
    if (!sc || typeof sc !== 'object') continue;
    const bull = sc.Bull || sc.bull || sc.BULL || {};
    const base = sc.Base || sc.base || sc.BASE || {};
    const bear = sc.Bear || sc.bear || sc.BEAR || {};
    // probability or weight
    const bp = parseFloat(bull.probability || bull.weight || 0);
    const bap = parseFloat(base.probability || base.weight || 0);
    const bep = parseFloat(bear.probability || bear.weight || 0);
    // score — try several field names
    const bs = parseFloat(bull.score || bull.priceTargetScore || bull.convictionScore || 0);
    const bas = parseFloat(base.score || base.priceTargetScore || base.convictionScore || 0);
    const bes = parseFloat(bear.score || bear.priceTargetScore || bear.convictionScore || 0);
    if (bp + bap + bep > 0) {
      const total = (bp + bap + bep) / 100;
      const calc = Math.round((bp/100*bs + bap/100*bas + bep/100*bes) / (total || 1));
      return { bull: { p: bp, s: bs }, base: { p: bap, s: bas }, bear: { p: bep, s: bes }, calc };
    }
  }
  return null;
}

// ── Check summary for artefacts ────────────────────────────────────────────────
function summaryOk(summary) {
  if (!summary || summary.trim().length < 20) return { ok: false, reason: 'too_short' };
  // Common artefacts
  if (/BUY\s*\.\s*BUY\s*Conviction/i.test(summary)) return { ok: false, reason: 'buy_artefact' };
  if (/---/.test(summary)) return { ok: false, reason: 'dashes' };
  if ((summary.match(/\n\n\n/g) || []).length > 1) return { ok: false, reason: 'triple_newlines' };
  return { ok: true };
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function checkTicker(ticker) {
  const idx = loadJson(INDEX_PATH) || [];
  const entry = idx.find(e => e.ticker === ticker);
  const slug = resolveSlug(ticker, entry);

  // 1. Price
  let price = entry?.price || null;
  let priceSource = entry ? 'index' : 'unknown';
  const sheetPrice = await fetchSheetPrice(ticker);
  if (sheetPrice.price) {
    if (price && Math.abs(parseFloat(sheetPrice.price) - parseFloat(price)) > 5) {
      priceSource = `index(${price}) vs sheet(${sheetPrice.price})`;
    } else if (price) {
      priceSource = 'sheet_confirmed';
    } else {
      price = sheetPrice.price;
      priceSource = 'sheet';
    }
  }

  // 2. Grok
  const researchDir = path.join(RESEARCH_DIR, slug.replace(/\.html$/, ''));
  const grokFile = path.join(researchDir, `grok-${TODAY}.json`);
  const grok = loadJson(grokFile);
  const grokOk = !!grok;

  // 3. Web research
  const webFile = path.join(researchDir, `web-${TODAY}.json`);
  const web = loadJson(webFile);
  const webOk = !!(web && (web.results || []).length > 0);

  // 3b. FMP data (US tickers only)
  const isUS = isUSTicker(ticker);
  const fmpFile = path.join(researchDir, `fmp-${TODAY}.json`);
  const fmpOk = !isUS || fs.existsSync(fmpFile);
  const fmpData = isUS ? loadJson(fmpFile) : null;

  // 4. Conviction & recommendation
  const conviction = entry?.conviction ?? null;
  const rec = entry?.recommendation ?? null;
  const expectedRec = conviction !== null ? recFromConviction(conviction) : null;
  const recCorrect = rec === expectedRec;

  // 4b. Scenario framework
  const data = loadJson(path.join(DATA_DIR, `${ticker}.json`));
  const scenarios = parseScenarios(data);

  // 5. HTML sections
  const htmlFile = path.join(REPORTS_DIR, slug + '.html');
  const htmlExists = fs.existsSync(htmlFile);
  let missingSections = [];
  if (htmlExists) {
    const html = fs.readFileSync(htmlFile, 'utf8');
    missingSections = checkSections(html);
  }

  // 6. Summary
  const summary = entry?.summary || data?.sections?.executiveSummary?.text || '';
  const summaryCheck = summaryOk(summary);

  // Result
  const issues = [];
  if (!price) issues.push('no_price');
  if (!grokOk) issues.push('no_grok');
  if (!webOk) issues.push('no_web');
  if (isUS && !fmpOk) issues.push('no_fmp');
  if (!recCorrect) issues.push(`rec_${rec}_!=_${expectedRec}`);
  if (missingSections.length > 0) issues.push(`sections:${missingSections.join('+')}`);
  if (!summaryCheck.ok) issues.push(`summary:${summaryCheck.reason}`);

  return {
    ticker,
    price,
    priceSource,
    grokOk,
    grokScore: grok?.score ?? null,
    webOk,
    webResults: web ? (web.results || []).length : 0,
    fmpOk,
    fmpPrice: fmpData?.price ?? null,
    fmpMktCap: fmpData?.marketCap ?? null,
    fmpPE: fmpData?.pe ?? null,
    fmpEPS: fmpData?.eps ?? null,
    conviction,
    rec,
    expectedRec,
    recCorrect,
    scenarios,
    htmlExists,
    missingSections,
    summaryOk: summaryCheck.ok,
    summaryPreview: summary.substring(0, 100),
    issues,
    pass: issues.length === 0,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const idx = loadJson(INDEX_PATH) || [];
  let tickers = args;

  if (tickers.length === 0) {
    tickers = idx.filter(e => e.date === TODAY || e.date?.startsWith?.(TODAY)).map(e => e.ticker);
    if (tickers.length === 0) {
      console.log(`No tickers specified and no entries dated ${TODAY} in index.`);
      console.log('Usage: node scripts/pre-commit-check.js [TICKER ...]');
      return;
    }
  }

  console.log(`Checking ${tickers.length} ticker(s)...\n`);
  const results = [];
  for (const t of tickers) {
    const r = await checkTicker(t);
    results.push(r);
    const icon = r.pass ? 'PASS' : 'FAIL';
    const issues = r.issues.length > 0 ? ` [${r.issues.join(', ')}]` : '';
    console.log(`[${icon}] ${r.ticker}${issues}`);
    if (!r.pass && r.scenarios) {
      const s = r.scenarios;
      console.log(`       Bull: ${s.bull.p}% x ${s.bull.s} | Base: ${s.base.p}% x ${s.base.s} | Bear: ${s.bear.p}% x ${s.bear.s} | Calc: ${s.calc} vs Rec: ${r.conviction}`);
    }
    if (!r.pass && r.missingSections.length > 0) {
      console.log(`       Missing sections: ${r.missingSections.join(', ')}`);
    }
    if (!r.summaryOk) {
      console.log(`       Summary: ${r.summaryPreview.substring(0, 80)}`);
    }
  }

  const passed = results.filter(r => r.pass).length;
  console.log(`\n${passed}/${results.length} passed`);

  if (results.some(r => !r.pass)) {
    console.log('\nFailed tickers need fixes before committing.');
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
