#!/usr/bin/env node
/**
 * SCORES.json manifest manager
 * One source of truth for all conviction scores across the report library.
 * Supports unlimited tickers, tracks score history with timestamps.
 *
 * Usage:
 *   node update-scores-manifest.js              # Rebuild from all HTML reports
 *   node update-scores-manifest.js AMD 74 81    # Update AMD: new score 74, reason "Q1 beat"
 */

const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = path.join(__dirname, '..', 'public', 'scores-manifest.json');

// ---- Scoring thresholds ----
const BANDS = { BUY: 80, HOLD: 60, REDUCE: 40 };
function scoreToBand(score) {
  if (score >= BANDS.BUY)    return 'BUY';
  if (score >= BANDS.HOLD)   return 'HOLD';
  if (score >= BANDS.REDUCE) return 'REDUCE';
  return 'SELL';
}
function deltaLabel(delta) {
  if (delta > 0)  return `+${delta}`;
  if (delta < 0)  return `${delta}`;
  return '0';
}

// ---- Load existing manifest ----
function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch { return {}; }
}

// ---- Save manifest ----
function saveManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`[scores] Saved ${MANIFEST_PATH} (${Object.keys(manifest).length} tickers)`);
}

// ---- Build from index.json ----
function buildFromIndex() {
  const indexPath = path.join(__dirname, '..', 'reports', 'index.json');
  if (!fs.existsSync(indexPath)) { console.error('[scores] index.json not found'); return; }

  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const manifest = loadManifest();

  let updated = 0, created = 0;

  index.forEach(entry => {
    if (!entry.ticker || entry.conviction === null) return;
    const t     = entry.ticker;
    const score = parseInt(entry.conviction, 10);
    const band  = scoreToBand(score);

    if (!manifest[t]) {
      manifest[t] = { ticker: t, history: [], current: null };
    }

    const existing = manifest[t].current;
    const entryDate = entry.date || today;

    if (!existing || existing.score !== score) {
      const delta = existing ? score - existing.score : 0;
      manifest[t].history.push({
        date:    entryDate,
        score,
        band,
        delta:   deltaLabel(delta),
        reason:  existing ? 'Score revision' : 'Initial coverage',
      });
      manifest[t].current = { score, band, date: entryDate, delta: deltaLabel(delta) };
      manifest[t].updated = today;
      updated++;
    }
    if (!existing) created++;
  });

  // Sort history newest-first
  Object.values(manifest).forEach(t => {
    t.history.sort((a, b) => (a.date < b.date ? 1 : -1));
  });

  saveManifest(manifest);
  console.log(`[scores] Built from index: ${created} new tickers, ${updated} score changes`);
}

// ---- Manual update: node update-scores-manifest.js TICKER NEW_SCORE REASON ----
function manualUpdate(ticker, newScore, reason) {
  const manifest = loadManifest();
  const today    = new Date().toISOString().slice(0, 10);
  const score    = parseInt(newScore, 10);
  const band     = scoreToBand(score);
  ticker = ticker.toUpperCase();

  if (!manifest[ticker]) {
    manifest[ticker] = { ticker, history: [], current: null };
  }

  const existing = manifest[ticker].current;
  const delta = existing ? score - existing.score : 0;

  manifest[ticker].history.push({
    date:   today,
    score,
    band,
    delta:  deltaLabel(delta),
    reason: reason || 'Manual update',
  });
  manifest[ticker].history.sort((a, b) => (a.date < b.date ? 1 : -1));
  manifest[ticker].current = { score, band, date: today, delta: deltaLabel(delta), reason: reason || 'Manual update' };
  manifest[ticker].updated = today;

  saveManifest(manifest);
  console.log(`[scores] ${ticker}: ${existing ? existing.score + '→' : ''}${score} (${band}) — ${reason || 'Manual update'}`);
}

// ---- CLI ----
const [, , cmd, arg2, arg3, ...rest] = process.argv;
if (!cmd || cmd === 'build') {
  buildFromIndex();
} else {
  manualUpdate(cmd, arg2, arg3);
}
