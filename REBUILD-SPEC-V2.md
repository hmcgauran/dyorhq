# DYOR HQ — Version 2 Rebuild Specification

> Status: Active  
> Compiled: 17 April 2026  
> Supersedes: ARCHITECTURE.md v1.0  
> Purpose: Feed this document to an AI agent to execute the full v2 rebuild. Every instruction is prescriptive and self-contained.

---

## How to Use This Document

This is an executable rebuild programme. Feed it in full to your AI agent as context. The agent should:

1. Read every section before touching any file
2. Execute phases in order — later phases depend on earlier ones
3. Confirm completion of each phase before proceeding
4. Flag any ambiguity rather than guessing

The existing 319 reports and their data are preserved throughout. Nothing is deleted unless explicitly instructed.

---

## 1. System Context

DYOR HQ is a static-generated investment research website. It produces HTML reports for individual equity tickers, stored in `projects/dyorhq/reports/`, registered in `reports/index.json`, validated at build time, and deployed to Netlify at dyorhq.ai via GitHub push to the `dyor-v3-work` branch.

**Stack (unchanged in v2):**
- Node.js build scripts
- Vanilla HTML/CSS/JS
- Google Sheets API v4 — primary data source
- xAI Grok API — sentiment analysis
- GitHub + Netlify — CI/CD and hosting

**What v2 fixes:** schema integrity, build-time content validation, ticker matching reliability, asset cache-busting, Grok retry logic, stale report detection, and automation of the build/deploy/audit cycle.

---

## 2. Canonical Schema v2

### 2.1 `reports/index.json` — Entry Shape

Every entry in `reports/index.json` must conform to the following schema from v2 onwards. Fields marked **required** will fail the build if absent or malformed.

```json
{
  "ticker":           "PNG",               // required — bare ticker, no exchange prefix
  "company":          "Kraken Robotics Inc", // required
  "isin":             "CA4925821081",       // required — ISO 6166 format, 12 characters
  "exchange":         "TSX-V",             // required
  "file":             "krakenroboticsinc.html", // required — filename only, no path
  "date":             "2026-04-16",        // required — ISO YYYY-MM-DD only
  "recommendation":   "SPECULATIVE BUY",   // required — must match a valid tier label
  "conviction":       52,                  // required — integer, 0–100 inclusive
  "currency":         "CAD",               // required — ISO 4217 three-letter code
  "price":            8.68,                // required — numeric, no currency symbol
  "marketCap":        2659250897,          // required — numeric, in local currency units
  "sector":           "Defence Technology / Maritime Robotics", // optional
  "summary":          "Record FY2025...",  // optional — plain text, no HTML
  "universes":        [],                  // optional — array of string labels
  "priceAtLastReport":    8.68,            // required — set at write time, used by stale detector
  "marketCapAtLastReport": 2659250897,     // required — set at write time
  "peAtLastReport":       null,            // required — null if unavailable
  "convictionHistory": [                   // required — at minimum one entry
    { "date": "2026-04-16", "conviction": 52 }
  ]
}
```

**Removed fields (do not carry forward):**
- `report_url` — redundant; the browser index always derives it from `file`

**Valid recommendation tier labels (exact strings only):**
```
BUY
OPPORTUNISTIC BUY
SPECULATIVE BUY
REDUCE
```

**Currency rules:**
- `currency` must be a standalone ISO 4217 code (`GBP`, `GBX`, `USD`, `CAD`, `AUD`, `EUR`)
- `price` must be a plain number (e.g., `8.68`, `829`, `150.32`) — no symbols, no suffixes
- GBX (pence sterling) is a valid currency code; prices in pence are stored as-is

### 2.2 `public/reports-index.json` — Browser Index Shape

Built automatically by `buildBrowserIndex()`. No manual edits. Shape unchanged from v1 except `report_url` is now always derived from `file` (never read from canonical).

---

## 3. Build Validation Rules v2

Update `validateProject()` in `scripts/site-manifest.js` to enforce the following. Build must abort with a specific error message for each failure.

### 3.1 Structural checks (carry forward from v1)
- Every entry has `ticker`, `file`, `company`, `conviction`, `date`
- No duplicate tickers
- No duplicate file references
- Every indexed file exists on disk
- No orphan HTML files outside the index
- `reports-index.json` is in sync with `reports/index.json`
- Source pages (`index.html`, `portfolio.html`, `methodology.html`, `about.html`) exist

