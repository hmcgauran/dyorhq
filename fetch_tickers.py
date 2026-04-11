#!/usr/bin/env python3
import urllib.request
import json
import time

TICKERS = ['ETN', 'ACN', 'MDT', 'STX', 'TT', 'JCI', 'CRH', 'IR', 'RYAAY', 'EXPGF']

headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
}

results = {}

for ticker in TICKERS:
    print(f'Fetching {ticker}...', file=__import__('sys').stderr)
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=5d'
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            meta = data['chart']['result'][0]['meta']
            results[ticker] = {
                'price': meta.get('regularMarketPrice'),
                'marketCap': meta.get('marketCap'),
                'trailingPE': meta.get('trailingPE'),
                'trailingEps': meta.get('earningsPerShare'),
                'fiftyTwoWeekHigh': meta.get('fiftyTwoWeekHigh'),
                'fiftyTwoWeekLow': meta.get('fiftyTwoWeekLow'),
                'currency': meta.get('currency'),
                'exchangeName': meta.get('exchangeName'),
                'shortName': meta.get('shortName'),
                'longName': meta.get('longName'),
                'marketState': meta.get('marketState'),
                'regularMarketChange': meta.get('regularMarketChange'),
                'regularMarketChangePercent': meta.get('regularMarketChangePercent'),
            }
            print(f'  {ticker}: price={results[ticker]["price"]}', file=__import__('sys').stderr)
    except Exception as e:
        print(f'  ERROR {ticker}: {e}', file=__import__('sys').stderr)
        results[ticker] = {'error': str(e)}
    time.sleep(0.5)

print(json.dumps(results, indent=2))
