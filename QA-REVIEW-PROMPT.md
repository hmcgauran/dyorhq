# DYOR HQ v2 — QA Review Prompt

Use this prompt when asking Claude to review the DYOR HQ v2 project.

---

We're building DYOR HQ — a structured equity research platform at `/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v2/`

## What we are trying to do

Convert 228 investment research reports from inconsistent generated HTML into a clean, maintainable JSON + template architecture. The goal is that every report is rendered from the same canonical template, with data stored in JSON files. This ensures absolute format consistency — change the template once, all reports update.

## Architecture (what exists now)

```
dyorhq-v2/
├── reports/
│   ├── schema.json              ← JSON schema definition (the contract)
│   ├── report-template.html     ← single canonical HTML template
│   ├── data/                   ← 227 JSON files (one per ticker, the source of truth)
│   │   ├── AAPL.json
│   │   ├── AVCT.json
│   │   └── ... (~227 files)
│   ├── extract-reports.py       ← converts HTML → JSON
│   ├── build-reports.py         ← converts JSON → pre-rendered static HTML
│   └── *.html                   ← original HTML reports (to be superseded by data/)
├── public/reports/              ← pre-rendered static HTML output (the deployable site)
│   ├── AAPL-report.html
│   └── ... (~228 files)
└── assets/css/main.css          ← shared stylesheet
```

## The 10 canonical report sections

Every report must have these sections in this exact order:

1. Executive Summary
2. Business Model
3. Financial Snapshot
4. Recent Catalysts
5. Thesis Evaluation
6. Key Risks
7. Who Should Own It / Avoid It
8. Recommendation
9. Entry / Exit Framework
10. Sources

## The canonical Sources format

Every report must use this exact 3-tier Sources format:

```html
<ul>
  <li><strong>Authoritative market data:</strong> [description of source]</li>
  <li><strong>Company filings and disclosures:</strong> [description]</li>
  <li><strong>Additional sources:</strong> [any specific citations]</li>
</ul>
```

---

## QA Tasks

### 1. JSON schema compliance

Pick 10 random JSON files from `reports/data/` and validate:

- They have all required top-level keys: `meta`, `price`, `sections`, `scores`
- `meta` has: `ticker`, `company`, `recommendation`, `conviction` (0–100), `datePublished`
- `sections` has all 10 sections: executiveSummary, businessModel, financialSnapshot, recentCatalysts, thesisEvaluation, keyRisks, whoShouldOwn, recommendation, entryExit, sources
- `scores` has `current` (with score, band, date) and `history` (array of entries)
- `conviction` values are reasonable (not all 50 — that would indicate a failed extraction)

---

### 2. Template consistency

Read `reports/report-template.html` and confirm:

- It has all 10 sections in the correct order
- The Sources section uses the 3-tier canonical format shown above
- The template uses `report-section` CSS class, `report-sidebar`, and `report-hero` CSS classes (not card-based classes like `card-title` or `ticker-badge`)

---

### 3. Pre-rendered HTML quality

Check `public/reports/` and verify for 5 random reports:

- All 10 sections appear in correct order
- The Sources section has the canonical 3-tier format
- Conviction scores and recommendations are present and match the JSON source
- No `card-title`, `ticker-badge`, or `<body>` wrapper classes remain (those are from the old format)
- The page uses the canonical `report-hero` structure

---

### 4. Conviction score distribution

Run a quick scan across all JSON files in `reports/data/`:

- Are conviction scores varied (not all 50)?
- Are there BUY, HOLD, REDUCE, SELL recommendations distributed across the set?
- Are `datePublished` fields populated (not empty strings)?
- A score of exactly 50 for more than 20% of files would indicate incomplete extraction

---

### 5. Build script verification

Run `python3 scripts/build-reports.py` and confirm:

- It completes without errors
- It produces HTML output in `public/reports/`

---

### 6. Format contamination check

Read 5 random HTML files from `public/reports/`:

- Confirm they do **NOT** contain: `card-title`, `ticker-badge`, `class="data-grid"`, `<body>` wrapper, `scenario-grid` (those are old format markers)
- Confirm they **DO** contain: `report-section`, `report-hero`, `report-sidebar`, `report-content`

---

### 7. Biotech literature

Check `reports/data/AVCT.json` specifically:

- AVCT (Avacta) is a biotech stock — the `sources.literature` array should ideally contain primary literature citations if the sources section is populated
- Check if `sections.sources.literature` exists and is populated

---

### 8. Scores history

Check 5 random JSON files:

- `scores.history` should be an array with at least one entry
- Each history entry should have `date`, `score`, `band`, `delta`, `reason`

---

### 9. Known problem files

These formats were problematic during migration. Check these specifically:

- `reports/data/MDLZ.json` — was Format B (card-based), check sections populated
- `reports/data/PLCE.json` — check conviction = 32 and recommendation = "SELL — SPECULATIVE"
- `reports/data/AAPL.json` — check conviction = 64, datePublished = "2026-04-10"

---

### 10. Section text quality

Spot check 3 reports for placeholder/empty text:

- Check that `sections.businessModel` is not empty or generic ("Consumer Discretionary sector company")
- Check that `sections.keyRisks.risks` is populated with actual risk text (not empty arrays)
- Check that `sections.entryExit` has actual entry/exit guidance (not empty)

---

## Report back with

- **Pass/fail** for each check above
- Specific files that failed and why
- Any data quality issues found
- **Recommendation: ready to commit or needs fixes first**