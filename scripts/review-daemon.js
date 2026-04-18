#!/usr/bin/env node
/**
 * DYOR HQ — Review Daemon
 * Watches state/review-queue.jsonl for new review requests from George.
 * Validates each report using GPT-4o (different model from George's MiniMax M2.7).
 * Posts verdict to Discord via webhook and writes result to state/review-results.jsonl.
 *
 * Setup:
 *   DISCORD_REVIEWER_WEBHOOK=https://discord.com/api/webhooks/... in .env
 *   OPENAI_API_KEY=... in .env
 *
 * Run: node scripts/review-daemon.js
 * Launchd: com.openclaw.dyorhq-review-daemon
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const ROOT = path.join(__dirname, '..');
const QUEUE_FILE = path.join(ROOT, 'state', 'review-queue.jsonl');
const RESULTS_FILE = path.join(ROOT, 'state', 'review-results.jsonl');
const PROCESSED_FILE = path.join(ROOT, 'state', 'review-processed.jsonl');
const POLL_INTERVAL_MS = 5000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WEBHOOK_URL = process.env.DISCORD_REVIEWER_WEBHOOK;

if (!OPENAI_API_KEY) {
  console.error('[reviewer] OPENAI_API_KEY not set — cannot start');
  process.exit(1);
}
if (!WEBHOOK_URL) {
  console.error('[reviewer] DISCORD_REVIEWER_WEBHOOK not set — cannot post to Discord');
  process.exit(1);
}

// Ensure state dir exists
fs.mkdirSync(path.join(ROOT, 'state'), { recursive: true });

// Load already-processed IDs to avoid double-processing
const processedIds = new Set();
if (fs.existsSync(PROCESSED_FILE)) {
  fs.readFileSync(PROCESSED_FILE, 'utf8').trim().split('\n').filter(Boolean).forEach(line => {
    try { const r = JSON.parse(line); if (r.id) processedIds.add(r.id); } catch {}
  });
}

const VALIDATOR_SYSTEM_PROMPT = `You are a strict quality reviewer for DYOR HQ investment reports. George (the analyst agent, model: MiniMax M2.7) generates these reports. Your job is to catch errors before they are committed.

Validate the following rules:

1. CONVICTION → RECOMMENDATION TIER must be correct:
   - 80+  → BUY (STRONG)
   - 65-79 → BUY
   - 50-64 → OPPORTUNISTIC BUY
   - 30-49 → SPECULATIVE BUY
   - <30   → AVOID
   Any other label is wrong.

2. Grok score must NOT be used directly as the conviction score. Conviction must come from a Bull/Base/Bear scenario-weighted sum. If conviction equals the Grok score exactly, flag it.

3. No position details in the report (Hugh's share count, average price, cost basis must never appear in public-facing content).

4. British English only — flag any American spellings (e.g. "analyze", "color", "behavior").

5. Report must have 11 sections. If section count is provided and wrong, flag it.

6. Price and market cap must not be raw unformatted numbers (e.g. "340209001480" is wrong, "$340B" is right).

Respond with ONE of:
✅ PASS — [TICKER] conviction [X]/100 → [RECOMMENDATION] is consistent. No issues found.

Or:
❌ [TICKER] — [issue 1] | [issue 2] | ...

Be terse. One line total. No explanation beyond the flag description.`;

async function callOpenAI(content) {
  const payload = JSON.stringify({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: VALIDATOR_SYSTEM_PROMPT },
      { role: 'user', content }
    ],
    max_tokens: 120,
    temperature: 0.1
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.choices?.[0]?.message?.content?.trim() || 'ERROR: no response');
        } catch { reject(new Error('OpenAI parse error: ' + data)); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function postToDiscord(message) {
  const payload = JSON.stringify({
    username: 'DYOR Reviewer',
    avatar_url: 'https://cdn.discordapp.com/embed/avatars/3.png',
    content: message
  });

  const url = new URL(WEBHOOK_URL);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      res.resume();
      res.on('end', resolve);
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function processEntry(entry) {
  const { id, ticker, conviction, recommendation, grokScore, sectionCount, summary, reportPath, timestamp } = entry;

  console.log(`[reviewer] Processing ${ticker} (conviction ${conviction}, rec ${recommendation})`);

  const userMessage = [
    `Ticker: ${ticker}`,
    `Conviction score: ${conviction}/100`,
    `Recommendation: ${recommendation}`,
    grokScore !== undefined ? `Grok score (input only): ${grokScore}` : null,
    sectionCount !== undefined ? `Section count: ${sectionCount}` : null,
    summary ? `Summary: ${summary}` : null,
    reportPath ? `Report path: ${reportPath}` : null,
    `Generated at: ${timestamp}`
  ].filter(Boolean).join('\n');

  let verdict;
  try {
    verdict = await callOpenAI(userMessage);
  } catch (err) {
    verdict = `⚠️ ${ticker} — Reviewer error: ${err.message}`;
  }

  // Write to results file
  const result = { id, ticker, conviction, recommendation, verdict, reviewedAt: new Date().toISOString() };
  fs.appendFileSync(RESULTS_FILE, JSON.stringify(result) + '\n');

  // Mark as processed
  fs.appendFileSync(PROCESSED_FILE, JSON.stringify({ id, ticker, processedAt: new Date().toISOString() }) + '\n');
  processedIds.add(id);

  // Post to Discord
  const discordMsg = `**[DYOR Reviewer]** ${verdict}`;
  try {
    await postToDiscord(discordMsg);
    console.log(`[reviewer] Posted to Discord: ${verdict}`);
  } catch (err) {
    console.error(`[reviewer] Discord post failed: ${err.message}`);
  }
}

async function poll() {
  if (!fs.existsSync(QUEUE_FILE)) return;

  const lines = fs.readFileSync(QUEUE_FILE, 'utf8').trim().split('\n').filter(Boolean);
  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (!entry.id || processedIds.has(entry.id)) continue;
    await processEntry(entry);
  }
}

console.log(`[reviewer] DYOR Review Daemon started — polling every ${POLL_INTERVAL_MS / 1000}s`);
setInterval(() => poll().catch(err => console.error('[reviewer] Poll error:', err.message)), POLL_INTERVAL_MS);
poll().catch(err => console.error('[reviewer] Initial poll error:', err.message));
