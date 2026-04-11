const createYahooFinance = require('/Users/hughmcgauran/.openclaw/skills/stock-analysis/node_modules/yahoo-finance2').default;
const yf = new createYahooFinance({ suppressNotices: ['yahooSurvey'] });

const TICKERS = ['ETN', 'ACN', 'MDT', 'STX', 'TT', 'JCI', 'CRH', 'IR', 'RYAAY', 'EXPGF'];

async function fetchOne(ticker) {
  try {
    const s = await yf.quoteSummary(ticker, { modules: ['price', 'summaryDetail', 'defaultKeyStatistics'] });
    const p = s.price, sd = s.summaryDetail || {}, ks = s.defaultKeyStatistics || {};
    return {
      price: p.regularMarketPrice,
      marketCap: p.marketCap,
      trailingPE: sd.trailingPE ?? null,
      trailingEps: ks.trailingEps ?? null,
      fiftyTwoWeekHigh: sd.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: sd.fiftyTwoWeekLow ?? null,
      currency: p.currency,
      exchangeName: p.exchangeName,
      shortName: p.shortName,
      longName: p.longName,
      regularMarketChange: p.regularMarketChange,
      regularMarketChangePercent: p.regularMarketChangePercent,
    };
  } catch(e) {
    return { error: e.message };
  }
}

async function main() {
  const out = {};
  for (const ticker of TICKERS) {
    process.stderr.write('Fetching ' + ticker + '...\n');
    out[ticker] = await fetchOne(ticker);
    process.stderr.write('  -> ' + JSON.stringify(out[ticker]).slice(0,80) + '\n');
    if (ticker !== TICKERS[TICKERS.length-1]) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  process.stdout.write(JSON.stringify(out, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
