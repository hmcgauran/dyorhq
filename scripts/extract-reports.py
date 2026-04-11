#!/usr/bin/env python3
"""
DYOR HQ v2 — JSON Extraction Script
Parses existing HTML reports and converts them to canonical JSON following schema.json.

Usage:
  python3 scripts/extract-reports.py           # all reports
  python3 scripts/extract-reports.py AAPL MDLZ # specific tickers
  python3 scripts/extract-reports.py --dry-run  # show what would be extracted
"""

import os, re, json, sys
from pathlib import Path

SCRIPT_DIR  = Path(__file__).parent.resolve()
REPORTS_DIR = SCRIPT_DIR.parent / 'reports'
DATA_DIR    = REPORTS_DIR / 'data'
OUTPUT_DIR  = SCRIPT_DIR.parent / 'public' / 'reports'

DRY_RUN     = '--dry-run' in sys.argv
TICKERS     = [a.upper() for a in sys.argv[1:] if not a.startswith('-')]

DATA_DIR.mkdir(exist_ok=True)

# ── Colour/rec helpers ───────────────────────────────────────────────────────
REC_COLOURS = {
    'BUY': '#00ff88', 'HOLD': '#F59E0B',
    'REDUCE': '#FF8C00', 'SELL': '#EF4444'
}

def rec_band(rec):
    if not rec: return 'HOLD'
    return rec.split('—')[0].strip().upper()

def rec_colour(rec):
    return REC_COLOURS.get(rec_band(rec), '#F59E0B')

def rec_class(rec):
    band = rec_band(rec)
    return {'BUY': 'rec-buy', 'HOLD': 'rec-hold', 'REDUCE': 'rec-reduce', 'SELL': 'rec-sell'}.get(band, 'rec-hold')

# ── HTML parsing helpers ──────────────────────────────────────────────────────
def extract_meta(html):
    """Extract report metadata from the hero block."""
    ticker    = re.search(r'class="ticker-label">([^<]+)<', html)
    company   = re.search(r'<h1>([^<]+)</h1>', html)
    rec_badge = re.search(r'class="rec-badge[^"]*">([^<]+)<', html)
    date_meta = re.search(r'<span class="meta-item">(\d+?\s\w+\s\d{4})<', html)
    price     = re.search(r'<span class="meta-item">(\$[\d.,]+)<', html)
    conviction = re.search(r'class="conviction-display[^"]*">\s*<div[^>]+>\s*<div[^>]+>\s*<div[^>]+>(\d+)', html, re.DOTALL)

    ticker_s   = ticker.group(1).strip() if ticker else ''
    company_s  = company.group(1).strip() if company else ''
    rec_s      = rec_badge.group(1).strip() if rec_badge else 'HOLD'
    date_s     = date_meta.group(1).strip() if date_meta else ''
    price_s    = price.group(1).strip() if price else ''
    conv_s     = conviction.group(1).strip() if conviction else '50'

    # Extract ISIN and exchange from meta tags
    isin     = re.search(r'<meta name="isin" content="([^"]+)"', html)
    exchange = re.search(r'<meta name="exchange_code" content="([^"]+)"', html)
    isin_s   = isin.group(1) if isin else ''
    exchange_s = exchange.group(1) if exchange else ''

    # Extract date from filename
    date_match = re.search(r'\d{4}-\d{2}-\d{2}', html)
    date_published = date_match.group(0) if date_match else ''

    return {
        'ticker': ticker_s,
        'company': company_s,
        'exchange': exchange_s,
        'isin': isin_s,
        'date': date_s,
        'datePublished': date_published,
        'recommendation': rec_s,
        'recommendationNote': rec_s,
        'conviction': int(conv_s) if conv_s.isdigit() else 50,
    }

