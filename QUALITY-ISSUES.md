# DYOR HQ — Consistent Quality Issues

> Compiled: 17 April 2026 | For AI-assisted review and improvement

---

## 1. Date Format Corruption (Critical)

**Root cause:** `formatDate()` in `main.js` uses `new Date(dateStr + 'T00:00:00')` which only parses ISO format (YYYY-MM-DD). Human-readable dates like "16 April 2026" produce an Invalid Date, and `toLocaleDateString()` returns a blank.

**Impact:** 227 entries in the canonical index had blank dates in the browser. No error message, no fallback — just silent blanks.

**Fix required:** Either make `formatDate()` handle human-readable dates, or enforce ISO-only at write time with a validation rule. Enforce at the build layer so bad dates fail the build, not the browser.

---

## 2. Ticker Matching False Positives and Negatives (High)

**Root cause:** Google Sheet contains bare tickers (e.g., `PTSB`, `KO`, `MKA.L`, `KYGA`). Canonical index stores exchange-prefixed tickers (e.g., `ISE:PTSB`, `NYSE:KO`, `KYGA.L (LSE) / KRZ (ISE)`). Direct string comparison fails systematically.

Company name matching breaks on exchange suffixes like "(LSE:GLEN)", "(NYSE:KO)" which the Google Sheet does not include. A ticker can be clearly in the canonical index yet reported as "new" by the matching script.

**Impact:** Every ticker audit requires human cross-check. Genuinely new tickers are silently missed. False positives waste analyst time.

---

## 3. `hasReport` Column Is Non-Functional (High)

**Root cause:** Column 34 of the Google Sheet (`hasReport`) uses a Google Sheets formula that the Sheets API v4 does not evaluate. Every row returns `null`.

**Impact:** There is no programmatic way to ask "does this ticker already have a report?" from the sheet alone. Company name matching is the only workaround, and it is unreliable for the reasons above. Every ticker audit must be done manually against the canonical index.

---

## 4. Two Index Files Causing Persistent Confusion (Medium)

**Root cause:** `reports/index.json` (canonical) and `public/reports-index.json` (browser-optimised) are separate files with different shapes and purposes. The live site was serving 316 entries while the local canonical had 319 — because the deploy was from `main` while active work was on `dyor-v3-work`.

**Impact:** Hugh could not see 4 newly written reports on the live site. The canonical index and the browser index appearing to disagree led to confusion about whether the reports were actually added. Browser cache of the old `reports-index.json` compounds this.

**Fix:** A deploy status indicator or a checksum comparison shown in the build output would surface the discrepancy immediately.

---

## 5. Browser JS/CSS Caching Hides Fixes (High)

**Root cause:** Chrome caches `main.js` and CSS files aggressively. When CSS badge colours were corrected and `formatDate()` was fixed, the browser served cached old versions. Both fixes required manual Cmd+Shift+R to see.

**Impact:** Every deployment requires a hard refresh from every reader. Debugging becomes harder because the local file and the browser file are different. This adds friction to every fix.

**Fix:** Add cache-busting query parameters to assets (e.g., `main.js?v=20260417`) based on git commit hash or build timestamp.

---

## 6. Grok API Has No Retry Logic (Medium)

**Root cause:** `scripts/grok-sentiment.js` calls the xAI API and returns nothing on timeout. No retry, no exponential backoff, no circuit breaker.

**Impact:** When the API is unavailable, every report written during that window is flagged "AI sentiment unavailable at time of writing" — structurally incomplete with no automatic recovery. A batch of 10 reports written during an outage all lack sentiment data.

**Fix:** Implement a simple retry with exponential backoff (3 attempts, 2s initial delay, 4x backoff). Log failures for monitoring.

---

## 7. Conviction Scoring Is Entirely Manual (Medium)

**Root cause:** There is no formula, no template, no tool that takes financial data and outputs a conviction score. The scenario-weighting framework (Bull/Base/Bear with probability weights) is intellectually sound but relies entirely on the analyst's judgement on every report.

**Impact:** Two different analysts would produce materially different conviction scores for the same data. No automated sanity check flags outliers — e.g., a P/E of 200x with a conviction above 70, or a loss-making company with BUY.

**Fix:** Build a conviction calculator that accepts structured inputs (P/E, EPS, revenue growth, margin trajectory, cash position, catalyst timeline, competitive position score) and outputs a score with a confidence interval. Flag outliers for human review.

---

## 8. Stale Reports Not Flagged for Update (Medium)

**Root cause:** There is no automated check that flags when an existing report's data has changed significantly from what was last reported. The AUTL report is a case in point — it existed with OPPORTUNISTIC BUY 55, but the commercial launch under Tecartus pressure warranted REDUCE 44. It was updated only when a new report was manually queued.

**Impact:** Reports on companies that have released poor results or suffered major reratings are silently outdated. Readers relying on the site have no way to know a report is stale.

**Fix:** On every data pull from the Google Sheet, compare current price, P/E, and market cap against the values stored in the last index entry. Flag entries where the delta exceeds a threshold (e.g., price moved >15%, P/E changed by >20 percentage points, market cap moved >20%). Flag for human review.

---

## 9. Build Validation Catches File Existence but Not Content Quality (Medium)

**Root cause:** `validateProject()` in `site-manifest.js` checks:
- Every index entry has `ticker`, `file`, `company`, `conviction` (number), `date`
- No duplicate tickers
- No duplicate file references
- Every indexed file exists on disk
- No orphan HTML files outside the index

It does **not** check:
- Whether the HTML is well-formed
- Whether `conviction` is a number within 0-100
- Whether `date` is ISO format (YYYY-MM-DD)
- Whether `recommendation` matches a valid tier label
- Whether the report HTML has all 11 required sections

