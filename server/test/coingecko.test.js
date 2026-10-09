import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { CoinGeckoProvider } from '../src/services/coingecko.js';
import { loadConfig } from '../src/config.js';
import { TtlCache } from '../src/services/cache.js';

/** A fake CoinGecko server whose behaviour each test scripts. */
async function fakeCG(handler) {
  const hits = []; const server = http.createServer((req, res) => { hits.push({ url: req.url, headers: req.headers }); handler(req, res, hits.length); });
  await new Promise((r) => server.listen(0, r));
  return { url: `http://127.0.0.1:${server.address().port}`, hits, close: () => new Promise((r) => server.close(r)) };
}
const json = (res, code, body, headers = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };
const cfg = (url, extra = {}) => loadConfig({ coingeckoBaseUrl: url, upstream: { retries: 3, baseDelayMs: 5, timeoutMs: 1000, maxConcurrent: 2 }, ...extra });

const MARKET = { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', image: 'x.png', current_price: 65000, market_cap: 1e12, market_cap_rank: 1, total_volume: 3e10,
  price_change_percentage_1h_in_currency: 0.1, price_change_percentage_24h_in_currency: 2.5, price_change_percentage_7d_in_currency: -1.2, high_24h: 66000, low_24h: 64000,
  ath: 73000, ath_change_percentage: -10, circulating_supply: 19e6, sparkline_in_7d: { price: [1, 2, 3] }, last_updated: '2026-10-07T00:00:00Z' };

test('markets(): sends expected query, normalises fields', async () => {
  const cg = await fakeCG((req, res) => json(res, 200, [MARKET, { id: 'weird', symbol: 'w', name: 'W', current_price: null }]));
  const p = new CoinGeckoProvider(cfg(cg.url));
  const list = await p.markets({ vs: 'usd', perPage: 100 });
  assert.match(cg.hits[0].url, /\/coins\/markets\?.*vs_currency=usd/); assert.match(cg.hits[0].url, /sparkline=true/); assert.match(cg.hits[0].url, /per_page=100/);
  assert.equal(list[0].price, 65000); assert.equal(list[0].change24h, 2.5); assert.equal(list[0].change7d, -1.2); assert.deepEqual(list[0].sparkline, [1, 2, 3]);
  assert.equal(list[1].price, null); assert.deepEqual(list[1].sparkline, []);
  await cg.close();
});

test('retries on 429 honouring Retry-After, then succeeds', async () => {
  const cg = await fakeCG((req, res, n) => (n < 3 ? json(res, 429, { error: 'slow down' }, { 'retry-after': '0' }) : json(res, 200, [MARKET])));
  const p = new CoinGeckoProvider(cfg(cg.url));
  const list = await p.markets({ vs: 'usd', perPage: 10 });
  assert.equal(list.length, 1); assert.equal(cg.hits.length, 3); await cg.close();
});

test('retries on 5xx, gives up after configured retries with a typed UpstreamError', async () => {
  const cg = await fakeCG((req, res) => json(res, 503, {}));
  const p = new CoinGeckoProvider(cfg(cg.url));
  await assert.rejects(() => p.markets({ vs: 'usd', perPage: 10 }), (e) => e.code === 'UPSTREAM_ERROR' && e.upstreamStatus === 503 && e.status === 502);
  assert.equal(cg.hits.length, 4); await cg.close();           // 1 try + 3 retries
});

test('persistent 429 surfaces as 503 UPSTREAM_RATE_LIMITED; 404 is not retried', async () => {
  let cg = await fakeCG((req, res) => json(res, 429, {}, { 'retry-after': '0' }));
  await assert.rejects(() => new CoinGeckoProvider(cfg(cg.url)).markets({ vs: 'usd', perPage: 1 }), (e) => e.code === 'UPSTREAM_RATE_LIMITED' && e.status === 503);
  await cg.close();
  cg = await fakeCG((req, res) => json(res, 404, { error: 'coin not found' }));
  await assert.rejects(() => new CoinGeckoProvider(cfg(cg.url)).coin('nope', 'usd'), (e) => e.status === 404);
  assert.equal(cg.hits.length, 1); await cg.close();
});

