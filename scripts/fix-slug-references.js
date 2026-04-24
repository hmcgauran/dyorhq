#!/usr/bin/env node
'use strict';

/**
 * fix-slug-references.js
 * Two-part fix for slug reference errors introduced by add-missing-tickers.js:
 *
 * Part 1: Fix index.json slugs where wrong long-form slug was stored
 *   The script used slugLib.researchSlug(ticker) but stored the result
 *   in index.json BEFORE the physical dirs were renamed. So the index got
 *   the CORRECT canonical slug, but now the physical dirs (which had been
 *   renamed to SHORT names like krg/kog/etc.) don't match.
 *
 * Part 2: Rename physical dirs to match corrected index.json slugs
 */

const fs = require('fs');
const path = require('path');

const ROOT = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4';
const RESEARCH_DIR = path.join(ROOT, 'research');
const slugLib = require('../cron-scripts/lib/research-slug');

const INDEX_PATH = path.join(ROOT, 'reports', 'index.json');
const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));

// ── Part 1: Fix index.json slug values ──────────────────────────────────────
// Index entries that got wrong slug stored (short form was used in index
// but canonical long-form slug is what we now want)
const SLUG_FIXES = [
  ['KRG',   'kerrygroupplc'],
  ['KOG',   'kongsberggruppenasa'],
  ['KGS',   'kongsberggoldasa'],
  ['MCSA',  'mcsaatchiplc'],
  ['EEKS',  'eeksfinancialcloudgroupplc'],
  ['POV',   'povalleyenergyltd'],
  ['PL',    'planetlabsinc'],
  ['QUA',   'quadriseplc'],
  ['YOON',  'youngcosbreweryplc'],
];

console.log('=== Fixing index.json slug values ===');
SLUG_FIXES.forEach(([ticker, correctSlug]) => {
  const entry = index.find(e => e.ticker === ticker);
  if (!entry) { console.log('  ' + ticker + ': NOT IN INDEX'); return; }
  console.log('  ' + ticker + ': ' + entry.slug + ' -> ' + correctSlug);
  entry.slug = correctSlug;
});
fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
console.log('Index written.');

// ── Part 2: Rename physical dirs to canonical slug ────────────────────────────
// Short-dir -> canonical-slug mapping
const DIR_RENAMES = [
  ['krg',   'kerrygroupplc'],
  ['kog',   'kongsberggruppenasa'],
  ['kgs',   'kongsberggoldasa'],
  ['mcsa',  'mcsaatchiplc'],
  ['eeks',  'eeksfinancialcloudgroupplc'],
  ['pov',   'povalleyenergyltd'],
  ['pl',    'planetlabsinc'],
  ['qua',   'quadriseplc'],
  ['yoon',  'youngcosbreweryplc'],
  // These are in index but their physical dirs have wrong names
  ['abbviecommonstock',              'abbviecommonstock'],
  ['alibabagroupholdingltdadr',      'alibabagroupholdingltdadr'],
  ['bpmarshpartnersplc',             'bpmarshpartnersplc'],
  ['burfordcapitalimited',           'burfordcapitalimited'],
  ['charlesschwabcorporationcommonstock', 'charlesschwabcorporationcommonstock'],
  ['generalmoditorsco',             'generalmoditorsco'],
  ['nicholsplc',                    'nicholsplc'],
  ['nioincadr',                     'nioincadr'],
  ['ondoinsurtechplc',              'ondoinsurtechplc'],
];

console.log('\n=== Renaming physical dirs to canonical slug ===');
DIR_RENAMES.forEach(([from, to]) => {
  const src = path.join(RESEARCH_DIR, from);
  const dest = path.join(RESEARCH_DIR, to);
  if (!fs.existsSync(src)) { console.log('  ' + from + ': already gone'); return; }
  if (src === dest) { console.log('  ' + from + ': same name, skip'); return; }
  if (fs.existsSync(dest)) {
    console.log('  MERGE: ' + from + ' -> ' + to);
    const items = fs.readdirSync(src);
    for (const item of items) {
      const s = path.join(src, item);
      const d = path.join(dest, item);
      if (fs.statSync(s).isDirectory()) {
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
        fs.readdirSync(s).forEach(sub => {
          const sp = path.join(s, sub);
          const dp = path.join(d, sub);
          if (fs.existsSync(dp)) {
            const ext = path.extname(sub);
            fs.renameSync(sp, path.join(d, path.basename(sub, ext) + '_old_20260419' + ext));
          } else {
            fs.renameSync(sp, dp);
          }
        });
        try { fs.rmdirSync(s); } catch(e) {}
      } else {
        if (fs.existsSync(d)) {
          const ext = path.extname(item);
          fs.renameSync(s, path.join(dest, path.basename(item, ext) + '_old_20260419' + ext));
        } else {
          fs.renameSync(s, d);
        }
      }
    }
    try { fs.rmdirSync(src); } catch(e) {}
  } else {
    fs.renameSync(src, dest);
    console.log('  RENAMED: ' + from + ' -> ' + to);
  }
});

// Handle template dirs (no ticker mapping, just rename to avoid confusion)
const TEMPLATES = [
  ['report-template', 'REPORT_TEMPLATE'],
  ['template',         'TEMPLATE_DIR'],
];
for (const [from, to] of TEMPLATES) {
  const src = path.join(RESEARCH_DIR, from);
  const dest = path.join(RESEARCH_DIR, to);
  if (fs.existsSync(src)) {
    if (fs.existsSync(dest)) {
      // Merge into template dir
      const items = fs.readdirSync(src);
      for (const item of items) {
        const s = path.join(src, item);
        const d = path.join(dest, item);
        if (fs.existsSync(d)) {
          const ext = path.extname(item);
          fs.renameSync(s, path.join(dest, path.basename(item, ext) + '_old_20260419' + ext));
        } else {
          fs.renameSync(s, d);
        }
      }
      try { fs.rmdirSync(src); } catch(e) {}
    } else {
      fs.renameSync(src, dest);
    }
    console.log('  TEMPLATE: ' + from + ' -> ' + to);
  }
}

console.log('\nDone.');
