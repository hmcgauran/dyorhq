# DYOR recommendation badge fix

Completed on 2026-04-13.

## What changed
- Updated shared badge styling in `assets/css/main.css` and `public/assets/css/main.css`.
- Restored clearer, recommendation-specific badge treatments for BUY, HOLD, REDUCE, and SELL.
- Added alias support so existing class variants still render correctly, including `buy`, `hold`, `reduce`, `sell`, `rec-hold`, `rec-HOLD`, and equivalent BUY/REDUCE/SELL forms.
- Normalised the top badge class on template-based live reports so the visible recommendation badge uses the correct recommendation-specific class.
- Patched older live reports that lacked the shared `rec-badge` markup by adding a visible top badge with recommendation-specific inline badge classes.

## Verification
- Verified the full live HTML report set.
- Result: 213 live reports checked, 0 reports left using only a generic top badge fallback.
- Final recommendation distribution in the live set: BUY 20, HOLD 125, REDUCE 61, SELL 7.
