#!/usr/bin/env node
'use strict';

const {
  CANONICAL_INDEX_PATH,
  BROWSER_INDEX_PATH,
  readJson,
  buildBrowserIndex,
  writeJson,
  validateProject,
} = require('./site-manifest');

const canonicalIndex = readJson(CANONICAL_INDEX_PATH);
const browserIndex = buildBrowserIndex(canonicalIndex);
writeJson(BROWSER_INDEX_PATH, browserIndex);

const { issues } = validateProject();
if (issues.length > 0) {
  console.error('Index sync completed, but validation failed.');
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(`Synced reports-index.json from reports/index.json (${browserIndex.length} entries).`);
