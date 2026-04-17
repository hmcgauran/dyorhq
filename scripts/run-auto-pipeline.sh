#!/bin/bash
# scripts/run-auto-pipeline.sh
#
# Local automation pipeline — runs on Hugh's machine with full API access.
# Detects new tickers in the Google Sheet, generates reports, commits and pushes.
# Netlify deploys automatically on the push. GitHub Actions runs health check.
#
# Usage: bash scripts/run-auto-pipeline.sh
# Schedule: via launchd or cron (see TOOLS.md for Hugh's local scheduler)

set -e

PROJ_ROOT="/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4"
cd "$PROJ_ROOT"

echo "=== DYOR HQ Auto-Pipeline ==="
echo "Starting at $(date)"

echo ""
echo "[1/4] Detecting new tickers..."
node scripts/detect-new-tickers.js

TICKER_COUNT=$(node -e "const s=require('./state/new-tickers.json'); console.log(s.unmatchedCount)")
echo "  -> $TICKER_COUNT new tickers found"

if [ "$TICKER_COUNT" = "0" ]; then
  echo "Nothing to do — exiting."
  exit 0
fi

echo ""
echo "[2/4] Processing new tickers..."
node scripts/process-new-tickers.js

echo ""
echo "[3/4] Running pre-commit checks..."
node scripts/pre-commit-check.js || { echo "Pre-commit checks failed — aborting push."; exit 1; }

echo ""
echo "[4/4] Building..."
npm run build || { echo "Build failed — aborting push."; exit 1; }

echo ""
echo "Committing and pushing..."
git add -A
if ! git diff --staged --quiet; then
  TIMESTAMP=$(date +%Y-%m-%d)
  git commit -m "auto: generate reports for new tickers $TIMESTAMP"
  git push origin dyor-v4-work
  echo "Pushed. Netlify will deploy automatically."
else
  echo "No changes to commit."
fi

echo ""
echo "=== Pipeline complete ==="