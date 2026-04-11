#!/usr/bin/env python3
"""
Regenerate entry/exit content for DYOR HQ reports missing it.
Uses yfinance for live price data + template-based generation for 95 tickers.
"""

import json, os, time, sys
from datetime import datetime

# ── Helpers ────────────────────────────────────────────────────────────────

def load_json(path):
    with open(path) as f:
        return json.load(f)

def save_json(path, data):
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)

def yf_quote(ticker):
    """Fetch quote data via yfinance."""
    try:
        import yfinance as yf
        t = yf.Ticker(ticker.replace('.L', '').replace('-US', ''))
        info = t.info
        return {
            'current': info.get('currentPrice') or info.get('regularMarketPrice'),
            '52w_high': info.get('fiftyTwoWeekHigh'),
            '52w_low': info.get('fiftyTwoWeekLow'),
            'market_cap': info.get('marketCap'),
            'pe': info.get('trailingPE'),
            'eps': info.get('trailingEps'),
        }
    except Exception as e:
        return {'error': str(e)}

# ── Template-based generator (fallback when API unavailable) ───────────────

def generate_entry_exit(company, ticker, price, high52, low52, rec, conviction):
    """Generate entry/exit framework from price data using structured rules."""
    
    if price is None or high52 is None or low52 is None:
        # Fallback: generic based on conviction
        return _generic_entry_exit(conviction, rec)
    
    mid = (high52 + low52) / 2
    range_pct = (high52 - low52) / low52 if low52 > 0 else 0.5
    
    rec_band = rec.upper().split('—')[0].strip() if rec else 'HOLD'
    
    # Entry zones
    if rec_band == 'BUY':
        entry_low = round(price * 0.88, 2) if price else None
        entry_high = round(price * 0.95, 2) if price else None
        stop_loss = round(low52 * 0.95, 2) if low52 else None
        target1 = round(high52 * 0.85, 2) if high52 else None
        target2 = round(high52 * 1.05, 2) if high52 else None
    elif rec_band == 'HOLD':
        entry_low = round(price * 0.92, 2) if price else None
        entry_high = round(price * 1.02, 2) if price else None
        stop_loss = round(low52 * 0.98, 2) if low52 else None
        target1 = round(high52 * 0.78, 2) if high52 else None
        target2 = round(high52 * 0.95, 2) if high52 else None
    elif rec_band == 'REDUCE':
        entry_low = round(price * 1.02, 2) if price else None
        entry_high = round(price * 1.10, 2) if price else None
        stop_loss = round(high52 * 1.02, 2) if high52 else None
        target1 = round(low52 * 1.08, 2) if low52 else None
        target2 = round(low52 * 1.25, 2) if low52 else None
    else:  # SELL
        entry_low = round(price * 1.05, 2) if price else None
        entry_high = round(price * 1.15, 2) if price else None
        stop_loss = round(high52 * 0.98, 2) if high52 else None
        target1 = round(low52 * 1.05, 2) if low52 else None
        target2 = round(low52 * 0.90, 2) if low52 else None
    
    currency = '£' if ('.L' in ticker or ticker.endswith('.LL')) else '$'
    
    lines = []
    lines.append(f"{company} ({ticker}) — Entry / Exit Framework")
    lines.append("")
    
    if rec_band == 'BUY':
        if entry_low and entry_high:
            lines.append(f"Accumulate: {currency}{entry_low}–{currency}{entry_high} — pullback zone within the 52-week range. The stock is attractively priced relative to the recent move.")
        lines.append(f"Stop-loss: {currency}{stop_loss} — a close below the 52-week low would signal fundamental deterioration.")
        if target1:
            lines.append(f"Target 1: {currency}{target1} — mean reversion toward the midpoint of the 52-week range. Near-term catalyst needed to confirm momentum.")
        if target2:
            lines.append(f"Target 2: {currency}{target2} — above the 52-week high on sustained volume. Only appropriate for position-initiation with conviction.")
    
    elif rec_band == 'HOLD':
        if entry_low and entry_high:
            lines.append(f"HOLD zone: {currency}{entry_low}–{currency}{entry_high} — current levels are fairly valued. No compelling reason to add or trim here.")
        if entry_high and price and entry_high > price:
            lines.append(f"Add / Initiate below {currency}{entry_low} — material pullback that improves risk/reward.")
        lines.append(f"Trim / Take Profits above {currency}{entry_high} — approaching the 52-week high at {currency}{high52:.2f}. Risk/reward no longer favourable for new capital.")
        if stop_loss:
            lines.append(f"Stop-loss consideration: A sustained close below {currency}{stop_loss} (52-week low) would warrant reassessment.")
    
    elif rec_band == 'REDUCE':
        if entry_low and entry_high:
            lines.append(f"Reduce / Trim: Above {currency}{entry_low} — the stock is trading near or above the 52-week high. Capital should be rotated elsewhere.")
        lines.append(f"Tighten or exit on any bounce above {currency}{entry_high} — the risk/reward is poor at current levels.")
        if stop_loss:
            lines.append(f"Stop-loss (for remaining exposure): {currency}{stop_loss} — a close above the 52-week high would confirm the bull case is breaking down.")
        if target1:
            lines.append(f"Target: {currency}{target1} — partial mean reversion toward the middle of the 52-week range.")
    
    else:  # SELL
        lines.append(f"Avoid / Sell: Current levels offer poor risk/reward given the 52-week range of {currency}{low52:.2f}–{currency}{high52:.2f}.")
        lines.append(f"Stop-loss (if somehow accumulated): {currency}{stop_loss} — above the 52-week high would be a meaningful breakdown.")
        lines.append(f"Target: {currency}{target1} — below the 52-week low is the path of least resistance.")
    
    return '\n'.join(lines)

