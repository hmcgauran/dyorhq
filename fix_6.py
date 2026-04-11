import json, os

live_data = {
    'A5G':     {'price': 835.0,  'high': 860.0,  'low': 466.0,  'currency': 'GBp'},
    'GL9':     {'price': 16.5,   'high': 18.0,   'low': 9.15,   'currency': 'EUR'},
    'LON:DCC': {'price': 5140.0, 'high': 5290.0, 'low': 4188.0, 'currency': 'GBp'},
    'LON:GFTU':{'price': 918.2,  'high': 1035.6, 'low': 825.1,  'currency': 'GBp'},
}
sheet_data = {
    'C43':     {'price': 96.2, 'high': None, 'low': None, 'currency': 'EUR'},
    'FRA:KRZ': {'price': 67.7, 'high': None, 'low': None, 'currency': 'EUR'},
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
    rng = (high - low) if (high is not None and low is not None) else None
    curr_str = f"{currency} {price:.2f}"
    range_str = f"{currency} {low:.0f}-{high:.0f}" if rng else "N/A"
    mid_str = f"{currency} {(low+high)/2:.0f}" if rng else "mid-range"
    tgt1_str = f"{currency} {low + 0.8*rng:.2f}" if rng else "~10-15% above current"
    tgt2_str = f"{currency} {high:.0f} (52w high — exit target)" if high else "~20% above current"
    stop_str = f"{currency} {low*0.95:.2f}" if low else "see below"
    from_pct = f"{(price-low)/rng*100:.0f}% from 52w low" if rng else ""
    range_note = f"Current range position: {from_pct} — {'upper half' if rng and (price-low)/rng > 0.5 else 'lower/mid half'} of the range." if rng else "Note: 52w range not available from live data."

    return f"""**Entry / Exit Framework — {company} ({ticker})**
*Current Price: {curr_str} | 52-Week Range: {range_str} | REDUCE | Conviction: 45/100*

{range_note}

**1. Entry Zone**
No new accumulation. At {curr_str}, REDUCE rating signals this is not an attractive entry point. Treat any meaningful bounce toward {mid_str} as a trim zone. Do not add on a REDUCE rating.

**2. Stop Loss**
{stop_str} — below the 52-week low. A break of key support on volume signals deteriorating conditions and warrants exit.

**3. Target 1 — Near-Term (3–6 months)**
{tgt1_str}. Use approach to trim or close position; do not hold through without a thesis reassessment.

**4. Target 2 — Longer-Term (12–18 months)**
{tgt2_str} Given the REDUCE rating, the 52-week high is an exit target, not further upside. Take profit in stages: trim 50% at Target 1, exit remainder at Target 2+. Do not hold through a test of the 52-week high without a full fundamental re-rating."""

base = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v2/reports/data'
for ticker in ['A5G', 'C43', 'FRA:KRZ', 'GL9', 'LON:DCC', 'LON:GFTU']:
    fn = f"{base}/{ticker}.json"
    with open(fn) as f:
        d = json.load(f)
    ld = live_data.get(ticker) or sheet_data.get(ticker, {})
    d['meta']['company'] = correct_names[ticker]
    d['price']['current'] = ld['price']
    d['price']['currency'] = ld['currency']
    d['sections']['entryExit']['text'] = make_ee(ticker, correct_names[ticker], ld['price'], ld['high'], ld['low'], ld['currency'])
    with open(fn, 'w') as f:
        json.dump(d, f, indent=2, ensure_ascii=False)
    rng2 = (ld['high'] - ld['low']) if ld['high'] and ld['low'] else None
    pct = f" ({(ld['price']-ld['low'])/(ld['high']-ld['low'])*100:.0f}% from 52w low)" if rng2 else ""
    print(f"Fixed: {ticker} -> {correct_names[ticker]} @ {ld['currency']} {ld['price']}{pct}")
print("Done.")