#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// HTML section checker — no external dependencies
function checkHtmlSections(htmlContent, filePath) {
  try {
    // Extract all <h2> text content
    const h2Matches = htmlContent.match(/<h2[^>]*>([\s\S]*?)<\/h2>/gi) || [];
    const foundSections = h2Matches.map(m => {
      const inner = m.replace(/<h2[^>]*>/i, '').replace(/<\/h2>/i, '').replace(/<[^>]+>/g, '').trim();
      return inner;
    });

    const missing = [];
    const required = [
      'Executive Summary',
      'Business Model',
      'Financial Snapshot',
      'Recent Catalysts',
      'Thesis Evaluation',
      'Key Risks',
      'Recommendation',
      'Entry',
      'Conviction Trend',
      'Sources'
    ];

    for (const req of required) {
      const found = foundSections.some(s => {
        if (req === 'Key Risks') return s.startsWith('Key Risks');
        if (req === 'Recommendation') return s.startsWith('Recommendation');
        if (req === 'Entry') return s.startsWith('Entry');
        if (req === 'Sources') return s.startsWith('Sources');
        return s.startsWith(req);
      });
      if (!found) missing.push(req);
    }
    return missing;
  } catch (e) {
    return ['HTML_PARSE_ERROR'];
  }
}

const ROOT = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(ROOT, 'reports');
const CANONICAL_INDEX_PATH = path.join(REPORTS_DIR, 'index.json');
const BROWSER_INDEX_PATH = path.join(ROOT, 'reports-index.json');
const SOURCE_PAGES = ['index.html', 'portfolio.html', 'methodology.html', 'about.html'];
const TEMPLATE_FILES = new Set(['template.html', 'report-template.html']);

const VALID_RECOMMENDATIONS = new Set(['STRONG BUY', 'BUY', 'OPPORTUNISTIC BUY', 'SPECULATIVE BUY', 'AVOID']);
const REQUIRED_HTML_SECTIONS = [
  'Executive Summary',
  'Business Model',
  'Financial Snapshot',
  'Recent Catalysts',
  'Thesis Evaluation',
  'Key Risks',
  'Recommendation',
  'Entry',
  'Conviction Trend',
  'Sources'
];

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

function isValidDate(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str);
  return !isNaN(d) && d.toISOString().startsWith(str);
}

function isValidIsin(str) {
  return typeof str === 'string' && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(str);
}

function isValidCurrency(str) {
  return typeof str === 'string' && /^[A-Z]{3}$/.test(str);
}

function isValidPrice(val) {
  return typeof val === 'number' && isFinite(val);
}

