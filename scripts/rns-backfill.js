#!/usr/bin/env node
/**
 * RNS Backfill + Storage Script
 * Reads RNS watcher log and alert history, maps tickers to research slugs,
 * fetches RNS content from Investegate, stores analysis in research/{slug}/rns/.
 *
 * Usage: node rns-backfill.js [--dry-run] [--ticker TICKER]
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const RESEARCH_DIR = path.join(__dirname, '../research');
const RNS_LOG = '/Users/hughmcgauran/.openclaw/workspace/state/rns-watcher.jsonl';
const ALERT_LOG = '/Users/hughmcgauran/.openclaw/workspace/state/delivered-telegram-alerts.jsonl';
const SHEET_ID = '1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM';

// Material RNS types that warrant a full analysis
const MATERIAL_TYPES = new Set([
  'fundraise', 'placing', 'oversubscribed', 'raise', 'capital raise',
  'results', 'final results', 'interim results', 'annual results',
  'pfs', 'feasibility', 'resource', 'reserve',
  'acquisition', 'disposal', 'takeover', 'merger',
  'partnership', 'collaboration', 'deal',
  'regulatory', 'approval', 'fda', 'mhra', 'nasdaq',
  'trading update', 'trading statement', 'revenue', 'production',
  'strategic', 'review', 'outcome',
  'podcast', 'investor day', 'capital markets',
  'contract', 'order', 'award',
  'board', 'ceo', 'cfo', 'director change', 'appointment',
  'restate', 'profit warning', 'revised',
  'cybersecurity', 'incident',
]);

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpGet(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function extractBodyText(html) {
  // Remove scripts, styles
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  // Get main content area
  const match = text.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                text.match(/<div class="article-body"[^>]*>([\s\S]*?)<\/div>/i) ||
                text.match(/<div class="release-content"[^>]*>([\s\S]*?)<\/div>/i);
  if (match) text = match[1];
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Decode entities
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
             .replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
             .replace(/&#x27;/g, "'").replace(/&#[0-9]+;/g, (m) => String.fromCharCode(m.slice(2,-1)));
  // Clean whitespace
  text = text.replace(/[\r\n]+/g, '\n').replace(/[ \t]+/g, ' ');
  text = text.trim();
  return text;
}

function isMaterial(title, body) {
  const combined = (title + ' ' + body).toLowerCase();
  for (const kw of MATERIAL_TYPES) {
    if (combined.includes(kw)) return true;
  }
  return false;
}

function scoreAnnouncement(title, body) {
  let score = 0;
  const text = (title + ' ' + body).toLowerCase();
  const triggers = [
    ['fundraise, placing, oversubscribed, capital raise', 10],
    ['pfs, feasibility study, resource estimate, reserve', 10],
    ['results, annual report, trading update', 8],
    ['acquisition, disposal, takeover, merger', 10],
    ['partnership, collaboration, deal with, strategic', 8],
    ['fda, mhra, regulatory, approval', 10],
    ['cybersecurity incident, breach', 10],
    ['profit warning, revised guidance, restate', 10],
    ['board change, ceo, cfo, appointment', 5],
    ['contract, award, order', 6],
    ['podcast, investor day, capital markets event', 7],
  ];
  for (const [keywordStr, pts] of triggers) {
    const kws = keywordStr.split(',').map(k => k.trim());
    if (kws.some(kw => text.includes(kw))) score = Math.max(score, pts);
  }
  return score;
}

function slugFromTicker(ticker, slugMap) {
  if (slugMap[ticker]) return slugMap[ticker];
  // Normalize: LON:AVCT -> AVCT, AVCT.L -> AVCT
  const bare = ticker.replace(/^[A-Z]+:/, '').replace(/\.L$/, '').replace(/\.[A-Z]{1,3}$/, '');
  if (slugMap[bare]) return slugMap[bare];
  if (slugMap['LON:' + bare]) return slugMap['LON:' + bare];
  // Partial match on bare ticker
  for (const [k, v] of Object.entries(slugMap)) {
    const kb = k.replace(/^[A-Z]+:/, '');
    if (kb === bare || bare === kb) return v;
  }
  return null;
}

function filenameFromTitle(title, date) {
  const d = new Date(date);
  const dateStr = d.toISOString().split('T')[0];
  const slug = title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 60);
  return `${dateStr}-${slug}.md`;
}

async function fetchRnsContent(url) {
  try {
    const html = await httpGet(url);
    return extractBodyText(html);
  } catch (e) {
    return null;
  }
}

function generateRnsAnalysis(ticker, title, date, url, body, score) {
  const lines = [
    `# ${title}`,
    '',
    `**Ticker:** ${ticker}`,
    `**Date:** ${date}`,
    `**URL:** ${url}`,
    `**Material score:** ${score}/10`,
    '',
    '---',
    '',
    '## RNS Summary',
    body ? body.substring(0, 2000) : '(Content unavailable)',
    '',
  ];

  if (body && body.length > 2000) {
    lines.push('## Key Points');
    lines.push(body.substring(2000, 4000));
    lines.push('');
  }

  lines.push('## Assessment');
  if (score >= 8) {
    lines.push('**MATERIAL** — This announcement is likely to have a significant impact on the share price.');
  } else if (score >= 5) {
    lines.push('**WATCH** — This announcement is moderately material. Monitor for market reaction.');
  } else {
    lines.push('**LOW MATERIALITY** — Routine announcement. No significant thesis impact expected.');
  }
  lines.push('');

  lines.push('## Investment Impact');
  lines.push('_Analysis to be completed._');
  lines.push('');
  lines.push('---');
  lines.push(`*RNS stored: ${new Date().toISOString()}*`);

  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const tickerFilter = args[args.indexOf('--ticker') + 1] || null;

  console.error('Loading ticker→slug map from Google Sheet...');
  // Load slug map
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);

  let sheetData;
  try {
    const { stdout } = await execFileAsync('gws', [
      'sheets', 'spreadsheets', 'values', 'get', '--params',
      JSON.stringify({ spreadsheetId: SHEET_ID, range: 'Sheet1!A:ZZ', valueRenderOption: 'FORMATTED_VALUE' })
    ]);
    sheetData = JSON.parse(stdout);
  } catch (e) {
    console.error('Failed to load sheet:', e.message);
    // Fallback: build from research dirs
    const dirs = fs.readdirSync(RESEARCH_DIR).filter(d =>
      fs.statSync(path.join(RESEARCH_DIR, d)).isDirectory()
    );
    const slugMap = {};
    dirs.forEach(d => { slugMap[d] = d; });
    return processLog(slugMap);
  }

  const rows = (sheetData.values || []);
  const headers = (rows[0] || []).map((h, i) => ({ h: String(h || '').trim(), i }));
  const tickerIdx = headers.find(x => x.h === 'Ticker')?.i;
  const slugIdx = headers.find(x => x.h === 'slug')?.i;
  const rsIdx = headers.find(x => x.h === 'research_slug')?.i;

  const slugMap = {};
  rows.slice(1).forEach(row => {
    const t = row[tickerIdx];
    const s = row[rsIdx] || row[slugIdx];
    if (t && s) slugMap[t] = s;
  });
  // Normalize: also add bare tickers
  Object.entries(slugMap).forEach(([k, v]) => {
    const bare = k.replace(/^[A-Z]+:/, '');
    if (!slugMap[bare]) slugMap[bare] = v;
  });

  await processLog(slugMap);
}

async function processLog(slugMap) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const tickerFilter = args[args.indexOf('--ticker') + 1] || null;

  if (!fs.existsSync(RNS_LOG)) {
    console.error('RNS log not found:', RNS_LOG);
    return;
  }

  const lines = fs.readFileSync(RNS_LOG, 'utf8').trim().split('\n');
  console.error(`Processing ${lines.length} RNS entries...`);

  // Deduplicate by ticker+title
  const seen = new Set();
  const entries = [];

  for (const line of lines) {
    try {
      const j = JSON.parse(line);
      const ticker = j.ticker || '';
      const title = j.title || '';
      const url = j.url || '';
      const ts = j.timestamp || '';
      if (!ticker || !title) continue;
      const key = `${ticker}|${title.substring(0, 50)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ ticker, title, url, ts });
    } catch (e) {}
  }

  console.error(`Unique entries: ${entries.length}`);

  // Debug: check first few entries
  for (let i = 0; i < Math.min(3, entries.length); i++) {
    const entry = entries[i];
    const slug = slugFromTicker(entry.ticker, slugMap);
    console.error(`DEBUG[${i}]: ticker=${entry.ticker} slug=${slug} dir=${slug ? fs.existsSync(path.join(RESEARCH_DIR, slug)) : 'n/a'}`);
  }

  // Filter to those with research dirs and material
  const results = [];
  for (const entry of entries) {
    // Ticker filter supports both formats: LON:AVCT or AVCT.L
    if (tickerFilter) {
      const normal = (t) => t.replace(/^[A-Z]+:/, '').replace(/\.L$/, '').replace(/\.[A-Z]{1,3}$/, '');
      if (normal(entry.ticker) !== normal(tickerFilter)) continue;
    }
    const slug = slugFromTicker(entry.ticker, slugMap);
    if (!slug) continue;
    const researchPath = path.join(RESEARCH_DIR, slug);
    if (!fs.existsSync(researchPath)) continue;

    // Fetch RNS content for scoring
    let body = '';
    if (entry.url) {
      process.stderr.write(`Fetching ${entry.ticker} ${entry.ts.substring(0,10)}...`);
      body = await fetchRnsContent(entry.url);
      process.stderr.write(` got ${body.length} chars\n`);
    }

    const score = scoreAnnouncement(entry.title, body);
    if (score < 5 && !args.includes('--all')) continue;

    const rnsDir = path.join(researchPath, 'rns');
    if (!fs.existsSync(rnsDir)) fs.mkdirSync(rnsDir, { recursive: true });

    const filename = filenameFromTitle(entry.title, entry.ts);
    const filepath = path.join(rnsDir, filename);

    if (!dryRun && !fs.existsSync(filepath)) {
      const content = generateRnsAnalysis(entry.ticker, entry.title, entry.ts, entry.url, body, score);
      fs.writeFileSync(filepath, content, 'utf8');
    }

    results.push({ ticker: entry.ticker, slug, title: entry.title, score, stored: !dryRun && fs.existsSync(filepath) });
  }

  // Summary
  const bySlug = {};
  results.forEach(r => {
    if (!bySlug[r.slug]) bySlug[r.slug] = [];
    bySlug[r.slug].push(r);
  });
  console.error('\nSummary:');
  Object.entries(bySlug).forEach(([slug, items]) => {
    console.error(` ${slug}: ${items.length} RNS (scores: ${items.map(i=>i.score).join(', ')})`);
  });

  console.error(`\nTotal: ${results.length} RNS processed. ${dryRun ? '(dry-run)' : ''}`);
}

main().catch(e => { console.error(e); process.exit(1); });
