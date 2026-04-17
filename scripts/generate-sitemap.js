#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const CANONICAL_INDEX_PATH = path.join(ROOT, 'reports', 'index.json');

const BASE = 'https://dyorhq.ai';
const today = new Date().toISOString().split('T')[0];

// robots.txt
const robotsTxt = 'User-agent: *\nAllow: /\n\nSitemap: https://dyorhq.ai/sitemap.xml\n';
fs.writeFileSync(path.join(PUBLIC_DIR, 'robots.txt'), robotsTxt);

// sitemap.xml
const index = JSON.parse(fs.readFileSync(CANONICAL_INDEX_PATH, 'utf8'));
const staticPages = [
  { url: '/', priority: '1.0', changefreq: 'daily' },
  { url: '/portfolio.html', priority: '0.8', changefreq: 'weekly' },
  { url: '/methodology.html', priority: '0.7', changefreq: 'monthly' },
  { url: '/about.html', priority: '0.6', changefreq: 'monthly' },
];

let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
for (const p of staticPages) {
  xml += '  <url><loc>' + BASE + p.url + '</loc><lastmod>' + today + '</lastmod><changefreq>' + p.changefreq + '</changefreq><priority>' + p.priority + '</priority></url>\n';
}
for (const e of index) {
  const u = e.report_url || '/reports/' + e.file;
  xml += '  <url><loc>' + BASE + u + '</loc><lastmod>' + (e.date || today) + '</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>\n';
}
xml += '</urlset>\n';
fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), xml);
console.log('robots.txt and sitemap.xml written (' + (index.length + staticPages.length) + ' URLs)');
