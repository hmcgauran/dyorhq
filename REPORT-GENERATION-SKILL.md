# REPORT-GENERATION-SKILL.md
## DYOR HQ — Report Generation Reference

Complete reference for generating a DYOR HQ investment report. Fully self-contained.

---

## 1. Pipeline Sequence (in order)

For a given ticker:

1. **Google Sheet quote** — `gws sheets spreadsheets values get` on `1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM`. Fetch columns: ticker, company, exchange, currency, price, marketCap, P/E, EPS. For US tickers, this is the fallback if FMP fails.

2. **FMP API** (US tickers only) — Call `/stable/` endpoints:
   - `GET https://financialmodelingprep.com/stable/quote?symbol={TICKER}&apikey={FMP_API_KEY}` → price, marketCap, yearHigh, yearLow
   - `GET https://financialmodelingprep.com/stable/profile?symbol={TICKER}&apikey={FMP_API_KEY}` → companyName, sector, industry, currency, exchange
   - `GET https://financialmodelingprep.com/stable/income-statement?symbol={TICKER}&period=quarter&limit=4&apikey={FMP_API_KEY}` → quarterly revenue, grossProfit, epsDiluted
   - Compute TTM EPS = sum of last 4 quarters' epsDiluted
   - Compute TTM revenue = sum of last 4 quarters' revenue
   - Compute grossMargin = TTM_grossProfit / TTM_revenue
   - Compute PE = price / ttmEpsDiluted
   - Compute sharesOutstanding = marketCap / price
   - Persist to `research/{company-slug}/fmp-{YYYY-MM-DD}.json`
   - Non-US tickers: skip FMP, use sheet data only

3. **Grok sentiment** — `POST https://api.x.ai/v1/chat/completions` with system prompt:
   ```
   You are a sell-side equity research analyst. Analyse {TICKER} ({COMPANY NAME}) from a short-term and long-term investment perspective.
   Consider: recent news, earnings, guidance, sector trends, technicals, macro.
   Respond with a JSON object with exactly these fields:
   {
     "score": 0-100,
     "signal": "positive" | "neutral" | "negative",
     "key_themes": ["theme1", "theme2", ...],
     "bull_case": "string",
     "bear_case": "string",
     "summary": "string 2-3 sentences",
     "sources": "string describing sources used"
   }
   ```
   - Persist raw response to `research/{company-slug}/grok-{YYYY-MM-DD}.json`
   - Score 0-100: 80+ = very bullish, 50-79 = cautiously positive, 30-49 = mixed/uncertain, <30 = negative
   - Grok score is an INPUT to conviction scoring, not the OUTPUT conviction score

4. **Web research** — 4 targeted Brave Search queries:
   - `{TICKER} {COMPANY NAME} earnings Q1 2026`
   - `{TICKER} {COMPANY NAME} news April 2026`
   - `{TICKER} {COMPANY NAME} stock analysis`
   - `{TICKER} {COMPANY NAME} guidance 2026`
   - Persist best result to `research/{company-slug}/web-{YYYY-MM-DD}.json`

5. **Paperclip** (biotech/pharma tickers only) — Triggered when:
   - Sector contains: "biotech", "biopharmaceutical", "pharmaceutical", "life sciences", "oncology", "therapeutics", "genomics", "medicine"
   - Or ticker in: AVCT, RGTI, CRIS, ASC, BCT, ZYME, OCX, INmune, Novocure, Evotec, BioNTech, Moderna
   - Reads `armis-integration-field-index.md` and searches ChatGPT archive for relevant context
   - Persists to `research/{company-slug}/paperclip-{YYYY-MM-DD}.json`

6. **Scenario framework** — Three scenarios with probability weights:
   | Scenario | Probability | Score | Contribution |
   |----------|-------------|-------|--------------|
   | Bull     | 20-30%      | 70-100 | Bull × weight |
   | Base     | 50-60%      | 40-69  | Base × weight |
   | Bear     | 15-30%      | 10-39  | Bear × weight |
   | **Conviction** |         |         | **Σ(Scenario×Prob)** |

   **Grok score guides but does not dictate scoring:**
   - Grok 80+ → Bull scenario score 80-100; Base 60-79; Bear 30-49
   - Grok 50-79 → Bull scenario score 70-85; Base 50-69; Bear 20-39
   - Grok 30-49 → Bull scenario score 60-75; Base 40-59; Bear 15-29
   - Grok <30 → Bull scenario score 40-60; Base 25-39; Bear 5-19

