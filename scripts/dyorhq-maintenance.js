#!/usr/bin/env node
/**
 * DYOR HQ Maintenance Script
 * Standalone Node.js — run: node scripts/dyorhq-maintenance.js
 *
 * Tasks:
 *  1. Add/normalise Sources sections in all live report HTML files
 *  2. Add/update conviction trend table + SVG line chart from index.json history
 *  3. Ensure ISIN/exchange meta tags match reports/index.json
 *  4. Remove inline source-provenance wording from report body text
 *  5. Remove personal-holder phrasing
 *  6. Enforce one report per ticker (keep latest date) → regenerate public/reports-index.json
 *  7. Copy/sync live report HTML from reports/ → public/reports/
 *  8. Print verification summary
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const BASE    = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq';
const REPORTS = path.join(BASE, 'reports');
const PUB_REP = path.join(BASE, 'public/reports');
const IDX_IN  = path.join(REPORTS, 'index.json');
const IDX_PUB = path.join(BASE, 'public/reports-index.json');

const SOURCES_SECTION = `<div class="report-section">
            <h2>Sources</h2>
            <ul>
              <li><strong>Authoritative market data source:</strong> DYOR HQ Google Sheet workflow. Fields typically pulled via this route include live price, market capitalisation, 52-week range, EPS, P/E, volume, and other quote statistics used in the report.</li>
              <li><strong>Company disclosures:</strong> Public company filings, regulatory announcements, investor presentations, and investor-relations materials where referenced in the analysis.</li>
              <li><strong>Additional public sources:</strong> Any specifically cited third-party materials linked inline in the report.</li>
            </ul>
          </div>`;

// Matches both </div><aside> and </div><!-- comment --><aside> (with optional blank lines)
const SIDEBAR_ANCHOR_RE = /<\/div>(\s*<!--[^-]*-->)?\s*<aside class="report-sidebar">/;

const PERSONAL_RE = /\bmy own\b|\bmy holding\b|\bmy position\b|\bmy view\b|\bmy\b|personally held|I'm bullish|I'm bearish|\bI would be\b|\bI own\b|\bI hold\b|\bI think\b|\bI believe\b|\bI prefer\b|\bI expect\b|\bI see\b/gi;

function convictionToY(conviction) {
  // SVG viewBox 520×180; y-axis: 24 (conviction=100) → 156 (conviction=0)
  return 156 - conviction * (156 - 24) / 100;
}

function buildTrendSection(ticker, history, currentConviction) {
  const svgW = 520, svgH = 180;
  const padL = 24, padR = 24, padT = 16, padB = 28;

  // Build polyline points
  const pts = history.map((h, i) => {
    const x = history.length === 1 ? svgW / 2 : padL + (i / (history.length - 1)) * (svgW - padL - padR);
    const y = convictionToY(h.conviction);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  // Trend direction
  let trendLabel, trendClass;
  if (history.length >= 2) {
    const diff = currentConviction - history[history.length - 2].conviction;
    if (diff > 0)  { trendLabel = `+${diff}`; trendClass = 'positive'; }
    else if (diff < 0) { trendLabel = `${diff}`; trendClass = 'negative'; }
    else            { trendLabel = 'Flat'; trendClass = 'neutral'; }
  } else {
    trendLabel = 'Flat'; trendClass = 'neutral';
  }

  const tableRows = history.map(h => `<tr><td>${h.date}</td><td>${h.conviction}</td></tr>`).join('');

  const gridLines = [0, 25, 50, 75, 100].map(v => {
    const y = convictionToY(v);
    return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${svgW - padR}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-width="1" />`;
  }).join(' ');

  const yTicks = [0, 25, 50, 75, 100].map(v => {
    const y = convictionToY(v);
    return `<text x="8" y="${(y + 4).toFixed(1)}">${v}</text>`;
  }).join(' ');

  const xTicks = history.map((h, i) => {
    const x = history.length === 1 ? svgW / 2 : padL + (i / (history.length - 1)) * (svgW - padL - padR);
    return `<text x="${x.toFixed(1)}" y="${svgH - 4}" text-anchor="middle">${h.date}</text>`;
  }).join(' ');

  const circles = history.map((h, i) => {
    const x = history.length === 1 ? svgW / 2 : padL + (i / (history.length - 1)) * (svgW - padL - padR);
    const y = convictionToY(h.conviction);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#f0b429" />`;
  }).join(' ');

  return `<div class="report-section conviction-history-section">
            <h2>Conviction Trend</h2>
            <p class="conviction-history-summary">Latest conviction: <strong>${currentConviction}/100</strong>. Trend versus prior report: <strong class="${trendClass}">${trendLabel}</strong>.</p>
            <div class="conviction-history-chart">
              <svg viewBox="0 0 ${svgW} ${svgH}" role="img" aria-label="Conviction score trend for ${ticker}">
                ${gridLines}
                <polyline fill="none" stroke="#f0b429" stroke-width="3" points="${pts.join(' ')}" />
                ${circles}
                ${yTicks}
                ${xTicks}
              </svg>
            </div>
            <table class="conviction-history-table">
              <thead><tr><th>Report date</th><th>Conviction</th></tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>`;
}

function extractConvictionFromHtml(c) {
  const m = c.match(/<div class="score"[^>]*>(\d+)<\/div>/);
  return m ? parseInt(m[1], 10) : null;
}

function extractDateFromHtml(c) {
  // Try ISO format first: 2026-04-08
  const m1 = c.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (m1) return m1[1];
  // Try human format: 8 Apr 2026 → 2026-04-08
  const months = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
                   jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
  const m2 = c.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\b/i);
  if (m2) {
    const [, day, mon, yr] = m2;
    return `${yr}-${months[mon.toLowerCase()]}-${day.padStart(2,'0')}`;
  }
  return null;
}

function processReport(filePath, idxEntry, allHistory) {
  let c = fs.readFileSync(filePath, 'utf8');
  const orig = c;

  // Extract ticker from filename
  const fileName = path.basename(filePath);
  const tickerMatch = fileName.match(/^([A-Za-z0-9.-]+)-\d{4}-\d{2}-\d{2}\.html$/);
  const ticker = tickerMatch ? tickerMatch[1].toUpperCase() : null;

  // Conviction and date — prefer index.json, fall back to HTML
  const idxConviction = idxEntry ? idxEntry.conviction : null;
  const idxDate       = idxEntry ? idxEntry.date : null;
  const htmlConviction = extractConvictionFromHtml(c);
  const htmlDate       = extractDateFromHtml(c);

  const conviction = idxConviction || htmlConviction;
  const date       = idxDate || htmlDate;

  // ── Task 4 & 5: Remove inline source-provenance wording and personal phrasing ──
  const sourcesPos = c.indexOf('<h2>Sources</h2>');
  const beforeSources = sourcesPos >= 0 ? c.substring(0, sourcesPos) : c;

  const cleaned = beforeSources
    .replace(/DYOR HQ Google Sheet[^<]*/gi, 'GOOGLEFINANCE function')
    .replace(/Google Sheet \([^)]*\)/gi, 'GOOGLEFINANCE function')
    .replace(/Google Sheet/gi, 'GOOGLEFINANCE function')
    .replace(/\bI would be\b/gi, 'Position sizing would be')
    .replace(/\bI own\b/gi, 'The analyst owns')
    .replace(/\bI hold\b/gi, 'The analyst holds')
    .replace(/\bI think\b/gi, 'The analytical view is')
    .replace(/\bI believe\b/gi, 'The analytical view is')
    .replace(/\bI prefer\b/gi, 'The preferred approach is')
    .replace(/\bI expect\b/gi, 'The expectation is')
    .replace(/\bI see\b/gi, 'The analysis indicates')
    .replace(/\bmy own\b/gi, '[the analyst\'s own]')
    .replace(/\bmy holding\b/gi, '[the analyst\'s holding]')
    .replace(/\bmy position\b/gi, '[the analyst\'s position]')
    .replace(/\bmy view\b/gi, 'the analytical view')
    .replace(/\bmy\b/gi, '[the analyst\'s]')
    .replace(/personally held/gi, 'held');

  c = cleaned + (sourcesPos >= 0 ? c.substring(sourcesPos) : '');

  // ── Task 3: Fix ISIN/exchange meta tags ──
  if (idxEntry) {
    const targetIsin = idxEntry.isin || '';
    const targetExch  = idxEntry.exchange_code || '';

    if (targetIsin) {
      if (!c.includes('<meta name="isin"')) {
        c = c.replace('<meta charset="UTF-8">', `<meta name="isin" content="${targetIsin}">\n  <meta charset="UTF-8">`);
      } else {
        c = c.replace(/<meta name="isin" content="[^"]*"/, `<meta name="isin" content="${targetIsin}"`);
      }
    } else {
      c = c.replace(/<meta name="isin" content="[^"]*"\n?/, '');
    }

    if (targetExch) {
      if (!c.includes('<meta name="exchange_code"')) {
        c = c.replace('<meta charset="UTF-8">', `<meta name="exchange_code" content="${targetExch}">\n  <meta charset="UTF-8">`);
      } else {
        c = c.replace(/<meta name="exchange_code" content="[^"]*"/, `<meta name="exchange_code" content="${targetExch}"`);
      }
    } else {
      c = c.replace(/<meta name="exchange_code" content="[^"]*"\n?/, '');
    }
  }

  // ── Task 1: Add Sources section ──
  if (!c.includes('<h2>Sources</h2>')) {
    // Insert Sources + close the last report-section div before <aside class="report-sidebar">
    const sidebarMatch = c.match(SIDEBAR_ANCHOR_RE);
    if (sidebarMatch) {
      const commentGroup = sidebarMatch[1] || '';
      c = c.replace(SIDEBAR_ANCHOR_RE,
        `${SOURCES_SECTION}\n          </div>${commentGroup}        <aside class="report-sidebar">`);
    }
  }

  // ── Task 2: Add/update conviction trend ──
  if (conviction) {
    const history = (idxEntry && allHistory[ticker]) || [{ date: date || 'unknown', conviction }];
    const trendSection = buildTrendSection(ticker, history, conviction);

    // Remove existing trend section if present (prevents dupes on re-run)
    c = c.replace(
      /<div class="report-section conviction-history-section">[\s\S]*?<\/div>\s*<\/div>\s*<div class="report-section">\s*<h2>Sources<\/h2>/,
      `<div class="report-section">\n            <h2>Sources<\/h2>`
    );

    // Insert trend before Sources
    if (!c.includes('conviction-history-section">')) {
      c = c.replace(
        /(<div class="report-section">\s*\n?            <h2>Sources<\/h2>)/,
        `${trendSection}\n          $1`
      );
    }
  }

  if (c !== orig) {
    fs.writeFileSync(filePath, c);
    return true;
  }
  return false;
}