**Impact:** A malformed report can be committed and built if the file exists and the index entry is structurally valid. A conviction score of 999 or a date of "yesterday" will pass validation.

**Fix:** Add content-level validation rules to `validateProject()`.

---

## 10. Report Slugs Derived from Company Name — No Ticker in Filename (Low)

**Root cause:** File naming convention (`artechelantegielkarteasa.html`, `electroopticsystemsholdingsltd.html`) is derived from the company name. The ticker does not appear in the filename.

**Impact:** Files are not human-interpretable without opening them. Collisions are possible for companies with identical names — the index is the only protection. No URL-level indicator of which ticker the report covers.

**Fix:** Use `{ticker}-{slug}.html` format, e.g., `ART-arteche.html`. This is a URL design decision that also affects SEO and shareability.

---

## 11. No Automated Check for Duplicate or Related-Company Reports (Low)

**Root cause:** If a new report is written for a ticker that already exists in the index, `validateProject()` flags the duplicate ticker. But if a report is written for a different ticker covering the same company (e.g., `CAD` — Canadian Advanced Materials, vs `CAD  TSX-V` — Colonial Coal International Corp), there is no check. False positives in ticker matching mean genuinely new tickers can be silently missed.

**Impact:** During the ticker audit, `CAD  TSX-V` was matched to `CAD` in the canonical index only to discover the canonical `CAD` was Colonial Coal TSX-V, not Canadian Advanced Materials. The matching script had no way to detect this distinction.

**Fix:** ISIN is the most reliable join key. Require ISIN on all entries and validate against it. Company name matching should be a fallback with lower confidence.

---

## 12. No Version History on Index Entries (Low)

**Root cause:** When a report is updated (e.g., AUTL conviction changed from 55 to 44), the previous entry is overwritten in the JSON. The old conviction score is lost from the index — it lives only in the HTML report's conviction history table.

**Impact:** Comparing old vs new across the full watchlist requires reading HTML files, not the index. Audit trails for conviction changes are only accessible per-ticker.

**Fix:** Store a `convictionHistory` array in the index entry: `[{date: "2026-04-08", conviction: 55}, {date: "2026-04-16", conviction: 44}]`. This makes cross-ticker analysis of conviction changes possible directly from the index.

---

## 13. Price Field Has No Enforced Type (Low)

**Root cause:** Some entries in `reports/index.json` store `price` as a string (`"$150.32"`, `"GBX 829"`), others as a number (`28.10`, `8.68`). The field has no enforced type.

**Impact:** Sorting, filtering, and display logic in the browser must handle both. Currency is sometimes in the price string (`"GBX 829"`) and sometimes separate (`currency: "GBX"`). Inconsistent data types cause runtime errors in downstream processing.

**Fix:** Enforce `price` as a number (in the original currency, no symbol) and `currency` as a separate string field on every write. Validation should catch non-numeric price fields.

---

## 14. `report_url` in Canonical Index Is Redundant (Low)

**Root cause:** The canonical `index.json` has `report_url: "/reports/3mco.html"`. The browser-optimised `reports-index.json` is built by `buildBrowserIndex()` which ignores the canonical `report_url` and recalculates it from `file`. The canonical `report_url` field is never used.

**Impact:** Redundant data that can go stale or be set incorrectly without any detection. It creates a potential source of confusion for anyone editing the index manually.

**Fix:** Remove `report_url` from the canonical index schema. The browser index always derives it correctly.

---

## 15. No Automated Cross-Check Between HTML and Index (Low)

**Root cause:** When a new report is written, the price, market cap, EPS, and P/E in the HTML are manually pulled from the sheet. There is no automated validation that the figures in the HTML match the figures in the sheet at time of writing.

**Impact:** An analyst error (wrong price, wrong currency, wrong EPS sign) silently makes it into the published report. No checksum, no cross-check.

**Fix:** Build a post-write validation step that parses the HTML for key metrics and compares them against the values in the Google Sheet for that ticker and date. Flag discrepancies for human review before build.

---

## Summary

| # | Issue | Severity | Frequency |
|---|-------|----------|-----------|
| 1 | Date format silent failure | Critical | Recurring — every non-ISO entry |
| 2 | Ticker matching false positives/negatives | High | Every audit |
| 3 | `hasReport` formula not evaluated | High | Constant — blocks programmatic audit |
| 4 | Browser JS/CSS caching hides fixes | High | Every deployment |
| 5 | Grok API no retry | Medium | On API outages |
| 6 | Stale reports not flagged | Medium | Constant |
| 7 | Conviction scoring fully manual | Medium | Every report |
| 8 | Build validation doesn't check content | Medium | Every build |
| 9 | Price field no enforced type | Low | Consistent |
| 10 | `report_url` redundant in canonical | Low | Consistent |
| 11 | No version history on index entries | Low | Consistent |
| 12 | Report slugs have no ticker | Low | Consistent |
| 13 | No duplicate/related-company check | Low | Every audit |
| 14 | No HTML vs sheet cross-check | Low | Every report |

---

## Priority Fix Order

1. **Enforce ISO dates at build time** — fail the build if date is not ISO YYYY-MM-DD
2. **Add cache-busting to assets** — append `?v={git-hash}` to CSS/JS URLs on build
3. **Implement Grok retry logic** — 3 attempts, exponential backoff
4. **Add ISIN to every index entry** — require it, use as primary join key
5. **Add content-level validation to build** — check conviction range, date format, valid recommendation labels, all 11 sections present
6. **Build a stale-report detector** — compare live sheet data against index on every data pull