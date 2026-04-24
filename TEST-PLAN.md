# DYOR HQ v4 — Pipeline Test Plan

Test against a single known US ticker (e.g. MP) and a known London ticker (e.g. LON:BP or equivalent) to cover both paths.

---

## 1. sync-sheet.js

**Purpose:** Verify the single sheet download writes correctly and all downstream scripts read from it.

```
node scripts/sync-sheet.js
```

Expected:
- `state/sheet-latest.json` written with `downloadedAt`, `rowCount`, and `tickers[]`
- `state/sheet-YYYY-MM-DDTHHMMSS.json` archive also written
- `rowCount` matches expected number of tickers
- Each ticker entry contains: `ticker`, `companyName`, `research_slug`, `sector`, `price`, `primaryExchange`

Failure modes to check:
- Missing `.env` / bad gws credentials → clear error, no partial file written
- Sheet empty or < 2 rows → script aborts with message

---

## 2. bootstrap-pipeline.js

**Purpose:** Verify seeding of pipeline.json from existing research directories.

```
node scripts/bootstrap-pipeline.js --dry-run
```

Expected (dry run):
- Counts printed: Snapshot / Added / Updated / Skipped
- Non-US tickers show `edgar: "N/A"`
- Tickers with existing `brave-web-*.json` show `webResearch` as done
- Tickers with existing `duck-web-*.json` show `duckWeb` as done
- Tickers with existing `grok-*.json` show `grok` as done
- Tickers with existing `paperclip-*.json` show `paperclip` as done
- Tickers with existing `8-K-*.html` show `edgar` as done
- "Dry run — pipeline.json not written" confirmed

```
node scripts/bootstrap-pipeline.js
```

Expected:
- `state/pipeline.json` written
- Re-run is idempotent (same counts, no overwrites)

---

## 3. pipeline-new-tickers.js — dry run

**Purpose:** Verify stage detection and EDGAR eligibility filtering.

```
node scripts/pipeline-new-tickers.js --dry-run
```

Expected:
- Non-US tickers (LON:, EPA:, etc.) do NOT show `edgar` in their pending stages
- US tickers show `edgar` as pending if not yet done
- All 6 stages appear correctly for new tickers
- "Dry run — no actions taken" confirmed

```
node scripts/pipeline-new-tickers.js --ticker=MP --dry-run
```

Expected:
- Only MP shown
- Pending stages listed correctly for MP

---

## 4. batch-web-research.js (Brave)

**Purpose:** Verify gws removed, output renamed to brave-web-*.

```
node scripts/batch-web-research.js --ticker=MP
```

Expected:
- Reads from `state/sheet-latest.json` (no `gws` call)
- Output file: `research/mpmaterialscorp/brave-web-YYYY-MM-DD.json`
- File contains `source: "brave"`, `queries[]` with 4 entries, `hits[]` per query
- No `web-YYYY-MM-DD.json` created (old filename must not appear)

Check:
```
ls research/mpmaterialscorp/brave-web-*.json
cat research/mpmaterialscorp/brave-web-$(date +%Y-%m-%d).json | jq '.queries | length'
# expect 4
```

---

## 5. batch-edgar-filings.js

**Purpose:** Verify three-layer conversion, reads from snapshot, no gws call.

```
node scripts/batch-edgar-filings.js --ticker=MP --force
```

Expected:
- Reads from `state/sheet-latest.json` ("Reading sheet snapshot..." in output)
- **Layer 1** written: `research/mpmaterialscorp/8-K-YYYY-MM-DD.md`, `10-Q-YYYY-MM-DD.md`, `10-K-YYYY-MM-DD.md`
- **Layer 2** written per form type:
  - 8-K: `8-K-YYYY-MM-DD-exhibit.md` (EX-99.1 press release) — or log message if no exhibit found
  - 10-Q: `10-Q-YYYY-MM-DD-mda.md`
  - 10-K: `10-K-YYYY-MM-DD-mda.md`, `10-K-YYYY-MM-DD-business.md`, `10-K-YYYY-MM-DD-risks.md`
- **Layer 3** written (if iXBRL data present): `8-K-YYYY-MM-DD-xbrl.json`, etc.
- **Archive**: `research/mpmaterialscorp/archive/8-K-YYYY-MM-DD.html` etc.
- No `.html` files at the top level of `research/mpmaterialscorp/`
- No old `8-K-*.html` at top level (all in archive/)

Check:
```
ls research/mpmaterialscorp/
# expect: *.md, *-xbrl.json (if XBRL present), archive/ directory
ls research/mpmaterialscorp/archive/
# expect: *.html originals

head -8 research/mpmaterialscorp/10-K-$(date +%Y-%m-%d).md
# expect YAML front matter: ticker, form_type, filing_date, source, converted_at, layer

cat research/mpmaterialscorp/10-K-$(date +%Y-%m-%d)-xbrl.json | jq '.concepts | keys | length'
# expect > 0 if the filing contained iXBRL tags (modern filings do)
```

Cache behaviour: re-running without `--force` should log "already exists — skipping" for each filing.

