#!/usr/bin/env node
/**
 * scripts/grok-rescore-all.js
 *
 * Re-scores every ticker in index.json with the updated Grok sentiment prompt.
 * Does NOT fetch Google Sheet or FMP data — only re-runs Grok and updates
 * reports/data/{TICKER}.json grok fields.
 * After completion, run recalc-conviction.js to propagate new scores.
 *
 * Usage: node scripts/grok-rescore-all.js [--from TICKER] [--limit N]
 *   --from TICKER  Resume from a specific ticker (alphabetical order)
 *   --limit N      Process at most N tickers (for testing)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs   = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const INDEX_PATH  = path.join(__dirname, '..', 'reports', 'index.json');
const DATA_DIR    = path.join(__dirname, '..', 'reports', 'data');
const RESEARCH_DIR = path.join(__dirname, '..', 'research');
const STATE_DIR   = path.join(__dirname, '..', 'state');
const CKPT_PATH   = path.join(STATE_DIR, 'grok-rescore-checkpoint.json');
const TODAY       = new Date().toISOString().slice(0, 10);
const API_KEY     = process.env.XAI_API_KEY;
const PREFIX_RE   = /^(NYSE|NASDAQ|EPA|ASX|LON|LSE |FRA|CVE|BME|TSE|TSX):/i;

const DELAY_MS    = 1500; // ms between Grok calls — stay within rate limits

// ── Args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const fromIdx = args.indexOf('--from');
const fromTicker = fromIdx >= 0 ? args[fromIdx + 1] : null;
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function saveJson(p, d) { fs.writeFileSync(p, JSON.stringify(d, null, 2), 'utf8'); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function mkdir(p) { try { fs.mkdirSync(p, { recursive: true }); } catch {} }

function companyToSlug(company) {
  return (company || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ── Grok API call ─────────────────────────────────────────────────────────────
const MAX_ATTEMPTS = 3;

async function grokChat(prompt) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await new Promise((resolve, reject) => {
        const body = JSON.stringify({
          model: 'grok-4.20-reasoning',
          input: [{ role: 'user', content: prompt }],
          tools: [{ type: 'web_search' }, { type: 'x_search' }],
          stream: false,
        });

        const parsedUrl = new URL('https://api.x.ai/v1/responses');
        const options = {
          hostname: parsedUrl.hostname,
          path: parsedUrl.pathname,
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        };

        const req = https.request(options, res => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            if (res.statusCode !== 200) {
              return reject(new Error(`Grok API ${res.statusCode}: ${data.substring(0, 300)}`));
            }
            try {
              const json = JSON.parse(data);
              const message = (json.output || [])
                .filter(o => o.role === 'assistant')
                .map(o => (Array.isArray(o.content) ? o.content : []).map(c => c.text || '').join(''))
                .join('\n');
              resolve(message);
            } catch (e) {
              reject(new Error(`Parse error: ${e.message} | raw: ${data.substring(0, 200)}`));
            }
          });
        });

        req.on('error', reject);
        req.setTimeout(90000, () => { req.destroy(); reject(new Error('timeout')); });
        req.write(body);
        req.end();
      });
      return result;
    } catch (err) {
      console.error(`    Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${err.message}`);
      if (attempt < MAX_ATTEMPTS) await sleep(3000 * attempt);
    }
  }
  return null;
}

// ── Parse Grok JSON from response text ────────────────────────────────────────
function parseGrokJson(text) {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*"score"[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

// ── Grok prompt ────────────────────────────────────────────────────────────────
function buildPrompt(ticker, company) {
  const label = company ? `${ticker} (${company})` : ticker;
  return `You are a balanced investment analyst assessing market sentiment for ${label}. Search for recent news, earnings updates, analyst commentary, X/social posts, and investor discussion — actively looking for BOTH positive and negative signals.

Score on a -100 to +100 scale where:
  +70 to +100 = strong positive momentum: earnings beats, upgrades, major catalysts, broad bullish sentiment
  +30 to +69  = net positive: more good news than bad, moderate optimism
  -29 to +29  = mixed or neutral: positive and negative roughly balanced, or limited recent coverage
  -30 to -69  = net negative: material concerns, downgrades, missed targets, or bearish sentiment
  -70 to -100 = strongly negative: profit warnings, distress signals, heavy selling, or serious red flags

Search for positive signals: earnings beats, revenue growth, new contracts, partnerships, analyst upgrades, strong guidance, positive product news, insider buying.
Search for negative signals: profit warnings, revenue misses, margin compression, dilution, debt stress, downgrades, insider selling, regulatory risk, competitive threats, negative price action.

Score 0 only if coverage is genuinely balanced or absent. Do not anchor to positive — if bad news exists, reflect it.

Return a structured JSON response with this exact shape:
{
  "score": number,
  "signal": "positive" | "neutral" | "negative",
  "key_themes": ["theme1", "theme2", "theme3"],
  "sources_checked": ["source1", "source2"],
  "summary": "2-3 sentence plain-English summary; name the biggest risk if any",
  "recent_posts": [{"source": "string", "date": "string", "sentiment": "string", "highlight": "string"}]
}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!API_KEY) { console.error('ERROR: XAI_API_KEY not set in .env'); process.exit(1); }

  const idx = loadJson(INDEX_PATH);
  if (!idx) { console.error('ERROR: could not load index.json'); process.exit(1); }

  // Sort alphabetically by ticker for consistent resumption
  const sorted = [...idx].sort((a, b) => a.ticker.localeCompare(b.ticker));

  // Apply --from filter
  let tickers = sorted;
  if (fromTicker) {
    const startIdx = sorted.findIndex(e => e.ticker.toUpperCase() >= fromTicker.toUpperCase());
    if (startIdx < 0) { console.error(`--from ticker "${fromTicker}" not found`); process.exit(1); }
    tickers = sorted.slice(startIdx);
    console.log(`Resuming from ${fromTicker} (index ${startIdx})`);
  }

  // Apply --limit
  if (isFinite(limit)) tickers = tickers.slice(0, limit);

  // Load checkpoint — skip tickers already processed today
  let ckpt = {};
  try { ckpt = JSON.parse(fs.readFileSync(CKPT_PATH, 'utf8')); } catch {}
  if (ckpt.date === TODAY) {
    const before = tickers.length;
    tickers = tickers.filter(t => t.ticker !== ckpt.last);
    console.log(`[CHECKPOINT] Resuming from next after "${ckpt.last}" (${before} → ${tickers.length} tickers)`);
  }

  console.log(`=== Grok Rescore — ${tickers.length} tickers ===`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  const results = { ok: 0, failed: 0, skipped: 0 };
  const failures = [];

  for (let i = 0; i < tickers.length; i++) {
    const entry = tickers[i];
    const ticker = entry.ticker;
    const tickerNorm = ticker.replace(PREFIX_RE, '').trim().toUpperCase();
    const company = entry.company || '';
    const dataPath = path.join(DATA_DIR, tickerNorm + '.json');

    process.stdout.write(`[${i + 1}/${tickers.length}] ${ticker.padEnd(16)} `);

    const data = loadJson(dataPath);
    if (!data) {
      console.log('SKIP (no data JSON)');
      results.skipped++;
      continue;
    }

    const prompt = buildPrompt(ticker, company);
    const raw = await grokChat(prompt);
    const parsed = parseGrokJson(raw);

    if (!parsed || typeof parsed.score !== 'number') {
      console.log('FAIL (bad response)');
      failures.push({ ticker, error: raw ? raw.substring(0, 100) : 'null response' });
      results.failed++;
    } else {
      // Update data JSON grok fields
      data.grok = {
        score: parsed.score,
        signal: parsed.signal || (parsed.score > 10 ? 'positive' : parsed.score < -10 ? 'negative' : 'neutral'),
        keyThemes: parsed.key_themes || [],
        summary: parsed.summary || '',
        bullCase: data.grok?.bullCase || '',
        bearCase: data.grok?.bearCase || '',
        sources: (parsed.sources_checked || []).join(', '),
        rescored: TODAY,
      };
      saveJson(dataPath, data);

      // Persist raw Grok file to research dir
      const slug = companyToSlug(company || ticker);
      const researchPath = path.join(RESEARCH_DIR, slug);
      mkdir(researchPath);
      saveJson(path.join(researchPath, `grok-${TODAY}.json`), { ticker, company, generatedAt: new Date().toISOString(), ...parsed });

      console.log(`score=${String(parsed.score).padStart(4)}  signal=${parsed.signal || '?'}`);
      results.ok++;
    }

    // Save checkpoint after each ticker
    fs.writeFileSync(CKPT_PATH, JSON.stringify({ date: TODAY, last: ticker }), 'utf8');

    if (i < tickers.length - 1) await sleep(DELAY_MS);
  }

  console.log(`\n=== Complete ===`);
  console.log(`OK: ${results.ok}  Failed: ${results.failed}  Skipped: ${results.skipped}`);
  console.log(`Finished: ${new Date().toISOString()}`);

  if (failures.length > 0) {
    const failPath = path.join(STATE_DIR, `grok-rescore-failures-${TODAY}.json`);
    saveJson(failPath, failures);
    console.log(`\nFailures written to: ${failPath}`);
  }

  console.log('\nNext step: node scripts/recalc-conviction.js');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
