#!/usr/bin/env node
'use strict';

/**
 * convert-edgar-filings.js
 *
 * One-time migration: converts existing research/{slug}/*.html EDGAR filings
 * to the three-layer format introduced in batch-edgar-filings.js v2.
 *
 * For each .html file found:
 *   - Creates Layer 1:  {baseName}.md         (full clean markdown)
 *   - Creates Layer 2:  {baseName}-mda.md      (MD&A, 10-K / 10-Q only)
 *                       {baseName}-business.md (10-K only)
 *                       {baseName}-risks.md    (10-K only)
 *                       NOTE: EX-99.1 exhibit for 8-K cannot be retroactively fetched
 *                             without the filing index — 8-Ks get Layer 1 + Layer 3 only.
 *   - Creates Layer 3:  {baseName}-xbrl.json   (XBRL financial data, if present)
 *   - Archives HTML to: research/{slug}/archive/{baseName}.html
 *   - Removes original  research/{slug}/{baseName}.html
 *
 * Safe to re-run: skips any filing where {baseName}.md already exists.
 *
 * Usage:
 *   node scripts/convert-edgar-filings.js              # convert all
 *   node scripts/convert-edgar-filings.js --ticker=MP  # single ticker
 *   node scripts/convert-edgar-filings.js --dry-run    # report only, no changes
 */

const fs   = require('fs');
const path = require('path');

const ROOT         = path.resolve(__dirname, '..');
const RESEARCH_DIR = path.join(ROOT, 'research');

const args          = process.argv.slice(2);
const TICKER_FILTER = (args.find(a => a.startsWith('--ticker='))?.split('=')[1] || '').toUpperCase() || null;
const DRY_RUN       = args.includes('--dry-run');

// ── Conversion functions (duplicated from batch-edgar-filings.js) ─────────────

function stripTags(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeEntities(text) {
  return (text || '')
    .replace(/&amp;/g,    '&')
    .replace(/&lt;/g,     '<')
    .replace(/&gt;/g,     '>')
    .replace(/&quot;/g,   '"')
    .replace(/&#x27;/g,   "'")
    .replace(/&#39;/g,    "'")
    .replace(/&apos;/g,   "'")
    .replace(/&nbsp;/g,   ' ')
    .replace(/&#160;/g,   ' ')
    .replace(/&mdash;/g,  '—')
    .replace(/&ndash;/g,  '–')
    .replace(/&hellip;/g, '...')
    .replace(/&ldquo;/g,  '"')
    .replace(/&rdquo;/g,  '"')
    .replace(/&lsquo;/g,  ''')
    .replace(/&rsquo;/g,  ''')
    .replace(/&#(\d+);/g,      (_, n)   => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function tableToMarkdown(tableHtml) {
  const rows = [];
  for (const rowMatch of tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [];
    for (const cellMatch of rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
      cells.push(decodeEntities(stripTags(cellMatch[1])).replace(/\|/g, '\\|').trim());
    }
    if (cells.length > 0) rows.push(cells);
  }
  if (rows.length === 0) return '';
  const maxCols = Math.max(...rows.map(r => r.length));
  const pad = row => { const r = [...row]; while (r.length < maxCols) r.push(''); return r; };
  const lines = [];
  lines.push('| ' + pad(rows[0]).join(' | ') + ' |');
  lines.push('| ' + Array(maxCols).fill('---').join(' | ') + ' |');
  for (let i = 1; i < rows.length; i++) lines.push('| ' + pad(rows[i]).join(' | ') + ' |');
  return lines.join('\n');
}

function htmlToMarkdown(html, metadata = {}) {
  let text = (html || '')
    .replace(/<script[\s\S]*?<\/script>/gi,       '')
    .replace(/<style[\s\S]*?<\/style>/gi,         '')
    .replace(/<!--[\s\S]*?-->/g,                  '')
    .replace(/<ix:header[\s\S]*?<\/ix:header>/gi, '')
    .replace(/<ix:hidden[\s\S]*?<\/ix:hidden>/gi, '');

  text = text
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, c) => `\n# ${decodeEntities(stripTags(c)).trim()}\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, c) => `\n## ${decodeEntities(stripTags(c)).trim()}\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, c) => `\n### ${decodeEntities(stripTags(c)).trim()}\n`)
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, c) => `\n#### ${decodeEntities(stripTags(c)).trim()}\n`)
    .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_, c) => `\n##### ${decodeEntities(stripTags(c)).trim()}\n`)
    .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_, c) => `\n###### ${decodeEntities(stripTags(c)).trim()}\n`);

  text = text.replace(/<table[\s\S]*?<\/table>/gi, m => '\n\n' + tableToMarkdown(m) + '\n\n');

  text = text
    .replace(/<p[^>]*>/gi,         '\n\n')
    .replace(/<\/p>/gi,            '\n\n')
    .replace(/<br\s*\/?>/gi,       '\n')
    .replace(/<hr\s*\/?>/gi,       '\n\n---\n\n')
    .replace(/<li[^>]*>/gi,        '\n- ')
    .replace(/<\/li>/gi,           '')
    .replace(/<\/?(ul|ol)[^>]*>/gi, '\n')
    .replace(/<\/?(div|section|article|main|aside)[^>]*>/gi, '\n')
    .replace(/<blockquote[^>]*>/gi, '\n> ')
    .replace(/<\/blockquote>/gi,   '\n')
    .replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**')
    .replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*')
    .replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => {
      const l = decodeEntities(stripTags(label)).trim();
      return l ? `[${l}](${href})` : href;
    });

  text = decodeEntities(stripTags(text))
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ').replace(/^ +/gm, '')
    .replace(/\n{4,}/g, '\n\n\n').trim();

  const meta = [];
  if (metadata.ticker)      meta.push(`ticker: ${metadata.ticker}`);
  if (metadata.formType)    meta.push(`form_type: ${metadata.formType}`);
  if (metadata.filingDate)  meta.push(`filing_date: ${metadata.filingDate}`);
  if (metadata.convertedAt) meta.push(`converted_at: ${metadata.convertedAt}`);
  if (metadata.layer)       meta.push(`layer: ${metadata.layer}`);
  if (metadata.note)        meta.push(`note: "${metadata.note}"`);

  const header = meta.length > 0 ? '---\n' + meta.join('\n') + '\n---\n\n' : '';
  return header + text;
}