For a LON ticker:
```
node scripts/batch-edgar-filings.js --ticker=LON:BP --force
```
Expected:
- CIK not found → skips cleanly (LON tickers have no CIK)

---

## 5a. convert-edgar-filings.js

**Purpose:** Verify one-time migration of existing HTML files to the three-layer format.

First, dry run to see what would be converted:
```
node scripts/convert-edgar-filings.js --dry-run
```
Expected:
- Lists all `*.html` EDGAR files found, with planned output filenames
- "Dry run — no files were modified." confirmation

Run migration:
```
node scripts/convert-edgar-filings.js
```
Expected:
- For each HTML file: Layer 1 `.md` written, Layer 2 sections written (where content extracted), Layer 3 `-xbrl.json` written (if iXBRL present)
- Original HTML moved to `archive/` subdirectory
- Original HTML removed from top-level research directory
- Re-running is idempotent: "already exists" logged, no files overwritten

Check a specific ticker:
```
node scripts/convert-edgar-filings.js --ticker=MP --dry-run
# shows only mpmaterialscorp files
```

---

## 6. batch-duck-research.js

**Purpose:** Verify DuckDuckGo research runs and writes correct output.

```
node scripts/batch-duck-research.js --ticker=MP
```

Expected:
- Output file: `research/mpmaterialscorp/duck-web-YYYY-MM-DD.json`
- File contains `source: "duckduckgo"`, `queries[]` with 4 entries
- Cache behaviour: re-running without `--force` skips and exits cleanly

Check:
```
cat research/mpmaterialscorp/duck-web-$(date +%Y-%m-%d).json | jq '.queries | length'
# expect 4
```

Note: DDG may return 0 hits on some queries — that is not a failure. Check that the script exits 0 and the file is written regardless.

---

## 6a. batch-playwright-fetch.js

**Purpose:** Verify article fetching, Readability extraction, and cache behaviour.

Pre-condition: `brave-web-{today}.json` and/or `duck-web-{today}.json` must already exist for MP (run tests 4 and 6 first).

```
node scripts/batch-playwright-fetch.js --ticker=MP
```

Expected:
- Output file: `research/mpmaterialscorp/playwright-YYYY-MM-DD.json`
- File contains `articles[]` array — each entry has `url`, `domain`, `title`, `wordCount`, `text` (non-empty), `source` (`brave`/`duck`/`both`)
- `skipped[]` array present (may be empty or contain entries with `reason: blocked_domain` / `no_content` / `timeout`)
- `totalArticles` count > 0
- No Bloomberg, FT, WSJ, or Seeking Alpha URLs in `articles[]` (filtered out)
- Console output shows one line per URL with domain and word count or skip reason

Check:
```
cat research/mpmaterialscorp/playwright-$(date +%Y-%m-%d).json | jq '{totalArticles, skippedCount: (.skipped | length), firstArticle: .articles[0] | {domain, wordCount, textLen: .text | length}}'
```

Cache behaviour:
```
node scripts/batch-playwright-fetch.js --ticker=MP
# expect: "playwright-YYYY-MM-DD.json already exists — skipping"
```

Force re-fetch:
```
node scripts/batch-playwright-fetch.js --ticker=MP --force
```

Playwright not installed (simulate):
```
node -e "require('playwright')" 2>&1 || echo "would exit with ERROR: playwright not installed"
```

---

## 7. batch-grok-sentiment.js

**Purpose:** Verify xAI API call, output format, and cache behaviour.

Pre-condition: `XAI_API_KEY` set in `.env`.

```
node scripts/batch-grok-sentiment.js --ticker=MP
```

Expected:
- Output file: `research/mpmaterialscorp/grok-YYYY-MM-DD.json`
- File contains: `score` (integer −100 to +100), `signal` (one of 5 values), `keyThemes` (array), `summary` (string)
- Cache: re-running without `--force` skips and logs "already exists"
- Failure: missing `XAI_API_KEY` → clear error, exits 1, entry written to `state/sentiment-failures.jsonl`

Check:
```
cat research/mpmaterialscorp/grok-$(date +%Y-%m-%d).json | jq '{score, signal, keyThemes}'
```

---

## 8. batch-paperclip-research.js

**Purpose:** Verify PubMed search and output format.

```
node scripts/batch-paperclip-research.js --ticker=MRNA
```

