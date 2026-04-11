#!/usr/bin/env node
'use strict';

const path = require('path');
const YahooFinance = require(path.join(__dirname, '../../../../skills/stock-analysis/node_modules/yahoo-finance2')).default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const TICKERS = ['ETN', 'ACN', 'MDT', 'STX', 'TT', 'JCI', 'CRH', 'IR', 'RYAAY', 'EXPGF'];

async function fetchTickerData(ticker) {
  try {
    const summary = await yahooFinance.quoteSummary(ticker, {
      modules: ['price', 'summaryDetail', 'defaultKeyStatistics'],
    });
    const p  = summary.price;
    const sd = summary.summaryDetail || {};
    const ks = summary.defaultKeyStatistics || {};

    return {
      ticker,
      price:            p.regularMarketPrice,
      marketCap:        p.marketCap ?? null,
      trailingPE:       sd.trailingPE ?? null,
      trailingEps:     ks.trailingEps ?? null,
      fiftyTwoWeekHigh: sd.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow:  sd.fiftyTwoWeekLow ?? null,
      currency:         p.currency ?? 'USD',
      exchangeName:     p.exchangeName ?? null,
      shortName:        p.shortName ?? null,
      longName:         p.longName ?? null,
      marketState:      p.marketState ?? null,
      regularMarketChange:    p.regularMarketChange ?? null,
      regularMarketChangePercent: p.regularMarketChangePercent ?? null,
      marketCapFormatted: (() => {
        const v = p.marketCap;
        if (v == null) return null;
        const sym = (p.currency === 'GBp' || p.currency === 'GBX') ? '£' : '$';
        const abs = Math.abs(v);
        if (abs >= 1e12) return `${sym}${(abs/1e12).toFixed(2)}T`;
        if (abs >= 1e9)  return `${sym}${(abs/1e9).toFixed(2)}B`;
        if (abs >= 1e6)  return `${sym}${(abs/1e6).toFixed(2)}M`;
        return `${sym}${abs.toFixed(0)}`;
      })(),
    };
  } catch (err) {
    console.error(`[ERROR] ${ticker}: ${err.message}`);
    return { ticker, error: err.message };
  }
}

async function main() {
  const results = {};
  for (const ticker of TICKERS) {
    process.stderr.write(`Fetching ${ticker}...\n`);
    const data = await fetchTickerData(ticker);
    results[ticker] = data;
    await new Promise(r => setTimeout(r, 1000)); // rate limit pause
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