def extract_price(html, meta):
    """Extract price data from financial snapshot table."""
    price = {}
    table = re.search(r'<table class="data-table">(.*?)</table>', html, re.DOTALL)
    if table:
        rows = re.findall(r'<tr>\s*<td>([^<]+)</td>\s*<td>([^<]+)</td>', table.group(1))
        for label, value in rows:
            label = label.strip()
            value = value.strip().replace('$', '').replace('£', '').replace('€', '')
            if 'Current Price' in label:
                try: price['current'] = float(re.sub(r'[,$\s]', '', value))
                except: pass
            elif 'Market Cap' in label or 'Capitalisation' in label:
                # Parse $3.82 trillion etc
                m = re.search(r'\$?([\d.]+)\s*([TtMmBb])', value, re.I)
                if m:
                    num = float(m.group(1))
                    mult = {'T': 1e12, 'B': 1e9, 'M': 1e6, 't': 1e12, 'b': 1e9, 'm': 1e6}.get(m.group(2), 1)
                    price['marketCap'] = num * mult
                    price['marketCapFormatted'] = f'${num*mult/1e12:.2f}T' if mult >= 1e12 else f'${num*mult/1e9:.2f}B'
            elif 'P/E' in label:
                m = re.search(r'([\d.]+)', value)
                if m: price['trailingPE'] = float(m.group(1))
            elif 'EPS' in label:
                m = re.search(r'([\d.]+)', value)
                if m: price['trailingEps'] = float(m.group(1))
            elif '52-Week High' in label:
                m = re.search(r'([\d.]+)', value)
                if m: price['fiftyTwoWeekHigh'] = float(m.group(1))
            elif '52-Week Low' in label:
                m = re.search(r'([\d.]+)', value)
                if m: price['fiftyTwoWeekLow'] = float(m.group(1))
    price['formatted'] = meta.get('price_formatted', '')
    return price

def extract_section(html, heading, include_heading=False):
    """Extract section content by heading. Returns text content between heading and next h2."""
    pattern = rf'<div class="report-section">\s*<h2>{re.escape(heading)}</h2>\s*(.*?)(?=<div class="report-section">\s*<h2>|</div>\s*</div>\s*<aside|<footer)'
    match = re.search(pattern, html, re.DOTALL)
    if not match:
        # Try simpler pattern
        pattern2 = rf'<h2>{re.escape(heading)}</h2>\s*(.*?)(?=<h2>)'
        match = re.search(pattern2, html, re.DOTALL)
    if not match:
        return ''
    content = match.group(1).strip()
    # Remove HTML tags but preserve structure
    return content

def extract_table_rows(section_html):
    """Extract table rows as {label, value, note} objects."""
    rows = []
    table = re.search(r'<table[^>]*>(.*?)</table>', section_html, re.DOTALL)
    if table:
        for row_match in re.finditer(r'<tr>\s*<td>([^<]+)</td>\s*<td>([^<]+)</td>\s*(?:</tr>|<tr>)', table.group(1)):
            label = row_match.group(1).strip()
            value = row_match.group(2).strip()
            rows.append({'label': label, 'value': value})
    return rows

def extract_risks(section_html):
    """Extract ordered risk items from a list/ol."""
    risks = []
    for i, li_match in enumerate(re.finditer(r'<li>(.*?)</li>', section_html, re.DOTALL), 1):
        text = re.sub(r'<[^>]+>', '', li_match.group(1)).strip()
        if text:
            risks.append({'rank': i, 'risk': text})
    return risks

def extract_sources(section_html):
    """Extract three-tier sources from the Sources section."""
    market_data = 'Live quote data sourced via DYOR HQ data pipeline (Google Sheets + Yahoo Finance). Fields include price, market capitalisation, 52-week range, P/E, EPS, and volume.'
    company_filings = 'Public company filings, regulatory announcements, investor presentations, and RNS where referenced in the analysis.'
    additional = []

    # Look for specific source items
    for li in re.findall(r'<li>(.*?)</li>', section_html, re.DOTALL):
        clean = re.sub(r'<[^>]+>', '', li).strip()
        if clean:
            additional.append(clean)

    return {
        'marketData': market_data,
        'companyFilings': company_filings,
        'additional': additional,
        'literature': []
    }