7. **Recommendation tier** (from final conviction score):
   | Score  | Recommendation |
   |--------|----------------|
   | 80+    | BUY (STRONG)   |
   | 65-79  | BUY            |
   | 50-64  | OPPORTUNISTIC BUY |
   | 30-49  | SPECULATIVE BUY |
   | <30    | AVOID          |

8. **HTML generation** — 11 required sections (see Section 2 below)

9. **Index update** — Append entry to `reports/index.json`:
   ```json
   {
     "ticker": "CSCO",
     "company": "Cisco Systems Inc",
     "exchange": "NASDAQ",
     "file": "ciscosystemsinc.html",
     "date": "2026-04-17",
     "recommendation": "OPPORTUNISTIC BUY",
     "conviction": 58,
     "currency": "USD",
     "price": 86.11,
     "marketCap": null,
     "summary": "One-line thesis...",
     "universes": ["watchlist"]
   }
   ```

10. **Build** — `npm run build` in project root

---

## 2. Required HTML Sections (in order)

All sections use `<h2>` headings. Prices formatted as `$86.11` or `GBP 71.90`. Market cap as `$340B` or `GBP 1.2B`. P/E as `31.1x`. No trailing decimal noise.

### Section 1: Report Header
```html
<div class="report-header">
  <div class="report-meta">
    <div class="report-ticker">CSCO</div>
    <div class="report-company">Cisco Systems Inc</div>
    <div class="report-price">USD86.11</div>
  </div>
  <div class="report-badge rec-opportunisticbuy">OPPORTUNISTIC BUY</div>
</div>
```
Badge class: `rec-buy`, `rec-opportunisticbuy`, `rec-speculativebuy`, `rec-avoid`.

### Section 2: Executive Summary
One to three paragraphs. Investment thesis in one sentence. Key risks in one sentence. Conviction score and recommendation prominently stated. No placeholder text.

### Section 3: Business Model
Revenue breakdown. Who uses the product. How money is made. 2-4 paragraphs.

### Section 4: Financial Snapshot
Unordered list. Fields: Price, P/E, Market Cap, EPS (TTM), 52-Week High, 52-Week Low, Revenue (TTM), grossMargin. Use sheet data as primary, FMP as supplement.

### Section 5: Recent Catalysts
驱动 by Grok key themes. List 3-6 specific recent events with dates where known. For AVCT: note AACR conference (17-22 April 2026) and check abstracts directly at AACR website.

### Section 6: Thesis Evaluation
**Not a raw markdown table.** Prose scenario cards:

**Bull Case** (25-30% probability): 3-5 paragraphs explaining the bull thesis. Specific price targets and timeline.

**Base Case** (50-60% probability): 3-5 paragraphs. What has to go right for this to play out.

**Bear Case** (15-30% probability): 3-5 paragraphs. Key risks that could derail the thesis.

Conviction score table at end of section:
| Scenario | Probability | Score | Contribution |
|----------|-------------|-------|--------------|
| Bull | 25% | 75 | 19 |
| Base | 55% | 55 | 30 |
| Bear | 20% | 25 | 5 |
| **Conviction Score** | | | **54/100** |

### Section 7: Key Risks
Ranked list of 3-6 specific risks. Each risk: one sentence description, estimated probability, potential impact. Do not repeat thesis evaluation risks verbatim.

### Section 8: Conviction Trend
```html
<div class="conviction-graph" id="cg-ciscosystemsinc"></div>
```
Single SVG injected by build pipeline. Do not write SVG manually.

### Section 9: Sector / Thematic Context
For biotech: Paperclip data. For tech: competitive landscape. For energy: macro/oil price context. 2-4 paragraphs.

### Section 10: Who Should Own It / Avoid It
Two subsections: **Ideal for:** and **Avoid if:**. Specific investor profiles. Be direct.

### Section 11: Entry / Exit Framework
| | Entry | Target | Stop Loss |
|--|-------|--------|----------|
| Near-term | $80 | $110 | $70 |
| Long-term | $75 | $140 | $65 |

At least two rows (near-term and long-term). Specific numbers from thesis.

