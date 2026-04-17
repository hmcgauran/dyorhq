# DYOR HQ — Report Generation Architecture

> Version 1.0 | 17 April 2026 | For internal review and AI-assisted improvement

---

## 1. System Overview

DYOR HQ is a static-generated investment research website built with Node.js. It produces 319 HTML reports stored in `projects/dyorhq/reports/`, tracked in a canonical registry at `reports/index.json`, validated by a build system, and deployed to Netlify at dyorhq.ai.

**Technology stack:**
- Node.js build scripts (no framework)
- Vanilla HTML/CSS/JS (no client-side framework)
- Google Sheets API v4 as the primary data source (`loadGoogleFinanceSheet()`)
- xAI Grok API for sentiment analysis (environment variable `XAI_API_KEY`)
- GitHub + Netlify for CI/CD and hosting

**Key directories:**
```
projects/dyorhq/
  reports/
    index.json          <- canonical registry (319 entries)
    *.html              <- individual report files
  assets/
    css/main.css
    css/report-canonical.css
    js/main.js
  scripts/
    build-site.js       <- main build script
    site-manifest.js    <- paths, validation, index builders
    generate-sitemap.js
  public/               <- built output (served by Netlify)
    reports-index.json  <- browser-optimised index
    index.html
  netlify.toml
  STRATEGIC-VISION.md
  TECHNICAL-SPEC.md
```

---

## 2. Data Sources

### 2.1 Google Finance Sheet (Primary Data)

**Sheet ID:** `1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM`

Accessed via `cron-scripts/lib/google-finance-sheet.js` which wraps the Google Sheets API v4. The `loadGoogleFinanceSheet()` function returns:

```javascript
{
  sheetId,      // sheet identifier
  tabName,      // active tab name
  range,        // data range
  headers,      // column headers
  columnMap,    // field name -> column index mapping
  columnsUsed,  // array of used column indices
  quotes,       // array of quote objects (one per row)
  tickers       // array of ticker strings (parallel to quotes)
}
```

Each quote object contains:
```
ticker, name, price, change, changePct, open, high, low,
volume, avgVolume, volumeRatio, marketCap,
week52High, week52Low, pe, eps,
currency, exchange, primaryExchange, isin, beta,
dataAt, hasReport, hasResearch, reportDate,
sharesOut, prevClose, sector, industry, country
```

**Important note:** The `hasReport` column (column 34) returns `null` — it uses a Google Sheets formula that the Sheets API does not evaluate. Company name matching is used instead as a workaround.

### 2.2 xAI Grok API (Sentiment Analysis)

Environment variable: `XAI_API_KEY`

Module: `scripts/grok-sentiment.js`

Provides:
- `xai.init({ apiKey })` — one-time initialisation
- `xai.sentiment(ticker)` — single ticker analysis
- `xai.sentimentBatch(tickers)` — up to 10 tickers per call

Response shape:
```javascript
{
  score: -100 to +100,       // overall sentiment score
  signal: 'positive'|'neutral'|'negative',
  key_themes: string[],
  sources: string[],
  summary: string
}
```

**Limitation:** API timeouts are common and no retry logic exists. When Grok is unavailable, the report is flagged "AI sentiment unavailable at time of writing" in the Sources section.

### 2.3 Web Search (Background Research)

Uses `ollama_web_search` for additional background on companies — financial results, news, competitive landscape. Results are used to augment the *Recent Catalysts* and *Thesis Evaluation* sections.

### 2.4 File System (Canonical Registry)

`reports/index.json` is the single source of truth for what reports exist. It is read by the build script and validated against the filesystem. No report file exists unless it is registered here, and nothing is registered unless the HTML file exists.

---

## 3. Report Structure

Each report is a standalone HTML file. The following sections appear in every report, in order:

### 3.1 Section Inventory

| # | Section | Content |
|---|---------|---------|
| 1 | Executive Summary | One-paragraph thesis, current price/mcap, bottom-line recommendation |
| 2 | Business Model | What the company does, how it makes money, competitive positioning |
| 3 | Financial Snapshot | Grid of key metrics (price, market cap, P/E, EPS, revenue, margins, 52-week range, shares outstanding, currency) |
| 4 | Recent Catalysts | Bullet list of known news, announcements, results, or developments |
| 5 | Thesis Evaluation | Three scenario cards (bull/base/bear) with probability-weighted conviction score |
| 6 | Key Risks | Ordered list of the most material risks |
| 7 | Who Should Own It / Avoid It | Two-paragraph targeting guidance |
| 8 | Recommendation | Expanded view of the rating and thesis |
| 9 | Entry / Exit Framework | Price zones with labels |
| 10 | Conviction Trend | Historical chart of conviction scores with SVG line graph and a table of prior report dates/scores |
| 11 | Sources | Standard attribution block |

