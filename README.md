# DYOR HQ

Investment research platform. Systematic analysis of equities with public-facing reports rendered as HTML and a structured methodology applied consistently across every coverage name.

**Live at:** [dyorhq.ai](https://dyorhq.ai)

---

## What We Do

Produce high-conviction, scenario-weighted equity research. Each report covers:

- Business model and economic moat
- Financial snapshot (where data is available)
- Recent catalysts
- Thesis evaluation — bull / base / bear scenarios with probability weighting
- Key risks ranked by severity
- Conviction score (0–100) and recommendation (BUY / HOLD / REDUCE / SELL)
- Technical context (optional, timing only)

Reports are analytical, not promotional. Downside risks are documented explicitly. Conviction scores reflect probability-weighted expected value across scenarios.

---

## Architecture

```
dyorhq/
├── index.html              # Homepage — lists all reports
├── README.md               # This file
├── .gitignore
└── reports/
    ├── index.json          # Report registry (ID, ticker, date, conviction, summary)
    ├── template.html        # Report template
    ├── diageo-dge-2026-04-05.html
    ├── avct-2026-04-07.html
    └── ruoc-2026-04-07.html
```

**Hosting:** any static host — GitHub Pages, Netlify, Vercel. Point `index.html` at the `reports/` directory.

**No frameworks.** Pure HTML, CSS, and vanilla JS. Works everywhere, loads instantly, no build step.

---

## Adding a Report

1. Create the HTML file in `reports/` using `template.html` as the baseline
2. Add an entry to `reports/index.json` (maintain date order, newest first)
3. Commit and push — the homepage updates automatically

**File naming convention:** `{lowercase-ticker}-{YYYY-MM-DD}.html`

---

## Report Standards

Every report must include:

- Ticker and company name
- Report date
- Current price and 52-week range
- Conviction score (0–100) and recommendation
- Bull / base / bear scenario table
- Key risks ranked by severity
- Alert levels (accumulate / trim / warning)
- All financial data sourced live — no training data

**Never include:** personal position data, cost basis, or anything that identifies a specific holder. Reports are public.

---

## Analysis Methodology

### Conviction Scoring (0–100)

| Score | Recommendation | Meaning |
|---|---|---|
| 80+ | BUY | Clear thesis, near-term catalysts, manageable risk |
| 60–79 | HOLD | Thesis intact, catalysts ahead, some execution risk |
| 40–59 | REDUCE | Thesis questioned, catalysts distant |
| <40 | SELL | Thesis broken or binary failure |

### Scenario Weighting

```
Expected Conviction = (Bull% × Bull) + (Base% × Base) + (Bear% × Bear)
```

Standard weighting: Bull 20–30%, Base 50–60%, Bear 15–30%. Adjust by conviction level.

### Price Levels

Levels are specific to each report and reflect: 52-week range, support/resistance, and entry/exit triggers derived from the scenario analysis. Not mechanical — judgement applied.

---

## Workflow

1. **Data pull** — live prices, news, RNS filings, SEC/company filings via web APIs
2. **Analysis** — scenario-weighted thesis, conviction scoring, risk ranking
3. **Report generation** — HTML output using template, saved to `reports/`
4. **Registry update** — `reports/index.json` entry added
5. **Git push** — deploys to live site
6. **Distribution** — full HTML report emailed; 5-bullet summary sent to subscribers

---

## Technical Notes

- **Stock prices:** sourced live from Yahoo Finance API (v8 chart endpoint). LSE tickers use `.L` suffix. FRA tickers use `.F` suffix.
- **RNS / news:** via Yahoo Finance RSS feed or direct company IR pages
- **Email:** Google Workspace (`gog` CLI) for Gmail delivery
- **Hosting:** static — `index.html` reads `reports-index.json`, which is derived from the canonical `reports/index.json`

## Model Routing

Analysis is performed by a large language model operating in two modes:

- **In-session (direct):** live data pulled and synthesised in the primary session. Used when the model API is responsive and no subagent spawning is required.
- **Subagent (spawned):** a dedicated analysis session is spawned for report generation, HTML writing, and distribution. Used for complex or parallel work.

Both modes use the same underlying model for judgement-heavy synthesis — scenario analysis, conviction scoring, risk evaluation, and report writing. The parent session handles data collection and quality control.

*Model selection is handled by the system configuration — see the agent's MEMORY.md for current routing defaults.*

---

## Ticker Conventions

| Market | Example | Notes |
|---|---|---|
| London Stock Exchange | `AVCT.L`, `DGE.L` | `.L` suffix |
| NYSE American | `OPTT` | No suffix in US feeds |
| Frankfurt | `RUOC.F` | `.F` suffix |
| US OTC | `RUOC` | May not have clean price data |

---

*DYOR HQ is an independent research project. All analysis is for informational purposes only and does not constitute financial advice. Always conduct your own due diligence.*
