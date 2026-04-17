#!/usr/bin/env node
/**
 * Generate research/index.md files from existing HTML reports.
 * Reads each report HTML, extracts key sections, writes index.md.
 */
const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '../reports');
const RESEARCH_DIR = path.join(__dirname, '../research');
const INDEX_PATH = path.join(REPORTS_DIR, 'index.json');

function extractHero(html) {
  // Try multiple patterns for date
  let date = '';
  const datePatterns = [
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{1,2}\s+\w+\s+\d{4})/,
  ];
  for (const p of datePatterns) {
    const m = html.match(p);
    if (m) { date = m[1]; break; }
  }

  const tickerMatch = html.match(/<div class="ticker-label">([^<]+)<\/div>/);
  const titleMatch = html.match(/<h1>([^<]+)<\/h1>/);
  const recMatch = html.match(/rec-badge[^>]*>\s*(\w+)/);
  const convMatch = html.match(/<div class="score[^"]*">\s*(\d+)<\/div>/);
  const priceMatch = html.match(/class="meta-item">\s*([£$€]?[\d.,]+[p]?)\s*<\/span>/);

  return {
    ticker: tickerMatch ? tickerMatch[1].trim() : '',
    title: titleMatch ? titleMatch[1].trim() : '',
    recommendation: recMatch ? recMatch[1].trim() : '',
    conviction: convMatch ? parseInt(convMatch[1]) : 0,
    price: priceMatch ? priceMatch[1].trim() : '',
    date
  };
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSection(html, sectionName) {
  // Match section by h2 heading
  const regex = new RegExp(`<section class="report-section"><h2>${sectionName}</h2>([\\s\\S]*?)(?=<section class="report-section">|<footer|</main|<div class="report-section conviction)`, 'i');
  const match = html.match(regex);
  if (!match) return '';
  return stripHtml(match[1]);
}

function extractScenarios(html) {
  const scenarios = [];
  const names = ['Bull', 'Base', 'Bear'];
  const cssClasses = ['bull', 'base', 'bear'];

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const css = cssClasses[i];
    const regex = new RegExp(`class="scenario-card scenario-${css}"[^>]*><h3>${name} Case[^<]*<\\/h3>([\\s\\S]*?)(?=<div class="scenario-card|</div>\\s*<div class="scenario-summary)`, 'i');
    const match = html.match(regex);
    if (match) {
      const rawText = stripHtml(match[1]);
      const weightMatch = rawText.match(/(\d+)\s*%\s*weight/i);
      const scoreMatch = rawText.match(/Score:\s*(\d+)/i);
      const recMatch = rawText.match(/Recommendation:\s*(\w+)/i);
      scenarios.push({
        name: name.toLowerCase(),
        weight: weightMatch ? parseInt(weightMatch[1]) : 0,
        score: scoreMatch ? parseInt(scoreMatch[1]) : 0,
        recommendation: recMatch ? recMatch[1] : '',
        summary: rawText.substring(0, 400)
      });
    }
  }
  return scenarios;
}

function extractRisks(html) {
  const risks = [];
  const match = html.match(/<ol>([\s\S]*?)<\/ol>/i);
  if (!match) return risks;
  const items = match[1].match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || [];
  items.forEach((item, i) => {
    const text = stripHtml(item);
    if (text && text.length > 10) {
      // Remove leading number and period
      const clean = text.replace(/^\d+[\.\)]\s*/, '');
      risks.push({ number: i + 1, text: clean });
    }
  });
  return risks;
}

function extractEntryFramework(html) {
  const match = html.match(/BUY\s+below\s+([^|<]+)\s*\|\s*HOLD\s+([^|<]+)\s*\|\s*REDUCE\s+([^\.<]+)/i);
  if (match) {
    return { buy: match[1].trim(), hold: match[2].trim(), reduce: match[3].trim() };
  }
  // Try alternate format
  const match2 = html.match(/BUY\s+below\s+([^.<]+).*?HOLD\s+([^.<]+).*?REDUCE\s+([^.<]+)/is);
  if (match2) {
    return { buy: match2[1].trim(), hold: match2[2].trim(), reduce: match2[3].trim() };
  }
  return null;
}

