#!/usr/bin/env node
'use strict';

const {
  CANONICAL_INDEX_PATH,
  BROWSER_INDEX_PATH,
  readJson,
  buildBrowserIndex,
  writeJson,
} = require('./site-manifest');

const canonicalIndex = readJson(CANONICAL_INDEX_PATH);
const browserIndex = buildBrowserIndex(canonicalIndex);
writeJson(BROWSER_INDEX_PATH, browserIndex);

console.log(`Rebuilt reports-index.json from reports/index.json (${browserIndex.length} entries).`);
