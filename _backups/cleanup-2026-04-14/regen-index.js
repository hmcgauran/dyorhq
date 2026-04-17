const fs = require('fs');
const path = require('path');

const REPORTS_DIR = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq/reports';
const OUTPUT_FILE = path.join(REPORTS_DIR, 'index.json');

const EXCLUDES = ['template.html', 'report-template.html'];

const MONTH_MAP = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
};

function parseDate(str) {
  const m = str.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${MONTH_MAP[m[2]]}-${m[1].padStart(2, '0')}`;
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function getAttr(haystack, tag, attr) {
  const re = new RegExp(`<${tag}([^>]*)>`, 'i');
  const m = haystack.match(re);
  return m ? (m[1].match(new RegExp(`${attr}=["']([^"']*)["']`)) || [])[1] || null : null;
}

function extractField(html, tag, cls) {
  const re = new RegExp(`<${tag}[^>]*class=["'][^"']*${cls}[^"']*["'][^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = html.match(re);
  return m ? stripHtml(m[1]) : null;
}

function extractFirst(haystack, tag, cls) {
  const re = new RegExp(`<${tag}(?:[^>]*class=["'][^"']*${cls}[^"']*["'])?[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  const m = haystack.match(re);
  return m ? stripHtml(m[0]) : null;
}

function extractTickerLabel(html) {
  const re = /<div[^>]*class=["'][^"']*ticker-label[^"']*["'][^>]*>([\s\S]*?)<\/div>/i;
  const m = html.match(re);
  return m ? stripHtml(m[1]) : null;
}

function extractCompany(h1) {
  const m = h1.match(/^[A-Z.\-]+ - (.+)/);
  return m ? m[1].trim() : h1;
}

function extractRecBadge(html) {
  const re = /<span[^>]*class=["'][^"']*rec-badge[^"']*rec-(\w+)["'][^>]*>/i;
  const m = html.match(re);
  return m ? m[1] : null;
}

function extractScore(html) {
  const re = /<div[^>]*class=["'][^"']*score[^"']*rec-\w+["'][^>]*>([\s\S]*?)<\/div>/i;
  const m = html.match(re);
  return m ? stripHtml(m[1]) : null;
}

function extractDate(html) {
  const re = /<span[^>]*class=["'][^"']*meta-item["'][^>]*>(\d{1,2}\s+\w{3}\s+\d{4})<\/span>/i;
  const m = html.match(re);
  return m ? parseDate(m[1]) : null;
}

function extractSummary(html) {
  const re = /<section[^>]*class=["'][^"']*report-section["'][^>]*>[\s\S]*?<h2>Executive Summary<\/h2>[\s\S]*?<p>([\s\S]*?)<\/p>/i;
  const m = html.match(re);
  if (!m) return '';
  return stripHtml(m[1]).substring(0, 300);
}

function getExchange(ticker) {
  if (!ticker) return { exchange_code: null, exchange: null };
  if (ticker.endsWith('.L')) return { exchange_code: 'LN', exchange: 'LN' };
  if (ticker.endsWith('.IR')) return { exchange_code: 'IR', exchange: 'IR' };
  return { exchange_code: null, exchange: null };
}

function processFile(filename) {
  const filePath = path.join(REPORTS_DIR, filename);
  const html = fs.readFileSync(filePath, 'utf8');

  const ticker = extractTickerLabel(html);
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1Text = h1Match ? stripHtml(h1Match[1]) : '';
  const company = extractCompany(h1Text);
  const recommendation = extractRecBadge(html);
  const conviction = extractScore(html);
  const date = extractDate(html);
  const summary = extractSummary(html);

  const { exchange_code, exchange } = getExchange(ticker);

  return {
    ticker: ticker || null,
    company: company || null,
    recommendation: recommendation || null,
    conviction: conviction || null,
    date: date || null,
    summary: summary || '',
    file: filename,
    report_url: `/reports/${filename}`,
    isin: null,
    exchange_code,
    exchange,
    universes: ['watchlist']
  };
}

const files = fs.readdirSync(REPORTS_DIR).filter(f => f.endsWith('.html') && !EXCLUDES.includes(f));

const entries = [];
const warnings = [];

for (const file of files) {
  try {
    const entry = processFile(file);
    entries.push(entry);
  } catch (e) {
    warnings.push(`WARN: ${file}: ${e.message}`);
    entries.push({
      ticker: null, company: null, recommendation: null, conviction: null,
      date: null, summary: '', file, report_url: `/reports/${file}`,
      isin: null, exchange_code: null, exchange: null, universes: ['watchlist']
    });
  }
}

entries.sort((a, b) => (a.ticker || '').localeCompare(b.ticker || ''));

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(entries, null, 2));

console.log(`Entries: ${entries.length}`);
console.log(`Warnings: ${warnings.length}`);
warnings.forEach(w => console.log(w));
console.log('\nFirst 3 entries:');
console.log(JSON.stringify(entries.slice(0, 3), null, 2));
