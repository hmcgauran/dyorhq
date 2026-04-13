# DYOR Eli Lilly template migration - 2026-04-13

## Completed
- Built a single shared live-report design based on the Eli Lilly report and moved shared styling into `assets/css/report-canonical.css`.
- Mirrored the same shared stylesheet to `public/assets/css/report-canonical.css`.
- Rewrote all 213 live report files in `reports/` into the canonical shell.
- Mirrored all 213 live report files to `public/reports/`.
- Updated `reports/template.html` and `reports/report-template.html` to the same canonical structure.

## Canonical design outcomes
- Unified header, hero, section shell, recommendation badge treatment, conviction panel, and thesis scenario card layout across the entire live set.
- Preserved company-specific content and recommendation text from each source report.
- Kept the three-card bull/base/bear thesis layout.
- Kept colour-coded top recommendation badges via shared CSS classes.
- Removed embedded per-file style blocks from live reports in favour of shared CSS.
- Normalised output to British English friendly `en-GB` pages and ASCII-safe markup.

## Legacy-source handling
- 14 reports had degraded legacy source content with only thesis-evaluation material present (`morganstanley`, `ibmcommonstock`, `nikeinc`, `oraclecorp`, `nexteraenergyinc`, `jpmorganchaseco`, `mastercardinc`, `mcdonaldscorp`, `johnsonjohnson`, `lowescompaniesinc`, `lockheedmartincorp`, `northropgrummancorp`, `pepsicoinc`, `merckcoinc`).
- For those files, the preserved thesis content and recommendation state were retained inside the canonical shell, and placeholder copy was used only where the original source lacked section data.

## Verification
- Verified all 213 live reports now share the same overall section structure.
- Verified all 213 live reports still contain `Thesis Evaluation`.
- Verified all 213 live reports retain a top recommendation badge with shared badge classes.
- Verified `reports/` and `public/reports/` are in sync file-for-file.

## Files touched
- `assets/css/report-canonical.css`
- `public/assets/css/report-canonical.css`
- `reports/*.html`
- `public/reports/*.html`
- `reports/template.html`
- `reports/report-template.html`
