# Script Audit & Pipeline Reconciliation

**Audited:** 2026-04-21  
**Project:** `/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4/`  
**Scope:** All scripts in `scripts/` and key pipeline documentation

---

## Part 1 — Script Inventory

### Core Pipeline Scripts (data gathering → report generation → publish)

| File | Role | Inputs | Outputs | Side Effects | Dependencies |
|------|------|--------|---------|--------------|--------------|
| `sync-sheet.js` | Download Google Sheet snapshot | `gws` CLI, `.env` | `state/sheet-{ts}.json`, `state/sheet-latest.json` | Writes timestamped archive + latest; overwrites `sheet-latest.json` | Google Sheets API, `gws` CLI |
| `bootstrap-pipeline.js` | Seed `state/pipeline.json` from existing `research/` dirs | `state/sheet-latest.json`, `research/{slug}/` dirs | `state/pipeline.json` (created/updated) | Safe: only fills missing entries, never overwrites | filesystem only |
| `pipeline-new-tickers.js` | Orchestrate 6 research stages per ticker | `state/sheet-latest.json`, `state/pipeline.json` | `research/{slug}/brave-web-{date}.json`, `duck-web-{date}.json`, `grok-{date}.json`, `8-K-{date}.html`, `paperclip-{date}.json`; updates `state/pipeline.json` | Creates `research/{slug}/` dirs; spawns child processes; checkpointing via `pipeline.json` | Node child_process, `batch-web-research.js`, `batch-edgar-filings.js`, `batch-duck-research.js`, `batch-grok-sentiment.js` (MISSING), `batch-paperclip-research.js` (MISSING) |
| `batch-web-research.js` | Brave Search web research per ticker | `state/sheet-latest.json` (✓ already reading it) | `research/{slug}/brave-web-{date}.json` | Logs to `state/web-research-log.jsonl`; checkpoint at `state/web-research-checkpoint.json` | Brave API (`BRAVE_API_KEY`), dotenv |
| `batch-edgar-filings.js` | Fetch SEC EDGAR filings per US ticker | `state/sheet-latest.json` (✓ already reading it) | `research/{slug}/8-K-{date}.html`, `10-Q-{date}.html`, `10-K-{date}.html` | Logs to `state/edgar-filings-log.jsonl`; checkpoint at `state/edgar-filings-checkpoint.json` | SEC EDGAR API, rate-limited 1 req/sec |
| `batch-duck-research.js` | DuckDuckGo supplementary web research per ticker | `state/sheet-latest.json` | `research/{slug}/duck-web-{date}.json` | Logs to `state/duck-research-log.jsonl` | DuckDuckGo API |
| **MISSING `batch-grok-sentiment.js`** | Batch Grok sentiment — called by `pipeline-new-tickers.js` stage 5 | — | — | — | — |
| **MISSING `batch-paperclip-research.js`** | Batch Paperclip biotech research — called by `pipeline-new-tickers.js` stage 6 | — | — | — | — |
| `generate-report.js` | **Standalone per-ticker report generation** (makes own API calls) | Google Sheets API (direct), xAI Grok (inline), filesystem | `reports/data/{TICKER}.json`, `reports/{slug}.html`, `reports/index.json` updated | `npm run build` after each ticker; writes `state/review-queue.jsonl` | `cron-scripts/lib/research-slug.js`, Google Sheets API, xAI Grok, dotenv |
| `pre-commit-check.js` | Pre-push quality gate | `reports/`, `research/{slug}/`, `reports/index.json` | Exits non-zero on failure | Fetches live sheet price per ticker; checks all today-dated reports | Google Sheets API (live fetch) |
| `deploy.sh` | Clean deploy from local machine | — | — | `npm run build`; validates report count ≥300; stages git; pushes to GitHub | `npm`, `git`, Python3 |
| `test.sh` | Post-deploy health check | SITE URL env var | HTTP status codes to stdout | `curl` health checks on site | `curl`, Python3 |
| `run-auto-pipeline.sh` | **Alternative automation** (different pipeline) | — | — | Runs `detect-new-tickers.js`, `process-new-tickers.js`, `pre-commit-check.js`, `npm run build`, `git push` | `node`, `git`, `npm` |

### Supporting / Utility Scripts

