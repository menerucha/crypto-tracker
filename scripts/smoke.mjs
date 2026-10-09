// End-to-end smoke test against a RUNNING stack.  Usage: node scripts/smoke.mjs [baseUrl]
// baseUrl defaults to the client dev/preview server, so this also exercises the /api proxy.
const BASE = process.argv[2] || 'http://localhost:5173';
const CID = 'smoke-' + Math.random().toString(36).slice(2, 12);
let failed = 0;
const ok = (cond, name, extra = '') => { console.log(`${cond ? '  PASS' : '  FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!cond) failed++; };
const get = async (p, h = {}) => { const r = await fetch(BASE + p, { headers: h }); let b = null; try { b = await r.json(); } catch {} return { status: r.status, body: b, headers: r.headers }; };
const send = async (m, p) => { const r = await fetch(BASE + p, { method: m, headers: { 'x-client-id': CID } }); return { status: r.status, body: await r.json().catch(() => null) }; };

const html = await fetch(BASE + '/').then((r) => r.text());
ok(/<title>Crypto Tracker<\/title>/.test(html) && /assets\/index-.*\.js/.test(html), 'serves the built single-page app');
ok(!/charts-/.test(html), 'home page does not preload the charting bundle');

const list = await get('/api/coins?perPage=100');
ok(list.status === 200 && list.body.total >= 100 && list.body.data.length === 100, 'lists 100+ coins', `source=${list.body?.source}`);
const btc = list.body.data[0];
ok(btc.id === 'bitcoin' && btc.price > 0 && Array.isArray(btc.sparkline), 'bitcoin first with price + sparkline', `$${btc.price.toFixed(2)}`);
ok((await get('/api/coins?q=eth')).body.data.some((c) => c.id === 'ethereum'), 'search works');
ok((await get('/api/coins?sort=price_asc&perPage=3')).body.data[0].price <= btc.price, 'sort works');

const hist = await get('/api/coins/bitcoin/history?days=30');
ok(hist.status === 200 && hist.body.data.prices.length > 300, 'historical chart data', `${hist.body.data?.prices.length} points`);
const trend = await get('/api/coins/bitcoin/trend');
ok(trend.status === 200 && !!trend.body.data.verdict.label && trend.body.data.summary.rsi14 >= 0, 'trend analysis', `verdict=${trend.body.data?.verdict.label} rsi=${trend.body.data?.summary.rsi14?.toFixed(1)}`);
const fc = await get('/api/coins/ethereum/forecast?horizon=7');
ok(fc.status === 200 && fc.body.data.points.length === 7, 'forecast', `7d change ${fc.body.data?.expectedChangePct}% (backtest MAPE ${fc.body.data?.metrics.mapePct.ensemble}% vs naive ${fc.body.data?.metrics.mapePct.naive}%)`);
const cv = await get('/api/convert?from=bitcoin&to=eur&amount=2');
ok(cv.status === 200 && cv.body.data.result > 0, 'currency conversion', `2 BTC = ${cv.body.data?.result?.toFixed(2)} EUR`);
ok((await get('/api/currencies')).body.data.length >= 10, 'fiat currency list');

ok((await send('POST', '/api/watchlist/bitcoin')).status === 201, 'watchlist add');
ok(JSON.stringify((await get('/api/watchlist', { 'x-client-id': CID })).body.ids) === '["bitcoin"]', 'watchlist read back (persisted in MongoDB)');
ok((await send('DELETE', '/api/watchlist/bitcoin')).body.ids.length === 0, 'watchlist remove');
ok((await get('/api/coins/does-not-exist')).status === 404, 'unknown coin gives 404');
ok((await get('/api/coins?page=0')).status === 400, 'bad input gives 400');

const t0 = Date.now(); await Promise.all(Array.from({ length: 30 }, () => get('/api/coins?perPage=20')));
const h = (await get('/api/health')).body;
ok(h.status === 'ok' && h.db === 'connected', 'health', `cache hits=${h.cache?.hits} coalesced=${h.cache?.coalesced} (30 parallel requests in ${Date.now() - t0}ms)`);
console.log(failed ? `\n${failed} FAILED` : '\nAll smoke checks passed'); process.exit(failed ? 1 : 0);
