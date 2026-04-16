#!/bin/bash
# DYOR HQ — post-deploy validation test
# Usage: ./test.sh [ticker]
# If no ticker given, runs full site health check

set -e

SITE="${SITE:-https://dyorhq.ai}"
CHECK_TICKER="${1:-}"

echo "=== DYOR HQ Post-Deploy Test ==="
echo "Site: $SITE"
echo ""

# 1. Homepage
echo "[1/5] Homepage..."
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SITE/")
if [ "$CODE" = "200" ]; then
    echo "  OK — $CODE"
else
    echo "  FAIL — $CODE"
    exit 1
fi

# 2. Reports index
echo "[2/5] Reports index..."
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SITE/reports/index.json")
if [ "$CODE" = "200" ]; then
    COUNT=$(curl -s "$SITE/reports/index.json" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d))" 2>/dev/null || echo "0")
    echo "  OK — $COUNT reports indexed"
else
    echo "  FAIL — $CODE"
    exit 1
fi

# 3. Specific ticker check
echo "[3/5] Ticker check..."
if [ -n "$CHECK_TICKER" ]; then
    T="${CHECK_TICKER,,}"
    CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SITE/reports/${T}.html")
    if [ "$CODE" = "200" ]; then
        echo "  $T.html — OK ($CODE)"
    else
        echo "  $t.html — FAIL ($CODE)"
        exit 1
    fi
else
    for TICK in avct.l pxen.l lpeth lond:avct; do
        CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SITE/reports/${TICK}.html")
        echo "  ${TICK}.html — $CODE"
    done
fi

# 4. Random integrity check
echo "[4/5] Integrity check..."
RANDOMS=("nvda" "msft" "cop" "palm.l" "pxen.l")
T="${RANDOMS[$((RANDOM % ${#RANDOMS[@]}))]}"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SITE/reports/${T}.html")
echo "  $T.html — $CODE"

# 5. CSS/static assets
echo "[5/5] Static assets..."
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SITE/styles.css")
echo "  styles.css — $CODE"

echo ""
echo "=== PASS ==="