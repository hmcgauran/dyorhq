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

// ── HTML generation from data files (public/reports/ only — source reports/ untouched) ──
// For each entry in the index: if a data JSON exists and source HTML is absent, generate
// canonical HTML from the JSON data. This handles newly added tickers that have no
// manually maintained report yet. Stale check: skip if HTML already exists.

const DATA_DIR = path.join(ROOT, 'reports', 'data');

function recFromTier(c) {
  if (c >= 80) return 'BUY (STRONG)';
  if (c >= 65) return 'BUY';
  if (c >= 50) return 'OPPORTUNISTIC BUY';
  if (c >= 30) return 'SPECULATIVE BUY';
  return 'AVOID';
}
function recBadgeClass(rec) {
  if (rec === 'BUY (STRONG)') return 'rec-buy-strong';
  return 'rec-' + rec.toLowerCase().replace(/[^a-z]/g, '');
}
function fmtPrice(price, currency) {
  if (!price && price !== 0) return 'N/A';
  const cur = currency === 'GBX' || currency === 'GBP' ? '\u00a3' : currency === 'EUR' ? '\u20ac' : '$';
  if (price >= 1e12) return cur + (price / 1e12).toFixed(1) + 'T';
  if (price >= 1e9)  return cur + (price / 1e9).toFixed(1) + 'bn';
  if (price >= 1e6)  return cur + (price / 1e6).toFixed(1) + 'm';
  return cur + price.toFixed(2);
}
function sectionLabel(rec) {
  return rec === 'BUY (STRONG)' ? 'BUY (STRONG)' : rec;
}

