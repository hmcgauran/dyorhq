# DYOR HQ — Technical Specification

**Version:** 2.0  
**Date:** 2026-04-10  
**Status:** Ready for phased implementation  

**Implementation note:** This specification combines several independent features and should be delivered in phases rather than as a single undifferentiated change set. Each phase has explicit dependencies and acceptance criteria.

---

## 1. PRODUCT-PRIORITY RATIONALE

This implementation phase improves the website's usability, report discovery, and index structure. It does not yet deliver the full strategic moat of DYOR HQ.

The true product moat depends on:

- transparent methodology
- score accountability over time
- portfolio-aware comparison
- grounded AI interaction with structured research

These capabilities should guide subsequent implementation phases after the current improvements are shipped. Homepage polish, filter quality, and freshness signalling are useful, but they are supporting layers rather than the product's ultimate point of difference.

---

## 2. ARCHITECTURE DECISIONS

### Static-first approach

The site remains statically hosted. Report pages and index data are generated ahead of time and served directly from the CDN.

### Browser-side behaviour

The browser is responsible for:
- rendering the report grid
- applying user filters (universe, recommendation, search, favourites)
- storing favourites in localStorage
- reading URL query parameters for universe state
- applying freshness signalling using cached live-price data

### Build-time responsibilities

The build and sync pipeline is responsible for:
- maintaining `reports/index.json` as the canonical source
- enriching report entries with structured metadata (universe, sector, exchange, ISIN)
- producing `public/reports-index.json` as the browser-facing derived index
- validating schema integrity before every deployment
- failing the build if required fields are missing or malformed

### Known temporary choices (v1 trade-offs)

The following are acceptable v1 decisions, not durable architecture:

| Choice | Why temporary | Successor |
|---|---|---|
| localStorage for favourites | no cross-device sync, no server state | user accounts with persistent state |
| query-parameter universe routing | works for static deploy, limits deep linking | path-based routing with proper 404 handling |
| client-side freshness heuristics | client-side only, no server-side scheduling | queued refresh workflow with admin UI |
| manual refresh request workflow | acceptable v1 workaround | queued refresh with visible status |
| Yahoo Finance batch for live prices | public API, rate-limited | Google Sheet live data integration |

These should be labelled in documentation as v1 decisions.

### What would force a backend later

- user accounts and persistent portfolios
- real-time refresh scheduling
- institutional delivery with authentication
- AI query layer with live data grounding

---

## 3. CANONICAL DATA CONTRACT

`reports/index.json` is the only canonical source of truth. `public/reports-index.json` is derived from it and must never be edited manually.

### Canonical report schema (TypeScript)

```typescript
type Recommendation = 'BUY' | 'HOLD' | 'REDUCE' | 'SELL'

type ReportIndexEntry = {
  id: string           // lowercase ticker, e.g. "aapl"
  company: string      // full company name, e.g. "Apple Inc"
  ticker: string      // uppercase exchange ticker, e.g. "AAPL"
  file: string         // relative path to HTML report, e.g. "reports/aapl.html"
  recommendation: Recommendation
  conviction: number   // 0–100
  summary: string       // one-line investment summary
  date: string | null   // ISO date string, e.g. "2026-04-08"
  datePublished: string | null  // ISO date string, original publication
  lastRefreshed: string | null   // ISO date string, last substantive update
  priceStored: number | null     // price in GBP/USD used for freshness calc
  isin: string | null
  exchange_code: string | null
  universe: 'watchlist' | 'fortune100' | 'sp100' | null
  sector: string | null
  exchange: string | null
}
```

### Required fields

`id`, `ticker`, `company`, `file`, `recommendation`, `conviction`, `summary` — must always be present.

### Optional fields

All other fields may be `null`. The schema requires them to be present and explicitly null rather than absent.

### Validation rules

1. `recommendation` must be one of the four defined values
2. `conviction` must be an integer 0–100
3. `universe` must be one of the four defined values if not null
4. `priceStored` must be a number if not null
5. All ISO date fields must be valid date strings or null
6. Build must fail if required fields are missing or malformed

### Failure behaviour

- Missing required field → build fails with field name
- Malformed optional field → build fails with field name
- Missing universe on publish → defaults to `watchlist`
- Missing sector/exchange → null is preserved

---

## 4. PHASED DELIVERY PLAN

### Phase 1 — Favourites + Schema Enforcement

**Goal:** User-favourites persistence + build integrity  
**Acceptance criteria:**
- [ ] Toggle favourite on any report card → persists in localStorage
- [ ] Favourites filter shows only saved reports
- [ ] Combined filter (favourites + recommendation + search) works correctly
- [ ] localStorage corruption resets safely to `[]`
- [ ] All report index entries validated against schema before every build
- [ ] Build fails if required fields are missing

**Out of scope:** universe tabs, freshness badges

