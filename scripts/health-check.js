#!/usr/bin/env node
'use strict';

/**
 * scripts/health-check.js
 * Post-deploy health check.
 * Fetches https://dyorhq.ai/reports-index.json, compares live count
 * against local canonical index count, and exits 1 on mismatch.
 */

const { readJson } = require('./site-manifest');
const CANONICAL_INDEX_PATH = require('./site-manifest').CANONICAL_INDEX_PATH;

async function main() {
  const canonical = readJson(CANONICAL_INDEX_PATH);
  const localCount = canonical.length;

  const LIVE_URL = process.env.HEALTH_CHECK_URL || 'https://dyorhq.ai/reports-index.json';

  let live;
  try {
    const response = await fetch(LIVE_URL);
    if (!response.ok) {
      console.error(`[HEALTH] ERROR: received HTTP ${response.status} from ${LIVE_URL}`);
      process.exit(1);
    }
    live = await response.json();
  } catch (err) {
    console.error(`[HEALTH] ERROR: could not fetch dyorhq.ai/reports-index.json — ${err.message}`);
    process.exit(1);
  }

  const liveCount = Array.isArray(live) ? live.length : 0;

  if (liveCount !== localCount) {
    console.error(`[HEALTH] MISMATCH: live=${liveCount}, local=${localCount}`);
    process.exit(1);
  }

  console.log(`[HEALTH] OK: ${liveCount} reports live`);
}

main();