def extract_thesis(html):
    """Extract bull/base/bear scenarios from Thesis Evaluation section."""
    thesis_text = ''
    scenarios = {}
    section = extract_section(html, 'Thesis Evaluation')
    if not section:
        return {'text': '', 'bull': {}, 'base': {}, 'bear': {}}

    # Split by scenario
    bull_m = re.search(r'[Bb]ull[\s:-]+(?:scenario|case)?.*?(?=(?:[Bb]ase|[Bb]ear)|$)', section, re.DOTALL)
    base_m = re.search(r'[Bb]ase[\s:-]+(?:scenario|case)?.*?(?=[Bb]ear|$)', section, re.DOTALL)
    bear_m = re.search(r'[Bb]ear[\s:-]+(?:scenario|case)?.*?(?=</p>|</div>)', section, re.DOTALL)

    def clean_text(t):
        if not t: return ''
        return re.sub(r'<[^>]+>', '', t).strip()

    def extract_weight(t):
        m = re.search(r'(\d+)\s*%', t)
        return int(m.group(1)) if m else None

    return {
        'text': clean_text(section),
        'bull': {'scenario': clean_text(bull_m.group(0)) if bull_m else '', 'probability': extract_weight(bull_m.group(0)) if bull_m else 25},
        'base': {'scenario': clean_text(base_m.group(0)) if base_m else '', 'probability': extract_weight(base_m.group(0)) if base_m else 50},
        'bear': {'scenario': clean_text(bear_m.group(0)) if bear_m else '', 'probability': extract_weight(bear_m.group(0)) if bear_m else 25},
    }

# ── Find all HTML report files ────────────────────────────────────────────────
def find_report_files():
    """Find all HTML report files in reports/."""
    files = []
    for fn in sorted(os.listdir(REPORTS_DIR)):
        if not fn.endswith('.html') or fn == 'template.html':
            continue
        ticker = fn.split('-')[0].upper()
        # Normalise ticker (strip exchange suffix)
        ticker = re.sub(r'\.(L|LSE|ISE|PA|TO|NYSE|NASDAQ|OQ)$', '', ticker)
        if TICKERS and ticker not in TICKERS:
            continue
        files.append((ticker, fn))
    return files

# ── Main extraction ───────────────────────────────────────────────────────────
def extract_one(ticker, filename):
    """Extract all data from a single HTML report."""
    filepath = REPORTS_DIR / filename
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        html = f.read()

    # ── Meta ──
    meta = extract_meta(html)
    meta['lastRefreshed'] = '2026-04-11T10:00:00Z'
    meta['universes'] = ['watchlist']  # default, will be enriched

    # Detect universes from content or filename
    universes = detect_universes(meta['ticker'], filename, html)
    meta['universes'] = universes

    # ── Price ──
    price = extract_price(html, meta)

    # ── Sections ──
    sections = {}

    # Executive Summary
    es_text = extract_section(html, 'Executive Summary')
    sections['executiveSummary'] = {'text': re.sub(r'<[^>]+>', '', es_text).strip()[:500]}

    # Business Model
    bm_text = extract_section(html, 'Business Model')
    sections['businessModel'] = {'text': re.sub(r'<[^>]+>', '', bm_text).strip()}

    # Financial Snapshot
    fin_text = extract_section(html, 'Financial Snapshot')
    fin_table = extract_table_rows(fin_text)
    sections['financialSnapshot'] = {
        'text': re.sub(r'<table[^>]*>.*?</table>', '', fin_text, flags=re.DOTALL).strip(),
        'table': fin_table
    }

    # Recent Catalysts
    cat_text = extract_section(html, 'Recent Catalysts')
    # If it's a list, extract items
    cat_items = re.findall(r'<li>(.*?)</li>', cat_text, re.DOTALL)
    if cat_items:
        cat_clean = [re.sub(r'<[^>]+>', '', i).strip() for i in cat_items if re.sub(r'<[^>]+>', '', i).strip()]
        sections['recentCatalysts'] = {'text': re.sub(r'<[^>]+>', '', cat_text).strip(), 'items': cat_clean}
    else:
        sections['recentCatalysts'] = {'text': re.sub(r'<[^>]+>', '', cat_text).strip()}

    # Thesis Evaluation
    sections['thesisEvaluation'] = extract_thesis(html)

    # Key Risks
    kr_text = extract_section(html, 'Key Risks')
    kr_risks = extract_risks(kr_text)
    sections['keyRisks'] = {
        'text': '',
        'risks': kr_risks
    }

    # Who Should Own It / Avoid It
    wso_text = extract_section(html, 'Who Should Own It')
    sections['whoShouldOwn'] = {'text': re.sub(r'<[^>]+>', '', wso_text).strip()}

    # Recommendation
    rec_text = extract_section(html, 'Recommendation')
    sections['recommendation'] = {'text': re.sub(r'<[^>]+>', '', rec_text).strip()}

    # Entry / Exit Framework
    ee_text = extract_section(html, 'Entry / Exit Framework') or extract_section(html, 'Entry and Exit')
    sections['entryExit'] = {'text': re.sub(r'<[^>]+>', '', ee_text).strip()}

    # Sources
    src_text = extract_section(html, 'Sources')
    sections['sources'] = extract_sources(src_text)

    # ── Scores ──
    scores = {
        'current': {
            'score': meta.get('conviction', 50),
            'band': rec_band(meta.get('recommendation', 'HOLD')),
            'date': meta.get('datePublished', ''),
            'delta': '0',
            'reason': 'Initial coverage'
        },
        'history': [{
            'date': meta.get('datePublished', ''),
            'score': meta.get('conviction', 50),
            'band': rec_band(meta.get('recommendation', 'HOLD')),
            'delta': '0',
            'reason': 'Initial coverage'
        }]
    }

    return {
        'meta': meta,
        'price': price,
        'sections': sections,
        'scores': scores
    }


