/**
 * cron-scripts/lib/ticker-resolver.js
 * Three-tier resolution chain for matching Google Sheet rows to canonical index entries.
 *
 * Tier 1 — ISIN match (authoritative): confidence: 'high'
 * Tier 2 — Normalised ticker match: confidence: 'medium'
 * Tier 3 — Normalised company name match: confidence: 'low' (always requires review)
 *
 * Spec verbatim normalisation functions used exactly as written.
 */

const path = require('path');
const { readJson } = require('../../scripts/site-manifest');

const CANONICAL_INDEX_PATH = path.join(__dirname, '..', '..', 'reports', 'index.json');

// ─────────────────────────────────────────────
// Normalisation helpers (spec verbatim)
// ─────────────────────────────────────────────
function normaliseTicker(raw) {
  let t = String(raw || '').trim();
  // Remove exchange prefixes: NYSE:, LSE:, ISE:, TSX-V:, TSX:, ASX:, BME:, etc.
  t = t.replace(/^[A-Z\-]+:/i, '').trim();
  // Remove exchange suffix in parentheses: "(NYSE:KO)", "(LSE)" etc.
  t = t.replace(/\s*\([^)]*\)/g, '').trim();
  // Remove trailing exchange suffixes: ".L", ".AX", ".TO", ".V" etc.
  t = t.replace(/\.(L|AX|TO|V)$/i, '').trim();
  // Remove space-separated exchange codes at the end: " LN", " LSE", " ISE", " TSX", " V", etc.
  t = t.replace(/\s+(LN|LSE|ISE|TSX|ASE|NYSE|NASDAQ|EPA|ASX|BME|FRA|CVE|TSE|SGX|HKEX)$/i, '').trim();
  // Collapse multiple spaces
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t.toUpperCase();
}

function normaliseCompany(raw) {
  return String(raw || '')
    .replace(/\s*\([^)]*\)/g, '')   // remove parenthetical exchange tags
    .replace(/\b(plc|ltd|inc|corp|sa|nv|ag|se|as|oy)\b/gi, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
    .trim();
}

// ─────────────────────────────────────────────
// Three-tier resolver
// ─────────────────────────────────────────────
let _indexCache = null;

function loadIndex() {
  if (!_indexCache) _indexCache = readJson(CANONICAL_INDEX_PATH);
  return _indexCache;
}

/**
 * Resolve a sheet row (with isin, ticker, companyName) to a canonical index entry.
 *
 * @param {object} sheetRow - { isin?, ticker, companyName }
 * @returns {object} resolution result shape:
 *   {
 *     sheetTicker:   string,   // original sheet ticker
 *     resolved:      boolean,
 *     confidence:    'high' | 'medium' | 'low' | null,
 *     indexEntry:    object | null,
 *     ambiguous:     boolean,
 *     matchedBy:    'isin' | 'ticker' | 'company' | null,
 *     requiresReview: boolean
 *   }
 */
function resolveTicker(sheetRow) {
  const { isin, ticker: sheetTicker, companyName } = sheetRow;
  const index = loadIndex();

  // ── Tier 1: ISIN match ────────────────────────────────────────────────────
  if (isin && isin.trim()) {
    const isinNormalized = isin.trim().toUpperCase();
    const matched = index.filter(e => e.isin && e.isin.toUpperCase() === isinNormalized);
    if (matched.length === 1) {
      return {
        sheetTicker,
        resolved: true,
        confidence: 'high',
        indexEntry: { ...matched[0] },
        ambiguous: false,
        matchedBy: 'isin',
        requiresReview: false,
      };
    }
    if (matched.length > 1) {
      // Multiple index entries share same ISIN — flag ambiguous, return first
      return {
        sheetTicker,
        resolved: true,
        confidence: 'high',
        indexEntry: { ...matched[0] },
        ambiguous: true,
        matchedBy: 'isin',
        requiresReview: true,
      };
    }
    // ISIN given but no match — continue to lower tiers
  }

  // ── Tier 2: Normalised ticker match ──────────────────────────────────────
  if (sheetTicker) {
    const normSheet = normaliseTicker(sheetTicker);
    if (normSheet) {
      const matched = index.filter(e => normaliseTicker(e.ticker) === normSheet);
      if (matched.length === 1) {
        return {
          sheetTicker,
          resolved: true,
          confidence: 'medium',
          indexEntry: { ...matched[0] },
          ambiguous: false,
          matchedBy: 'ticker',
          requiresReview: false,
        };
      }
      if (matched.length > 1) {
        return {
          sheetTicker,
          resolved: true,
          confidence: 'medium',
          indexEntry: { ...matched[0] },
          ambiguous: true,
          matchedBy: 'ticker',
          requiresReview: true,
        };
      }
    }
  }

  // ── Tier 3: Normalised company name match ─────────────────────────────────
  if (companyName) {
    const normCompany = normaliseCompany(companyName);
    if (normCompany) {
      const matched = index.filter(e => normaliseCompany(e.company) === normCompany);
      if (matched.length === 1) {
        return {
          sheetTicker,
          resolved: true,
          confidence: 'low',
          indexEntry: { ...matched[0] },
          ambiguous: false,
          matchedBy: 'company',
          requiresReview: true, // low confidence always requires review
        };
      }
      if (matched.length > 1) {
        return {
          sheetTicker,
          resolved: true,
          confidence: 'low',
          indexEntry: { ...matched[0] },
          ambiguous: true,
          matchedBy: 'company',
          requiresReview: true,
        };
      }
    }
  }

  // ── No match found ─────────────────────────────────────────────────────────
  return {
    sheetTicker: sheetTicker || null,
    resolved: false,
    confidence: null,
    indexEntry: null,
    ambiguous: false,
    matchedBy: null,
    requiresReview: false,
  };
}

module.exports = { resolveTicker, normaliseTicker, normaliseCompany };
