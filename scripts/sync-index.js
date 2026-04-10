#!/usr/bin/env node
/**
 * DYOR HQ Index Reconciliation Script
 * 
 * Sets reports/index.json as the single source of truth.
 * Derives public/reports-index.json and syncs public/reports/ from it.
 * Reports any anomalies.
 * 
 * Usage: node sync-index.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const PUBLIC_DIR = path.join(__dirname, '..', 'public', 'reports');
const CANONICAL_INDEX = path.join(REPORTS_DIR, 'index.json');
const PUBLIC_INDEX = path.join(__dirname, '..', 'public', 'reports-index.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

function log(msg) { console.log(`[sync] ${msg}`); }
function warn(msg) { console.warn(`[sync] WARN: ${msg}`); }
function dry(msg) { console.log(`[sync] DRYRUN: ${msg}`); }

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function writeJSON(p, data) {
  if (dryRun) { dry(`write ${p}`); return; }
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  log(`wrote ${p}`);
}

function main() {
  log('Starting index reconciliation');
  log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  // 1. Load canonical index
  if (!fs.existsSync(CANONICAL_INDEX)) {
    warn(`Canonical index not found: ${CANONICAL_INDEX}`);
    process.exit(1);
  }
  const canonical = readJSON(CANONICAL_INDEX);
  log(`Canonical index: ${canonical.length} entries`);

  // 2. Check for duplicate tickers
  const tickers = canonical.map(r => r.ticker);
  const duplicates = tickers.filter(t => tickers.indexOf(t) !== tickers.lastIndexOf(t));
  if (duplicates.length > 0) {
    warn(`Duplicate tickers in canonical index: ${duplicates.join(', ')}`);
  } else {
    log('No duplicate tickers in canonical index ✓');
  }

  // 3. Build file set from canonical index
  const indexedFiles = new Set(canonical.map(r => r.file).filter(Boolean));
  const indexedTickers = new Set(tickers.filter(Boolean));

  // 4. Check for index entries without matching HTML files
  const reportsFiles = new Set(
    fs.readdirSync(REPORTS_DIR)
      .filter(f => f.endsWith('.html') && f !== 'template.html')
  );
  const missingHTML = [...indexedFiles].filter(f => !reportsFiles.has(f));
  if (missingHTML.length > 0) {
    warn(`Index entries without matching HTML in reports/: ${missingHTML.join(', ')}`);
  } else {
    log('All indexed reports have matching HTML files ✓');
  }

  // 5. Check for HTML files in reports/ not in index
  const orphanedInReports = [...reportsFiles].filter(f => !indexedFiles.has(f));
  if (orphanedInReports.length > 0) {
    warn(`HTML files in reports/ not in index: ${orphanedInReports.join(', ')}`);
  } else {
    log('No orphaned HTML files in reports/ ✓');
  }

  // 6. Sync public/reports/ from canonical index
  if (!fs.existsSync(PUBLIC_DIR)) {
    warn(`Public reports dir not found: ${PUBLIC_DIR}`);
  } else {
    const publicFiles = new Set(
      fs.readdirSync(PUBLIC_DIR)
        .filter(f => f.endsWith('.html') && f !== 'template.html')
    );

    // Copy missing files from reports/ to public/reports/
    let copied = 0;
    for (const file of indexedFiles) {
      const src = path.join(REPORTS_DIR, file);
      const dst = path.join(PUBLIC_DIR, file);
      if (!publicFiles.has(file) && fs.existsSync(src)) {
        if (dryRun) {
          dry(`copy ${src} → ${dst}`);
        } else {
          fs.copyFileSync(src, dst);
          log(`copied ${file} → public/reports/`);
        }
        copied++;
      }
    }
    if (copied === 0 && !dryRun) log('public/reports/ already in sync with canonical index');

    // Report orphaned files in public/reports/ not in index
    const orphanedInPublic = [...publicFiles].filter(f => !indexedFiles.has(f));
    if (orphanedInPublic.length > 0) {
      warn(`Orphaned HTML files in public/reports/ (not in index): ${orphanedInPublic.join(', ')}`);
    } else {
      log('No orphaned HTML files in public/reports/ ✓');
    }
  }

  // 7. Derive and write public/index from canonical
  if (dryRun) {
    dry(`write public index (${canonical.length} entries)`);
  } else {
    writeJSON(PUBLIC_INDEX, canonical);
  }

  // 8. Summary
  log('\n--- Reconciliation Summary ---');
  log(`Canonical entries: ${canonical.length}`);
  log(`Indexed files: ${indexedFiles.size}`);
  log(`Orphaned in reports/: ${orphanedInReports.length}`);
  log(`Public index: ${canonical.length} entries (derived)`);
  
  if (orphanedInReports.length === 0 && duplicates.length === 0 && missingHTML.length === 0) {
    log('\n✓ Reconciliation clean. No action needed.');
  } else {
    warn('\n⚠ Issues found — review above.');
  }
}

main();
