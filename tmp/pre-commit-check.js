#!/usr/bin/env node
/**
 * tmp/pre-commit-check.js
 *
 * Pre-commit checklist for new DYOR HQ reports.
 * Usage: node tmp/pre-commit-check.js [TICKER...]
 * If no tickers given, checks all entries in reports/index.json with today's date.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const TODAY = '2026-04-17';
const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const DATA_DIR = path.join(__dirname, '..', 'reports', 'data');
const RESEARCH_DIR = path.join(__dirname, '..', 'research');
const INDEX_PATH = path.join(__dirname, '..', 'reports', 'index.json');
const SHEET_ID = '1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM';

const REC_TIERS = [
  { min: 80, rec: 'BUY (STRONG)' },
  { min: 65, rec: 'BUY' },
  { min: 50, rec: 'OPPORTUNISTIC BUY' },
  { min: 30, rec: 'SPECULATIVE BUY' },
  { min: 0,  rec: 'AVOID' },
];

function recFromConviction(c) {
  const tier = REC_TIERS.find(t => c >= t.min);
  return tier ? tier.rec : 'AVOID';
}

function checkFile(name, path) {
  const exists = fs.existsSync(path);
  const size = exists ? fs.statSync(path).size : 0;
  return { name, exists, size };
}

function loadJson(path) {
  try { return JSON.parse(fs.readFileSync(path)); }
  catch { return null; }
}

function checkHtmlSections(html) {
  const sections = [
    'Executive Summary', 'Business Model', 'Financial Snapshot',
    'Recent Catalysts', 'Thesis Evaluation', 'Key Risks',
    'Who Should Own It', 'Recommendation', 'Entry',
    'Conviction Trend', 'Sources'
  ];
  return sections.filter(s => !html.includes(`<h2>${s}</h2>`));
}

async function fetchSheetPrice(ticker) {
  return new Promise((resolve) => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?ranges=Sheet1&includeGridData=true&key=${process.env.GOOGLE_SHEETS_API_KEY || ''}`;
    https.get(url, { headers: { 'User-Agent': 'DYOR-HQ' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const rows = JSON.parse(data).sheets?.[0]?.data?.[0]?.rowData || [];
          const headers = rows[0]?.values?.map(h => h?.formattedValue || '') || [];
          const tIdx = headers.indexOf('Ticker');
          const pIdx = headers.indexOf('price');
          for (const row of rows.slice(1)) {
            const vals = row?.values || [];
            const t = (vals[tIdx]?.formattedValue || '').replace(/^(NYSE|NASDAQ|EPA|ASX|LON):/, '').trim().toUpperCase();
            if (t === ticker) {
              resolve({ price: vals[pIdx]?.formattedValue || null, source: 'sheet' });
              return;
            }
          }
          resolve({ price: null, source: 'sheet_not_found' });
        } catch { resolve({ price: null, source: 'sheet_error' }); }
      });
    }).on('error', () => resolve({ price: null, source: 'sheet_error' }));
  });
}

function slugFor(ticker, data) {
  if (data?.slug) return data.slug.replace(/\.html$/, '');
  return ticker.toLowerCase().replace(/[^a-z0-9]/g, '') + '.html';
}

async function checkTicker(ticker) {
  const idx = loadJson(INDEX_PATH);
  const entry = idx?.find(e => e.ticker === ticker);
  const data = loadJson(path.join(DATA_DIR, `${ticker}.json`));
  const slug = slugFor(ticker, entry);
  const resDir = path.join(RESEARCH_DIR, slug.replace(/\.html$/, ''));
  const grokFile = path.join(resDir, `grok-${TODAY}.json`);
  const webFile = path.join(resDir, `web-${TODAY}.json`);
  const htmlFile = path.join(REPORTS_DIR, slug);

  console.log(`\n${'='.repeat(60)}`);
  console.log(` ${ticker}`);
  console.log('='.repeat(60));

  // 1. Price
  let priceSource = 'unknown';
  let price = entry?.price || data?.price || null;
  if (price) {
    priceSource = entry?.price ? 'index entry' : 'data JSON';
  }
  const sheetPrice = await fetchSheetPrice(ticker);
  if (sheetPrice.price && sheetPrice.price !== price) {
    console.log(`  [WARN] Price in index/JSON (${price}) differs from sheet (${sheetPrice.price})`);
    priceSource += ' vs sheet:' + sheetPrice.price;
  } else if (sheetPrice.price) {
    priceSource = 'sheet_confirmed';
  }
  console.log(`  [1] Price: ${price} (${priceSource})`);

  // 2. Grok
  const grok = loadJson(grokFile);
  const grokOk = !!grok;
  console.log(`  [2] Grok: ${grokOk ? `EXISTS (score=${grok.score}, signal=${grok.signal})` : 'MISSING'}`);

  // 3. Web research
  const web = loadJson(webFile);
  const webOk = !!web;
  console.log(`  [3] Web research: ${webOk ? `EXISTS (${(web.results||[]).length} results)` : 'MISSING'}`);

  // 4. Conviction framework
  const conviction = entry?.conviction || data?.conviction || null;
  const rec = entry?.recommendation || data?.recommendation || null;
  const expectedRec = conviction !== null ? recFromConviction(conviction) : null;
  const recCorrect = rec === expectedRec;
  console.log(`  [4] Conviction: ${conviction} | Recommendation: ${rec} | Expected: ${expectedRec} | ${recCorrect ? 'OK' : 'WRONG'}`);

  // Scenario table
  const secs = data?.sections?.thesisEvaluation || data?.sections?.['Thesis Evaluation'] || {};
  const scenarios = secs.scenarios || secs;
  if (scenarios && (scenarios.bull || scenarios.base || scenarios.bear)) {
    const bull = scenarios.bull || scenarios.Bull || {};
    const base = scenarios.base || scenarios.Base || {};
    const bear = scenarios.bear || scenarios.Bear || {};
    const bPct = bull.probability || bull.weight || 0;
    const baPct = base.probability || base.weight || 0;
    const bePct = bear.probability || bear.weight || 0;
    const bScore = bull.score || bull.priceTarget ? (bull.priceTarget ? parseFloat(String(bull.priceTarget).match(/[\d.]+/)?.[0] || '0') : (bull.score || 0)) : (bull.score || 0);
    const baScore = base.score || (base.priceTarget ? parseFloat(String(base.priceTarget).match(/[\d.]+/)?.[0] || '0') || 0 : (base.score || 0));
    const beScore = bear.score || (bear.priceTarget ? parseFloat(String(bear.priceTarget).match(/[\d.]+/)?.[0] || '0') || 0 : (bear.score || 0));
    const total = (bPct + baPct + bePct) / 100;
    const calcConv = Math.round((bPct/100 * (bScore||0) + baPct/100 * (baScore||0) + bePct/100 * (beScore||0)) / (total || 1));
    console.log(`  [4b] Scenario Framework:`);
    console.log(`       Bull:   ${bPct}% × ${bScore} = ${Math.round(bPct/100*bScore)}`);
    console.log(`       Base:   ${baPct}% × ${baScore} = ${Math.round(baPct/100*baScore)}`);
    console.log(`       Bear:   ${bePct}% × ${beScore} = ${Math.round(bePct/100*beScore)}`);
    console.log(`       Calculated conviction: ${calcConv} | Recorded: ${conviction}`);
  } else {
    console.log(`  [4b] Scenarios: NOT FOUND in JSON`);
  }

  // 5. HTML sections
  let htmlExists = fs.existsSync(htmlFile);
  if (!htmlExists) {
    // try alternate slug
    const altSlug = ticker.toLowerCase().replace(/[^a-z0-9]/g, '') + '.html';
    htmlExists = fs.existsSync(path.join(REPORTS_DIR, altSlug));
  }
  let missingSections = [];
  if (htmlExists) {
    const html = fs.readFileSync(htmlFile, 'utf8').slice(0, 50000);
    missingSections = checkHtmlSections(html);
  }
  console.log(`  [5] HTML: ${htmlExists ? `EXISTS (missing sections: ${missingSections.length === 0 ? 'none' : missingSections.join(', ')})` : 'MISSING'}`);

  // 6. Summary
  const summary = entry?.summary || data?.sections?.executiveSummary?.text || '';
  const hasArtefacts = /BUY\s*\.\s*BUY|---|\n{3,}| {2,}/.test(summary);
  console.log(`  [6] Summary: ${summary ? (hasArtefacts ? 'HAS ARTEFACTS' : 'clean, ' + summary.substring(0, 80) + '...') : 'EMPTY'}`);

  // 7. Build check — just report status
  const buildStatus = 'run npm run build manually';
  console.log(`  [7] Build: ${buildStatus}`);

  const allOk = price && grokOk && webOk && recCorrect && missingSections.length === 0 && !hasArtefacts && summary;
  console.log(`\n  OVERALL: ${allOk ? 'PASS' : 'ISSUES FOUND'}`);
  return allOk;
}

async function main() {
  const args = process.argv.slice(2);
  const idx = loadJson(INDEX_PATH);

  let tickers = args;
  if (tickers.length === 0) {
    tickers = (idx || []).filter(e => e.date === TODAY).map(e => e.ticker);
    console.log(`No tickers specified — checking all entries dated ${TODAY}:`, tickers.join(', ') || 'none');
  }

  if (tickers.length === 0) { console.log('Nothing to check.'); return; }

  const results = [];
  for (const t of tickers) {
    results.push(await checkTicker(t));
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(` SUMMARY: ${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