### 3.2 Semantic checks (new in v2)

**Date format:**
```
date must match /^\d{4}-\d{2}-\d{2}$/ and be a valid calendar date
```
Error: `[VALIDATION] {ticker}: date "${date}" is not ISO YYYY-MM-DD`

**Conviction range:**
```
conviction must be an integer between 0 and 100 inclusive
```
Error: `[VALIDATION] {ticker}: conviction ${conviction} is outside 0–100`

**Recommendation tier:**
```
recommendation must be exactly one of: "BUY", "OPPORTUNISTIC BUY", "SPECULATIVE BUY", "REDUCE"
```
Error: `[VALIDATION] {ticker}: recommendation "${recommendation}" is not a valid tier`

**Conviction/tier consistency:**
```
BUY:               conviction must be 65–79
OPPORTUNISTIC BUY: conviction must be 50–64
SPECULATIVE BUY:   conviction must be 30–49
REDUCE:            conviction must be < 30
```
Error: `[VALIDATION] {ticker}: conviction ${conviction} inconsistent with recommendation "${recommendation}"`

**Price type:**
```
price must be a finite number (typeof === 'number' && isFinite(price))
```
Error: `[VALIDATION] {ticker}: price "${price}" is not a numeric value`

**Currency format:**
```
currency must be a 3-letter uppercase string matching /^[A-Z]{3}$/
```
Error: `[VALIDATION] {ticker}: currency "${currency}" is not a valid ISO 4217 code`

**ISIN format:**
```
isin must match /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/ (standard ISO 6166)
```
Error: `[VALIDATION] {ticker}: isin "${isin}" does not match ISO 6166 format`

**convictionHistory:**
```
convictionHistory must be a non-empty array
Each entry must have { date: ISO string, conviction: 0–100 integer }
Most recent entry date must equal the top-level date field
Most recent entry conviction must equal the top-level conviction field
```
Error: `[VALIDATION] {ticker}: convictionHistory is missing or malformed`

**Snapshot fields:**
```
priceAtLastReport must be a finite number
marketCapAtLastReport must be a finite number
peAtLastReport must be a finite number or null
```
Error: `[VALIDATION] {ticker}: snapshot field ${field} is missing or non-numeric`

### 3.3 HTML content checks (new in v2)

For each report HTML file, parse and verify the presence of all 11 required section headings:

```javascript
const REQUIRED_SECTIONS = [
  'Executive Summary',
  'Business Model',
  'Financial Snapshot',
  'Recent Catalysts',
  'Thesis Evaluation',
  'Key Risks',
  'Who Should Own It',   // heading may include "/ Avoid It" — match by prefix
  'Recommendation',
  'Entry',               // "Entry / Exit Framework" — match by prefix
  'Conviction Trend',
  'Sources'
];
```

Match by checking for `<h2>` elements whose text content starts with the listed string (case-insensitive, trimmed). A missing section fails the build.

Error: `[VALIDATION] {file}: missing required section "${section}"`

---

## 4. Asset Cache-Busting

In `scripts/build-site.js`, before copying `assets/` to `public/assets/`, read the current git commit hash:

```javascript
const { execSync } = require('child_process');
const gitHash = execSync('git rev-parse --short HEAD').toString().trim();
```

When writing `index.html`, `portfolio.html`, `methodology.html`, `about.html` to `public/`, perform a string replacement on all `<link>` and `<script>` references to local assets:

```
href="assets/css/main.css"           → href="assets/css/main.css?v={gitHash}"
href="assets/css/report-canonical.css" → href="assets/css/report-canonical.css?v={gitHash}"
src="assets/js/main.js"              → src="assets/js/main.js?v={gitHash}"
```

Apply the same replacement when copying report HTML files to `public/reports/`.

This ensures that every deploy with a new commit hash breaks the browser cache for all assets.

---

## 5. Ticker Matching v2

Replace the current ticker matching logic in the triage/audit flow with the following three-tier resolution chain. Implement in `cron-scripts/lib/ticker-resolver.js` (new file).

### 5.1 Resolution order

**Tier 1 — ISIN match (authoritative)**
If the sheet row has an ISIN and the canonical index has an ISIN for any entry, match on ISIN equality. Return the matched entry with `confidence: 'high'`.

