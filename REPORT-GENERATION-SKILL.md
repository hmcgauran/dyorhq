# REPORT-GENERATION-SKILL.md
## DYOR HQ — Report Generation Reference

Complete reference for generating a DYOR HQ investment report. Fully self-contained.

---

## 0. Naming Rules (HARD CONSTRAINTS)

**Every file associated with a tracked ticker uses the canonical slug from `slugLib.researchSlug(ticker)` as its filename/base.** The raw ticker is never used in any filename.

| Artefact | Location | Naming |
|----------|----------|--------|
| Research dir | `research/` | `researchSlug(ticker)` e.g. `kerrygroupplc`, `nvidiacorp` |
| Data JSON | `reports/data/` | `{slug}.json` e.g. `nvidiacorp.json` — NOT `NVDA.json` |
| Public HTML | `public/reports/` | `{slug}.html` e.g. `kerrygroupplc.html` |
| Source HTML | `reports/` | `{slug}.html` e.g. `nvidiacorp.html` |
| Index entry | `reports/index.json` | `slug` field = `researchSlug(ticker)` |

**Sub-artefacts** inside a research dir:
- `grok-YYYY-MM-DD.json`
- `web-YYYY-MM-DD.json`
- `paperclip-YYYY-MM-DD.json`
- `fmp-YYYY-MM-DD.json`
- `10-K-{year}.html`
- `rns/` subdirectory

**Test:** If you cannot derive the ticker from the filename using `researchSlug()`, the naming is wrong.

---

## 1. Pipeline — Two-Phase (strict order)

### Phase 1: Collect Data
### Phase 2: Generate Reports

**Never skip Phase 1.** Reports are generated from data already on disk. Running reports before data is collected produces stale or missing data.

### Phase 1 — Data Collection (per ticker)

For each ticker in `reports/index.json`:

1. **Google Sheet quote (PRIMARY)** — `gws sheets spreadsheets values get` on `1N3lmSP2KI3pVOI3JlnsCn3YKKEWEKGiTILYKvPAJPoM`. Columns: ticker, company, exchange, currency, price, marketCap, P/E, EPS. Authoritative source for all financial fields. If the ticker is not in the sheet, note it and use FMP as fallback.
2. **FMP API (US NYSE/NASDAQ, SUPPLEMENTAL)** — `/stable/` endpoints. Fill missing/invalid sheet fields only. If sheet already has a valid price, marketCap, P/E, or EPS, prefer the sheet value.
3. **Grok sentiment** — `POST https://api.x.ai/v1/chat/completions`. System prompt: analyst persona, score 0-100, signal, key_themes, bull_case, bear_case, summary, sources. Persist raw response to `research/{slug}/grok-YYYY-MM-DD.json`.
4. **Web research** — 4 Brave Search queries. Persist best result to `research/{slug}/web-YYYY-MM-DD.json`.
5. **Paperclip** (biotech/pharma only) — Triggered by sector or hardcoded ticker list. Persist to `research/{slug}/paperclip-YYYY-MM-DD.json`.
6. **Write data JSON** — `reports/data/{slug}.json` contains the consolidated data blob used by the report generator. Must include: ticker, company, exchange, currency, price, marketCap, pe, eps, grokScore, grokSignal, grokThemes, webSummary, sector, industry, revenueTTM, grossMargin, sharesOutstanding, beta, dataGatheredAt.

### Phase 2 — Report Generation (per ticker, after Phase 1)

7. **Read data JSON** — `reports/data/{slug}.json` is the single input. No live API calls at this stage.
8. **Scenario framework + conviction** — Bull/Base/Bear probabilities and scores. Grok score is an input, not the output conviction score.
9. **Write source HTML** — `reports/{slug}.html`. 11 required sections. No live fetches at this stage.
10. **Update index** — Append entry to `reports/index.json`.
11. **Build** — `npm run build` in project root.

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
Unordered list. Fields: Price, P/E, Market Cap, EPS (TTM), 52-Week High, 52-Week Low, Revenue (TTM), grossMargin. **Google Sheet data is the primary source for all financial fields.** FMP supplements only where sheet data is missing or invalid. Never present FMP price as if it were the primary reference.

