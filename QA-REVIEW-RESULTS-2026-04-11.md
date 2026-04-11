# DYOR HQ v2 — QA Review Results
**Date:** 11 April 2026 (second run)
**Scope:** 228 reports across `reports/data/` and `public/reports/`

---

## Check 1 — JSON Schema Compliance: PASS

10 random files sampled (ACI, ALKS, ANET, ET, HCA, HD, KO, NEE, NVTS, UAL). All passed. All required top-level keys present (`meta`, `price`, `sections`, `scores`). All 10 section keys present. No `conviction=50` failures in this sample.

Full scan: 0/228 files with `conviction=50` (down from 45 in the previous run — fully resolved).

## Check 2 — Template Consistency: PASS

All 10 sections present in correct order. Correct CSS classes confirmed (`report-section`, `report-hero`, `report-sidebar`, `report-content`). No legacy classes found. 3-tier sources format present in template.

## Check 3 — Pre-rendered HTML Quality: PASS

5 random files sampled (ABVE, AIG, CSCO, HD, USB). All passed. Canonical CSS classes present, no old format markers, sources format correct.

## Check 4 — Conviction Score Distribution: PASS

- Total files: 228
- Conviction=50: 0/228 (0.0%) — resolved from previous run
- Score range: 4–84
- Empty `datePublished`: 0
- Recommendation split: HOLD 124 · REDUCE 76 · BUY 14 · SELL 14

## Check 5 — Build Script Verification: PASS

Dry run completes cleanly across all 228 reports with exit code 0.

## Check 6 — Format Contamination: PASS

5 random files sampled (CRIS, GL9, LIN, PLCE, SHOP). No contamination found. All canonical classes present.

## Check 7 — AVCT Biotech Literature: FAIL

`sections.sources.literature` field exists but remains an empty array. No primary literature citations populated. Unchanged from previous run.

## Check 8 — Scores History: PASS

5 random files sampled (BKNG, C4X, MCK, MMM, PSX). All have history entries containing all required fields (`date`, `score`, `band`, `delta`, `reason`). All currently show 1 entry — structurally valid.

## Check 9 — Known Problem Files: PASS

| File | Check | Result |
|---|---|---|
| MDLZ.json | Sections populated (was Format B) | PASS |
| PLCE.json | conviction=32 | PASS |
| PLCE.json | recommendation="SELL — SPECULATIVE" | PASS |
| AAPL.json | conviction=64 | PASS |
| AAPL.json | datePublished="2026-04-10" | PASS |

## Check 10 — Section Text Quality: FAIL (minor)

`entryExit.text` empty: **0/228** — fully resolved from 170/228 in the previous run.

`Additional sources` missing from public reports: **0/228** — fully resolved.

Remaining issue: **13 files have a generic `businessModel` placeholder** — the text follows the pattern "X is a [Sector] sector company. The investment case rests on diversified revenue streams..." which is templated boilerplate rather than company-specific analysis.

Affected tickers: AER, ALKS, ALLE, APTV, BIRG, CMPR, FLUT, ICLR, JAZZ, JHX, NVTS, STE, SW

---

## Summary

| Issue | Previous Run | This Run | Status |
|---|---|---|---|
| `entryExit.text` empty | 170/228 (75%) | 0/228 | ✅ Resolved |
| `Additional sources` missing | 168/228 (74%) | 0/228 | ✅ Resolved |
| `conviction=50` | 45/228 (20%) | 0/228 | ✅ Resolved |
| Generic `businessModel` placeholder | Not measured | 13/228 (6%) | ⚠️ Needs fix |
| AVCT `literature` empty | 1 file | 1 file | ⚠️ Minor |

---

## Verdict: Near Ready — Two Minor Issues Remaining

Significant improvement since the first run. The three major blockers are all resolved. What remains:

1. **13 files with generic `businessModel` text** — these need company-specific content re-extracted or written. Tickers: AER, ALKS, ALLE, APTV, BIRG, CMPR, FLUT, ICLR, JAZZ, JHX, NVTS, STE, SW.
2. **AVCT literature citations** — low priority; populate `sections.sources.literature` if primary literature citations are available.

Fix the 13 generic businessModel entries and this is ready to commit.
