# DYOR HQ Auto-Pipeline Run — 2026-04-23

**Outcome: BLOCKED — same constraint as 2026-04-22**

---

## Why it didn't run

The `gws` (Google Workspace CLI) binary is not available in the Cowork sandbox. It is installed only on your Mac and authenticates via OAuth2 tokens in `~/.config/gws/`. `computer-use` Terminal access timed out — no user was present to approve it.

This is the same blocker documented in `auto-pipeline-2026-04-22.md`. Nothing has changed in the environment to resolve it.

---

## State as of this run (2026-04-23)

| Metric | Value |
|---|---|
| Last successful `detect-new-tickers.js` run | 2026-04-18T08:29Z |
| Unmatched at that run | 0 |
| Most recent cached sheet snapshot | 2026-04-22T13:58Z (372 tickers) |
| Current `reports/index.json` entries | 336 |
| Approx. unmatched tickers (from Apr 22 cache) | ~32–46 (see Apr 22 log for full list) |

---

## Action required

Run the pipeline manually from your Mac Terminal:

```bash
bash /Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4/scripts/run-auto-pipeline.sh
```

Then universe assignment:

```bash
cd /Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4 && node scripts/assign-universes.js && npm run build && git add -A && git commit -m "fix: assign universes for new reports $(date +%Y-%m-%d)" && git push origin dyor-v4-work
```

The full list of tickers requiring reports is in `auto-pipeline-2026-04-22.md`.

---

## Fix for future automated runs

To make this task work without a user present, the cleanest solution is to replace the `gws` call in `detect-new-tickers.js` with a direct Google Sheets API call using a service account key stored in `.openclaw` — accessible from the sandbox. See `auto-pipeline-2026-04-22.md` for options.
