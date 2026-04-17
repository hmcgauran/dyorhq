# DYOR slug migration summary

Date: 2026-04-13

## Outcome
- Renamed 215 live report files in `reports/` and `public/reports/`.
- Excluded 12 audit entries that were already absent and did not recreate them.
- Updated `reports/index.json`, `reports-index.json`, and `public/reports-index.json` to the new slugs.

## Collision handling
- `dccplc.html`: kept `DCC-2026-04-11.html`; absent/removed `LON:DCC-2026-04-11.html`. No extra disambiguator needed.
- `graftongroupplc.html`: kept `GFTU-2026-04-11.html`; absent/removed `LON:GFTU-2026-04-11.html`. No extra disambiguator needed.
- `kerrygroupplc.html`: kept `kyga-2026-04-07.html`; absent/removed `FRA:KRZ-2026-04-11.html`. No extra disambiguator needed.

## Verification
- All live report filenames now use lowercase alphanumeric company-name slugs only.
- `reports/index.json` parses as valid JSON.
- Every canonical index entry resolves to an existing file in both mirrors.

## Excluded absent audit entries
- `FRA:KRZ-2026-04-11.html`
- `KRX-2026-04-11.html`
- `LON:DCC-2026-04-11.html`
- `LON:GFTU-2026-04-11.html`
- `c4x-2026-04-09.html`
- `coin-2026-04-08.html`
- `desp-2026-04-09.html`
- `kog-2026-04-09.html`
- `mrsn-2026-04-08.html`
- `plce-2026-04-09.html`
- `polxf-2026-04-08.html`
- `sofi-2026-04-08.html`
