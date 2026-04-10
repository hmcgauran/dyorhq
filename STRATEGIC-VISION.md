# DYOR HQ — Strategic Vision Document

**Version:** 2.0  
**Date:** 2026-04-10  
**Status:** Revised — ready for implementation  
**Author:** George (OpenClaw) with ChatGPT review feedback incorporated

---

## 1. CORE VISION

DYOR HQ is a structured equity research platform that turns company analysis into a consistent, comparable output. Every covered stock follows the same framework, the same report structure, and the same conviction model, so users can compare opportunities across sectors without relying on fragmented opinions, personality-driven commentary, or unstructured AI output.

The core insight behind DYOR HQ is simple. Retail investors do not lack access to information. They lack a disciplined research framework, a consistent output format, and a transparent way to judge conviction over time. Institutional research tools solve part of that problem, but they are expensive, complex, and built for professional workflows. Free financial content sits at the other extreme and is often inconsistent, noisy, or agenda-driven. DYOR HQ is designed to occupy the space between the two.

This is not a stock tips site. It is not a chat wrapper around a language model. It is a structured research system designed to make company analysis repeatable, auditable, and useful in real portfolio decisions.

The visual identity matters, but it is secondary to the trust model. The dark, Bloomberg-inspired aesthetic should signal seriousness, but the real credibility of DYOR HQ must come from consistency of method, clarity of output, and visible accountability over time.

---

## 2. WHAT DYOR HQ ACTUALLY IS

DYOR HQ is a research synthesis platform with a standardised output format and a conviction-driven signal layer.

Each covered stock provides four things for every report:

- a structured report built to a repeatable format
- a conviction score with a defined interpretation
- a clear summary of the thesis and key risks
- a visible explanation of what would increase or reduce conviction

The platform answers four practical questions for every company:

- What does this business do
- Why does it matter now
- What is the current level of conviction
- What would change that view

### Primary user

Serious self-directed investors who want a disciplined research framework rather than opinions, hype, or generic market commentary.

### Secondary user

Research-led professionals, small teams, and analytically minded investors who need structured starting-point coverage and comparable outputs across a portfolio or watchlist.

### Not designed for

- beginners looking for simple prompts without process
- day traders seeking short-term technical signals
- users who want entertainment or personality-led stock commentary

DYOR HQ should be thought of as a research database with a conviction layer on top. The value is not just that each stock has a report. The value is that every report has the same shape, every score is generated through the same framework, and every output becomes comparable across the index.

---

## 3. CORE STRATEGIC POSITIONING

DYOR HQ is built around three interlocking propositions.

### Methodology transparency

Users should be able to see what is being assessed, why it matters, and how conviction is formed. Transparency is the anti-shill mechanism and the foundation of trust.

### Consistency of output

Every company should be assessed through the same report structure and the same scoring framework. Comparison should be native to the product rather than bolted on afterwards.

### Conviction with accountability

DYOR HQ does not stop at commentary. It assigns a score, records the reasoning behind it, and makes score changes visible over time. Conviction becomes useful only when it is trackable and open to review.

These positioning pillars distinguish DYOR HQ from free content platforms, broad financial terminals, and generic AI finance tools. The product should not compete on raw data depth alone. It should compete on structured synthesis, transparency, and the ability to compare companies and portfolios through a repeatable lens.

---

## 4. METHODOLOGY AND GOVERNANCE

This section is central to the product. If DYOR HQ wants to earn long-term trust, the methodology cannot be implied. It must be explicit.

### What the methodology defines

- the factors assessed in every report
- the weighting logic used in the conviction score
- how qualitative judgement is incorporated
- which events trigger a report review
- when a score can be overridden by editorial judgement
- how score changes are recorded and displayed
- how disclosures and conflicts are handled
- whether scores are absolute, sector-relative, or both

### What governance defines

- how often reports are reviewed
- what qualifies as a material change
- how stale reports are identified
- how historical score movements are preserved
- how users can see whether a report has been refreshed
- how AI is used and where human judgement remains in control

### Conviction scoring model (current framework, subject to formalisation)

Scores range from 0–100 and are derived from scenario-weighted conviction analysis:

| Score | Recommendation | Scenario weighting |
|---|---|---|
| 80–100 | BUY | Bull 20–30%, Base 50–60%, Bear 15–30% |
| 60–79 | HOLD | Thesis intact with catalysts ahead |
| 40–59 | REDUCE | Thesis questioned, execution lagging |
| 0–39 | SELL | Thesis broken, cash crisis, binary failure |

Scores are absolute, not sector-relative. Position sizing guidance is attached to the score bands (3–5% for BUY 80+, 1.5–3% for HOLD 60-79, 0.5–1.5% for REDUCE 40-59, 0–0.5% for SELL <40).

**Factors assessed in every report:**
1. Business model — revenue clarity, margin profile, capital intensity
2. Financial snapshot — revenue, profitability, cash, debt, runway
3. Recent catalysts — last 3–6 months of material developments
4. Thesis evaluation — bull/bear/base case with inflection points
5. Key risks — ranked by severity (not just listed)
6. Valuation context — relative to sector, history, peers

**Update triggers:**
- RNS announcements with material information
- Price drift exceeding 15% from stored price
- Scheduled review window (quarterly for HOLD, event-driven for BUY/REDUCE)
- Analyst override for non-price events (partnership, leadership change, etc.)

**AI vs human boundaries:**
- Report generation: AI-assisted synthesis, human-edited
- Score assignment: human-led, AI-suggested scenario analysis
- Risk ranking: human judgement
- Refresh: human approval required before publishing

