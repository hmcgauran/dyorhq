#!/bin/bash
# DYOR HQ — clean deploy script
# Usage: ./deploy.sh ["optional commit message"]
set -e
cd "$(dirname "$0")/.."

echo "=== DYOR HQ Deploy ==="

# 1. Build (generate public/ from reports/)
echo "[1/5] Building site..."
npm run build 2>/dev/null || node scripts/build-site.js
echo "  Build complete"

# 2. Validate public/ output
echo "[2/5] Validating build output..."
REPORT_COUNT=$(ls public/reports/*.html 2>/dev/null | wc -l | tr -d ' ')
if [ "$REPORT_COUNT" -lt 300 ]; then
    echo "ERROR: Only $REPORT_COUNT reports in public/. Build may have failed. Aborting."
    exit 1
fi
echo "  Reports in public/: $REPORT_COUNT (OK)"

python3 -c "import json; json.load(open('public/reports-index.json'))" 2>/dev/null && echo "  reports-index.json: valid (OK)" || { echo "ERROR: reports-index.json invalid. Aborting."; exit 1; }

for f in public/index.html public/reports-index.json; do
    [ -f "$f" ] || { echo "ERROR: Missing $f. Aborting."; exit 1; }
done
echo "  Essential files: OK"

# 3. Stage public/ changes
echo "[3/5] Staging public/..."
git add public/

# 4. Commit
COMMIT_MSG="${1:-Build $(date '+%Y-%m-%d %H:%M')}"
echo "[4/5] Committing: $COMMIT_MSG"
git commit -m "$COMMIT_MSG" 2>/dev/null && echo "  Committed" || echo "  Nothing to commit"

# 5. Push — Netlify auto-builds and deploys from GitHub
echo "[5/5] Pushing to GitHub (Netlify auto-deploys)..."
git push origin dyor-v3-work 2>&1
git push origin dyor-v3-work:main 2>&1

echo ""
echo "=== Done. Netlify auto-deploys in ~30-60s ==="
echo "Live: https://dyorhq.ai"