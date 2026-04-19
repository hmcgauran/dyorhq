#!/usr/bin/env node
'use strict';

/**
 * fetch-annual-reports.js
 * Fetches the latest 10-K annual report for each company from SEC EDGAR
 * and stores it in the research directory.
 *
 * US companies: SEC EDGAR (free, comprehensive)
 * UK companies: LSE/Companies House (limited, best-effort)
 *
 * Storage: research/{slug}/10-K-{YEAR}.html
 *
 * Rate limit: 1 request/second to SEC EDGAR (10/sec allowed, we stay safe).
 * Checkpoint: state/annual-reports-checkpoint.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

// ── Config ──────────────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const STATE_DIR = path.join(ROOT, 'state');
const RESEARCH_DIR = path.join(ROOT, 'research');
const SEC_TICKERS_CACHE = path.join(STATE_DIR, 'sec-company-tickers.json');
const CHECKPOINT_FILE = path.join(STATE_DIR, 'annual-reports-checkpoint.json');

const MANIFEST_FILE = path.join(STATE_DIR, 'annual-reports-manifest.json');
// manifest: { ticker: { slug, cik, year, file, fetchedAt, source } }

const SEC_HEADERS = {
  'User-Agent': 'George/1.0 (investment research; mailto:hugh.mcgauran@gmail.com)',
  'Accept': 'text/html,application/xhtml+xml',
};

const REQUEST_DELAY_MS = 600; // 1 request per 600ms = safe rate limit

// ── Helpers ──────────────────────────────────────────────────────────────────

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    opts.headers = { ...SEC_HEADERS, ...headers };
    https.get(opts, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect once
        const locUrl = new URL(res.headers.location, url);
        httpGet(locUrl.toString(), headers).then(resolve).catch(reject);
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getCikFromTicker(ticker, cache) {
  // Cache maps ticker → CIK string (with leading zeros)
  const normalized = ticker.toUpperCase().replace(/\s+/g, '');
  return cache[normalized] || null;
}

function cikToShort(cik) {
  // SEC uses short CIK (no leading zeros) in some URLs
  return parseInt(cik, 10).toString();
}

function slugFromTicker(ticker) {
  // Use the existing research-slug resolver
  try {
    const resolver = require('./cron-scripts/lib/research-slug');
    return resolver.fromTicker(ticker);
  } catch (e) {
    // Fallback
    return ticker.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
}

function ensureResearchDir(slug) {
  const dir = path.join(RESEARCH_DIR, slug);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── SEC EDGAR 10-K Fetcher ────────────────────────────────────────────────────

/**
 * Get the latest 10-K filing info for a given CIK.
 * Returns { accessionNumber, filingDate, url }
 */
async function getLatest10K(cik) {
  const shortCik = cikToShort(cik);
  const subUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const subUrlShort = `https://data.sec.gov/submissions/CIK${shortCik}.json`;

  const res = await httpGet(subUrl);
  const json = JSON.parse(res.body.toString('utf8'));

  const filings = json.filings?.recent || json;
  const forms = filings.form;
  const dates = filings.filingDate;
  const accessionNos = filings.accessionNumber;
  const primaryDocs = filings.primaryDocument;

  // Find most recent 10-K (not 10-K/A amendment unless it's the only one)
  let idx = -1;
  for (let i = 0; i < forms.length; i++) {
    if (forms[i] === '10-K' && dates[i]) {
      idx = i;
      break; // most recent is first in list
    }
  }

  if (idx === -1) return null;

  const accession = accessionNos[idx];
  const filingDate = dates[idx];
  const accNoForUrl = accession.replace(/-/g, '');
  const doc = primaryDocs[idx] || `${accession.replace(/-/g, '')}-index.htm`;
  const docUrl = doc.endsWith('.htm') || doc.endsWith('.html')
    ? `https://www.sec.gov/Archives/edgar/data/${shortCik}/${accNoForUrl}/${doc}`
    : `https://www.sec.gov/Archives/edgar/data/${shortCik}/${accNoForUrl}/${accession}-index.htm`;

  return { accession, filingDate, docUrl };
}

/**
 * Download a 10-K document from SEC EDGAR.
 * Tries to get the .htm(l) version first; falls back to index page.
 */