---

## 3. Conviction Scoring Framework

**Formula:**
```
Conviction = (BullProb × BullScore) + (BaseProb × BaseScore) + (BearProb × BearScore)
```

**Grok score is an INPUT, not the output.** The Grok score shapes the scenario distribution:
- Grok 65-79 → Base case is strongest, Bear still possible
- Grok 80+ → Bull case weighted up
- Grok 30-49 → Elevated uncertainty, wider Bear weight

**Probability bounds:**
- Bull: 20-30%
- Base: 50-60% (most reports use 55%)
- Bear: 15-30%

**Score bounds per scenario:**
- Bull: 70-100
- Base: 40-69
- Bear: 10-39

**Worked example (CSCO, Grok 65):**
- Bull 25% × 75 = 18.75
- Base 55% × 55 = 30.25
- Bear 20% × 25 = 5.0
- **Conviction = 54 → OPPORTUNISTIC BUY**

---

## 4. Formatting Rules

- **British English only** — behaviour, colour, honour, organised, etc.
- **ISO dates** — 2026-04-17
- **Numeric prices** — no currency symbols in tables: `86.11` not `USD86.11`; display with currency in header only
- **Market cap** — `$340B` not `340209001480`; `$1.2T` not `1200000000000`
- **P/E ratio** — `31.1x` not `31.084837545126355x`
- **EPS** — `USD 2.77` with currency and two decimal places
- **No API keys** in HTML output
- **No placeholder text** — "Data not yet available", "Summary under review", etc. are not acceptable
- **Company-name slug** for all research directory paths (e.g. `ciscosystemsinc`, `avactagroupplc`, not `csco`, `avct`)

---

## 5. Pre-commit Quality Checklist

Run `node scripts/pre-commit-check.js` after every report. Checks:

1. **Price source** — entry in reports/index.json with valid price
2. **Grok existence** — `research/{slug}/grok-{date}.json` exists and has `score`, `signal`, `key_themes`, `summary`
3. **Web research** — `research/{slug}/web-{date}.json` exists
4. **Scenario framework** — HTML contains Bull/Base/Bear table with probabilities and scores
5. **Recommendation tier** — Maps correctly from conviction score
6. **All 11 HTML sections** — No missing sections
7. **Summary artefacts** — No placeholder text in Executive Summary or Business Model

---

## 6. File Paths for Persisted Artefacts

All relative to project root `projects/dyorhq-v4/`:

| Artefact | Path |
|----------|------|
| HTML report | `reports/{company-slug}.html` |
| Index | `reports/index.json` |
| Grok raw | `research/{company-slug}/grok-YYYY-MM-DD.json` |
| Web research | `research/{company-slug}/web-YYYY-MM-DD.json` |
| FMP data | `research/{company-slug}/fmp-YYYY-MM-DD.json` |
| Paperclip | `research/{company-slug}/paperclip-YYYY-MM-DD.json` |
| RNS | `research/{company-slug}/rns/{YYYY-MM-DD}-{slug}.md` |
| Data | `reports/data/{ticker}.json` |

Company slug examples: `ciscosystemsinc`, `avactagroupplc`, `waltdisneyco`, `alphabetincclassa`

---

## 7. New Entry Universe Tags

Always add `universes: ["watchlist"]` for new index entries. The `scripts/assign-universes.js` script syncs universe tags from the Google Sheet after initial generation.

---

## 8. Biotech/Pharma — Paperclip Trigger Logic

Trigger Paperclip research when:
- `sector` from FMP/sheet contains: biotech, biopharmaceutical, pharmaceutical, life sciences, oncology, therapeutics, genomics, medicine, healthcare
- Or ticker in hardcoded list: AVCT, RGTI, CRIS, ASC, BCT, ZYME, OCX, INmune, Novocure, Evotec, BioNTech, Moderna, Immunocore, Oxford Nanopore

For AVCT specifically:
- Use paperclip data on affimer scaffold proteins and FAP targeting
- FAP selectivity in >90% of epithelial tumours is the scientific validation for pre|CISION platform
- FAP-targeted ADC safety data supports bull case
- Reference: `research/avactagroupplc/paperclip-2026-04-17.json`
- AACR 2026 (17-22 April 2026) is a live catalyst this week — check AACR website directly for abstracts
