#!/usr/bin/env node
'use strict';

/**
 * add-missing-tickers.js
 * Adds 13 missing tickers to reports/index.json and maps their stale research dirs
 * to canonical slug directories.
 */

const fs = require('fs');
const path = require('path');

const ROOT = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4';
const RESEARCH_DIR = path.join(ROOT, 'research');
const slugLib = require('../cron-scripts/lib/research-slug');

const INDEX_PATH = path.join(ROOT, 'reports', 'index.json');
const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
const tickerSet = new Set(index.filter(e => e.ticker).map(e => e.ticker));

const MISSING = [
  { ticker: 'KRG',      company: 'Kerry Group plc',                 exchange: 'ISE', staleDir: 'kerrygroupplc' },
  { ticker: 'GGP.L',   company: 'Greatland Resources plc',           exchange: 'LA',  staleDir: 'greatlandresourcesltd' },
  { ticker: 'MDB',     company: 'MongoDB Inc',                        exchange: 'NY', staleDir: 'mongodbinc' },
  { ticker: 'XPENG',   company: 'XPeng Inc ADR',                      exchange: 'NY', staleDir: 'xpengincadr' },
  { ticker: 'KOG',     company: 'Kongsberg Gruppen ASA',               exchange: 'OB', staleDir: 'kongsberggruppenunsponsorednorwayadr' },
  { ticker: 'POV',     company: 'Po Valley Energy Ltd',                exchange: 'LA', staleDir: 'po_valley_energy_limited' },
  { ticker: 'MCSA',    company: 'McSaatchi plc',                       exchange: 'LA', staleDir: 'mcsaatchiplc' },
  { ticker: 'EEKS',    company: 'EEKS Financial Cloud Group plc',       exchange: 'LA', staleDir: 'eeksfinancialcloudgroupplc' },
  { ticker: 'KGS',     company: 'Kongsberg Gold ASA',                  exchange: 'OB', staleDir: 'kgspykingspangroupplcadr' },
  { ticker: 'NUSCAL',  company: 'NuScale Power Corp',                  exchange: 'NY', staleDir: 'nuscalepowercorp' },
  { ticker: 'PL',      company: 'Planet Labs Inc',                    exchange: 'NY', staleDir: 'planetlabspbc' },
  { ticker: 'QUA',     company: 'Quadrise plc',                        exchange: 'LA', staleDir: 'quadriseplc' },
  { ticker: 'YOON',    company: "Young & Co's Brewery plc",           exchange: 'LA', staleDir: 'youngandcobreweryordshs' },
];

const toAdd = MISSING.filter(t => !tickerSet.has(t.ticker));
console.log('Adding ' + toAdd.length + ' tickers to index:');
toAdd.forEach(({ ticker, company, exchange }) => {
  const slug = slugLib.researchSlug(ticker);
  index.push({ ticker, company, exchange, slug });
  console.log('  + ' + ticker + ': ' + company + ' (' + exchange + ') -> ' + slug);
});

fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
console.log('\nIndex written: ' + index.length + ' entries total');
