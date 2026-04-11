#!/usr/bin/env python3
"""
DYOR HQ v2 — Build Script
Pre-renders all report JSON files into static HTML via the canonical template.

Usage:
  python3 scripts/build-reports.py          # full build
  python3 scripts/build-reports.py AAPL     # single ticker
  python3 scripts/build-reports.py --dry-run # show what would be built
"""

import os, sys, json, re
from pathlib import Path

SCRIPT_DIR   = Path(__file__).parent.resolve()
REPORTS_DIR  = SCRIPT_DIR.parent / 'reports'
TEMPLATE_FILE = REPORTS_DIR / 'report-template.html'
OUTPUT_DIR   = SCRIPT_DIR.parent / 'public' / 'reports'
DATA_DIR     = REPORTS_DIR / 'data'
SCHEMA_FILE  = REPORTS_DIR / 'schema.json'

DRY_RUN      = '--dry-run' in sys.argv
SINGLE       = [a for a in sys.argv[1:] if not a.startswith('-')]

# ── Colours / scoring ─────────────────────────────────────────────────────────
REC_COLOURS = {
    'BUY': '#00ff88', 'HOLD': '#F59E0B',
    'REDUCE': '#FF8C00', 'SELL': '#EF4444'
}
REC_CLASSES = {
    'BUY': 'rec-buy', 'HOLD': 'rec-hold',
    'REDUCE': 'rec-reduce', 'SELL': 'rec-sell'
}

def rec_band(recommendation):
    """Extract band from 'BUY — SPECULATIVE' → 'BUY'"""
    return (recommendation or 'HOLD').split('—')[0].strip().upper()

def rec_colour(rec):
    return REC_COLOURS.get(rec_band(rec), '#888888')

def rec_class(rec):
    return REC_CLASSES.get(rec_band(rec), 'rec-hold')

def format_price(p, currency='$'):
    if p is None: return ''
    try:
        p = float(p)
        if p >= 1e12: return f'{currency}{p/1e12:.2f}T'
        if p >= 1e9:  return f'{currency}{p/1e9:.2f}B'
        if p >= 1e6:  return f'{currency}{p/1e6:.2f}M'
        return f'{currency}{p:.2f}'
    except: return str(p)

# ── Load template ─────────────────────────────────────────────────────────────
with open(TEMPLATE_FILE, 'r', encoding='utf-8') as f:
    TEMPLATE = f.read()

# Strip the client-side fetch block (not needed for pre-rendered HTML)
TEMPLATE_STATIC = re.sub(
    r'\s*<script>\s*\(function[\s\S]*?\}\)\(\),?\s*</script>',
    '',
    TEMPLATE
)

def markdown_to_html(text):
    """Convert basic markdown to HTML for safe rendering in pre-built HTML."""
    if not text:
        return ''
    # Escape HTML entities first
    for old, new in [('&','&amp;'),('<','&lt;'),('>','&gt;')]:
        text = text.replace(old, new)
    # Convert markdown
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'\*(.+?)\*', r'<em>\1</em>', text)
    text = re.sub(r'^### (.+)$', r'<h3>\1</h3>', text, flags=re.MULTILINE)
    text = re.sub(r'^## (.+)$', r'<h2>\1</h2>', text, flags=re.MULTILINE)
    text = re.sub(r'^---$', '', text, flags=re.MULTILINE)
    text = re.sub(r'\n{2,}', '<br><br>', text)
    text = re.sub(r'\n', '<br>', text)
    return text



