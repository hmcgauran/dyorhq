#!/usr/bin/env node
/**
 * DYOR HQ v2 — Report Normalisation Script
 * Ensures every report follows the canonical template structure exactly.
 * 
 * Runs in place — modifies reports/*.html directly.
 * No commit until validated.
 *
 * Canonical sections (in order):
 *  1. Executive Summary
 *  2. Business Model
 *  3. Financial Snapshot
 *  4. Recent Catalysts
 *  5. Thesis Evaluation
 *  6. Key Risks
 *  7. Who Should Own It / Avoid It
 *  8. Recommendation
 *  9. Entry / Exit Framework
 * 10. Sources
 *
 * Usage: node scripts/normalise-reports.js [--dry-run] [--verbose]
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const TEMPLATE_PATH = path.join(__dirname, '..', 'reports', 'template.html');

// ── Canonical section map (normalize heading variations) ──────────────────────
const SECTION_MAP = {
  'executive summary':                        'Executive Summary',
  'business model':                           'Business Model',
  'financial snapshot':                       'Financial Snapshot',
  'financials':                               'Financial Snapshot',
  'recent catalysts':                         'Recent Catalysts',
  'recent catalysts (3-6 months)':            'Recent Catalysts',
  'catalysts':                               'Recent Catalysts',
  'thesis evaluation':                       'Thesis Evaluation',
  'bull / base / bear':                       'Thesis Evaluation',
  'scenario analysis':                       'Thesis Evaluation',
  'key risks':                                'Key Risks',
  'key risks (ranked)':                      'Key Risks',
  'risks':                                    'Key Risks',
  'who should own it / avoid it':            'Who Should Own It / Avoid It',
  'who should own it':                       'Who Should Own It / Avoid It',
  'ownership guidance':                      'Who Should Own It / Avoid It',
  'recommendation':                          'Recommendation',
  'entry / exit framework':                   'Entry / Exit Framework',
  'entry and exit':                           'Entry / Exit Framework',
  'price targets & risks':                   'Entry / Exit Framework',
  'sources':                                 'Sources',
};

// ── Canonical Sources template ─────────────────────────────────────────────────
const SOURCES_TEMPLATE = `
          <div class="report-section">
            <h2>Sources</h2>
            <ul>
              <li><strong>Authoritative market data:</strong> Live quote data sourced via DYOR HQ data pipeline (Google Sheets + Yahoo Finance). Fields sourced this way include price, market capitalisation, 52-week range, P/E, EPS, and volume.</li>
              <li><strong>Company filings and disclosures:</strong> Public company filings, regulatory announcements, investor presentations, and RNS where referenced in the analysis.</li>
              <li><strong>Additional public sources:</strong> Any third-party materials specifically cited inline in the report body.</li>
            </ul>
          </div>`;

// ── Biotech tickers requiring Paperclip pass ──────────────────────────────────
const BIOTECH_TICKERS = new Set([
  'AVCT', 'AVCT.L', 'ZYME', 'CRIS', 'AUTL', 'ABVE', 'C4X', 'C4X.L',
  'DESP', 'DESP.L', 'MRSN', 'POLXF', 'INO', 'MNTV', 'REGN', 'MRNA',
  'BMY', 'ABBV', 'ALKS', 'AMGN', 'GILD', 'EXAS', 'BMRN', 'CRNX',
  'DVAX', 'INDP', 'LMNL', 'OLMA', 'PCVX', 'PLRX', 'PRLR', 'RAPT',
  'RETA', 'SRPT', 'VTYX', 'XFOR',
]);

// ── Format B → Format A transformation ────────────────────────────────────────
const FORMAT_B_PATTERNS = [
  // Replace card-based structure with section-based
  { re: /<div class="card">\s*<div class="card-title">Executive Summary<\/div>\s*<p class="section-text">/g,
    into: '<div class="report-section"><h2>Executive Summary</h2><p>' },
  { re: /<div class="card">\s*<div class="card-title">Business Model<\/div>\s*<p class="section-text">/g,
    into: '<div class="report-section"><h2>Business Model</h2><p>' },
  { re: /<div class="card">\s*<div class="card-title">Financial Snapshot<\/div>\s*<p class="section-text">/g,
    into: '<div class="report-section"><h2>Financial Snapshot</h2><p>' },
  { re: /<div class="card">\s*<div class="card-title">Recent Catalysts \(3-6 Months\)<\/div>\s*<p class="section-text">/g,
    into: '<div class="report-section"><h2>Recent Catalysts</h2><p>' },
  { re: /<div class="card">\s*<div class="card-title">Thesis Evaluation<\/div>\s*<div class="scenario-grid">/g,
    into: '<div class="report-section"><h2>Thesis Evaluation</h2><div class="scenario-grid">' },
  { re: /<div class="card">\s*<div class="card-title">Key Risks \(Ranked\)<\/div>\s*<p class="section-text">/g,
    into: '<div class="report-section"><h2>Key Risks</h2><p>' },
  { re: /<div class="card">\s*<div class="card-title">Who Should Own It \/ Avoid It<\/div>\s*<p class="section-text">/g,
    into: '<div class="report-section"><h2>Who Should Own It / Avoid It</h2><p>' },
  { re: /<div class="card">\s*<div class="card-title">Recommendation<\/div>\s*<p class="section-text">/g,
    into: '<div class="report-section"><h2>Recommendation</h2><p>' },
  // Close section divs (card → report-section)
  { re: /<\/p>\s*<\/div>\s*<!-- \/card -->\s*(?=<!-- (Business Model|Financial Snapshot|Recent Catalysts|Thesis Evaluation|Key Risks|Who Should Own|Recommendation|Sources|$))/g,
    into: '</p></div>' },
  // Replace card wrapper close with report-section close
  { re: /<\/div>\s*<!-- \/card -->/g, into: '</div>' },
  // Sources card → canonical Sources section
  { re: /<div class="card">\s*<div class="card-title">Sources<\/div>\s*<div class="source-item">([^<]+)<\/div>\s*<div class="source-item">([^<]+)<\/div>\s*<div class="source-item">([^<]*)<\/div>\s*<\/div>/g,
    into: SOURCES_TEMPLATE },
  // Closing body
  { re: /<\/div>\s*<\/div>\s*<\/div>\s*<\/main>\s*<footer>/g,
    into: '</div></div></div></div><aside class="report-sidebar"><div class="sidebar-card"><h3>Quick Stats</h3><div class="stat-row"><span>Ticker</span><span>{{TICKER}}</span></div></div></aside></div></main><footer>' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function detectFormat(html) {
  if (html.includes('class="report-hero"'))        return 'A'; // canonical
  if (html.includes('class="ticker-badge"'))        return 'B'; // MDLZ-style card
  if (html.includes('<body>') && !html.includes('report-hero') && !html.includes('ticker-badge'))
    return 'C'; // generic placeholder
  return 'unknown';
}

function normaliseSectionHeadings(html) {
  let result = html;
  for (const [variant, canonical] of Object.entries(SECTION_MAP)) {
    const re = new RegExp(`<h2>\\s*${variant}\\s*</h2>`, 'gi');
    result = result.replace(re, `<h2>${canonical}</h2>`);
  }
  return result;
}

function ensureSourcesSection(html) {
  // If no Sources section exists, inject it before closing of report-content
  if (!html.includes('<h2>Sources</h2>')) {
    return html.replace(
      /(<div class="report-content">[\s\S]*?)(<\/div>\s*<aside class="report-sidebar">)/,
      `$1${SOURCES_TEMPLATE}$2`
    );
  }
  // If Sources exists but is in wrong format, normalise it
  return html;
}

function applyFormatBTransformation(html) {
  let result = html;
  for (const { re, into } of FORMAT_B_PATTERNS) {
    result = result.replace(re, into);
  }
  return result;
}

function extractTicker(filename) {
  return filename.split('-')[0].toUpperCase();
}

function isBiotech(ticker) {
  return BIOTECH_TICKERS.has(ticker) || BIOTECH_TICKERS.has(ticker.toUpperCase());
}

// ── Main ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const VERBOSE   = args.includes('--verbose');
const FORCE     = args.includes('--force');

const files = fs.readdirSync(REPORTS_DIR)
  .filter(f => f.endsWith('.html') && f !== 'template.html');

let updated = 0, skipped = 0, errors = 0;
const log = [];

for (const file of files.sort()) {
  const filepath = path.join(REPORTS_DIR, file);
  let html;

  try {
    html = fs.readFileSync(filepath, 'utf8');
  } catch(e) {
    errors++;
    console.error(`ERROR reading ${file}: ${e.message}`);
    continue;
  }

  const format = detectFormat(html);
  const ticker = extractTicker(file);

  if (VERBOSE) console.log(`${file}: format=${format}`);

  let normalised = html;
  let changed = false;

  // ── Step 1: Normalise section headings for all formats ──
  const beforeHeadings = normaliseSectionHeadings(normalised);
  if (beforeHeadings !== normalised) { normalised = beforeHeadings; changed = true; }

  // ── Step 2: Convert Format B → Format A ──
  if (format === 'B') {
    const converted = applyFormatBTransformation(normalised);
    if (converted !== normalised) { normalised = converted; changed = true; }
  }

  // ── Step 3: Ensure Sources section present and canonical ──
  const afterSources = ensureSourcesSection(normalised);
  if (afterSources !== normalised) { normalised = afterSources; changed = true; }

  // ── Step 4: Check for placeholder text in Business Model (Format C symptom) ──
  const bmMatch = normalised.match(/<h2>Business Model<\/h2>([\s\S]{10,200}?)<h2>/);
  if (bmMatch) {
    const bmText = bmMatch[1].replace(/<[^>]+>/g, '').toLowerCase();
    const isPlaceholder = bmText.includes('consumer discretionary sector company') ||
                         bmText.includes('sector company') ||
                         bmText.includes('investment case rests on') ||
                         bmText.includes('key drivers include');
    if (isPlaceholder) {
      log.push({ file, ticker, issue: 'PLACEHOLDER_TEXT', format });
      if (VERBOSE) console.log(`  WARNING: placeholder text detected`);
    }
  }

  if (!changed && !FORCE) {
    skipped++;
    if (VERBOSE) console.log(`  no changes`);
    continue;
  }

  if (DRY_RUN) {
    console.log(`DRY RUN: would update ${file} (format ${format}→A)`);
    continue;
  }

  try {
    fs.writeFileSync(filepath, normalised, 'utf8');
    updated++;
    log.push({ file, ticker, format, action: 'updated' });
    if (VERBOSE) console.log(`  updated`);
  } catch(e) {
    errors++;
    console.error(`ERROR writing ${file}: ${e.message}`);
  }
}

// ── Report ─────────────────────────────────────────────────────────────────────
console.log('\n── Normalisation Summary ──────────────────────────');
console.log(`Files processed: ${files.length}`);
console.log(`Updated:         ${updated}${DRY_RUN ? ' (dry run)' : ''}`);
console.log(`Unchanged:       ${skipped}`);
console.log(`Errors:          ${errors}`);

if (log.length) {
  console.log('\n── Issues ─────────────────────────────────────────');
  for (const e of log) {
    if (e.issue === 'PLACEHOLDER_TEXT') {
      console.log(`  ⚠   ${e.file} — placeholder text in Business Model (needs regen)`);
    } else if (e.action === 'updated') {
      console.log(`  ✓  ${e.file} — updated (format ${e.format}→A)`);
    }
  }
}

process.exit(errors > 0 ? 1 : 0);