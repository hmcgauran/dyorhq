#!/usr/bin/env node
'use strict';

/**
 * fix-stale-dirs-new-tickers.js
 * Renames stale research dirs for the 13 newly-added tickers.
 * Some canonical slugs conflict with existing dirs (different companies):
 * - mcsaatchiplc  -> mcsa   (NOT cmcsacomcastcorp)
 * - eeksfinancialcloudgroupplc -> eeks (NOT beeksfinancialcloudgroupplc)
 * - planetlabspbc -> pl     (NOT abdynamicsplc)
 * - quadriseplc   -> qua    (NOT dwavequantuminc)
 */

const fs = require('fs');
const path = require('path');

const RESEARCH_DIR = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4/research';

const RENAMES = [
  { from: 'kerrygroupplc',                   to: 'krg', notes: 'Kerry Group' },
  { from: 'greatlandresourcesltd',            to: 'ggpllngreatlandresourcesltd', notes: 'Greatland' },
  { from: 'mongodbinc',                       to: 'mdbusmongodbinc', notes: 'MongoDB' },
  { from: 'xpengincadr',                      to: 'xpevusxpenginc', notes: 'XPeng' },
  { from: 'kongsberggruppenunsponsorednorwayadr', to: 'kog', notes: 'Kongsberg' },
  { from: 'po_valley_energy_limited',          to: 'pov', notes: 'Po Valley' },
  { from: 'mcsaatchiplc',                     to: 'mcsa', notes: 'McSaatchi — avoiding cmcsacomcastcorp collision' },
  { from: 'eeksfinancialcloudgroupplc',       to: 'eeks', notes: 'EEKS — avoiding beeksfinancialcloudgroupplc collision' },
  { from: 'kgspykingspangroupplcadr',         to: 'kgs', notes: 'Kongsberg Gold' },
  { from: 'nuscalepowercorp',                 to: 'smrnuscalepowercorporation', notes: 'NuScale' },
  { from: 'planetlabspbc',                    to: 'pl', notes: 'Planet Labs — avoiding abdynamicsplc collision' },
  { from: 'quadriseplc',                      to: 'qua', notes: 'Quadrise — avoiding dwavequantuminc collision' },
  { from: 'youngandcobreweryordshs',          to: 'yoon', notes: "Young & Co's" },
];

let renamed = 0, errors = 0;

for (const { from, to, notes } of RENAMES) {
  const src = path.join(RESEARCH_DIR, from);
  const dest = path.join(RESEARCH_DIR, to);

  if (!fs.existsSync(src)) {
    console.log('GONE: ' + from);
    continue;
  }
  if (fs.existsSync(dest)) {
    // Merge: move files from stale to canonical
    const items = fs.readdirSync(src);
    console.log('MERGE: ' + from + ' -> ' + to + ' (' + items.join(', ') + ')');
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
    console.log('  -> merged into ' + to);
  } else {
    fs.renameSync(src, dest);
    console.log('RENAMED: ' + from + ' -> ' + to + ' (' + notes + ')');
  }
  renamed++;
}

console.log('\nDone. Renamed/merged: ' + renamed + ' | Errors: ' + errors);