def render_report(data):
    """Render a JSON report object into static HTML."""
    meta     = data.get('meta', {})
    price    = data.get('price', {})
    sections = data.get('sections', {})
    scores   = data.get('scores', {})

    ticker   = meta.get('ticker', '')
    company  = meta.get('company', '')
    rec      = meta.get('recommendation', 'HOLD')
    rec_note = meta.get('recommendationNote', rec)
    conv     = meta.get('conviction', 50)
    colour   = rec_colour(rec)
    colour_css = colour

    # Price
    cur  = price.get('current')
    if cur is not None and not price.get('formatted'):
        price['formatted'] = f'{format_price(cur, "$")}'
    price_fmt = price.get('formatted') or (f'{cur:.2f}' if cur else '')

    # Substitutions — only replace actual placeholder tokens
    html = TEMPLATE_STATIC

    # Meta / header
    html = html.replace('{{TICKER}}',        ticker)
    html = html.replace('{{COMPANY}}',        company)
    html = html.replace('{{ISIN}}',           meta.get('isin') or '')
    html = html.replace('{{EXCHANGE}}',        meta.get('exchange') or '')
    html = html.replace('{{RECOMMENDATION}}',  rec_note)
    html = html.replace('{{CONVICTION}}',      str(conv))
    html = html.replace('{{CONVICTION_COLOR}}', colour)
    html = html.replace('{{DATE}}',            meta.get('date', ''))
    html = html.replace('{{PRICE_FORMATTED}}', price_fmt)
    html = html.replace('{{REC_CLASS}}',       rec_class(rec))

    # Section placeholders (only clear if still a {{...}} token)
    for key in ['EXECUTIVE_SUMMARY', 'BUSINESS_MODEL']:
        html = html.replace(f'{{{{{key}}}}}', sections.get(key.lower().replace('_', ''), {}) or {})

    # Remove any remaining {{...}} tokens
    html = re.sub(r'\{\{[A-Z_]+\}\}', '', html)

    # ── Render section content directly ──────────────────────────────────
    # We'll do a full render by replacing the template with section content
    return html

def build_from_json(json_path, output_path):
    """Load JSON and write static HTML."""
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    html = build_static_html(data)

    # Write output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)
    return True