function extractXbrlData(html) {
  const data = {};
  for (const m of (html || '').matchAll(
    /<ix:non(?:fraction|numeric)[^>]+name="([^"]+)"[^>]*contextref="([^"]*)"[^>]*>([\s\S]*?)<\/ix:non(?:fraction|numeric)>/gi
  )) {
    const val = parseFloat(m[3].replace(/<[^>]+>/g, '').replace(/,/g, '').trim());
    if (!isNaN(val) && !data[m[1]]) data[m[1]] = { value: val, context: m[2] };
  }
  for (const m of (html || '').matchAll(
    /<(us-gaap|dei|ifrs-full):(\w+)\s[^>]*contextRef="([^"]*)"[^>]*>([\s\S]*?)<\/(?:us-gaap|dei|ifrs-full):\w+>/gi
  )) {
    const concept = `${m[1]}:${m[2]}`;
    const val = parseFloat(m[4].replace(/<[^>]+>/g, '').replace(/,/g, '').trim());
    if (!isNaN(val) && !data[concept]) data[concept] = { value: val, context: m[3] };
  }
  return Object.keys(data).length > 0 ? data : null;
}

function extractSection(markdown, startPatterns, endPatterns) {
  const lines = markdown.split('\n');
  let inSection = false;
  const captured = [];
  for (const line of lines) {
    if (!inSection) {
      if (startPatterns.some(p => p.test(line))) { inSection = true; captured.push(line); }
      continue;
    }
    if (endPatterns.some(p => p.test(line))) break;
    captured.push(line);
  }
  return captured.join('\n').trim();
}

function extractSections(markdown, formType) {
  const nextItem = [
    /^#{1,3}\s+Item\s+[2-9]/i,
    /^#{1,3}\s+Item\s+1[^A\s]/i,
    /^#{1,3}\s+Part\s+[IV]+/i,
    /^#\s+[A-Z]/,
  ];
  const sections = {};
  if (formType === '10-K' || formType === '10-Q') {
    sections.mda = extractSection(markdown, [
      /^#{1,3}\s+.*management.{0,10}s?\s+discussion/i,
      /^#{1,3}\s+Item\s+2\.?\s*management/i,
      /^#{1,3}\s+Item\s+2\b/i,
    ], nextItem);
  }
  if (formType === '10-K') {
    sections.business = extractSection(markdown, [
      /^#{1,3}\s+Item\s+1\.?\s*business/i,
      /^#{1,3}\s+Item\s+1\b(?!A)/i,
      /^#{1,3}\s+Business\b/i,
    ], nextItem);
    sections.risks = extractSection(markdown, [
      /^#{1,3}\s+.*risk\s+factors/i,
      /^#{1,3}\s+Item\s+1A/i,
    ], nextItem);
  }
  return sections;
}

// ── Parse filing type and date from filename ──────────────────────────────────
// Expects: 8-K-20240101.html  |  10-Q-20240301.html  |  10-K-20231231.html
function parseFilename(filename) {
  const m = filename.match(/^(8-K|10-Q|10-K)-(\d{4}-?\d{2}-?\d{2})\.html$/);
  if (!m) return null;
  // Normalise date to YYYY-MM-DD with dashes
  const raw = m[2];
  const date = raw.length === 8
    ? `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`
    : raw;
  return { formType: m[1], filingDate: date };
}

// ── Derive ticker from slug directory ─────────────────────────────────────────
// Best effort — slug is company name lowercased with no punctuation.
// Used only for the YAML front matter in converted files.
function slugToLabel(slug) {
  return slug; // pass-through; we don't have the ticker symbol here without the sheet
}

// ── Convert one HTML file ─────────────────────────────────────────────────────
function convertFile(htmlPath, slug, ticker) {
  const filename = path.basename(htmlPath);
  const parsed   = parseFilename(filename);
  if (!parsed) {
    console.log(`  SKIP ${filename} — unrecognised filename pattern`);
    return { status: 'skip' };
  }

  const { formType, filingDate } = parsed;
  const baseName = `${formType}-${filingDate}`;
  const dir      = path.dirname(htmlPath);
  const archDir  = path.join(dir, 'archive');
  const mdPath   = path.join(dir, `${baseName}.md`);

  if (fs.existsSync(mdPath)) {
    console.log(`  SKIP ${baseName}.md already exists`);
    return { status: 'skip' };
  }

  if (DRY_RUN) {
    console.log(`  DRY  ${filename} → ${baseName}.md + sections + xbrl (archive ${baseName}.html)`);
    return { status: 'dry' };
  }

  const html = fs.readFileSync(htmlPath, 'utf8');
  const now  = new Date().toISOString();
  const meta = { ticker: ticker || slugToLabel(slug), formType, filingDate,
    convertedAt: now, note: 'migrated from HTML by convert-edgar-filings.js' };

  // Archive
  if (!fs.existsSync(archDir)) fs.mkdirSync(archDir, { recursive: true });
  fs.copyFileSync(htmlPath, path.join(archDir, filename));

  // Layer 1
  const markdown = htmlToMarkdown(html, { ...meta, layer: 1 });
  fs.writeFileSync(mdPath, markdown);
  console.log(`  CONV ${baseName}.md (${(markdown.length / 1024).toFixed(0)}KB)`);

  // Layer 3 — XBRL
  const xbrlData = extractXbrlData(html);
  if (xbrlData) {
    const xbrlPath = path.join(dir, `${baseName}-xbrl.json`);
    fs.writeFileSync(xbrlPath, JSON.stringify({
      ticker: ticker || slug, formType, filingDate,
      extractedAt: now, concepts: xbrlData,
    }, null, 2));
    console.log(`  XBRL ${baseName}-xbrl.json (${Object.keys(xbrlData).length} concepts)`);
  }

  // Layer 2 — sections
  if (formType === '10-K' || formType === '10-Q') {
    const sections = extractSections(markdown, formType);
    for (const [key, content] of Object.entries(sections)) {
      if (!content || content.length < 200) continue;
      const sectionPath = path.join(dir, `${baseName}-${key}.md`);
      const sectionFull = `---\nticker: ${ticker || slug}\nform_type: ${formType}\nfiling_date: ${filingDate}\nsection: ${key}\nlayer: 2\nextracted_at: ${now}\n---\n\n${content}`;
      fs.writeFileSync(sectionPath, sectionFull);
      console.log(`  SECT ${baseName}-${key}.md (${(content.length / 1024).toFixed(0)}KB)`);
    }
  }

  // Remove original HTML (now archived)
  fs.unlinkSync(htmlPath);
  console.log(`  ARCH ${filename} → archive/${filename}`);

  return { status: 'converted', baseName };
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log(`=== convert-edgar-filings.js | ticker=${TICKER_FILTER || 'all'} | dry-run=${DRY_RUN} ===\n`);

  if (!fs.existsSync(RESEARCH_DIR)) {
    console.error('ERROR: research/ directory not found');
    process.exit(1);
  }

  const slugDirs = fs.readdirSync(RESEARCH_DIR)
    .filter(d => fs.statSync(path.join(RESEARCH_DIR, d)).isDirectory() && d !== 'archive');

  let totalConverted = 0;
  let totalSkipped   = 0;
  let totalErrors    = 0;

  for (const slug of slugDirs) {
    // Optionally filter by ticker — attempt to match slug to ticker
    if (TICKER_FILTER) {
      const slugLower = slug.toLowerCase();
      const tickerLower = TICKER_FILTER.toLowerCase();
      // Very rough match: skip if slug does not contain the ticker (handles e.g. mpmaterialscorp → MP)
      if (!slugLower.startsWith(tickerLower) && !slugLower.includes(tickerLower)) {
        continue;
      }
    }

    const dir = path.join(RESEARCH_DIR, slug);
    const files = fs.readdirSync(dir)
      .filter(f => /^(8-K|10-K|10-Q)-\d{4,8}\.html$/.test(f))
      .sort();

    if (files.length === 0) continue;

    console.log(`[${slug}]`);
    for (const filename of files) {
      const htmlPath = path.join(dir, filename);
      try {
        const result = convertFile(htmlPath, slug, null);
        if (result.status === 'converted') totalConverted++;
        else totalSkipped++;
      } catch (e) {
        console.error(`  ERROR ${filename}: ${e.message}`);
        totalErrors++;
      }
    }
  }

  console.log(`\n=== Done | converted=${totalConverted} skipped=${totalSkipped} errors=${totalErrors} ===`);
  if (DRY_RUN) console.log('Dry run — no files were modified.');
}

main();