### Section 5: Recent Catalysts
Drawn from Grok key themes. List 3-6 specific recent events with dates where known. For AVCT: note AACR conference (17-22 April 2026) and check abstracts directly at AACR website.

### Section 6: Thesis Evaluation
Prosa scenario cards (not a raw table):

**Bull Case** (25-30% probability): 3-5 paragraphs with specific price targets and timeline.

**Base Case** (50-60% probability): 3-5 paragraphs explaining what has to go right.

**Bear Case** (15-30% probability): 3-5 paragraphs covering key derailment risks.

Conviction score table at end of section.

### Section 7: Key Risks
Ranked list of 3-6 specific risks. Each risk: one sentence description, estimated probability, potential impact.

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
At least two rows (near-term and long-term). Specific numbers from thesis.

---

## 3. Conviction Scoring Framework

**Formula:**
```
Conviction = (BullProb × BullScore) + (BaseProb × BaseScore) + (BearProb × BearScore)
```

**Probability weights (v3, fixed):** Bull=25%, Base=50%, Bear=25% (symmetric).

| Scenario | Probability | Score contribution |
|----------|-------------|-------------------|
| Bull     | 25%         | Bull × 0.25       |
| Base     | 50%         | Base × 0.50       |
| Bear     | 25%         | Bear × 0.25       |

**Grok score is an INPUT, not the output.** Grok shapes scenario distribution:
- Grok 80+ → Bull score 80-100; Base 60-79; Bear 30-49
- Grok 65-79 → Bull 70-85; Base 50-69; Bear 20-39
- Grok 50-64 → Bull 65-80; Base 40-59; Bear 15-29
- Grok <50 → Bull 50-70; Base 35-54; Bear 10-29

**Recommendation tiers:**
| Score  | Recommendation |
|--------|----------------|
| 80+    | BUY (STRONG)   |
| 65-79  | BUY            |
| 50-64  | OPPORTUNISTIC BUY |
| 30-49  | SPECULATIVE BUY |
| <30    | AVOID          |

---

## 4. Formatting Rules

- **British English only** — behaviour, colour, honour, organised, etc.
- **ISO dates** — 2026-04-17
- **Market cap** — `$340B` not `340209001480`; `$1.2T` not `1200000000000`
- **P/E ratio** — `31.1x` not `31.084837545126355x`
- **EPS** — `USD 2.77` with currency and two decimal places
- **No API keys** in HTML output
- **No placeholder text** — all sections must be fully written

---

## 5. File Paths for Persisted Artefacts

All relative to project root `projects/dyorhq-v4/`:

| Artefact | Path |
|----------|------|
| Data JSON | `reports/data/{slug}.json` |
| Index | `reports/index.json` |
| Source HTML | `reports/{slug}.html` |
| Public HTML | `public/reports/{slug}.html` |
| Grok raw | `research/{slug}/grok-YYYY-MM-DD.json` |
| Web research | `research/{slug}/web-YYYY-MM-DD.json` |
| FMP data | `research/{slug}/fmp-YYYY-MM-DD.json` |
| Paperclip | `research/{slug}/paperclip-YYYY-MM-DD.json` |
| Annual report | `research/{slug}/10-K-{year}.html` |
| RNS | `research/{slug}/rns/{YYYY-MM-DD}-{slug}.md` |

Slug = `researchSlug(ticker)` e.g. `kerrygroupplc`, `nvidiacorp`, `waltdisneyco`.

---

## 6. Pre-commit Quality Checklist

Run `node scripts/pre-commit-check.js` after every report. Checks:
1. Price source — entry in reports/index.json with valid price
2. Grok existence — `research/{slug}/grok-{date}.json` exists with required fields
3. Web research — `research/{slug}/web-{date}.json` exists
4. Scenario framework — HTML contains Bull/Base/Bear table
5. All 11 HTML sections present
6. No placeholder text in Executive Summary or Business Model
