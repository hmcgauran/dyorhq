#!/usr/bin/env node
'use strict';

/**
 * batch-edgar-filings.js
 *
 * Fetches US SEC EDGAR filings for tickers sourced from state/sheet-latest.json.
 * The Sheet is the single source of truth for ticker, company name, and slug.
 *
 *   8-K: last 3 filings per ticker (material events — earnings, M&A, guidance, CEO/CFO)
 *   10-Q: most recent quarter per ticker
 *   10-K: most recent annual filing
 *
 * Three-layer output per filing:
 *   Layer 1: research/{slug}/{type}-{date}.md           — full clean markdown
 *   Layer 2: research/{slug}/{type}-{date}-exhibit.md   — EX-99.1 press release (8-K only)
 *            research/{slug}/{type}-{date}-mda.md       — MD&A section (10-K / 10-Q)
 *            research/{slug}/{type}-{date}-business.md  — Business description (10-K only)
 *            research/{slug}/{type}-{date}-risks.md     — Risk factors (10-K only)
 *   Layer 3: research/{slug}/{type}-{date}-xbrl.json    — structured XBRL financial data
 *   Archive: research/{slug}/archive/{type}-{date}.html — original HTML preserved
 *
 * Existence check uses Layer 1 (.md) file — if present, filing is skipped.
 * Previously downloaded filings are never re-fetched unless --force is passed.
 *
 * Uses SEC company tickers JSON (cached in state/sec-company-tickers.json).
 * Rate-limited: 1 req/sec to SEC EDGAR.
 * Checkpoint/resume: state/edgar-filings-checkpoint.json
 *
 * Usage:
 *   node scripts/batch-edgar-filings.js              # all US tickers from sheet
 *   node scripts/batch-edgar-filings.js --ticker=MP  # single ticker
 *   node scripts/batch-edgar-filings.js --8k         # 8-K only
 *   node scripts/batch-edgar-filings.js --10q        # 10-Q only
 *   node scripts/batch-edgar-filings.js --10k        # 10-K only
 *   node scripts/batch-edgar-filings.js --limit=20   # first 20 tickers
 *   node scripts/batch-edgar-filings.js --force      # re-fetch even if already done
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT            = path.resolve(__dirname, '..');
const RESEARCH_DIR    = path.join(ROOT, 'research');
const PREFIX_RE       = /^(NYSE|NASDAQ|EPA|ASX|LON|LSE |FRA|CVE|BME|TSE|TSX|HKEX):/i;
const CHECKPOINT_FILE = path.join(ROOT, 'state', 'edgar-filings-checkpoint.json');
const LOG_FILE        = path.join(ROOT, 'state', 'edgar-filings-log.jsonl');
const RATE_LIMIT_MS   = 1100; // SEC EDGAR: 1 req/sec max (slight buffer)
const TODAY           = new Date().toISOString().slice(0, 10);

const args          = process.argv.slice(2);
const TYPES         = args.includes('--8k')  ? ['8-K']  :
                      args.includes('--10q') ? ['10-Q'] :
                      args.includes('--10k') ? ['10-K'] :
                      ['8-K', '10-Q', '10-K'];
const FORCE         = args.includes('--force');
const LIMIT         = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '9999', 10);
const TICKER_FILTER = (args.find(a => a.startsWith('--ticker='))?.split('=')[1] || '').toUpperCase() || null;

const US_EXCHANGES = new Set(['NYE', 'NMS', 'AMS', 'NASDAQ', 'NASDAQ Capital', 'NYE MKT', 'NASDAQ Global Select']);

// ── Utilities ─────────────────────────────────────────────────────────────────

function log(msg) {
  const entry = { ts: new Date().toISOString(), msg };
  try { fs.writeFileSync(LOG_FILE, JSON.stringify(entry) + '\n', { flag: 'a' }); } catch {}
  console.log(msg);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function checkpointRead() {
  try { return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8')); }
  catch { return { done: {}, last: null }; }
}

function checkpointWrite(cp) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2));
}

// ── Sheet snapshot → ticker list ──────────────────────────────────────────────
function fetchSheetMap() {
  const snapshotFile = path.join(ROOT, 'state', 'sheet-latest.json');
  if (!fs.existsSync(snapshotFile)) {
    throw new Error('state/sheet-latest.json not found — run sync-sheet.js first');
  }
  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  const results = [];
  for (const entry of snapshot.tickers) {
    const rawTicker = (entry.ticker || '').trim();
    if (!rawTicker || rawTicker === 'Ticker' || rawTicker === '#N/A' || rawTicker === '#REF!') continue;
    const company  = (entry.companyName || rawTicker).trim();
    const exchange = (entry.primaryExchange || '').trim();
    const slug     = entry.research_slug || entry.slug ||
                     company.toLowerCase().replace(/[^a-z0-9]/g, '') ||
                     rawTicker.toLowerCase().replace(/[^a-z0-9]/g, '');
    const bare     = rawTicker.replace(PREFIX_RE, '').trim().toUpperCase();
    results.push({ ticker: bare, company, slug, exchange });
  }
  return results;
}

// ── HTML → Markdown conversion ────────────────────────────────────────────────

function stripTags(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeEntities(text) {
  return (text || '')
    .replace(/&amp;/g,    '&')
    .replace(/&lt;/g,     '<')
    .replace(/&gt;/g,     '>')
    .replace(/&quot;/g,   '"')
    .replace(/&#x27;/g,   "'")
    .replace(/&#39;/g,    "'")
    .replace(/&apos;/g,   "'")
    .replace(/&nbsp;/g,   ' ')
    .replace(/&#160;/g,   ' ')
    .replace(/&mdash;/g,  '—')
    .replace(/&ndash;/g,  '–')
    .replace(/&hellip;/g, '...')
    .replace(/&ldquo;/g,  '"')
    .replace(/&rdquo;/g,  '"')
    .replace(/&lsquo;/g,  ''')
    .replace(/&rsquo;/g,  ''')
    .replace(/&#(\d+);/g,      (_, n)   => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function tableToMarkdown(tableHtml) {
  const rows = [];
  for (const rowMatch of tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [];
    for (const cellMatch of rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
      cells.push(decodeEntities(stripTags(cellMatch[1])).replace(/\|/g, '\\|').trim());
    }
    if (cells.length > 0) rows.push(cells);
  }
  if (rows.length === 0) return '';

  const maxCols = Math.max(...rows.map(r => r.length));
  const pad = row => { const r = [...row]; while (r.length < maxCols) r.push(''); return r; };

  const lines = [];
  lines.push('| ' + pad(rows[0]).join(' | ') + ' |');
  lines.push('| ' + Array(maxCols).fill('---').join(' | ') + ' |');
  for (let i = 1; i < rows.length; i++) {
    lines.push('| ' + pad(rows[i]).join(' | ') + ' |');
  }
  return lines.join('\n');
}

function htmlToMarkdown(html, metadata = {}) {
  // Remove XBRL/inline hidden elements and boilerplate
  let text = (html || '')
    .replace(/<script[\s\S]*?<\/script>/gi,   '')
    .replace(/<style[\s\S]*?<\/style>/gi,     '')
    .replace(/<!--[\s\S]*?-->/g,              '')
    .replace(/<ix:header[\s\S]*?<\/ix:header>/gi, '')
    .replace(/<ix:hidden[\s\S]*?<\/ix:hidden>/gi, '');

  // Headings
  text = text
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, c) => `\n# ${decodeEntities(stripTags(c)).trim()}\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, c) => `\n## ${decodeEntities(stripTags(c)).trim()}\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, c) => `\n### ${decodeEntities(stripTags(c)).trim()}\n`)
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, c) => `\n#### ${decodeEntities(stripTags(c)).trim()}\n`)
    .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_, c) => `\n##### ${decodeEntities(stripTags(c)).trim()}\n`)
    .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_, c) => `\n###### ${decodeEntities(stripTags(c)).trim()}\n`);

  // Convert tables before stripping remaining tags
  text = text.replace(/<table[\s\S]*?<\/table>/gi, m => '\n\n' + tableToMarkdown(m) + '\n\n');

  // Block elements
  text = text
    .replace(/<p[^>]*>/gi,         '\n\n')
    .replace(/<\/p>/gi,            '\n\n')
    .replace(/<br\s*\/?>/gi,       '\n')
    .replace(/<hr\s*\/?>/gi,       '\n\n---\n\n')
    .replace(/<li[^>]*>/gi,        '\n- ')
    .replace(/<\/li>/gi,           '')
    .replace(/<\/?(ul|ol)[^>]*>/gi, '\n')
    .replace(/<\/?(div|section|article|main|aside)[^>]*>/gi, '\n')
    .replace(/<blockquote[^>]*>/gi, '\n> ')
    .replace(/<\/blockquote>/gi,   '\n');

  // Inline formatting
  text = text
    .replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**')
    .replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*')
    .replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => {
      const l = decodeEntities(stripTags(label)).trim();
      return l ? `[${l}](${href})` : href;
    });

  // Strip all remaining tags
  text = stripTags(text);
  text = decodeEntities(text);

  // Clean up whitespace
  text = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/^ +/gm, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();

  // YAML front matter
  const meta = [];
  if (metadata.ticker)      meta.push(`ticker: ${metadata.ticker}`);
  if (metadata.company)     meta.push(`company: "${metadata.company}"`);
  if (metadata.formType)    meta.push(`form_type: ${metadata.formType}`);
  if (metadata.filingDate)  meta.push(`filing_date: ${metadata.filingDate}`);
  if (metadata.source)      meta.push(`source: ${metadata.source}`);
  if (metadata.convertedAt) meta.push(`converted_at: ${metadata.convertedAt}`);
  if (metadata.layer)       meta.push(`layer: ${metadata.layer}`);

  const header = meta.length > 0 ? '---\n' + meta.join('\n') + '\n---\n\n' : '';
  return header + text;
}

// ── XBRL financial data extraction (Layer 3) ──────────────────────────────────

function extractXbrlData(html) {
  const data = {};

  // iXBRL inline tags: <ix:nonfraction name="us-gaap:Revenues" ...>12345</ix:nonfraction>
  for (const m of (html || '').matchAll(
    /<ix:non(?:fraction|numeric)[^>]+name="([^"]+)"[^>]*contextref="([^"]*)"[^>]*>([\s\S]*?)<\/ix:non(?:fraction|numeric)>/gi
  )) {
    const concept = m[1];
    const context = m[2];
    const rawVal  = m[3].replace(/<[^>]+>/g, '').replace(/,/g, '').trim();
    const val     = parseFloat(rawVal);
    if (!isNaN(val) && !data[concept]) {
      data[concept] = { value: val, context };
    }
  }

  // Namespace-qualified tags: <us-gaap:Revenues contextRef="...">12345</us-gaap:Revenues>
  for (const m of (html || '').matchAll(
    /<(us-gaap|dei|ifrs-full):(\w+)\s[^>]*contextRef="([^"]*)"[^>]*>([\s\S]*?)<\/(?:us-gaap|dei|ifrs-full):\w+>/gi
  )) {
    const concept = `${m[1]}:${m[2]}`;
    const context = m[3];
    const rawVal  = m[4].replace(/<[^>]+>/g, '').replace(/,/g, '').trim();
    const val     = parseFloat(rawVal);
    if (!isNaN(val) && !data[concept]) {
      data[concept] = { value: val, context };
    }
  }

  return Object.keys(data).length > 0 ? data : null;
}

// ── Section extraction (Layer 2) ──────────────────────────────────────────────

function extractSection(markdown, startPatterns, endPatterns) {
  const lines = markdown.split('\n');
  let inSection = false;
  const captured = [];

  for (const line of lines) {
    if (!inSection) {
      if (startPatterns.some(p => p.test(line))) {
        inSection = true;
        captured.push(line);
      }
      continue;
    }
    if (endPatterns.some(p => p.test(line))) break;
    captured.push(line);
  }

  return captured.join('\n').trim();
}

function extractSections(markdown, formType) {
  // End patterns: next major item heading or top-level heading
  const nextItem = [
    /^#{1,3}\s+Item\s+[2-9]/i,
    /^#{1,3}\s+Item\s+1[^A\s]/i,
    /^#{1,3}\s+Part\s+[IV]+/i,
    /^#\s+[A-Z]/,
  ];

  const sections = {};

  if (formType === '10-K' || formType === '10-Q') {
    sections.mda = extractSection(markdown, [
      /^#{1,3}\s+.*management.{0,10}s?\s+discussion/i,
      /^#{1,3}\s+Item\s+2\.?\s*management/i,
      /^#{1,3}\s+Item\s+2\b/i,
    ], nextItem);
  }

  if (formType === '10-K') {
    sections.business = extractSection(markdown, [
      /^#{1,3}\s+Item\s+1\.?\s*business/i,
      /^#{1,3}\s+Item\s+1\b(?!A)/i,
      /^#{1,3}\s+Business\b/i,
    ], nextItem);

    sections.risks = extractSection(markdown, [
      /^#{1,3}\s+.*risk\s+factors/i,
      /^#{1,3}\s+Item\s+1A/i,
    ], nextItem);
  }

  return sections;
}

// ── Exhibit fetching for 8-K (Layer 2) ───────────────────────────────────────

async function fetchExhibitUrl(shortCik, accNoForUrl, accessionNumber) {
  // Parse the EDGAR filing index page to locate EX-99.1 document
  const indexUrl = `https://www.sec.gov/Archives/edgar/data/${shortCik}/${accNoForUrl}/${accessionNumber}-index.htm`;

  let indexHtml;
  try {
    await sleep(RATE_LIMIT_MS);
    indexHtml = await fetchFilingHTML(indexUrl);
  } catch {
    return null;
  }

  // Table rows in the filing index contain columns: Seq | Description | Document | Type | Size
  for (const rowMatch of indexHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = rowMatch[1];
    if (!/EX-99\.1/i.test(row)) continue;
    const hrefMatch = row.match(/href="([^"]+\.(?:htm|html|txt)[^"]*)"/i);
    if (hrefMatch) {
      const href = hrefMatch[1];
      return href.startsWith('http') ? href : `https://www.sec.gov${href}`;
    }
  }
  return null;
}

// ── Store filing — three-layer pipeline ──────────────────────────────────────

async function storeFiling(ticker, slug, type, filingUrl, filingDate, shortCik, accNoForUrl, accessionNumber) {
  const dir     = path.join(RESEARCH_DIR, slug);
  const archDir = path.join(dir, 'archive');
  if (!fs.existsSync(dir))     fs.mkdirSync(dir,     { recursive: true });
  if (!fs.existsSync(archDir)) fs.mkdirSync(archDir, { recursive: true });

  const safeDate   = (filingDate || TODAY).replace(/-/g, '-');
  const baseName   = `${type}-${safeDate}`;
  const mdPath     = path.join(dir, `${baseName}.md`);
  const htmlPath   = path.join(archDir, `${baseName}.html`);

  // Existence check on Layer 1 — if the .md is already there, skip entirely
  if (fs.existsSync(mdPath) && !FORCE) {
    log(`  [${ticker}] ${baseName}.md exists — skipping`);
    return;
  }

  // Fetch HTML
  let html;
  try {
    html = await fetchFilingHTML(filingUrl);
  } catch (e) {
    log(`  [${ticker}] ${type} ${safeDate} FETCH FAILED: ${e.message}`);
    return;
  }

  const now = new Date().toISOString();
  const meta = { ticker, formType: type, filingDate: safeDate, source: filingUrl, convertedAt: now };

  // Archive original HTML
  try {
    fs.writeFileSync(htmlPath, html);
  } catch (e) {
    log(`  [${ticker}] archive write failed: ${e.message}`);
  }

  // ── Layer 1: full clean markdown ──────────────────────────────────────────
  const markdown = htmlToMarkdown(html, { ...meta, layer: 1 });
  fs.writeFileSync(mdPath, markdown);
  log(`  [${ticker}] ${baseName}.md written (${(markdown.length / 1024).toFixed(0)}KB)`);

  // ── Layer 3: XBRL structured data ─────────────────────────────────────────
  const xbrlData = extractXbrlData(html);
  if (xbrlData) {
    const xbrlPath = path.join(dir, `${baseName}-xbrl.json`);
    fs.writeFileSync(xbrlPath, JSON.stringify({ ticker, formType: type, filingDate: safeDate,
      extractedAt: now, concepts: xbrlData }, null, 2));
    log(`  [${ticker}] ${baseName}-xbrl.json written (${Object.keys(xbrlData).length} concepts)`);
  }

  // ── Layer 2: key section extraction ───────────────────────────────────────
  if (type === '8-K' && shortCik && accNoForUrl && accessionNumber) {
    // Fetch EX-99.1 press release exhibit
    try {
      const exhibitUrl = await fetchExhibitUrl(shortCik, accNoForUrl, accessionNumber);
      if (exhibitUrl) {
        await sleep(RATE_LIMIT_MS);
        const exhibitHtml = await fetchFilingHTML(exhibitUrl);
        const exhibitMd   = htmlToMarkdown(exhibitHtml, {
          ...meta, layer: 2, source: exhibitUrl,
        });
        const exhibitPath = path.join(dir, `${baseName}-exhibit.md`);
        fs.writeFileSync(exhibitPath, exhibitMd);
        log(`  [${ticker}] ${baseName}-exhibit.md written (EX-99.1, ${(exhibitMd.length / 1024).toFixed(0)}KB)`);
      } else {
        log(`  [${ticker}] ${baseName} — no EX-99.1 exhibit found`);
      }
    } catch (e) {
      log(`  [${ticker}] ${baseName} exhibit fetch failed: ${e.message}`);
    }
  } else if (type === '10-K' || type === '10-Q') {
    const sectionMeta = { ...meta, layer: 2 };
    const sections = extractSections(markdown, type);

    for (const [key, content] of Object.entries(sections)) {
      if (!content || content.length < 200) continue; // skip trivially short extractions
      const sectionPath = path.join(dir, `${baseName}-${key}.md`);
      const sectionFull = `---\nticker: ${ticker}\nform_type: ${type}\nfiling_date: ${safeDate}\nsection: ${key}\nlayer: 2\nextracted_at: ${now}\n---\n\n${content}`;
      fs.writeFileSync(sectionPath, sectionFull);
      log(`  [${ticker}] ${baseName}-${key}.md written (${(content.length / 1024).toFixed(0)}KB)`);
    }
  }
}

// ── EDGAR REST API ────────────────────────────────────────────────────────────

async function edgarGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'DYOR HQ Research/1.0 hugh.mcgauran@gmail.com',
        'Accept':     'application/json',
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('EDGAR JSON parse error')); }
        } else if (res.statusCode === 429) {
          reject(new Error('EDGAR_RATE_LIMIT'));
        } else if (res.statusCode === 404) {
          reject(new Error('EDGAR_NOT_FOUND'));
        } else {
          reject(new Error(`EDGAR ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('EDGAR_TIMEOUT')); });
  });
}

// ── CIK cache ────────────────────────────────────────────────────────────────

let cikCache = null;

async function getCIK(ticker) {
  if (cikCache === null) {
    const cacheFile = path.join(ROOT, 'state', 'sec-company-tickers.json');
    cikCache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  }
  return cikCache[ticker.toUpperCase()] || null;
}

// ── Fetch all filings for a CIK ───────────────────────────────────────────────
// Returns: [{ url, date, shortCik, accNoForUrl, accessionNumber }]
async function getFilingsForCIK(cik, type, count) {
  const safeUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const data    = await edgarGet(safeUrl);

  let allFilings = [];
  const recent   = data.filings?.recent;
  const files    = data.filings?.files || [];

  const pushFilings = (src, source) => {
    const forms   = src?.form            || [];
    const dates   = src?.filingDate      || [];
    const accNos  = src?.accessionNumber || [];
    const priDocs = src?.primaryDocument || [];
    for (let i = 0; i < forms.length; i++) {
      allFilings.push({ form: forms[i], filingDate: dates[i],
        accessionNumber: accNos[i], primaryDocument: priDocs[i], source });
    }
  };

  pushFilings(recent, 'recent');

  for (const fileInfo of files) {
    const fileUrl = `https://data.sec.gov/${fileInfo.name}`;
    try {
      const subData = await edgarGet(fileUrl);
      pushFilings(subData.filings?.recent, fileInfo.name);
      await sleep(RATE_LIMIT_MS);
    } catch (e) {
      log(`  [EDGAR] Could not fetch ${fileInfo.name}: ${e.message}`);
    }
  }

  allFilings.sort((a, b) => (b.filingDate || '').localeCompare(a.filingDate || ''));

  const matches = allFilings
    .filter(f => f.form === type && f.accessionNumber && f.filingDate)
    .slice(0, count);

  return matches.map(f => {
    const shortCik    = cik.replace(/^0+/, '') || cik;
    const accNoForUrl = (f.accessionNumber || '').replace(/-/g, '');
    const doc         = f.primaryDocument || `${f.accessionNumber}-index.htm`;
    const htmlUrl     = `https://www.sec.gov/Archives/edgar/data/${shortCik}/${accNoForUrl}/${doc}`;
    return {
      url:             htmlUrl,
      date:            f.filingDate,
      shortCik,
      accNoForUrl,
      accessionNumber: f.accessionNumber, // with dashes — used for index URL
    };
  });
}

// ── Fetch HTML filing content ─────────────────────────────────────────────────

async function fetchFilingHTML(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'DYOR HQ Research/1.0 hugh.mcgauran@gmail.com',
        'Accept':     'text/html',
      }
    }, res => {
      if (res.statusCode === 403 || res.statusCode === 429) {
        reject(new Error('FILING_RATE_LIMIT')); return;
      }
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchFilingHTML(res.headers.location).then(resolve).catch(reject); return;
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 200) resolve(data);
        else reject(new Error(`FILING_HTTP_${res.statusCode}`));
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('FILING_TIMEOUT')); });
  });
}

// ── Process one ticker ────────────────────────────────────────────────────────

async function processTicker(ticker, exchange, slug) {
  const upperTicker = ticker.toUpperCase();
  const cik = await getCIK(upperTicker);
  if (!cik) {
    log(`  [${ticker}] CIK not found — skipping`);
    return { ticker, done: false, reason: 'CIK not found' };
  }

  if (!exchange || !US_EXCHANGES.has(exchange)) {
    log(`  [${ticker}] no US exchange field (${exchange || '?'}), processing via CIK`);
  }

  const results = {};
  for (const type of TYPES) {
    try {
      const count    = type === '8-K' ? 3 : 1;
      const filings  = await getFilingsForCIK(cik, type, count);
      log(`  [${ticker}] ${type}: ${filings.length} filing(s) found (latest: ${filings[0]?.date || 'none'})`);

      for (const filing of filings) {
        await storeFiling(
          ticker, slug, type,
          filing.url, filing.date,
          filing.shortCik, filing.accNoForUrl, filing.accessionNumber,
        );
        await sleep(RATE_LIMIT_MS);
      }
      results[type] = { fetched: filings.length };
    } catch (e) {
      results[type] = { error: e.message };
      log(`  [${ticker}] ${type} ERROR: ${e.message}`);
    }
  }

  return { ticker, done: true, results };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log(`=== batch-edgar-filings.js | types=${TYPES.join(',')} | limit=${LIMIT} | force=${FORCE} | ticker=${TICKER_FILTER || 'all'} ===`);
  log('Reading sheet snapshot...');

  const sheetEntries = fetchSheetMap();
  log(`  ${sheetEntries.length} tickers in snapshot`);

  const cp = checkpointRead();
  let processed = 0;

  for (const { ticker, company, slug, exchange } of sheetEntries) {
    if (processed >= LIMIT) break;
    if (TICKER_FILTER && ticker !== TICKER_FILTER) continue;

    if (cp.done[ticker] && !FORCE) {
      if (!TICKER_FILTER) log(`[${ticker}] already done, skip`);
      continue;
    }

    process.stdout.write(`[${ticker}] (${slug}) ... `);
    try {
      const result      = await processTicker(ticker, exchange, slug);
      cp.done[ticker]   = result;
      cp.last           = ticker;
      checkpointWrite(cp);
      processed++;
      process.stdout.write(result.done ? 'OK\n' : 'SKIP\n');
    } catch (e) {
      log(`FATAL ${ticker}: ${e.message}`);
      cp.done[ticker] = { ticker, done: false, reason: e.message };
      checkpointWrite(cp);
      processed++;
    }
    await sleep(RATE_LIMIT_MS);
  }

  log(`=== Finished | processed=${processed} ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