**Tier 2 — Normalised ticker match**
Normalise both sides before comparison:
```javascript
function normaliseTicker(raw) {
  // Remove exchange prefixes: NYSE:, LSE:, ISE:, TSX-V:, TSX:, ASX:, BME:, etc.
  let t = raw.replace(/^[A-Z\-]+:/i, '').trim();
  // Remove exchange suffix in parentheses: "(NYSE:KO)", "(LSE)" etc.
  t = t.replace(/\s*\([^)]*\)/g, '').trim();
  // Remove trailing exchange suffixes: ".L", ".AX", " TSX-V" etc.
  t = t.replace(/\.(L|AX|TO|V)$/i, '').trim();
  t = t.replace(/\s+(TSX-V|TSX|LSE|NYSE|ISE|ASX|BME)$/i, '').trim();
  return t.toUpperCase();
}
```
Match `normaliseTicker(sheetTicker)` against `normaliseTicker(indexTicker)` for every entry. Return matched entry with `confidence: 'medium'`. If multiple entries match, flag as ambiguous.

**Tier 3 — Normalised company name match (fallback only)**
```javascript
function normaliseCompany(raw) {
  return raw
    .replace(/\s*\([^)]*\)/g, '')   // remove parenthetical exchange tags
    .replace(/\b(plc|ltd|inc|corp|sa|nv|ag|se|as|oy)\b/gi, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
    .trim();
}
```
Match on equality. Return matched entry with `confidence: 'low'`. Always flag low-confidence matches for human review.

### 5.2 Output format

```javascript
{
  sheetTicker:   'PTSB',
  resolved:      true,       // false if no match found
  confidence:    'high',     // 'high' | 'medium' | 'low' | null
  indexEntry:    { ... },    // matched entry, or null
  ambiguous:     false,      // true if multiple entries matched at same tier
  matchedBy:     'isin',     // 'isin' | 'ticker' | 'company' | null
  requiresReview: false      // true for low confidence or ambiguous
}
```

### 5.3 Audit output

The ticker audit script must output two lists:
- `genuinelyNew` — tickers with `resolved: false` after all three tiers
- `requiresReview` — tickers with `confidence: 'low'` or `ambiguous: true`

Do not silently discard ambiguous or low-confidence matches.

---

## 6. Grok Sentiment Retry Logic

Update `scripts/grok-sentiment.js` to wrap every API call in a retry function:

```javascript
async function withRetry(fn, maxAttempts = 3, baseDelayMs = 2000) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1); // 2s, 4s, 8s
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  // Log failure
  const logEntry = {
    timestamp: new Date().toISOString(),
    error: lastError?.message || String(lastError)
  };
  fs.appendFileSync(
    path.join(__dirname, '../../state/sentiment-failures.jsonl'),
    JSON.stringify(logEntry) + '\n'
  );
  return null; // caller handles null as "unavailable"
}
```

Wrap `xai.sentiment()` and `xai.sentimentBatch()` calls with `withRetry`. Ensure `state/sentiment-failures.jsonl` exists (create if absent).

---

## 7. Stale Report Detector

Create `cron-scripts/stale-detector.js`.

### 7.1 Logic

```
For each entry in reports/index.json:
  1. Find the matching row in the Google Sheet by ISIN (tier 1) or normalised ticker (tier 2)
  2. If no match found, skip (log as unresolvable)
  3. If exchange is LSE and current time is outside 08:00–16:30 GMT, skip (log as deferred)
  4. Compute deltas:
       priceDelta    = abs(currentPrice - priceAtLastReport) / priceAtLastReport
       marketCapDelta = abs(currentMktCap - marketCapAtLastReport) / marketCapAtLastReport
       peDelta       = abs(currentPE - peAtLastReport)   [skip if either is null]
  5. Flag as stale if any of:
       priceDelta    > 0.15   (>15% price move)
       marketCapDelta > 0.20  (>20% market cap move)
       peDelta       > 20     (>20 point PE change)
```

### 7.2 Output

Write results to `state/stale-candidates.json`:

