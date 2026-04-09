const fs=require('fs');
let idx=JSON.parse(fs.readFileSync('reports/index.json','utf8'));
const seen=new Set();
idx=idx.filter(e=>{
  if(seen.has(e.ticker)) return false;
  seen.add(e.ticker);
  return fs.existsSync('reports/'+e.file);
});
fs.writeFileSync('reports/index.json',JSON.stringify(idx,null,2));
const pub=idx.filter(e=>e.isin&&e.file).map(e=>({ticker:e.ticker,isin:e.isin,exchange_code:e.exchange_code,rating:(e.recommendation||'HOLD').split('—')[0].trim(),company:e.company,report_url:`/reports/${e.file.replace('.html','')}`,conviction:e.conviction,summary:e.summary}));
fs.writeFileSync('public/reports-index.json',JSON.stringify(pub,null,2));
console.log('index cleaned', idx.length, pub.length);
