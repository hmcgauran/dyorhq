#!/usr/bin/env node
'use strict';

/**
 * batch-grok-sentiment.js
 *
 * Runs xAI Grok sentiment analysis for a ticker.
 * Reads ticker info from state/sheet-latest.json (written by sync-sheet.js).
 * Reads available research files (brave-web, duck-web) for context.
 *
 * Cache behaviour: if research/{slug}/grok-{today}.json already exists, skips
 * the API call and exits cleanly — safe to call from pipeline-new-tickers.js.
 *
 * Output:   research/{slug}/grok-YYYY-MM-DD.json
 * Failures: state/sentiment-failures.jsonl
 *
 * Env vars:
 *   XAI_API_KEY   (required)
 *   XAI_MODEL     (optional, default: grok-3-latest)
 *
 * Usage:
 *   node scripts/batch-grok-sentiment.js --ticker=MP
 *   node scripts/batch-grok-sentiment.js --ticker=MP --force
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT          = path.resolve(__dirname, '..');
const RESEARCH_DIR  = path.join(ROOT, 'research');
const SNAPSHOT_FILE = path.join(ROOT, 'state', 'sheet-latest.json');
const FAILURES_FILE = path.join(ROOT, 'state', 'sentiment-failures.jsonl');
const TODAY         = new Date().toISOString().slice(0, 10);
const XAI_API_KEY   = process.env.XAI_API_KEY;
const XAI_MODEL     = process.env.XAI_MODEL || 'grok-3-latest';

const PREFIX_RE = /^(NYSE|NASDAQ|EPA|ASX|LON|LSE |FRA|CVE|BME|TSE|TSX|HKEX):/i;

const args          = process.argv.slice(2);
const TICKER_FILTER = (args.find(a => a.startsWith('--ticker='))?.split('=')[1] || '').toUpperCase() || null;
const FORCE         = args.includes('--force');

function bareTicker(t) { return (t || '').replace(PREFIX_RE, '').trim().toUpperCase(); }

function logFailure(ticker, reason) {
  const entry = { ts: new Date().toISOString(), ticker, reason };
  try { fs.writeFileSync(FAILURES_FILE, JSON.stringify(entry) + '\n', { flag: 'a' }); } catch {}
  console.error(`  [${ticker}] FAILED: ${reason}`);
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
    return {
      bare, company, slug,
      sector: entry.sector || '',
      price:  entry.price  || null,
      pe:     entry.pe     || null,
    };
  }
  return null;
}

// ── Load research context from disk ──────────────────────────────────────────
// Priority:
//   1. Playwright full-article text (richest — up to 5 articles, ~200 words each)
//   2. Brave / DuckDuckGo snippets (used as supplement, or fallback if no playwright)
function loadResearchContext(slug) {
  const dir = path.join(RESEARCH_DIR, slug);
  if (!fs.existsSync(dir)) return '';

  const files = fs.readdirSync(dir).sort().reverse();
  const parts = [];

  // Playwright full articles
  const playwrightFile = files.find(f => /^playwright-.*\.json$/.test(f));
  if (playwrightFile) {
    try {
      const data     = JSON.parse(fs.readFileSync(path.join(dir, playwrightFile), 'utf8'));
      const articles = (data.articles || []).slice(0, 5);
      for (const art of articles) {
        if (!art.text || art.text.length < 100) continue;
        const header  = `=== ${art.title || art.url} (${art.domain || ''}) ===`;
        const snippet = art.text.slice(0, 1200);
        parts.push(`${header}\n${snippet}`);
      }
    } catch {}
  }

  // Search snippets — supplement regardless of whether playwright ran
  const snippets = [];
  for (const prefix of ['brave-web', 'duck-web']) {
    const file = files.find(f => f.startsWith(prefix) && f.endsWith('.json'));
    if (!file) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      for (const q of (data.queries || [])) {
        for (const hit of (q.hits || []).slice(0, 2)) {
          if (hit.title || hit.snippet) {
            snippets.push(`${hit.title || ''}: ${hit.snippet || ''}`.slice(0, 200));
          }
        }
      }
    } catch {}
  }
  if (snippets.length > 0) {
    parts.push('=== Search result snippets ===\n' + snippets.slice(0, 15).join('\n'));
  }

  return parts.join('\n\n');
}

// ── xAI API call ──────────────────────────────────────────────────────────────
async function callGrok(bare, company, sector, price, pe, context) {
  const prompt = [
    `You are a financial analyst providing a structured sentiment assessment for ${bare} (${company}).`,
    `Sector: ${sector || 'Unknown'}`,
    `Current price: ${price != null ? `$${price}` : 'Unknown'}`,
    `P/E ratio: ${pe != null ? pe : 'Unknown'}`,
    '',
    'Recent news and research context:',
    context || 'No recent context available.',
    '',
    'Provide a structured sentiment assessment with these exact fields:',
    '  score      — integer from -100 (extremely bearish) to +100 (extremely bullish)',
    '  signal     — one of: STRONG_BUY, BUY, NEUTRAL, SELL, STRONG_SELL',
    '  keyThemes  — array of 3–5 key themes or catalysts driving your assessment',
    '  summary    — 2–3 sentence summary of investment thesis and current sentiment',
    '',
    'Respond in valid JSON only with exactly these four fields.',
  ].join('\n');

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: XAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500,
    });

    const req = https.request({
      hostname: 'api.x.ai',
      path:     '/v1/chat/completions',
      method:   'POST',
      headers: {
        'Authorization': `Bearer ${XAI_API_KEY}`,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const resp    = JSON.parse(data);
            const content = resp.choices?.[0]?.message?.content || '';
            const match   = content.match(/\{[\s\S]*\}/);
            if (!match) throw new Error('No JSON object in response');
            resolve(JSON.parse(match[0]));
          } catch (e) {
            reject(new Error(`Parse error: ${e.message}`));
          }
        } else if (res.statusCode === 429) {
          reject(new Error('XAI_RATE_LIMIT'));
        } else {
          reject(new Error(`xAI HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('XAI_TIMEOUT')); });
    req.write(body);
    req.end();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!XAI_API_KEY) {
    console.error('ERROR: XAI_API_KEY not set in .env');
    process.exit(1);
  }
  if (!TICKER_FILTER) {
    console.error('ERROR: --ticker=TICKER required');
    process.exit(1);
  }

  console.log(`=== batch-grok-sentiment.js | ticker=${TICKER_FILTER} | model=${XAI_MODEL} ===`);

  const entry = loadEntry(TICKER_FILTER);
  if (!entry) {
    console.error(`ERROR: ${TICKER_FILTER} not found in snapshot`);
    process.exit(1);
  }

  const { bare, company, slug, sector, price, pe } = entry;
  const dir = path.join(RESEARCH_DIR, slug);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const outFile = path.join(dir, `grok-${TODAY}.json`);
  if (fs.existsSync(outFile) && !FORCE) {
    console.log(`  [${bare}] grok-${TODAY}.json already exists — skipping`);
    return;
  }

  const context = loadResearchContext(slug);
  console.log(`  [${bare}] Calling xAI (${XAI_MODEL})...`);

  try {
    const result = await callGrok(bare, company, sector, price, pe, context);

    if (typeof result.score !== 'number' || !result.signal || !result.summary) {
      throw new Error('Response missing required fields (score, signal, summary)');
    }

    const artifact = {
      ticker:     bare,
      company,
      slug,
      date:       TODAY,
      model:      XAI_MODEL,
      score:      Math.max(-100, Math.min(100, Math.round(result.score))),
      signal:     result.signal,
      keyThemes:  Array.isArray(result.keyThemes) ? result.keyThemes : [],
      summary:    result.summary,
      gatheredAt: new Date().toISOString(),
    };

    fs.writeFileSync(outFile, JSON.stringify(artifact, null, 2));
    console.log(`  [${bare}] score=${artifact.score} signal=${artifact.signal} → grok-${TODAY}.json`);
  } catch (e) {
    logFailure(bare, e.message);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
