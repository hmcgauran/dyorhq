#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(ROOT, 'reports');
const PUBLIC_REPORTS_DIR = path.join(ROOT, 'public', 'reports');
const INDEX_PATH = path.join(REPORTS_DIR, 'index.json');
const PUBLIC_INDEX_PATH = path.join(ROOT, 'public', 'reports-index.json');

const SOURCE_BLOCK = '<ul><li><strong>Authoritative market data source:</strong> DYOR HQ Google Sheet workflow. Fields typically pulled via this route include live price, market capitalisation, 52-week range, EPS, P/E, volume, and other quote statistics used in the report.</li><li><strong>Company disclosures:</strong> Public company filings, regulatory announcements, investor presentations, and investor-relations materials where referenced in the analysis.</li><li><strong>Additional public sources:</strong> Any specifically cited third-party materials linked inline in the report.</li></ul>';

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function writeJson(p, data) { fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n'); }
function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }

function convictionColor(score) {
  if (score >= 75) return '#00ff88';
  if (score >= 60) return '#f0b429';
  if (score >= 45) return '#ff8c00';
  return '#ff4d4d';
}

function buildTrendBlock(row, history) {
  const points = history
    .filter(r => typeof r.conviction === 'number')
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (!points.length) return '';

  const width = 520, height = 180, pad = 24;
  const coords = points.map((p, i) => {
    const x = points.length === 1 ? width / 2 : pad + (i * (width - 2 * pad) / (points.length - 1));
    const y = height - pad - ((p.conviction / 100) * (height - 2 * pad));
    return { x, y, date: p.date, conviction: p.conviction };
  });
  const latest = points[points.length - 1].conviction;
  const prev = points.length > 1 ? points[points.length - 2].conviction : latest;
  const delta = latest - prev;
  const trendClass = delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral';
  const trendLabel = delta > 0 ? `Up ${delta} pts` : delta < 0 ? `Down ${Math.abs(delta)} pts` : 'Flat';
  const yTicks = [100, 75, 50, 25, 0];

  return `
          <div class="report-section conviction-history-section">
            <h2>Conviction Trend</h2>
            <p class="conviction-history-summary">Latest conviction: <strong>${latest}/100</strong>. Trend versus prior report: <strong class="${trendClass}">${trendLabel}</strong>.</p>
            <div class="conviction-history-chart">
              <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Conviction score trend for ${row.ticker}">
                ${yTicks.map(t => {
                  const y = height - pad - ((t / 100) * (height - 2 * pad));
                  return `<line x1="${pad}" y1="${y.toFixed(1)}" x2="${width - pad}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-width="1" />`;
                }).join('')}
                <polyline fill="none" stroke="${convictionColor(latest)}" stroke-width="3" points="${coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')}" />
                ${coords.map(c => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="4" fill="${convictionColor(c.conviction)}" />`).join('')}
                ${yTicks.map(t => {
                  const y = height - pad - ((t / 100) * (height - 2 * pad)) + 4;
                  return `<text x="8" y="${y.toFixed(1)}">${t}</text>`;
                }).join('')}
                ${coords.map(c => `<text x="${c.x.toFixed(1)}" y="176" text-anchor="middle">${c.date}</text>`).join('')}
              </svg>
            </div>
            <table class="conviction-history-table">
              <thead><tr><th>Report date</th><th>Conviction</th></tr></thead>
              <tbody>${points.map(p => `<tr><td>${p.date}</td><td>${p.conviction}</td></tr>`).join('')}</tbody>
            </table>
          </div>`;
}

function normaliseText(text, row, history) {
  if (row.isin) {
    if (text.includes('meta name="isin"')) {
      text = text.replace(/<meta name="isin" content="[^"]*">/, `<meta name="isin" content="${row.isin}">`);
      if (row.exchange_code && text.includes('meta name="exchange_code"')) {
        text = text.replace(/<meta name="exchange_code" content="[^"]*">/, `<meta name="exchange_code" content="${row.exchange_code}">`);
      }
    } else {
      text = text.replace('<meta charset="UTF-8">', `<meta name="isin" content="${row.isin}">\n  <meta name="exchange_code" content="${row.exchange_code || ''}">\n  <meta charset="UTF-8">`);
    }
  }

  const replacements = [
    [/\s*\(derived using GOOGLEFINANCE\)/gi, ''],
    [/\s*derived using GOOGLEFINANCE/gi, ''],
    [/\s*using the GOOGLEFINANCE function/gi, ''],
    [/\s*via GOOGLEFINANCE/gi, ''],
    [/Market data fields derived using the <strong>GOOGLEFINANCE<\/strong> function/gi, 'Authoritative market data source: DYOR HQ Google Sheet workflow'],
    [/Authoritative market data fields pulled from the Google Sheet used by the DYOR HQ workflow/gi, 'Authoritative market data source: DYOR HQ Google Sheet workflow'],
    [/£316\.7M \(derived using GOOGLEFINANCE\)/g, '£316.7M'],
    [/Investors with a cost basis substantially below the current price who can hold through volatility without forced-selling\./g, 'Investors who can hold through volatility without forced-selling.'],
    [/warranting a position reduction regardless of cost basis\./g, 'warranting a position reduction regardless of entry level.'],
    [/Existing holders with gains should maintain positions but trim if the price approaches \$200–\$212 \(the upper quartile of the 52-week range\)\./g, 'Existing holders should maintain positions but trim if the price approaches $200–$212 (the upper quartile of the 52-week range).'],
    [/Long-term holders with cost bases well below the current price can maintain exposure; new entrants should treat \$181 as an area to wait for a better entry, with the \$175–\$180 zone representing the base-case fair value zone\./g, 'Existing holders can maintain exposure; new entrants should treat $181 as an area to wait for a better entry, with the $175–$180 zone representing the base-case fair value zone.']
  ];
  replacements.forEach(([pattern, repl]) => { text = text.replace(pattern, repl); });

  const sourcesSection = `\n          <div class="report-section">\n            <h2>Sources</h2>\n            ${SOURCE_BLOCK}\n          </div>`;
  if (text.includes('<h2>Sources</h2>')) {
    text = text.replace(/\n\s*<div class="report-section">\s*<h2>Sources<\/h2>[\s\S]*?<\/div>(?=\n\s*<\/div>\n\s*<aside class="report-sidebar">)/, sourcesSection);
  } else {
    text = text.replace(/\n\s*<\/div>\n\s*<aside class="report-sidebar">/, `${sourcesSection}\n        </div>\n\n        <aside class="report-sidebar">`);
  }

  const trendBlock = buildTrendBlock(row, history);
  if (trendBlock) {
    if (text.includes('<h2>Conviction Trend</h2>')) {
      text = text.replace(/\n\s*<div class="report-section conviction-history-section">[\s\S]*?<\/div>(?=\n\s*<div class="report-section">\s*<h2>Sources<\/h2>)/, '\n' + trendBlock);
    } else if (text.includes('<h2>Sources</h2>')) {
      text = text.replace(/\n\s*<div class="report-section">\s*<h2>Sources<\/h2>/, `${trendBlock}\n\n          <div class="report-section">\n            <h2>Sources</h2>`);
    }
  }
  return text;
}

function syncReports() {
  for (const file of fs.readdirSync(REPORTS_DIR)) {
    if (!file.endsWith('.html') || file === 'template.html') continue;
    fs.copyFileSync(path.join(REPORTS_DIR, file), path.join(PUBLIC_REPORTS_DIR, file));
  }
}

function ensureCss() {
  const cssPath = path.join(ROOT, 'assets', 'css', 'main.css');
  const publicCssPath = path.join(ROOT, 'public', 'assets', 'css', 'main.css');
  const snippet = `\n.conviction-history-summary { color: var(--text-secondary); margin-bottom: 14px; }\n.conviction-history-summary .positive { color: var(--rec-buy); }\n.conviction-history-summary .negative { color: var(--rec-sell); }\n.conviction-history-summary .neutral { color: var(--text-secondary); }\n.conviction-history-chart { background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; margin: 16px 0; overflow-x: auto; }\n.conviction-history-chart svg { width: 100%; height: auto; min-width: 420px; }\n.conviction-history-chart text { fill: var(--text-secondary); font-size: 11px; font-family: var(--font-mono); }\n.conviction-history-table { width: 100%; border-collapse: collapse; margin-top: 12px; }\n.conviction-history-table th, .conviction-history-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); }\n.conviction-history-table th { color: var(--text-secondary); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }\n`;
  let css = fs.readFileSync(cssPath, 'utf8');
  if (!css.includes('.conviction-history-summary')) {
    css += snippet;
    fs.writeFileSync(cssPath, css);
    fs.writeFileSync(publicCssPath, css);
  }
}

function main() {
  ensureCss();
  let idx = readJson(INDEX_PATH);
  const latest = new Map();
  for (const row of idx) {
    if (!row.ticker || !row.file) continue;
    if (!exists(path.join(REPORTS_DIR, row.file))) continue;
    const current = latest.get(row.ticker);
    if (!current || String(row.date) > String(current.date)) latest.set(row.ticker, row);
  }
  idx = Array.from(latest.values()).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.ticker).localeCompare(String(b.ticker)));
  writeJson(INDEX_PATH, idx);

  const historyByTicker = new Map();
  for (const row of idx) {
    if (!historyByTicker.has(row.ticker)) historyByTicker.set(row.ticker, []);
    historyByTicker.get(row.ticker).push(row);
  }

  let changed = 0;
  for (const row of idx) {
    const p = path.join(REPORTS_DIR, row.file);
    if (!exists(p)) continue;
    const oldText = fs.readFileSync(p, 'utf8');
    const newText = normaliseText(oldText, row, historyByTicker.get(row.ticker) || [row]);
    if (newText !== oldText) {
      fs.writeFileSync(p, newText);
      changed++;
    }
  }

  syncReports();

  const pubIdx = idx.map(e => ({
    ticker: e.ticker,
    isin: e.isin || null,
    exchange_code: e.exchange_code || null,
    rating: (e.recommendation || 'HOLD').split('—')[0].trim(),
    company: e.company,
    report_url: `/reports/${path.basename(e.file, '.html')}`,
    conviction: e.conviction,
    summary: e.summary || '',
    date: e.date
  }));
  writeJson(PUBLIC_INDEX_PATH, pubIdx);

  const verify = dir => {
    let missingSources = 0, missingTrend = 0, missingIsin = 0;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.html') || file === 'template.html') continue;
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      if (!text.includes('<h2>Sources</h2>')) missingSources++;
      if (!text.includes('<h2>Conviction Trend</h2>')) missingTrend++;
      if (!text.includes('meta name="isin"')) missingIsin++;
    }
    return { missingSources, missingTrend, missingIsin };
  };

  const reports = verify(REPORTS_DIR);
  const publicReports = verify(PUBLIC_REPORTS_DIR);
  const dupCount = idx.length - new Set(idx.map(r => r.ticker)).size;

  console.log(JSON.stringify({
    changedFiles: changed,
    reports,
    publicReports,
    duplicateTickers: dupCount,
    indexedReports: idx.length
  }, null, 2));
}

main();
