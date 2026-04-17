const fs = require('fs');
const idx = JSON.parse(fs.readFileSync('reports/index.json', 'utf8'));

const newEntries = [
  { ticker:'DIS',   company:'Walt Disney Co',        isin:'US2546871060', exchange:'NYSE',  file:'dis.html',  recommendation:'OPPORTUNISTIC BUY', conviction:52, currency:'USD', price:106.15, marketCap:'$188.1B', pe:15.64,  eps:6.79,    beta:1.44,  52wHigh:124.69, 52wLow:82.98  },
  { ticker:'GOOGL', company:'Alphabet Inc Class A',   isin:'US02079K3059', exchange:'NASDAQ',file:'googl.html', recommendation:'OPPORTUNISTIC BUY', conviction:62, currency:'USD', price:339.07, marketCap:'$4.08T',  pe:31.37,  eps:10.81,   beta:1.13,  52wHigh:349.00,  52wLow:146.10 },
  { ticker:'ALRIB', company:'Riber SA',               isin:'FR001400A4K1', exchange:'EPA',   file:'alrib.html', recommendation:'AVOID',             conviction:24, currency:'EUR', price:13.00,  marketCap:'EUR276M',pe:84.81,  eps:0.15,    beta:null,  52wHigh:18.50,   52wLow:2.22   },
  { ticker:'TBN',   company:'Tamboran Resources Corp',  isin:'AU000000TBN3', exchange:'ASX',   file:'tbn.html',  recommendation:'SPECULATIVE BUY',   conviction:40, currency:'AUD', price:0.26,   marketCap:'AUD915M',pe:null,   eps:null,    beta:null,  52wHigh:0.34,    52wLow:0.14   },
];

for (const n of newEntries) {
  const existing = idx.find(x => x.ticker === n.ticker);
  if (existing) {
    Object.assign(existing, n);
    console.log(n.ticker + ': updated');
  } else {
    idx.push({ ...n, universes:['watchlist'], date:'17 April 2026', summary:'' });
    console.log(n.ticker + ': added');
  }
}

fs.writeFileSync('reports/index.json', JSON.stringify(idx, null, 2), 'utf8');
console.log('Index updated. Total entries:', idx.length);