### Phase 2 — Multi-Universe Architecture

**Goal:** Index structure with universe metadata  
**Acceptance criteria:**
- [ ] `universe`, `sector`, `exchange` fields present in canonical and derived index
- [ ] Homepage has universe tabs: All / Personal Watchlist / Fortune 100 / S&P 100
- [ ] URL-driven universe state: `/?universe=fortune100` activates correct tab
- [ ] Reports without `universe` field publish as `watchlist`
- [ ] Deep-linked universe URL restores correct active state

**Depends on:** Phase 1 schema validation

### Phase 3 — Report Freshness Signalling

**Goal:** Price drift and refresh-date signalling on cards  
**Acceptance criteria:**
- [ ] `priceStored`, `datePublished`, `lastRefreshed` present in index
- [ ] Live price batch fetched on page load (one request, not per-card)
- [ ] Cards display "Needs refresh" or "Review" badge when price drift > 15%
- [ ] Badge also shown when lastRefreshed > 90 days (no price trigger needed)
- [ ] Live-price failure degrades gracefully — no user-visible error
- [ ] "Stale" is not used as a primary label

**Depends on:** Phases 1 + 2

### Out of scope for all phases

- authenticated user accounts
- persistent server-side favourites
- portfolio analytics engine
- comparison engine
- queued refresh workflows (placeholder only)
- AI query layer

---

## 5. FEATURE 1 — FAVOURITES

### Storage contract

**Key:** `dyorhq_favourites`  
**Value:** JSON array of uppercase ticker strings, no duplicates.

```json
["AAPL", "NVDA", "MSFT"]
```

### Behaviour rules

1. Click star → toggle ticker in/out of the array
2. All ticker comparison normalised to uppercase on read and write
3. Malformed localStorage (wrong type, parse failure) → reset to `[]`
4. State persists across page reloads
5. Favourites filter combines with universe filter, recommendation filter, and search
6. Empty favourites → show empty state message, not all reports

### UI state model

The `.is-favourite` class on the star button is the source of styling truth. The star character (★ or ☆) is the visual expression only. Do not rely on character content for any logic.

### Star button HTML structure

```html
<button class="fav-btn is-favourite" data-ticker="AAPL" aria-label="Remove AAPL from favourites">
  ★
</button>
```

Class `.is-favourite` means starred. No class means not starred. The character is visual only.

### Edge cases

- localStorage key missing → treat as empty array
- duplicate ticker in array → deduplicate on write
- ticker comparison must use exact uppercase match on both sides

---

## 6. FEATURE 2 — MULTI-UNIVERSE INDEX ARCHITECTURE

### Supported universes