// ── Main ──
const idx = JSON.parse(fs.readFileSync(IDX_IN, 'utf8'));

// Build conviction history per ticker from index.json
const allHistory = {};
for (const entry of idx) {
  if (!allHistory[entry.ticker]) allHistory[entry.ticker] = [];
  allHistory[entry.ticker].push({ date: entry.date, conviction: entry.conviction });
}
for (const t of Object.keys(allHistory)) {
  allHistory[t].sort((a, b) => a.date.localeCompare(b.date));
}

// Index map by filename
const idxMap = {};
idx.forEach(e => { idxMap[e.file] = e; });

// ── Task 6: Enforce one report per ticker in index ──
const sortedIdx = [...idx].sort((a, b) => {
  const t = String(a.ticker || '').localeCompare(String(b.ticker || ''));
  if (t !== 0) return t;
  return String(b.date || '').localeCompare(String(a.date || ''));
});
const seen    = new Set();
const removed = [];
const kept    = [];
for (const entry of sortedIdx) {
  if (seen.has(entry.ticker)) {
    removed.push(entry);
    continue;
  }
  seen.add(entry.ticker);
  kept.push(entry);
}
kept.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

if (removed.length > 0) {
  fs.writeFileSync(IDX_IN, JSON.stringify(kept, null, 2));
  removed.forEach(e => console.log(`[index] DEDUP: removed ${e.file} (ticker ${e.ticker}, ${e.date})`));
}