### 3.2 Recommendation Tiers

| Tier | Conviction Range |
|------|-----------------|
| BUY (strong) | 65-79 |
| OPPORTUNISTIC BUY | 50-64 |
| SPECULATIVE BUY | 30-49 |
| REDUCE / Avoid | <30 |

### 3.3 Conviction Chart Formula

```
y = 156 - 1.32 * conviction
```

Maps conviction score (0-100) to chart height in pixels. Score 80 = 50.4px (top zone). Score 30 = 156px (bottom zone). Two-point calibration: (30, 156) and (80, 50).

### 3.4 Language Rule

British English only throughout every published output. No American spellings, no emojis, no non-ASCII characters. This applies to all HTML reports, index entries, and any external-facing text.

---

## 4. Index Format

### 4.1 Canonical Registry — `reports/index.json`

```json
{
  "ticker": "PNG",
  "company": "Kraken Robotics Inc",
  "sector": "Defence Technology / Maritime Robotics",
  "file": "krakenroboticsinc.html",
  "date": "2026-04-16",
  "recommendation": "SPECULATIVE BUY",
  "conviction": 52,
  "exchange": "TSX-V",
  "isin": "FR0000075954",
  "marketCap": 2659250897,
  "currency": "CAD",
  "price": 8.68,
  "summary": "Record FY2025: CAD 102M revenue, CAD 25M EBITDA..."
}
```

Required fields: `ticker`, `file`, `date` (ISO YYYY-MM-DD), `recommendation`, `conviction`.

Optional fields: `isin`, `price`, `sector`, `exchange`, `currency`, `marketCap`, `universes`, `summary`.

### 4.2 Browser Index — `public/reports-index.json`

Built from canonical via `buildBrowserIndex()` in `site-manifest.js`. Served at dyorhq.ai/reports-index.json. Shape:

```json
{
  "ticker": "PNG",
  "isin": "FR0000075954",
  "exchange_code": "TSX-V",
  "exchange": "TSX-V",
  "rating": "SPECULATIVE BUY",
  "recommendation": "SPECULATIVE BUY",
  "company": "Kraken Robotics Inc",
  "file": "krakenroboticsinc",
  "report_url": "/reports/krakenroboticsinc",
  "conviction": 52,
  "summary": "Record FY2025...",
  "date": "2026-04-16",
  "universes": []
}
```

`rating` is `recommendation` with the sub-label stripped (e.g., "REDUCE - SPECULATIVE" → "REDUCE").

---

## 5. Build Pipeline

**Trigger:** `npm run build` or `node scripts/build-site.js`

### 5.1 Steps

1. Read `reports/index.json` (canonical registry)
2. Build browser index via `buildBrowserIndex()` → write `reports-index.json`
3. Run `validateProject()` (see 5.2)
4. If validation fails → build aborts with issue list
5. Wipe `public/` directory
6. Copy `assets/` → `public/assets/`
7. Copy source pages (`index.html`, `portfolio.html`, `methodology.html`, `about.html`) → `public/`
8. Copy every report HTML from `reports/` → `public/reports/`
9. Copy `reports-index.json` → `public/`
10. Run `generate-sitemap.js` → produce `sitemap.xml` and `robots.txt`
11. Print summary

### 5.2 Validation Checks

`validateProject()` in `site-manifest.js` performs these checks:

- Every index entry has `ticker`, `file`, `company`, `conviction` (number), `date`
- No duplicate tickers
- No duplicate file references
- Every indexed file exists on disk
- No orphan HTML files outside the index
- `reports-index.json` is in sync with `reports/index.json`
- Source pages (`index.html`, `portfolio.html`, `methodology.html`, `about.html`) exist

Build aborts on any validation error. No silent failures.

---

## 6. Deployment

**GitHub remote:** `https://github.com/hmcgauran/dyorhq.git`

**Branch tracked by Netlify:** `dyor-v3-work`

### 6.1 Flow

1. Work committed to `dyor-v3-work`
2. `git push origin dyor-v3-work`
3. Netlify detects push on `dyor-v3-work` → triggers build
4. `netlify.toml` runs `node scripts/build-site.js`
5. Built output served from `public/` directory

No manual Netlify CLI required after the initial setup. Auto-deploy handles everything.

---

## 7. Report Writing Process

### Step 1 — Triage

Check the Google Sheet for new tickers. Match against `reports/index.json` using:
- Ticker string normalisation (strip exchange prefixes: `NYSE:`, `LSE:`, `TSX-V:`, etc.)
- Company name normalisation (remove exchange suffixes like "(NYSE:KO)", strip `plc`, `ltd`, `inc`)
- ISIN matching (most reliable when available)

Unmatched tickers are flagged as candidates for new reports.

