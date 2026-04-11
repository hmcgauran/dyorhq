#!/usr/bin/env python3
"""Test extract-reports helpers on key samples."""
import re, os

def _strip_tags(text):
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def _detect_format(html):
    if 'class="card-title"' in html:
        return 'card-title'
    if 'class="report-section"' in html:
        return 'report-section'
    if '<table' in html and 'class="risk-row"' in html:
        return 'table-format'
    return 'report-section'

def _find_section_block(html, heading, fmt):
    heading_re = re.escape(heading)
    if fmt == 'report-section':
        p1 = rf'<div class="report-section">\s*<h2[^>]*>\s*{heading_re}\s*</h2>\s*(.*?)(?=<div class="report-section">\s*<h2|<div [^>]*>\s*<aside|</div>\s*</div>\s*<footer|<footer)'
        m = re.search(p1, html, re.DOTALL)
        if m: return m.group(1)
        p2 = rf'<section[^>]*class="report-section"[^>]*>\s*<h2[^>]*>\s*{heading_re}\s*</h2>\s*(.*?)(?=<section|</div>\s*</div>\s*</main|<footer)'
        m = re.search(p2, html, re.DOTALL)
        if m: return m.group(1)
        p3 = rf'<h2[^>]*>\s*{heading_re}\s*</h2>\s*(.*?)(?=<h2)'
        m = re.search(p3, html, re.DOTALL)
        if m: return m.group(1)
    elif fmt == 'card-title':
        card_pat = rf'<div class="card"[^>]*>\s*<div class="card-title"[^>]*>\s*{heading_re}\s*</div>\s*<div class="card-body"[^>]*>(.*?)</div>\s*</div>'
        m = re.search(card_pat, html, re.DOTALL)
        if m: return m.group(1)
        card_pat2 = rf'<div class="card"[^>]*>\s*<div class="card-title"[^>]*>\s*{heading_re}\s*</div>\s*(.*?)(?=<div class="card"|<div class="report-section"|</div>\s*</div>\s*<footer|<footer)'
        m = re.search(card_pat2, html, re.DOTALL)
        if m: return m.group(1)
        card_pat3 = rf'<div class="card-title"[^>]*>\s*{heading_re}\s*</div>\s*(.*?)(?=<div class="card-title"|<div class="report-section"</div>|</div>\s*</div>\s*<footer)'
        m = re.search(card_pat3, html, re.DOTALL)
        if m: return m.group(1)
    return ''

def extract_risks(section_html):
    risks = []
    risk_table = re.search(r'<table[^>]*class="[^"]*risk[^"]*"[^>]*>(.*?)</table>', section_html, re.DOTALL)
    if risk_table:
        for row_m in re.finditer(r'<tr[^>]*class="[^"]*risk[^"]*"[^>]*>(.*?)</tr>', risk_table.group(1), re.DOTALL):
            cells = re.findall(r'<td[^>]*>(.*?)</td>', row_m.group(1), re.DOTALL)
            if len(cells) >= 2:
                rank = cells[0].strip()
                try: rank_num = int(re.search(r'\d+', rank).group())
                except: rank_num = len(risks) + 1
                title = _strip_tags(cells[1]).strip()
                desc  = _strip_tags(cells[2]).strip() if len(cells) > 2 else ''
                risk_text = title if not desc else f'{title} — {desc}'
                if risk_text:
                    risks.append({'rank': rank_num, 'risk': risk_text})
        if risks: return risks
    list_m = re.search(r'<ol[^>]*>(.*?)</ol>', section_html, re.DOTALL)
    if not list_m:
        list_m = re.search(r'<ul[^>]*>(.*?)</ul>', section_html, re.DOTALL)
    if list_m:
        for i, li_m in enumerate(re.finditer(r'<li[^>]*>(.*?)</li>', list_m.group(1), re.DOTALL), 1):
            raw  = li_m.group(1)
            text = _strip_tags(raw).strip()
            if text:
                risks.append({'rank': i, 'risk': text})
        if risks: return risks
    for i, li_m in enumerate(re.finditer(r'<li[^>]*>(.*?)</li>', section_html, re.DOTALL), 1):
        raw  = li_m.group(1)
        text = _strip_tags(raw).strip()
        if text:
            risks.append({'rank': i, 'risk': text})
    return risks

REPORTS_DIR = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v2/reports'

for fn in ['KGSPY-2026-04-11.html', 'AIG-2026-04-11.html', 'A5G-2026-04-11.html']:
    html = open(os.path.join(REPORTS_DIR, fn)).read()
    fmt = _detect_format(html)
    print(f'\n--- {fn} ---')
    print(f'  format: {fmt}')

    block = _find_section_block(html, 'Key Risks', fmt)
    print(f'  Key Risks block: {bool(block)}')
    if block:
        risks = extract_risks(block)
        print(f'  Risks found: {len(risks)}')
        if risks: print(f'    first: {risks[0]}')
    else:
        print(f'  Key Risks (Ranked) block: {_find_section_block(html, "Key Risks (Ranked)", fmt) is not None}')