| File | Role | Notes |
|------|------|-------|
| `detect-new-tickers.js` | Find tickers in Google Sheet absent from `reports/index.json` | Writes `state/new-tickers.json`; uses three-tier resolver |
| `process-new-tickers.js` | Run `generate-report.js` for each ticker in `state/new-tickers.json` | Called by `run-auto-pipeline.sh`; graceful skip if report exists |
| `isin-populate-working.js` | Backfill missing ISINs in Google Sheet | Writes to `/tmp/isin-populate.js`-referenced path (not project); dry-run then `gws update` |
| `grok-sentiment.js` | xAI Grok API wrapper module (not a batch script) | `init()`, `sentiment(ticker)`, `sentimentBatch(tickers)`; retry with exponential backoff; writes failures to `state/sentiment-failures.jsonl` |
| `grok-rescore-all.js` | Re-run Grok sentiment for all existing tickers | Batch utility; uses `grok-sentiment.js` |
| `fetch-short-interest.js` | Fetch short interest data | Writes to `research/{slug}/short-interest-{date}.json` |
| `fetch-annual-reports.js` | Fetch annual report PDFs | Checkpoint at `state/annual-reports-checkpoint.json` |
| `batch-13f-filings.js` | Fetch 13F institutional holdings filings | Checkpoint at `state/edgar-13f-checkpoint.json` |
| `batch-refresh-all.js` | Refresh all research data for all tickers | High-level orchestrator |
| `recalc-conviction.js` | Recalculate conviction scores | Reads/writes `reports/data/{TICKER}.json` |
| `build-site.js` | Full site build | Reads `reports/index.json`; builds `public/`; runs validation |
| `site-manifest.js` | Validation, path resolution, index builders | Called by `build-site.js` |
| `enrich-ir-urls.js` | Enrich index entries with investor relations URLs | — |
| `rns-backfill.js`, `rns-backfill-json.js`, `store-rns-json.js` | RNS regulatory news backfill | — |
| `review-daemon.js` | Cron daemon for review queue | — |

---

## Part 2 — Two Distinct Pipelines

The project has **two completely separate automation pipelines** that should not be conflated:

### Pipeline A — `run-auto-pipeline.sh` (Bash, simpler)
```
detect-new-tickers.js  →  process-new-tickers.js  →  pre-commit-check.js  →  npm run build  →  git push
```
- **Detect** reads Google Sheet Column A directly, matches against `reports/index.json`, writes `state/new-tickers.json`
- **Process** runs `generate-report.js` per new ticker (each generate-report does its own API calls)
- **Pre-commit** validates today's reports
- **Build** produces `public/`

**Key insight:** `generate-report.js` is a fully self-contained report generator — it calls Google Sheets directly, calls Grok inline, does web searches inline. It is NOT fed by `pipeline-new-tickers.js` output. Reports generated via Pipeline A have all research done inside `generate-report.js`.

