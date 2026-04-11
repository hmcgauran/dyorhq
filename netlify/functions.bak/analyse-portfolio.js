/**
 * Netlify Function: analyse-portfolio
 *
 * Receives: { holdings: ParsedDEGIRORow[] }
 * Returns:  { matched: MatchedHolding[], unmatched: UnmatchedHolding[] }
 *
 * Matching priority:
 *   1. ISIN exact match against reports-index.json
 *   2. Ticker normalised match (strip exchange suffix)
 *
 * Fallback: if reports-index.json is unavailable (local dev), uses bundled index.
 */

const https = require('https');

const INDEX_URL = 'https://dyorhq.ai/reports-index.json';

// Bundled fallback index — used when deployed without the CDN index
// This is a minimal fallback; the preferred path is the live CDN fetch.
const FALLBACK_INDEX = [
  // Add key tickers as fallback so the function works even without the CDN
];

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'DYOR-HQ-Portfolio-Analyser/1.0' } }, res => {
      if (res.statusCode !== 200) return resolve(null);
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch (e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

function normaliseTicker(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/(:|-|\s)*(NYSE|NASDAQ|LSE|AMS|XET|EP|FS|SWX|BV|LN|US)$/i, '')
    .replace(/\s+/g, '')
    .trim()
    .toUpperCase();
}

function extractISIN(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase();
  // ISINs are 12 chars: 2 letters + 9 alphanumeric + 1 digit
  if (/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(s)) return s;
  return null;
}

async function getIndex() {
  // Try live CDN first
  const live = await fetchJSON(INDEX_URL);
  if (live && Array.isArray(live) && live.length > 0) return live;

  // Fall back to empty — unmatched holdings will be reported
  return [];
}

exports.handler = async function (event, context) {
  // CORS headers for browser access
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  let holdings = [];
  try {
    const body = JSON.parse(event.body || '{}');
    holdings = Array.isArray(body.holdings) ? body.holdings : [];
  } catch (e) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid JSON body. Send { holdings: [...] }' }),
    };
  }

  if (holdings.length === 0) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'No holdings provided. Send { holdings: [...] }' }),
    };
  }

  const index = await getIndex();

  // Build lookup maps
  const byISIN = {};
  const byTicker = {};
  index.forEach(entry => {
    if (entry.isin) byISIN[entry.isin.toUpperCase()] = entry;
    if (entry.ticker) byTicker[entry.ticker.toUpperCase()] = entry;
  });

  const matched = [];
  const unmatched = [];

  for (const row of holdings) {
    const raw = (row['Symbol/ISIN'] || row.Symbol || row.symbol || '').toString().trim();
    const name = (row.Product || row.name || row.Name || '').toString().trim();
    const localVal = row['Local value'] || row.localValue || row['LocalValue'] || '';
    const currency = row['Currency'] || row.currency || '';
    const exchange = row['Exchange'] || row.exchange || '';

    // Skip cash rows
    if (!name || name.toLowerCase().includes('cash') || name.toLowerCase().includes('ftx')) continue;

    const isin = extractISIN(raw);
    const normTicker = normaliseTicker(raw);

    let match = null;
    let matchType = null;

    if (isin && byISIN[isin.toUpperCase()]) {
      match = byISIN[isin.toUpperCase()];
      matchType = 'ISIN';
    } else if (normTicker && byTicker[normTicker]) {
      match = byTicker[normTicker];
      matchType = 'ticker';
    } else if (normTicker && byTicker[`${normTicker}.L`]) {
      match = byTicker[`${normTicker}.L`];
      matchType = 'ticker-LSE';
    } else if (normTicker && byTicker[`${normTicker}.PA`]) {
      match = byTicker[`${normTicker}.PA`];
      matchType = 'ticker-Euronext';
    }

    if (match) {
      matched.push({
        row: { Symbol: raw, Product: name, 'Local value': localVal, Currency: currency, Exchange: exchange },
        match: {
          ticker: match.ticker,
          isin: match.isin,
          exchange_code: match.exchange_code,
          rating: match.rating,
          recommendation: match.rating,
          conviction: match.conviction,
          company: match.company,
          report_url: match.report_url,
          summary: match.summary,
          matchType,
        },
      });
    } else {
      unmatched.push({
        row: { Symbol: raw, Product: name, 'Local value': localVal, Currency: currency, Exchange: exchange },
        ticker: normTicker || raw,
        isin,
        matchType: isin ? 'ISIN-no-match' : 'ticker-no-match',
      });
    }
  }

  // Compute summary stats
  const totalValue = matched.reduce((s, m) => s + parseFloat(m.row['Local value'] || 0), 0);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      matched,
      unmatched,
      summary: {
        total: matched.length + unmatched.length,
        matched: matched.length,
        unmatched: unmatched.length,
        totalLocalValue: totalValue,
        indexSize: index.length,
      },
    }),
  };
};
