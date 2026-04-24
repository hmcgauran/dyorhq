#!/usr/bin/env node
'use strict';
const { execSync } = require('child_process');
const SHEET_ID = '1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM';

function gwsGet(range) {
  const params = JSON.stringify({ spreadsheetId: SHEET_ID, range, valueRenderOption: 'FORMATTED_VALUE' });
  const raw = execSync(
    'gws sheets spreadsheets values get --params \'' + params + '\' --format=json',
    { encoding: 'utf8', maxBuffer: 50*1024*1024, timeout: 60000 }
  );
  return JSON.parse(raw.slice(raw.indexOf('{')));
}

// 1. Check rows 374-380 for existing content
console.log('=== Rows 374-380 ===');
const data = gwsGet('Sheet1!A374:U385');
for (let i = 1; i < data.values.length; i++) {
  console.log('Row ' + (373+i) + ': A=\"' + (data.values[i][0]||'') + '\" | U=\"' + (data.values[i][20]||'') + '\"');
}

// 2. Tag all untagged tickers in sheet with Space 60
console.log('\n=== Tagging all untagged ===');
const all = gwsGet('Sheet1!A1:U380');
const tIdx = 0, uIdx = 20;
const toTag = [];
for (let i = 1; i < all.values.length; i++) {
  const ticker = all.values[i][tIdx] || '';
  const universe = all.values[i][uIdx] || '';
  if (ticker && ticker !== 'Ticker' && !universe.trim()) {
    toTag.push({ row: i+1, ticker });
  }
}
console.log('Tickers to tag: ' + toTag.length);

// Batch tag all untagged
if (toTag.length > 0) {
  const batchData = toTag.map(r => ({
    range: 'Sheet1!U' + r.row + ':U' + r.row,
    values: [['Space 60']]
  }));
  const payload = JSON.stringify({ valueInputOption: 'USER_ENTERED', data: batchData });
  const raw = execSync(
    'gws sheets spreadsheets values batchUpdate --params \'' +
    JSON.stringify({ spreadsheetId: SHEET_ID }) +
    '\' --json=\'' + payload + '\'',
    { encoding: 'utf8', timeout: 60000 }
  );
  const result = JSON.parse(raw.slice(raw.indexOf('{')));
  const updated = result.responses?.filter(r => r.updatedCells > 0).length || 0;
  console.log('Tagged: ' + updated + ' rows');
}

// 3. Add 6 missing Space 60 tickers to empty A cells (starting row 374)
const newTickers = ['LUNR', 'GILT', 'VSAT', 'IRDM', 'GSAT', 'BKSY'];
// Check which rows are empty in A
const rowsData = gwsGet('Sheet1!A374:U400');
const emptyRows = [];
for (let i = 1; i < rowsData.values.length; i++) {
  if (!rowsData.values[i][0] || rowsData.values[i][0] === '') {
    emptyRows.push(374 + i - 1);
  }
}
console.log('\n=== Adding ' + newTickers.length + ' new tickers ===');
console.log('Empty rows available: ' + emptyRows.slice(0, newTickers.length).join(', '));

const addBatch = newTickers.map((ticker, idx) => ({
  range: 'Sheet1!A' + emptyRows[idx] + ':U' + emptyRows[idx],
  values: [[ticker, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'Space 60']]
}));

const addPayload = JSON.stringify({ valueInputOption: 'USER_ENTERED', data: addBatch });
const addRaw = execSync(
  'gws sheets spreadsheets values batchUpdate --params \'' +
  JSON.stringify({ spreadsheetId: SHEET_ID }) +
  '\' --json=\'' + addPayload + '\'',
  { encoding: 'utf8', timeout: 60000 }
);
const addResult = JSON.parse(addRaw.slice(addRaw.indexOf('{')));
const added = addResult.responses?.filter(r => r.updatedCells > 0).length || 0;
console.log('Added: ' + added + ' new tickers');
console.log('New rows: ' + newTickers.map((t, i) => t + ' -> row ' + emptyRows[i]).join(', '));