### Pipeline B — `pipeline-new-tickers.js` (Node, research-stage-orchestrated)
```
sync-sheet.js  →  bootstrap-pipeline.js  →  pipeline-new-tickers.js  →  generate-report.js  →  publish.js
```
- **Sync** downloads sheet snapshot
- **Bootstrap** seeds `state/pipeline.json` from existing `research/` dirs
- **Pipeline** orchestrates 6 research stages (Brave, EDGAR, Duck, Grok, Paperclip) writing files to `research/`
- **Generate** reads from `research/` only (stateless, no API calls)
- **Publish** (described in pipeline.md but file does not exist — see Gap #1)

**Key insight:** These two pipelines share the same output directory (`research/`, `reports/`) and same index (`reports/index.json`) but are otherwise independent. A ticker processed by Pipeline A will show as having done research in Pipeline B's state because `pipeline.json` won't know about it.

---

## Part 3 — Gaps, Mismatches & Stale Assumptions

### Gap 1 — `publish.js` does not exist (Critical)
**pipeline.md** steps 15–17 describe `publish.js` as the site-wide post-generation step (pre-commit check, final build, commit, push). **No such file exists.** The pre-commit check functionality lives in `pre-commit-check.js`, the build is `npm run build`/`build-site.js`, and commit/push is done manually or by `deploy.sh`/`run-auto-pipeline.sh`.

**Impact:** pipeline.md step 17 cannot be executed as documented. The commit/push step is only in the Bash wrapper scripts.

**Recommendation:** Document the actual publish step as: `pre-commit-check.js → npm run build → git add/commit/push` or create a thin `publish.js` wrapper.

---

### Gap 2 — `batch-grok-sentiment.js` does not exist (Critical)
`pipeline-new-tickers.js` line 113 calls:
```js
`node ${path.join(__dirname, 'batch-grok-sentiment.js')} --ticker=${ticker}`
```
This file does not exist in `scripts/`. The actual Grok module is `grok-sentiment.js` (a Node module, not a CLI script). The pipeline will fail at the Grok stage with a "file not found" exec error.

**Recommendation:** Create `batch-grok-sentiment.js` as a thin wrapper that calls `grok-sentiment.js` per ticker. See also Rec. C.

---

### Gap 3 — `batch-paperclip-research.js` does not exist (Critical)
`pipeline-new-tickers.js` calls this script for stage 6 (biotech/pharma only). The file does not exist. No Paperclip research runs via the pipeline.

**Recommendation:** Either create the script or wire `paperclip` stage to skip until implemented.

---

### Gap 4 — `deploy.sh` pushes to wrong branch (Stale config)
`deploy.sh` line 38–39 pushes to `dyor-v3-work` and `dyor-v3-work:main`. The active project branch is `dyor-v4-work` (confirmed in `run-auto-pipeline.sh` line 49 and ARCHITECTURE.md section 6). Any deploy via `deploy.sh` will push to the wrong branch — Netlify will not rebuild.

**Recommendation:** Update `deploy.sh` to push to `dyor-v4-work`.

---

### Gap 5 — `generate-report.js` is not a pipeline consumer (Structural mismatch)
`pipeline.md` describes steps 10–14 as `generate-report.js` reading cached data from `research/{slug}/`. In reality, `generate-report.js` is a **standalone self-contained script** — it makes its own Google Sheets API calls directly, calls Grok inline, and generates its own web research. It does NOT read from the research files produced by `pipeline-new-tickers.js`.

**pipeline.md assumption:** Steps 5–9 produce files; step 10 reads them.  
**Reality:** Steps 5–9 and step 10 are separate pipelines that should not be mixed.

The `generate-report.js` approach is valid as a "one-shot" for new tickers (Pipeline A style). But it cannot be fed the output of `pipeline-new-tickers.js` — the file format expectations and data shapes may not align.

**Recommendation:** Clarify in pipeline.md that there are two modes: (1) one-shot standalone mode (`generate-report.js` alone) and (2) staged pipeline mode (`pipeline-new-tickers.js` + `generate-report.js` reading cached data).

---

### Gap 6 — `detect-new-tickers.js` makes its own Google Sheets API call (Bypasses sync)
`detect-new-tickers.js` line 79 calls `gws sheets spreadsheets get` directly to read Column A — not reading from `state/sheet-latest.json`. This means two independent Google Sheets API calls per session (one for sync, one for detect), defeating the purpose of the single-download snapshot.

**pipeline.md step 3 note** flags this exact issue for `batch-web-research.js` and `batch-edgar-filings.js`, but `detect-new-tickers.js` is not mentioned.

**Recommendation:** Update `detect-new-tickers.js` to read from `state/sheet-latest.json`.

---

### Gap 7 — `process-new-tickers.js` does not update `pipeline.json`
`process-new-tickers.js` runs `generate-report.js` for new tickers but never touches `state/pipeline.json`. This means tickers processed via Pipeline A show as incomplete in `pipeline.json`, and `pipeline-new-tickers.js` will re-run research stages for them on next run.

**Recommendation:** Either update `pipeline.json` after successful `generate-report.js` completion, or use `pipeline.json` as the authoritative "has report" check rather than `reports/index.json`.

---

### Gap 8 — `batch-edgar-filings.js` uses different checkpoint structure
`batch-edgar-filings.js` uses checkpoint format `{ done: {}, last: null }` (object with ticker keys) while `batch-web-research.js` uses `{ done: [], last: null }` (array). The `pipeline.json` approach (dates per stage per ticker) is cleaner and pipeline-wide — the batch scripts' checkpoints are stage-specific.

**Recommendation:** Deprecate individual batch checkpoints in favour of the `pipeline.json` dates written by `pipeline-new-tickers.js`.

---

### Gap 9 — `isin-populate-working.js` hard-codes `/tmp` paths
`isin-populate-working.js` line 26 writes fixes to `/tmp/isin-updates.csv`, commands to `/tmp/isin-gws-update-commands.txt`, logs to `/tmp/isin-populate-log.txt`. These are not in the project tree and are lost between sessions. pipeline.md references it as "the fixed version from the previous session was at `/private/tmp/isin-populate.js`" — a clear sign of path drift.

**Recommendation:** Update hard-coded paths to use project `state/` directory.

---

### Gap 10 — ARCHITECTURE.md is stale
`ARCHITECTURE.md` header states it is partially stale (correctly flags path `projects/dyorhq-v4/`, active branch `dyor-v4-work`, report count 324). Key stale items:
- Refers to `cron-scripts/lib/google-finance-sheet.js` for data loading — current scripts use `gws` CLI directly
- Describes Grok retry logic as non-existent ("no retry logic exists") — `grok-sentiment.js` now has exponential backoff
- Describes "Step 1 — Triage" as manual — Pipeline A automates this
- Recommendation tiers in ARCHITECTURE.md show "BUY (strong)" at 65-79, but `pre-commit-check.js` REC_TIERS shows BUY (STRONG) at min 80

---

### Gap 11 — `pre-commit-check.js` references `fmp-{date}.json` for US tickers (FMP legacy)
`pre-commit-check.js` checks for `fmp-{TODAY}.json` in the research directory for US tickers (line 166–172). The FMP free tier was discontinued August 2025. No `fmp-{date}.json` files exist in the research dirs. The check is informational only (logged as `fmpMissing` but does not cause FAIL), which is correct behavior.

---

## Part 4 — Outstanding Code Changes Table (pipeline.md vs Reality)

| # | File | Change described in pipeline.md | Status |
|---|------|-------------------------------|--------|
| 1 | `batch-web-research.js` | Read from `state/sheet-latest.json` | ✅ DONE — already reads from snapshot |
| 2 | `batch-edgar-filings.js` | Read from `state/sheet-latest.json` | ✅ DONE — already reads from snapshot |
| 3 | `batch-web-research.js` | Rename `web-{date}.json` → `brave-web-{date}.json` | ✅ DONE — already saves as `brave-web-{date}.json` |
| 4 | `bootstrap-pipeline.js` | Update detection regex to `brave-web-*.json`; add duck/grok/paperclip | ✅ DONE — already has all detections |
| 5 | `pipeline-new-tickers.js` | Add Duck, Grok, Paperclip stages | ⚠ PARTIAL — stages called but scripts missing |
| 6 | `pre-commit-check.js` | Update file checks for brave-web/duck/grok | ✅ DONE — already checks `brave-web-*.json` and `grok-*.json` |
| 7 | `pipeline.md` | Steps 15–17 describe `publish.js` | ❌ FILE DOES NOT EXIST |
| 8 | `deploy.sh` | Push to `dyor-v4-work` | ❌ STILL PUSHES TO `dyor-v3-work` |

---

## Part 5 — Recommendations Summary

### Must Fix (broken or missing functionality)
1. **Create `batch-grok-sentiment.js`** — thin wrapper around `grok-sentiment.js`, callable via `node batch-grok-sentiment.js --ticker=TICKER`
2. **Create `batch-paperclip-research.js`** — or explicitly stub the paperclip stage in `pipeline-new-tickers.js`
3. **Fix `deploy.sh` branch** — change `dyor-v3-work` → `dyor-v4-work` on both push lines
4. **Create `publish.js`** — or update pipeline.md to document the actual publish step (`pre-commit-check.js` + `npm run build` + `git push`)

### Should Fix (quality/data integrity)
5. **Update `detect-new-tickers.js`** to read from `state/sheet-latest.json`
6. **Wire `process-new-tickers.js`** to update `state/pipeline.json` after successful report generation
7. **Fix `isin-populate-working.js`** paths from `/tmp` to `state/`
8. **Update ARCHITECTURE.md** — fix stale recommendation tiers, Grok retry note, and the overall "Partially stale" header
9. **Update pipeline.md step 3 note** — add `detect-new-tickers.js` to the list of scripts that currently bypass `sheet-latest.json`

### Clarify (architectural)
10. **Document the two pipeline modes** explicitly in pipeline.md — (A) `run-auto-pipeline.sh` with standalone `generate-report.js`, and (B) `pipeline-new-tickers.js` staged research + `generate-report.js` as stateless consumer. These are currently conflated.
11. **Remove or fix the FMP check** in `pre-commit-check.js` — the comment says informational only, but if FMP data is never expected again, remove the check entirely to avoid confusion.
