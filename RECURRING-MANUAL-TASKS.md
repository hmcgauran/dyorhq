# DYOR HQ — Recurring Manual Tasks Awaiting Automation

> Compiled: 17 April 2026 | From session history analysis

These are tasks that Hugh repeatedly asks George to perform manually because they have not yet been automated into the build pipeline, cron jobs, or workflow triggers.

---

## 1. Run `npm run build` After Adding Reports

**What happens:** A new report HTML is written and added to `reports/index.json`. Hugh asks George to run the build.

**What should happen:** Adding a report to the index and committing to `dyor-v3-work` should automatically trigger a build via a GitHub Actions workflow or a post-commit hook.

**Current manual step:**
```bash
cd projects/dyorhq && npm run build
```

**Automation gap:** The build is not Git-triggered on the development branch. It requires manual invocation.

---

## 2. Push to GitHub and Verify Netlify Deploy

**What happens:** After a build succeeds, Hugh asks George to push to GitHub and confirm the deploy happened.

**What should happen:** A successful build should automatically push to `origin/dyor-v3-work` and Netlify should deploy without requiring a manual push confirmation.

**Current manual steps:**
```bash
git add -A && git commit -m "Description"
git push origin dyor-v3-work
# Then manually confirm Netlify picked it up
```

**Automation gap:** Commit and push are manual. Netlify auto-deploy is set up but the commit/push step itself is not automated.

---

## 3. Ticker Audit — New vs Existing

**What happens:** Hugh asks "which tickers in the Google Sheet don't have reports yet?" and George runs a manual Python/Node script to cross-check against `reports/index.json`.

**What should happen:** A cron job runs daily, compares the Google Sheet against the canonical index, and produces a list of genuinely new tickers with market cap sorting. Hugh receives a digest or asks on demand and gets a fresh result without manual script running.

**Current manual step:** Running a Python script or Node one-liner that calls `loadGoogleFinanceSheet()` and compares against `reports/index.json`.

**Automation gap:** No scheduled ticker audit. No digest output. Human must invoke the check every time.

---

## 4. Write New Reports (Full Process)

**What happens:** Hugh says "write reports for these 4 tickers" and George: fetches live data from Google Sheet, runs web searches for financial results, attempts Grok sentiment, writes HTML, adds to index, builds, commits, and pushes.

**What should happen:** Given a list of tickers, an automated report generation pipeline fetches all required data, generates the HTML from a template, validates the output, and queues it for build — all without human draft writing.

**Current manual steps:**
1. Fetch live quote data (price, mktcap, P/E, EPS, 52w range, volume)
2. Web search for financial results/news
3. Grok sentiment (with retry on failure)
4. Draft HTML (MiniMax or template-based)
5. Save HTML to `reports/{slug}.html`
6. Add entry to `reports/index.json`
7. Run build
8. Commit and push

**Automation gap:** Steps 1-4 require a human or agent to orchestrate. Template-based generation could cover steps 4-6 with a structured prompt to MiniMax, but the orchestration layer doesn't exist.

---

## 5. Verify Live Site vs Local Canonical

**What happens:** Hugh asks "are the reports actually showing on the site?" and George runs `curl` against dyorhq.ai to check `reports-index.json`, compares entry counts, and diagnoses discrepancies.

**What should happen:** A status endpoint or monitoring check runs after every deploy and flags if the live site count doesn't match the expected count.

**Current manual step:**
```bash
curl -s https://dyorhq.ai/reports-index.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d))"
```

**Automation gap:** No post-deploy verification. Discrepancies are discovered when Hugh asks, not proactively.

---

## 6. Check Netlify Deploy Status

**What happens:** After pushing, Hugh asks "did it deploy?" and George has no tool to query Netlify API directly (token not set in this environment), so must rely on checking the live site.

**What should happen:** The deploy status should be surfaced automatically — either via a webhook callback to OpenClaw, a cron check, or a log output after the push.

**Current manual step:** Curl the live site or ask Hugh to check manually.

