import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, waitFor } from './helpers.js';
import { Coin, ChartCache, Watchlist } from '../src/models/index.js';

let t;
before(async () => { t = await startTestApp(); });
after(async () => { await t.stop(); });

const CID = 'test-client-0001';

test('health reports db connected and provider', async () => {
  const r = await t.get('/health');
  assert.equal(r.status, 200); assert.equal(r.body.db, 'connected'); assert.equal(r.body.provider, 'mock');
});

test('GET /coins returns 100+ coins with full market fields (live prices)', async () => {
  const r = await t.get('/coins?perPage=100');
  assert.equal(r.status, 200); assert.equal(r.body.total, 100); assert.equal(r.body.data.length, 100);
  const btc = r.body.data[0];
  assert.equal(btc.id, 'bitcoin');
  for (const k of ['price', 'marketCap', 'rank', 'volume', 'change1h', 'change24h', 'change7d', 'high24h', 'low24h', 'image']) assert.ok(btc[k] !== undefined && btc[k] !== null, k);
  assert.equal(btc.sparkline.length, 42);   // thinned from 168 hourly points to keep list payloads small assert.ok(btc.low24h <= btc.price && btc.price <= btc.high24h);
  assert.equal(r.headers.get('x-data-source'), 'mock');
});

test('pagination, search and sorting work server-side', async () => {
  const p2 = await t.get('/coins?perPage=10&page=2');
  assert.equal(p2.body.data.length, 10); assert.equal(p2.body.data[0].rank, 11); assert.equal(p2.body.totalPages, 10);
  const s = await t.get('/coins?q=ETH'); assert.ok(s.body.data.some((c) => c.id === 'ethereum')); assert.ok(s.body.total < 100);
  const bySym = await t.get('/coins?q=doge'); assert.equal(bySym.body.data[0].id, 'dogecoin');
  const none = await t.get('/coins?q=zzzzzzzz'); assert.equal(none.body.total, 0); assert.equal(none.body.data.length, 0);
  const cheap = await t.get('/coins?sort=price_asc&perPage=5'); const prices = cheap.body.data.map((c) => c.price);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  const gain = await t.get('/coins?sort=change24h_desc&perPage=100'); const ch = gain.body.data.map((c) => c.change24h);
  assert.deepEqual(ch, [...ch].sort((a, b) => b - a));
});

test('input validation returns 400 with a structured error', async () => {
  for (const path of ['/coins?page=0', '/coins?perPage=1000', '/coins?sort=bogus', '/coins?vs=U$D!', '/coins/BAD%20ID/history', '/coins/bitcoin/history?days=3',
    '/coins/bitcoin/forecast?horizon=99', '/coins/bitcoin/trend?window=2', '/convert', '/convert?from=btc&to=usd&amount=abc', '/convert?from=btc&to=usd&amount=-5']) {
    const r = await t.get(path); assert.equal(r.status, 400, path); assert.ok(r.body.error.code && r.body.error.message, path);
  }
});

test('unknown routes and unknown coins give 404 JSON', async () => {
  assert.equal((await t.get('/nope')).status, 404);
  const r = await t.get('/coins/not-a-real-coin'); assert.equal(r.status, 404); assert.equal(r.body.error.code, 'NOT_FOUND');
  assert.equal((await t.get('/coins/not-a-real-coin/history?days=7')).status, 404);
});

test('GET /coins/:id returns detail with market data', async () => {
  const r = await t.get('/coins/ethereum');
  assert.equal(r.status, 200); const { data } = r.body;
  assert.equal(data.symbol, 'eth'); assert.ok(data.description.length > 10); assert.ok(data.market.price > 0); assert.ok(data.market.ath >= data.market.price * 0.999); assert.ok(data.market.change30d !== null);
});

test('historical chart: valid ranges, ascending timestamps, last point ~ current price', async () => {
  for (const [days, minPts] of [['1', 250], ['7', 150], ['30', 700], ['365', 360]]) {
    const r = await t.get(`/coins/bitcoin/history?days=${days}`);
    assert.equal(r.status, 200, days); assert.ok(r.body.data.prices.length >= minPts, `${days}d -> ${r.body.data.prices.length}`);
    const ts = r.body.data.prices.map((p) => p[0]); assert.deepEqual(ts, [...ts].sort((a, b) => a - b));
  }
  const h = await t.get('/coins/bitcoin/history?days=7'), c = await t.get('/coins/bitcoin');
  const last = h.body.data.prices.at(-1)[1]; assert.ok(Math.abs(last / c.body.data.market.price - 1) < 0.01);
  const other = await t.get('/coins/bitcoin/history?days=7&vs=eur'); assert.ok(other.body.data.prices[0][1] < h.body.data.prices[0][1]);
});

