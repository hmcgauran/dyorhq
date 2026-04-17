#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  ROOT,
  REPORTS_DIR,
  CANONICAL_INDEX_PATH,
  BROWSER_INDEX_PATH,
  SOURCE_PAGES,
  readJson,
  buildBrowserIndex,
  writeJson,
  ensureDir,
  rmrf,
  copyRecursive,
  validateProject,
} = require('./site-manifest');

const PUBLIC_DIR = path.join(ROOT, 'public');
const PUBLIC_REPORTS_DIR = path.join(PUBLIC_DIR, 'reports');
const PUBLIC_ASSETS_DIR = path.join(PUBLIC_DIR, 'assets');

const gitHash = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();

const canonicalIndex = readJson(CANONICAL_INDEX_PATH);

// ── Pre-build: auto-derive summary for index entries missing one ─────────────
const PLACEHOLDER_SUMMARIES = new Set([
  '',
  'This report is undergoing data refresh. The investment thesis, key risks, and catalysts are under review. Check back for the updated analysis.',
]);

function truncateAtWordBoundary(text, maxLen) {
  if (text.length <= maxLen) return text;
  const slice = text.substring(0, maxLen + 1);
  const lastSpace = slice.lastIndexOf(' ');
  return lastSpace > 0 ? text.substring(0, lastSpace) + '...' : text.substring(0, maxLen - 3) + '...';
}

function deriveSummary(dataEntry) {
  const text = dataEntry?.sections?.executiveSummary?.text;
  if (!text || typeof text !== 'string') return null;
  const twoSentences = text.match(/^[^.]*(?:\.[^.]*){1,2}/);
  const summary = twoSentences ? twoSentences[0].trim() : text.split('. ').slice(0, 2).join('. ').trim();
  return truncateAtWordBoundary(summary, 280);
}

let summariesBackfilled = 0;
let summariesTruncated = 0;
const samplePreviews = [];

for (const entry of canonicalIndex) {
  const needsBackfill = PLACEHOLDER_SUMMARIES.has(entry.summary || '');
  const tooLong = (entry.summary || '').length > 280;
  const endsMidWord = tooLong
    && !entry.summary.slice(-3).includes(' ')
    && !entry.summary.slice(-3).includes('.');

  if (needsBackfill) {
    const dataPath = path.join(ROOT, 'reports', 'data', `${entry.ticker}.json`);
    if (!fs.existsSync(dataPath)) continue;
    let data;
    try {
      data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    } catch {
      continue;
    }
    const derived = deriveSummary(data);
    if (!derived) continue;
    entry.summary = derived;
    summariesBackfilled++;
    if (samplePreviews.length < 5) {
      samplePreviews.push({ ticker: entry.ticker, summary: derived });
    }
  } else if (tooLong && endsMidWord) {
    entry.summary = truncateAtWordBoundary(entry.summary, 280);
    summariesTruncated++;
  }
}

if (summariesBackfilled > 0) {
  console.log(`[BUILD] Auto-derived ${summariesBackfilled} summary(s) from report data files`);
  for (const p of samplePreviews) {
    console.log(`  ${p.ticker}: "${p.summary.substring(0, 100)}..."`);
  }
}
if (summariesTruncated > 0) {
  console.log(`[BUILD] Fixed ${summariesTruncated} mid-word truncation(s)`);
}

writeJson(CANONICAL_INDEX_PATH, canonicalIndex);
// ─────────────────────────────────────────────────────────────────────────────

const browserIndex = buildBrowserIndex(canonicalIndex);
writeJson(BROWSER_INDEX_PATH, browserIndex);