def detect_universes(ticker, filename, html):
    """Detect which universe(s) a report belongs to."""
    universes = ['watchlist']

    # LSE tickers
    lse_tickers = {'AVCT', 'ALK', 'PXEN', 'MKA', 'BIRG', 'KYGA', 'TOM', 'ZPHR', 'PALM',
                   'GLEN', 'DGE', 'C4X', 'QED', 'GGP', 'SPIR', 'CAD', 'DESP'}
    if ticker in lse_tickers or '.L' in ticker or 'LN' in filename:
        universes.append('irish')
    if ticker in {'AVCT', 'ALK', 'PXEN', 'MKA', 'BIRG', 'KYGA', 'TOM', 'ZPHR', 'PALM',
                  'GGP', 'SPIR', 'DESP', 'C4X', 'QED'}:
        universes.append('uk')

    # S&P 100 / Fortune 100
    sp100 = {'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'AMD', 'INTC', 'NFLX',
             'TSLA', 'MCD', 'V', 'JPM', 'JNJ', 'UNH', 'HD', 'PG', 'MA', 'CRM', 'ABT',
             'AVGO', 'COST', 'PEP', 'CSCO', 'ACN', 'TMO', 'MRK', 'ABBV', 'KO', 'WMT',
             'AVB', 'BAC', 'CVX', 'XOM', 'COP', 'LLY', 'PFE', 'T', 'VZ', 'PM', 'NEE',
             'DUK', 'SO', 'AMT', 'SPGI', 'MDT', 'HON', 'UPS', 'RTX', 'LOW', 'QCOM',
             'IBM', 'GE', 'CAT', 'RTX', 'BA', 'SBUX', 'INTU', 'AMGN', 'GS', 'BLK'}
    if ticker in sp100:
        universes.append('sp100')
        if ticker in sp100:
            universes.append('fortune100')

    return list(set(universes))


def main():
    files = find_report_files()
    if not files:
        print('No report files found')
        return

    print(f'Extracting {len(files)} report(s) '
          f'{"(DRY RUN)" if DRY_RUN else "(writing JSON)"}...\n')

    extracted = 0
    errors = 0

    for ticker, filename in files:
        try:
            data = extract_one(ticker, filename)

            if DRY_RUN:
                print(f'  [WOULD EXTRACT] {ticker} ({filename})')
                print(f'    conviction={data["meta"]["conviction"]} rec={data["meta"]["recommendation"]}')
                print(f'    universes={data["meta"]["universes"]}')
                continue

            out_path = DATA_DIR / f'{ticker}.json'
            with open(out_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

            print(f'  ✓ {ticker} → {out_path.name}')
            extracted += 1

        except Exception as e:
            print(f'  ✗ {ticker} ({filename}): {e}')
            errors += 1

    print(f'\nExtracted: {extracted}/{len(files)}')
    if errors:
        print(f'Errors: {errors}')
    if not DRY_RUN:
        print(f'JSON files: {DATA_DIR}')
        print(f'\nNext: python3 scripts/build-reports.py  (pre-render static HTML)')


if __name__ == '__main__':
    main()