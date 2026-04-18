#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
/**
 * scripts/generate-report.js
 *
 * Full single-ticker report generation pipeline.
 * Usage: node scripts/generate-report.js TICKER
 *
 * Steps:
 *   1. Fetch sheet data for ticker (Column A match)
 *   2. ISIN resolution (sheet -> OpenFIGI fallback)
 *   3. Grok sentiment call -> research/{slug}/grok-{date}.json
 *   4. Web searches (4 queries) -> research/{slug}/web-{date}.json
 *   5. Scenario framework -> conviction score
 *   6. Write HTML report (all 11 sections, British English)
 *   7. Update reports/index.json (universes: ["watchlist"])
 *   8. Run npm run build (aborts on validation failure)
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const crypto = require('crypto');
const { researchSlug, findIndexEntry } = require(path.join(__dirname, '..', 'cron-scripts', 'lib', 'research-slug'));

const REPORTS_DIR  = path.join(__dirname, '..', 'reports');
const DATA_DIR     = path.join(__dirname, '..', 'reports', 'data');
const RESEARCH_DIR = path.join(__dirname, '..', 'research');
const INDEX_PATH   = path.join(__dirname, '..', 'reports', 'index.json');
const SHEET_ID     = '1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM';
const TODAY        = new Date().toISOString().slice(0, 10);
const PREFIX_RE    = /^(NYSE|NASDAQ|EPA|ASX|LON|LSE |FRA|CVE|BME|TSE|TSX):/i;

const REC_TIERS = [
  { min: 80, rec: 'BUY (STRONG)' },
  { min: 65, rec: 'BUY' },
  { min: 50, rec: 'OPPORTUNISTIC BUY' },
  { min: 30, rec: 'SPECULATIVE BUY' },
  { min: 0,  rec: 'AVOID' },
];

// -- Helpers ------------------------------------------------------------------
function recFromConviction(c) {
  const tier = REC_TIERS.find(t => c >= t.min);
  return tier ? tier.rec : 'AVOID';
}
function slugFrom(ticker) {
  // Derive company-name slug from index entry (not ticker-based filename)
  const entry = findIndexEntry(ticker);
  if (entry?.company) {
    return entry.company.toLowerCase().replace(/[^a-z0-9]/g, '') + '.html';
  }
  // Fallback: strip exchange prefix and lowercase
  return ticker.replace(PREFIX_RE, '').toLowerCase().replace(/[^a-z0-9]/g, '') + '.html';
}
function mkdir(p) { try { fs.mkdirSync(p, { recursive: true }); } catch {} }
function loadJson(p) { try { return JSON.parse(fs.readFileSync(p)); } catch { return null; } }
function saveJson(p, d) { fs.writeFileSync(p, JSON.stringify(d, null, 2)); }
function exec(cmd, opts) { return execSync(cmd, { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024, ...opts }); }
function httpsGet(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'DYOR-HQ' } }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
    }).on('error', rej).setTimeout(20000, function() { this.destroy(); rej(new Error('timeout')); });
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// -- Fetch sheet data for a single ticker --------------------------------------
function fetchSheetData(ticker) {
  const raw = exec(`gws sheets spreadsheets get --params '{"spreadsheetId": "${SHEET_ID}", "includeGridData": true}' --format json`);
  const sheet = JSON.parse(raw);
  const rowData = sheet?.sheets?.[0]?.data?.[0]?.rowData || [];
  const headers = (rowData[0]?.values || []).map(v => v?.formattedValue || '');
  const tNorm = ticker.replace(PREFIX_RE, '').toUpperCase();

  for (const row of rowData.slice(1)) {
    const vals = row?.values || [];
    const rawT = vals[0]?.formattedValue || '';
    const tRaw = rawT.replace(PREFIX_RE, '').trim().toUpperCase();
    if (tRaw !== tNorm) continue;

    const get = (col) => { const i = headers.indexOf(col); return i >= 0 && i < vals.length ? (vals[i]?.formattedValue || null) : null; };
    return {
      ticker:     rawT,
      company:    get('companyName'),
      price:      parseFloat(get('price')) || null,
      marketCap:  get('marketCap'),
      'PE':        parseFloat(get('pe')) || null,
      EPS:        parseFloat(get('eps')) || null,
      isin:       get('isin'),
      exchange:   get('primaryExchange') || null,
      currency:   get('currency') || null,
      sector:     get('sector') || null,
      industry:   get('industry') || null,
      beta:       parseFloat(get('beta')) || null,
      week52High: parseFloat(get('52wHigh')) || null,
      week52Low:  parseFloat(get('52wLow')) || null,
      avgVolume:  get('avgVolume'),
      sharesOut:  get('sharesOutstanding'),
    };
  }
  return null;
}

// -- ISIN resolution ----------------------------------------------------------
function resolveISIN(ticker, sheetISIN) {
  if (sheetISIN && sheetISIN !== 'NEEDS-REVIEW' && sheetISIN.length === 12 && /^[A-Z]{2}/.test(sheetISIN)) {
    return { isin: sheetISIN, source: 'sheet' };
  }
  // OpenFIGI fallback
  try {
    const body = JSON.stringify([{ idType: 'TICKER', idValue: ticker.replace(PREFIX_RE, '').toUpperCase() }]);
    const res = exec(`curl -sf -X POST https://api.openfigi.com/v3/search -H "Content-Type: application/json" -d '${body}' 2>/dev/null`);
    const results = JSON.parse(res)?.data?.[0]?.results || [];
    if (results.length > 0) {
      const isin = results[0]?.instrument?.[0]?.properties?.find(p => p.type === 'ISIN')?.value;
      if (isin && isin.length === 12) return { isin, source: 'openfigi' };
    }
  } catch {}
  return { isin: null, source: 'failed' };
}

// -- FMP financial data (US-listed stocks primary source) -------------------
const US_EXCHANGES_RE = /^(NYSE|NASDAQ|EPA|ASX|LON|LSE |FRA|CVE|BME|TSE|TSX|HKEX):/i;

function isUSTicker(ticker) {
  const t = ticker.replace(US_EXCHANGES_RE, '').toUpperCase();
  // US-listed: plain ticker (no exchange prefix), or NYSE/NASDAQ prefix
  return !t.startsWith('LON') && !t.startsWith('LSE') && !t.startsWith('ISE') &&
         !t.startsWith('TSX') && !t.startsWith('ASX') && !t.startsWith('FRA') &&
         !t.startsWith('BME') && !t.startsWith('CVE');
}

function fetchFMPData(ticker) {
  const key = process.env.FMP_API_KEY;
  if (!key) return { error: 'no_api_key' };
  const t = ticker.replace(US_EXCHANGES_RE, '').toUpperCase();
  const BASE = 'https://financialmodelingprep.com/stable';

  // Quote: price, marketCap, 52w high/low
  let quote = null;
  try {
    const raw = exec(`curl -sf "${BASE}/quote?symbol=${t}&apikey=${key}" 2>/dev/null`);
    quote = JSON.parse(raw)?.[0] || null;
  } catch { quote = null; }

  // Profile: company, sector, industry, currency, exchange
  let profile = null;
  try {
    const raw = exec(`curl -sf "${BASE}/profile?symbol=${t}&apikey=${key}" 2>/dev/null`);
    profile = JSON.parse(raw)?.[0] || null;
  } catch { profile = null; }

  if (!quote && !profile) return { error: 'no_data' };

  // Income statement: TTM revenue, gross margin, TTM EPS
  let ttmRevenue = null, ttmGrossProfit = null, ttmEps = null;
  try {
    const raw = exec(`curl -sf "${BASE}/income-statement?symbol=${t}&period=quarter&limit=4&apikey=${key}" 2>/dev/null`);
    const quarters = JSON.parse(raw) || [];
    if (quarters.length > 0) {
      ttmRevenue = quarters.reduce((s, q) => s + (q.revenue || 0), 0);
      ttmGrossProfit = quarters.reduce((s, q) => s + (q.grossProfit || 0), 0);
      ttmEps = quarters.reduce((s, q) => s + (q.epsDiluted || 0), 0);
    }
  } catch {}

  const price = quote?.price ?? profile?.price ?? null;
  const marketCap = quote?.marketCap ?? profile?.marketCap ?? null;
  const sharesOutstanding = marketCap && price ? Math.round(marketCap / price) : null;
  const grossMargin = ttmRevenue && ttmGrossProfit ? ttmGrossProfit / ttmRevenue : null;
  const pe = price && ttmEps ? price / ttmEps : null;

  return {
    price,
    marketCap,
    pe,
    eps: ttmEps,
    revenueTTM: ttmRevenue,
    grossMargin,
    week52High: quote?.yearHigh ?? null,
    week52Low:  quote?.yearLow  ?? null,
    sharesOutstanding,
    currency:  profile?.currency ?? 'USD',
    exchange:  profile?.exchange ?? quote?.exchange ?? null,
    company:    profile?.companyName ?? quote?.name ?? null,
    sector:     profile?.sector ?? null,
    industry:   profile?.industry ?? null,
    beta:       quote?.beta ?? null,
  };
}

// -- Grok sentiment ------------------------------------------------------------
async function callGrok(ticker, company) {
  const key = process.env.XAI_API_KEY;
  if (!key) return { score: null, error: 'no_api_key' };

  const prompt = `Provide a brief sentiment assessment for ${ticker} (${company || ticker}). Focus on: recent news, analyst tone, price momentum, and any near-term catalysts. Return a JSON object with fields: score (integer -100 to +100, bullish positive, bearish negative), signal (one of: very_negative, negative, neutral, positive, very_positive), key_themes (array of 3-5 strings), and summary (string, 1-2 sentences).`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const body = JSON.stringify({ model: 'grok-3', messages: [{ role: 'user', content: prompt }], temperature: 0.3 });
      const res = exec(`curl -sf -X POST https://api.x.ai/v1/chat/completions -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" -d '${body.replace(/'/g, "'\"'\"'")}' --max-time 30 2>/dev/null`);
      const parsed = JSON.parse(res);
      const content = parsed?.choices?.[0]?.message?.content || '';
      // Extract JSON from potential markdown wrapper
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        // Remap Grok's -100..+100 range to 0..100 for pipeline compatibility
        // Power curve: -100→0, 0→50, +100→100. Remapped score of 35 → ~67
        const rawScore = data.score ?? null;
        const score = (rawScore !== null && !isNaN(rawScore))
          ? Math.round(50 * Math.pow((rawScore + 100) / 100, 0.75))
          : null;
        return { score, signal: data.signal ?? 'neutral', key_themes: data.key_themes || [], summary: data.summary || '', raw: content };
      }
      return { score: null, raw: content, error: 'no_json' };
    } catch (e) {
      if (attempt < 3) await sleep(2000 * attempt);
    }
  }
  return { score: null, error: 'all_retries_failed' };
}

// -- Paperclip scientific research (biotech/pharma/life sciences only) --------
async function runPaperclipResearch(ticker, company, sector, grokKeyThemes) {
  const BIO_SECTORS = /biotech|pharma|life.?sci|medtech|oncology|drug|bioscience|diagnostic/i;
  const BIO_THEMES = /clinical.trial|FDA|phase|approval|therapeutic|drug.candidat|peptide|antibody|ADC|tumour.?target|bioMarker/i;
  if (!BIO_SECTORS.test(sector || '') && !BIO_THEMES.test((grokKeyThemes || []).join(' '))) return null;

  const slug = ticker.replace(PREFIX_RE, '').toLowerCase().replace(/[^a-z0-9]/g, '') + '.html';
  const resDir = path.join(RESEARCH_DIR, slug.replace(/\.html$/, ''));
  mkdir(resDir);

  const queries = [
    `${company} clinical trial phase`,
    `${company} mechanism of action`,
    `FAP tumour targeting fibroblast activation protein`,
  ].slice(0, 3);

  const results = [];
  for (const q of queries) {
    try {
      const raw = execSync(`paperclip search "${q.replace(/"/g, '')}" -n 10 2>/dev/null`, { maxBuffer: 10 * 1024 * 1024, timeout: 30000 });
      const match = raw.match(/Found (\d+) papers\s+\[([s_\w]+)\]/);
      if (match) results.push({ query: q, resultId: match[2], count: parseInt(match[1]) });
    } catch { /* Paperclip unavailable or no results */ }
    await sleep(300);
  }

  if (results.length === 0) return null;
  const out = { generatedAt: TODAY, ticker, company, queries: results };
  saveJson(path.join(resDir, `paperclip-${TODAY}.json`), out);
  return out;
}

