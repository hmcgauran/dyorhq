import re, json, os

non50_pattern = []
files = [f for f in os.listdir('reports/data') if f.endswith('.json')]
for f in files:
    d = json.load(open(f'reports/data/{f}'))
    ticker = f.replace('.json','')
    if d['meta']['conviction'] != 50:
        # Try exact ticker
        html_file = f'reports/{ticker}-2026-04-11.html'
        try:
            html = open(html_file).read()
        except:
            # Try replacing : with - for LON: prefix
            ticker2 = ticker.replace(':', '-')
            html_file = f'reports/{ticker2}-2026-04-11.html'
            try:
                html = open(html_file).read()
            except:
                continue
        m = re.search(r'Conviction Score:\s*<strong[^>]*>(\d+)', html)
        if m:
            non50_pattern.append((ticker, d['meta']['conviction'], m.group(1)))

print(f'Non-50 files WITH Conviction Score: strong pattern: {len(non50_pattern)}')
for t, cv, tv in sorted(non50_pattern):
    match = 'AGREE' if str(cv) == tv else 'DISAGREE'
    print(f'  {t}: JSON={cv}, text={tv} [{match}]')
