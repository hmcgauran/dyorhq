#!/usr/bin/env node
'use strict';

/**
 * batch-paperclip-research.js
 *
 * Scientific paper research for biotech/pharma tickers via PubMed E-utilities.
 * Reads ticker info from state/sheet-latest.json (written by sync-sheet.js).
 *
 * Runs 3 searches per ticker:
 *   1. {company} clinical trial
 *   2. {company} mechanism of action
 *   3. {company} drug efficacy safety
 *
 * Returns up to 5 papers per search: title, authors, journal, pub date, URL.
 * Output: research/{slug}/paperclip-YYYY-MM-DD.json
 *
 * Uses PubMed E-utilities (free, no key required).
 * Rate limit: 3 req/sec without NCBI_API_KEY, 10/sec with.
 *
 * Env vars:
 *   NCBI_API_KEY  (optional — raises rate limit to 10 req/sec)
 *
 * Usage:
 *   node scripts/batch-paperclip-research.js --ticker=MRNA
 *   node scripts/batch-paperclip-research.js --ticker=MRNA --force
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT          = path.resolve(__dirname, '..');
const RESEARCH_DIR  = path.join(ROOT, 'research');
const SNAPSHOT_FILE = path.join(ROOT, 'state', 'sheet-latest.json');
const TODAY         = new Date().toISOString().slice(0, 10);
const NCBI_API_KEY  = process.env.NCBI_API_KEY || '';
const RATE_LIMIT_MS = NCBI_API_KEY ? 110 : 340; // 10/sec with key, 3/sec without

const PREFIX_RE = /^(NYSE|NASDAQ|EPA|ASX|LON|LSE |FRA|CVE|BME|TSE|TSX|HKEX):/i;

const args          = process.argv.slice(2);
const TICKER_FILTER = (args.find(a => a.startsWith('--ticker='))?.split('=')[1] || '').toUpperCase() || null;
const FORCE         = args.includes('--force');

function bareTicker(t) { return (t || '').replace(PREFIX_RE, '').trim().toUpperCase(); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Load ticker entry from snapshot ──────────────────────────────────────────
function loadEntry(targetBare) {
  if (!fs.existsSync(SNAPSHOT_FILE)) {
    throw new Error('state/sheet-latest.json not found — run sync-sheet.js first');
  }
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
  for (const entry of snapshot.tickers) {
    const bare = bareTicker(entry.ticker || '');
    if (bare !== targetBare) continue;
    const company = (entry.companyName || bare).trim();
    const slug    = entry.research_slug || entry.slug ||
                    company.toLowerCase().replace(/[^a-z0-9]/g, '') || bare.toLowerCase();
    return { bare, company, slug };
  }
  return null;
}

// ── PubMed E-utilities ────────────────────────────────────────────────────────
function pubmedGet(url) {
  return new Promise((resolve, reject) => {
    const fullUrl = NCBI_API_KEY ? `${url}&api_key=${NCBI_API_KEY}` : url;
    const req = https.get(fullUrl, {
      headers: { 'User-Agent': 'DYOR-HQ/1.0 (hugh.mcgauran@gmail.com)' },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('PubMed JSON parse error')); }
        } else {
          reject(new Error(`PubMed HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('PUBMED_TIMEOUT')); });
  });
}

async function searchPubmed(query, maxResults = 5) {
  const searchUrl =
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi` +
    `?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json&sort=relevance`;

  const searchData = await pubmedGet(searchUrl);
  const ids = searchData?.esearchresult?.idlist || [];
  if (ids.length === 0) return [];

  await sleep(RATE_LIMIT_MS);

  const summaryUrl =
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi` +
    `?db=pubmed&id=${ids.join(',')}&retmode=json`;

  const summaryData = await pubmedGet(summaryUrl);
  const uids = summaryData?.result?.uids || [];

  return uids.map(uid => {
    const doc = summaryData.result[uid] || {};
    return {
      pmid:    uid,
      title:   doc.title   || '',
      authors: (doc.authors || []).slice(0, 3).map(a => a.name).join(', '),
      journal: doc.source  || '',
      pubDate: doc.pubdate || '',
      url:     `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
    };
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!TICKER_FILTER) {
    console.error('ERROR: --ticker=TICKER required');
    process.exit(1);
  }

  console.log(`=== batch-paperclip-research.js | ticker=${TICKER_FILTER} ===`);

  const entry = loadEntry(TICKER_FILTER);
  if (!entry) {
    console.error(`ERROR: ${TICKER_FILTER} not found in snapshot`);
    process.exit(1);
  }

  const { bare, company, slug } = entry;
  const dir = path.join(RESEARCH_DIR, slug);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const outFile = path.join(dir, `paperclip-${TODAY}.json`);
  if (fs.existsSync(outFile) && !FORCE) {
    console.log(`  [${bare}] paperclip-${TODAY}.json already exists — skipping`);
    return;
  }

  const searches = [
    `${company} clinical trial`,
    `${company} mechanism of action`,
    `${company} drug efficacy safety`,
  ];

  const results = [];
  for (const query of searches) {
    console.log(`  [${bare}] PubMed: "${query}"...`);
    try {
      const papers = await searchPubmed(query);
      results.push({ query, papers, count: papers.length });
      console.log(`  [${bare}] → ${papers.length} papers`);
    } catch (e) {
      results.push({ query, error: e.message, papers: [] });
      console.error(`  [${bare}] → ERROR: ${e.message}`);
    }
    await sleep(RATE_LIMIT_MS);
  }

  const totalPapers = results.reduce((n, r) => n + (r.papers || []).length, 0);

  const artifact = {
    ticker:      bare,
    company,
    slug,
    date:        TODAY,
    source:      'pubmed',
    searches:    results,
    totalPapers,
    gatheredAt:  new Date().toISOString(),
  };

  fs.writeFileSync(outFile, JSON.stringify(artifact, null, 2));
  console.log(`  [${bare}] paperclip-${TODAY}.json written (${totalPapers} papers total)`);
}

main().catch(e => { console.error(e); process.exit(1); });
