/**
 * cron-scripts/lib/research-slug.js
 *
 * Shared research directory slug resolver.
 * Resolves a ticker to the canonical company-name slug used in research/.
 * Used by all scripts that read or write research data.
 */
const fs = require('fs');
const path = require('path');

const RESEARCH_DIR = path.join(__dirname, '..', '..', 'research');
const INDEX_PATH   = path.join(__dirname, '..', '..', 'reports', 'index.json');

/**
 * Resolve a ticker to the canonical company-name research slug.
 *
 * @param {string} tickerOrCompany - Ticker symbol or company name
 * @param {object|null} idxEntry - Optional pre-fetched index entry
 * @returns {string} Company-name slug, e.g. "avactagroupplc", "ciscosystemsinc"
 */
function researchSlug(tickerOrCompany, idxEntry) {
  const entry = idxEntry || findIndexEntry(tickerOrCompany);
  if (!entry) {
    return tickerOrCompany.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  return companyToSlug(entry.company || entry.ticker || tickerOrCompany);
}

/**
 * Find the index entry for a given ticker or company string.
 * Three-tier match: exact ticker, slug match, then canonical company name.
 */
function findIndexEntry(tickerOrCompany) {
  let idx;
  try { idx = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')); } catch { return null; }

  const norm = tickerOrCompany.toUpperCase().trim();

  // Tier 1: exact ticker match
  const exact = idx.find(e => e.ticker && e.ticker.toUpperCase() === norm);
  if (exact) return exact;

  // Tier 2: slug match (ticker or file slug)
  const slugNorm = tickerOrCompany.toLowerCase().replace(/[^a-z0-9]/g, '');
  const bySlug = idx.find(e => {
    const tickerSlug = (e.ticker || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const fileSlug = (e.file || '').replace(/\.html$/, '').toLowerCase();
    return tickerSlug === slugNorm || fileSlug === slugNorm;
  });
  if (bySlug) return bySlug;

  // Tier 3: company name match
  const byCompany = idx.find(e => {
    const co = (e.company || '').toLowerCase();
    return co === tickerOrCompany.toLowerCase() || co.includes(tickerOrCompany.toLowerCase());
  });
  return byCompany || null;
}

/**
 * Convert a company name (or any string) to a research slug.
 */
function companyToSlug(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Get the full path to a research directory for a given ticker.
 */
function researchDir(ticker, idxEntry) {
  const slug = researchSlug(ticker, idxEntry);
  return path.join(RESEARCH_DIR, slug);
}

module.exports = { researchSlug, findIndexEntry, companyToSlug, researchDir };