Expected:
- Output file: `research/modernatx/paperclip-YYYY-MM-DD.json` (or whatever MRNA's slug is)
- File contains `source: "pubmed"`, `searches[]` with 3 entries, `papers[]` per search, `totalPapers` count
- Cache: re-running without `--force` skips cleanly

For a non-biotech ticker:
```
node scripts/batch-paperclip-research.js --ticker=MP
```
Expected:
- Script runs (it has no sector check — that lives in pipeline-new-tickers.js)
- Returns papers (likely 0 for a mining company — verify graceful empty result)

---

## 9. pipeline-new-tickers.js — full run

**Purpose:** End-to-end pipeline for a single ticker.

```
node scripts/pipeline-new-tickers.js --ticker=MP
```

Expected sequence:
1. `research/mpmaterialscorp/` created (or confirmed existing)
2. `batch-web-research.js` called → `brave-web-YYYY-MM-DD.json` written
3. `batch-edgar-filings.js` called → 8-K/10-Q/10-K `.md` files written (three-layer)
4. `batch-duck-research.js` called → `duck-web-YYYY-MM-DD.json` written
5. `batch-playwright-fetch.js` called → `playwright-YYYY-MM-DD.json` written
6. `batch-grok-sentiment.js` called → `grok-YYYY-MM-DD.json` written (uses playwright articles as context)
7. `batch-paperclip-research.js` NOT called (MP is mining, not life sciences) → stage set to `SKIP`
8. `state/pipeline.json` updated after each stage

Check pipeline.json entry for MP:
```
cat state/pipeline.json | jq '.MP'
```
Expected:
```json
{
  "addedAt": "YYYY-MM-DD",
  "company": "MP Materials Corp",
  "slug": "mpmaterialscorp",
  "stages": {
    "directory":    "YYYY-MM-DD",
    "webResearch":  "YYYY-MM-DD",
    "edgar":        "YYYY-MM-DD",
    "duckWeb":      "YYYY-MM-DD",
    "articleFetch": "YYYY-MM-DD",
    "grok":         "YYYY-MM-DD",
    "paperclip":    "SKIP"
  }
}
```

If Playwright is not installed, `articleFetch` will be `"N/A"` rather than a date — all other stages still complete normally.

For a LON ticker:
```
node scripts/pipeline-new-tickers.js --ticker=LON:BP
```
Expected:
- `edgar` stage skipped (N/A), not queued
- All other stages run normally

---

## 10. pipeline-new-tickers.js — refresh mode

**Purpose:** Verify refresh correctly identifies stale stages.

```
node scripts/pipeline-new-tickers.js --refresh --dry-run
```

Expected:
- Tickers where `webResearch` date is > 30 days ago show `webResearch` as pending
- Tickers where `edgar` date is > 90 days ago show `edgar` as pending
- Recently processed tickers (today) show nothing pending

```
node scripts/pipeline-new-tickers.js --refresh --stage=web --dry-run
```

Expected:
- Only `webResearch` stage shown as pending, even if other stages are also stale

---

## 11. pre-commit-check.js

**Purpose:** Verify updated file checks pass and fail correctly.

```
node scripts/pre-commit-check.js MP
```

Expected (after full pipeline run):
- `[PASS] MP` if all files present and valid
- Checks confirmed: `brave-web-*.json` present, `duck-web-*.json` present, `grok-*.json` present

To test failure detection — rename the brave-web file temporarily:
```
mv research/mpmaterialscorp/brave-web-$(date +%Y-%m-%d).json research/mpmaterialscorp/brave-web-$(date +%Y-%m-%d).json.bak
node scripts/pre-commit-check.js MP
# expect [FAIL] MP [no_brave_web]
mv research/mpmaterialscorp/brave-web-$(date +%Y-%m-%d).json.bak research/mpmaterialscorp/brave-web-$(date +%Y-%m-%d).json
```

---

## 12. Regression — old web-*.json files

If any `research/{slug}/web-YYYY-MM-DD.json` files exist from before the rename:
- They should NOT be picked up by bootstrap-pipeline.js (detection now requires `brave-web-*`)
- Re-running `bootstrap-pipeline.js` will show those tickers as `webResearch: null`
- Fix: manually rename them or re-run `batch-web-research.js --ticker=TICKER` to generate the correctly named file

Check for any old-format files:
```
find research/ -name "web-*.json" | grep -v "brave-web\|duck-web"
```

---

## Summary checklist

| # | Test | Pass condition |
|---|------|----------------|
| 1 | sync-sheet.js | sheet-latest.json written, all fields present |
| 2 | bootstrap-pipeline.js | pipeline.json seeded, non-US = N/A, idempotent |
| 3 | pipeline dry run | EDGAR excluded for non-US, 6 stages shown |
| 4 | batch-web-research.js | brave-web-*.json written, no web-*.json |
| 5 | batch-edgar-filings.js | reads snapshot, three-layer output (.md + sections + xbrl.json + archive/) |
| 5a | convert-edgar-filings.js | migrates existing .html to .md, archives originals, idempotent |
| 6 | batch-duck-research.js | duck-web-*.json written, cache works |
| 6a | batch-playwright-fetch.js | playwright-*.json written, articles array populated, paywalls filtered |
| 7 | batch-grok-sentiment.js | grok-*.json with score/signal/keyThemes, uses playwright articles as context |
| 8 | batch-paperclip-research.js | paperclip-*.json written, empty result graceful |
| 9 | Full pipeline single ticker | all stages complete, pipeline.json correct |
| 10 | Refresh mode | stale stages identified, recent ones skipped |
| 11 | pre-commit-check.js | PASS with all files, FAIL with missing file |
| 12 | Regression — old web-*.json | not detected by bootstrap, manual rename required |
