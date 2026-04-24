#!/usr/bin/env node
'use strict';

/**
 * batch-playwright-fetch.js
 *
 * Enriches search results with full article text.
 * Reads the URLs from existing brave-web-{today}.json and duck-web-{today}.json,
 * visits each page with headless Chromium, and extracts clean article text using
 * Mozilla's Readability algorithm (the same engine behind Firefox Reader View).
 *
 * This runs AFTER brave/duck research and BEFORE grok sentiment, so Grok receives
 * full article context rather than 200-character snippets.
 *
 * Requires:
 *   npm install playwright @mozilla/readability jsdom
 *   npx playwright install chromium
 *
 * Output: research/{slug}/playwright-{date}.json
 *
 * URL selection:
 *   - Top 2 hits per query from each search source (brave + duck)
 *   - Deduplicated by normalised URL
 *   - Paywall / hard-blocked domains skipped automatically
 *   - Total capped at MAX_URLS (default 10)
 *
 * Cache behaviour: skips if playwright-{today}.json already exists (use --force to override).
 *
 * Usage:
 *   node scripts/batch-playwright-fetch.js --ticker=MP
 *   node scripts/batch-playwright-fetch.js --ticker=MP --force
 *   node scripts/batch-playwright-fetch.js --ticker=MP --max-urls=8
 */

const fs   = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ── Dependency check — fail clearly if packages not installed ─────────────────
let chromium, Readability, JSDOM;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('ERROR: playwright not installed.');
  console.error('  Run: npm install playwright && npx playwright install chromium');
  process.exit(1);
}
try {
  ({ Readability } = require('@mozilla/readability'));
  ({ JSDOM } = require('jsdom'));
} catch {
  console.error('ERROR: @mozilla/readability or jsdom not installed.');
  console.error('  Run: npm install @mozilla/readability jsdom');
  process.exit(1);
}

const ROOT          = path.resolve(__dirname, '..');
const RESEARCH_DIR  = path.join(ROOT, 'research');
const SNAPSHOT_FILE = path.join(ROOT, 'state', 'sheet-latest.json');
const TODAY         = new Date().toISOString().slice(0, 10);
const PREFIX_RE     = /^(NYSE|NASDAQ|EPA|ASX|LON|LSE |FRA|CVE|BME|TSE|TSX|HKEX):/i;

const args          = process.argv.slice(2);
const TICKER_FILTER = (args.find(a => a.startsWith('--ticker='))?.split('=')[1] || '').toUpperCase() || null;
const FORCE         = args.includes('--force');
const MAX_URLS      = parseInt(args.find(a => a.startsWith('--max-urls='))?.split('=')[1] || '10', 10);

// ── Domains that reliably paywall or block scrapers ───────────────────────────
const BLOCKED_DOMAINS = new Set([
  'bloomberg.com',
  'ft.com',
  'wsj.com',
  'seekingalpha.com',
  'barrons.com',
  'economist.com',
  'hbr.org',
  'nytimes.com',
  'washingtonpost.com',
  'thetimes.co.uk',
  'telegraph.co.uk',
  'businessinsider.com',
  'fortune.com',   // soft paywall
  'wired.com',
]);

// Max text length stored per article — enough for Grok context without bloat
const MAX_ARTICLE_CHARS = 8000;
const RATE_LIMIT_MS     = 2000; // polite delay between page loads

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function bareTicker(t) { return (t || '').replace(PREFIX_RE, '').trim().toUpperCase(); }

// ── Normalise URL for deduplication ──────────────────────────────────────────
function normUrl(raw) {
  try {
    const u = new URL(raw);
    // Strip trailing slash, fragments, common tracking params
    u.hash = '';
    for (const p of ['utm_source','utm_medium','utm_campaign','utm_content',
                     'utm_term','ref','source','via']) {
      u.searchParams.delete(p);
    }
    return u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/$/, '') +
           (u.search ? u.search : '');
  } catch {
    return raw;
  }
}

function domainOf(raw) {
  try { return new URL(raw).hostname.replace(/^www\./, ''); }
  catch { return raw; }
}

function isBlocked(url) {
  const domain = domainOf(url);
  return [...BLOCKED_DOMAINS].some(d => domain === d || domain.endsWith('.' + d));
}

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