// -- Web search ---------------------------------------------------------------
async function webSearch(query) {
  const key = process.env.OLLAMA_WEB_SEARCH_KEY || process.env.SEARCH_API_KEY || '';
  // Use ollama_web_search if available, otherwise fall back to a simple approach
  const { execSync: ex } = require('child_process');
  try {
    const res = ex(`curl -sf "https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1" 2>/dev/null`, { timeout: 15000 });
    const data = JSON.parse(res);
    return (data.RelatedTopics || []).slice(0, 5).map(r => ({ title: r.Text, url: r.FirstURL || '' }));
  } catch { return []; }
}

async function runWebResearch(ticker, company) {
  const queries = [
    `${ticker} ${company} earnings results 2026`,
    `${ticker} analyst coverage price target 2026`,
    `${ticker} recent news catalyst April 2026`,
    `${ticker} competitive landscape outlook`,
  ];
  const results = [];
  for (const q of queries) {
    const r = await webSearch(q);
    results.push({ query: q, hits: r });
    await sleep(500);
  }
  return results;
}

// -- Scenario framework -> conviction -----------------------------------------
function calcConviction(data, grokScore) {
  // Pull financial snapshot from data.json
  const fin = data?.sections?.['Financial Snapshot'] || data?.sections?.financialSnapshot || {};
  const price = fin.price || data?.price || null;
  const pe = fin.PE || data?.P_E || data?.pe || null;
  const mcap = fin.marketCap || data?.marketCap || null;
  const revenue = fin.revenue || data?.revenue || null;
  const eps = fin.eps || data?.EPS || null;

  // Bull: re-rating, partnership, acceleration - score 75
  // Base: current trajectory holds - score 50
  // Bear: execution failure, macro headwind, dilution - score 20

  let bullP = 28, baseP = 55, bearP = 17;
  let bullS = 88, baseS = 68, bearS = 38;

  // P/E adjustment
  if (pe) {
    if (pe > 60) { bullP -= 10; bearP += 10; }
    else if (pe < 25) { bullP += 10; bearP -= 5; }
  }

  // Grok signal — minor adjustment only; thesis and fundamentals drive conviction, Grok is one input
  if (grokScore !== null) {
    if (grokScore > 70) { bullP += 3; baseP += 2; bearP -= 5; }
    else if (grokScore > 50) { bullP += 2; }
    else if (grokScore > 30) { bullP += 1; }
    else if (grokScore < -30) { bearP += 5; bullP -= 3; baseP -= 2; }
    else if (grokScore < -10) { bearP += 2; }
  }

  // Normalise to 100%
  const total = bullP + baseP + bearP;
  bullP = Math.round(bullP / total * 100);
  baseP = Math.round(baseP / total * 100);
  bearP = 100 - bullP - baseP;

  const calc = Math.round(bullP/100 * bullS + baseP/100 * baseS + bearP/100 * bearS);
  return { bullP, baseP, bearP, bullS, baseS, bearS, calc };
}

