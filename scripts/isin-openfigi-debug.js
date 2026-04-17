#!/usr/bin/env node
/**
 * scripts/isin-openfigi-debug.js
 * Debug OpenFIGI API and find working query format.
 */
const https = require('https');

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
    };
    const req = https.request(url, options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  console.log('Testing OpenFIGI API...\n');

  // Test 1: basic ticker search
  console.log('1. Ticker search for AAPL:');
  const r1 = await httpPost('https://api.openfigi.com/v3/search', [
    { idType: 'TICKER', idValue: 'AAPL' }
  ]);
  console.log('   Status:', r1.status);
  console.log('   Body:', r1.body.slice(0, 300));
  console.log('');

  // Test 2: with exchange code
  console.log('2. Ticker + exchange US for AAPL:');
  const r2 = await httpPost('https://api.openfigi.com/v3/search', [
    { idType: 'TICKER', idValue: 'AAPL', exchangeCode: 'US' }
  ]);
  console.log('   Status:', r2.status);
  console.log('   Body:', r2.body.slice(0, 300));
  console.log('');

  // Test 3: with mic
  console.log('3. Ticker with mic XNAS for GOOGL:');
  const r3 = await httpPost('https://api.openfigi.com/v3/search', [
    { idType: 'TICKER', idValue: 'GOOGL', micCode: 'XNAS' }
  ]);
  console.log('   Status:', r3.status);
  console.log('   Body:', r3.body.slice(0, 300));
  console.log('');

  // Test 4: search endpoint variation
  console.log('4. POST to /v3/search with exchangeCode CH:');
  const r4 = await httpPost('https://api.openfigi.com/v3/search', [
    { idType: 'TICKER', idValue: 'AVCT', exchangeCode: 'GB' }
  ]);
  console.log('   Status:', r4.status);
  console.log('   Body:', r4.body.slice(0, 300));
}

test().catch(console.error);