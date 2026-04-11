#!/usr/bin/env python3
"""
DYOR HQ v2 — Report Normalisation Script
Ensures every report follows the canonical template structure exactly.
Runs in place — modifies reports/*.html directly.
No commit until validated.
"""

import os, re, json

REPORTS_DIR = os.path.dirname(os.path.abspath(__file__)) + '/../reports'

# Canonical section name map (variant → canonical)
SECTION_MAP = {
    'executive summary':                          'Executive Summary',
    'business model':                              'Business Model',
    'financial snapshot':                          'Financial Snapshot',
    'recent catalysts (3-6 months)':             'Recent Catalysts',
    'catalysts':                                   'Recent Catalysts',
    'thesis evaluation':                           'Thesis Evaluation',
    'bull / base / bear':                          'Thesis Evaluation',
    'scenario analysis':                           'Thesis Evaluation',
    'key risks (ranked)':                          'Key Risks',
    'risks':                                       'Key Risks',
    'who should own it / avoid it':               'Who Should Own It / Avoid It',
    'ownership guidance':                          'Who Should Own It / Avoid It',
    'entry / exit framework':                      'Entry / Exit Framework',
    'entry and exit':                              'Entry / Exit Framework',
    'price targets & risks':                       'Entry / Exit Framework',
}

# Canonical Sources HTML
SOURCES_HTML = """
          <div class="report-section">
            <h2>Sources</h2>
            <ul>
              <li><strong>Authoritative market data:</strong> Live quote data sourced via DYOR HQ data pipeline (Google Sheets + Yahoo Finance). Fields sourced this way include price, market capitalisation, 52-week range, P/E, EPS, and volume.</li>
              <li><strong>Company filings and disclosures:</strong> Public company filings, regulatory announcements, investor presentations, and RNS where referenced in the analysis.</li>
              <li><strong>Additional public sources:</strong> Any third-party materials specifically cited inline in the report body.</li>
            </ul>
          </div>
"""

# Placeholder detection
PLACEHOLDER_PATTERNS = [
    re.compile(r'<h2>Business Model</h2>\s*<p>\s*(?:Consumer Discretionary|Consumer Staples|sector company|investment case rests on|Key drivers include)'),
    re.compile(r'Consumer Discretionary sector company'),
    re.compile(r'sector company\.?\s*</p>'),
]


def detect_format(html):
    if 'class="report-hero"' in html:
        return 'A'
    if 'class="ticker-badge"' in html:
        return 'B'
    return 'C'


def normalise_headings(html):
    result = html
    for variant, canonical in SECTION_MAP.items():
        pattern = re.compile(rf'<h2>\s*{re.escape(variant)}\s*</h2>', re.IGNORECASE)
        result = pattern.sub(f'<h2>{canonical}</h2>', result)
    return result


def convert_format_b(html):
    """Convert Format B (card/ticker-badge) → Format A (report-section)."""
    result = html

    # Remove body wrapper if present
    result = re.sub(r'^<body>\s*', '', result, flags=re.MULTILINE)
    result = re.sub(r'\s*</body>\s*$', '', result, flags=re.MULTILINE)

    # Replace .header-block with real header
    result = re.sub(
        r'<div class="header">\s*<div class="header-inner">\s*<div>\s*'
        r'<div class="ticker-badge">(\w+)</div>\s*'
        r'<div class="company-name">([^<]+)</div>',
        r'''<header>
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
      <div class="report-hero">
        <div class="report-breadcrumb">
          <a href="../index.html">Reports</a>
          <span>/</span>
          <span>\1</span>
        </div>
        <div class="report-title-row">
          <div class="report-title-block">
            <div class="ticker-label">\1</div>
            <h1>\2</h1>''',
        result
    )

    # Replace .card-title sections → report-section + h2
    section_replacements = [
        (r'<div class="card">\s*<div class="card-title">Executive Summary</div>',
         '<div class="report-section"><h2>Executive Summary</h2>'),
        (r'<div class="card">\s*<div class="card-title">Business Model</div>',
         '<div class="report-section"><h2>Business Model</h2>'),
        (r'<div class="card">\s*<div class="card-title">Financial Snapshot</div>',
         '<div class="report-section"><h2>Financial Snapshot</h2>'),
        (r'<div class="card">\s*<div class="card-title">Recent Catalysts \(3-6 Months\)</div>',
         '<div class="report-section"><h2>Recent Catalysts</h2>'),
        (r'<div class="card">\s*<div class="card-title">Thesis Evaluation</div>',
         '<div class="report-section"><h2>Thesis Evaluation</h2>'),
        (r'<div class="card">\s*<div class="card-title">Key Risks \(Ranked\)</div>',
         '<div class="report-section"><h2>Key Risks</h2>'),
        (r'<div class="card">\s*<div class="card-title">Who Should Own It / Avoid It</div>',
         '<div class="report-section"><h2>Who Should Own It / Avoid It</h2>'),
        (r'<div class="card">\s*<div class="card-title">Recommendation</div>',
         '<div class="report-section"><h2>Recommendation</h2>'),
        (r'<div class="card">\s*<div class="card-title">Entry / Exit Framework</div>',
         '<div class="report-section"><h2>Entry / Exit Framework</h2>'),
    ]
    for pattern, replacement in section_replacements:
        result = re.sub(pattern, replacement, result)

    # Replace section-text → clear para
    result = result.replace('<p class="section-text">', '<p>')

    # Close card divs and wrap in report-section
    result = re.sub(r'</p>\s*</div>\s*<!-- /card -->', '</p></div>', result)
    result = re.sub(r'</div>\s*<!-- /card -->', '</div>', result)

    # Inject sidebar after report-content close, before main close
    result = re.sub(
        r'(</div>\s*</div>\s*</div>\s*)(?=</div>\s*</div>\s*</div>\s*<footer>)',
        r'''\1        <aside class="report-sidebar">
          <div class="sidebar-card">
            <h3>Quick Stats</h3>
            <div class="stat-row"><span>Ticker</span><span>TICKER_PLACEHOLDER</span></div>
          </div>
        </aside>
        ''',
        result
    )

    return result


