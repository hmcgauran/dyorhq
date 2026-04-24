# DYOR HQ v4 — Data & Report Pipeline

## Script responsibilities

| Script | Scope | Steps |
|--------|-------|-------|
| `pipeline-new-tickers.js` | Data gathering — per ticker, resumable | 5–9 |
| `generate-report.js` | Report generation — per ticker, reads disk only | 10–14 |
| `publish.js` | Validation, build, commit — site-wide, once per session | 15–17 |

---

## Step 1 — Add ticker to Google Sheet (manual)

Add the ticker to Column A. The sheet auto-populates financials and generates `research_slug`. Universe can be assigned at any time.

---

## Step 2 — Populate ISINs

```
node scripts/isin-populate-working.js
```

Fetches ISINs from OpenFIGI and writes them back to the sheet.

> **⚠ TODO:** Confirm the script filename matches what is actually in `scripts/`. The fixed version from the previous session was at `/private/tmp/isin-populate.js`.

---

## Step 3 — Download sheet snapshot

```
node scripts/sync-sheet.js
```

Single Google Sheets API call. Downloads all columns (A:AQ). Writes:

- `state/sheet-YYYY-MM-DDTHHMMSS.json` — timestamped archive
- `state/sheet-latest.json` — always points to most recent

All downstream scripts read from `state/sheet-latest.json`. This is the single source of truth for ticker, company name, slug, sector, pricing, and all other fields.

---

## Step 4 — Seed pipeline state

*First time only, or when backfilling existing research directories.*

```
node scripts/bootstrap-pipeline.js --dry-run   # check first
node scripts/bootstrap-pipeline.js
```

Reads `state/sheet-latest.json` and inspects `research/` directories. Marks already-completed stages in `state/pipeline.json`. Safe to re-run — only fills in missing entries, never overwrites existing ones.

Detects the following stages per ticker:

| Stage key | Detection |
|-----------|-----------|
| `directory` | `research/{slug}/` exists |
| `webResearch` | `research/{slug}/brave-web-*.json` exists |
| `edgar` | `research/{slug}/8-K-YYYY-MM-DD.md` or `10-K-YYYY-MM-DD.md` exists (Layer 1 marker) |
| `duckWeb` | `research/{slug}/duck-web-*.json` exists |
| `articleFetch` | `research/{slug}/playwright-*.json` exists |
| `grok` | `research/{slug}/grok-*.json` exists |
| `paperclip` | `research/{slug}/paperclip-*.json` exists |

Non-US tickers (LON:, EPA:, ASX:, FRA:, CVE:, BME:, TSE:, TSX:, HKEX:) are marked `edgar: "N/A"` and never queued for EDGAR.

---

## Steps 5–9 — `pipeline-new-tickers.js` (data gathering)

Reads `state/sheet-latest.json` and `state/pipeline.json`. Stages run sequentially per ticker. `pipeline.json` is written after each stage completes — safe to interrupt and resume.

### Step 5 — Process new tickers

```
node scripts/pipeline-new-tickers.js                    # all incomplete
node scripts/pipeline-new-tickers.js --ticker=MP        # single ticker
node scripts/pipeline-new-tickers.js --dry-run          # preview only
node scripts/pipeline-new-tickers.js --stage=web        # one stage only
```

### Step 6 — Scheduled refresh

```
node scripts/pipeline-new-tickers.js --refresh                          # web >30d, edgar >90d
node scripts/pipeline-new-tickers.js --refresh --max-age-web=14         # tighter web window
node scripts/pipeline-new-tickers.js --refresh --stage=web              # web only
```

Re-runs stages where the last completed date exceeds the configured age threshold. The `directory` stage is never refreshed.

### Stages (run in this order)

**5a. Create research directory**
Creates `research/{slug}/` if it does not exist. Stage key: `directory`.

**5b. Brave web research**
Calls `batch-web-research.js`. Saves to `research/{slug}/brave-web-{date}.json`. Stage key: `webResearch`.

**5c. EDGAR filings**
Calls `batch-edgar-filings.js`. Fetches 8-K (last 3), 10-Q (most recent), 10-K (most recent). Skipped for non-US tickers (marked `edgar: "N/A"`). Stage key: `edgar`.

Three-layer output per filing:
- **Layer 1** `{type}-{date}.md` — full clean markdown with YAML front matter (existence check target)
- **Layer 2** `{type}-{date}-exhibit.md` (8-K EX-99.1 press release) / `-mda.md`, `-business.md`, `-risks.md` (10-K/10-Q key sections)
- **Layer 3** `{type}-{date}-xbrl.json` — structured XBRL financial concepts (if iXBRL tags present)
- **Archive** `archive/{type}-{date}.html` — original HTML preserved

For existing HTML files created before the three-layer format was introduced, run `convert-edgar-filings.js` once to migrate them.

**5d. DuckDuckGo web research**
Four queries: earnings/results, analyst targets, recent news, competitive landscape. Saves to `research/{slug}/duck-web-{date}.json`. Parallel to Brave — not a replacement. Stage key: `duckWeb`.

**5e. Playwright article fetch**
Takes the top 2 URLs per query from the Brave and DuckDuckGo results already on disk, fetches each page with headless Chromium, and extracts full article text using Mozilla's Readability algorithm (Firefox Reader View). Saves to `research/{slug}/playwright-{date}.json` — array of articles with title, domain, word count, and up to 8,000 characters of clean body text.