### Step 2 — Data Gathering

For each new ticker (run in parallel where possible):
1. Fetch live quote data from Google Finance Sheet (price, market cap, P/E, EPS, 52-week range, volume)
2. Run web searches for recent financial results, news, catalysts
3. Attempt xAI Grok sentiment via `xai.sentimentBatch()`; flag as unavailable on timeout

### Step 3 — Analysis

For each ticker:
- Assess business model and competitive positioning
- Evaluate financial health (revenue, margins, cash position, growth trajectory)
- Identify key catalysts and risks
- Score conviction using the scenario-weighting framework:

```
Bull (25-30% weight): positive outcomes
Base (50% weight): continuation of current trajectory
Bear (20-30% weight): adverse scenarios

Conviction = (Bull% x BullScore) + (Base% x BaseScore) + (Bear% x BearScore)
```

### Step 4 — Draft Report

Write the HTML using the standard 11-section structure. Use MiniMax for content generation. Apply the chart formula for the conviction visual.

### Step 5 — Persist

- Save HTML to `reports/{slug}.html`
- Add entry to `reports/index.json`
- Run `npm run build` to validate and build

### Step 6 — Deploy

```bash
git add -A && git commit -m "Description" && git push origin dyor-v3-work
```

Netlify auto-deploys within seconds.

---

## 8. Conviction Tracking

The `index.json` stores only the **current** conviction score per ticker. Historical tracking lives in the HTML report itself under the **Conviction Trend** section:

```html
<section class="report-section">
  <h2>Conviction Trend</h2>
  <p class="conviction-history-summary">
    Latest conviction: <strong>52/100</strong>.
    Trend versus prior report: <strong class="neutral">Flat</strong>.
  </p>
  <div class="conviction-history-chart">
    <svg aria-label="Conviction score trend for PNG" role="img" viewBox="0 0 520 180">
      <!-- SVG line chart plotting y=156-1.32*x per data point -->
    </svg>
  </div>
  <table class="conviction-history-table">
    <thead><tr><th>Report date</th><th>Conviction</th></tr></thead>
    <tbody>
      <tr><td>2026-04-16</td><td>52</td></tr>
    </tbody>
  </table>
</section>
```

When a report is updated, the table row is added and the chart re-renders. The trend label (Flat / Up / Down) is derived by comparing the current score to the previous entry in the table.

---

## 9. Key Constraints and Rules

| Rule | Detail |
|------|--------|
| Dates | ISO YYYY-MM-DD only in `index.json` and HTML. `formatDate()` in `main.js` parses only ISO format. |
| Language | British English only. No American spellings, no emojis, no non-ASCII in any published output. |
| Sources block | Never include API keys, spreadsheet IDs, file paths, or credentials in published HTML. |
| Sentiment attribution | "AI-powered sentiment analysis" only. Do not name Grok, xAI, or model in published HTML. |
| Build validation | Build aborts on any validation error. No silent failures. |
| One ticker per entry | Duplicate tickers are blocked by validation. |
| File must exist | Every index entry must have a matching HTML file on disk. |

---

## 10. Known Limitations

| # | Limitation | Impact |
|---|------------|--------|
| 1 | Grok API timeouts — no retry logic | Reports may lack sentiment data; "unavailable" flag used as fallback |
| 2 | No automated conviction revalidation | Analyst manually computes conviction from scenario weighting on each write/update |
| 3 | `hasReport` column not evaluated by Sheets API | Company name matching used as workaround; cannot programmatically confirm which tickers have reports |
| 4 | Full rebuild every time | Acceptable at 319 reports; would not scale to thousands without incremental build |
| 5 | No image generation | Logos and charts use CSS/SVG only; no external image dependencies |
| 6 | Beta/Sentiment timeout risk | API reliability varies; sentiment may be missing on high-volume runs |
| 7 | BME/ASX/TSX-V liquidity | Some reports cover less-liquid exchanges; institutional ownership data limited |

---

## 11. File Reference

| File | Purpose |
|------|---------|
| `reports/index.json` | Canonical registry — single source of truth |
| `reports-index.json` | Browser-optimised index served to the web |
| `scripts/build-site.js` | Main build entry point |
| `scripts/site-manifest.js` | Paths, validation, index builders |
| `scripts/grok-sentiment.js` | xAI Grok API wrapper |
| `assets/css/main.css` | Site-wide styles |
| `assets/css/report-canonical.css` | Report-specific styles |
| `assets/js/main.js` | Browser-side JS (date formatting, badge colours, search) |
| `netlify.toml` | Netlify build configuration |
| `cron-scripts/lib/google-finance-sheet.js` | Google Sheets data loader |
| `projects/dyorhq/RNS-WORKFLOW.md` | RNS alert and triage workflow |