test('network failure is retried then reported', async () => {
  const p = new CoinGeckoProvider(cfg('http://127.0.0.1:1', { upstream: { retries: 1, baseDelayMs: 1, timeoutMs: 300, maxConcurrent: 1 } }));
  await assert.rejects(() => p.markets({ vs: 'usd', perPage: 1 }), (e) => e.code === 'UPSTREAM_ERROR');
});

test('API key header is sent when configured', async () => {
  const cg = await fakeCG((req, res) => json(res, 200, { rates: {} }));
  await new CoinGeckoProvider(cfg(cg.url, { coingeckoApiKey: 'SECRET' })).exchangeRates();
  assert.equal(cg.hits[0].headers['x-cg-demo-api-key'], 'SECRET'); await cg.close();
});

test('coin(), marketChart(), simplePrice(), exchangeRates() normalise correctly', async () => {
  const cg = await fakeCG((req, res) => {
    if (req.url.startsWith('/coins/bitcoin/market_chart')) return json(res, 200, { prices: [[1, 2]], total_volumes: [[1, 9]] });
    if (req.url.startsWith('/coins/bitcoin')) return json(res, 200, { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', description: { en: 'Digital <a href="x">gold</a>' }, image: { large: 'L.png' }, categories: ['A', null], market_cap_rank: 1,
      links: { homepage: ['https://bitcoin.org', ''], blockchain_site: ['b1', '', 'b2'] }, market_data: { current_price: { usd: 65000 }, market_cap: { usd: 1e12 }, ath: { usd: 73000 }, ath_date: { usd: '2024-03-14' }, price_change_percentage_24h: 1.5, circulating_supply: 19e6 } });
    if (req.url.startsWith('/simple/price')) return json(res, 200, { bitcoin: { usd: 65000 }, ethereum: {} });
    if (req.url.startsWith('/exchange_rates')) return json(res, 200, { rates: { btc: { name: 'Bitcoin', unit: 'BTC', value: 1, type: 'crypto' }, usd: { name: 'US Dollar', unit: '$', value: 65000, type: 'fiat' } } });
    json(res, 404, {});
  });
  const p = new CoinGeckoProvider(cfg(cg.url));
  const c = await p.coin('bitcoin', 'usd');
  assert.equal(c.description, 'Digital gold'); assert.equal(c.market.price, 65000); assert.equal(c.links.homepage, 'https://bitcoin.org'); assert.deepEqual(c.categories, ['A']); assert.equal(c.image, 'L.png');
  assert.deepEqual(await p.marketChart('bitcoin', 'usd', 7), { prices: [[1, 2]], volumes: [[1, 9]] });
  assert.deepEqual(await p.simplePrice(['bitcoin', 'ethereum'], 'usd'), { bitcoin: 65000 });
  assert.equal((await p.exchangeRates()).usd.type, 'fiat'); await cg.close();
});

test('bounded concurrency: never more than maxConcurrent in flight', async () => {
  let inflight = 0, peak = 0;
  const cg = await fakeCG((req, res) => { inflight++; peak = Math.max(peak, inflight); setTimeout(() => { inflight--; json(res, 200, { rates: {} }); }, 30); });
  const p = new CoinGeckoProvider(cfg(cg.url, { upstream: { retries: 0, baseDelayMs: 1, timeoutMs: 2000, maxConcurrent: 2 } }));
  await Promise.all(Array.from({ length: 8 }, () => p.exchangeRates()));
  assert.ok(peak <= 2, `peak=${peak}`); assert.equal(cg.hits.length, 8); await cg.close();
});

test('TtlCache: ttl expiry, eviction, and coalescing of concurrent loads', async () => {
  let t = 0; const c = new TtlCache({ maxEntries: 2, now: () => t });
  c.set('a', 1, 100); assert.equal(c.get('a'), 1); t = 101; assert.equal(c.get('a'), undefined);
  c.set('x', 1, 1000); c.set('y', 2, 1000); c.set('z', 3, 1000); assert.equal(c.get('x'), undefined); assert.equal(c.size, 2);
  let calls = 0; const c2 = new TtlCache();
  const results = await Promise.all(Array.from({ length: 10 }, () => c2.wrap('k', 1000, async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return 42; })));
  assert.equal(calls, 1); assert.ok(results.every((r) => r.value === 42)); assert.equal(c2.stats.coalesced, 9);
  await assert.rejects(() => c2.wrap('bad', 1000, async () => { throw new Error('x'); }));
  assert.equal(c2.get('bad'), undefined);           // failures are never cached
});