function generateReportHtml(entry, dataPath) {
  let data;
  try { data = JSON.parse(fs.readFileSync(dataPath, 'utf8')); } catch { return null; }

  const meta = data.meta || {};
  const priceData = data.price || {};
  const grok = data.grok || {};
  const sc = data.scenario || {};
  const sections = data.sections || {};

  const ticker  = entry.ticker;
  const company = meta.company || entry.company || ticker;
  const rec     = recFromTier(sc.conviction || entry.conviction || 50);
  const convict = sc.conviction || entry.conviction || 50;
  const date    = meta.date || entry.date || new Date().toISOString().slice(0, 10);
  const price   = priceData.current ?? entry.price ?? 0;
  const currency = priceData.currency || entry.currency || 'USD';
  const marketCap = priceData.marketCap;
  const pe      = priceData.pe;
  const eps     = priceData.eps;
  const week52High = priceData.week52High;
  const week52Low  = priceData.week52Low;
  const beta    = priceData.beta;
  const avgVol  = priceData.avgVolume;

  const grokScore  = grok.score;
  const grokSignal = grok.signal || '';
  const grokThemes = Array.isArray(grok.keyThemes) ? grok.keyThemes : [];
  const grokSummary = grok.summary || '';

  const bullP = sc.bullProbability ?? 25;
  const bullS = sc.bullScore ?? 75;
  const baseP = sc.baseProbability ?? 55;
  const baseS = sc.baseScore ?? 50;
  const bearP = sc.bearProbability ?? 20;
  const bearS = sc.bearScore ?? 20;
  const calc  = sc.conviction ?? convict;

  const history = entry.convictionHistory || [{ date, conviction: calc }];
  const historyForChart = history.map(h => ({ date: h.date, y: 156 - 1.32 * h.conviction }));
  const n = historyForChart.length;
  const usableW = 472;
  const step = n > 1 ? usableW / (n - 1) : 0;
  const pts = historyForChart.map((h, i) => {
    const x = n === 1 ? 260 : +(24 + step * i).toFixed(1);
    return x + ',' + h.y.toFixed(1);
  }).join(' ');
  const circles = historyForChart.map((h, i) => {
    const x = n === 1 ? 260 : +(24 + step * i).toFixed(1);
    return '<circle cx="' + x + '" cy="' + h.y.toFixed(1) + '" r="4" fill="#f0b429" />';
  }).join('');
  const dateLabels = historyForChart.map((h, i) => {
    const x = n === 1 ? 260 : +(24 + step * i).toFixed(1);
    return '<text x="' + x + '" y="176" text-anchor="middle">' + h.date + '</text>';
  }).join('');
  const poly = n === 1 ? '' : '<polyline fill="none" points="' + pts + '" stroke="#f0b429" stroke-width="3" />';

  const svgChart = '<svg viewBox="0 0 520 180" role="img" aria-label="Conviction score trend for ' + ticker + '">' +
    '<line x1="24" y1="24.0" x2="496" y2="24.0" stroke="rgba(255,255,255,0.08)" stroke-width="1" />' +
    '<line x1="24" y1="57.0" x2="496" y2="57.0" stroke="rgba(255,255,255,0.08)" stroke-width="1" />' +
    '<line x1="24" y1="90.0" x2="496" y2="90.0" stroke="rgba(255,255,255,0.08)" stroke-width="1" />' +
    '<line x1="24" y1="123.0" x2="496" y2="123.0" stroke="rgba(255,255,255,0.08)" stroke-width="1" />' +
    '<line x1="24" y1="156.0" x2="496" y2="156.0" stroke="rgba(255,255,255,0.08)" stroke-width="1" />' +
    poly + circles +
    '<text x="8" y="28.0">100</text><text x="8" y="61.0">75</text><text x="8" y="94.0">50</text><text x="8" y="127.0">25</text><text x="8" y="160.0">0</text>' +
    dateLabels + '</svg>';

  const tableRows = history.slice(0, 10).map(h => '<tr><td>' + h.date + '</td><td>' + h.conviction + '</td></tr>').join('');
  const latestHist = history[0];
  const priorHist  = history[1];
  const trendClass = priorHist ? (latestHist.conviction > priorHist.conviction ? 'positive' : latestHist.conviction < priorHist.conviction ? 'negative' : 'neutral') : 'neutral';
  const trendLabel = priorHist ? (latestHist.conviction > priorHist.conviction ? 'Up' : latestHist.conviction < priorHist.conviction ? 'Down' : 'Flat') : 'Initiation';

  const execSum = sections.executiveSummary?.text || meta.summary || entry.summary || 'Research in progress.';
  const bizModel = sections.businessModel?.text || '';
  const catalysts = sections.recentCatalysts?.text || (grokScore !== null ? '<p><em>Grok sentiment (score ' + grokScore + '/100, ' + grokSignal + '):</em> ' + (grokThemes.length ? 'Key themes: ' + grokThemes.join(', ') + '. ' : '') + grokSummary + '</p>' : '<p>No recent catalysts data available.</p>');
  const thesisEv = sections.thesisEvaluation?.text || '<p>Thesis evaluation in progress.</p>';
  const keyRisks = sections.keyRisks?.text || '<p>Key risks under review.</p>';
  const whoOwn  = sections.whoShouldOwnIt?.text || '<p>Under review.</p>';
  const recText = sections.recommendation?.text || '<p>' + rec + ' — Conviction Score: ' + calc + '/100.</p>';
  const entryText = sections.entry?.text || '<p>Entry levels under review.</p>';
  const sourcesText = sections.sources?.text || '<p><strong>Market data:</strong> Source: DYOR HQ data pipeline.</p>' + (grokScore !== null ? '<p><strong>Grok sentiment:</strong> Score ' + grokScore + '/100, ' + grokSignal + '. Sources: ' + (grok.sources || 'various') + '.</p>' : '');

  const finFields = [
    ['Price', fmtPrice(price, currency)],
    ['Market Cap', marketCap ? fmtPrice(typeof marketCap === 'number' ? marketCap : parseFloat(marketCap), currency) : 'N/A'],
    ['P/E Ratio', pe ? pe.toFixed(1) + 'x' : 'N/A'],
    ['EPS (TTM)', eps ? currency + ' ' + eps.toFixed(2) : 'N/A'],
    ['52w High', week52High ? fmtPrice(week52High, currency) : 'N/A'],
    ['52w Low', week52Low ? fmtPrice(week52Low, currency) : 'N/A'],
    ['Distance from 52wH', (week52High && price) ? ((price / week52High - 1) * 100).toFixed(1) + '%' : 'N/A'],
    ['Beta', beta ? beta.toFixed(2) : 'N/A'],
    ['Avg Volume', avgVol || 'N/A'],
    ['Currency', currency],
  ];
  const finRows = finFields.filter(r => r[1] !== 'N/A').map(r => '<div class="snapshot-item"><div class="snapshot-label">' + r[0] + '</div><div class="snapshot-value' + (r[0] === 'Price' ? ' highlight' : '') + '">' + r[1] + '</div></div>').join('\n');

  const cssClass = recBadgeClass(rec);
  const badgeClass = rec === 'BUY (STRONG)' ? 'rec-buy' : cssClass;

  return '<!DOCTYPE html>\n' +
'<html lang="en-GB">\n' +
'<head>\n' +
'  <meta charset="utf-8">\n' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'  <meta name="description" content="' + company + ' (' + ticker + ') - Investment Research - DYOR HQ">\n' +
'  <title>DYOR HQ - ' + company + ' (' + ticker + ') | ' + date + '</title>\n' +
'  <link rel="stylesheet" href="../assets/css/main.css">\n' +
'  <link rel="stylesheet" href="../assets/css/report-canonical.css">\n' +
'  <link rel="preconnect" href="https://fonts.googleapis.com">\n' +
'  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
'  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">\n' +
'</head>\n' +
'<body>\n' +
'  <header class="site-header"><div class="header-inner"><a class="logo" href="../index.html"><span class="logo-wordmark">DYOR <span>HQ</span></span><span class="logo-badge">AI Research</span></a><nav><ul class="nav-links"><li><a href="../index.html">All Reports</a></li></ul></nav></div></header>\n' +
'  <main>\n' +
'    <div class="container">\n' +
'      <section class="report-hero"><div class="report-breadcrumb"><a href="../index.html">Reports</a><span>/</span><span>' + ticker + '</span></div><div class="report-title-row"><div class="report-title-block"><div class="ticker-label">' + ticker + '</div><h1>' + ticker + ' - ' + company + '</h1><div class="report-meta-bar"><span class="rec-badge ' + badgeClass + '">' + sectionLabel(rec) + '</span><span class="meta-item">' + date + '</span><span class="meta-item">' + fmtPrice(price, currency) + '</span></div></div><div class="conviction-display ' + badgeClass + '"><div class="score ' + badgeClass + '">' + calc + '</div><div class="score-label">Conviction</div><div class="score-sub">out of 100</div></div></div></section>\n' +
'      <section class="report-section"><h2>Executive Summary</h2><p>' + execSum + '</p></section>\n' +
'      <section class="report-section"><h2>Business Model</h2><p>' + (bizModel || 'Research in progress.') + '</p></section>\n' +
'      <section class="report-section"><h2>Financial Snapshot</h2>\n' +
'<div class="snapshot-grid">\n' + finRows + '\n</div></section>\n' +
'      <section class="report-section"><h2>Recent Catalysts</h2>\n' + catalysts + '</section>\n' +
'      <section class="report-section"><h2>Thesis Evaluation</h2>\n' +
'<div class="scenario-grid"><div class="scenario-card scenario-bull"><h3>Bull Case (' + bullP + '% weight)</h3><p>Score: ' + bullS + '. ' + (sections.thesisEvaluation?.bull || 'Under review.') + '</p></div><div class="scenario-card scenario-base"><h3>Base Case (' + baseP + '% weight)</h3><p>Score: ' + baseS + '. ' + (sections.thesisEvaluation?.base || 'Under review.') + '</p></div><div class="scenario-card scenario-bear"><h3>Bear Case (' + bearP + '% weight)</h3><p>Score: ' + bearS + '. ' + (sections.thesisEvaluation?.bear || 'Under review.') + '</p></div></div>\n' +
'<div class="scenario-summary"><span class="ss-label">Weighted conviction:</span><span class="ss-value">Bull ' + bullP + ' x ' + bullS + ' + Base ' + baseP + ' x ' + baseS + ' + Bear ' + bearP + ' x ' + bearS + ' = ' + calc + '/100. ' + rec + '.</span></div></section>\n' +
'      <section class="report-section"><h2>Key Risks</h2><ol>\n' + (sections.keyRisks?.risks ? sections.keyRisks.risks.map((r, i) => '<li>#' + (i+1) + ' ' + r + '</li>').join('\n') : '<li>Under review.</li>') + '\n</ol></section>\n' +
'      <section class="report-section"><h2>Who Should Own It / Avoid It</h2><p>' + whoOwn + '</p></section>\n' +
'      <section class="report-section"><h2>Recommendation</h2><p>' + recText + '</p></section>\n' +
'      <section class="report-section"><h2>Entry</h2>\n' + entryText + '</section>\n' +
'      <section class="report-section conviction-history-section"><h2>Conviction Trend</h2><p class="conviction-history-summary">Latest conviction: <strong>' + calc + '/100</strong>. Trend versus prior report: <strong class="' + trendClass + '">' + trendLabel + '</strong>.</p><div class="conviction-history-chart">' + svgChart + '</div><table class="conviction-history-table"><thead><tr><th>Report date</th><th>Conviction</th></tr></thead><tbody>' + tableRows + '</tbody></table></section>\n' +
'      <section class="report-section"><h2>Sources</h2>' + sourcesText + '<p><strong>Report date:</strong> Financial data is correct as of ' + date + '.</p></section>\n' +
'    </div>\n' +
'  </main>\n' +
'  <footer class="site-footer"><div class="footer-inner"><p class="footer-disclaimer">Research is for informational purposes only. Not financial advice. All analysis reflects the date of publication. Always conduct your own due diligence.</p><div class="footer-brand">DYOR <span>HQ</span></div></div></footer>\n' +
'</body>\n' +
'</html>';
}