def build_static_html(data):
    """Build a complete static HTML page from report JSON data."""
    meta      = data.get('meta', {})
    price     = data.get('price', {})
    sections  = data.get('sections', {})
    scores    = data.get('scores', {})

    ticker    = meta.get('ticker', '')
    company   = meta.get('company', '')
    rec       = meta.get('recommendation', 'HOLD')
    rec_note  = meta.get('recommendationNote', rec)
    conv      = meta.get('conviction', 50)
    colour    = rec_colour(rec)

    cur       = price.get('current')
    price_fmt = price.get('formatted') or (f'${cur:.2f}' if cur else '')
    isin      = meta.get('isin') or ''
    exchange  = meta.get('exchange') or ''

    # ── Build sidebar stats ──────────────────────────────────────────────
    sidebar_stats_rows = []
    stats_pairs = [
        ('Ticker', ticker),
        ('Price', price_fmt),
        ('Market Cap', price.get('marketCapFormatted') or ''),
        ('P/E', f'{price.get("trailingPE")}x' if price.get('trailingPE') else 'N/A'),
        ('EPS', str(price.get('trailingEps', ''))),
        ('52w High', str(price.get('fiftyTwoWeekHigh', '')) if price.get('fiftyTwoWeekHigh') else ''),
        ('52w Low', str(price.get('fiftyTwoWeekLow', '')) if price.get('fiftyTwoWeekLow') else ''),
        ('Volume', f'{price.get("volume", 0):,}' if price.get('volume') else ''),
    ]
    for label, value in stats_pairs:
        if value:
            sidebar_stats_rows.append(
                f'<div class="stat-row"><span class="stat-label">{label}</span>'
                f'<span class="stat-value">{value}</span></div>'
            )
    sidebar_stats_html = '\n'.join(sidebar_stats_rows)

    # ── Build scenario table ─────────────────────────────────────────────
    thesis = sections.get('thesisEvaluation', {}) or {}
    scenario_rows = []
    for scenario_key, row_class in [('bull', 'bull-row'), ('base', 'base-row'), ('bear', 'bear-row')]:
        s = thesis.get(scenario_key, {}) or {}
        prob    = f'{s.get("probability", "")}%' if s.get('probability') is not None else ''
        upside  = s.get('upside', '') or ''
        cat     = s.get('catalyst', '') or ''
        scenario_rows.append(
            f'<tr class="{row_class}">'
            f'<td class="label-col">{scenario_key.capitalize()}</td>'
            f'<td>{prob}</td><td>{upside}</td><td>{cat}</td></tr>'
        )
    scenario_table_html = f'''
    <table class="scenario-table">
      <thead><tr><th>Scenario</th><th>Probability</th><th>Upside / Target</th><th>Catalyst</th></tr></thead>
      <tbody>{"".join(scenario_rows)}</tbody>
    </table>'''

    # ── Build risks list ─────────────────────────────────────────────────
    risks = sections.get('keyRisks', {}) or {}
    risks_list_items = []
    for r in (risks.get('risks') or []):
        num = r.get('rank', '?')
        txt = r.get('risk', '')
        risks_list_items.append(f'<li><span class="risk-num">{num}</span><span>{txt}</span></li>')
    risks_list_html = '<ul class="risk-list">' + ''.join(risks_list_items) + '</ul>' if risks_list_items else ''

    # ── Build Sources ────────────────────────────────────────────────────
    srcs = sections.get('sources', {}) or {}
    market_data = srcs.get('marketData') or \
        'Live quote data sourced via DYOR HQ data pipeline (Google Sheets + Yahoo Finance). Fields include price, market capitalisation, 52-week range, P/E, EPS, and volume.'
    company_filings = srcs.get('companyFilings') or \
        'Public company filings, regulatory announcements, investor presentations, and RNS where referenced in the analysis.'
    additional = srcs.get('additional') or []

    src_additional_html = '<li><strong>Additional sources:</strong> ' + '; '.join(additional) + '</li>' if additional else '<li><strong>Additional sources:</strong> No additional third-party sources cited in this report.</li>'

    lit_refs = srcs.get('literature') or []
    lit_html = ''
    if lit_refs:
        lit_items = []
        for ref in lit_refs:
            citation = ref.get('citation', '')
            source   = ref.get('source', '')
            year     = ref.get('year', '')
            url      = ref.get('url', '')
            lit_items.append(
                f'<li><em>{citation}</em>'
                + (f', <strong>{source}</strong>' if source else '')
                + (f' ({year})' if year else '')
                + (f' — <a href="{url}" target="_blank" rel="noopener">link</a>' if url else '')
                + '</li>'
            )
        lit_html = '<div style="margin-top:12px;"><strong>Primary literature:</strong><ol style="margin-top:8px;padding-left:20px;color:var(--text-secondary);font-size:13px;line-height:1.7;">' + ''.join(lit_items) + '</ol></div>'

    # ── Conviction history chart (sidebar) ────────────────────────────────
    history = scores.get('history') or []
    hist_card_html = ''

    if len(history) > 1:
        svgW, svgH = 240, 100
        padL, padR, padT, padB = 24, 8, 8, 20
        def toY(v): return padT + (1 - v / 100) * (svgH - padT - padB)

        grid = ''.join(f'<line x1="{padL}" y1="{toY(v):.1f}" x2="{svgW-padR}" y2="{toY(v):.1f}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>' for v in [0, 25, 50, 75, 100])

        pts = []
        for i, h in enumerate(history):
            x = padL + (i / (len(history) - 1)) * (svgW - padL - padR)
            y = toY(h['score'])
            pts.append(f'{x:.1f},{y:.1f}')
        polyline = f'<polyline fill="none" stroke="#f0b429" stroke-width="2" points="{" ".join(pts)}"/>'

        circles = ''.join(
            f'<circle cx="{(padL + (i / (len(history) - 1)) * (svgW - padL - padR)):.1f}" cy="{toY(h["score"]):.1f}" r="4" fill="#f0b429"/>'
            for i, h in enumerate(history)
        )

        y_ticks = ''.join(f'<text x="8" y="{(toY(v)+4):.1f}" font-size="10" fill="#888">{v}</text>' for v in [0, 50, 100])

        hist_rows = []
        for h in history:
            delta = h.get('delta', '0')
            dcls = 'positive' if delta.startswith('+') else 'negative' if delta.startswith('-') else 'neutral'
            hist_rows.append(f'<tr><td style="font-size:12px;color:#888;">{h.get("date","")}</td>'
                             f'<td style="font-family:monospace;font-size:13px;">{h.get("score","")}</td>'
                             f'<td style="font-family:monospace;font-size:13px;" class="{dcls}">{delta}</td></tr>')

        hist_card_html = f'''
        <div class="sidebar-card" id="conviction-history-card">
          <h3>Conviction Trend</h3>
          <div style="background:rgba(255,255,255,0.02);border:1px solid #222;border-radius:6px;padding:10px;overflow-x:auto;">
            <svg viewBox="0 0 {svgW} {svgH}" style="width:100%;height:auto;">
              {grid}{polyline}{circles}{y_ticks}
            </svg>
          </div>
          <table class="conviction-history-table" style="width:100%;border-collapse:collapse;margin-top:10px;">
            <thead><tr><th style="text-align:left;font-size:11px;color:#888;padding:4px 6px;border-bottom:1px solid #222;">Date</th>
            <th style="text-align:left;font-size:11px;color:#888;padding:4px 6px;border-bottom:1px solid #222;">Score</th>
            <th style="text-align:left;font-size:11px;color:#888;padding:4px 6px;border-bottom:1px solid #222;">Δ</th></tr></thead>
            <tbody>{"".join(hist_rows)}</tbody>
          </table>
        </div>'''

    # ── Financial snapshot table ──────────────────────────────────────────
    fin_table_rows = []
    fin_data = sections.get('financialSnapshot', {}) or {}
    table_rows = fin_data.get('table') or []
    for row in table_rows:
        label = row.get('label', '')
        value = row.get('value', '')
        note  = row.get('note', '')
        fin_table_rows.append(f'<tr><td>{label}</td><td>{value}</td></tr>')
        if note:
            fin_table_rows.append(f'<tr><td colspan="2" style="font-size:12px;color:#888;font-style:italic;padding-left:12px;">{note}</td></tr>')
    fin_table_html = f'<table class="data-table">{"".join(fin_table_rows)}</table>' if fin_table_rows else ''

    # ── Assemble the page ─────────────────────────────────────────────────
    rec_css_class = rec_class(rec)

    page = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="{company} ({ticker}) — Investment Research — DYOR HQ">
  <meta name="isin" content="{isin}">
  <meta name="exchange_code" content="{exchange}">
  <title>{company} ({ticker}) — DYOR HQ</title>
  <link rel="stylesheet" href="../assets/css/main.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body {{ font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }}
  </style>
