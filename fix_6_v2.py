import json

sheet_data = {
    'A5G':     {'price': 8.85,   'high': 10.02,  'low': 7.29,   'currency': 'GBp'},
    'C43':     {'price': 96.2,   'high': 141.0,  'low': 47.8,   'currency': 'EUR'},
    'FRA:KRZ': {'price': 67.7,   'high': 97.95, 'low': 64.6,   'currency': 'EUR'},
    'GL9':     {'price': 16.94,  'high': 18.5,   'low': 8.9,    'currency': 'EUR'},
    'LON:DCC': {'price': 5160.0, 'high': 5290.0, 'low': 4188.0, 'currency': 'GBp'},
    'LON:GFTU':{'price': 918.2,  'high': 1035.6, 'low': 825.1,  'currency': 'GBp'},
}
correct_names = {
    'A5G':     'AIB Group plc',
    'C43':     'Cosmo Pharmaceuticals NV',
    'FRA:KRZ': 'Kerry Group PLC',
    'GL9':     'Glanbia plc',
    'LON:DCC': 'DCC plc',
    'LON:GFTU': 'Grafton Group Plc',
}

def make_ee(ticker, company, price, high, low, currency):
    rng = high - low
    from_pct = (price - low) / rng * 100
    mid = (low + high) / 2
    tgt1 = low + 0.8 * rng
    pos_label = 'upper half' if from_pct > 50 else ('mid-range' if from_pct > 25 else 'lower half')

    return f"""**Entry / Exit Framework — {company} ({ticker})**
*Current Price: {currency} {price:.2f} | 52-Week Range: {currency} {low:.2f}–{high:.2f} | REDUCE | Conviction: 45/100*

**Current Range Position:** {from_pct:.0f}% of the 52-week range from the low — {pos_label} of the range.

**1. Entry Zone**
No new accumulation. At {currency} {price:.2f}, REDUCE rating signals this is not an attractive entry point. Treat any meaningful bounce toward {currency} {mid:.0f} (mid-range) as a trim zone. Do not add on a REDUCE rating.

**2. Stop Loss**
{currency} {low * 0.95:.2f} — below the 52-week low of {currency} {low:.2f}. A break of key support on volume signals deteriorating conditions and warrants exit.

**3. Target 1 — Near-Term (3–6 months)**
{currency} {tgt1:.2f} — 80th percentile of the 52-week range. Use approach to trim or close position; do not hold through without a thesis reassessment.

**4. Target 2 — Longer-Term (12–18 months)**
{currency} {high:.2f} (52-week high — exit target, not further upside). Given the REDUCE rating, the 52-week high is an exit target, not a hold signal. Take profit in stages: trim 50% at Target 1, exit remainder at Target 2+. Do not hold through a test of the 52-week high without a full fundamental re-rating."""

base = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v2/reports/data'
for ticker in ['A5G', 'C43', 'FRA:KRZ', 'GL9', 'LON:DCC', 'LON:GFTU']:
    fn = f"{base}/{ticker}.json"
    with open(fn) as f:
        d = json.load(f)
    ld = sheet_data[ticker]
    d['meta']['company'] = correct_names[ticker]
    d['price']['current'] = ld['price']
    d['price']['currency'] = ld['currency']
    d['sections']['entryExit']['text'] = make_ee(ticker, correct_names[ticker], ld['price'], ld['high'], ld['low'], ld['currency'])
    with open(fn, 'w') as f:
        json.dump(d, f, indent=2, ensure_ascii=False)
    rng = ld['high'] - ld['low']
    pct = (ld['price'] - ld['low']) / rng * 100
    print(f"Fixed: {ticker} -> {correct_names[ticker]} @ {ld['currency']} {ld['price']} | 52w: {ld['low']}-{ld['high']} ({pct:.0f}% from low)")
print("All 6 done.")