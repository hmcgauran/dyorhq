# DYOR HQ duplicate company audit

Date: 2026-04-13
Repo: `/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq`
Sources checked: `reports/index.json`, `reports-index.json`, `public/reports-index.json`

## Summary

- Live index entries checked: 215
- Exact duplicate `company` strings in the live registry: 0
- Under the one-company-one-report rule, there are still **2 duplicate underlying companies** represented by more than one live report entry.

## Duplicates found

### 1. AIB

Underlying company: **AIB Group plc**

Entries currently live:
1. `ticker: AIB`
   - `company: AIB Group plc`
   - `file: aibgroupplc`
   - `report_url: /reports/aibgroupplc`
2. `ticker: AIBGY`
   - `company: AIB Group ADR`
   - `file: aibgroupadr`
   - `report_url: /reports/aibgroupadr`

Why this is a duplicate:
- The ADR report explicitly states it is OTC access to **AIB Group plc**.
- `public/reports/aibgroupadr.html` identifies AIBGY as a wrapper around the same underlying issuer/franchise.
- This is one economic company represented twice in the live registry.

Which should remain:
- **Keep `AIB Group plc` (`/reports/aibgroupplc`)**

Why:
- It is the primary company-level report for the underlying issuer.
- `AIBGY` is an ADR wrapper, not a separate operating company.
- Under a one-company-one-report rule, the primary issuer entry should survive and the ADR-specific duplicate should be the one removed later if cleanup is performed.

### 2. Alphabet

Underlying company: **Alphabet Inc**

Entries currently live:
1. `ticker: GOOGL`
   - `company: Alphabet Inc Class A`
   - `file: alphabetincclassa`
   - `report_url: /reports/alphabetincclassa`
2. `ticker: GOOG`
   - `company: Alphabet Inc Class C`
   - `file: alphabetincclassc`
   - `report_url: /reports/alphabetincclassc`

Why this is a duplicate:
- These are two share classes of the same operating company.
- Under a strict one-company-one-report rule, only one Alphabet report should be live.

Recommended survivor under the rule:
- **Undetermined in this audit**

Reason:
- Both rows map to the same underlying issuer, but this audit step was only asked to determine the survivor for AIB specifically.
- A product decision is still needed on whether the canonical survivor should be the more liquid/default line or another designated primary class.

## Deterministic conclusion

After the slug migration, the live registry does **not** contain exact duplicate company strings, but it **does** still contain duplicate underlying-company coverage for:
- **AIB** (`AIB` and `AIBGY`)
- **Alphabet** (`GOOGL` and `GOOG`)

For AIB, the correct survivor under the one-company-one-report rule is:
- **`/reports/aibgroupplc`**
