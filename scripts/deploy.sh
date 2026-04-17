#!/bin/bash
# DYOR HQ — clean deploy script
# Usage: ./deploy.sh ["optional commit message"]
# Process: build locally → commit source → push to GitHub → Netlify auto-builds and deploys
set -e
cd "$(dirname "$0")/.."

echo "=== DYOR HQ Deploy ==="

# 1. Build locally (validate everything compiles)
echo "[1/5] Building site..."
npm run build 2>/dev/null || node scripts/build-site.js
echo "  Build complete (local validation)"

# 2. Validate public/ output
echo "[2/5] Validating build output..."
REPORT_COUNT=$(ls public/reports/*.html 2>/dev/null | wc -l | tr -d ' ')
if [ "$REPORT_COUNT" -lt 300 ]; then
    echo "ERROR: Only $REPORT_COUNT reports in public/. Aborting."
    exit 1
fi
echo "  Reports: $REPORT_COUNT (OK)"

python3 -c "import json; json.load(open('public/reports-index.json'))" 2>/dev/null && echo "  reports-index.json: valid (OK)" || { echo "ERROR: reports-index.json invalid. Aborting."; exit 1; }
echo "  Essential files: OK"

# 3. Stage source files (not public/ — that's gitignored, Netlify builds it)
echo "[3/5] Staging source..."
git add -A

# 4. Commit
COMMIT_MSG="${1:-Deploy $(date '+%Y-%m-%d %H:%M')}"
echo "[4/5] Committing: $COMMIT_MSG"
git commit -m "$COMMIT_MSG" 2>/dev/null && echo "  Committed" || echo "  Nothing to commit"

# 5. Push — Netlify auto-builds and deploys from GitHub
echo "[5/5] Pushing to GitHub..."
git push origin dyor-v3-work 2>&1
git push origin dyor-v3-work:main 2>&1

echo ""
echo "=== Done. Netlify auto-deploys in ~30-60s ==="