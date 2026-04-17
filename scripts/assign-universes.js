/**
 * scripts/assign-universes.js
 *
 * One-time script to assign universe tags to all index entries based on:
 *  - ISIN prefix (IE → irish, GB → uk)
 *  - Ticker lists (Fortune 100, S&P 100, manually-specified Irish ADRs)
 *
 * Usage: node scripts/assign-universes.js
 * Safe to run multiple times — idempotent.
 */

const fs = require('fs');
const path = require('path');

// ─── Fortune 100 (largest US companies by revenue — approx list) ───────────
const FORTUNE_100 = new Set([
  'WMT', 'AMZN', 'AAPL', 'XOM', 'BRK.B', 'CVX', 'JPM', 'BAC', 'MA', 'CVS',
  'ABC', 'UNH', 'McK', 'HUM', 'DELL', 'CI', 'ELV', 'WFC', 'AMGN', 'LLY',
  'PFE', 'MRK', 'TMO', 'COST', 'HD', 'DIS', 'ADBE', 'CRM', 'NFLX', 'INTC',
  'CSCO', 'AMD', 'NVDA', 'QCOM', 'TXN', 'AVGO', 'ORCL', 'IBM', 'NOW', 'INTU',
  'AMAT', 'LRCX', 'MU', 'KLAC', 'PANW', 'SNPS', 'CDNS', 'MCHP', 'ADI',
  'HON', 'GE', 'CAT', 'DE', 'BA', 'RTX', 'LMT', 'NOC', 'GD', 'UPS', 'FDX',
  'MMM', 'EMR', 'ETN', 'ITW', 'SWK', 'ROK', 'PH', 'XYL', 'ROST', 'WM',
  'RSG', 'NSC', 'CSX', 'UNP', 'F', 'GM', 'TM', 'RIVN', 'TSLA', 'ABBV',
  'GILD', 'VRTX', 'REGN', 'BIIB', 'MRNA', 'AZN', 'NVO', 'DXCM', 'ISRG',
  'BSX', 'SYK', 'MDT', 'EW', 'ZBS', 'COR', 'HCA', 'CNC', 'IQV', 'TEAM',
  'AEE', 'AEP', 'DUK', 'SO', 'D', 'EXC', 'XEL', 'WEC', 'ED', 'PEG', 'EIX',
]);

// ─── S&P 100 (approx — large-cap US names) ─────────────────────────────────
const SP100 = new Set([
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'JPM',
  'JNJ', 'V', 'UNH', 'PG', 'MA', 'HD', 'CVX', 'MRK', 'ABBV', 'LLY',
  'PEP', 'KO', 'COST', 'AVGO', 'TMO', 'CSCO', 'MCD', 'DHR', 'WFC', 'BAC',
  'ABT', 'CRM', 'ACN', 'NFLX', 'AMD', 'ADBE', 'TXN', 'QCOM', 'NKE', 'ORCL',
  'BMY', 'UPS', 'LIN', 'DIS', 'PM', 'NEE', 'RTX', 'HON', 'INTC', 'WMT',
  'IBM', 'CAT', 'BA', 'GE', 'GS', 'MS', 'AXP', 'BLK', 'SPGI', 'DE',
  'AMGN', 'GILD', 'ISRG', 'MDT', 'SYK', 'ZTS', 'VRTX', 'REGN', 'BKNG', 'CHTR',
  'ADI', 'FIS', 'KLAC', 'SNPS', 'CDNS', 'PANW', 'NOW', 'INTU', 'AMAT', 'MU',
  'LRCX', 'MCHP', 'APD', 'SHW', 'CMG', 'EL', 'AZO', 'ODFL', 'GWW', 'PCAR',
  'CARR', 'CTVA', 'EXC', 'XEL', 'ED', 'SO', 'DUK', 'AEP', 'WEC', 'NSC', 'UNP',
]);

// ─── Irish ADRs (ISIN doesn't start with IE ─────────────────────────────────
const IRISH_ADRS = new Set([
  'RYAAY',  // Ryan Holdings / Ryanair ADR — Irish airline, US listed
  'AIB',    // Allied Irish Banks ADR (if traded on US exchange)
  'CRH',    // CRH plc — Irish building materials, NYSE ADR
  'KRYA',   // KRYA Holdings (if applicable)
  'KYGA',   // Kyonox / Irish holding (verify)
]);

const idxPath = path.join(__dirname, '..', 'reports', 'index.json');
const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));

const stats = { total: 0, irish: 0, uk: 0, fortune100: 0, sp100: 0, unchanged: 0 };

for (const entry of idx) {
  stats.total++;
  const universes = new Set(entry.universes || ['watchlist']);

  // ISIN-based rules
  if (entry.isin) {
    if (entry.isin.startsWith('IE')) universes.add('irish');
    if (entry.isin.startsWith('GB')) universes.add('uk');
  }

  // Manual Irish ADR overrides
  if (IRISH_ADRS.has(entry.ticker)) universes.add('irish');

  // Fortune 100
  if (FORTUNE_100.has(entry.ticker)) universes.add('fortune100');

  // S&P 100
  if (SP100.has(entry.ticker)) universes.add('sp100');

  // Always keep watchlist
  universes.add('watchlist');

  const before = JSON.stringify(entry.universes);
  const after = Array.from(universes).sort();
  entry.universes = after;

  if (after.includes('irish')) stats.irish++;
  if (after.includes('uk')) stats.uk++;
  if (after.includes('fortune100')) stats.fortune100++;
  if (after.includes('sp100')) stats.sp100++;
  if (before === JSON.stringify(after)) stats.unchanged++;
}

fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2), 'utf8');

console.log('Universes assigned. Summary:');
console.log('  Total entries :', stats.total);
console.log('  Irish         :', stats.irish);
console.log('  UK            :', stats.uk);
console.log('  Fortune 100   :', stats.fortune100);
console.log('  S&P 100       :', stats.sp100);
console.log('  Unchanged     :', stats.unchanged);