test('trend analysis returns verdict, indicators and aligned series', async () => {
  const r = await t.get('/coins/bitcoin/trend?window=30');
  assert.equal(r.status, 200); const d = r.body.data;
  assert.ok(['strong bullish', 'bullish', 'neutral', 'bearish', 'strong bearish'].includes(d.verdict.label));
  assert.ok(d.summary.rsi14 >= 0 && d.summary.rsi14 <= 100); assert.ok(d.summary.volatilityAnnualisedPct > 0); assert.ok(d.signals.length >= 3);
  assert.ok(d.series.length >= 150); assert.ok(d.series.at(-1).sma7 > 0); assert.equal(d.summary.windowDays, 30);
});

test('forecast returns horizon-length bands with backtest + disclaimer', async () => {
  const r = await t.get('/coins/ethereum/forecast?horizon=10');
  assert.equal(r.status, 200); const d = r.body.data;
  assert.equal(d.points.length, 10); assert.equal(d.history.length, 30);
  for (const p of d.points) { assert.ok(p.lower > 0 && p.lower <= p.price && p.price <= p.upper); }
  assert.ok(d.points[0].t > d.history.at(-1).t); assert.ok(Number.isFinite(d.metrics.mapePct.ensemble)); assert.match(d.disclaimer, /not financial advice/i);
});

test('stablecoin analytics: forecast stays near $1', async () => {
  const d = (await t.get('/coins/tether/forecast?horizon=7')).body.data;
  assert.ok(d.points.every((p) => p.price > 0.95 && p.price < 1.05), JSON.stringify(d.points.map((p) => p.price)));
});

test('currency converter: coin->fiat, fiat->coin, coin->coin, symbols, round trip', async () => {
  const cur = await t.get('/currencies'); assert.ok(cur.body.data.length >= 10); assert.ok(cur.body.data.some((c) => c.code === 'eur'));
  const btcUsd = (await t.get('/convert?from=bitcoin&to=usd&amount=2')).body.data;
  const price = (await t.get('/coins/bitcoin')).body.data.market.price;
  assert.ok(Math.abs(btcUsd.result / (2 * price) - 1) < 0.002, `${btcUsd.result} vs ${2 * price}`); assert.equal(btcUsd.fromKind, 'coin'); assert.equal(btcUsd.toKind, 'fiat');
  const eur = (await t.get('/convert?from=bitcoin&to=eur&amount=1')).body.data; assert.ok(eur.result < btcUsd.result / 2 && eur.result > 0);
  const back = (await t.get(`/convert?from=usd&to=bitcoin&amount=${btcUsd.result}`)).body.data; assert.ok(Math.abs(back.result - 2) < 0.01);
  const sym = (await t.get('/convert?from=ETH&to=BTC&amount=10')).body.data; assert.equal(sym.from, 'ethereum'); assert.equal(sym.to, 'bitcoin'); assert.ok(sym.result > 0 && sym.result < 10);
  const fx = (await t.get('/convert?from=usd&to=inr&amount=100')).body.data; assert.ok(fx.result > 7000 && fx.result < 9000);
  const same = (await t.get('/convert?from=ethereum&to=ethereum&amount=3')).body.data; assert.ok(Math.abs(same.result - 3) < 1e-9);
  assert.equal((await t.get('/convert?from=bitcoin&to=notacoin&amount=1')).status, 404);
  assert.equal((await t.get('/convert?from=bitcoin&to=usd&amount=0')).body.data.result, 0);
});

test('market data is persisted to MongoDB (100+ coins) and charts are cached', async () => {
  await t.get('/coins'); await t.get('/coins/solana/history?days=30');
  await waitFor(async () => (await Coin.countDocuments({ vs: 'usd' })) === 100 && (await ChartCache.countDocuments({ key: 'chart:solana:usd:30' })) === 1, { timeout: 30000 });
  assert.equal(await Coin.countDocuments({ vs: 'usd' }), 100);
  const doc = await Coin.findOne({ coinId: 'bitcoin', vs: 'usd' }).lean(); assert.ok(doc.price > 0 && doc.sparkline.length === 168);
  const chart = await ChartCache.findOne({ key: 'chart:solana:usd:30' }).lean(); assert.ok(chart.ts.length > 600 && chart.px.length === chart.ts.length);
});

