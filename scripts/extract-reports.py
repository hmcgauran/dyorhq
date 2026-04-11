#!/usr/bin/env python3
"""
DYOR HQ v2 — JSON Extraction Script
Parses existing HTML reports and converts them to canonical JSON following schema.json.

Handles four HTML formats:
  1. report-section format   (majority): <div class="report-section"><h2>SECTION</h2><p>text</p>
  2. card-title format        (29 files): <div class="card"><div class="card-title">SECTION</div><div class="card-body"><p>text</p>
  3. table-format           (AIG etc):  <div class="section"><h2>SECTION</h2><table>...
  4. owner-grid format        (9 files):  <div class="owner-grid"><div class="owner-card owner-in">

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

def _strip_tags(text):
    """Remove all HTML tags, collapse whitespace, strip. British English only."""
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def _detect_format(html):
    """Detect which of the four HTML formats this report uses."""
    if 'class="card-title"' in html:
        return 'card-title'
    if 'class="report-section"' in html:
        return 'report-section'
    if '<table' in html and 'class="risk-row"' in html:
        return 'table-format'
    return 'report-section'


def _find_section_block(html, heading, fmt):
    """
    Find the inner HTML block for a named section, handling all format variants.
    Returns raw HTML string of the section body, or '' if not found.
    """
    # Strip optional leading "N. " from heading (CI, WMT etc. use numbered headings)
    h_stripped = re.sub(r'^\d+\.\s+', '', heading)
    heading_re = re.escape(h_stripped)
    # Also try matching with optional number prefix directly in the h2 pattern

    # ── report-section format ──────────────────────────────────────────────────
    if fmt == 'report-section':
        # <div class="report-section"><h2>HEADING</h2>...content...
        p1 = rf'<div class="report-section">\s*<h2[^>]*>\s*{heading_re}\s*</h2>\s*(.*?)(?=<div class="report-section">\s*<h2|<div [^>]*>\s*<aside|</div>\s*</div>\s*<footer|<footer)'
        m = re.search(p1, html, re.DOTALL)
        if m: return m.group(1)

        # Try with leading number prefix (handles "6. Key Risks" vs "Key Risks")
        p1n = rf'<div class="report-section">\s*<h2[^>]*>\s*\d+\.\s*{heading_re}\s*</h2>\s*(.*?)(?=<div class="report-section">\s*<h2|<div [^>]*>\s*<aside|</div>\s*</div>\s*<footer|<footer)'
        m = re.search(p1n, html, re.DOTALL)
        if m: return m.group(1)

        # <section class="report-section"><h2>HEADING</h2>...content...
        p2 = rf'<section[^>]*class="report-section"[^>]*>\s*<h2[^>]*>\s*{heading_re}\s*</h2>\s*(.*?)(?=<section|</div>\s*</div>\s*</main|<footer)'
        m = re.search(p2, html, re.DOTALL)
        if m: return m.group(1)

        # bare <h2>HEADING</h2>...content...
        p3 = rf'<h2[^>]*>\s*{heading_re}\s*</h2>\s*(.*?)(?=<h2)'
        m = re.search(p3, html, re.DOTALL)
        if m: return m.group(1)

        # bare <h2> with number prefix
        p3n = rf'<h2[^>]*>\s*\d+\.\s*{heading_re}\s*</h2>\s*(.*?)(?=<h2)'
        m = re.search(p3n, html, re.DOTALL)
        if m: return m.group(1)

    # ── card-title format ─────────────────────────────────────────────────────
    elif fmt == 'card-title':
        # <div class="card"><div class="card-title">HEADING</div><div class="card-body">content</div></div>
        p1 = rf'<div class="card"[^>]*>\s*<div class="card-title"[^>]*>\s*{heading_re}\s*</div>\s*<div class="card-body"[^>]*>(.*?)</div>\s*</div>'
        m = re.search(p1, html, re.DOTALL)
        if m: return m.group(1)

        # <div class="card"><div class="card-title">HEADING</div>content (no card-body, NFLX style)
        p2 = rf'<div class="card"[^>]*>\s*<div class="card-title"[^>]*>\s*{heading_re}\s*</div>\s*(.*?)(?=\s*<div class="card"[\s>]|</div>\s*</div>\s*<footer|<footer)'
        m = re.search(p2, html, re.DOTALL)
        if m: return m.group(1)

        # bare <div class="card-title">HEADING</div>content (no outer card wrapper)
        p3 = rf'<div class="card-title"[^>]*>\s*{heading_re}\s*</div>\s*(.*?)(?=<div class="card-title"|</div>\s*</div>\s*<footer)'
        m = re.search(p3, html, re.DOTALL)
        if m: return m.group(1)

    # ── table-format (AIG, GE, CI, WMT etc.) ──────────────────────────────────
    elif fmt == 'table-format':
        # <div class="section"><h2>HEADING</h2>...content...
        p1 = rf'<div class="section">\s*<h2[^>]*>\s*{heading_re}\s*</h2>\s*(.*?)(?=<div class="section">|</div>\s*</div>\s*<footer|<footer)'
        m = re.search(p1, html, re.DOTALL)
        if m: return m.group(1)

        # Try with number prefix
        p1n = rf'<div class="section">\s*<h2[^>]*>\s*\d+\.\s*{heading_re}\s*</h2>\s*(.*?)(?=<div class="section">|</div>\s*</div>\s*<footer|<footer)'
        m = re.search(p1n, html, re.DOTALL)
        if m: return m.group(1)

        # bare <h2>HEADING</h2>...content...
        p2 = rf'<h2[^>]*>\s*{heading_re}\s*</h2>\s*(.*?)(?=<h2)'
        m = re.search(p2, html, re.DOTALL)
        if m: return m.group(1)

        # bare <h2> with number prefix
        p2n = rf'<h2[^>]*>\s*\d+\.\s*{heading_re}\s*</h2>\s*(.*?)(?=<h2)'
        m = re.search(p2n, html, re.DOTALL)
        if m: return m.group(1)

    return ''


def extract_meta(html):
    """Extract report metadata from the hero block."""
    # Ticker: try ticker-label first, then <h1>
    ticker    = re.search(r'class="ticker-label">([^<]+)<', html)
    if not ticker:
        ticker = re.search(r'<h1[^>]*>([^<]+)</h1>', html)
    company   = re.search(r'<h1>([^<]+)</h1>', html)
    # Recommendation: try rec-badge first, then <div class="badge">
    rec_badge = re.search(r'class="rec-badge[^"]*">([^<]+)<', html)
    if not rec_badge:
        rec_badge = re.search(r'<div class="badge"[^>]*>([^<]+)<', html)
    date_meta = re.search(r'<span class="meta-item">(\d+?\s\w+\s\d{4})<', html)
    price     = re.search(r'<span class="meta-item">(\$[\d.,]+)<', html)

    # Conviction: six possible HTML patterns (authoritative-first ordering):
    #   1. Recommendation text: Conviction Score: <strong>NN</strong>  (authoritative; 15 Fortune-100 reports)
    #   2. conviction-display → score div          (GE, NFLX, AIG, COF, DE)
    #   3. conviction-display → conviction-value div  (subagent format)
    #   4. score-card total → val + Conviction lbl   (PEP, JNJ, MA)
    #   5. <div class="score">N/100</div>            (WMT format)
    #   6. Fallback: width bar percentage            (last resort)
    # Try text-based conviction score FIRST (pattern 1) — it is more authoritative than the display box.
    conviction = re.search(r'Conviction Score:\s*<strong[^>]*>(\d+)', html)
    if not conviction:
        conviction = re.search(r'class="conviction-display"[^>]*>.*?<div[^>]*class="score"[^>]*>\s*(\d+)', html, re.DOTALL)
    if not conviction:
        conviction = re.search(r'class="conviction-display"[^>]*>.*?<div[^>]*class="conviction-value"[^>]*>\s*(\d+)', html, re.DOTALL)
    if not conviction:
        conviction = re.search(r'<div class="score-card total"[^>]*>.*?<div class="val">(\d+)</div>.*?<div class="lbl">Conviction</div>', html, re.DOTALL)
    if not conviction:
        conviction = re.search(r'<div class="score">(\d+)/100</div>', html)
    if not conviction:
        conviction = re.search(r'width:\s*(\d+)%', html)

    ticker_s   = ticker.group(1).strip() if ticker else ''
    company_s  = company.group(1).strip() if company else ''
    rec_s      = rec_badge.group(1).strip() if rec_badge else 'HOLD'
    date_s     = date_meta.group(1).strip() if date_meta else ''
    price_s    = price.group(1).strip() if price else ''
    conv_s     = conviction.group(1).strip() if conviction else '50'

    isin       = re.search(r'<meta name="isin" content="([^"]+)"', html)
    exchange   = re.search(r'<meta name="exchange_code" content="([^"]+)"', html)
    isin_s     = isin.group(1) if isin else ''
    exchange_s = exchange.group(1) if exchange else ''

    date_match     = re.search(r'\d{4}-\d{2}-\d{2}', html)
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
                try: price['current'] = float(re.sub(r'[,$s]', '', value))
                except: pass
            elif 'Market Cap' in label or 'Capitalisation' in label:
                m = re.search(r'\$?([\d.]+)\s*([TtMmBb])', value, re.I)
                if m:
                    num  = float(m.group(1))
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


def extract_table_rows(section_html):
    """Extract table rows as {label, value} objects."""
    rows = []
    table = re.search(r'<table[^>]*>(.*?)</table>', section_html, re.DOTALL)
    if table:
        for row_m in re.finditer(r'<tr>\s*<td>([^<]+)</td>\s*<td>([^<]+)</td>', table.group(1)):
            label = row_m.group(1).strip()
            value = row_m.group(2).strip()
            rows.append({'label': label, 'value': value})
    return rows


def extract_risks(section_html, full_html=None):
    """
    Extract ordered risk items from a section block.
    Handles:
      - <table> with <tr class="risk-row">  (AIG)
      - <ol>/<ul> with <li class="risk-item">  (KGSPY)
      - bare <div class="risk-item">  (GE, XOM, NFLX, MDT, FOBK)
      - plain <ol>/<ul> with <li>
      - flat <li class="risk-item"> anywhere
    """
    risks = []

    # ── Format 1: table with risk-row TRs ────────────────────────────────────
    # AIG and similar: <table...> has <tr class="risk-row">
    if '<tr' in section_html and 'risk-row' in section_html:
        for t_match in re.finditer(r'<table[^>]*>(.*?)</table>', section_html, re.DOTALL):
            rows = re.findall(r'<tr[^>]*class="[^"]*risk[^"]*"[^>]*>(.*?)</tr>', t_match.group(1), re.DOTALL)
            if rows:
                for row_m in rows:
                    cells = re.findall(r'<td[^>]*>(.*?)</td>', row_m, re.DOTALL)
                    if len(cells) >= 2:
                        rank = cells[0].strip()
                        try:
                            rank_num = int(re.search(r'\d+', rank).group())
                        except:
                            rank_num = len(risks) + 1
                        title = _strip_tags(cells[1]).strip()
                        desc  = _strip_tags(cells[2]).strip() if len(cells) > 2 else ''
                        risk_text = title if not desc else f'{title} — {desc}'
                        if risk_text:
                            risks.append({'rank': rank_num, 'risk': risk_text})
                if risks:
                    return risks

    # ── Format 2: table with explicit risk-table class ───────────────────────
    risk_table = re.search(r'<table[^>]*class="[^"]*risk[^"]*"[^>]*>(.*?)</table>', section_html, re.DOTALL)
    if risk_table:
        for row_m in re.finditer(r'<tr[^>]*class="[^"]*risk[^"]*"[^>]*>(.*?)</tr>', risk_table.group(1), re.DOTALL):
            cells = re.findall(r'<td[^>]*>(.*?)</td>', row_m.group(1), re.DOTALL)
            if len(cells) >= 2:
                rank = cells[0].strip()
                try:
                    rank_num = int(re.search(r'\d+', rank).group())
                except:
                    rank_num = len(risks) + 1
                title = _strip_tags(cells[1]).strip()
                desc  = _strip_tags(cells[2]).strip() if len(cells) > 2 else ''
                risk_text = title if not desc else f'{title} — {desc}'
                if risk_text:
                    risks.append({'rank': rank_num, 'risk': risk_text})
        if risks:
            return risks

    # ── Format 3: flat <li class="risk-item"> anywhere (check BEFORE ol-based search; FOBK has nested/malformed ol) ──
    for i, li_m in enumerate(re.finditer(r'<li[^>]*class="risk-item"[^>]*>(.*?)</li>', section_html, re.DOTALL), 1):
        raw  = li_m.group(1)
        text = _strip_tags(raw).strip()
        if text:
            risks.append({'rank': i, 'risk': text})
    if risks:
        return risks

    # ── Format 4: <ol> with <li class="risk-item">  (KGSPY) ─────────────────
    list_m = re.search(r'<ol[^>]*>(.*?)</ol>', section_html, re.DOTALL)
    if list_m:
        li_items = re.findall(r'<li[^>]*class="risk-item"[^>]*>(.*?)</li>', list_m.group(1), re.DOTALL)
        for i, raw in enumerate(li_items, 1):
            text = _strip_tags(raw).strip()
            if text:
                risks.append({'rank': i, 'risk': text})
        if risks:
            return risks

    # ── Format 5: plain <ol> or <ul> with <li> ──────────────────────────────
    if not list_m:
        list_m = re.search(r'<ul[^>]*>(.*?)</ul>', section_html, re.DOTALL)
    if list_m:
        for i, li_m in enumerate(re.finditer(r'<li[^>]*>(.*?)</li>', list_m.group(1), re.DOTALL), 1):
            raw  = li_m.group(1)
            text = _strip_tags(raw).strip()
            if text:
                risks.append({'rank': i, 'risk': text})
        if risks:
            return risks

    # ── Format 6: bare <div class="risk-item"> (GE, XOM, NFLX, MDT, FOBK, ...) ──
    # Simple non-greedy match — each risk-item div is self-contained
    risk_divs = re.findall(r'<div class="risk-item"[^>]*>(.*?)</div>', section_html, re.DOTALL)
    if risk_divs:
        for i, raw in enumerate(risk_divs, 1):
            rank_m   = re.search(r'<span class="risk-rank"[^>]*>(.*?)</span>', raw, re.DOTALL)
            text_m   = re.search(r'<span class="risk-text"[^>]*>(.*?)</span>', raw, re.DOTALL)
            # Also check nested div.risk-text (NFLX style)
            if not text_m:
                text_m = re.search(r'<div class="risk-text"[^>]*>(.*?)</div>', raw, re.DOTALL)
            rank_num = int(re.search(r'\d+', _strip_tags(rank_m.group(1))).group()) if rank_m else i
            text     = _strip_tags(text_m.group(1)) if text_m else _strip_tags(raw)
            if text:
                risks.append({'rank': rank_num, 'risk': text})
        if risks:
            return risks

    # ── Format 7: flat <li> items not in ol/ul ────────────────────────────────
    for i, li_m in enumerate(re.finditer(r'<li[^>]*>(.*?)</li>', section_html, re.DOTALL), 1):
        raw  = li_m.group(1)
        text = _strip_tags(raw).strip()
        if text:
            risks.append({'rank': i, 'risk': text})
    if risks:
        return risks

    # ── Fallback: scan full HTML if section block yielded nothing useful ───────
    if full_html and section_html != full_html:
        return extract_risks(full_html, None)

    return risks


def extract_who_should_own(html, fmt):
    """
    Extract Who Should Own It / Avoid It text.
    Handles report-section, card-title, table-format, and owner-grid.
    """
    block = _find_section_block(html, 'Who Should Own It', fmt)
    if not block:
        block = _find_section_block(html, 'Who Should Own It / Avoid It', fmt)

    # owner-grid format (9 files)
    grid = re.search(r'<div class="owner-grid"[^>]*>(.*?)</div>\s*</div>', block or html, re.DOTALL)
    if grid:
        parts = []
        for card in re.finditer(r'<div class="owner-card (owner-in|owner-out)"[^>]*>.*?<h3[^>]*>([^<]+)</h3>.*?<ul>(.*?)</ul>', grid.group(1), re.DOTALL):
            label = card.group(2).strip()
            items = re.findall(r'<li>(.*?)</li>', card.group(3), re.DOTALL)
            item_texts = [_strip_tags(it).strip() for it in items if _strip_tags(it).strip()]
            if item_texts:
                parts.append(f'{label}:\n' + '\n'.join(f'• {t}' for t in item_texts))
        if parts:
            return '\n\n'.join(parts)

    if block:
        # AIG-style: owner-item / avoid-item divs
        owner_items = re.findall(r'<div class="owner-item"[^>]*>(.*?)</div>', block, re.DOTALL)
        avoid_items = re.findall(r'<div class="avoid-item"[^>]*>(.*?)</div>', block, re.DOTALL)
        if owner_items or avoid_items:
            parts = []
            if owner_items:
                texts = [_strip_tags(it).strip() for it in owner_items if _strip_tags(it).strip()]
                parts.append('Own:\n' + '\n'.join(f'• {t}' for t in texts))
            if avoid_items:
                texts = [_strip_tags(it).strip() for it in avoid_items if _strip_tags(it).strip()]
                parts.append('Avoid:\n' + '\n'.join(f'• {t}' for t in texts))
            return '\n\n'.join(parts)

        # CI/WMT style: <strong>Ideal for:</strong> and <strong>Avoid if:</strong>
        ideal_m = re.search(r'<strong[^>]*>Ideal for\s*:?</strong>\s*(.*?)(?=<strong|<p>|<div)', block, re.DOTALL | re.IGNORECASE)
        avoid_m = re.search(r'<strong[^>]*>Avoid if\s*:?</strong>\s*(.*?)(?=<strong|<p>|<div)', block, re.DOTALL | re.IGNORECASE)
        parts = []
        if ideal_m:
            parts.append('Own: ' + _strip_tags(ideal_m.group(1)).strip())
        if avoid_m:
            parts.append('Avoid: ' + _strip_tags(avoid_m.group(1)).strip())
        if parts:
            return ' | '.join(parts)

        # report-section / card-title: <strong>Own:</strong> and <strong>Avoid:</strong> tags
        own_m   = re.search(r'<strong[^>]*>Own(?:ers)?\s*:?</strong>\s*([^<]+)', block, re.DOTALL | re.IGNORECASE)
        avoid_m = re.search(r'<strong[^>]*>Avoid\s*:?</strong>\s*([^<]+)', block, re.DOTALL | re.IGNORECASE)

        parts = []
        if own_m:
            parts.append('Own: ' + _strip_tags(own_m.group(1)).strip())
        if avoid_m:
            parts.append('Avoid: ' + _strip_tags(avoid_m.group(1)).strip())

        if parts:
            return ' '.join(parts)

        return _strip_tags(block)

    return ''


def extract_entry_exit(html, fmt):
    """
    Extract Entry / Exit Framework text.
    Tries in order:
      1. Section block under heading 'Entry / Exit Framework' or 'Entry and Exit'
      2. <div class="entry-framework"> in card-title reports
      3. <div class="rec-box"> entry-framework text (KGSPY style: <strong>Entry Framework:</strong> ...)
      4. <table class="ef-table"> with ef-label / ef-value cells
      5. <p><strong>Entry framework:</strong> ... and <p><strong>Stop-loss:</strong> ...
         inside the Recommendation section (T-2026-04-11 and similar reports)
    """
    # Try section headings first
    block = _find_section_block(html, 'Entry / Exit Framework', fmt)
    if not block:
        block = _find_section_block(html, 'Entry and Exit', fmt)

    if block:
        text = _strip_tags(block).strip()
        if text:
            return text

    # Try entry-framework div (card-title format, embedded in Recommendation)
    ef_div = re.search(r'<div class="entry-framework"[^>]*>(.*?)</div>\s*</div>', html, re.DOTALL)
    if ef_div:
        return _strip_tags(ef_div.group(1)).strip()

    # Try rec-box for entry framework text: <strong>Entry Framework:</strong> ...
    rec_box = re.search(r'<div class="rec-box"[^>]*>(.*?)</div>\s*</div>', html, re.DOTALL)
    if rec_box:
        box_content = rec_box.group(1)
        ef_strong = re.search(r'<strong[^>]*>Entry\s*Framework\s*:</strong>\s*(.*?)(?=<strong|</div>\s*</div>)', box_content, re.DOTALL | re.IGNORECASE)
        if ef_strong:
            return _strip_tags(ef_strong.group(1)).strip()
        # Also try entry-tags (the BUY/HOLD/REDUCE tags)
        entry_tags = re.findall(r'<span class="entry-tag[^"]*"[^>]*>(.*?)</span>', box_content, re.DOTALL)
        if entry_tags:
            entry_texts = [_strip_tags(t).strip() for t in entry_tags if _strip_tags(t).strip()]
            if entry_texts:
                return ' | '.join(entry_texts)

    # Try ef-table
    ef_table = re.search(r'<table class="ef-table"[^>]*>(.*?)</table>', html, re.DOTALL)
    if ef_table:
        rows = re.findall(r'<tr>\s*<td[^>]*class="ef-label"[^>]*>(.*?)</td>\s*<td[^>]*class="ef-value"[^>]*>(.*?)</td>', ef_table.group(1), re.DOTALL)
        if rows:
            parts = []
            for label, value in rows:
                parts.append(f'{_strip_tags(label).strip()}: {_strip_tags(value).strip()}')
            return ' | '.join(parts)

    # ── Step 5: Search inside Recommendation section for entry/exit framework ──
    rec_block = _find_section_block(html, 'Recommendation', fmt)
    if not rec_block:
        rec_h2 = re.search(r'<h2[^>]*>[^<]*ecommendation[^<]*</h2>\s*(.*?)(?=\s*<h2)', html, re.DOTALL | re.IGNORECASE)
        if rec_h2:
            rec_block = rec_h2.group(1)

    if rec_block:
        parts = []

        # 5a. Explicit Entry framework / Stop-loss / Exit / Target paragraphs
        for m in re.finditer(
            r'<p[^>]*>\s*<strong[^>]*>\s*(?:Entry\s*/?\s*Exit|Entry framework|Stop-?loss|Exit\s*(?:framework|point)?|Target\s*price?)\s*:?\s*</strong>\s*(.*?)(?=\s*</p>)',
            rec_block,
            re.DOTALL | re.IGNORECASE
        ):
            text = _strip_tags(m.group(1)).strip()
            if text:
                parts.append(text)

        # 5b. recs-grid with depth-counting
        recs_grid = re.search(r'<div[^>]*class="recs-grid"[^>]*>', rec_block)
        if recs_grid:
            def find_matching_close(html_str, start_idx):
                depth = 1
                i = start_idx
                while i < len(html_str) and depth > 0:
                    next_open = html_str.find('<div', i)
                    next_close = html_str.find('</div>', i)
                    if next_close < 0:
                        break
                    if next_open >= 0 and next_open < next_close:
                        depth += 1
                        i = next_open + 4
                    else:
                        depth -= 1
                        if depth == 0:
                            return next_close + 6
                        i = next_close + 5
                return -1

            grid_start_open = recs_grid.start() + len(recs_grid.group())
            grid_end = find_matching_close(rec_block, grid_start_open)
            if grid_end < 0:
                grid_end = len(rec_block)
            grid_html = rec_block[recs_grid.start():grid_end]

            gi = 0
            while True:
                item_m = re.search(r'<div class="rec-item"', grid_html[gi:])
                if not item_m:
                    break
                item_start = gi + item_m.start()
                gt = grid_html.find('>', item_start)
                if gt < 0:
                    break
                item_end = find_matching_close(grid_html, gt + 1)
                if item_end < 0:
                    break
                item_html = grid_html[item_start:item_end]
                gi = item_end

                label_m = re.search(r'<div class="rec-label"[^>]*>(.*?)</div>', item_html, re.DOTALL)
                value_m = re.search(r'<div class="rec-value[^>]*>(.*?)</div>', item_html, re.DOTALL)
                if label_m and value_m:
                    lbl = _strip_tags(label_m.group(1)).strip()
                    val = _strip_tags(value_m.group(1)).strip()
                    if lbl and val:
                        parts.append(f'{lbl}: {val}')

        # 5c. BUY: Establish at … paragraph (LMT, MS, IBM, MA, JNJ, NEE, JPM, MCD, ORCL, NOC, LOW, MRK)
        buy_para = re.search(r'<p[^>]*>\s*BUY\s*:\s*(.*?)(?:\s*</p>)', rec_block, re.DOTALL | re.IGNORECASE)
        if buy_para:
            text = _strip_tags(buy_para.group(1)).strip()
            if text:
                parts.append(text)

        # 5d. Recommendation paragraphs containing BUY/REDUCE/ACCUMULATE/SELL with price thresholds
        # Handles:
        #   (i)   <p><strong>HOLD.</strong> BUY below price</p>  — BUY is plain text (GD/GILD/ISRG/LRCX/INTU/LIN/FDX)
        #   (ii)  <p><strong>BUY|REDUCE</strong> below|above price</p>  — in strong tag (TXN/USB/TMUS style)
        #   (iii) <p>BUY/HOLD: Fair value zone price</p>   — PEP style
        for p_m in re.finditer(r'<p[^>]*>(.*?)</p>', rec_block, re.DOTALL):
            p_text = p_m.group(1)
            # Must contain a recommendation keyword and a dollar sign
            clean_text = _strip_tags(p_text)
            has_rec_kw = any(k in clean_text.upper() for k in ['BUY', 'REDUCE', 'ACCUMULATE', 'SELL', 'TARGET'])
            has_price = '$' in p_text
            if not (has_rec_kw and has_price):
                continue
            
            # Extract the entry/exit sentences from this paragraph
            # Strategy: strip HTML, then find BUY/REDUCE/etc. followed by price context
            clean = _strip_tags(p_text)
            # Split into sentences and find ones with both rec keyword and price
            for sent_m in re.finditer(r'[^.]+(?:\$[^.,)]+[^.,)]*)[^.]*\.', clean):
                sent = sent_m.group(0).strip()
                if any(k in sent.upper() for k in ['BUY', 'RED', 'ACCUM', 'SELL', 'TARGET']) and '$' in sent:
                    # Remove trailing rating text like "HOLD." or "BUY/HOLD:" from start
                    sent = re.sub(r'^(?:HOLD\.|REDUCE\.|BUY/HOLD:|BUY:\s*)[\s]*(?=BUY|RED|ACCUM|SELL|TARGET)', '', sent, flags=re.IGNORECASE)
                    if sent.strip():
                        parts.append(sent.strip())

        # 5e. Table inside Recommendation with Entry / Target / Stop-loss rows
        for tbl_m in re.finditer(r'<table[^>]*>(.*?)</table>', rec_block, re.DOTALL):
            tbl_rows = re.findall(r'<tr[^>]*>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>', tbl_m.group(1), re.DOTALL)
            for td_label, td_val in tbl_rows:
                lbl = _strip_tags(td_label).strip().lower()
                val = _strip_tags(td_val).strip()
                if val and any(k in lbl for k in ['entry', 'target', 'stop', 'exit', 'reduce', 'buy', 'sell']):
                    parts.append(f'{_strip_tags(td_label).strip()}: {val}')

        # 5f. rec-detail div (CI, WMT, COR): "Accumulate on dips/pullbacks toward price"
        rec_detail = re.search(r'<div[^>]*class="(?:rec-detail|rec-text)"[^>]*>(.*?)</div>\s*</div>', rec_block, re.DOTALL)
        if rec_detail:
            detail_text = _strip_tags(rec_detail.group(1))
            for sent_m in re.finditer(r'[^.]+\$[^.,)]+[^.,)]*[\d-]+[^.]*\.', detail_text):
                sent = sent_m.group(0).strip()
                if any(k in sent for k in ['Accumulate', 'Target', 'Buy', 'Reduce', 'Sell', 'Entry', 'below', 'above']):
                    parts.append(sent)

        if parts:
            seen, uniq = set(), []
            for p in parts:
                if p not in seen:
                    seen.add(p); uniq.append(p)
            return ' | '.join(uniq)

    return ''


    return ''


def extract_sources(section_html):
    """Extract sources from the Sources section."""
    market_data    = 'Live quote data sourced via DYOR HQ data pipeline (Google Sheets + Yahoo Finance). Fields include price, market capitalisation, 52-week range, P/E, EPS, and volume.'
    company_filings = 'Public company filings, regulatory announcements, investor presentations, and RNS where referenced in the analysis.'
    additional = []
    for li in re.findall(r'<li>(.*?)</li>', section_html, re.DOTALL):
        clean = _strip_tags(li).strip()
        if clean:
            additional.append(clean)
    return {
        'marketData': market_data,
        'companyFilings': company_filings,
        'additional': additional,
        'literature': []
    }


def extract_thesis(html, fmt):
    """Extract bull/base/bear scenarios from Thesis Evaluation section."""
    block = _find_section_block(html, 'Thesis Evaluation', fmt)
    if not block:
        return {'text': '', 'bull': {}, 'base': {}, 'bear': {}}

    # Try scenario cards (card-title format with scenario-grid)
    bull_card = re.search(r'<div[^>]*class="scenario-card"[^>]*>.*?class="scenario-label[^"]*scenario-bull"[^>]*>.*?</div>.*?<div[^>]*class="scenario-text"[^>]*>(.*?)</div>', block, re.DOTALL)
    base_card = re.search(r'<div[^>]*class="scenario-card"[^>]*>.*?class="scenario-label[^"]*scenario-base"[^>]*>.*?</div>.*?<div[^>]*class="scenario-text"[^>]*>(.*?)</div>', block, re.DOTALL)
    bear_card = re.search(r'<div[^>]*class="scenario-card"[^>]*>.*?class="scenario-label[^"]*scenario-bear"[^>]*>.*?</div>.*?<div[^>]*class="scenario-text"[^>]*>(.*?)</div>', block, re.DOTALL)

    def clean_text(t):
        return _strip_tags(t).strip() if t else ''
    def extract_weight(t):
        m = re.search(r'(\d+)\s*%', t or '')
        return int(m.group(1)) if m else None

    return {
        'text': clean_text(block),
        'bull': {
            'scenario':   clean_text(bull_card.group(1)) if bull_card else '',
            'probability': extract_weight(bull_card.group(1)) if bull_card else 25
        },
        'base': {
            'scenario':   clean_text(base_card.group(1)) if base_card else '',
            'probability': extract_weight(base_card.group(1)) if base_card else 50
        },
        'bear': {
            'scenario':   clean_text(bear_card.group(1)) if bear_card else '',
            'probability': extract_weight(bear_card.group(1)) if bear_card else 25
        },
    }


# ── Find all HTML report files ────────────────────────────────────────────────
def find_report_files():
    """Find all HTML report files in reports/."""
    files = []
    for fn in sorted(os.listdir(REPORTS_DIR)):
        if not fn.endswith('.html') or fn == 'template.html' or 'template' in fn.lower():
            continue
        ticker = fn.split('-')[0].upper()
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

    fmt = _detect_format(html)

    # ── Meta ──
    meta = extract_meta(html)
    meta['lastRefreshed'] = '2026-04-11T10:00:00Z'
    meta['universes'] = ['watchlist']
    meta['universes'] = detect_universes(meta['ticker'], filename, html)

    # ── Price ──
    price = extract_price(html, meta)

    # ── Sections ──
    sections = {}

    # Executive Summary
    es_block = _find_section_block(html, 'Executive Summary', fmt)
    sections['executiveSummary'] = {'text': _strip_tags(es_block)[:500] if es_block else ''}

    # Business Model
    bm_block = _find_section_block(html, 'Business Model', fmt)
    sections['businessModel'] = {'text': _strip_tags(bm_block) if bm_block else ''}

    # Financial Snapshot
    fin_block = _find_section_block(html, 'Financial Snapshot', fmt)
    fin_table = extract_table_rows(fin_block) if fin_block else []
    fin_clean = re.sub(r'<table[^>]*>.*?</table>', '', fin_block, flags=re.DOTALL) if fin_block else ''
    sections['financialSnapshot'] = {
        'text': _strip_tags(fin_clean).strip(),
        'table': fin_table
    }

    # Recent Catalysts
    cat_block = _find_section_block(html, 'Recent Catalysts', fmt)
    if not cat_block:
        cat_block = _find_section_block(html, 'Recent Catalysts (3-6 Months)', fmt)
    if not cat_block:
        cat_block = _find_section_block(html, 'Recent Catalysts (Last 3-6 Months)', fmt)
    if cat_block:
        cat_items = re.findall(r'<li[^>]*>(.*?)</li>', cat_block, re.DOTALL)
        if cat_items:
            cat_clean = [_strip_tags(i).strip() for i in cat_items if _strip_tags(i).strip()]
            sections['recentCatalysts'] = {
                'text': _strip_tags(cat_block).strip(),
                'items': cat_clean
            }
        else:
            sections['recentCatalysts'] = {'text': _strip_tags(cat_block).strip()}
    else:
        sections['recentCatalysts'] = {'text': ''}

    # Thesis Evaluation
    sections['thesisEvaluation'] = extract_thesis(html, fmt)

    # Key Risks — try exact heading first, then variants
    kr_block = _find_section_block(html, 'Key Risks', fmt)
    if not kr_block:
        kr_block = _find_section_block(html, 'Key Risks (Ranked)', fmt)
    if not kr_block:
        kr_block = _find_section_block(html, 'Key Risks (Ordered)', fmt)
    if not kr_block:
        sections['keyRisks'] = {'text': '', 'risks': []}
    else:
        risks = extract_risks(kr_block, full_html=html)
        sections['keyRisks'] = {'text': _strip_tags(kr_block).strip(), 'risks': risks}

    # Who Should Own It / Avoid It
    sections['whoShouldOwn'] = {'text': extract_who_should_own(html, fmt)}

    # Recommendation
    rec_block = _find_section_block(html, 'Recommendation', fmt)
    sections['recommendation'] = {'text': _strip_tags(rec_block).strip() if rec_block else ''}

    # Entry / Exit Framework
    sections['entryExit'] = {'text': extract_entry_exit(html, fmt)}

    # Sources
    src_block = _find_section_block(html, 'Sources', fmt)
    sections['sources'] = extract_sources(src_block if src_block else '')

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

    lse_tickers = {'AVCT', 'ALK', 'PXEN', 'MKA', 'BIRG', 'KYGA', 'TOM', 'ZPHR', 'PALM',
                   'GLEN', 'DGE', 'C4X', 'QED', 'GGP', 'SPIR', 'CAD', 'DESP'}
    if ticker in lse_tickers or '.L' in ticker or 'LN' in filename:
        universes.append('irish')
    if ticker in {'AVCT', 'ALK', 'PXEN', 'MKA', 'BIRG', 'KYGA', 'TOM', 'ZPHR', 'PALM',
                  'GGP', 'SPIR', 'DESP', 'C4X', 'QED'}:
        universes.append('uk')

    sp100 = {'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'AMD', 'INTC', 'NFLX',
             'TSLA', 'MCD', 'V', 'JPM', 'JNJ', 'UNH', 'HD', 'PG', 'MA', 'CRM', 'ABT',
             'AVGO', 'COST', 'PEP', 'CSCO', 'ACN', 'TMO', 'MRK', 'ABBV', 'KO', 'WMT',
             'AVB', 'BAC', 'CVX', 'XOM', 'COP', 'LLY', 'PFE', 'T', 'VZ', 'PM', 'NEE',
             'DUK', 'SO', 'AMT', 'SPGI', 'MDT', 'HON', 'UPS', 'RTX', 'LOW', 'QCOM',
             'IBM', 'GE', 'CAT', 'BA', 'SBUX', 'INTU', 'AMGN', 'GS', 'BLK'}
    if ticker in sp100:
        universes.append('sp100')
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
    errors    = 0

    for ticker, filename in files:
        try:
            data = extract_one(ticker, filename)

            if DRY_RUN:
                print(f'  [WOULD EXTRACT] {ticker} ({filename})')
                print(f'    conviction={data["meta"]["conviction"]}  rec={data["meta"]["recommendation"]}')
                print(f'    keyRisks={len(data["sections"]["keyRisks"]["risks"])} items')
                print(f'    entryExit len={len(data["sections"]["entryExit"]["text"])}')
                print(f'    whoShouldOwn len={len(data["sections"]["whoShouldOwn"]["text"])}')
                continue

            out_path = DATA_DIR / f'{ticker}.json'
            with open(out_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

            print(f'  ✓ {ticker} → {out_path.name}')
            extracted += 1

        except Exception as e:
            print(f'  ✗ {ticker} ({filename}): {e}')
            import traceback; traceback.print_exc()
            errors += 1

    print(f'\nExtracted: {extracted}/{len(files)}')
    if errors:
        print(f'Errors: {errors}')
    if not DRY_RUN:
        print(f'JSON files: {DATA_DIR}')


if __name__ == '__main__':
    main()
