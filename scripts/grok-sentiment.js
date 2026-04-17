/**
 * grok-sentiment.js — Grok/ xAI API integration for DYOR HQ
 *
 * Provides structured sentiment analysis for watchlist tickers using xAI's Grok API.
 * Supports two built-in tools:
 *   - x_search:   Search X/Twitter for social sentiment
 *   - web_search: Search the broader web for financial news
 *
 * Usage:
 *   const grok = require('./grok-sentiment.js');
 *   await grok.init({ apiKey: 'xai-...' });           // one-time init
 *   const result = await grok.sentiment('LPTH');      // returns { score, signal, sources, summary }
 *   const batch  = await grok.sentimentBatch(['LPTH', 'AVCT.L', 'COP']); // up to 10 at a time
 *
 * Environment variable fallback: XAI_API_KEY
 *
 * Score range: -100 (very negative) to +100 (very positive)
 * Signal:      'positive' | 'neutral' | 'negative'
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

// ─────────────────────────────────────────────
// Retry helper — exponential backoff, 3 attempts
// ─────────────────────────────────────────────
const MAX_ATTEMPTS = 3;
const INITIAL_DELAY_MS = 2000;

async function withRetry(fn, context) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        const delayMs = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  // All attempts failed — log to state/sentiment-failures.jsonl
  const stateDir = path.join(__dirname, '..', 'state');
  const failureLog = path.join(stateDir, 'sentiment-failures.jsonl');
  if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
  const entry = {
    timestamp: new Date().toISOString(),
    context: context || 'unknown',
    error: lastError.message,
  };
  fs.appendFileSync(failureLog, JSON.stringify(entry) + '\n', 'utf8');
  return null;
}

// ─────────────────────────────────────────────
// Default prompt template for financial sentiment
// ─────────────────────────────────────────────
const DEFAULT_PROMPT = `You are a financial sentiment analyst. Search for recent news, social media posts, and investor discussion about {TICKER}.
Return a structured JSON response with this exact shape:
{
  "score": number,        // -100 to +100 overall sentiment score
  "signal": string,      // "positive" | "neutral" | "negative"
  "key_themes": string[],// 3-5 dominant themes driving sentiment
  "sources_checked": string[],// X post counts, news articles found
  "summary": string,     // 2-3 sentence plain-English summary
  "recent_posts": [{     // up to 5 notable X/social posts
    "source": string,
    "date": string,
    "sentiment": string,
    "highlight": string
  }]
}`;

// ─────────────────────────────────────────────
// Core API call (responses endpoint, OpenAI-compatible)
// Wrapped with retry — returns null on final failure (caller handles null)
// ─────────────────────────────────────────────
async function grokChat(prompt, apiKey, tools) {
  return withRetry(async () => {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model: 'grok-4.20-reasoning',
        input: [{ role: 'user', content: prompt }],
        tools: tools || [{ type: 'web_search' }, { type: 'x_search' }],
        stream: false,
      });

      const parsedUrl = new URL('https://api.x.ai/v1/responses');
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };

      const req = https.request(options, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`Grok API ${res.statusCode}: ${data.substring(0, 200)}`));
          }
          try {
            const json = JSON.parse(data);
            const message = (json.output || [])
              .filter(o => o.role === 'assistant')
              .map(o => o.content.map(c => c.text || '').join(''))
              .join('\n');
            resolve(message);
          } catch (e) {
            reject(new Error(`Failed to parse Grok response: ${e.message} | raw: ${data.substring(0, 200)}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(60000, () => { req.destroy(); reject(new Error('Grok request timeout')); });
      req.write(body);
      req.end();
    });
  }, `grokChat`);
}

// ─────────────────────────────────────────────
// Parse JSON from Grok text output
// ─────────────────────────────────────────────
function parseSentiment(text) {
  const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1] || jsonMatch[0]);
    } catch {}
  }
  return {
    score: 0,
    signal: 'neutral',
    key_themes: [],
    summary: text.substring(0, 500),
    raw: true,
  };
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────
let apiKey = null;

const grokSentiment = {
  /**
   * Initialise with API key (call once at startup)
   * @param {string} opts.apiKey - xAI API key (defaults to XAI_API_KEY env var)
   */
  init(opts = {}) {
    apiKey = opts.apiKey || process.env.XAI_API_KEY;
    if (!apiKey) throw new Error('Grok sentiment: no API key provided and XAI_API_KEY not set');
  },

  /**
   * Get sentiment for a single ticker
   * @param {string} ticker
   * @param {object} opts
   * @param {string} opts.prompt - custom prompt override
   * @param {string[]} opts.tools - which tools to use (default: web_search + x_search)
   * @returns {object|null} sentiment result, or null if all retries failed
   */
  async sentiment(ticker, opts = {}) {
    if (!apiKey) throw new Error('Grok sentiment not initialised — call grok.init() first');
    const prompt = (opts.prompt || DEFAULT_PROMPT).replace('{TICKER}', ticker);
    const tools = opts.tools || [{ type: 'web_search' }, { type: 'x_search' }];
    const raw = await withRetry(async () => grokChat(prompt, apiKey, tools), `sentiment:${ticker}`);
    if (raw === null) return null;
    const result = parseSentiment(raw);
    result.ticker = ticker;
    result.fetchedAt = new Date().toISOString();
    return result;
  },

  /**
   * Get sentiment for multiple tickers (sequential, respects rate limits)
   * @param {string[]} tickers
   * @param {object} opts - passed to sentiment()
   * @returns {object[]} results array (null entries for failed calls)
   */
  async sentimentBatch(tickers, opts = {}) {
    const results = [];
    for (const ticker of tickers) {
      try {
        const r = await this.sentiment(ticker, opts);
        results.push(r); // r may be null — caller handles
      } catch (e) {
        results.push(null);
      }
      if (tickers.indexOf(ticker) < tickers.length - 1) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }
    return results;
  },
};

module.exports = grokSentiment;
