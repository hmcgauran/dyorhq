#!/usr/bin/env node
'use strict';

/**
 * store-rns-json.js
 * Priority R (RNS JSON fix) — single-RNS JSON storage script.
 *
 * Fetches full RNS announcement text via Playwright (pw-fetch.js),
 * scores materiality, and stores a structured JSON artefact:
 *
 *   research/{slug}/rns/YYYY-MM-DD-{title-slug}.json
 *
 * Fields:
 *   headline, body (full text), ticker, date, url,
 *   material_score (0-10), material_reason (rationale for score),
 *   keywords_matched (array), stored_at
 *
 * Usage:
 *   node scripts/store-rns-json.js "TICKER" "URL" "TITLE" [--score=N]
 *   node scripts/store-rns-json.js AVCT.L "https://..." "Q1 2026 Business Update"
 *
 * The score defaults to auto (keyword scoring). Override with --score=8.
 * Can be called by rns-watcher.js on new RNS, or run standalone for backfill.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { execFile: execFileSync } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFileSync);

const slugLib = require('../cron-scripts/lib/research-slug');
const ROOT = path.resolve(__dirname, '..');
const RESEARCH_DIR = path.join(ROOT, 'research');
const PW_FETCH = '/Users/hughmcgauran/.openclaw/workspace/cron-scripts/pw-fetch.js';

const args = process.argv.slice(2);
const TICKER = args[0];
const URL = args[1];
const TITLE = (args[2] || '').replace(/"/g, '');
const FORCE_SCORE = args.find(a => a.startsWith('--score='))?.split('=')[1];

if (!TICKER || !URL) {
  console.error('Usage: node scripts/store-rns-json.js "TICKER" "URL" "TITLE" [--score=N]');
  process.exit(1);
}

// ── Materiality scoring ─────────────────────────────────────────────────────
const TICKER_KEYWORDS = {
  'ALK.L': ['fid', 'final investment decision', 'financing', 'ara partners', 'binding', 'construction', 'fund', 'offtake', 'glencore', 'wates'],
  'AVCT.L': ['aacr', 'ava6103', 'ava6000', 'ava6207', 'faridoxorubicin', 'pre|cision', 'clinical', 'data', 'partnership', 'licence', 'placing', 'nasdaq', 'dual listing', 'acquisition'],
  'PXEN.L': ['poland', 'licence', 'san', 'dunajec', 'selva', 'viura', 'romeral', 'production', 'fund', 'gas', 'tennessee', 'development'],
  'MKA.L': ['dfc', 'financing', 'nasdaq', 'offtake', 'mkar', 'spac', 'crown', 'songwe', 'pulawy', 'construction', 'funding', 'strategic', 'rare earth', 'REE'],
};

const BROAD_CRITICAL = ['profit warning', 'trading halt', 'suspension', 'insolvent', 'administration', 'liquidation', 'merger', 'acquisition', 'takeover', 'delisting', 'bankruptcy'];
const BROAD_ALERT = ['fundraising', 'placing', 'open offer', 'rights issue', 'financing', 'joint venture', 'partnership', 'contract', 'award', 'approval', 'FDA', 'EMA', 'clinical trial', 'phase', 'data readout', 'capital raise', 'issue of shares'];

function scoreAnnouncement(ticker, title) {
  if (FORCE_SCORE !== undefined) {
    return { score: parseInt(FORCE_SCORE), hits: ['manual'], reason: `Manual score override: ${FORCE_SCORE}/10` };
  }
  const keywords = TICKER_KEYWORDS[ticker] || [];
  const lower = title.toLowerCase();
  const criticalHits = BROAD_CRITICAL.filter(k => lower.includes(k));
  const tickerHits = keywords.filter(k => lower.includes(k));
  const alertHits = BROAD_ALERT.filter(k => lower.includes(k));
  const score = criticalHits.length * 2 + tickerHits.length + alertHits.length * 0.5;
  const capped = Math.min(10, Math.max(0, Math.round(score)));
  const allHits = [...criticalHits, ...tickerHits, ...alertHits];
  const reason = allHits.length
    ? `Keywords matched: ${allHits.slice(0, 8).join(', ')}`
    : 'Routine — no critical keywords detected';
  return { score: capped, hits: allHits, reason };
}

function scoreToLabel(score) {
  if (score >= 8) return 'MATERIAL';
  if (score >= 5) return 'WATCH';
  if (score >= 3) return 'LOW';
  return 'ROUTINE';
}

// ── Fetch via Playwright ─────────────────────────────────────────────────────
async function fetchContent(url) {
  try {
    const { stdout } = await execFileAsync('node', [PW_FETCH, url], { timeout: 45000 });
    const result = JSON.parse(stdout);
    if (result.error) throw new Error(result.error);
    return (result.content || '').replace(/\s+/g, ' ').trim();
  } catch (e) {
    // Fallback: basic HTML strip
    return `[Full content unavailable — ${e.message}]`;
  }
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 80);
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const cleanTicker = TICKER.replace(/\.L$/i, ''); // strip .L for LSE tickers
  const slug = slugLib.researchSlug(cleanTicker);
  const rnsDir = path.join(RESEARCH_DIR, slug, 'rns');

  if (!fs.existsSync(rnsDir)) fs.mkdirSync(rnsDir, { recursive: true });

  // Deduplicate — don't refetch if we already have this URL today
  const today = new Date().toISOString().slice(0, 10);
  const rnsSlug = slugify(TITLE);
  const jsonPath = path.join(rnsDir, `${today}-${rnsSlug}.json`);

  // Check if already exists
  try {
    const existing = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (existing.body && existing.body.length > 100) {
      console.log(`Already exists: ${jsonPath}`);
      return;
    }
  } catch (e) { /* doesn't exist yet */ }

  console.log(`Fetching: ${TICKER} — ${TITLE}`);
  const [body, { score, hits, reason }] = await Promise.all([
    fetchContent(URL),
    Promise.resolve(scoreAnnouncement(TICKER, TITLE)),
  ]);

  const artifact = {
    ticker: TICKER,
    headline: TITLE,
    body,
    url: URL,
    date: new Date().toISOString(),
    material_score: score,
    material_label: scoreToLabel(score),
    material_reason: reason,
    keywords_matched: hits,
    stored_at: new Date().toISOString(),
  };

  fs.writeFileSync(jsonPath, JSON.stringify(artifact, null, 2));
  console.log(`Stored: ${jsonPath} (score=${score}/10, body=${body.length} chars)`);
}

main().catch(e => { console.error(e); process.exit(1); });