</head>
<body>
  <header>
    <div class="header-inner">
      <a href="../index.html" class="logo">
        <span class="logo-wordmark">DYOR <span>HQ</span></span>
        <span class="logo-badge">AI Research</span>
      </a>
      <nav>
        <ul class="nav-links">
          <li><a href="../index.html">← All Reports</a></li>
        </ul>
      </nav>
    </div>
  </header>

  <main>
    <div class="container">

      <!-- Report Hero -->
      <div class="report-hero">
        <div class="report-breadcrumb">
          <a href="../index.html">Reports</a>
          <span>/</span>
          <span>{ticker}</span>
        </div>
        <div class="report-title-row">
          <div class="report-title-block">
            <div class="ticker-label">{ticker}</div>
            <h1>{company}</h1>
            <div class="report-meta-bar">
              <span class="rec-badge {rec_css_class}">{rec_note}</span>
              <span class="meta-item">{meta.get('date', '')}</span>
              <span class="meta-item">{price_fmt}</span>
            </div>
          </div>
          <div class="conviction-display" style="border-top: 3px solid {colour}">
            <div class="score" style="color: {colour}">{conv}</div>
            <div class="score-label">Conviction</div>
            <div class="score-sub">out of 100</div>
          </div>
        </div>
      </div>

      <!-- Report Body -->
      <div class="report-body">

        <!-- Content -->
        <div class="report-content">

          <!-- 1. Executive Summary -->
          <div class="report-section">
            <h2>Executive Summary</h2>
            <p>{(sections.get('executiveSummary') or {{}}).get('text', '')}</p>
          </div>

          <!-- 2. Business Model -->
          <div class="report-section">
            <h2>Business Model</h2>
            <p>{(sections.get('businessModel') or {{}}).get('text', '')}</p>
          </div>

          <!-- 3. Financial Snapshot -->
          <div class="report-section">
            <h2>Financial Snapshot</h2>
            {fin_table_html}
            <p style="margin-top:16px;">{(sections.get('financialSnapshot') or {{}}).get('text', '')}</p>
          </div>

          <!-- 4. Recent Catalysts -->
          <div class="report-section">
            <h2>Recent Catalysts</h2>
            <p>{(sections.get('recentCatalysts') or {{}}).get('text', '')}</p>
          </div>

          <!-- 5. Thesis Evaluation -->
          <div class="report-section">
            <h2>Thesis Evaluation</h2>
            <p>{thesis.get('text', '')}</p>
            {scenario_table_html}
          </div>

          <!-- 6. Key Risks -->
          <div class="report-section">
            <h2>Key Risks</h2>
            <p>{(sections.get('keyRisks') or {{}}).get('text', '')}</p>
            {risks_list_html}
          </div>

          <!-- 7. Who Should Own It / Avoid It -->
          <div class="report-section">
            <h2>Who Should Own It / Avoid It</h2>
            <p>{(sections.get('whoShouldOwn') or {{}}).get('text', '')}</p>
          </div>

          <!-- 8. Recommendation -->
          <div class="report-section">
            <h2>Recommendation</h2>
            <p>{(sections.get('recommendation') or {{}}).get('text', '')}</p>
          </div>

          <!-- 9. Entry / Exit Framework -->
          <div class="report-section">
            <h2>Entry / Exit Framework</h2>
            {markdown_to_html((sections.get('entryExit') or {}).get('text', ''))}
          </div>

          <!-- 10. Sources -->
          <div class="report-section">
            <h2>Sources</h2>
            <ul>
              <li><strong>Authoritative market data:</strong> {market_data}</li>
              <li><strong>Company filings and disclosures:</strong> {company_filings}</li>
              {src_additional_html}
            </ul>
            {lit_html}
          </div>

        </div><!-- /report-content -->

        <!-- Sidebar -->
        <aside class="report-sidebar">
          <div class="sidebar-card">
            <h3>Quick Stats</h3>
            {sidebar_stats_html}
          </div>
          {hist_card_html}
        </aside>

      </div><!-- /report-body -->
    </div><!-- /container -->
  </main>

  <footer>
    <div class="footer-inner">
      <p class="footer-disclaimer">
        Research is for informational purposes only. Not financial advice.
        All analysis reflects the date of publication. Always conduct your own due diligence.
      </p>
      <div class="footer-brand">DYOR <span>HQ</span></div>
    </div>
  </footer>
</body>
</html>'''

    return page


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Find JSON files
    if SINGLE:
        json_files = [DATA_DIR / f'{t}.json' for t in SINGLE]
        json_files = [f for f in json_files if f.exists()]
    else:
        json_files = list(DATA_DIR.glob('*.json'))

    if not json_files:
        print(f'No JSON files found in {DATA_DIR}')
        sys.exit(1)

    print(f'Building {len(json_files)} report(s) '
          f'{"(DRY RUN)" if DRY_RUN else "(writing)"}...\n')

    built = 0
    for json_path in sorted(json_files):
        ticker = json_path.stem
        output_path = OUTPUT_DIR / f'{ticker}-report.html'

        if DRY_RUN:
            print(f'  [WOULD BUILD] {output_path.name}')
            continue

        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            html = build_static_html(data)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(html)
            print(f'  ✓ {ticker} → {output_path.name}')
            built += 1
        except Exception as e:
            print(f'  ✗ {ticker}: {e}')

    print(f'\nBuilt {built}/{len(json_files)} reports')
    if not DRY_RUN:
        print(f'Output: {OUTPUT_DIR}')


if __name__ == '__main__':
    main()