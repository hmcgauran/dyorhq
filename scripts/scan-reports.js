/**
 * scan-reports.js — DYOR HQ v2
 *
 * Scans the reports/ directory and rebuilds the canonical index from
 * actual HTML files. This is the authoritative source of truth for
 * which reports exist, replacing any derivation from partial Sheet rows.
 *
 * Run after generating new reports:
 *   node scripts/scan-reports.js
 */

const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '..', 'reports');

const TEMPLATE_FILE = 'template.html';

const EXCHANGE_RE = /\s*[·•|·]\s*(LN|LS|NA|US|EU|PA|VI|BV|OL|F|BV|AS|AT|SM|RM|T|SX|TO|V|CX|NC)\s*$/i;

function extractMeta(html) {
  const tickerMatch = html.match(/<meta\s+name="isin"\s+content="([^"]+)"/i);
  const exchangeMatch = html.match(/<meta\s+name="exchange_code"\s+content="([^"]+)"/i);

  // Ticker from filename is more reliable than ISIN for our tickers
  // ISIN gives us the exchange
  const isin = tickerMatch ? tickerMatch[1] : null;
  const exchange = exchangeMatch ? exchangeMatch[1].toUpperCase() : null;

  // Extract ticker from ticker-label div (strip exchange suffix like "· LN")
  const tickerMeta = html.match(/<div class="ticker-label">([^<]+)<\/div>/);
  const rawTicker = tickerMeta ? tickerMeta[1].trim().toUpperCase() : null;
  const ticker = rawTicker ? rawTicker.replace(EXCHANGE_RE, '').trim() : null;

  // Extract company name
  const companyMatch = html.match(/<h1>([^<]+)<\/h1>/);
  const company = companyMatch ? companyMatch[1].trim() : null;

  // Extract recommendation
  const recMatch = html.match(/<span class="rec-badge[^"]*">([^<]+)<\/span>/);
  const recommendation = recMatch ? recMatch[1].trim().toUpperCase() : null;

  // Extract conviction score
  const convMatch = html.match(/conviction-display[^>]*>[\s\S]*?<div class="score"[^>]*>([^<]+)<\/div>/);
  const conviction = convMatch ? parseInt(convMatch[1].trim(), 10) : null;

  // Extract date from meta-item or report date
  const dateMatch = html.match(/(\d{1,2}\s+\w+\s+2026)/);
  const date = dateMatch ? dateMatch[1] : null;

  // Extract summary from Executive Summary section
  const summaryMatch = html.match(/<h2>Executive Summary<\/h2>[\s\S]*?<p>([^<]+)/);
  const summary = summaryMatch ? summaryMatch[1].trim().replace(/<[^>]+>/g, '').slice(0, 200) : null;

  // Extract price
  const priceMatch = html.match(/meta-item">\$([^<]+)<\/span>/);
  const price = priceMatch ? parseFloat(priceMatch[1].replace(/[,+$]/g, '')) : null;

  return { ticker, company, recommendation, conviction, date, summary, price, isin, exchange };
}

function buildIndex() {
  const files = fs.readdirSync(REPORTS_DIR).filter(f =>
    f.endsWith('.html') && f !== TEMPLATE_FILE
  );

  const entries = [];
  const errors = [];

  files.forEach(file => {
    if (file === TEMPLATE_FILE) return;
    const ticker = file.split('-')[0].toUpperCase();
    const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
    const datePublished = dateMatch ? dateMatch[1] : null;

    try {
      const html = fs.readFileSync(path.join(REPORTS_DIR, file), 'utf-8');
      const meta = extractMeta(html);
      const entry = {
        ticker: meta.ticker || ticker,
        company: meta.company || null,
        file,
        recommendation: meta.recommendation || null,
        conviction: meta.conviction || null,
        summary: meta.summary || null,
        date: meta.date || datePublished,
        datePublished,
        lastRefreshed: new Date().toISOString(),
        priceStored: meta.price || null,
        sector: null,
        exchange: meta.exchange || null,
        isin: meta.isin || null,
        universes: ['watchlist'] // default; will be overridden by enrich-index for sheet-listed tickers
      };
      entries.push(entry);
    } catch (e) {
      errors.push({ file, error: e.message });
    }
  });

  return { entries, errors };
}

// ─── Main ────────────────────────────────────────────

const { entries, errors } = buildIndex();

console.log(`[scan] Found ${entries.length} reports`);
if (errors.length) {
  console.warn('[scan] Errors:');
  errors.forEach(e => console.warn(' ', e.file, ':', e.error));
}

// Deduplicate: keep latest datePublished per ticker
const latest = {};
entries.forEach(e => {
  const key = e.ticker;
  if (!latest[key] || (e.datePublished > latest[key].datePublished)) {
    latest[key] = e;
  }
});
const deduplicated = Object.values(latest);
console.log(`[scan] Deduplicated: ${entries.length} -> ${deduplicated.length} unique tickers`);

// Sort by ticker
deduplicated.sort((a, b) => String(a.ticker || '').localeCompare(String(b.ticker || '')));

const CANONICAL_INDEX = path.join(__dirname, '..', 'reports', 'index.json');
fs.writeFileSync(CANONICAL_INDEX, JSON.stringify(deduplicated, null, 2));
console.log(`[scan] Wrote ${deduplicated.length} entries to ${CANONICAL_INDEX}`);
