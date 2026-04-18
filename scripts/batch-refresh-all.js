#!/usr/bin/env node
/**
 * scripts/batch-refresh-all.js
 *
 * Batch refresh every report in the index:
 * - Fetch all sheet data in one call
 * - For each ticker: FMP enrichment + Grok sentiment + conviction recalc
 * - Write data JSON + update index entry
 * - npm run build once at the end
 * - Progress updates as each ticker completes
 *
 * Usage: node scripts/batch-refresh-all.js
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
function mkdir(p) { try { fs.mkdirSync(p, { recursive: true }); } catch {} }
function loadJson(p) { try { return JSON.parse(fs.readFileSync(p)); } catch { return null; } }
function saveJson(p, d) { fs.writeFileSync(p, JSON.stringify(d, null, 2)); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function exec(cmd, opts) { return execSync(cmd, { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024, ...opts }); }

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function httpsGet(url, headers) {
  return new Promise((res, rej) => {
    const r = https.get(url, { headers: { 'User-Agent': 'DYOR-HQ', ...headers } }, response => {
      let d = ''; response.on('data', c => d += c); response.on('end', () => res(d));
    });
    r.on('error', rej).setTimeout(30000, function() { this.destroy(); rej(new Error('timeout')); });
  });
}

// ── Sheet data (all tickers in one call) ────────────────────────────────────
function fetchAllSheetData() {
  const raw = exec(`gws sheets spreadsheets get --params '{"spreadsheetId": "${SHEET_ID}", "includeGridData": true}' --format json`);
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
      ticker: rawT,
      company: get('companyName'),
      price: parseFloat(get('price')) || null,
      marketCap: get('marketCap'),
      'PE': parseFloat(get('pe')) || null,
      eps: parseFloat(get('eps')) || null,
      isin: get('isin'),
      exchange: get('primaryExchange') || null,
      currency: get('currency') || null,
      sector: get('sector') || null,
      industry: get('industry') || null,
      beta: parseFloat(get('beta')) || null,
      week52High: parseFloat(get('52wHigh')) || null,
      week52Low: parseFloat(get('52wLow')) || null,
      avgVolume: get('avgVolume'),
      sharesOut: get('sharesOutstanding'),
    };
  }
  return result;
}

// ── ISIN resolution ────────────────────────────────────────────────────────────
function resolveISIN(ticker, sheetISIN) {
  if (sheetISIN && sheetISIN !== 'NEEDS-REVIEW' && sheetISIN.length === 12 && /^[A-Z]{2}/.test(sheetISIN)) {
    return { isin: sheetISIN, source: 'sheet' };
  }
  try {
    const body = JSON.stringify([{ idType: 'TICKER', idValue: ticker.replace(PREFIX_RE, '').toUpperCase() }]);
    const res = exec(`curl -sf --max-time 15 -X POST https://api.openfigi.com/v3/search -H "Content-Type: application/json" -d '${body}' 2>/dev/null`);
    const results = JSON.parse(res)?.data?.[0]?.results || [];
    if (results.length > 0) {
      const isin = results[0]?.instrument?.[0]?.properties?.find(p => p.type === 'ISIN')?.value;
      if (isin && isin.length === 12) return { isin, source: 'openfigi' };
    }
  } catch {}
  return { isin: null, source: 'failed' };
}

// ── FMP ──────────────────────────────────────────────────────────────────────────
const US_EXCHANGES_RE = /^(NYSE|NASDAQ|EPA|ASX|LON|LSE |FRA|CVE|BME|TSE|TSX|HKEX):/i;
function isUSTicker(ticker) {
  const t = ticker.replace(US_EXCHANGES_RE, '').toUpperCase();
  return !t.startsWith('LON') && !t.startsWith('LSE') && !t.startsWith('ISE') &&
         !t.startsWith('TSX') && !t.startsWith('ASX') && !t.startsWith('FRA') &&
         !t.startsWith('BME') && !t.startsWith('CVE');
}

function fetchFMPData(ticker) {
  const key = process.env.FMP_API_KEY;
  if (!key) return { error: 'no_api_key' };
  const t = ticker.replace(US_EXCHANGES_RE, '').toUpperCase();
  const BASE = 'https://financialmodelingprep.com/stable';
  let quote = null, profile = null;
  try { quote = JSON.parse(exec(`curl -sf --max-time 15 "${BASE}/quote?symbol=${t}&apikey=${key}" 2>/dev/null`))?.[0] || null; } catch {}
  try { profile = JSON.parse(exec(`curl -sf --max-time 15 "${BASE}/profile?symbol=${t}&apikey=${key}" 2>/dev/null`))?.[0] || null; } catch {}
  if (!quote && !profile) return { error: 'no_data' };
  let ttmRevenue = null, ttmGrossProfit = null, ttmEps = null;
  try {
    const raw = exec(`curl -sf --max-time 15 "${BASE}/income-statement?symbol=${t}&period=quarter&limit=4&apikey=${key}" 2>/dev/null`);
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
    price, marketCap, pe, eps: ttmEps, revenueTTM: ttmRevenue, grossMargin,
    week52High: quote?.yearHigh ?? null, week52Low: quote?.yearLow ?? null,
    sharesOutstanding, currency: profile?.currency ?? 'USD',
    exchange: profile?.exchange ?? quote?.exchange ?? null,
    company: profile?.companyName ?? quote?.name ?? null,
    sector: profile?.sector ?? null, industry: profile?.industry ?? null,
    beta: quote?.beta ?? null,
  };
}

// ── Grok (with retries) ───────────────────────────────────────────────────────
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
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
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

// ── Conviction ───────────────────────────────────────────────────────────────
function calcConviction(data, grokScore) {
  const price = data?.price || null;
  const pe = data?.PE || data?.pe || null;
  let bullP = 25, baseP = 55, bearP = 20;
  let bullS = 75, baseS = 50, bearS = 20;
  if (pe) {
    if (pe > 60) { bullP -= 10; bearP += 10; }
    else if (pe < 25) { bullP += 10; bearP -= 5; }
  }
  if (grokScore !== null) {
    if (grokScore > 70) { bullP += 3; baseP += 2; bearP -= 5; }
    else if (grokScore > 50) { bullP += 2; }
    else if (grokScore > 30) { bullP += 1; }
    else if (grokScore < -30) { bearP += 5; bullP -= 3; baseP -= 2; }
    else if (grokScore < -10) { bearP += 2; }
  }
  const total = bullP + baseP + bearP;
  bullP = Math.round(bullP / total * 100);
  baseP = Math.round(baseP / total * 100);
  bearP = 100 - bullP - baseP;
  const calc = Math.round(bullP/100 * bullS + baseP/100 * baseS + bearP/100 * bearS);
  return { bullP, baseP, bearP, bullS, baseS, bearS, calc };
}

// ── Queue Telegram alert ──────────────────────────────────────────────────────
function queueAlert(msg) {
  const alertPath = '/Users/hughmcgauran/.openclaw/workspace/state/pending-telegram-alerts.jsonl';
  const entry = { text: msg, chat_id: '321761010', timestamp: new Date().toISOString() };
  fs.appendFileSync(alertPath, JSON.stringify(entry) + '\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Batch Refresh: All Reports ===');
  console.log(`Started: ${new Date().toISOString()}`);

  // Load index
  const idx = loadJson(INDEX_PATH) || [];
  console.log(`Total tickers in index: ${idx.length}`);

  // Checkpoint — resume from last position if restarting mid-run
  const ckptPath = '/Users/hughmcgauran/.openclaw/workspace/state/batch-refresh-checkpoint.json';
  let startFrom = 0;
  if (fs.existsSync(ckptPath)) {
    const ckpt = loadJson(ckptPath);
    if (ckpt && ckpt.completed < idx.length) {
      startFrom = ckpt.completed;
      console.log(`[CHECKPOINT] Resuming from ticker ${startFrom + 1}/${idx.length} (${ckpt.ticker} was last completed)`);
    }
  }

  // Fetch all sheet data once
  console.log('\n[FETCH] Loading all sheet data...');
  const sheetDataMap = fetchAllSheetData();
  console.log(`Sheet data loaded: ${Object.keys(sheetDataMap).length} entries`);

  // Queue start message
  try {
    queueAlert(`Batch refresh started: ${idx.length} reports. Grok rate-limited ~${Math.ceil(idx.length/60)} min. I'll report every 25 tickers.`);
    console.log('[ALERT] Start message queued');
  } catch(e) {
    console.error('[ALERT] Failed to queue start message:', e.message);
  }

  console.log('[LOOP] Starting ticker processing loop...');

  // Process all tickers
  let completed = 0;
  let errors = 0;
  const errorLog = [];
  const GROK_CONCURRENCY = 60;
  const GROK_INTERVAL_MS = Math.ceil(60000 / GROK_CONCURRENCY); // 1000ms for 60/min

  for (let i = startFrom; i < idx.length; i++) {
    const entry = idx[i];
    const ticker = entry.ticker;
    const tickerFile = ticker.replace(PREFIX_RE, '').toUpperCase();
    const company = entry.company || tickerFile;
    const sheetEntry = sheetDataMap[tickerFile] || sheetDataMap[ticker.replace(PREFIX_RE,'').toUpperCase()] || {};

    try {
      console.log(`[${startFrom+completed+1}/${idx.length}] ${ticker} — ISIN + FMP...`);
      // Price from sheet first, then FMP supplement
      const sheetPrice = sheetEntry.price;
      const fmpData = isUSTicker(ticker) ? fetchFMPData(ticker) : {};
      const price = sheetPrice ?? fmpData.price ?? entry.price ?? null;
      const currency = sheetEntry.currency || fmpData.currency || entry.currency || 'USD';
      const exchange = sheetEntry.exchange || fmpData.exchange || entry.exchange || null;
      const isinData = resolveISIN(ticker, sheetEntry.isin);
      const pe = sheetEntry['PE'] ?? fmpData.pe ?? entry['PE'] ?? null;
      const eps = sheetEntry.eps ?? fmpData.eps ?? null;
      const week52High = sheetEntry.week52High ?? fmpData.week52High ?? null;
      const week52Low = sheetEntry.week52Low ?? fmpData.week52Low ?? null;
      const marketCap = sheetEntry.marketCap ?? fmpData.marketCap ?? entry.marketCap ?? null;
      const sector = fmpData.sector || sheetEntry.sector || null;
      const beta = fmpData.beta ?? sheetEntry.beta ?? null;

      // Grok
      console.log(`  ${ticker} — Grok call...`);
      const grok = await callGrok(ticker, company);
      console.log(`  ${ticker} — Grok score: ${grok.score ?? 'null'}`);
      await sleep(GROK_INTERVAL_MS); // pace limit

      // Conviction
      const conviction = calcConviction({ price, PE: pe }, grok.score);
      const rec = recFromConviction(conviction.calc);
      console.log(`  ${ticker} — conviction: ${conviction.calc} (${rec})`);

      // Save research dir
      const slug = (entry.file || '').replace(/\.html$/, '');
      const resDir = path.join(RESEARCH_DIR, slug);
      mkdir(resDir);
      if (grok.score !== null || grok.raw) {
        saveJson(path.join(resDir, `grok-${TODAY}.json`), grok);
      }

      // Persist data JSON
      const dataJson = {
        meta: {
          ticker, company, exchange, isin: isinData.isin,
          date: TODAY, datePublished: TODAY,
          recommendation: rec, recommendationNote: rec,
          conviction: conviction.calc,
          lastRefreshed: new Date().toISOString(),
          universes: entry.universes || ['watchlist'],
        },
        price: {
          current: price,
          currency,
          marketCap,
          pe,
          eps,
          week52High,
          week52Low,
          beta,
          avgVolume: sheetEntry.avgVolume || null,
          sharesOutstanding: fmpData.sharesOutstanding || null,
        },
        grok: {
          score: grok.score ?? null,
          signal: grok.signal || null,
          keyThemes: grok.key_themes || [],
          summary: grok.summary || '',
          bullCase: grok.bull_case || '',
          bearCase: grok.bear_case || '',
          sources: grok.sources || '',
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
          executiveSummary: { text: sheetEntry.summary || entry.summary || '' },
          businessModel: { text: '' },
          financialSnapshot: { price, pe, eps, marketCap, week52High, week52Low, revenueTTM: fmpData.revenueTTM || null, grossMargin: fmpData.grossMargin || null },
          recentCatalysts: { text: '' },
          thesisEvaluation: { text: '' },
          keyRisks: { text: '' },
          whoShouldOwnIt: { text: '' },
          recommendation: { text: '' },
          entry: { text: '' },
          sources: { text: '' },
        },
        scores: {
          current: { score: conviction.calc, band: rec, date: TODAY, delta: '0', reason: 'Batch refresh' },
          history: entry.convictionHistory || [],
        },
      };
      saveJson(path.join(DATA_DIR, `${tickerFile}.json`), dataJson);

      // Update index entry
      const existingHistory = entry.convictionHistory || [];
      const newHistory = [{ date: TODAY, conviction: conviction.calc }, ...existingHistory].slice(0, 20);
      entry.date = TODAY;
      entry.price = price;
      entry.currency = currency;
      entry.conviction = conviction.calc;
      entry.recommendation = rec;
      entry.convictionHistory = newHistory;
      entry.marketCap = marketCap;
      entry.isin = isinData.isin || entry.isin || null;
      entry.summary = sheetEntry.summary || entry.summary || '';
      entry.lastRefreshed = TODAY;

      // Write checkpoint (survives SIGTERM, allows resume)
      fs.writeFileSync(ckptPath, JSON.stringify({ completed, ticker, at: new Date().toISOString() }));

      completed++;
      if (completed % 25 === 0) {
        const pct = ((completed / idx.length) * 100).toFixed(0);
        const remaining = idx.length - completed;
        const etaMin = Math.ceil(remaining * GROK_INTERVAL_MS / 60000);
        console.log(`[PROGRESS] ${completed}/${idx.length} (${pct}%) — ${remaining} remaining — ETA ~${etaMin} min`);
        queueAlert(`Batch refresh: ${completed}/${idx.length} complete (${pct}%). ~${etaMin} min remaining.`);
      }
    } catch (e) {
      errors++;
      errorLog.push({ ticker, error: e.message });
      console.error(`[ERROR] ${ticker}: ${e.message}`);
    }
  }

  // Write updated index
  saveJson(INDEX_PATH, idx);
  console.log(`\n[INDEX] Written ${idx.length} entries to index.json`);

  // Build
  console.log('\n[BUILD] Running npm run build...');
  try {
    exec('npm run build', { cwd: path.join(__dirname, '..') });
    console.log('[BUILD] OK');
  } catch (e) {
    console.error('[BUILD] FAILED:', e.message);
  }

  const dur = new Date().toISOString();
  console.log(`\n=== Batch Refresh Complete ===`);
  console.log(`Completed: ${completed}/${idx.length}`);
  console.log(`Errors: ${errors}`);
  if (errorLog.length) {
    console.log('Error details:');
    errorLog.forEach(l => console.log(`  ${l.ticker}: ${l.error}`));
  }

  queueAlert(`Batch refresh complete. ${completed} reports updated, ${errors} errors. Build triggered. Check Discord for deploy status.`);
  try { fs.unlinkSync(ckptPath); } catch {}
  console.log('[CHECKPOINT] Cleared');
}

main().catch(e => { console.error(e); process.exit(1); });