def ensure_sources(html):
    """Ensure canonical Sources section is present."""
    if '<h2>Sources</h2>' in html:
        return html
    # Inject before the closing of report-content div
    return re.sub(
        r'(<div class="report-content">[\s\S]+?)(</div>\s*<aside)',
        r'\1' + SOURCES_HTML + r'\2',
        html
    )


def check_placeholder(html):
    for pattern in PLACEHOLDER_PATTERNS:
        if pattern.search(html):
            return True
    return False


def normalise_one(filepath, dry_run=True, verbose=False):
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        html = f.read()

    original = html
    fmt = detect_format(html)
    ticker = os.path.basename(filepath).split('-')[0].upper()

    changed = False

    # Step 1: normalise headings
    html = normalise_headings(html)
    if html != original: changed = True

    # Step 2: convert Format B
    if fmt == 'B':
        html = convert_format_b(html)
        if html != original: changed = True

    # Step 3: ensure Sources
    html = ensure_sources(html)
    if html != original: changed = True

    # Check placeholder
    has_placeholder = check_placeholder(html)

    if verbose or (not dry_run and changed):
        status = 'UPDATED' if changed else 'OK'
        placeholder_note = ' [PLACEHOLDER]' if has_placeholder else ''
        print(f'  [{status}] {os.path.basename(filepath)} (fmt {fmt}{placeholder_note})')

    if not dry_run and changed:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(html)

    return {'file': os.path.basename(filepath), 'fmt': fmt,
            'changed': changed, 'placeholder': has_placeholder}


def main():
    dry_run = '--dry-run' in __import__('sys').argv
    verbose = '--verbose' in __import__('sys').argv

    files = [f for f in os.listdir(REPORTS_DIR)
             if f.endswith('.html') and f != 'template.html']

    print(f'Processing {len(files)} reports '
          f'{"(DRY RUN)" if dry_run else "(WRITING)"}...\n')

    results = []
    for fn in sorted(files):
        results.append(normalise_one(os.path.join(REPORTS_DIR, fn), dry_run, verbose))

    updated   = sum(1 for r in results if r['changed'])
    unchanged = sum(1 for r in results if not r['changed'])
    placeholders = [r for r in results if r['placeholder']]

    print(f'\n── Summary ─────────────────────────────────────────')
    print(f'Total files:     {len(files)}')
    print(f'Updated:         {updated}')
    print(f'Unchanged:       {unchanged}')
    print(f'Placeholder:     {len(placeholders)} (need regen)')

    if placeholders:
        print(f'\n⚠  Reports needing regeneration:')
        for r in placeholders:
            print(f'   {r["file"]}')

    if not dry_run:
        print(f'\n✓  All changes written to disk.')
        print(f'   Review outputs before running: git diff reports/')


if __name__ == '__main__':
    main()