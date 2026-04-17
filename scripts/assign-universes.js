/**
 * scripts/assign-universes.js
 *
 * Fetches universe memberships from the Google Sheet via GWS CLI, then
 * updates reports/index.json accordingly.
 *
 * Universe mapping (sheet value → index universe element):
 *   "Irish"                 → "irish"
 *   "UK"                   → "uk"
 *   "Fortune 100"          → "fortune100"
 *   "Fortune 101"          → "fortune101"
 *   "S&P 100"              → "sp100"
 *   "AIM"                  → "aim"
 *   "US"                   → "us"
 *   "EU"                   → "eu"
 *   "watchlist"            → always added
 *
 * Multi-value cells split and all applicable tags applied.
 * All entries keep "watchlist".
 *
 * Usage: node scripts/assign-universes.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const INDEX_PATH = path.join(__dirname, '..', 'reports', 'index.json');

function parseUniverseTag(raw) {
  if (!raw) return [];
  const tags = [];
  for (const p of raw.split(',').map(s => s.trim())) {
    if (p === 'Irish') tags.push('irish');
    else if (p === 'UK') tags.push('uk');
    else if (p === 'Fortune 100') tags.push('fortune100');
    else if (p === 'Fortune 101') tags.push('fortune101');
    else if (p === 'S&P 100') tags.push('sp100');
    else if (p === 'AIM') tags.push('aim');
    else if (p === 'US') tags.push('us');
    else if (p === 'EU') tags.push('eu');
  }
  return tags;
}

function normalise(ticker) {
  return ticker.replace(/^(NYSE|NASDAQ|LON:|LS ):/i, '').trim().toUpperCase();
}

async function run() {
  console.log('Fetching sheet via GWS...');

  // Call GWS CLI to get sheet data as JSON
  const raw = execSync(
    'gws sheets spreadsheets get --params \'{"spreadsheetId": "1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM", "includeGridData": true}\' --format json 2>/dev/null',
    { maxBuffer: 50 * 1024 * 1024 }
  ).toString('utf8');

  const sheet = JSON.parse(raw);
  const rowData = sheet?.sheets?.[0]?.data?.[0]?.rowData || [];
  const headers = rowData[0]?.values?.map(h => h?.formattedValue || '') || [];

  const tickerIdx    = headers.indexOf('Ticker');
  const univIdx      = headers.indexOf('universe');
  const univTagsIdx  = headers.indexOf('universe_tags');

  console.log(`Columns — Ticker:${tickerIdx}  universe:${univIdx}  universe_tags:${univTagsIdx}`);

  const sheetUniverses = {};
  let rowsWithData = 0;

  for (let i = 1; i < rowData.length; i++) {
    const vals = rowData[i]?.values || [];
    const rawTicker = vals[tickerIdx]?.formattedValue || '';
    if (!rawTicker) continue;
    const ticker = normalise(rawTicker);
    const univ  = vals[univIdx]?.formattedValue || '';
    const tags  = vals[univTagsIdx]?.formattedValue || '';
    const combined = [univ, tags].filter(Boolean).join(', ');
    const tagList = parseUniverseTag(combined);
    if (tagList.length > 0) {
      sheetUniverses[ticker] = new Set([...(sheetUniverses[ticker] || []), ...tagList]);
      rowsWithData++;
    }
  }

  console.log(`Sheet rows with universe data: ${rowsWithData} / ${rowData.length - 1}`);

  // Show top tag counts
  const tagCount = {};
  for (const tags of Object.values(sheetUniverses)) {
    for (const t of tags) {
      tagCount[t] = (tagCount[t] || 0) + 1;
    }
  }
  console.log('Tag counts:', JSON.stringify(tagCount));

  // Load index
  const idx = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));

  let updated = 0, unchanged = 0, notFound = 0;
  for (const entry of idx) {
    const key = entry.ticker.toUpperCase();
    const sheetTags = sheetUniverses[key] || new Set();
    const before = JSON.stringify(entry.universes || []);
    const merged = new Set([
      ...(entry.universes || []).filter(u => u !== 'watchlist'),
      ...sheetTags,
      'watchlist',
    ]);
    entry.universes = Array.from(merged).sort();
    if (JSON.stringify(entry.universes) !== before) updated++;
    else if (sheetTags.size > 0) unchanged++; // in sheet but no change
    else notFound++;
  }

  fs.writeFileSync(INDEX_PATH, JSON.stringify(idx, null, 2), 'utf8');

  console.log('\nDone.');
  console.log('  Updated  :', updated);
  console.log('  Unchanged:', unchanged);
  console.log('  Not found in sheet:', notFound);
  console.log('  Total    :', idx.length);
}

run().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
