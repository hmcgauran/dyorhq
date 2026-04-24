#!/usr/bin/env node
'use strict';

/**
 * pipeline-new-tickers.js
 *
 * Two modes:
 *
 * DEFAULT (new tickers):
 *   Compares state/sheet-latest.json against state/pipeline.json, finds tickers
 *   with incomplete stages, and runs them sequentially.
 *
 * REFRESH (scheduled):
 *   Re-runs research stages for all tickers where the last run is older
 *   than the configured age thresholds. Intended for cron/scheduled runs.
 *
 * Stages (in order):
 *   1. Create research directory
 *   2. Brave web research       → research/{slug}/brave-web-{date}.json
 *   3. EDGAR filings            → research/{slug}/{type}-{date}.md etc.  (US only)
 *   4. DuckDuckGo web research  → research/{slug}/duck-web-{date}.json
 *   5. Playwright article fetch → research/{slug}/playwright-{date}.json
 *   6. Grok sentiment           → research/{slug}/grok-{date}.json
 *   7. Paperclip research       → research/{slug}/paperclip-{date}.json (biotech/pharma only)
 *
 * After stage 6 all raw data is on disk. Run generate-report.js separately.
 *
 * State file: state/pipeline.json
 *
 * Usage:
 *   node scripts/pipeline-new-tickers.js                              # new/incomplete tickers only
 *   node scripts/pipeline-new-tickers.js --ticker=MP                  # single ticker
 *   node scripts/pipeline-new-tickers.js --dry-run                    # show what would run, no action
 *   node scripts/pipeline-new-tickers.js --stage=web                  # one stage only
 *   node scripts/pipeline-new-tickers.js --stage=edgar                # one stage only
 *   node scripts/pipeline-new-tickers.js --stage=duck                 # one stage only
 *   node scripts/pipeline-new-tickers.js --stage=playwright           # one stage only
 *   node scripts/pipeline-new-tickers.js --stage=grok                 # one stage only
 *   node scripts/pipeline-new-tickers.js --stage=paperclip            # one stage only
 *   node scripts/pipeline-new-tickers.js --refresh                    # refresh all (default: web=30d, edgar=90d)
 *   node scripts/pipeline-new-tickers.js --refresh --max-age-web=14 --max-age-edgar=60
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT          = path.resolve(__dirname, '..');
const RESEARCH_DIR  = path.join(ROOT, 'research');
const STATE_DIR     = path.join(ROOT, 'state');
const SNAPSHOT_FILE = path.join(STATE_DIR, 'sheet-latest.json');
const PIPELINE_FILE = path.join(STATE_DIR, 'pipeline.json');
const TODAY         = new Date().toISOString().slice(0, 10);

const args          = process.argv.slice(2);
const TICKER_FILTER = (args.find(a => a.startsWith('--ticker='))?.split('=')[1] || '').toUpperCase() || null;
const DRY_RUN       = args.includes('--dry-run');
const STAGE_FILTER  = args.find(a => a.startsWith('--stage='))?.split('=')[1] || null;
const REFRESH       = args.includes('--refresh');
const MAX_AGE_WEB   = parseInt(args.find(a => a.startsWith('--max-age-web='))?.split('=')[1]   || '30',  10);
const MAX_AGE_EDGAR = parseInt(args.find(a => a.startsWith('--max-age-edgar='))?.split('=')[1] || '90',  10);

function daysSince(dateStr) {
  if (!dateStr || dateStr === 'N/A' || dateStr === 'SKIP') return Infinity;
  return (Date.now() - new Date(dateStr).getTime()) / 86400000;
}

// Non-US exchange prefixes — EDGAR does not cover these
const NON_US_PREFIX_RE = /^(EPA|ASX|LON|LSE|FRA|CVE|BME|TSE|TSX|HKEX):/i;
function isEdgarEligible(rawTicker) {
  return !NON_US_PREFIX_RE.test(rawTicker || '');
}

const LIFE_SCIENCE_RE = /biotech|pharma|medical|healthcare|drug|clinical|genomic|bioscience|therapeutics|diagnostics/i;

// ── State helpers ─────────────────────────────────────────────────────────────
function loadPipeline() {
  try { return JSON.parse(fs.readFileSync(PIPELINE_FILE, 'utf8')); }
  catch { return {}; }
}

function savePipeline(state) {
  fs.writeFileSync(PIPELINE_FILE, JSON.stringify(state, null, 2));
}

// ── Stage: create research directory ─────────────────────────────────────────
function stageDirectory(ticker, slug) {
  const dir = path.join(RESEARCH_DIR, slug);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`  [${ticker}] Created research/${slug}/`);
  } else {
    console.log(`  [${ticker}] research/${slug}/ already exists`);
  }
  return true;
}

// ── Stage: Brave web research ─────────────────────────────────────────────────
function stageWebResearch(ticker) {
  console.log(`  [${ticker}] Running Brave web research...`);
  try {
    execSync(
      `node ${path.join(__dirname, 'batch-web-research.js')} --ticker=${ticker}`,
      { cwd: ROOT, encoding: 'utf8', stdio: 'inherit', timeout: 120000 }
    );
    return true;
  } catch (e) {
    console.error(`  [${ticker}] Brave web research failed: ${e.message}`);
    return false;
  }
}

// ── Stage: EDGAR filings ──────────────────────────────────────────────────────
function stageEdgar(ticker) {
  console.log(`  [${ticker}] Running EDGAR filings...`);
  try {
    execSync(
      `node ${path.join(__dirname, 'batch-edgar-filings.js')} --ticker=${ticker} --force`,
      { cwd: ROOT, encoding: 'utf8', stdio: 'inherit', timeout: 300000 }
    );
    return true;
  } catch (e) {
    console.error(`  [${ticker}] EDGAR failed: ${e.message}`);
    return false;
  }
}

// ── Stage: DuckDuckGo web research ────────────────────────────────────────────
function stageDuckResearch(ticker) {
  console.log(`  [${ticker}] Running DuckDuckGo research...`);
  try {
    execSync(
      `node ${path.join(__dirname, 'batch-duck-research.js')} --ticker=${ticker}`,
      { cwd: ROOT, encoding: 'utf8', stdio: 'inherit', timeout: 120000 }
    );
    return true;
  } catch (e) {
    console.error(`  [${ticker}] DuckDuckGo research failed: ${e.message}`);
    return false;
  }
}

// ── Stage: Playwright article fetch ──────────────────────────────────────────
// Returns 'no_playwright' if the package is not installed (non-fatal).
function stageArticleFetch(ticker) {
  console.log(`  [${ticker}] Running Playwright article fetch...`);
  try {
    execSync(
      `node ${path.join(__dirname, 'batch-playwright-fetch.js')} --ticker=${ticker}`,
      { cwd: ROOT, encoding: 'utf8', stdio: 'inherit', timeout: 180000 }
    );
    return true;
  } catch (e) {
    // Distinguish "playwright not installed" from a genuine fetch failure
    if (e.message?.includes('playwright not installed') ||
        e.message?.includes('@mozilla/readability')) {
      console.warn(`  [${ticker}] Playwright not installed — articleFetch stage skipped`);
      return 'no_playwright';
    }
    console.error(`  [${ticker}] Playwright fetch failed: ${e.message}`);
    return false;
  }
}

// ── Stage: Grok sentiment ─────────────────────────────────────────────────────
function stageGrok(ticker) {
  console.log(`  [${ticker}] Running Grok sentiment...`);
  try {
    execSync(
      `node ${path.join(__dirname, 'batch-grok-sentiment.js')} --ticker=${ticker}`,
      { cwd: ROOT, encoding: 'utf8', stdio: 'inherit', timeout: 60000 }
    );
    return true;
  } catch (e) {
    console.error(`  [${ticker}] Grok sentiment failed: ${e.message}`);
    return false;
  }
}

// ── Stage: Paperclip research (biotech/pharma only) ───────────────────────────
// Returns 'skip' if not a life sciences ticker, true on success, false on failure.
function stagePaperclip(ticker, slug, sector) {
  // Check sector field from snapshot
  if (!LIFE_SCIENCE_RE.test(sector || '')) {
    // Also check Grok key themes — Grok runs before Paperclip so cache may exist
    const dir = path.join(RESEARCH_DIR, slug);
    let grokThemes = '';
    if (fs.existsSync(dir)) {
      const grokFiles = fs.readdirSync(dir).filter(f => /^grok-.*\.json$/.test(f)).sort();
      if (grokFiles.length > 0) {
        try {
          const grok = JSON.parse(fs.readFileSync(path.join(dir, grokFiles.at(-1)), 'utf8'));
          grokThemes = (grok.keyThemes || grok.key_themes || []).join(' ');
        } catch {}
      }
    }
    if (!LIFE_SCIENCE_RE.test(grokThemes)) {
      console.log(`  [${ticker}] Not a life sciences ticker — Paperclip skipped`);
      return 'skip';
    }
  }
  console.log(`  [${ticker}] Running Paperclip research...`);
  try {
    execSync(
      `node ${path.join(__dirname, 'batch-paperclip-research.js')} --ticker=${ticker}`,
      { cwd: ROOT, encoding: 'utf8', stdio: 'inherit', timeout: 120000 }
    );
    return true;
  } catch (e) {
    console.error(`  [${ticker}] Paperclip research failed: ${e.message}`);
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(SNAPSHOT_FILE)) {
    console.error('state/sheet-latest.json not found. Run sync-sheet.js first.');
    process.exit(1);
  }

  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
  const pipeline = loadPipeline();

  console.log(`Sheet snapshot: ${snapshot.downloadedAt} (${snapshot.rowCount} tickers)`);
  console.log(`Pipeline state: ${Object.keys(pipeline).length} tickers tracked`);
  console.log('');

  if (REFRESH) {
    console.log(`Mode: REFRESH (web >${MAX_AGE_WEB}d, edgar >${MAX_AGE_EDGAR}d)`);
  } else {
    console.log('Mode: NEW TICKERS (incomplete stages only)');
  }
  console.log('');

  // Find tickers that need processing
  const toProcess = [];

  for (const entry of snapshot.tickers) {
    const ticker = (entry.ticker || '').toUpperCase();
    if (!ticker) continue;
    if (TICKER_FILTER && ticker !== TICKER_FILTER) continue;

    const slug          = entry.research_slug || entry.slug || ticker.toLowerCase().replace(/[^a-z0-9]/g, '');
    const sector        = entry.sector || '';
    const state         = pipeline[ticker] || {};
    const stages        = state.stages || {};
    const edgarEligible = isEdgarEligible(entry.ticker);

    let needsDirectory, needsWebResearch, needsEdgar, needsDuckWeb,
        needsArticleFetch, needsGrok, needsPaperclip;

    if (REFRESH) {
      const webAge          = daysSince(stages.webResearch);
      const edgarAge        = daysSince(stages.edgar);
      const duckAge         = daysSince(stages.duckWeb);
      const articleFetchAge = daysSince(stages.articleFetch);
      const grokAge         = daysSince(stages.grok);
      const paperclipAge    = daysSince(stages.paperclip);
      needsDirectory      = false;
      needsWebResearch    = (!STAGE_FILTER || STAGE_FILTER === 'web')        && webAge          > MAX_AGE_WEB;
      needsEdgar          = edgarEligible &&
                            (!STAGE_FILTER || STAGE_FILTER === 'edgar')      && edgarAge        > MAX_AGE_EDGAR;
      needsDuckWeb        = (!STAGE_FILTER || STAGE_FILTER === 'duck')       && duckAge         > MAX_AGE_WEB;
      needsArticleFetch   = stages.articleFetch !== 'N/A' &&
                            (!STAGE_FILTER || STAGE_FILTER === 'playwright') && articleFetchAge > MAX_AGE_WEB;
      needsGrok           = (!STAGE_FILTER || STAGE_FILTER === 'grok')       && grokAge         > MAX_AGE_WEB;
      needsPaperclip      = stages.paperclip !== 'SKIP' &&
                            (!STAGE_FILTER || STAGE_FILTER === 'paperclip')  && paperclipAge    > MAX_AGE_WEB;
    } else {
      needsDirectory      = (!STAGE_FILTER || STAGE_FILTER === 'directory')  && !stages.directory;
      needsWebResearch    = (!STAGE_FILTER || STAGE_FILTER === 'web')        && !stages.webResearch;
      needsEdgar          = edgarEligible &&
                            (!STAGE_FILTER || STAGE_FILTER === 'edgar')      && !stages.edgar;
      needsDuckWeb        = (!STAGE_FILTER || STAGE_FILTER === 'duck')       && !stages.duckWeb;
      needsArticleFetch   = stages.articleFetch !== 'N/A' &&
                            (!STAGE_FILTER || STAGE_FILTER === 'playwright') && !stages.articleFetch;
      needsGrok           = (!STAGE_FILTER || STAGE_FILTER === 'grok')       && !stages.grok;
      needsPaperclip      = stages.paperclip !== 'SKIP' &&
                            (!STAGE_FILTER || STAGE_FILTER === 'paperclip')  && !stages.paperclip;
    }

    if (needsDirectory || needsWebResearch || needsEdgar || needsDuckWeb ||
        needsArticleFetch || needsGrok || needsPaperclip) {
      toProcess.push({
        ticker, slug, company: entry.companyName, sector, edgarEligible,
        needsDirectory, needsWebResearch, needsEdgar, needsDuckWeb,
        needsArticleFetch, needsGrok, needsPaperclip,
      });
    }
  }

  if (toProcess.length === 0) {
    console.log('Nothing to process — all tickers are up to date.');
    return;
  }

  console.log(`Found ${toProcess.length} ticker(s) to process:`);
  for (const t of toProcess) {
    const pending = [
      t.needsDirectory     ? 'directory'    : null,
      t.needsWebResearch   ? 'webResearch'  : null,
      t.needsEdgar         ? 'edgar'        : null,
      t.needsDuckWeb       ? 'duckWeb'      : null,
      t.needsArticleFetch  ? 'articleFetch' : null,
      t.needsGrok          ? 'grok'         : null,
      t.needsPaperclip     ? 'paperclip'    : null,
    ].filter(Boolean).join(', ');
    console.log(`  ${t.ticker} (${t.slug}) — stages: ${pending}`);
  }
  console.log('');

  if (DRY_RUN) {
    console.log('Dry run — no actions taken.');
    return;
  }

  // Process each ticker sequentially
  for (const { ticker, slug, company, sector, edgarEligible,
               needsDirectory, needsWebResearch, needsEdgar,
               needsDuckWeb, needsArticleFetch, needsGrok, needsPaperclip } of toProcess) {
    console.log(`\n── ${ticker} (${company || slug}) ──`);

    if (!pipeline[ticker]) {
      pipeline[ticker] = {
        addedAt: TODAY, company, slug,
        stages: {
          directory:    null,
          webResearch:  null,
          edgar:        edgarEligible ? null : 'N/A',
          duckWeb:      null,
          articleFetch: null,
          grok:         null,
          paperclip:    null,
        },
      };
    }
    const stages = pipeline[ticker].stages;

    // Stage 1: directory
    if (needsDirectory) {
      const ok = stageDirectory(ticker, slug);
      if (ok) { stages.directory = TODAY; savePipeline(pipeline); }
    }

    // Stage 2: Brave web research
    if (needsWebResearch) {
      const ok = stageWebResearch(ticker);
      if (ok) { stages.webResearch = TODAY; savePipeline(pipeline); }
      else { console.error(`  [${ticker}] Skipping EDGAR due to web research failure`); continue; }
    }

    // Stage 3: EDGAR
    if (needsEdgar) {
      const ok = stageEdgar(ticker);
      if (ok) { stages.edgar = TODAY; savePipeline(pipeline); }
    }

    // Stage 4: DuckDuckGo web research
    if (needsDuckWeb) {
      const ok = stageDuckResearch(ticker);
      if (ok) { stages.duckWeb = TODAY; savePipeline(pipeline); }
    }

    // Stage 5: Playwright article fetch
    if (needsArticleFetch) {
      const result = stageArticleFetch(ticker);
      if (result === true)           { stages.articleFetch = TODAY;  savePipeline(pipeline); }
      else if (result === 'no_playwright') { stages.articleFetch = 'N/A'; savePipeline(pipeline); }
      // false = fetch failed — leave null so it can be retried; continue pipeline regardless
    }

    // Stage 6: Grok sentiment
    if (needsGrok) {
      const ok = stageGrok(ticker);
      if (ok) { stages.grok = TODAY; savePipeline(pipeline); }
    }

    // Stage 7: Paperclip (biotech/pharma only)
    if (needsPaperclip) {
      const result = stagePaperclip(ticker, slug, sector);
      if (result === 'skip')  { stages.paperclip = 'SKIP'; savePipeline(pipeline); }
      else if (result === true) { stages.paperclip = TODAY; savePipeline(pipeline); }
    }
  }

  console.log('\n── Pipeline complete ──');
  console.log(`Processed: ${toProcess.length} ticker(s)`);
  console.log('Next step: node scripts/generate-report.js --ticker=<TICKER>');
}

main();