function generateIndexMd(hero, data) {
  const lines = [
    `# ${hero.title || hero.ticker}`,
    '',
    `**Ticker:** ${hero.ticker} | **Price:** ${hero.price} | **Date:** ${hero.date}`,
    `**Recommendation:** ${hero.recommendation} | **Conviction:** ${hero.conviction}/100`,
    '',
    '---',
    '',
    '## Executive Summary',
    data.execSummary || 'See report.',
    ''
  ];

  if (data.businessModel) {
    lines.push('## Business Model');
    lines.push(data.businessModel, '');
  }

  if (data.financialSnapshot) {
    lines.push('## Financial Snapshot');
    lines.push(data.financialSnapshot, '');
  }

  if (data.catalysts) {
    lines.push('## Recent Catalysts');
    lines.push(data.catalysts, '');
  }

  if (data.scenarios.length > 0) {
    lines.push('## Thesis Evaluation');
    for (const s of data.scenarios) {
      lines.push(`### ${s.name.charAt(0).toUpperCase() + s.name.slice(1)} Case (${s.weight}% weight)`);
      lines.push(`- **Score:** ${s.score}/100${s.recommendation ? ` | **Recommendation:** ${s.recommendation}` : ''}`);
      lines.push(`- ${s.summary}`);
      lines.push('');
    }
  }

  if (data.risks.length > 0) {
    lines.push('## Key Risks');
    for (const r of data.risks) {
      lines.push(`${r.number}. ${r.text}`);
    }
    lines.push('');
  }

  if (data.whoOwns) {
    lines.push('## Who Should Own It / Avoid It');
    lines.push(data.whoOwns, '');
  }

  const ef = data.entryFramework;
  if (ef) {
    lines.push('## Entry Framework');
    lines.push(`- **BUY** below ${ef.buy}`);
    lines.push(`- **HOLD** ${ef.hold}`);
    lines.push(`- **REDUCE** above ${ef.reduce}`);
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Research generated from report dated ${hero.date}. Update monthly.*`);

  return lines.join('\n');
}

async function main() {
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  const files = fs.readdirSync(REPORTS_DIR).filter(f => f.endsWith('.html'));

  let processed = 0, created = 0, updated = 0;

  for (const file of files) {
    const slug = file.replace('.html', '');
    const html = fs.readFileSync(path.join(REPORTS_DIR, file), 'utf8');
    const researchDir = path.join(RESEARCH_DIR, slug);

    const hero = extractHero(html);
    const execSummary = extractSection(html, 'Executive Summary');
    const businessModel = extractSection(html, 'Business Model');
    const financialSnapshot = extractSection(html, 'Financial Snapshot');
    const catalysts = extractSection(html, 'Recent Catalysts');
    const scenarios = extractScenarios(html);
    const risks = extractRisks(html);
    const whoOwns = extractSection(html, 'Who Should Own It');
    const entryFramework = extractEntryFramework(html);

    // Also try "Recommendation" section for entry framework
    const recSection = extractSection(html, 'Recommendation');
    const recEf = recSection.match(/BUY\s+below\s+([^|<]+)\s*\|\s*HOLD\s+([^|<]+)\s*\|\s*REDUCE\s+([^\.<]+)/i);
    const finalEf = entryFramework || (recEf ? { buy: recEf[1].trim(), hold: recEf[2].trim(), reduce: recEf[3].trim() } : null);

    const indexMd = generateIndexMd(hero, {
      execSummary, businessModel, financialSnapshot, catalysts,
      scenarios, risks, whoOwns, entryFramework: finalEf
    });

    const dirExists = fs.existsSync(researchDir);
    const indexMdPath = path.join(researchDir, 'index.md');

    if (!dirExists) {
      fs.mkdirSync(researchDir, { recursive: true });
      created++;
    } else {
      updated++;
    }

    fs.writeFileSync(indexMdPath, indexMd, 'utf8');
    processed++;

    if (processed % 50 === 0) {
      console.error(`Progress: ${processed}/${files.length} created:${created} updated:${updated}`);
    }
  }

  console.error(`Done: ${processed} reports. Created:${created} Updated:${updated}`);
}

main().catch(e => { console.error(e); process.exit(1); });