```json
{
  "generatedAt": "2026-04-17T10:30:00Z",
  "stale": [
    {
      "ticker": "AUTL",
      "company": "Autolus Therapeutics",
      "lastReportDate": "2026-04-08",
      "triggers": ["price: +22.4%", "marketCap: +21.1%"],
      "currentPrice": 3.21,
      "priceAtLastReport": 2.62
    }
  ],
  "deferred": [
    { "ticker": "GLEN", "reason": "LSE outside market hours" }
  ],
  "unresolvable": [
    { "ticker": "XYZ", "reason": "No sheet match found" }
  ]
}
```

### 7.3 LSE market hours check

```javascript
function isLSEOpen() {
  const now = new Date();
  // Convert to GMT (UTC)
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  const utcTime = utcHour * 60 + utcMinute;
  const open  = 8  * 60;      // 08:00 GMT
  const close = 16 * 60 + 30; // 16:30 GMT
  const day = now.getUTCDay();
  return day >= 1 && day <= 5 && utcTime >= open && utcTime < close;
}
```

For LSE-listed tickers (where `exchange` contains `LSE` or `AIM`), skip price comparison if `!isLSEOpen()` and add to the `deferred` list.

---

## 8. Post-Deploy Health Check

Create `scripts/health-check.js`.

### 8.1 Logic

```javascript
// Reads local canonical count
const canonical = JSON.parse(fs.readFileSync('reports/index.json'));
const localCount = canonical.length;

// Fetches live browser index count
const response = await fetch('https://dyorhq.ai/reports-index.json');
const live = await response.json();
const liveCount = live.length;

if (liveCount !== localCount) {
  console.error(`[HEALTH] MISMATCH: live=${liveCount}, local=${localCount}`);
  process.exit(1);
}
console.log(`[HEALTH] OK: ${liveCount} reports live`);
```

### 8.2 Integration

Add to `package.json` scripts:
```json
"health-check": "node scripts/health-check.js"
```

This script is called by GitHub Actions after deployment confirms completion. It does not block Netlify's build — it runs as a post-deploy step in the Actions workflow.

---

## 9. GitHub Actions Workflow

Create `.github/workflows/build-and-deploy.yml`:

```yaml
name: Build, Deploy, Verify

on:
  push:
    branches: [dyor-v3-work]

jobs:
  build-deploy-verify:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci
        working-directory: projects/dyorhq

      - name: Run build and validate
        run: npm run build
        working-directory: projects/dyorhq

      - name: Wait for Netlify deploy
        run: sleep 30

      - name: Post-deploy health check
        run: node scripts/health-check.js
        working-directory: projects/dyorhq
```

Note: Netlify auto-deploy is already configured. The Actions workflow adds pre-deploy build validation and post-deploy verification. It does not push to Netlify directly — Netlify responds to the push event independently.

---

## 10. Migration Plan (Existing 319 Reports)

Run this migration before activating v2 validation. The migration must be idempotent — safe to run multiple times.

### 10.1 Create migration script

Create `scripts/migrate-index-v2.js`. This script reads `reports/index.json`, transforms every entry to the v2 schema, and writes the result back. It does not touch any HTML files.

### 10.2 Field-by-field migration rules

**`date` (normalise to ISO)**

For each entry:
- If `date` already matches `/^\d{4}-\d{2}-\d{2}$/`, leave unchanged
- If `date` is a human-readable string (e.g., "16 April 2026"), parse it:
  ```javascript
  const parsed = new Date(dateStr);
  if (!isNaN(parsed)) {
    entry.date = parsed.toISOString().split('T')[0];
  } else {
    entry.date = 'NEEDS-REVIEW'; // flag for manual correction
  }
  ```
- Log all transformed dates and all `NEEDS-REVIEW` flags

**`price` (normalise to numeric)**

For each entry:
- If `typeof price === 'number'`, leave unchanged
- If `price` is a string, strip currency symbols and whitespace:
  ```javascript
  const numeric = parseFloat(String(price).replace(/[^0-9.]/g, ''));
  entry.price = isNaN(numeric) ? null : numeric;
  ```
- If price becomes `null`, flag for manual review

**`currency` (add if missing, infer from price string)**

For each entry:
- If `currency` is present and a 3-letter uppercase string, leave unchanged
- If `currency` is absent, attempt to infer:
  - If original `price` string contained `GBX` → `currency = 'GBX'`
  - If original `price` string contained `$` → `currency = 'USD'`
  - If `exchange` contains `LSE` or `AIM` → `currency = 'GBX'` (default for UK equities in pence)
  - If `exchange` contains `TSX` → `currency = 'CAD'`
  - If `exchange` contains `ASX` → `currency = 'AUD'`
  - If `exchange` contains `BME` → `currency = 'EUR'`
  - If `exchange` contains `NYSE` or `NASDAQ` → `currency = 'USD'`
  - Otherwise → flag as `NEEDS-REVIEW`

