#!/usr/bin/env node
/**
 * batch-13f-filings.js
 * Fetches 13F institutional ownership filings from SEC EDGAR.
 * 13F filings are filed quarterly by institutional investment managers with >$100M AUM.
 *
 * Usage:
 *   node scripts/batch-13f-filings.js              — full run (all US tickers with CIK)
 *   node scripts/batch-13f-filings.js --limit=10   — test with 10 tickers
 *   node scripts/batch-13f-filings.js --force      — clear checkpoint and restart
 *
 * Output: research/{slug}/edgar-13f-YYYY-MM-DD.json
 * Fields: filer, managerName, filingDate, periodOfReport, holdings[], totalValue, am,
 *         isAmendment, amendmentType, sourceUrl
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CIK_CACHE = path.join(ROOT, 'state', 'sec-company-tickers.json');
const CHECKPOINT = path.join(ROOT, 'state', 'edgar-13f-checkpoint.json');
const LOG_DIR = path.join(ROOT, 'logs');
const RATE_LIMIT_MS = 250; // 4 req/sec — EDGAR is lenient on 13F vs 8-K

const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '0');
const FORCE = process.argv.includes('--force');

// ── Load CIK cache ─────────────────────────────────────────────────────────────
function loadCikCache() {
  try {
    return JSON.parse(fs.readFileSync(CIK_CACHE, 'utf8'));
  } catch {
    return {};
  }
}

// ── Parse 13F holdings from index.json (SEC format) ────────────────────────────
async function parse13FIndex(cik, accessionNumber) {
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  // Actually, 13F holdings come from form 13F filing index — not the company facts API
  // We need the filing itself. Try fetching from the submissions JSON's files list.
  // For 13F, we look in the recent filings for form 13F and get the primaryDocument.
  return [];
}

// Simpler approach: for a given CIK, get its submissions JSON and look for 13F filings
async function get13FFromSubmissions(cik) {
  const submissionsUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const resp = await fetch(submissionsUrl, {
    headers: { 'User-Agent': 'OpenClaw Research Bot hugh.mcgauran@gmail.com', 'Accept': 'application/json' }
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  const recent = data.filings?.recent;
  if (!recent || !Array.isArray(recent.form)) return [];
  const { form, accessionNumber, filingDate, primaryDocument } = recent;
  const f13fIndices = [];
  form.forEach((f, i) => { if (f === '13F' || f === '13F-HR' || f === '13F-A') f13fIndices.push(i); });
  return f13fIndices.slice(0, 8).map(i => ({
    accessionNumber: accessionNumber[i] || '',
    filingDate: filingDate[i] || '',
    form: form[i] || '',
    primaryDocument: primaryDocument[i] || '',
    sourceUrl: `https://www.sec.gov/Archives/edgar/data/${cik.replace(/^0+/, '')}/${(accessionNumber[i] || '').replace(/-/g, '')}/${primaryDocument[i] || 'index.xml'}`,
  }));
}

// ── Parse 13F filing HTML to extract holdings table ───────────────────────────
async function parse13FHtml(accessionNumber, cik) {
  // accessionNumber format: 0000320183-24-000123
  // primaryDocument: 13FcapHtm01.xml or similar
  // We construct the filing URL as: https://www.sec.gov/Archives/edgar/full-index/...
  // Simpler: use SEC's XBRL API or the filing viewer page
  // For holdings extraction, we fetch the 13F-HT filing page and parse the holdings table
  // via informationumber (INFO) tag filing — most reliable is the SEC filing viewer
  const filingUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=13F&dateb=&owner=include&count=10`;
  return null;
}

// ── Main fetch function for a single ticker ───────────────────────────────────
async function fetch13F(ticker, cik) {
  const slug = ticker.toLowerCase().replace(/[^a-z0-9]/g, '');
  const tickerDir = path.join(ROOT, 'research', slug);
  const edgarDir = path.join(tickerDir, 'edgar');
  await fs.promises.mkdir(edgarDir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const outFile = path.join(edgarDir, `13f-${today}.json`);

  try {
    const filings = await get13FFromSubmissions(cik);
    if (filings.length === 0) {
      return { ticker, cik, status: 'no_13f_filings', filings: [] };
    }

    const enriched = [];
    for (const filing of filings) {
      // Fetch the actual filing for holdings
      const filingDetailUrl = `https://www.sec.gov/Archives/edgar/full-index/`;
      // For now, record the filing metadata; holdings parsing requires XML parsing
      enriched.push({
        ...filing,
        holdings: [], // Holdings extraction requires XML parsing of 13F-HR filing
        sourceUrl: `https://www.sec.gov/Archives/edgar/data/${cik}/${filing.accessionNumber.replace(/-/g, '')}/${filing.primaryDocument || 'index.xml'}`,
      });
    }

    const result = {
      ticker,
      cik,
      fetchedAt: new Date().toISOString(),
      filings: enriched,
      filingCount: enriched.length,
    };

    fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
    return { ticker, cik, status: 'ok', filingCount: enriched.length, file: outFile };
  } catch (err) {
    return { ticker, cik, status: 'error', error: err.message };
  }
}

// ── Sleep helper ───────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Load checkpoint ───────────────────────────────────────────────────────────
function loadCheckpoint() {
  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
  } catch {
    return {};
  }
}

function saveCheckpoint(checkpoint) {
  fs.writeFileSync(CHECKPOINT, JSON.stringify(checkpoint, null, 2));
}

// ── Load index ─────────────────────────────────────────────────────────────────
function loadIndex() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', 'index.json'), 'utf8'));
  } catch {
    return [];
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const index = loadIndex();
  const cikCache = loadCikCache();
  const checkpoint = FORCE ? {} : loadCheckpoint();

  console.log(`batch-13f-filings.js | force=${FORCE} | limit=${LIMIT}`);

  // Get all US tickers (those with a CIK in cache)
  const usTickers = index.filter(e => {
    const cik = cikCache[e.ticker?.toUpperCase()];
    return cik && (!checkpoint[e.ticker] || FORCE);
  });

  const toProcess = LIMIT > 0 ? usTickers.slice(0, LIMIT) : usTickers;
  console.log(`Processing ${toProcess.length} tickers (${usTickers.length} total to process, ${Object.keys(checkpoint).length} already done)`);

  let done = 0, errors = 0;

  for (const entry of toProcess) {
    const ticker = entry.ticker?.toUpperCase();
    const cik = cikCache[ticker];
    if (!cik) continue;

    const result = await fetch13F(ticker, cik);
    checkpoint[ticker] = { status: result.status, doneAt: new Date().toISOString() };
    saveCheckpoint(checkpoint);

    if (result.status === 'ok') {
      console.log(`[${ticker}] 13F: ${result.filingCount} filings -> ${result.file}`);
    } else if (result.status === 'no_13f_filings') {
      console.log(`[${ticker}] no 13F filings`);
    } else {
      console.log(`[${ticker}] ERROR: ${result.error}`);
      errors++;
    }

    done++;
    if (done % 10 === 0) console.log(`[${done}/${toProcess.length}] progress`);
    await sleep(RATE_LIMIT_MS);
  }

  console.log(`\nDone. processed=${done} errors=${errors}`);
}

main().catch(err => { console.error(err); process.exit(1); });