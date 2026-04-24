#!/usr/bin/env node
'use strict';

/**
 * fix-space60.js
 *
 * Fixes Space 60 universe tagging in the Google Sheet:
 *   1. Corrects autofill errors (Space 61–66 → Space 60) for LUNR–BKSY
 *   2. Removes "Space 60" from tickers not on the official list
 *   3. Ensures all official Space 60 tickers are correctly tagged
 *
 * Reads current sheet rows via gws, calculates exact row numbers, then
 * applies all corrections in a single batchUpdate call.
 *
 * Usage: node scripts/fix-space60.js [--dry-run]
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const SHEET_ID  = '1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM';
const DRY_RUN   = process.argv.includes('--dry-run');

// Official Space 60 list — bare tickers (no exchange prefix)
const OFFICIAL_SPACE60 = new Set([
  'MP','ALM','FCX','AA','TECK','CRS','ATI','MTRN','GLW','HXL','PKE',
  'LIN','APD','AI','NEU','ADI','STM','IFX','MCHP','QRVO','MRCY','TTMI',
  'AVGO','COHR','LITE','NVDA','TDY','RBC','PH','AME','APH','APTV',
  'MOG.A','GHM','KRMN','HON','RDW','RKLB','BA','NOC','MDA','YSS',
  'LMT','KTOS','FLY','VOYG','LUNR','RTX','GILT','VSAT','ASTS',
  'SESG','ETL','IRDM','AMZN','GSAT','PL','BKSY','SPIR','TSAT',
]);

function bare(t) {
  return (t || '').replace(/^(NYSE|NASDAQ|EPA|ASX|LON|LSE|FRA|CVE|BME|TSE|TSX|HKEX|OTCMKTS):/i, '').trim().toUpperCase();
}

function gwsGet(range) {
  const raw = execSync(
    `gws sheets spreadsheets values get --params '${JSON.stringify({
      spreadsheetId: SHEET_ID, range, valueRenderOption: 'FORMATTED_VALUE'
    })}' --format=json`,
    { encoding: 'utf8', timeout: 30000 }
  );
  const start = raw.indexOf('{');
  return JSON.parse(raw.slice(start));
}

function gwsBatchUpdate(data) {
  const payload = JSON.stringify({
    valueInputOption: 'USER_ENTERED',
    data: data.map(({ row, universe, tags }) => [
      { range: `Sheet1!U${row}`, values: [[universe]] },
      { range: `Sheet1!AA${row}`, values: [[tags]] },
    ]).flat(),
  });
  const raw = execSync(
    `gws sheets spreadsheets values batchUpdate --params '{"spreadsheetId":"${SHEET_ID}"}' --json='${payload}'`,
    { encoding: 'utf8', timeout: 60000 }
  );
  const start = raw.indexOf('{');
  if (start === -1) return;
  const result = JSON.parse(raw.slice(start));
  if (result.error) throw new Error('batchUpdate error: ' + JSON.stringify(result.error));
  return result;
}

function main() {
  console.log(`=== fix-space60.js | dry-run=${DRY_RUN} ===\n`);

  // Fetch columns A (ticker), U (universe), AA (universe_tags)
  console.log('Fetching sheet columns A, U, AA...');
  const colA  = gwsGet('Sheet1!A:A').values || [];
  const colU  = gwsGet('Sheet1!U:U').values || [];
  const colAA = gwsGet('Sheet1!AA:AA').values || [];

  // Find column header row (should be row 1)
  const headers = colA[0] || [];

  const fixes = [];

  for (let i = 1; i < colA.length; i++) {
    const rowNum    = i + 1; // 1-indexed sheet row (row 1 = header)
    const ticker    = (colA[i]?.[0] || '').trim();
    if (!ticker) continue;

    const bareTicker = bare(ticker);
    const universe   = (colU[i]?.[0]  || '').trim();
    const tags       = (colAA[i]?.[0] || '').trim();

    const hasSpaceTag  = /space\s*6\d/i.test(universe) || /space\s*6\d/i.test(tags);
    const isOfficial   = OFFICIAL_SPACE60.has(bareTicker);

    if (!hasSpaceTag && !isOfficial) continue; // nothing to do

    // Determine correct universe value
    // Keep all existing non-space tags, then add/remove Space 60 as appropriate
    const existingTags = universe.split(',').map(s => s.trim()).filter(s => !/space\s*6\d/i.test(s) && s);
    const newTags      = isOfficial
      ? [...existingTags, 'Space 60'].join(', ')
      : existingTags.join(', ');

    if (newTags === universe) continue; // already correct

    fixes.push({
      rowNum, ticker, bareTicker,
      from: universe,
      to:   newTags,
      universe: newTags,
      tags: newTags,
      row: rowNum,
    });
  }

  if (fixes.length === 0) {
    console.log('No fixes needed — sheet is correct.');
    return;
  }

  console.log(`Found ${fixes.length} rows to fix:\n`);
  for (const f of fixes) {
    console.log(`  Row ${f.rowNum}: ${f.ticker}`);
    console.log(`    FROM: "${f.from}"`);
    console.log(`    TO:   "${f.to}"`);
  }

  if (DRY_RUN) {
    console.log('\nDry run — no changes made.');
    return;
  }

  console.log('\nApplying fixes...');
  gwsBatchUpdate(fixes);

  console.log(`\nDone. ${fixes.length} rows updated.`);
  console.log('Run sync-sheet.js then assign-universes.js to propagate changes.');
}

main();