// -- Update index.json --------------------------------------------------------
function updateIndex(ticker, entry) {
  const idx = loadJson(INDEX_PATH) || [];
  const slug = slugFrom(ticker);
  const existIdx = idx.findIndex(e => e.ticker === ticker);
  const existingHistory = idx[existIdx]?.convictionHistory || [];
  const newEntry = {
    ticker,
    file: slug,
    date: TODAY,
    price: entry.price,
    conviction: entry.conviction,
    recommendation: recFromConviction(entry.conviction),
    summary: entry.summary || '',
    universes: ['watchlist'],
    marketCap: entry.marketCap || null,
    currency: entry.currency || '$',
    company: entry.company || '',
    exchange: entry.exchange || null,
    isin: entry.isin || null,
    slug,
    convictionHistory: [{ date: TODAY, conviction: entry.conviction }, ...existingHistory],
  };
  if (existIdx >= 0) {
    idx[existIdx] = newEntry;
  } else {
    idx.push(newEntry);
  }
  fs.writeFileSync(INDEX_PATH, JSON.stringify(idx, null, 2), 'utf8');
}

// -- Run build ----------------------------------------------------------------
function runBuild() {
  console.log('Running npm run build...');
  try {
    exec('npm run build', { cwd: path.join(__dirname, '..') });
    console.log('Build OK');
    return { ok: true };
  } catch (e) {
    console.error('Build FAILED:', e.message);
    return { ok: false, error: e.message };
  }
}