function checkHtmlSections(htmlContent, filePath) {
  try {
    const h2Matches = htmlContent.match(/<h2[^>]*>([\s\S]*?)<\/h2>/gi) || [];
    const foundSections = h2Matches.map(m => {
      const inner = m.replace(/<h2[^>]*>/i, '').replace(/<\/h2>/i, '').replace(/<[^>]+>/g, '').trim();
      return inner;
    });
    const missing = [];
    const required = [
      'Executive Summary',
      'Business Model',
      'Financial Snapshot',
      'Recent Catalysts',
      'Thesis Evaluation',
      'Key Risks',
      'Recommendation',
      'Entry',
      'Conviction Trend',
      'Sources'
    ];
    for (const req of required) {
      const found = foundSections.some(s => {
        if (req === 'Key Risks') return s.startsWith('Key Risks');
        if (req === 'Recommendation') return s.startsWith('Recommendation');
        if (req === 'Entry') return s.startsWith('Entry');
        if (req === 'Sources') return s.startsWith('Sources');
        return s.startsWith(req);
      });
      if (!found) missing.push(req);
    }
    return missing;
  } catch (e) {
    return ['HTML_PARSE_ERROR'];
  }
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
    const label = `[VALIDATION] ${entry.ticker || ('entry ' + (index + 1))}`;

    if (!entry || typeof entry !== 'object') {
      issues.push(`${label}: not a valid object.`);
      return;
    }

    // ── Required field checks (structural) ───────────────────────────────
    if (!entry.ticker)        issues.push(`${label}: missing ticker.`);
    if (!entry.file)          issues.push(`${label}: missing file.`);
    if (!entry.company)       issues.push(`${label}: missing company.`);
    if (typeof entry.conviction !== 'number') issues.push(`${label}: conviction is not a number.`);
    if (!entry.date)          issues.push(`${label}: missing date.`);

    // ── v2 Semantic checks ───────────────────────────────────────────────

    // date format
    if (entry.date && !isValidDate(entry.date)) {
      issues.push(`${label}: date "${entry.date}" is not ISO YYYY-MM-DD`);
    }

    // conviction range
    if (typeof entry.conviction === 'number') {
      if (!Number.isInteger(entry.conviction) || entry.conviction < 0 || entry.conviction > 100) {
        issues.push(`${label}: conviction ${entry.conviction} is outside 0–100`);
      }
    }

    // recommendation tier
    if (entry.recommendation && !VALID_RECOMMENDATIONS.has(entry.recommendation)) {
      issues.push(`${label}: recommendation "${entry.recommendation}" is not a valid tier (STRONG BUY, BUY, OPPORTUNISTIC BUY, SPECULATIVE BUY, AVOID)`);
    }

    // conviction/tier consistency
    if (typeof entry.conviction === 'number' && entry.recommendation) {
      const c = entry.conviction;
      const r = entry.recommendation;
      let valid = false;
      if (r === 'STRONG BUY' && c >= 80) valid = true;
      else if (r === 'BUY' && c >= 65 && c <= 79) valid = true;
      else if (r === 'OPPORTUNISTIC BUY' && c >= 50 && c <= 64) valid = true;
      else if (r === 'SPECULATIVE BUY' && c >= 30 && c <= 49) valid = true;
      else if (r === 'AVOID' && c < 30) valid = true;
      if (!valid) {
        issues.push(`${label}: conviction ${c} inconsistent with recommendation "${r}"`);
      }
    }

    // price type
    if (entry.price !== undefined && entry.price !== null && !isValidPrice(entry.price)) {
      issues.push(`${label}: price "${entry.price}" is not a numeric value`);
    }

    // currency format
    if (entry.currency && !isValidCurrency(entry.currency)) {
      issues.push(`${label}: currency "${entry.currency}" is not a valid ISO 4217 code`);
    }

    // ISIN format
    if (entry.isin && !isValidIsin(entry.isin)) {
      issues.push(`${label}: isin "${entry.isin}" does not match ISO 6166 format`);
    }

    // convictionHistory
    if (!Array.isArray(entry.convictionHistory) || entry.convictionHistory.length === 0) {
      issues.push(`${label}: convictionHistory is missing or malformed`);
    } else {
      const last = entry.convictionHistory[entry.convictionHistory.length - 1];
      if (!last || typeof last.date !== 'string' || !Number.isInteger(last.conviction)) {
        issues.push(`${label}: convictionHistory entry malformed (need {date, conviction})`);
      } else {
        // most recent entry date must equal top-level date
        if (entry.date && last.date !== entry.date) {
          issues.push(`${label}: convictionHistory most recent date "${last.date}" does not match entry date "${entry.date}"`);
        }
        // most recent entry conviction must equal top-level conviction
        if (typeof entry.conviction === 'number' && last.conviction !== entry.conviction) {
          issues.push(`${label}: convictionHistory most recent conviction ${last.conviction} does not match entry conviction ${entry.conviction}`);
        }
      }
    }

    // snapshot fields
    if (entry.priceAtLastReport !== undefined && entry.priceAtLastReport !== null && !isValidPrice(entry.priceAtLastReport)) {
      issues.push(`${label}: snapshot field priceAtLastReport is missing or non-numeric`);
    }
    if (entry.marketCapAtLastReport !== undefined && entry.marketCapAtLastReport !== null && !isValidPrice(entry.marketCapAtLastReport)) {
      issues.push(`${label}: snapshot field marketCapAtLastReport is missing or non-numeric`);
    }
    if (entry.peAtLastReport !== null && entry.peAtLastReport !== undefined && !isValidPrice(entry.peAtLastReport)) {
      issues.push(`${label}: snapshot field peAtLastReport is missing or non-numeric`);
    }

    // ── Structural checks ────────────────────────────────────────────────

    if (entry.file && TEMPLATE_FILES.has(entry.file)) {
      issues.push(`${label}: points to a template file and must not be indexed: ${entry.file}.`);
    }

    const universes = normaliseUniverses(entry.universes);
    const nonWatchlistOriginal = (entry.universes || []).filter(u => u !== 'watchlist' && u !== 'all');
    if (Array.isArray(entry.universes) && universes.length !== nonWatchlistOriginal.length) {
      issues.push(`${label}: contains deprecated or duplicate universes.`);
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
        issues.push(`${label}: indexed report missing from reports/: ${entry.file}.`);
      }
    }
  });

  // ── HTML content checks (all report files) ──────────────────────────────
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

  // Check HTML sections for every indexed report
  // Legacy reports (date < today): missing sections -> warning only
  // New reports (date >= today): missing sections -> hard error
  const today = new Date().toISOString().slice(0, 10);
  canonicalIndex.forEach(entry => {
    if (!entry.file || TEMPLATE_FILES.has(entry.file)) return;
    const filePath = path.join(REPORTS_DIR, entry.file);
    if (!fs.existsSync(filePath)) return;

    try {
      const html = fs.readFileSync(filePath, 'utf8');
      const missingSections = checkHtmlSections(html, entry.file);
      missingSections.forEach(section => {
        const prefix = entry.date && entry.date < today ? '[WARNING]' : '[VALIDATION]';
        issues.push(`${prefix} ${entry.file}: missing required section "${section}"`);
      });
    } catch (e) {
      issues.push(`[VALIDATION] ${entry.file}: could not read HTML file`);
    }
  });

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