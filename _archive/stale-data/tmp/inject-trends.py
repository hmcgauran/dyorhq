#!/usr/bin/env python3
"""Add Conviction Trend to reports missing it."""
import json, os, sys, re

reports_dir = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq/reports'
idx_path = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq/reports/index.json'

with open(idx_path) as f:
    idx = json.load(f)

# Build history map
history_by_ticker = {}
for row in idx:
    t = row.get('ticker')
    if t:
        history_by_ticker.setdefault(t, []).append(row)
for t in history_by_ticker:
    history_by_ticker[t] = sorted(history_by_ticker[t], key=lambda r: str(r.get('date','')))

def conviction_color(score):
    if score >= 75: return '#00ff88'
    if score >= 60: return '#f0b429'
    if score >= 45: return '#ff8c00'
    return '#ff4d4d'

def build_trend_block(row, history):
    points = sorted([r for r in history if isinstance(r.get('conviction'), (int, float))],
                    key=lambda r: str(r.get('date', '')))
    if not points:
        return ''
    width, height, pad = 520, 180, 24
    coords = []
    for i, p in enumerate(points):
        if len(points) == 1:
            x = width / 2
        else:
            x = pad + (i * (width - 2 * pad) / (len(points) - 1))
        y = height - pad - ((p['conviction'] / 100) * (height - 2 * pad))
        coords.append({'x': x, 'y': y, 'date': p['date'], 'conviction': p['conviction']})
    latest = points[-1]['conviction']
    prev = points[-2]['conviction'] if len(points) > 1 else latest
    delta = latest - prev
    trend_class = 'positive' if delta > 0 else 'negative' if delta < 0 else 'neutral'
    trend_label = f'Up {delta} pts' if delta > 0 else f'Down {abs(delta)} pts' if delta < 0 else 'Flat'
    y_ticks = [100, 75, 50, 25, 0]
    svg_parts = []
    for t in y_ticks:
        y = height - pad - ((t / 100) * (height - 2 * pad))
        svg_parts.append(f'<line x1="{pad}" y1="{y:.1f}" x2="{width - pad}" y2="{y:.1f}" stroke="rgba(255,255,255,0.08)" stroke-width="1" />')
    polyline_pts = ' '.join([f'{c["x"]:.1f},{c["y"]:.1f}' for c in coords])
    svg_parts.append(f'<polyline fill="none" stroke="{conviction_color(latest)}" stroke-width="3" points="{polyline_pts}" />')
    for c in coords:
        svg_parts.append(f'<circle cx="{c["x"]:.1f}" cy="{c["y"]:.1f}" r="4" fill="{conviction_color(c["conviction"])}" />')
    for t in y_ticks:
        y = height - pad - ((t / 100) * (height - 2 * pad)) + 4
        svg_parts.append(f'<text x="8" y="{y:.1f}">{t}</text>')
    for c in coords:
        svg_parts.append(f'<text x="{c["x"]:.1f}" y="176" text-anchor="middle">{c["date"]}</text>')
    block = f'''
          <div class="report-section conviction-history-section">
            <h2>Conviction Trend</h2>
            <p class="conviction-history-summary">Latest conviction: <strong>{latest}/100</strong>. Trend versus prior report: <strong class="{trend_class}">{trend_label}</strong>.</p>
            <div class="conviction-history-chart">
              <svg viewBox="0 0 {width} {height}" role="img" aria-label="Conviction score trend for {row['ticker']}">
                {"".join(svg_parts)}
              </svg>
            </div>
            <table class="conviction-history-table">
              <thead><tr><th>Report date</th><th>Conviction</th></tr></thead>
              <tbody>{"".join([f'<tr><td>{p["date"]}</td><td>{p["conviction"]}</td></tr>' for p in points])}</tbody>
            </table>
          </div>'''
    return block

changed = 0
failed = []

for row in idx:
    fname = row.get('file')
    if not fname:
        continue
    fpath = os.path.join(reports_dir, fname)
    if not os.path.exists(fpath):
        failed.append(f'{fname}: file missing')
        continue

    with open(fpath) as f:
        content = f.read()

    if '<h2>Conviction Trend</h2>' in content:
        continue  # already has it

    ticker = row.get('ticker')
    history = history_by_ticker.get(ticker, [row])
    trend_block = build_trend_block(row, history)
    if not trend_block:
        continue

    new_content = None

    # Strategy 1: sources header exists, inject before the section containing it
    if '<h2>Sources</h2>' in content:
        # Find the <section class="report-section"> that wraps Sources
        # The Sources section starts with <section class="report-section"><h2>Sources</h2>
        m = re.search(r'(<section class="report-section"><h2>Sources</h2>)', content)
        if m:
            pos = m.start()
            new_content = content[:pos] + trend_block + '\n      ' + content[pos:]
    
    # Strategy 2: no sources header, find last </section> before <footer or </main>
    if new_content is None:
        # Find the last </section> before </main>
        main_close = content.find('</main>')
        if main_close > 0:
            search_area = content[:main_close]
            last_sec = search_area.rfind('</section>')
            if last_sec > 0:
                # Inject after this </section>
                new_content = content[:last_sec+len('</section>')] + '\n      ' + trend_block + content[last_sec+len('</section>'):]

    if new_content and new_content != content:
        with open(fpath, 'w') as f:
            f.write(new_content)
        changed += 1
    elif new_content is None:
        failed.append(f'{fname}: could not find injection point')

print(f'Trend injection: {changed} files updated, {len(failed)} failed')
for f in failed[:20]:
    print(f'  FAIL: {f}')