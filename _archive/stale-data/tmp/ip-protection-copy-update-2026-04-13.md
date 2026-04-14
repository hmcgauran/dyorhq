# DYOR HQ IP protection copy update - 2026-04-13

Updated public-facing DYOR HQ copy to remove vendor, model, and pipeline disclosures while preserving investor-facing meaning.

## Changed areas
- Sanitised methodology copy in both homepage mirrors:
  - `index.html`
  - `public/index.html`
- Generalised public report source language in both report mirrors:
  - `reports/*.html`
  - `public/reports/*.html`
- Updated report data mirror strings used to render public-facing source and snapshot text:
  - `reports/data/*.json`

## Key copy changes
- Replaced explicit vendor and tool references such as Google Sheet, Google Sheets, Yahoo Finance, SEC EDGAR, Investegate, MiniMax, Ollama, and gemma with higher-level descriptions.
- Reframed data sourcing as proprietary market data workflows using multiple inputs, internal normalisation, and validation checks.
- Reframed AI usage as AI-assisted research, internal automation, and human editorial review.
- Added clear proprietary positioning for internal tools, models, pipelines, and scoring methods.
- Removed the visible `GoogleFinance` and `Google Finance` strings from user-facing site and report files.

## Verification
- Verified no `GoogleFinance` or `Google Finance` string remains in user-visible files under:
  - `public/`
  - `reports/`
  - `index.html`
  - `public/index.html`
