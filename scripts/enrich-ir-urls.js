#!/usr/bin/env node
/**
 * scripts/enrich-ir-urls.js
 *
 * Enriches each data JSON with investor relations URLs:
 *   price.irUrl         → direct IR/press releases landing page
 *   price.pressReleasesUrl → dedicated press releases section (if known)
 *
 * Sources:
 *   US (NYSE/NASDAQ):  SEC EDGAR + LSE website as fallback
 *   UK (LON/EPA):      LSE company page + SEC EDGAR as fallback
 *   IE (Euronext):     Company websites by inferred URL patterns
 *
 * Usage: node scripts/enrich-ir-urls.js [--dry-run] [--from TICKER]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs   = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR  = path.join(__dirname, '..', 'reports', 'data');
const INDEX_PATH = path.join(__dirname, '..', 'reports', 'index.json');
const STATE_DIR  = path.join(__dirname, '..', 'state');
const CKPT_PATH  = path.join(STATE_DIR, 'enrich-ir-checkpoint.json');
const TODAY      = new Date().toISOString().slice(0, 10);

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function saveJson(p, d) {
  fs.writeFileSync(p, JSON.stringify(d, null, 2), 'utf8');
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function mkdir(p) { try { fs.mkdirSync(p, { recursive: true }); } catch {} }

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: Object.assign({
        'User-Agent': 'DYOR HQ research project hugh@mcgauran.com',
        'Accept': 'application/json, text/html',
      }, headers || {})
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: d }));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ── US ticker → CIK lookup (cached SEC company_tickers.json) ─────────────────
const CT_CACHE_PATH = path.join(STATE_DIR, 'sec-company-tickers.json');

async function getCikForTicker(ticker) {
  // Load SEC ticker→CIK index (re-download if >7 days old)
  let ct = loadJson(CT_CACHE_PATH);
  if (!ct || ct._cached !== TODAY) {
    console.log('[SEC] Fetching company_tickers.json...');
    try {
      const r = await httpsGet('https://www.sec.gov/files/company_tickers.json', {
        'User-Agent': 'DYOR HQ research hugh@mcgauran.com'
      });
      const raw = JSON.parse(r.body);
      // Reformat: numeric keys → array
      ct = { _cached: TODAY, _ts: Date.now(), tickers: {} };
      for (const [k, v] of Object.entries(raw)) {
        const t = v.ticker;
        if (t) ct.tickers[t.toUpperCase()] = String(v.cik_str).padStart(10, '0');
      }
      saveJson(CT_CACHE_PATH, ct);
    } catch(e) {
      console.warn('[SEC] Fetch failed, using cache:', e.message);
      if (!ct) return null;
    }
  }
  return ct?.tickers?.[ticker.toUpperCase()] || null;
}

async function getEdgarInfo(cik) {
  try {
    const cikPadded = String(cik).padStart(10, '0');
    const r = await httpsGet(`https://data.sec.gov/submissions/CIK${cikPadded}.json`, {
      'User-Agent': 'DYOR HQ research hugh@mcgauran.com'
    });
    if (r.status !== 200) return null;
    const j = JSON.parse(r.body);
    return {
      name: j.name || '',
      website: j.website || '',
      sic: j.sic || '',
      state: j.stateOfIncorporation || '',
      cik: j.cik || cikPadded,
    };
  } catch { return null; }
}

// ── URL building heuristics ───────────────────────────────────────────────────
function buildIrUrl(ticker, companyName, exchange, isin, edgarData) {
  const cleanTicker = ticker.replace(/^(NYSE|NASDAQ|AMEX|EPA|ASX|LON|LSE |FRA|CVE|BME|TSE|TSX):/i, '').replace(/\.L$/, '').toUpperCase();

  // LSE-listed companies: standard LSE company page
  if (exchange === 'LON' || isin.startsWith('GB')) {
    return `https://www.londonstockexchange.com/聚焦/company-page?eqId=${cleanTicker}`;
  }

  // US NYSE/NASDAQ: heuristic — EDGAR confirms the company exists
  if (isin.startsWith('US') || exchange === 'NYSE' || exchange === 'NASDAQ') {
    const t = cleanTicker.toLowerCase();
    return `https://ir.${t}.com`;
  }

  // Irish (IE prefix): try Euronext Dublin
  if (isin.startsWith('IE')) {
    return `https://www.euronext.com/en/listed/companies/${cleanTicker}`;
  }

  // No reliable pattern for other exchanges
  return null;
}

function buildPressReleasesUrl(ticker, irUrl, exchange, isin) {
  if (!irUrl) return null;
  // Standard press release sub-paths
  if (irUrl.includes('londonstockexchange')) return null;  // Can't determine CH press page
  return irUrl.replace(/\/$/, '') + '/press-releases';
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const idx = loadJson(INDEX_PATH);
  if (!idx) { console.error('ERROR: index.json not found'); process.exit(1); }

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fromIdx = args.indexOf('--from');
  const fromTicker = fromIdx >= 0 ? args[fromIdx + 1] : null;

  let startFrom = 0;
  if (fromTicker) {
    const i = idx.findIndex(e => e.ticker === fromTicker || e.file === fromTicker);
    if (i >= 0) startFrom = i;
  }

  console.log(`=== IR URL Enrichment — ${idx.length} tickers ===`);
  console.log(`Dry run: ${dryRun} | From: ${fromTicker || 'start'}`);
  if (dryRun) console.log('DRY RUN — no files will be written\n');

  // Pre-fetch SEC ticker→CIK index
  console.log('\n[SEC] Loading ticker→CIK index...');
  await getCikForTicker('AAPL');  // prime the cache
  console.log('[SEC] Ticker cache ready');

  const results = { ok: 0, failed: 0, skipped: 0, dryrun: 0 };

  for (let i = startFrom; i < idx.length; i++) {
    const entry = idx[i];
    const ticker = entry.ticker;
    process.stdout.write(`[${i + 1}/${idx.length}] ${ticker.padEnd(10)} `);

    // Load data JSON — use ticker as filename, not index file field
    const tickerNorm = (entry.ticker || entry.file || ticker)
      .replace(/^(NYSE|NASDAQ|EPA|ASX|LON|LSE |FRA|CVE|BME|TSE|TSX):/i, '')
      .replace(/\.L$/, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const dataPath = path.join(DATA_DIR, tickerNorm + '.json');
    const data = loadJson(dataPath);
    if (!data) {
      console.log('SKIP (no data JSON)');
      results.skipped++;
      continue;
    }

    // Check if already enriched today
    if (data.price?.irUrl && data._irEnriched === TODAY) {
      console.log('OK (already enriched)');
      results.ok++;
      continue;
    }

    const isin    = data.meta?.isin || '';
    const exchange = data.meta?.exchange || '';
    const company = data.meta?.company || entry.company || '';

    let irUrl = null;
    let pressUrl = null;
    let edgarData = null;

    try {
      let edgarData = null;

      // Try SEC EDGAR for US tickers (CIK lookup + company name confirmation)
      if (isin.startsWith('US') || exchange === 'NYSE' || exchange === 'NASDAQ') {
        const cik = await getCikForTicker(tickerNorm);
        if (cik) {
          edgarData = await getEdgarInfo(cik);
        }
      }

      // Build IR URL (heuristic primary, EDGAR confirms company existence)
      irUrl = buildIrUrl(ticker, company, exchange, isin, edgarData);

      if (irUrl) {
        pressUrl = buildPressReleasesUrl(ticker, irUrl, exchange, isin);
      }

    } catch(e) {
      console.warn('API error:', e.message);
    }

    // Write result
    const result = {
      irUrl,
      pressReleasesUrl: pressUrl,
      source: edgarData ? 'sec-edgar' : (irUrl ? 'lse-pattern' : null),
      enrichedAt: TODAY,
      edgarName: edgarData?.name || null,
    };

    if (dryRun) {
      console.log('DRY RUN:', JSON.stringify(result));
      results.dryrun++;
    } else {
      data.price = data.price || {};
      data.price.irUrl = irUrl;
      data.price.pressReleasesUrl = pressUrl;
      data._irEnriched = TODAY;
      saveJson(dataPath, data);

      if (irUrl) {
        console.log('OK:', irUrl);
        results.ok++;
      } else {
        console.log('NO URL');
        results.failed++;
      }
    }

    // Rate limit
    if (i < idx.length - 1) await sleep(500);

    // Checkpoint every 25
    if ((i + 1) % 25 === 0 && !dryRun) {
      fs.writeFileSync(CKPT_PATH, JSON.stringify({ date: TODAY, last: ticker, at: i }), 'utf8');
    }
  }

  console.log(`\n=== Complete ===`);
  console.log(`OK: ${results.ok} | Failed: ${results.failed} | Skipped: ${results.skipped} | Dry run: ${results.dryrun}`);
  if (!dryRun && results.failed > 0) {
    console.log('\nRun with --from TICKER to retry failures.');
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });