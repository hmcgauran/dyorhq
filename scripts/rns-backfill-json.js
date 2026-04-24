#!/usr/bin/env node
// rns-backfill-json.js — generates .json files from existing RNS .md files

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RESEARCH_DIR = path.join(ROOT, 'research');
const DRY_RUN = process.argv.includes('--dry-run');

// Same keyword scoring as rns-watcher.js
const BROAD_CRITICAL = ['profit warning', 'trading halt', 'suspension', 'insolvent', 'administration', 'liquidation', 'merger', 'acquisition', 'takeover', 'delisting', 'bankruptcy'];
const BROAD_ALERT = ['fundraising', 'placing', 'open offer', 'rights issue', 'financing', 'joint venture', 'partnership', 'contract', 'award', 'approval', 'FDA', 'EMA', 'clinical trial', 'phase', 'data readout', 'capital raise', 'issue of shares'];
const TICKER_KEYWORDS = {
  'ALK.L': ['fid', 'final investment decision', 'financing', 'ara partners', 'binding', 'construction', 'fund', 'offtake', 'glencore', 'wates'],
  'AVCT.L': ['aacr', 'ava6103', 'ava6000', 'ava6207', 'faridoxorubicin', 'pre|cision', 'clinical', 'data', 'partnership', 'licence', 'placing', 'nasdaq', 'dual listing', 'acquisition'],
  'PXEN.L': ['poland', 'licence', 'san', 'dunajec', 'selva', 'viura', 'romeral', 'production', 'fund', 'gas', 'tennessee', 'development'],
  'MKA.L': ['dfc', 'financing', 'nasdaq', 'offtake', 'mkar', 'spac', 'crown', 'songwe', 'pulawy', 'construction', 'funding', 'strategic', 'rare earth', 'REE'],
};

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60);
}

function scoreAnnouncement(ticker, title) {
  const tickerKeywords = TICKER_KEYWORDS[ticker] || [];
  const lower = title.toLowerCase();
  const criticalHits = BROAD_CRITICAL.filter(k => lower.includes(k));
  const tickerHits = tickerKeywords.filter(k => lower.includes(k));
  const alertHits = BROAD_ALERT.filter(k => lower.includes(k));
  const score = criticalHits.length * 2 + tickerHits.length + alertHits.length * 0.5;
  return { score, hits: [...criticalHits, ...tickerHits, ...alertHits] };
}

function toMaterialityScore(watcherScore) {
  if (watcherScore >= 5) return 10;
  if (watcherScore >= 4) return 9;
  if (watcherScore >= 3) return 8;
  if (watcherScore >= 2) return 6;
  if (watcherScore >= 1) return 4;
  return 1;
}

function labelFromScore(score) {
  if (score >= 8) return 'MATERIAL';
  if (score >= 5) return 'WATCH';
  if (score >= 3) return 'LOW';
  return 'ROUTINE';
}

function parseMarkdownMeta(md) {
  const lines = md.split('\n');
  const meta = {};
  for (const line of lines) {
    const m = line.match(/^\*\*([A-Za-z ]+):\*\*\s*(.+)$/);
    if (m) meta[m[1].trim()] = m[2].trim();
    if (line.startsWith('# ') && !meta.headline) {
      meta.headline = line.slice(2).trim();
      break;
    }
  }
  return meta;
}

const TICKER_SLUG_MAP = {
  alkemycapitalinvestmentsplc: 'ALK.L', avactagroupplc: 'AVCT.L', prospexenergyplc: 'PXEN.L',
  mkangoresourcesltd: 'MKA.L', birgbankofirelandgroupplc: 'BIRG.L', glencoreplc: 'GLEN.L',
  unileverplc: 'ULVR.L', hsbcholdingsplc: 'HSBA.L', lloydsbankinggroupplc: 'LLOY.L',
  diageoplc: 'DGE.L', greatlandgoldplc: 'GGP.L', wishbonegoldplc: 'WSBN.L',
  zephyrenergyplc: 'ZPHR.L', ondoinsurtechplc: 'ONDO.L', blockenergyplc: 'BLOE.L',
  eutelsatcommunicationssa: 'ETL.L', someroenterprisesinc: 'SOM.L', volexplc: 'VLT.L',
  tristelplc: 'TSTL.L', restoreplc: 'RST.L', sciencegroupplc: 'SAG.L',
  yougovplc: 'YOU.L', teaminternetgroupplc: 'TIG.L', rwsholdingsplc: 'RWS.L',
  tattonassetmanagementplc: 'TAM.L', sericaenergyplc: 'SQZ.L', thorexplorationsltd: 'THX.L',
  tracsisplc: 'TRCS.L', renewholdingsplc: 'RNWH.L', unipharplc: 'UPR.L',
  nicholsplc: 'NICL.L', rockhopperexplorationplc: 'RKH.L', sylvaniaplatinumltd: 'SLP.L',
  panthermetalsplc: 'PALM.L', landonresources: 'LND.L', conocophillips: 'COP',
};

function tickerFromSlug(slug) {
  return TICKER_SLUG_MAP[slug] || (slug.replace(/-/g, '').toUpperCase().substring(0, 4) + '.L');
}

// Scan research dirs for RNS subdirectories
const researchDirs = fs.readdirSync(RESEARCH_DIR, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => e.name);

let total = 0, skipped = 0, written = 0;

for (const slug of researchDirs) {
  const rnsDir = path.join(RESEARCH_DIR, slug, 'rns');
  if (!fs.existsSync(rnsDir)) continue;

  for (const file of fs.readdirSync(rnsDir)) {
    if (!file.endsWith('.md')) continue;
    total++;
    const mdPath = path.join(rnsDir, file);
    const jsonPath = mdPath.replace(/\.md$/, '.json');

    if (fs.existsSync(jsonPath)) { skipped++; continue; }

    const md = fs.readFileSync(mdPath, 'utf8');
    const meta = parseMarkdownMeta(md);
    const ticker = meta.Ticker || tickerFromSlug(slug);
    const { score, hits } = scoreAnnouncement(ticker, meta.headline || meta.Title || file);
    const materialScore = toMaterialityScore(score);
    const materialLabel = labelFromScore(materialScore);
    const materialReason = hits.length > 0
      ? 'Keywords matched: ' + hits.join(', ')
      : 'Score ' + materialScore + '/10 — no keyword matches';

    const bodyMatch = md.match(/## RNS Content\n([\s\S]+?)(?:##|\n___)/);
    const body = bodyMatch
      ? bodyMatch[1].trim().replace(/_\[.*?\]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').substring(0, 50000)
      : '';

    const rnsJson = {
      headline: meta.headline || meta.Title || file.replace(/\.md$/, ''),
      body,
      ticker,
      date: meta.Date || '',
      url: meta.URL || '',
      material_score: parseInt(meta['Material score'] || materialScore),
      material_label: materialLabel,
      material_reason: materialReason,
      keywords_matched: hits,
      stored_at: new Date().toISOString(),
    };

    if (DRY_RUN) {
      console.log('[dry-run] would write: ' + jsonPath);
    } else {
      fs.writeFileSync(jsonPath, JSON.stringify(rnsJson, null, 2));
      written++;
      if (written % 20 === 0) process.stdout.write('+' + written + '...\n');
    }
  }
}

console.log('\nBackfill: ' + total + ' md files, ' + skipped + ' json existed, ' + written + ' json written' + (DRY_RUN ? ' (dry-run)' : ''));
