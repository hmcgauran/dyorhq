#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const dir = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq/reports';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html') && f !== 'template.html');

const sourcesSection = `
          <div class="report-section">
            <h2>Sources</h2>
            <ul>
              <li>Market data fields derived using the <strong>GOOGLEFINANCE</strong> function</li>
              <li>Public company filings, announcements, and investor materials where referenced in the analysis</li>
              <li>Additional public sources linked where specifically used</li>
            </ul>
          </div>`;

for (const file of files) {
  const p = path.join(dir, file);
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes('<h2>Sources</h2>')) {
    c = c.replace('</div>\n\n        <aside class="report-sidebar">', `${sourcesSection}\n        </div>\n\n        <aside class="report-sidebar">`);
  }
  c = c.replace(/Google Sheet[^<\n]*/gi, 'GOOGLEFINANCE function');
  c = c.replace(/Google Sheet \([^)]*\)/gi, 'GOOGLEFINANCE function');
  fs.writeFileSync(p, c);
}

// template
const templatePath = path.join(dir, 'template.html');
let t = fs.readFileSync(templatePath, 'utf8');
if (!t.includes('{{SOURCES}}')) {
  t = t.replace('          <div class="report-section">\n            <h2>Entry / Exit Framework</h2>\n            {{ENTRY_EXIT_FRAMEWORK}}\n          </div>', '          <div class="report-section">\n            <h2>Entry / Exit Framework</h2>\n            {{ENTRY_EXIT_FRAMEWORK}}\n          </div>\n\n          <div class="report-section">\n            <h2>Sources</h2>\n            {{SOURCES}}\n          </div>');
}
fs.writeFileSync(templatePath, t);

// remove duplicate older reports per ticker basename
const byBase = {};
for (const f of files) {
  const base = f.replace(/-\d{4}-\d{2}-\d{2}\.html$/, '');
  (byBase[base] ??= []).push(f);
}
for (const [base, arr] of Object.entries(byBase)) {
  if (arr.length > 1) {
    arr.sort();
    const newest = arr[arr.length - 1];
    for (const f of arr.slice(0, -1)) {
      fs.unlinkSync(path.join(dir, f));
      console.log('deleted duplicate', f, 'kept', newest);
    }
  }
}

console.log('done');
