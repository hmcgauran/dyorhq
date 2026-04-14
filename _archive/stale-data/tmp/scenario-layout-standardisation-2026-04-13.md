# DYOR scenario layout standardisation

Date: 2026-04-13
Project: /Users/hughmcgauran/.openclaw/workspace/projects/dyorhq

## What changed
- Standardised the Thesis Evaluation section across all 213 live reports in `reports/` to use the same three-card bull/base/bear layout.
- Mirrored the updated live report set to `public/reports/`.
- Added shared scenario card styling to both `assets/css/main.css` and `public/assets/css/main.css` so the layout renders consistently.

## Canonical layout used
- Used the existing three-card scenario grid pattern already present in live reports, standardised as `scenario-grid` with `scenario-card scenario-bull|scenario-base|scenario-bear`.

## Verification
- All 213 live reports still contain a Thesis Evaluation section.
- All 213 live reports now contain bull/base/bear scenario cards in the Thesis Evaluation section.
- `reports/` and `public/reports/` are in sync after the pass.

## Notes
- Existing scenario content, recommendation language, and report structure were preserved as far as the source markup allowed.
- Output was normalised to British English friendly, ASCII-safe HTML/CSS.