// ── Task 7: Sync reports/ → public/reports/ ──
const rptFiles  = fs.readdirSync(REPORTS).filter(f => f.endsWith('.html') && f !== 'template.html');
const pubFiles  = new Set(fs.readdirSync(PUB_REP).filter(f => f.endsWith('.html') && f !== 'template.html'));

[...pubFiles].filter(f => !rptFiles.includes(f)).forEach(f => {
  fs.unlinkSync(path.join(PUB_REP, f));
  console.log(`[sync] Removed orphaned: ${f}`);
});
rptFiles.filter(f => !pubFiles.has(f)).forEach(f => {
  fs.copyFileSync(path.join(REPORTS, f), path.join(PUB_REP, f));
  console.log(`[sync] Copied: ${f}`);
});

// ── Process reports ──
const stats = {
  total: 0, missingSources: 0, missingTrend: 0,
  missingIsin: 0, isinMismatch: 0, personalHolder: 0, changed: 0,
};

for (const file of rptFiles) {
  if (file === 'template.html') continue;
  const filePath = path.join(REPORTS, file);
  const idxEntry = idxMap[file];
  const changed = processReport(filePath, idxEntry, allHistory);
  if (changed) stats.changed++;
}

for (const file of rptFiles) {
  if (file === 'template.html') continue;
  const filePath = path.join(REPORTS, file);
  const c        = fs.readFileSync(filePath, 'utf8');
  const idxEntry = idxMap[file];

  stats.total++;
  if (!c.includes('<h2>Sources</h2>')) stats.missingSources++;
  if (!c.includes('conviction-history-section')) stats.missingTrend++;
  if (!/<meta name="isin"/.test(c)) stats.missingIsin++;

  if (idxEntry) {
    const mIsin = c.match(/<meta name="isin" content="([^"]*)"/);
    const mExch = c.match(/<meta name="exchange_code" content="([^"]*)"/);
    const htmlIsin = mIsin ? mIsin[1] : '';
    const htmlExch = mExch ? mExch[1] : '';
    if (htmlIsin !== (idxEntry.isin || '') || htmlExch !== (idxEntry.exchange_code || '')) {
      stats.isinMismatch++;
    }
  }

  const bodyText = c.replace(/<[^>]+>/g, ' ');
  PERSONAL_RE.lastIndex = 0;
  if (PERSONAL_RE.test(bodyText)) stats.personalHolder++;
}