| Universe | Description | Index field |
|---|---|---|
| `watchlist` | Personal watchlist (Hugh's sheet) | `universe: "watchlist"` |
| `fortune100` | Fortune 100 companies | `universe: "fortune100"` |
| `sp100` | S&P 100 companies | `universe: "sp100"` |

### Routing

Universe selection uses URL query parameters only. No path-based routing.

| URL | Active universe |
|---|---|
| `/` | All (no filter) |
| `/?universe=fortune100` | Fortune 100 only |
| `/?universe=sp100` | S&P 100 only |
| `/?universe=watchlist` | Personal watchlist only |

### Source-of-truth rules

- `reports/index.json` is canonical — never edit manually
- `public/reports-index.json` is derived — always regenerated from canonical
- entries without `universe` must be published as `watchlist`
- entries without `sector` or `exchange` must be published as `null`

### Active tab indicator

The homepage tab corresponding to the current universe must be visually marked active on page load, based on URL parameters.

---

## 7. FEATURE 3 — REPORT FRESHNESS SIGNALLING

### Naming

This feature is called **report freshness signalling** — not staleness detection. Badge labels must use "Needs refresh" or "Review", never "Stale".

### Freshness rules (both conditions independent — either triggers badge)

**Condition A — Price drift:**
`abs(livePrice - priceStored) / priceStored > 0.15`

**Condition B — Time since refresh:**
`lastRefreshed` is more than 90 days ago AND `datePublished` is more than 60 days ago

### Badge display rules

- Badge appears only when Condition A OR Condition B is true
- Badge does not appear if neither condition is met
- Badge does not make any statement about thesis validity — it is a prompt for the reader to check
- "Stale" is not used as primary label

### Runtime behaviour

1. On page load, fetch all live prices in a single Yahoo Finance batch request
2. For each card, compare live price vs `priceStored`
3. Check `lastRefreshed` date against current date
4. If either condition met → show badge
5. If price fetch fails → suppress all badges, log failure quietly
6. No user-visible error for live data unavailability

### Implementation note

This is a heuristic for v1. The 15% threshold does not account for sector volatility differences. A high-beta stock can cross 15% without the thesis changing. The badge is an administrative signal, not an analytical verdict.

---

## 8. REPORT REFRESH WORKFLOW

### Current state (v1)

Refresh requests are captured via a manual workflow. The implementation may use a `mailto:` link or a simple form submission that creates a queued item for review.

### Explicit v1 labelling

> Temporary implementation note: In v1, refresh requests are captured through a lightweight manual workflow. This is not the long-term product behaviour. The intended end state is a queued refresh request with visible status, not a hidden manual handoff.

### Long-term target

- Queue-based refresh requests
- Visible status: Pending / In Review / Published
- Email or notification on status change
- Audit trail of refresh requests per report

---

## 9. NON-FUNCTIONAL REQUIREMENTS

### Error handling

- Malformed localStorage → reset safely, no render break
- Missing `universe` field → default to `watchlist`, no error
- Missing `sector` or `exchange` → null, no error
- Live-price fetch failure → suppress freshness badges, no error
- Build validation failure → fail build with field name, not silent drop

### Performance

- One live-price batch request per page load, not per-card
- Index transforms must remain lightweight for static deploy
- No synchronous network requests during render

### Accessibility

- All interactive buttons have `aria-label` describing action
- Active filter states are visually distinct (colour + text, not colour alone)
- Keyboard navigation works for all interactive controls
- Badge wording is understandable without relying on colour alone

### Analytics readiness

UI logic should be structured to support emitting events for:
- `favourite_toggle` — ticker, new state (added/removed)
- `universe_tab_select` — selected universe
- `filter_use` — filter type and active value
- `refresh_request_click` — report ticker

Analytics implementation may be deferred but the UI structure should not prevent it.

---

## 10. TESTING REQUIREMENTS

### Data contract validation

- [ ] Every report entry validated against canonical schema before rebuild
- [ ] Build fails with descriptive error if required fields are missing
- [ ] Build fails if `recommendation` is not one of the four valid values
- [ ] Build fails if `conviction` is not an integer 0–100

### Filter regression tests

- [ ] Favourites filter shows only saved tickers
- [ ] Favourites filter combines with recommendation filter (AND logic)
- [ ] Favourites filter combines with search (AND logic)
- [ ] Universe filter shows only matching universe
- [ ] Universe filter combines with recommendation filter and search
- [ ] All combined filter states persist correctly across page navigation

### Failure-mode tests

- [ ] Malformed localStorage → renders empty state, no console error
- [ ] Missing `universe` field → defaults to watchlist, no error
- [ ] Missing `sector`/`exchange` → null preserved, no error
- [ ] Live-price fetch failure → all freshness badges suppressed, no user-visible error
- [ ] Deep-link `/?universe=fortune100` → correct tab active, correct reports shown

### UX tests

- [ ] Star toggle updates visually and persists after page reload
- [ ] Favourites count updates in nav or indicator when items added/removed
- [ ] Report card with active freshness badge shows correct badge text
- [ ] Refresh button does not break report rendering
- [ ] Price fetch failure does not break card rendering

---

## 11. DEPLOYMENT

All changes in this phase remain compatible with the current static deployment model (Netlify or equivalent). No backend infrastructure is required.

The build pipeline must:
1. Run schema validation on `reports/index.json`
2. Fail build on validation error
3. Run sync-index.js to produce `public/reports-index.json`
4. Deploy only on success

If DYOR HQ later introduces user accounts, persistent portfolios, or institutional delivery, the architecture will need to evolve beyond purely static. This document marks that decision point but does not implement it.

---

## 12. FILE INVENTORY (updated)

### Report pages

`reports/{id}.html` — individual company reports (static HTML)

### Index files

`reports/index.json` — **canonical source of truth**, single source for all derived indexes  
`public/reports-index.json` — **derived**, served to browser, regenerated on build  
`public/reports-index.json` — never edited manually

### Scripts

`scripts/sync-index.js` — produces derived index from canonical, enforces schema  
`scripts/enrich-index.js` — adds universe/sector/exchange from Google Sheet tabs (Phase 2)

### Frontend

`index.html` — homepage, report card grid, universe tabs  
`public/index.html` — deployed copy of homepage  
`assets/js/main.js` — favourites, filtering, URL state, freshness badge logic  
`public/assets/js/main.js` — deployed copy

### Schema

`schemas/report-index.json` — JSON Schema for report index validation (Phase 1)

---

## 13. OPEN QUESTIONS (address before Phase 2)

1. `sector` field — where does the value come from? Manual assignment or Google Sheet source?
2. `exchange` field — derived from ticker prefix (LON:, EPA:, etc.) or from Google Sheet?
3. Freshness threshold (15%) — is this the right default or should it be configurable per universe?
4. 90-day refresh window — appropriate for all tiers, or should Tier 1 (full reports) be 60 days?
5. Analytics — which platform? Plausible for v1 or defer?
6. ISIN sync — who maintains ISIN accuracy? Auto-lookup or manual?