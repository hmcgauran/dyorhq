#!/usr/bin/env node
'use strict';

/**
 * scripts/audit-research-dirs.js
 *
 * Audits research/ directories against the Google Sheet (source of truth).
 * The Sheet drives the correct slug via: LOWER(REGEXREPLACE(companyName,"[^A-Za-z0-9]+",""))
 *
 * Reports:
 *   OK        — directory exists and matches expected slug
 *   MISSING   — ticker is in the sheet but research/{slug}/ doesn't exist
 *   ORPHAN    — directory in research/ not matched to any sheet ticker
 *   MISMATCH  — a directory exists for this ticker but under the wrong name
 *               (detected by scanning web-*.json files inside dirs for ticker field)
 *
 * Usage:
 *   node scripts/audit-research-dirs.js              Dry run — report only
 *   node scripts/audit-research-dirs.js --fix        Rename mismatched dirs to correct slug
 *   node scripts/audit-research-dirs.js --ticker=MP  Audit a single ticker only
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT         = path.resolve(__dirname, '..');
const RESEARCH_DIR = path.join(ROOT, 'research');
const SHEET_ID     = '1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM';
const PREFIX_RE    = /^(NYSE|NASDAQ|EPA|ASX|LON|LSE |FRA|CVE|BME|TSE|TSX|HKEX):/i;
const FIX_MODE     = process.argv.includes('--fix');
const tickerArg    = process.argv.find(a => a.startsWith('--ticker='));
const SINGLE       = tickerArg ? tickerArg.split('=')[1].replace(PREFIX_RE, '').trim().toUpperCase() : null;

function bareTicker(t) {
  return (t || '').replace(PREFIX_RE, '').trim().toUpperCase();
}

// ── Read Google Sheet ─────────────────────────────────────────────────────────
function fetchSheetMap() {
  const raw = execSync(
    `gws sheets spreadsheets get --params '{"spreadsheetId": "${SHEET_ID}", "includeGridData": true}' --format json 2>/dev/null`,
    { maxBuffer: 80 * 1024 * 1024 }
  ).toString('utf8');

  const sheet   = JSON.parse(raw);
  const rowData = sheet?.sheets?.[0]?.data?.[0]?.rowData || [];
  const headers = (rowData[0]?.values || []).map(v => v?.formattedValue || '');

  const idxOf = (h) => headers.indexOf(h);
  const tickerIdx  = idxOf('Ticker') >= 0 ? idxOf('Ticker') : 0;
  const companyIdx = idxOf('companyName');
  const slugIdx    = idxOf('research_slug') >= 0 ? idxOf('research_slug') : idxOf('slug');

  const map = {};
  for (let i = 1; i < rowData.length; i++) {
    const vals   = rowData[i]?.values || [];
    const ticker = (vals[tickerIdx]?.formattedValue || '').trim();
    if (!ticker || ticker === 'Ticker') continue;

    const company = companyIdx >= 0 ? (vals[companyIdx]?.formattedValue || '').trim() : '';
    let   slug    = slugIdx    >= 0 ? (vals[slugIdx]?.formattedValue    || '').trim() : '';

    if (!slug && company) slug = company.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!slug)             slug = bareTicker(ticker).toLowerCase().replace(/[^a-z0-9]/g, '');

    const bare = bareTicker(ticker);
    map[bare] = { ticker, company: company || ticker, slug };
  }
  return map;
}

// ── Build a reverse map: dir name → ticker (from web-*.json contents) ─────────
function buildDirTickerMap() {
  const dirTickerMap = {};
  if (!fs.existsSync(RESEARCH_DIR)) return dirTickerMap;

  for (const dir of fs.readdirSync(RESEARCH_DIR)) {
    const dirPath = path.join(RESEARCH_DIR, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;

    // Skip template/special dirs
    if (['REPORT_TEMPLATE', 'TEMPLATE_DIR'].includes(dir)) continue;

    // Scan for a web-*.json to extract the ticker field
    const webFiles = fs.readdirSync(dirPath)
      .filter(f => /^web-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();

    if (webFiles.length > 0) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dirPath, webFiles.at(-1)), 'utf8'));
        const t = bareTicker(data.ticker || '');
        if (t) dirTickerMap[dir] = t;
      } catch {}
    }

    // Also try grok-*.json
    if (!dirTickerMap[dir]) {
      const grokFiles = fs.readdirSync(dirPath)
        .filter(f => /^grok-\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .sort();
      if (grokFiles.length > 0) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dirPath, grokFiles.at(-1)), 'utf8'));
          const t = bareTicker(data.ticker || '');
          if (t) dirTickerMap[dir] = t;
        } catch {}
      }
    }
  }
  return dirTickerMap;
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  console.log('Reading Google Sheet...');
  let sheetMap;
  try {
    sheetMap = fetchSheetMap();
  } catch (e) {
    console.error(`ERROR: Could not read Google Sheet: ${e.message}`);
    process.exit(1);
  }

  if (SINGLE) {
    const entry = sheetMap[SINGLE];
    if (!entry) { console.error(`${SINGLE} not found in sheet`); process.exit(1); }
    // Filter to just this ticker
    const filtered = {};
    filtered[SINGLE] = entry;
    Object.assign(sheetMap, {});
    Object.keys(sheetMap).forEach(k => { if (k !== SINGLE) delete sheetMap[k]; });
    sheetMap[SINGLE] = entry;
  }

  console.log(`  ${Object.keys(sheetMap).length} tickers in sheet`);
  console.log('Building directory→ticker map from existing research files...\n');

  const dirTickerMap   = buildDirTickerMap();
  const allDirs        = new Set(fs.existsSync(RESEARCH_DIR)
    ? fs.readdirSync(RESEARCH_DIR).filter(d => {
        const p = path.join(RESEARCH_DIR, d);
        return fs.statSync(p).isDirectory() && !['REPORT_TEMPLATE', 'TEMPLATE_DIR'].includes(d);
      })
    : []);

  const results = { ok: [], missing: [], mismatch: [], orphan: [] };

  // Check each sheet ticker
  for (const [bare, { ticker, company, slug }] of Object.entries(sheetMap)) {
    const expectedDir = slug;
    if (allDirs.has(expectedDir)) {
      results.ok.push({ bare, slug: expectedDir });
    } else {
      // Check if any existing dir contains files for this ticker
      const wrongDir = Object.entries(dirTickerMap).find(([, t]) => t === bare)?.[0];
      if (wrongDir) {
        results.mismatch.push({ bare, company, expectedSlug: expectedDir, actualDir: wrongDir });
      } else {
        results.missing.push({ bare, company, expectedSlug: expectedDir });
      }
    }
  }

  // Dirs not matched to any sheet ticker
  const accountedDirs = new Set([
    ...results.ok.map(r => r.slug),
    ...results.mismatch.map(r => r.actualDir),
  ]);
  for (const dir of allDirs) {
    if (!accountedDirs.has(dir)) {
      const ticker = dirTickerMap[dir] || null;
      results.orphan.push({ dir, ticker });
    }
  }

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log(`=== Audit Results ===`);
  console.log(`  OK       : ${results.ok.length}`);
  console.log(`  MISSING  : ${results.missing.length}  (in sheet, no research dir)`);
  console.log(`  MISMATCH : ${results.mismatch.length}  (dir exists under wrong name)`);
  console.log(`  ORPHAN   : ${results.orphan.length}  (dir exists, not in sheet)\n`);

  if (results.missing.length > 0) {
    console.log('MISSING (will be created on next web research run):');
    for (const { bare, company, expectedSlug } of results.missing) {
      console.log(`  ${bare.padEnd(12)} → research/${expectedSlug}/   (${company})`);
    }
    console.log('');
  }

  if (results.mismatch.length > 0) {
    console.log(`MISMATCH${FIX_MODE ? ' — renaming:' : ' (run --fix to rename)'}:`);
    for (const { bare, company, expectedSlug, actualDir } of results.mismatch) {
      console.log(`  ${bare.padEnd(12)} research/${actualDir}/ → research/${expectedSlug}/   (${company})`);
      if (FIX_MODE) {
        const src  = path.join(RESEARCH_DIR, actualDir);
        const dest = path.join(RESEARCH_DIR, expectedSlug);
        if (fs.existsSync(dest)) {
          console.log(`    WARNING: destination research/${expectedSlug}/ already exists — skipping rename`);
        } else {
          fs.renameSync(src, dest);
          console.log(`    RENAMED`);
        }
      }
    }
    console.log('');
  }

  if (results.orphan.length > 0) {
    console.log('ORPHAN (not in sheet — review manually):');
    for (const { dir, ticker } of results.orphan) {
      const note = ticker ? `(files reference ticker: ${ticker})` : '(no ticker reference found)';
      console.log(`  research/${dir}/  ${note}`);
    }
    console.log('');
  }

  if (!FIX_MODE && results.mismatch.length > 0) {
    console.log('Run with --fix to rename mismatched directories.');
  }

  if (FIX_MODE && results.mismatch.length > 0) {
    console.log('Rename complete. Run npm run build to rebuild the site.');
  }
}

main();
