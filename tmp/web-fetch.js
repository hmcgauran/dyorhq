/**
 * tmp/web-fetch.js
 * Fetch web search results for tickers and persist to research/{slug}/web-YYYY-MM-DD.json
 * Uses xAI Grok web_search tool for structured results.
 * Usage: node tmp/web-fetch.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const XAI_KEY = process.env.XAI_API_KEY;
const RESEARCH_BASE = path.join(__dirname, '..', 'research');
const DATE = '2026-04-17';

// ── Per-ticker search queries ─────────────────────────────────────────────────
const QUERIES = {
  DIS:   ['Walt Disney DIS Q1 2026 earnings results', 'Disney streaming profitability 2026', 'Disney parks attendance 2026'],
  GOOGL: ['Alphabet Google GOOGL Q1 2026 earnings results', 'Alphabet Google AI search 2026', 'YouTube advertising revenue 2026'],
  ALRIB: ['Riber ALRIB molecular beam epitaxy 2026', 'Riber SA MBE semiconductor 2026', 'ALRIB EPA stock news 2026'],
  TBN:   ['Tamboran TBN Beetaloo Basin gas 2026', 'Tamboran Resources ASX TBN 2026 FID', 'TBN Australian gas drilling 2026'],
};

const TICKERS = Object.keys(QUERIES);

// ── Grok web search via responses API ────────────────────────────────────────
function grokWebSearch(query) {
  return new Promise((resolve, reject) => {
    const prompt = `Search the web for: "${query}". Return a JSON array of search results, each with fields: title (string), url (string), snippet (string - 1-2 sentences). Limit 5 results. Format: [{\"title\":\"...\",\"url\":\"...\",\"snippet\":\"...\"},...]`;
    const body = JSON.stringify({
      model: 'grok-4.20-reasoning',
      input: [{ role: 'user', content: prompt }],
      tools: [{ type: 'web_search' }],
      stream: false,
    });
    const parsedUrl = new URL('https://api.x.ai/v1/responses');
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${XAI_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`Grok web search ${res.statusCode}: ${data.substring(0, 100)}`));
        try {
          const json = JSON.parse(data);
          const text = (json.output || [])
            .filter(o => o.role === 'assistant')
            .map(o => (o.content || []).map(c => c.text || '').join(''))
            .join('\n');
          // Try to parse JSON array from response
          const match = text.match(/\[[\s\S]*\]/);
          if (match) {
            resolve(JSON.parse(match[0]));
          } else {
            resolve([{ title: query, url: '', snippet: text.substring(0, 300) }]);
          }
        } catch (e) {
          reject(new Error('Parse error: ' + e.message + ' | raw: ' + data.substring(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

// ── Persist web results ────────────────────────────────────────────────────────
function saveWebResults(ticker, queries, allResults) {
  const slug = ticker.toLowerCase().replace(/[^a-z0-9]/g, '') + '.html';
  const dir = path.join(RESEARCH_BASE, slug.replace(/\.html$/, ''));
  const outFile = path.join(dir, `web-${DATE}.json`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const record = { ticker, date: DATE, queries, results: allResults };
  fs.writeFileSync(outFile, JSON.stringify(record, null, 2), 'utf8');
  return outFile;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  for (const ticker of TICKERS) {
    const queries = QUERIES[ticker];
    process.stdout.write(`[${ticker}] ${queries.length} queries... `);
    const allResults = [];
    for (const q of queries) {
      try {
        const results = await grokWebSearch(q);
        allResults.push(...(Array.isArray(results) ? results : []));
        process.stdout.write('.');
      } catch (e) {
        process.stdout.write('x');
      }
      await new Promise(r => setTimeout(r, 2000)); // 2s between queries
    }
    const outFile = saveWebResults(ticker, queries, allResults);
    console.log(` → ${allResults.length} results → ${path.basename(outFile)}`);
    await new Promise(r => setTimeout(r, 1500)); // 1.5s between tickers
  }
  console.log('\nAll web research persisted.');
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