const { issues } = validateProject();
const hardErrors = issues.filter(i => i.startsWith('[VALIDATION]'));
const warnings = issues.filter(i => i.startsWith('[WARNING]'));
for (const warning of warnings) {
  console.warn(`- ${warning}`);
}
if (hardErrors.length > 0) {
  console.error('Build aborted because validation failed.');
  for (const issue of hardErrors) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

rmrf(PUBLIC_DIR);
ensureDir(PUBLIC_REPORTS_DIR);
copyRecursive(path.join(ROOT, 'assets'), PUBLIC_ASSETS_DIR);

for (const page of SOURCE_PAGES) {
  copyRecursive(path.join(ROOT, page), path.join(PUBLIC_DIR, page));
}

copyRecursive(BROWSER_INDEX_PATH, path.join(PUBLIC_DIR, 'reports-index.json'));

// Rewrite local asset references with cache-busting query string
function rewriteHtmlWithVersion(srcPath, destPath, version) {
  let html = fs.readFileSync(srcPath, 'utf8');
  html = html.replace(
    /(<link[^>]+href=["'])(?![https?://])([^"']+)(["'])/gi,
    (match, prefix, assetPath, suffix) => {
      if (assetPath.includes('?v=')) return match;
      return `${prefix}${assetPath}?v=${version}${suffix}`;
    }
  );
  html = html.replace(
    /(<script[^>]+src=["'])(?![https?://])([^"']+)(["'])/gi,
    (match, prefix, assetPath, suffix) => {
      if (assetPath.includes('?v=')) return match;
      return `${prefix}${assetPath}?v=${version}${suffix}`;
    }
  );
  ensureDir(path.dirname(destPath));
  fs.writeFileSync(destPath, html, 'utf8');
}

// Copy reports to public/ with cache-busted asset references
for (const entry of canonicalIndex) {
  const src = path.join(REPORTS_DIR, entry.file);
  const dest = path.join(PUBLIC_REPORTS_DIR, entry.file);
  rewriteHtmlWithVersion(src, dest, gitHash);
}

// ── Conviction graph SVG injection (public/reports/ only — source files untouched) ──
// Runs AFTER copy so it operates on the already-copied public files without overwriting.

function yFromConviction(score) {
  return (156 - 1.32 * score).toFixed(1);
}

function generateGridLines() {
  return [
    '<line x1="24" y1="24.0" x2="496" y2="24.0" stroke="rgba(255,255,255,0.08)" stroke-width="1" />',
    '<line x1="24" y1="57.0" x2="496" y2="57.0" stroke="rgba(255,255,255,0.08)" stroke-width="1" />',
    '<line x1="24" y1="90.0" x2="496" y2="90.0" stroke="rgba(255,255,255,0.08)" stroke-width="1" />',
    '<line x1="24" y1="123.0" x2="496" y2="123.0" stroke="rgba(255,255,255,0.08)" stroke-width="1" />',
    '<line x1="24" y1="156.0" x2="496" y2="156.0" stroke="rgba(255,255,255,0.08)" stroke-width="1" />',
  ].join('');
}

function generateSvg(ticker, history) {
  const n = history.length;
  const usableWidth = 472; // 496 - 24
  const step = n > 1 ? usableWidth / (n - 1) : 0;

  const points = history.map((h, i) => {
    const x = n === 1 ? 260 : +(24 + step * i).toFixed(1);
    return `${x},${yFromConviction(h.conviction)}`;
  }).join(' ');

  const circles = history.map((h, i) => {
    const x = n === 1 ? 260 : +(24 + step * i).toFixed(1);
    const y = yFromConviction(h.conviction);
    return `<circle cx="${x}" cy="${y}" r="4" fill="#f0b429" />`;
  }).join('');

  const dateLabels = history.map((h, i) => {
    const x = n === 1 ? 260 : +(24 + step * i).toFixed(1);
    return `<text x="${x}" y="176" text-anchor="middle">${h.date}</text>`;
  }).join('');

  const polyline = n === 1
    ? ''
    : `<polyline fill="none" points="${points}" stroke="#f0b429" stroke-width="3" />`;

  return [
    '<svg viewBox="0 0 520 180" role="img" aria-label="Conviction score trend for ' + ticker + '">',
    generateGridLines(),
    polyline,
    circles,
    '<text x="8" y="28.0">100</text>',
    '<text x="8" y="61.0">75</text>',
    '<text x="8" y="94.0">50</text>',
    '<text x="8" y="127.0">25</text>',
    '<text x="8" y="160.0">0</text>',
    dateLabels,
    '</svg>',
  ].join('');
}

function injectConvictionGraph(html, ticker, history) {
  if (!history || history.length === 0) return html;

  const latest = history[0];
  const prior = history[1];
  const trendClass = prior
    ? latest.conviction > prior.conviction ? 'positive' : latest.conviction < prior.conviction ? 'negative' : 'neutral'
    : 'neutral';
  const trendLabel = prior
    ? latest.conviction > prior.conviction ? 'Up' : latest.conviction < prior.conviction ? 'Down' : 'Flat'
    : 'Initiation';

  const svg = generateSvg(ticker, history);
  const graphDiv = `<div class="conviction-history-chart">${svg}</div>`;
  const summary = `<p class="conviction-history-summary">Latest conviction: <strong>${latest.conviction}/100</strong>. Trend versus prior report: <strong class="${trendClass}">${trendLabel}</strong>.</p>`;

  // Case 1: section heading present, no SVG — inject graph into that section
  if (/<h2[^>]*>Conviction Trend<\/h2>/i.test(html)) {
    if (/<div class=["']conviction-history-chart["'][^>]*>[\s\S]*?<svg[^>]*aria-label=/i.test(html)) {
      return html; // already has graph
    }
    const headingIdx = html.indexOf('<h2', html.search(/<h2[^>]*>Conviction Trend<\/h2>/i));
    const headingClose = html.indexOf('</h2>', headingIdx);
    const sectionClose = html.indexOf('</section>', headingClose);
    const injection = '\n' + summary + '\n' + graphDiv + '\n';
    return html.slice(0, headingClose + 5) + injection + html.slice(headingClose + 5, sectionClose) + html.slice(sectionClose);
  }

  // Case 2: no section at all — inject full section before Sources
  const sourcesIdx = html.indexOf('<h2>Sources</h2>');
  if (sourcesIdx !== -1) {
    const beforeSources = html.slice(0, sourcesIdx);
    const lastSectionClose = beforeSources.lastIndexOf('</section>');
    const fullSection = [
      '<section class="report-section">',
      '<h2>Conviction Trend</h2>',
      summary,
      graphDiv,
      '</section>',
    ].join('\n');
    return beforeSources.slice(0, lastSectionClose) + fullSection + '\n' + html.slice(lastSectionClose);
  }

  return html;
}

let graphsInjected = 0;
let missingSectionsInjected = 0;

for (const entry of canonicalIndex) {
  const dest = path.join(PUBLIC_REPORTS_DIR, entry.file);
  if (!fs.existsSync(dest)) continue;

  let html = fs.readFileSync(dest, 'utf8');
  const original = html;

  const history = entry.convictionHistory || [];
  const hasSection = /<h2[^>]*>Conviction Trend<\/h2>/i.test(html);
  const hasSvg = /<div class=["']conviction-history-chart["'][^>]*>[\s\S]*?<svg[^>]*aria-label=/i.test(html);

  if (hasSection && !hasSvg) {
    html = injectConvictionGraph(html, entry.ticker, history);
    graphsInjected++;
  } else if (!hasSection) {
    html = injectConvictionGraph(html, entry.ticker, history);
    missingSectionsInjected++;
  }

  if (html !== original) {
    fs.writeFileSync(dest, html, 'utf8');
  }
}

if (graphsInjected > 0) {
  console.log(`[BUILD] Injected conviction graph SVG into ${graphsInjected} report(s) with empty section`);
}
if (missingSectionsInjected > 0) {
  console.log(`[BUILD] Injected missing Conviction Trend section into ${missingSectionsInjected} report(s)`);
}

console.log('DYOR HQ build complete.');
console.log(`- Canonical reports: ${canonicalIndex.length}`);
console.log(`- Browser index entries: ${browserIndex.length}`);
console.log(`- Output directory: ${PUBLIC_DIR}`);
console.log(`- Cache-busting version: ${gitHash}`);
require('./generate-sitemap.js');