let generatedCount = 0;
const SKIP_EXTENSIONS = new Set(['test', 'template', 'example']);
for (const entry of canonicalIndex) {
  const slug = entry.file; // e.g. "ciscosystemsinc.html"
  const dest = path.join(PUBLIC_REPORTS_DIR, slug);

  // Only generate if source HTML doesn't already exist
  const src = path.join(REPORTS_DIR, slug);
  if (fs.existsSync(src)) continue; // source file exists — copy loop handles it

  // Derive ticker file name (strip exchange prefix)
  const tickerRaw = entry.ticker.replace(PREFIX_RE, '').toUpperCase();
  const dataPath = path.join(DATA_DIR, tickerRaw + '.json');
  if (!fs.existsSync(dataPath)) continue;

  // Stale check: skip if HTML already exists in public/
  if (fs.existsSync(dest)) continue;

  const html = generateReportHtml(entry, dataPath);
  if (!html) continue;

  ensureDir(path.dirname(dest));
  fs.writeFileSync(dest, html, 'utf8');
  generatedCount++;
  if (generatedCount <= 5) {
    process.stdout.write(`  generated ${slug} from data\n`);
  }
}
if (generatedCount > 5) {
  console.log('  ... and ' + (generatedCount - 5) + ' more');
}
if (generatedCount > 0) {
  console.log('[BUILD] Generated ' + generatedCount + ' report(s) from data JSON (no source HTML found)');
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