**`isin` (enforce presence)**

For each entry:
- If `isin` is present and matches `/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/`, leave unchanged
- If `isin` is absent, set `isin = 'NEEDS-REVIEW'` and log the ticker
- Do not attempt to auto-populate ISIN — this requires human lookup

**`recommendation` (normalise tier label)**

For each entry:
- Apply case-insensitive normalisation:
  ```
  "strong buy" → "BUY"
  "buy (strong)" → "BUY"
  "opportunistic buy" → "OPPORTUNISTIC BUY"
  "speculative buy" → "SPECULATIVE BUY"
  "reduce" → "REDUCE"
  "reduce - speculative" → "REDUCE"
  "avoid" → "REDUCE"
  ```
- If the value cannot be mapped, set to `'NEEDS-REVIEW'` and log

**`report_url` (remove)**

Delete `report_url` from every entry if present.

**`priceAtLastReport`, `marketCapAtLastReport`, `peAtLastReport` (backfill)**

Set from the current values in the entry:
```javascript
entry.priceAtLastReport = typeof entry.price === 'number' ? entry.price : null;
entry.marketCapAtLastReport = typeof entry.marketCap === 'number' ? entry.marketCap : null;
entry.peAtLastReport = typeof entry.pe === 'number' ? entry.pe : null;
```
These will be stale (they reflect the last-written report values, not the current live price), which is correct — the stale detector uses them as the baseline to compare against current sheet data.

**`convictionHistory` (backfill from `reports/data/`)**

The `reports/data/{TICKER}.json` files contain a `scores.history` array with the full conviction history for each ticker. Use this as the authoritative source for backfilling `convictionHistory` — do not rely on HTML parsing.

```javascript
// Attempt to load scores.history from reports/data/{TICKER}.json
const dataFile = path.join('reports/data', `${entry.ticker}.json`);
if (fs.existsSync(dataFile)) {
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const history = data?.scores?.history;
  if (Array.isArray(history) && history.length > 0) {
    entry.convictionHistory = history
      .filter(h => h.score != null)
      .map(h => ({
        date: h.date || entry.date,   // use entry.date if history date is blank
        conviction: h.score
      }));
  }
}
// Fallback: single-entry baseline if no data file or empty history
if (!entry.convictionHistory || entry.convictionHistory.length === 0) {
  entry.convictionHistory = [
    { date: entry.date, conviction: entry.conviction }
  ];
}
```

Note: Some history entries in the data files have blank `date` fields (e.g., `"date": ""`). These are mapped to `entry.date` as a best-effort. Flag them in the migration log so they can be corrected manually if the actual date is known.

### 10.3 Migration output

After transforming all entries, the script must print:
```
Migration summary:
  Total entries:          319
  Dates normalised:        X
  Dates needing review:    X (list tickers)
  Prices normalised:       X
  Prices needing review:   X (list tickers)
  Currencies inferred:     X
  Currencies needing review: X (list tickers)
  ISINs needing review:    X (list tickers)
  Recommendations normalised: X
  Recommendations needing review: X (list tickers)
  report_url fields removed:  X
```

Write a migration log to `logs/migration-v2-{timestamp}.json` with the full detail.

### 10.4 Post-migration step

After running the migration script:
1. Manually review every entry flagged `NEEDS-REVIEW` in the log
2. Correct each one before running `npm run build`
3. Only run `npm run build` after all `NEEDS-REVIEW` flags are resolved

The build will fail on any `NEEDS-REVIEW` value because it will not pass semantic validation.

---

## 11. Report Writing Process v2

When writing a new report or updating an existing one, follow this process. These rules replace Step 5 (Persist) from ARCHITECTURE.md §7.

### 11.1 New report — index entry

Construct the index entry with all required v2 fields before writing the HTML:

