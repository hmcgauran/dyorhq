# DYOR scenario layout fix summary

Date: 2026-04-13

## What I changed
- Repaired broken Thesis Evaluation blocks in 8 live reports and mirrored the same fixes to `public/reports/`.
- Removed duplicated raw scenario dump paragraphs that appeared above the three-card layout.
- Normalised the repaired scenario card headers to concise weighted labels.
- Preserved the scenario body copy inside each card and removed malformed headings where the full scenario text had been pushed into `<h3>`.
- Updated shared scenario card styling in both CSS bundles for clearer header/body separation, better spacing, and colored headers only.

## Reports fixed
- attinc.html
- centenecorp.html
- humanainc.html
- krogerco.html
- marathonpetroleumcorp.html
- phillips66.html
- stonexgroupinc.html
- valeroenergycorp.html

## Verification
- Live reports checked: 213
- Live reports with scenario-based Thesis Evaluation cards: 213
- Live reports still containing duplicated raw scenario dump before cards: 0
- Live reports with malformed scenario card headings containing scenario body text inside `<h3>`: 0
- Mirror status: repaired report HTML matched in `reports/` and `public/reports/`

## CSS updated
- `assets/css/main.css`
- `public/assets/css/main.css`