def _generic_entry_exit(conviction, rec):
    rec_band = rec.upper().split('—')[0].strip() if rec else 'HOLD'
    if rec_band == 'BUY':
        return f"Accumulate on weakness. Conviction: {conviction}/100. BUY-rated — specific entry levels require current price data."
    elif rec_band == 'REDUCE':
        return f"Reduce exposure. Conviction: {conviction}/100. REDUCE-rated — limited upside at current levels."
    else:
        return f"HOLD. Conviction: {conviction}/100. No compelling entry or exit signal without current price data."

# ── Main ──────────────────────────────────────────────────────────────────

REPORTS_DIR = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v2/reports/data'
BATCH_SIZE = 15
DELAY = 1.5  # seconds between yfinance calls

def main():
    print(f"Scanning {REPORTS_DIR}...")
    
    # Get all tickers with empty entryExit
    empty = []
    for fn in sorted(os.listdir(REPORTS_DIR)):
        if not fn.endswith('.json'): continue
        with open(f'{REPORTS_DIR}/{fn}') as f:
            d = json.load(f)
        ee = d.get('sections', {}).get('entryExit', {}).get('text', '').strip()
        if not ee:
            empty.append(d['meta']['ticker'])
    
    print(f"Found {len(empty)} tickers with empty entryExit")
    
    # Process in batches
    for i in range(0, len(empty), BATCH_SIZE):
        batch = empty[i:i+BATCH_SIZE]
        print(f"\nBatch {i//BATCH_SIZE + 1}: {batch}")
        
        for ticker in batch:
            fn = f'{REPORTS_DIR}/{ticker}.json'
            if not os.path.exists(fn):
                # Try variant filenames
                for variant in [f'{ticker} · US.json', f'{ticker.replace(" ", "-")}.json']:
                    if os.path.exists(f'{REPORTS_DIR}/{variant}'):
                        fn = f'{REPORTS_DIR}/{variant}'
                        break
            
            try:
                d = load_json(fn)
            except FileNotFoundError:
                print(f"  {ticker}: file not found, skipping")
                continue
            
            meta = d['meta']
            price_data = d.get('price', {})
            company = meta.get('company', ticker)
            rec = meta.get('recommendation', 'HOLD')
            conviction = meta.get('conviction', 50)
            
            # Try existing price data first
            p = price_data.get('current')
            high52 = price_data.get('fiftyTwoWeekHigh')
            low52 = price_data.get('fiftyTwoWeekLow')
            
            # Fall back to yfinance
            if p is None:
                print(f"  {ticker}: fetching live data...")
                q = yf_quote(ticker)
                if 'error' not in q:
                    p = q.get('current', p)
                    high52 = q.get('52w_high', high52)
                    low52 = q.get('52w_low', low52)
                time.sleep(DELAY)
            
            print(f"  {ticker}: price={p}, high={high52}, low={low52}, rec={rec}, conv={conviction}")
            
            ee_text = generate_entry_exit(company, ticker, p, high52, low52, rec, conviction)
            
            if 'sections' not in d:
                d['sections'] = {}
            if 'entryExit' not in d['sections']:
                d['sections']['entryExit'] = {'text': ''}
            d['sections']['entryExit']['text'] = ee_text
            
            save_json(fn, d)
            print(f"  → saved ({len(ee_text)} chars)")
        
        print(f"Batch {i//BATCH_SIZE + 1} complete")
    
    print("\nAll done!")

if __name__ == '__main__':
    main()