**Automation gap:** Netlify API token not configured in the execution environment. No webhook notification to OpenClaw on deploy complete.

---

## 7. Stale Report Detection

**What happens:** Hugh has to ask whether any existing reports need updating (e.g., after AVCT AACR data, after earnings releases). George has no proactive monitoring of whether the data in existing reports is still current.

**What should happen:** On every Google Sheet data pull, compare current price, P/E, and market cap against the values stored in the last index entry for each ticker. Flag entries where the delta exceeds a threshold (price >15%, P/E >20pts, market cap >20%).

**Current manual step:** Hugh asks "does any report need updating?" and George manually reviews.

**Automation gap:** No stale-report detector. No threshold alerting. No scheduled review.

---

## 8. AVCT AACR Monitoring

**What happens:** Hugh asks to monitor the AACR conference (17-22 April 2026) for AVCT data readouts. George has no active watcher — Hugh must ask each time for a status check.

**What should happen:** An RNS watcher or scheduled check runs during the conference window and alerts Hugh when AVCT presents, without Hugh having to ask.

**Current manual step:** Hugh asks on demand.

**Automation gap:** No RNS watcher for AVCT specifically during the AACR window. No automated alert on conference presentation.

---

## 9. Check for New RNS Announcements

**What happens:** Hugh asks "any RNS I should know about?" and George runs a check across the watchlist. This is not automated — requires Hugh to ask.

**What should happen:** A daily (or more frequent) RNS digest for all watchlist tickers. Already partially addressed via `rns-watcher.js` but the output doesn't automatically reach Hugh — it queues to `state/pending-telegram-alerts.jsonl` which requires a separate drain process.

**Automation gap:** RNS watcher runs but alerts require separate drain job. The integration between watcher output and Hugh's inbox is a two-step process that needs human triggering or a reliably scheduled drain.

---

## 10. Update MEMORY.md and Daily Memory Files

**What happens:** After significant sessions, Hugh doesn't explicitly ask but George updates MEMORY.md with new context (model changes, setup confirmations, key decisions). The daily `memory/YYYY-MM-DD.md` is written but not consistently.

**What should happen:** Significant events (new reports, deploys, architecture decisions, quality issues) should be captured automatically in the daily log with minimal friction.

**Current manual step:** George writes to memory files at end of session or on explicit request.

**Automation gap:** No automatic capture of session events. Dependent on George remembering to update memory at the end of each session.

---

## Summary Table

| # | Task | Current Trigger | Ideal Trigger |
|---|------|----------------|---------------|
| 1 | Run build | Hugh asks | Git commit hook / GitHub Actions |
| 2 | Push and verify deploy | Hugh asks | Automated post-build |
| 3 | Ticker audit (new vs existing) | Hugh asks | Daily cron, output to digest |
| 4 | Write new reports | Hugh asks | Given tickers → automated pipeline |
| 5 | Verify live site vs canonical | Hugh asks | Post-deploy health check |
| 6 | Check Netlify deploy status | Hugh asks | Webhook callback to OpenClaw |
| 7 | Stale report detection | Hugh asks | Daily data comparison vs index |
| 8 | AVCT AACR monitoring | Hugh asks | Event-triggered RNS + schedule |
| 9 | RNS digest | Hugh asks | Daily scheduled digest |
| 10 | Update memory files | George initiates | Auto-capture from session events |

---

## Suggested Automation Priority

| Priority | Task | Likely Solution |
|----------|------|----------------|
| 1 | Run build on commit | GitHub Actions on `dyor-v3-work` push |
| 2 | Ticker audit digest | Weekly cron job → Telegram message |
| 3 | Post-deploy health check | GitHub Actions step after deploy |
| 4 | Stale report detector | Scheduled comparison script |
| 5 | Grok retry logic | Update `grok-sentiment.js` |
| 6 | Memory auto-capture | `sessions_yield` event hook |
| 7 | RNS digest | Enhanced `rns-watcher.js` with daily output |