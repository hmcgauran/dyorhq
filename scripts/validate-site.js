#!/usr/bin/env node
'use strict';

const {
  validateProject,
} = require('./site-manifest');

const { issues, canonicalIndex, reportFiles, browserIndex } = validateProject();

if (issues.length > 0) {
  console.error('DYOR HQ validation failed.');
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log('DYOR HQ validation passed.');
console.log(`- Canonical reports: ${canonicalIndex.length}`);
console.log(`- Static report files: ${reportFiles.length}`);
console.log(`- Browser index entries: ${browserIndex.length}`);