### Why this matters

The credibility of DYOR HQ will not come from polished presentation alone. It will come from score discipline, revision discipline, and visible accountability. Users need to understand not just the current score, but why it is the current score and what could cause it to move.

---

## 5. PRODUCT DIFFERENTIATION

DYOR HQ combines four elements that are rarely delivered together at a retail-accessible price point.

### Structured and repeatable research

The platform does not depend on ad hoc write-ups. It enforces a standard framework applied across sectors and across time.

### Visible conviction scoring

The score is not decorative. It is the synthesis layer that turns raw analysis into a usable decision aid. Its value depends on consistency, transparency, and revision history.

### Portfolio-aware comparison

Most retail tools focus on isolated stock ideas. DYOR HQ focuses on relative conviction within a watchlist or portfolio context, which is much closer to how serious investors actually work.

### AI as an interface, not a substitute

AI helps query, summarise, and navigate the structured research base. It does not replace the methodology, the scoring rules, or the visibility of the underlying reasoning.

DYOR HQ does not need to claim that no one has ever built anything similar. It is enough, and more credible, to say that it combines these elements in a more disciplined and transparent way than most retail-accessible alternatives.

---

## 6. PRODUCT ROADMAP

The roadmap is reorganised around proof, not feature volume.

### Phase 1 — Prove trust and consistency

- formalise the canonical report schema (TypeScript interface, validation rules)
- formalise the scoring methodology and governance rules
- build the templated report generation system
- establish refresh discipline and visible score history
- implement Phase 1 of technical spec: favourites, schema enforcement, build-fail on malformed entries

### Phase 2 — Prove comparison and portfolio utility

- launch side-by-side stock comparison
- launch sector-relative comparison views
- add portfolio import and conviction-weighted portfolio views
- add score-change and refresh alerts

### Phase 3 — Prove monetisation and scale

- introduce paid subscription tiers
- expand structured coverage into defined universes
- launch AI query layer on top of grounded report data
- introduce sector and theme landing pages that drive report discovery

### Phase 4 — Expand into platform economics

- institutional API access
- white-label or embedded distribution
- custom index creation
- data licensing
- community and contributor features

This sequencing matters. DYOR HQ should prove trust before it proves breadth, and prove product value before it adds ecosystem complexity.

---

## 7. INDEX ARCHITECTURE

The index architecture is an operational enabler, not the main strategic story.

DYOR HQ supports multiple coverage tiers so the platform can expand without pretending every stock gets the same editorial depth.

### Tier 1 — Full reports

High-priority coverage with complete reports, full thesis treatment, conviction scoring, and event-driven updates.

### Tier 2 — Core reports

Compressed but still structured reports with lighter editorial overhead and scheduled refreshes.

### Tier 3 — Data-led coverage

Structured profiles with lighter written analysis, formulaic signal inputs, and clear labelling that this is lower-depth coverage.

The strategic point is not simply to cover more names. It is to prove that the methodology can scale without breaking consistency.

---

## 8. REVENUE MODEL

DYOR HQ should initially be built and priced for serious self-directed investors and research-led professionals on a subscription basis.

This is the fastest route to validating whether users trust the methodology, return regularly, and find the comparison and portfolio layers valuable enough to pay for.

### Initial commercial model

- free tier for sampled access and product discovery
- paid tier for full report access, comparison, portfolio tools, and alerts
- premium tier for deeper workflow features such as AI query, history, and advanced screens

### Expansion paths

Institutional API access, white-label distribution, and data licensing can become meaningful later, but only after DYOR HQ has demonstrated a track record of score discipline, content quality, and retention.

The first revenue engine should not be ambiguous. The immediate goal is subscription validation, not trying to serve every possible commercial path at once.

---

## 9. TRUST, DISCLOSURE, AND PRODUCT INTEGRITY

Because DYOR HQ operates in an investment research context, trust cannot be treated as a brand layer alone. It has to be operational.

### What DYOR HQ is

- A structured equity research platform with consistent output formats
- A research synthesis and scoring tool, not a licensed financial advisor
- A platform for opinionated but disciplined analysis, clearly labelled as personal research

### What DYOR HQ is not

- Licensed investment advice or a regulated financial service
- A guarantee of future performance
- A substitute for independent financial advice
- A crystal ball

### What must always be visible

- the date of publication and last refresh on every report
- the conviction score and its interpretation
- score change history with dated entries
- AI participation level in report generation (AI-assisted, human-edited)
- sources cited in the analysis
- clear labelling that DYOR HQ reports are personal research, not regulated advice

### Conflicts and disclosures

- DYOR HQ and its operators do not hold positions in covered stocks as part of a coordinated investment strategy
- If a conflict is identified, it is disclosed in the relevant report
- Report refresh and score changes are logged with timestamps
- No report is generated for a company where the operator has material inside information

### What this section becomes

This section should eventually become part of the public trust layer of the product — alongside the methodology page and the score history log.

---

## 10. PRIORITY RECOMMENDATION

**Prove trust before proving breadth.**

The next concrete moves are:

1. define the canonical report schema and enforce it in the build
2. formalise the scoring framework and its governance rules
3. build the templated report engine with consistent sections
4. establish report freshness and score-history discipline
5. build comparison and portfolio layers only after the output format is stable

The strongest version of DYOR HQ is not a site that merely hosts stock reports. It is a system that makes investment research consistent, comparable, inspectable, and useful in portfolio context.

That is the point where the brand promise, product experience, and business model begin to align.