async function download10K(docUrl) {
  const res = await httpGet(docUrl, { 'Accept': 'text/html,*/*' });
  if (res.status === 200) {
    return { content: res.body, url: docUrl, type: 'html' };
  }
  // Fallback: try the index page
  const indexUrl = docUrl.includes('-index.htm') ? docUrl : docUrl.replace(/\.htm$/, '-index.htm');
  const idxRes = await httpGet(indexUrl);
  if (idxRes.status === 200) {
    return { content: idxRes.body, url: indexUrl, type: 'index' };
  }
  return null;
}

// ── UK Annual Report ─────────────────────────────────────────────────────────

/**
 * Try to find annual report URL for UK company via LSE company page.
 * Ticker suffixes stripped for URL: .L, .IR, .DU, .DK, .NA, .EN, .EB, .VX
 */
async function getUkAnnualReportUrl(ticker) {
  const base = ticker.split('.')[0].toLowerCase();
  const lsePageUrl = `https://www.londonstockexchange.com/company-pages/${base}.L/news`;
  try {
    const res = await httpGet(lsePageUrl, { 'Accept': 'text/html' });
    if (res.status !== 200) return null;
    const html = res.body.toString('utf8');
    // Look for annual report PDF links
    const pdfMatches = [...html.matchAll(/(https:\/\/www\.londonstockexchange\.com\/[^"'\s]+\.pdf)/gi)];
    if (pdfMatches.length > 0) {
      for (const m of pdfMatches) {
        const url = m[1];
        if (/annual|report|results/i.test(url)) return { url, source: 'LSE' };
      }
      return { url: pdfMatches[0][1], source: 'LSE' };
    }
  } catch (e) { /* fall through */ }
  return null;
}

/**
 * Download a PDF from a URL.
 */
async function downloadPdf(url) {
  try {
    const res = await httpGet(url, { 'Accept': 'application/pdf,*/*' });
    if (res.status === 200 && res.headers['content-type']?.includes('pdf')) {
      return { content: res.body, url, type: 'pdf' };
    }
  } catch (e) { /* fall through */ }
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function fetchForTicker(ticker, cik, slug, year) {
  const dir = ensureResearchDir(slug);
  const outFile = path.join(dir, `10-K-${year}.html`);
  const outFilePdf = path.join(dir, `10-K-${year}.pdf`);

  // Check if already fetched
  if (fs.existsSync(outFile) || fs.existsSync(outFilePdf)) {
    console.log(`  [SKIP] ${ticker} ${year} already fetched`);
    return { ticker, slug, year, status: 'skipped' };
  }

  // ── US: SEC EDGAR ─────────────────────────────────────────────────────────
  if (cik) {
    try {
      const filing = await getLatest10K(cik);
      if (!filing) {
        console.log(`  [WARN] ${ticker}: no 10-K found in SEC EDGAR`);
        return { ticker, slug, year, status: 'no-10k' };
      }
      const fyear = parseInt(filing.filingDate.split('-')[0], 10);
      const content = await download10K(filing.docUrl);
      if (!content) {
        console.log(`  [WARN] ${ticker}: could not download 10-K document`);
        return { ticker, slug, year, status: 'download-failed' };
      }
      const out = content.type === 'index' ? outFile : outFile;
      fs.writeFileSync(out, content.content);
      console.log(`  [OK] ${ticker} ${fyear} → ${path.relative(ROOT, out)} (${content.content.length} bytes)`);
      return { ticker, slug, year: fyear, file: out, url: content.url, fetchedAt: new Date().toISOString(), source: 'SEC EDGAR', status: 'ok' };
    } catch (e) {
      console.log(`  [ERROR] ${ticker}: ${e.message}`);
      return { ticker, slug, year, status: 'error', error: e.message };
    }
  }

  // ── UK: LSE ───────────────────────────────────────────────────────────────
  try {
    const ukInfo = await getUkAnnualReportUrl(ticker);
    if (ukInfo) {
      const pdfContent = await downloadPdf(ukInfo.url);
      if (pdfContent) {
        fs.writeFileSync(outFilePdf, pdfContent.content);
        console.log(`  [OK] ${ticker} → ${path.relative(ROOT, outFilePdf)} (${pdfContent.content.length} bytes)`);
        return { ticker, slug, year: new Date().getFullYear(), file: outFilePdf, url: ukInfo.url, fetchedAt: new Date().toISOString(), source: 'LSE', status: 'ok' };
      }
    }
  } catch (e) { /* continue */ }

  console.log(`  [SKIP] ${ticker}: no authoritative source found`);
  return { ticker, slug, year, status: 'no-source' };
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-n');
  const tickerArg = args.find(a => !a.startsWith('-'));

  // Load SEC tickers cache
  let secTickerMap = {};
  if (fs.existsSync(SEC_TICKERS_CACHE)) {
    const cache = JSON.parse(fs.readFileSync(SEC_TICKERS_CACHE, 'utf8'));
    secTickerMap = cache.tickers || cache;
  }

  // Load checkpoint
  let checkpoint = {};
  if (fs.existsSync(CHECKPOINT_FILE)) {
    checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
  }

  // Load manifest
  let manifest = {};
  if (fs.existsSync(MANIFEST_FILE)) {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
  }

  // Load index to get tickers
  const indexPath = path.join(ROOT, 'reports', 'index.json');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

  // Filter to US tickers (those with CIK in SEC cache) + UK tickers
  const results = [];
  const usTickers = index.filter(e => {
    const t = e.ticker?.toUpperCase();
    if (!t) return false;
    // UK/Irish tickers usually have .L, .DB, etc. or are on LSE
    const isUk = e.ticker.includes('.') && !e.ticker.includes('/'); // has dot suffix = LSE/UK
    return !isUk && !!secTickerMap[t];
  });
  const ukTickers = index.filter(e => {
    const t = e.ticker || '';
    return t.includes('.L') || t.includes('.IR') || t.includes('.DU') || t.includes('.DK') ||
           t.includes('.NA') || t.includes('.EN') || t.includes('.EB') || t.includes('.VX');
  });

  const includeUk = args.includes('--include-uk') || args.includes('--uk');
  const tickersToProcess = tickerArg
    ? index.filter(e => (e.ticker || '').toUpperCase().replace(/\.L$/, '') === tickerArg.toUpperCase().replace(/\.L$/, ''))
    : (dryRun
        ? usTickers.slice(0, 3)
        : (includeUk ? [...usTickers, ...ukTickers] : usTickers));

  console.log(`Annual Report Fetcher`);
  console.log(`===================`);
  console.log(`Tickers: ${tickersToProcess.length} | Dry run: ${dryRun}`);
  console.log(`SEC cache: ${Object.keys(secTickerMap).length} entries`);
  console.log('');

  if (dryRun) {
    console.log('Dry run — would fetch for:');
    tickersToProcess.forEach(e => {
      const t = e.ticker.toUpperCase();
      const cik = secTickerMap[t];
      const slug = slugFromTicker(t);
      console.log(`  ${t} (CIK: ${cik || 'none'}, slug: ${slug})`);
    });
    console.log(`\nWould skip UK tickers in dry run (set --include-uk to include)`);
    return;
  }

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const entry of tickersToProcess) {
    const ticker = entry.ticker?.toUpperCase();
    if (!ticker) continue;

    // Skip if already processed in this run
    if (checkpoint[ticker] === 'done') { skipped++; continue; }

    const cik = secTickerMap[ticker] || null;
    const slug = slugFromTicker(ticker);
    const currentYear = new Date().getFullYear();

    console.log(`Processing ${ticker} (slug: ${slug}, CIK: ${cik || 'UK/Unknown'})...`);

    const result = await fetchForTicker(ticker, cik, slug, currentYear);
    results.push(result);

    if (result.status === 'ok') {
      manifest[ticker] = result;
    }

    checkpoint[ticker] = result.status === 'ok' || result.status === 'skipped' ? 'done' : 'failed';
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
    fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));

    if (result.status === 'ok') processed++;
    else if (result.status !== 'skipped') errors++;

    await delay(REQUEST_DELAY_MS);
  }

  console.log(`\nDone. Processed: ${processed} | Skipped: ${skipped} | Errors: ${errors}`);
  console.log(`Manifest: ${MANIFEST_FILE}`);
  console.log(`Checkpoint: ${CHECKPOINT_FILE}`);
}

main().catch(e => { console.error(e); process.exit(1); });