// ── Collect URLs from existing search result files ────────────────────────────
// Returns [{ url, title, snippet, source }], deduplicated, blocked domains removed, capped at MAX_URLS.
function collectUrls(dir) {
  const seen   = new Map(); // normUrl → entry
  const result = [];

  const files = fs.existsSync(dir) ? fs.readdirSync(dir).sort().reverse() : [];

  for (const prefix of ['brave-web', 'duck-web']) {
    const file = files.find(f => f.startsWith(prefix) && f.endsWith('.json'));
    if (!file) continue;

    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')); }
    catch { continue; }

    const sourceName = prefix === 'brave-web' ? 'brave' : 'duck';

    for (const q of (data.queries || [])) {
      let taken = 0;
      for (const hit of (q.hits || [])) {
        if (taken >= 2) break;
        const url = (hit.url || '').trim();
        if (!url || !url.startsWith('http')) continue;
        if (isBlocked(url)) continue;

        const norm = normUrl(url);
        if (seen.has(norm)) {
          // Mark as appearing in both sources
          if (seen.get(norm).source !== sourceName) seen.get(norm).source = 'both';
          taken++;
          continue;
        }

        const entry = { url, title: hit.title || '', snippet: hit.snippet || '',
                        source: sourceName };
        seen.set(norm, entry);
        result.push(entry);
        taken++;
      }
    }
  }

  return result.slice(0, MAX_URLS);
}

// ── Extract article content using Readability ─────────────────────────────────
function extractArticle(html, url) {
  try {
    const dom    = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document, {
      charThreshold: 300, // skip pages with very little text
    });
    const article = reader.parse();
    if (!article || !article.textContent) return null;

    // Clean up whitespace
    const text = article.textContent
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/^ +/gm, '')
      .trim()
      .slice(0, MAX_ARTICLE_CHARS);

    return {
      title:     (article.title     || '').trim(),
      byline:    (article.byline    || '').trim(),
      siteName:  (article.siteName  || '').trim(),
      wordCount: article.length || text.split(/\s+/).length,
      text,
    };
  } catch {
    return null;
  }
}

// ── Fetch and parse one page ──────────────────────────────────────────────────
async function fetchPage(page, url) {
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout:   15000,
  });
  // Brief wait for any lazy-rendered content
  await page.waitForTimeout(800);
  return page.content();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!TICKER_FILTER) {
    console.error('ERROR: --ticker=TICKER required');
    process.exit(1);
  }

  console.log(`=== batch-playwright-fetch.js | ticker=${TICKER_FILTER} | max-urls=${MAX_URLS} ===`);

  const entry = loadEntry(TICKER_FILTER);
  if (!entry) {
    console.error(`ERROR: ${TICKER_FILTER} not found in snapshot`);
    process.exit(1);
  }

  const { bare, company, slug } = entry;
  const dir     = path.join(RESEARCH_DIR, slug);
  const outFile = path.join(dir, `playwright-${TODAY}.json`);

  if (fs.existsSync(outFile) && !FORCE) {
    console.log(`  [${bare}] playwright-${TODAY}.json already exists — skipping`);
    return;
  }

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const candidates = collectUrls(dir);

  if (candidates.length === 0) {
    console.log(`  [${bare}] No URLs found in brave-web / duck-web files — run those first`);
    process.exit(1);
  }

  console.log(`  [${bare}] ${candidates.length} candidate URLs collected`);

  // ── Launch browser ────────────────────────────────────────────────────────
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
               '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport:  { width: 1280, height: 720 },
    // Accept cookies/storage to get past some cookie banners
    storageState: undefined,
  });
  // Block unnecessary resources to speed up loading
  await context.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,mp4,mp3}', r => r.abort());

  const page     = await context.newPage();
  const articles = [];
  const skipped  = [];

  for (let i = 0; i < candidates.length; i++) {
    const { url, title: searchTitle, snippet, source } = candidates[i];
    const domain = domainOf(url);
    console.log(`  [${bare}] [${i + 1}/${candidates.length}] ${domain}`);

    try {
      const html    = await fetchPage(page, url);
      const article = extractArticle(html, url);

      if (!article || article.text.length < 200) {
        skipped.push({ url, reason: 'no_content' });
        console.log(`    → no usable content`);
      } else {
        articles.push({
          url,
          domain,
          title:     article.title || searchTitle,
          byline:    article.byline,
          siteName:  article.siteName,
          wordCount: article.wordCount,
          text:      article.text,
          source,
          fetchedAt: new Date().toISOString(),
        });
        console.log(`    → OK (${article.wordCount} words)`);
      }
    } catch (e) {
      const reason = e.message?.includes('timeout') ? 'timeout' : 'fetch_error';
      skipped.push({ url, reason, detail: e.message?.slice(0, 100) });
      console.log(`    → ${reason}: ${e.message?.slice(0, 80)}`);
    }

    if (i < candidates.length - 1) await sleep(RATE_LIMIT_MS);
  }

  await browser.close();

  const artifact = {
    ticker:       bare,
    company,
    slug,
    date:         TODAY,
    gatheredAt:   new Date().toISOString(),
    totalArticles: articles.length,
    articles,
    skipped,
  };

  fs.writeFileSync(outFile, JSON.stringify(artifact, null, 2));
  console.log(`  [${bare}] playwright-${TODAY}.json written (${articles.length} articles, ${skipped.length} skipped)`);
}

main().catch(e => { console.error(e); process.exit(1); });
