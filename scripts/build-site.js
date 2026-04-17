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
  // Take first two sentences
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
    // Retroactively fix mid-word truncations on existing summaries
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
  // Append ?v={version} to local asset links and scripts (not external URLs)
  html = html.replace(
    /(<link[^>]+href=["'])(?![https?://])([^"']+)(["'])/gi,
    (match, prefix, assetPath, suffix) => {
      if (assetPath.includes('?v=')) return match; // already versioned
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

for (const entry of canonicalIndex) {
  const src = path.join(REPORTS_DIR, entry.file);
  const dest = path.join(PUBLIC_REPORTS_DIR, entry.file);
  rewriteHtmlWithVersion(src, dest, gitHash);
}

console.log('DYOR HQ build complete.');
console.log(`- Canonical reports: ${canonicalIndex.length}`);
console.log(`- Browser index entries: ${browserIndex.length}`);
console.log(`- Output directory: ${PUBLIC_DIR}`);
console.log(`- Cache-busting version: ${gitHash}`);
require('./generate-sitemap.js');
