#!/bin/bash
# DYOR HQ — clean deploy script
# Usage: ./deploy.sh ["optional commit message"]
set -e
cd "$(dirname "$0")/.."

echo "=== DYOR HQ Deploy ==="

# 1. Validate site structure
echo "[1/5] Validating site..."
REPORT_COUNT=$(ls reports/*.html 2>/dev/null | wc -l | tr -d ' ')
if [ "$REPORT_COUNT" -lt 300 ]; then
    echo "ERROR: Only $REPORT_COUNT reports found — expected 300+. Aborting."
    exit 1
fi
echo "  Reports: $REPORT_COUNT (OK)"

python3 -c "import json; json.load(open('reports/index.json'))" 2>/dev/null && echo "  index.json: valid (OK)" || { echo "ERROR: index.json is invalid JSON. Aborting."; exit 1; }

for f in index.html reports/index.json; do
    [ -f "$f" ] || { echo "ERROR: Missing $f. Aborting."; exit 1; }
done
echo "  Essential files: OK"

# 2. Commit
COMMIT_MSG="${1:-Deploy $(date '+%Y-%m-%d %H:%M')}"
echo "[2/5] Committing..."
git add -A
git commit -m "$COMMIT_MSG" 2>/dev/null && echo "  Committed" || echo "  Nothing to commit"

# 3. Push dyor-v3-work
echo "[3/5] Pushing dyor-v3-work..."
git push origin dyor-v3-work 2>&1

# 4. Sync to main (public site deploy)
echo "[4/5] Syncing to main..."
git push origin dyor-v3-work:main 2>&1

# 5. Done
echo "[5/5] Done. Netlify will deploy automatically in ~30s."
echo "Live: https://dyorhq.ai"