test('caching: repeated requests hit the provider once; concurrent identical requests are coalesced', async () => {
  t.cache.clear(); const before = { ...t.provider.counts };
  const calls = () => (t.provider.counts.markets || 0) - (before.markets || 0);
  await Promise.all(Array.from({ length: 25 }, () => t.get('/coins?vs=gbp')));
  assert.equal(calls(), 1, 'coalesced 25 concurrent requests into one upstream call');
  for (let i = 0; i < 5; i++) await t.get('/coins?vs=gbp&page=2&sort=price_desc&q=');
  assert.equal(calls(), 1, 'filtering/sorting/paging served from one cached upstream response');
  const h = await t.get('/coins?vs=gbp'); assert.equal(h.headers.get('x-data-source'), 'cache');
});

test('resilience: when upstream fails, stale data is served from MongoDB (and flagged)', async () => {
  await t.get('/coins?vs=usd'); await t.get('/coins/bitcoin/history?days=14'); await t.get('/coins/bitcoin');
  await waitFor(async () => (await Coin.countDocuments({ vs: 'usd' })) === 100 && (await ChartCache.countDocuments({ key: 'chart:bitcoin:usd:14' })) === 1, { timeout: 30000 });
  t.cache.clear(); t.provider.state.failing = true;
  try {
    const list = await t.get('/coins?perPage=5'); assert.equal(list.status, 200); assert.equal(list.headers.get('x-data-source'), 'stale'); assert.equal(list.body.data[0].id, 'bitcoin');
    const again = await t.get('/coins?perPage=5'); assert.equal(again.headers.get('x-data-source'), 'stale', 'repeat hits must stay flagged stale, not "cache"');       // regression: UI banner relies on this
    assert.equal(t.provider.counts.markets > 0, true);
    const hist = await t.get('/coins/bitcoin/history?days=14'); assert.equal(hist.status, 200); assert.equal(hist.body.source, 'stale'); assert.ok(hist.body.data.prices.length > 100);
    const det = await t.get('/coins/bitcoin'); assert.equal(det.status, 200); assert.equal(det.body.source, 'stale'); assert.ok(det.body.data.market.price > 0);
    const never = await t.get('/coins/dogecoin/history?days=90'); assert.equal(never.status, 500 /* generic provider error, nothing cached */);
  } finally { t.provider.state.failing = false; }
  t.cache.clear();
  assert.equal((await t.get('/coins?perPage=1')).headers.get('x-data-source'), 'mock');       // recovers automatically
});

test('watchlist: add / list / idempotent add / remove / isolation between clients / validation', async () => {
  const h = { 'x-client-id': CID };
  assert.equal((await t.get('/watchlist')).status, 400);
  assert.deepEqual((await t.get('/watchlist', h)).body.data, []);
  assert.deepEqual((await t.send('POST', '/watchlist/bitcoin', h)).body.ids, ['bitcoin']);
  await t.send('POST', '/watchlist/solana', h); await t.send('POST', '/watchlist/bitcoin', h);
  const list = await t.get('/watchlist', h); assert.deepEqual(list.body.ids, ['bitcoin', 'solana']); assert.equal(list.body.data.length, 2); assert.ok(list.body.data[0].price > 0);
  assert.deepEqual((await t.get('/watchlist', { 'x-client-id': 'another-client-99' })).body.ids, []);
  assert.deepEqual((await t.send('DELETE', '/watchlist/bitcoin', h)).body.ids, ['solana']);
  assert.equal((await t.send('POST', '/watchlist/not-a-real-coin', h)).status, 404);
  assert.equal((await t.send('POST', '/watchlist/BAD%20ID', h)).status, 400);
  assert.equal((await t.send('DELETE', '/watchlist/solana', { 'x-client-id': 'never-used-client' })).status, 404);
  assert.equal(await Watchlist.countDocuments({ clientId: CID }), 1);
});

test('mock icons are served as SVG; malformed JSON body is a 400', async () => {
  const res = await fetch(`${t.base}/mock-icon/btc.svg`); assert.match(res.headers.get('content-type'), /^image\/svg\+xml/); assert.match(await res.text(), /<svg/);
  const bad = await fetch(`${t.base}/watchlist/bitcoin`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-client-id': CID }, body: '{oops' });
  assert.equal(bad.status, 400);
});
