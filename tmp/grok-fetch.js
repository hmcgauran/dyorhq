/**
 * tmp/grok-fetch.js
 * Fetch Grok sentiment for specified tickers, persist to research/{slug}/grok-2026-04-17.json
 * Usage: node tmp/grok-fetch.js
 */
const fs = require('fs');
const path = require('path');

const grok = require('../scripts/grok-sentiment');
const XAI_KEY = process.env.XAI_API_KEY;
grok.init({ apiKey: XAI_KEY });

const TICKERS = ['DIS', 'GOOGL', 'ALRIB', 'TBN'];
const RESEARCH_BASE = path.join(__dirname, '..', 'research');
const DATE = '2026-04-17';

async function slugFor(ticker) {
  return ticker.toLowerCase().replace(/[^a-z0-9]/g, '') + '.html';
}

async function run() {
  const results = [];
  for (const ticker of TICKERS) {
    const slug = await slugFor(ticker);
    const dir = path.join(RESEARCH_BASE, slug.replace(/\.html$/, ''));
    const outFile = path.join(dir, `grok-${DATE}.json`);

    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    process.stdout.write(`Fetching ${ticker}... `);
    const r = await grok.sentiment(ticker);
    if (!r) {
      console.log('NULL');
      results.push({ ticker, status: 'null' });
    } else {
      const record = {
        ticker: r.ticker,
        date: DATE,
        score: r.score,
        signal: r.signal,
        key_themes: r.key_themes || [],
        sources: r.sources_checked || [],
        summary: r.summary || '',
        fetchedAt: r.fetchedAt,
      };
      fs.writeFileSync(outFile, JSON.stringify(record, null, 2), 'utf8');
      console.log(`score=${r.score} signal=${r.signal} → ${outFile}`);
      results.push({ ticker, score: r.score, signal: r.signal, path: outFile });
    }
  }

  console.log('\nDone. Summary:');
  for (const r of results) {
    console.log(`  ${r.ticker}: ${r.score !== undefined ? `score=${r.score} (${r.signal})` : 'NULL'}`);
  }
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