```javascript
const entry = {
  ticker:                 normalisedTicker,    // bare ticker, no exchange prefix
  company:                companyName,
  isin:                   isin,                // required — look up if not in sheet
  exchange:               exchange,
  file:                   slug + '.html',
  date:                   todayISO,            // YYYY-MM-DD
  recommendation:         tier,               // exact tier label
  conviction:             convictionScore,    // 0–100 integer
  currency:               currency,           // ISO 4217
  price:                  price,              // numeric
  marketCap:              marketCap,          // numeric
  sector:                 sector,
  summary:                summaryText,
  universes:              [],
  priceAtLastReport:      price,
  marketCapAtLastReport:  marketCap,
  peAtLastReport:         pe ?? null,
  convictionHistory:      [{ date: todayISO, conviction: convictionScore }]
};
```

### 11.2 Updated report — index entry

When updating an existing report:
1. Read the existing entry from `reports/index.json`
2. Append to `convictionHistory`:
   ```javascript
   entry.convictionHistory.push({ date: todayISO, conviction: newConviction });
   ```
3. Update `date`, `recommendation`, `conviction`, `price`, `marketCap` to current values
4. Update `priceAtLastReport`, `marketCapAtLastReport`, `peAtLastReport` to current values
5. Do not change `ticker`, `file`, `isin`, or `convictionHistory` entries prior to today

### 11.3 File naming convention

- **Existing reports**: keep the current filename for URL continuity
- **New reports (v2 onwards)**: use `{TICKER}-{slug}.html` format
  - `TICKER` = bare ticker, uppercase (e.g., `PNG`)
  - `slug` = company name, lowercase, alphanumeric only, no spaces (e.g., `krakenrobotics`)
  - Example: `PNG-krakenrobotics.html`

### 11.4 British English rule

All published text must use British English throughout. This applies to all HTML report content, index `summary` fields, and any externally facing string. Validate mentally before committing:
- `-ise` not `-ize` (analyse, recognise, organise)
- `colour`, `favour`, `behaviour`, not `color`, `favor`, `behavior`
- `programme` not `program` (except in technical/code contexts)
- `defence`, `licence` (noun), `practice` (noun), not `defense`, `license`, `practize`

### 11.5 Sources block rule

The Sources section must never contain: API keys, spreadsheet IDs, internal file paths, credentials, model names (do not name Grok, xAI, or specific model versions), or any internal tooling reference.

---

## 12. Conviction Scoring Reference

The conviction scoring formula is not automated in v2 (it remains analyst-driven), but the following boundaries are enforced by build validation. Use this table when assigning scores.

| Recommendation       | Conviction Range | Typical Profile |
|----------------------|-----------------|-----------------|
| BUY                  | 65–79           | Strong fundamentals, clear near-term catalyst, limited downside |
| OPPORTUNISTIC BUY    | 50–64           | Solid thesis, some uncertainty, entry-point dependent |
| SPECULATIVE BUY      | 30–49           | High-risk/reward, binary catalyst risk, limited financial track record |
| REDUCE               | 0–29            | Deteriorating thesis, valuation stretched, risk/reward unfavourable |

The conviction score of 80+ is intentionally unoccupied — reserve for exceptional cases only, and note that the chart formula (`y = 156 − 1.32 × conviction`) is calibrated for the 30–80 range.

---

## 13. Data Inventory and Preservation

The following data assets exist in the current system and must be carried forward intact into v2. None of these directories or files may be deleted, renamed, or restructured during the rebuild unless explicitly stated below.

### 13.1 Asset inventory

| Location | Count | What it contains | v2 role |
|----------|-------|-----------------|---------|
| `reports/*.html` | 319 files | Published HTML reports — the primary output artefact | Preserved as-is; migration only touches `index.json` |
| `reports/index.json` | 1 file | Canonical registry | Migrated to v2 schema in place |
| `reports/data/*.json` | 228 files | Structured report data per ticker — includes full section text, price data, and `scores.history` array | Primary source for conviction history backfill; used for future report regeneration |
| `research/{company}/index.md` | 316 files | Per-company research notes — executive summary, business model, thesis evaluation, key risks | Preserved as-is; first-class research asset for future report updates |
| `research/{company}/rns/*.md` | 128 files | Individual RNS filings with material score, summary, key points, and investment impact | Preserved as-is; input to stale detection and report refresh |
| `research/{company}/data.json` | ~2 files (known) | Company data snapshots | Preserved as-is |
| `_archive/stale-data/data/` | 237 files | Earlier JSON data snapshots | Preserved as reference; not used in active pipeline |
| `_archive/stale-data/tmp/` | 18 files | Working audit notes from April 2026 | Preserved as reference |
| `_backups/cleanup-2026-04-14/` | 3 files | Index backup and diff from April 2026 cleanup | Preserved as reference |
| `tmp/` | 18 files | Working audit notes (same content as `_archive/stale-data/tmp/`) | Preserved as reference |