Paywall domains (Bloomberg, FT, WSJ, Seeking Alpha, Barron's, etc.) are filtered out automatically. Total URLs capped at 10. Rate-limited to 2 seconds between page loads.

If Playwright is not installed (`npm install playwright && npx playwright install chromium`), the stage returns `N/A` rather than blocking the pipeline — Grok falls back to search snippets. Stage key: `articleFetch`.

`batch-grok-sentiment.js` reads `playwright-{date}.json` as its primary context (up to 5 articles, ~200 words each), supplemented by search snippets from Brave and DuckDuckGo.

**5f. Grok sentiment**
Calls xAI Grok API (`api.x.ai/v1/chat/completions`). Reads `brave-web-*.json` and `duck-web-*.json` from disk as context. Returns score (−100 to +100), signal, key themes, and summary. Saves to `research/{slug}/grok-{date}.json`. Skips API call if today's file already exists (cache check). Failures logged to `state/sentiment-failures.jsonl`. Stage key: `grok`.

**5f. Paperclip research** *(biotech/pharma only)*
Triggered if the `sector` field from the snapshot indicates life sciences, or if Grok key themes (written at step 5e) suggest it. Runs three PubMed E-utilities searches: clinical trials, mechanism of action, drug efficacy/safety. Returns up to 5 papers per search. Saves to `research/{slug}/paperclip-{date}.json`. Non-life-sciences tickers are marked `paperclip: "SKIP"` — a terminal state that does not register as incomplete. Stage key: `paperclip`.

---

*All raw data is now on disk in `research/{slug}/`. Report generation begins below.*

---

## Steps 10–14 — `generate-report.js` (per-ticker report generation)

Reads cached data from `research/{slug}/` only. Makes no API calls. Run per ticker once all data stages are complete.

```
node scripts/generate-report.js --ticker=MP
```

**Step 10 — Conviction calculation**
Scenario framework: Bull/Base/Bear probabilities default 25/50/25, adjusted by PE ratio and Grok score (minor weight). Scenario scores fixed at 92/62/25. Weighted average gives conviction 0–100, mapped to recommendation tier.

**Step 11 — Write `reports/data/{TICKER}.json`**
Full data model: meta, price, grok, scenario, sections. Section text fields (business model, thesis, risks, etc.) written as empty strings at this stage.

**Step 12 — Update `reports/index.json`**
Adds or updates the entry. New reports land with `universes: ["watchlist"]` only.

**Step 13 — `npm run build`**
Runs after each individual ticker. Exits non-zero on failure — process aborts.

**Step 14 — Append to `state/review-queue.jsonl`**
Queues the ticker for the review-watcher cron: conviction score, recommendation, Grok score, section count, summary snippet.

---

## Steps 15–17 — `publish.js` (site-wide, once per session)

Run after all reports for the session have been generated.

**Step 15 — `pre-commit-check.js`**
Validates all reports generated today:
- Price source present
- `brave-web-*.json` and `duck-web-*.json` files exist in `research/{slug}/`
- `grok-*.json` file exists in `research/{slug}/`
- Scenario table present
- Recommendation tier correct
- All 11 HTML sections present
- Summary clean

Aborts push if any check fails.

**Step 16 — Final build**
```
npm run build
```
Full site build. Aborts push on any error.

**Step 17 — Commit and push**
```
git add -A
git commit
git push origin dyor-v4-work
```
Only runs if there are staged changes.

---

## Outstanding code changes

All pipeline code changes are complete. No outstanding items.

| # | File | Status | Change |
|---|------|--------|--------|
| 1 | `batch-web-research.js` | ✓ Done | Reads from `state/sheet-latest.json`; output renamed to `brave-web-{date}.json` |
| 2 | `batch-edgar-filings.js` | ✓ Done | Reads from `state/sheet-latest.json`; three-layer output (`.md` + sections + xbrl.json + archive/) |
| 3 | `batch-duck-research.js` | ✓ Done | New script — DuckDuckGo Lite POST, 4 queries, `duck-web-{date}.json` |
| 4 | `batch-grok-sentiment.js` | ✓ Done | New script — xAI API, `grok-{date}.json`, failure log, cache check |
| 5 | `batch-paperclip-research.js` | ✓ Done | New script — PubMed E-utilities, 3 searches, `paperclip-{date}.json` |
| 6 | `bootstrap-pipeline.js` | ✓ Done | EDGAR detection updated to `.md`; `duckWeb`, `grok`, `paperclip` stages tracked |
| 7 | `pipeline-new-tickers.js` | ✓ Done | All 6 stages: directory, webResearch, edgar, duckWeb, grok, paperclip |
| 8 | `pre-commit-check.js` | ✓ Done | Checks `brave-web-*.json` and `duck-web-*.json`; issues: `no_brave_web`, `no_duck_web` |
| 9 | `convert-edgar-filings.js` | ✓ Done | New script — one-time migration of existing HTML files to three-layer format |
| 10 | `batch-playwright-fetch.js` | ✓ Done | New script — Playwright article fetcher, Readability extraction, `playwright-{date}.json` |
| 11 | `batch-grok-sentiment.js` | ✓ Done | Updated context loader — full articles from playwright as primary context, snippets as supplement |
| 12 | `pipeline-new-tickers.js` | ✓ Done | `articleFetch` stage added between duckWeb and grok |
| 13 | `bootstrap-pipeline.js` | ✓ Done | `playwright-*.json` detection added |
