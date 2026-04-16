#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(ROOT, 'reports');
const CANONICAL_INDEX_PATH = path.join(REPORTS_DIR, 'index.json');
const BROWSER_INDEX_PATH = path.join(ROOT, 'reports-index.json');
const SOURCE_PAGES = ['index.html', 'portfolio.html', 'methodology.html'];
const TEMPLATE_FILES = new Set(['template.html', 'report-template.html']);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function rmrf(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function copyRecursive(sourcePath, targetPath) {
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    ensureDir(targetPath);
    for (const entry of fs.readdirSync(sourcePath)) {
      copyRecursive(path.join(sourcePath, entry), path.join(targetPath, entry));
    }
    return;
  }

  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function listReportHtml() {
  return fs.readdirSync(REPORTS_DIR)
    .filter(file => file.endsWith('.html') && !TEMPLATE_FILES.has(file))
    .sort();
}

function normaliseUniverses(universes) {
  if (!Array.isArray(universes)) return [];

  return [...new Set(
    universes.filter(universe => universe !== 'watchlist' && universe !== 'all')
  )];
}

function buildBrowserIndex(canonicalIndex) {
  return canonicalIndex.map(entry => {
    const universes = normaliseUniverses(entry.universes);

    return {
      ticker: entry.ticker,
      isin: entry.isin || null,
      exchange_code: entry.exchange_code || entry.exchange || null,
      exchange: entry.exchange || entry.exchange_code || null,
      rating: (entry.recommendation || 'HOLD').split('—')[0].trim(),
      recommendation: entry.recommendation || 'HOLD',
      company: entry.company,
      file: path.basename(entry.file || '', '.html'),
      report_url: `/reports/${path.basename(entry.file, '.html')}`,
      conviction: entry.conviction,
      summary: entry.summary || '',
      date: entry.date || entry.datePublished || null,
      universes,
    };
  });
}

function validateProject() {
  const issues = [];
  const canonicalIndex = readJson(CANONICAL_INDEX_PATH);

  if (!Array.isArray(canonicalIndex)) {
    issues.push('reports/index.json must contain a JSON array.');
    return { issues, canonicalIndex: [], browserIndex: [], reportFiles: [] };
  }

  const seenTickers = new Map();
  const seenFiles = new Map();

  canonicalIndex.forEach((entry, index) => {
    const label = `reports/index.json entry ${index + 1}`;

    if (!entry || typeof entry !== 'object') {
      issues.push(`${label} is not an object.`);
      return;
    }

    if (!entry.ticker) issues.push(`${label} is missing ticker.`);
    if (!entry.file) issues.push(`${label} is missing file.`);
    if (!entry.company) issues.push(`${label} is missing company.`);
    if (typeof entry.conviction !== 'number') issues.push(`${label} has a non-numeric conviction.`);
    if (!entry.date) issues.push(`${label} is missing date.`);

    if (entry.file && TEMPLATE_FILES.has(entry.file)) {
      issues.push(`${label} points to a template file and must not be indexed: ${entry.file}.`);
    }

    const universes = normaliseUniverses(entry.universes);
    // Only flag if non-watchlist/all values were filtered or duplicates existed
    const nonWatchlistOriginal = (entry.universes || []).filter(u => u !== 'watchlist' && u !== 'all');
    if (Array.isArray(entry.universes) && universes.length !== nonWatchlistOriginal.length) {
      issues.push(`${label} contains deprecated or duplicate universes.`);
    }

    if (entry.ticker) {
      if (seenTickers.has(entry.ticker)) {
        issues.push(`Duplicate ticker in canonical index: ${entry.ticker}.`);
      } else {
        seenTickers.set(entry.ticker, true);
      }
    }

    if (entry.file) {
      if (seenFiles.has(entry.file)) {
        issues.push(`Duplicate file in canonical index: ${entry.file}.`);
      } else {
        seenFiles.set(entry.file, true);
      }

      const filePath = path.join(REPORTS_DIR, entry.file);
      if (!fs.existsSync(filePath)) {
        issues.push(`Indexed report missing from reports/: ${entry.file}.`);
      }
    }
  });

  const reportFiles = listReportHtml();
  const indexedFiles = new Set(canonicalIndex.map(entry => entry.file).filter(Boolean));
  const orphanFiles = reportFiles.filter(file => !indexedFiles.has(file));
  if (orphanFiles.length > 0) {
    issues.push(`Orphan HTML reports not present in canonical index: ${orphanFiles.join(', ')}.`);
  }

  for (const page of SOURCE_PAGES) {
    if (!fs.existsSync(path.join(ROOT, page))) {
      issues.push(`Missing source page: ${page}.`);
    }
  }

  const browserIndex = buildBrowserIndex(canonicalIndex);
  if (fs.existsSync(BROWSER_INDEX_PATH)) {
    const existingBrowserIndex = readJson(BROWSER_INDEX_PATH);
    if (JSON.stringify(existingBrowserIndex) !== JSON.stringify(browserIndex)) {
      issues.push('reports-index.json is out of sync with reports/index.json.');
    }
  }

  return { issues, canonicalIndex, browserIndex, reportFiles };
}

module.exports = {
  ROOT,
  REPORTS_DIR,
  CANONICAL_INDEX_PATH,
  BROWSER_INDEX_PATH,
  SOURCE_PAGES,
  readJson,
  writeJson,
  ensureDir,
  rmrf,
  copyRecursive,
  listReportHtml,
  normaliseUniverses,
  buildBrowserIndex,
  validateProject,
};