// Also sync public/ copies
for (const file of rptFiles) {
  if (file === 'template.html') continue;
  const pubPath = path.join(PUB_REP, file);
  if (fs.existsSync(pubPath)) {
    processReport(pubPath, idxMap[file], allHistory);
  }
}

// ── Task 6b: Regenerate public/reports-index.json ──
const pubList = kept
  .filter(e => e.isin && e.file)
  .map(e => ({
    ticker:        e.ticker,
    isin:          e.isin,
    exchange_code: e.exchange_code,
    rating:        (e.recommendation || 'HOLD').split('—')[0].trim(),
    company:       e.company,
    report_url:    `/reports/${e.file.replace('.html', '')}`,
    conviction:    e.conviction,
    summary:       e.summary,
    date:          e.date,
  }));

fs.writeFileSync(IDX_PUB, JSON.stringify(pubList, null, 2));
console.log(`[index] Regenerated public/reports-index.json (${pubList.length} entries)`);

// ── Task 8: Summary ──
console.log('\n=== VERIFICATION SUMMARY ===');
console.log(`Total live reports:           ${stats.total}`);
console.log(`Missing Sources section:      ${stats.missingSources}`);
console.log(`Missing conviction trend:    ${stats.missingTrend}`);
console.log(`Missing ISIN meta tag:        ${stats.missingIsin}`);
console.log(`ISIN/exchange meta mismatch:  ${stats.isinMismatch}`);
console.log(`Personal-holder phrasing:     ${stats.personalHolder}`);
console.log(`Duplicate tickers removed:   ${removed.length}`);
console.log(`Files changed (by script):   ${stats.changed}`);
console.log('===============================');
console.log('Done. No commits made.');