### 13.2 `reports/data/*.json` — schema

Each file is named `{TICKER}.json` and follows this shape:

```json
{
  "meta": {
    "ticker": "AAPL",
    "company": "Apple Inc",
    "exchange": "",
    "isin": "",
    "date": "10 Apr 2026",
    "recommendation": "HOLD",
    "conviction": 64,
    "lastRefreshed": "2026-04-11T10:00:00Z"
  },
  "price": {
    "current": 260.48,
    "marketCap": 3820000000000,
    "trailingPE": 32.96,
    "trailingEps": 7.9,
    "fiftyTwoWeekHigh": 288.61,
    "fiftyTwoWeekLow": 186.06
  },
  "sections": {
    "executiveSummary": { "text": "..." },
    "businessModel": { "text": "..." },
    "financialSnapshot": { "text": "...", "table": [...] },
    "recentCatalysts": { "text": "...", "items": [...] },
    "thesisEvaluation": { "text": "...", "bull": {...}, "base": {...}, "bear": {...} },
    "keyRisks": { "text": "...", "risks": [...] },
    "whoShouldOwn": { "text": "..." },
    "recommendation": { "text": "..." },
    "entryExit": { "text": "..." },
    "sources": { "marketData": "...", "additional": [...] }
  },
  "scores": {
    "current": { "score": 64, "band": "HOLD", "date": "", "delta": "0", "reason": "Initial coverage" },
    "history": [
      { "date": "", "score": 64, "band": "HOLD", "delta": "0", "reason": "Initial coverage" }
    ]
  }
}
```

This is the richest data source in the system. The `sections` object contains the full narrative content for every report section in structured form. The `scores.history` array is the authoritative conviction history. When regenerating or updating a report, this file is the primary input.

### 13.3 `research/{company}/index.md` — schema

Each file contains the company's research note in markdown, with the following sections:

```markdown
# {Company Name}

**Ticker:** {exchange}:{ticker} | **Price:** {price} | **Date:** {date}
**Recommendation:** {tier} | **Conviction:** {score}/100

---

## Executive Summary
## Business Model
## Financial Snapshot
## Recent Catalysts
## Thesis Evaluation
### Bull Case
### Base Case
### Bear Case
## Key Risks
```

These notes are the analyst-authored research substrate that underlies the published HTML. They are not published directly but are the canonical research record per company. When updating a report, the research note should be updated first, then the report regenerated from it.

### 13.4 `research/{company}/rns/*.md` — schema

Each file is named `{YYYY-MM-DD}-{slug}.md` and contains:

```markdown
# {Announcement Title}

**Ticker:** {ticker}
**Date:** {ISO datetime}
**URL:** {source URL}
**Material score:** {1-10}/10

---

## RNS Summary
{full announcement text}

## Key Points
{extracted key facts}

## Assessment
{MATERIAL | MONITORING | ROUTINE}

## Investment Impact
{analysis or "_Analysis to be completed._"}
```

RNS files with `Material score: 7+` or `Assessment: MATERIAL` are candidates for triggering a report update. This threshold should be used by the stale detector when evaluating whether an RNS warrants flagging a report for review.

### 13.5 Relationship between data assets

```
reports/data/{TICKER}.json     ← structured source of truth per report
       ↓
reports/{slug}.html            ← rendered output (generated from data file)
       ↓
reports/index.json             ← registry (summary metadata only)

research/{company}/index.md    ← analyst research notes (input to data file)
research/{company}/rns/*.md    ← RNS filings (trigger for updates)
```

When updating a report, the correct sequence is:
1. Update `research/{company}/index.md` with new analysis
2. Update `reports/data/{TICKER}.json` with new section text and scores
3. Regenerate `reports/{slug}.html` from the data file
4. Update `reports/index.json` entry

### 13.6 Missing data files