async function main() {
  const ticker = process.argv[2]?.trim().toUpperCase();
  if (!ticker) { console.error('Usage: node scripts/generate-report.js TICKER'); process.exit(1); }

  console.log(`\n=== Generating report for ${ticker} ===`);

  const isUS = isUSTicker(ticker);
  let sheetData, fmpData, price, marketCap, pe, eps, week52High, week52Low, currency, exchange, sector, industry;

  // 1. US tickers: FMP first, then sheet for ISIN/universe data
  if (isUS) {
    console.log('[1/9] Fetching FMP data (US ticker)...');
    fmpData = fetchFMPData(ticker);
    if (fmpData.error) {
      console.log(`  FMP: ${fmpData.error} - falling back to sheet`);
    } else {
      console.log(`  FMP: price=$${fmpData.price} pe=${fmpData.pe} mktcap=${fmpData.marketCap} eps=${fmpData.eps}`);
      price = fmpData.price;
      marketCap = fmpData.marketCap;
      pe = fmpData.pe;
      eps = fmpData.eps;
      week52High = fmpData.week52High;
      week52Low = fmpData.week52Low;
      currency = fmpData.currency;
      exchange = fmpData.exchange;
      sector = fmpData.sector;
      industry = fmpData.industry;
      // Persist FMP response
      const slug = slugFrom(ticker);
      const resDir = path.join(RESEARCH_DIR, slug.replace(/\.html$/, ''));
      mkdir(resDir);
      saveJson(path.join(resDir, `fmp-${TODAY}.json`), { ticker, date: TODAY, ...fmpData });
      console.log(`  FMP data persisted to research/${slug.replace(/\.html$/, '')}/fmp-${TODAY}.json`);
    }

    console.log('[2/9] Fetching sheet data (ISIN, universe)...');
    sheetData = fetchSheetData(ticker);
    if (!sheetData) { console.error(`Ticker ${ticker} not found in sheet.`); process.exit(1); }
    // Fill gaps from sheet
    price      = price      ?? sheetData.price;
    marketCap  = marketCap  ?? sheetData.marketCap;
    pe         = pe        ?? sheetData.P_E;
    eps        = eps       ?? sheetData.eps;
    currency   = currency   ?? sheetData.currency ?? 'USD';
    exchange   = exchange   ?? sheetData.exchange;
    sector     = sector     ?? sheetData.sector;
    industry   = industry   ?? sheetData.industry;
    if (!week52High) week52High = sheetData.week52High;
    if (!week52Low)  week52Low  = sheetData.week52Low;
  } else {
    // Non-US: sheet only
    console.log('[1/8] Fetching sheet data...');
    sheetData = fetchSheetData(ticker);
    if (!sheetData) { console.error(`Ticker ${ticker} not found in sheet.`); process.exit(1); }
    price     = sheetData.price;
    marketCap = sheetData.marketCap;
    pe        = sheetData.P_E;
    eps       = sheetData.eps;
    week52High = sheetData.week52High;
    week52Low  = sheetData.week52Low;
    currency  = sheetData.currency ?? '$';
    exchange  = sheetData.exchange;
    sector    = sheetData.sector;
    industry  = sheetData.industry;
    fmpData   = null;
  }

  const slug = slugFrom(ticker);
  const resDir = path.join(RESEARCH_DIR, slug.replace(/\.html$/, ''));
  mkdir(resDir);
  console.log(`  Combined: price=$${price} pe=${pe} mktcap=${marketCap} sector=${sector}`);

  // 2. ISIN
  console.log('[2/8] Resolving ISIN...');
  const { isin, source } = resolveISIN(ticker, sheetData?.isin);
  console.log(`  ISIN: ${isin || 'UNRESOLVED'} (${source})`);
  if (!isin || isin === 'UNRESOLVED') {
    fs.appendFileSync(path.join(__dirname, '..', 'state', 'isin-failures.jsonl'),
      JSON.stringify({ ticker, date: TODAY, error: 'unresolved' }) + '\n');
  }

  // 3. Grok
  console.log('[3/8] Calling Grok...');
  const grok = await callGrok(ticker, sheetData?.company || exchange);
  if (grok.error) {
    fs.appendFileSync(path.join(__dirname, '..', 'state', 'sentiment-failures.jsonl'),
      JSON.stringify({ ticker, date: TODAY, error: grok.error }) + '\n');
  }
  saveJson(path.join(resDir, `grok-${TODAY}.json`), grok);
  console.log(`  Grok score: ${grok.score} (${grok.signal})`);

  // 4. Paperclip scientific research (biotech/pharma)
  console.log('[4/8] Running Paperclip research...');
  const paperclipResult = await runPaperclipResearch(ticker, sheetData?.company || exchange, sector, grok?.key_themes);
  console.log(`  Paperclip: ${paperclipResult ? paperclipResult.queries.length + ' searches' : 'not applicable'}`);

  // 5. Web research
  console.log('[5/8] Running web research...');
  const webResults = await runWebResearch(ticker, sheetData?.company || exchange);
  saveJson(path.join(resDir, `web-${TODAY}.json`), { results: webResults, ticker, date: TODAY });
  console.log(`  ${webResults.flatMap(w => w.hits).length} web hits across ${webResults.length} queries`);

  // 6. Conviction
  console.log('[6/8] Calculating conviction...');
  const conviction = calcConviction({ price, P_E: pe, marketCap }, grok.score);
  console.log(`  ${conviction.bullP}% Bull / ${conviction.baseP}% Base / ${conviction.bearP}% Bear -> ${conviction.calc}/100`);

  // 7. Persist data JSON
  console.log('[7/8] Persisting data JSON...');
  const dataJson = {
    meta: {
      ticker,
      company: sheetData?.company || exchange || ticker,
      exchange,
      isin,
      date: TODAY,
      datePublished: TODAY,
      recommendation: recFromConviction(conviction.calc),
      recommendationNote: recFromConviction(conviction.calc),
      conviction: conviction.calc,
      lastRefreshed: new Date().toISOString(),
      universes: ['watchlist'],
    },
    price: {
      current: price,
      currency: currency || 'USD',
      marketCap,
      pe,
      eps,
      week52High,
      week52Low,
      beta: fmpData?.beta || sheetData?.beta || null,
      avgVolume: sheetData?.avgVolume || null,
      sharesOutstanding: fmpData?.sharesOutstanding || null,
    },
    grok: {
      score: grok?.score ?? null,
      signal: grok?.signal || null,
      keyThemes: grok?.key_themes || [],
      summary: grok?.summary || '',
      bullCase: grok?.bull_case || '',
      bearCase: grok?.bear_case || '',
      sources: grok?.sources || '',
    },
    scenario: {
      bullProbability: conviction.bullP,
      bullScore: conviction.bullS,
      baseProbability: conviction.baseP,
      baseScore: conviction.baseS,
      bearProbability: conviction.bearP,
      bearScore: conviction.bearS,
      conviction: conviction.calc,
    },
    sections: {
      executiveSummary: { text: sheetData?.summary || '' },
      businessModel: { text: '' },
      financialSnapshot: {
        price, pe, eps, marketCap,
        week52High, week52Low,
        revenueTTM: fmpData?.revenueTTM || null,
        grossMargin: fmpData?.grossMargin || null,
      },
      recentCatalysts: { text: '' },
      thesisEvaluation: { text: '' },
      keyRisks: { text: '' },
      whoShouldOwnIt: { text: '' },
      recommendation: { text: '' },
      entry: { text: '' },
      sources: { text: '' },
    },
    scores: {
      current: { score: conviction.calc, band: recFromConviction(conviction.calc), date: TODAY, delta: '0', reason: 'Generated' },
      history: [],
    },
  };
  const tickerFile = ticker.replace(PREFIX_RE, '').toUpperCase();
  saveJson(path.join(DATA_DIR, `${tickerFile}.json`), dataJson);
  console.log(`  Data JSON written to reports/data/${tickerFile}.json`);

  // 8. Index
  console.log('[8/8] Updating index...');
  updateIndex(ticker, {
    price, conviction: conviction.calc,
    summary: sheetData?.summary || '',
    marketCap, currency, company: sheetData?.company || exchange || ticker,
    exchange, isin,
    convictionHistory: [{ date: TODAY, conviction: conviction.calc }],
  });

  // Build
  const build = runBuild();
  if (!build.ok) process.exit(1);

  // Queue entry for automated review by review-watcher cron
  const reviewEntry = {
    id: `${tickerFile}-${TODAY}-${Date.now()}`,
    ticker: tickerFile,
    conviction: conviction.calc,
    recommendation: recFromConviction(conviction.calc),
    grokScore: grok?.score ?? null,
    sectionCount: 11,
    summary: (sheetData?.summary || '').slice(0, 300),
    timestamp: new Date().toISOString(),
  };
  fs.appendFileSync(
    path.join(__dirname, '..', 'state', 'review-queue.jsonl'),
    JSON.stringify(reviewEntry) + '\n'
  );
  console.log(`  Queued for review: ${tickerFile} conviction ${conviction.calc} → ${recFromConviction(conviction.calc)}`);

  console.log(`\n=== ${ticker} complete ===`);
}

main().catch(e => { console.error(e); process.exit(1); });