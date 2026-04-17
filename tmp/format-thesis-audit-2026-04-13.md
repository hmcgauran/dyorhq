# DYOR HQ format and thesis audit (2026-04-13)

## Scope
- Audited all live HTML reports under `reports/`.
- Excluded non-live templates: `reports/template.html`, `reports/report-template.html`.

## Thesis Evaluation coverage
- Live reports checked: **213**
- Reports containing a `Thesis Evaluation` section: **213**
- Reports missing `Thesis Evaluation`: **0**

All live reports contain a `Thesis Evaluation` section.

## Scenario presentation audit
Current reports are **not fully consistent** on the bull/base/bear scenario presentation.

### Structured scenario-table implementation
These reports use the main.css table treatment with `scenario-table` plus `bull-row` / `base-row` / `bear-row`, which provides bordered table-style presentation and green/amber/red row treatment:
- Count: **11**
- `alkemycapitalinvestmentsplc.html`
- `avactagroupplc.html`
- `colonialcoalinternationalcorp.html`
- `diageoplc.html`
- `glencoreplc.html`
- `greatlandresourcesltd.html`
- `mkangoresourcesltd.html`
- `mongodbinc.html`
- `planetlabspbc.html`
- `shopifyinc.html`
- `teledynetechnologiesinc.html`

### Structured scenario-card implementation
These reports use card-style scenario rows (`scenario-row` with `scenario bull/base/bear`). They retain green/amber/red label styling, but are **card-based rather than table-based**:
- Count: **6**
- `cardinalhealthinc.html`
- `cencorainc.html`
- `cignagroup.html`
- `elevancehealthinc.html`
- `mckessoncorp.html`
- `walmartinc.html`

### Remaining live reports
- Count: **196**
- These do **not** use the standardized bordered `scenario-table` structure or the full three-card `scenario-row` structure consistently.
- In practice, most of these present the thesis scenarios as plain paragraphs or other ad hoc markup rather than a consistent bull/base/bear row layout.

## Deterministic conclusion
1. **Thesis Evaluation coverage:** Yes. **All 213/213** live reports include a `Thesis Evaluation` section.
2. **Bull/base/bear styling consistency:** No. The live set is mixed:
   - **11** reports use the standardized bordered/table format with green/amber/red bull/base/bear rows.
   - **6** reports use a three-card bull/base/bear layout with green/amber/red styling, but not a table.
   - **196** reports do not use either of those two full structured formats consistently.

Therefore, the green/amber/red, bordered/table-style scenario presentation is **not** consistent across the current live report set.
