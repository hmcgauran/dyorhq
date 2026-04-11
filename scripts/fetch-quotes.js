const { execSync } = require('child_process');
const tickers = ['MDLZ', 'MDT', 'MO', 'MU', 'NFLX', 'NOW', 'PLTR', 'PM', 'SCHW', 'SO'];
const https = require('https');

function fetchYahoo(ticker) {
  return new Promise((resolve) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finance.yahoo.com/',
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const d = JSON.parse(data);
          const r = d.chart.result[0];
          const m = r.meta;
          resolve({
            ticker,
            price: m.regularMarketPrice || 'N/A',
            marketCap: m.marketCap || 'N/A',
            trailingPE: m.trailingPE || 'N/A',
            eps: m.earningsPerShare || 'N/A',
            high52: m.fiftyTwoWeekHigh || 'N/A',
            low52: m.fiftyTwoWeekLow || 'N/A',
          });
        } catch(e) {
          resolve({ ticker, error: e.message, raw: data.slice(0, 200) });
        }
      });
    }).on('error', e => resolve({ ticker, error: e.message }));
  });
}

(async () => {
  const results = await Promise.all(tickers.map(fetchYahoo));
  results.forEach(r => console.log(JSON.stringify(r)));
})();
