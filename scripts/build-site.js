#!/usr/bin/env node
'use strict';

const path = require('path');
const {
  ROOT,
  REPORTS_DIR,
  CANONICAL_INDEX_PATH,
  BROWSER_INDEX_PATH,
  SOURCE_PAGES,
  readJson,
  buildBrowserIndex,
  writeJson,
  ensureDir,
  rmrf,
  copyRecursive,
  validateProject,
} = require('./site-manifest');

const PUBLIC_DIR = path.join(ROOT, 'public');
const PUBLIC_REPORTS_DIR = path.join(PUBLIC_DIR, 'reports');
const PUBLIC_ASSETS_DIR = path.join(PUBLIC_DIR, 'assets');

const canonicalIndex = readJson(CANONICAL_INDEX_PATH);
const browserIndex = buildBrowserIndex(canonicalIndex);
writeJson(BROWSER_INDEX_PATH, browserIndex);

const { issues } = validateProject();
if (issues.length > 0) {
  console.error('Build aborted because validation failed.');
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

rmrf(PUBLIC_DIR);
ensureDir(PUBLIC_REPORTS_DIR);
copyRecursive(path.join(ROOT, 'assets'), PUBLIC_ASSETS_DIR);

for (const page of SOURCE_PAGES) {
  copyRecursive(path.join(ROOT, page), path.join(PUBLIC_DIR, page));
}

copyRecursive(BROWSER_INDEX_PATH, path.join(PUBLIC_DIR, 'reports-index.json'));

for (const entry of canonicalIndex) {
  copyRecursive(path.join(REPORTS_DIR, entry.file), path.join(PUBLIC_REPORTS_DIR, entry.file));
}

console.log('DYOR HQ build complete.');
console.log(`- Canonical reports: ${canonicalIndex.length}`);
console.log(`- Browser index entries: ${browserIndex.length}`);
console.log(`- Output directory: ${PUBLIC_DIR}`);
require('./generate-sitemap.js');