228 data files exist for 319 index entries — approximately 91 reports have no corresponding `reports/data/` file. For these:
- Conviction history falls back to single-entry baseline (see Section 10.2)
- Research notes may exist in `research/` even without a data file
- Flag these tickers in the migration log for future data file creation

---

## 14. File Reference v2

| File | Status | Purpose |
|------|--------|---------|
| `reports/index.json` | Modified | Canonical registry — v2 schema |
| `public/reports-index.json` | Auto-generated | Browser-optimised index |
| `scripts/build-site.js` | Modified | Add cache-busting |
| `scripts/site-manifest.js` | Modified | v2 validation rules |
| `scripts/grok-sentiment.js` | Modified | Retry logic |
| `scripts/health-check.js` | New | Post-deploy count verification |
| `scripts/migrate-index-v2.js` | New | One-time migration script |
| `cron-scripts/lib/ticker-resolver.js` | New | Three-tier ticker matching |
| `cron-scripts/stale-detector.js` | New | Stale report detection |
| `.github/workflows/build-and-deploy.yml` | New | CI/CD automation |
| `state/stale-candidates.json` | New | Stale detection output |
| `state/sentiment-failures.jsonl` | New | Grok failure log |
| `logs/migration-v2-{timestamp}.json` | New | Migration audit log |
| `assets/css/main.css` | Unchanged | Site-wide styles |
| `assets/css/report-canonical.css` | Unchanged | Report-specific styles |
| `assets/js/main.js` | Unchanged | Browser-side JS |
| `netlify.toml` | Unchanged | Netlify build config |
| `cron-scripts/lib/google-finance-sheet.js` | Unchanged | Google Sheets data loader |
| `reports/data/*.json` | Preserved | Structured report data — primary source for conviction history and report regeneration |
| `research/{company}/index.md` | Preserved | Per-company research notes |
| `research/{company}/rns/*.md` | Preserved | RNS filings per company |

---

## 14. Execution Order

Execute phases strictly in this order. Do not proceed to the next phase until the current phase is confirmed complete and error-free.

| Phase | Action | Confirms |
|-------|--------|---------|
| 0 | Verify data inventory: confirm `reports/data/`, `research/`, and `reports/*.html` are all present and untouched | File counts match Section 13.1 inventory |
| 1 | Create `scripts/migrate-index-v2.js` and run it | All 319 entries transformed; conviction history backfilled from `reports/data/`; migration log written |
| 2 | Manually resolve all `NEEDS-REVIEW` flags in migration log | Zero `NEEDS-REVIEW` values in `index.json` |
| 3 | Update `scripts/site-manifest.js` with v2 validation rules | `npm run build` passes all semantic checks |
| 4 | Update `scripts/build-site.js` with cache-busting | Build output HTML contains `?v={gitHash}` on asset refs |
| 5 | Update `scripts/grok-sentiment.js` with retry logic | Retry function present; `state/sentiment-failures.jsonl` created |
| 6 | Create `cron-scripts/lib/ticker-resolver.js` | Three-tier resolution with correct output shape |
| 7 | Create `cron-scripts/stale-detector.js` — integrate RNS material score threshold (score ≥ 7 flags for review) | Runs against live sheet; produces `state/stale-candidates.json` |
| 8 | Create `scripts/health-check.js` | Runs and returns OK against live site |
| 9 | Create `.github/workflows/build-and-deploy.yml` | Push to `dyor-v3-work` triggers build + health check |
| 10 | Run full build and push to `dyor-v3-work` | Netlify deploys; health check passes; live count matches canonical |

---

## 15. Known Constraints (Do Not Fix in v2)

The following limitations are acknowledged but out of scope for this rebuild. Do not attempt to address them.

| Limitation | Reason out of scope |
|------------|---------------------|
| Full rebuild on every deploy (no incremental build) | Acceptable at current scale (319 reports) |
| No image generation | CSS/SVG-only approach is intentional |
| `hasReport` formula not evaluated by Sheets API | Resolved by ISIN-primary matching in v2; no need to fix the sheet formula |
| 91 reports have no `reports/data/` file | Conviction history for these falls back to single-entry baseline; data files should be created as reports are next updated |
| LSE data unreliable outside 08:00–16:30 GMT | Handled by LSE exclusion filter in stale detector |
| Netlify API token not configured | Post-deploy verification handled via health-check script instead |

---

*End of DYOR HQ v2 Rebuild Specification*
