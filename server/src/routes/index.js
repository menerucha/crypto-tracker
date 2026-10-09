import { Router } from 'express';
import { asyncH, sendData, parseId, parseVs, parseIntIn } from '../middleware/common.js';
import { badRequest, notFound } from '../errors.js';
import { Watchlist } from '../models/index.js';
import { dbReady } from '../db.js';
import { toDaily, analyseTrend } from '../analytics/indicators.js';
import { forecast } from '../analytics/forecast.js';
import { MockProvider } from '../services/mockProvider.js';

const SORTS = {
  market_cap_desc: (a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9), market_cap_asc: (a, b) => (b.rank ?? 1e9) - (a.rank ?? 1e9),
  price_desc: (a, b) => b.price - a.price, price_asc: (a, b) => a.price - b.price,
  change24h_desc: (a, b) => (b.change24h ?? -1e9) - (a.change24h ?? -1e9), change24h_asc: (a, b) => (a.change24h ?? 1e9) - (b.change24h ?? 1e9),
  volume_desc: (a, b) => (b.volume ?? 0) - (a.volume ?? 0), name_asc: (a, b) => a.name.localeCompare(b.name),
};

/** Evenly thins an array to at most `n` points (always keeps the last one) -> much smaller list payloads. */
export const thin = (arr, n) => {
  if (!arr || arr.length <= n) return arr || [];
  const step = (arr.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => arr[Math.round(i * step)]);
};

export function buildRouter({ service, config }) {
  const r = Router();

  // ------------------------------------------------------------------ health / meta
  r.get('/health', (req, res) => {
    const db = dbReady();
    res.status(db ? 200 : 503).json({ status: db ? 'ok' : 'degraded', db: db ? 'connected' : 'disconnected', provider: service.provider.name, uptimeSec: Math.round(process.uptime()), cache: { entries: service.cache.size, ...service.cache.stats } });
  });
  r.get('/mock-icon/:file', (req, res) => {
    const sym = req.params.file.replace(/\.svg$/, '').replace(/[^a-z0-9]/gi, '').slice(0, 10) || 'x';
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(MockProvider.iconSvg(sym));
  });
  r.get('/currencies', asyncH(async (req, res) => sendData(res, await service.getCurrencies())));

  // ------------------------------------------------------------------ live prices
  r.get('/coins', asyncH(async (req, res) => {
    const vs = parseVs(req.query.vs), page = parseIntIn(req.query.page, 1, 1, 1000, 'page'), perPage = parseIntIn(req.query.perPage, 25, 1, 100, 'perPage');
    const sort = req.query.sort || 'market_cap_desc';
    if (!SORTS[sort]) throw badRequest(`sort must be one of ${Object.keys(SORTS).join(', ')}`);
    const q = String(req.query.q || '').trim().toLowerCase().slice(0, 50);
    const { data, source } = await service.getMarkets(vs);
    let list = q ? data.filter((c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q) || c.id.includes(q)) : data.slice();
    list.sort(SORTS[sort]);
    const total = list.length, start = (page - 1) * perPage;
    sendData(res, { data: list.slice(start, start + perPage).map((c) => ({ ...c, sparkline: thin(c.sparkline, 42) })), source }, { vs, page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) });
  }));

  r.get('/coins/:id', asyncH(async (req, res) => sendData(res, await service.getCoin(parseId(req.params.id), parseVs(req.query.vs)))));

  // ------------------------------------------------------------------ historical chart
  r.get('/coins/:id/history', asyncH(async (req, res) => {
    const id = parseId(req.params.id), vs = parseVs(req.query.vs), days = String(req.query.days || '7');
    const { data, source } = await service.getChart(id, vs, days);
    sendData(res, { data: { prices: data.prices, volumes: data.volumes }, source }, { id, vs, days, points: data.prices.length });
  }));

  // ------------------------------------------------------------------ trend analysis
  r.get('/coins/:id/trend', asyncH(async (req, res) => {
    const id = parseId(req.params.id), vs = parseVs(req.query.vs), window = parseIntIn(req.query.window, 30, 7, 90, 'window');
    const { data: chart, source } = await service.getChart(id, vs, '180');
    const daily = toDaily(chart.prices);
    if (daily.length < 30) throw badRequest('Not enough price history for trend analysis');
    sendData(res, { data: analyseTrend(daily, window), source }, { id, vs, window });
  }));

  // ------------------------------------------------------------------ forecast
  r.get('/coins/:id/forecast', asyncH(async (req, res) => {
    const id = parseId(req.params.id), vs = parseVs(req.query.vs), horizon = parseIntIn(req.query.horizon, 7, 1, 30, 'horizon');
    const { data: chart, source } = await service.getChart(id, vs, '180');
    const daily = toDaily(chart.prices);
    if (daily.length < 30) throw badRequest('Not enough price history to forecast');
    const result = forecast(daily.slice(-120), horizon);
    sendData(res, { data: { ...result, history: daily.slice(-30).map(([t, price]) => ({ t, price })) }, source }, { id, vs, horizon });
  }));

  // ------------------------------------------------------------------ converter
  r.get('/convert', asyncH(async (req, res) => {
    const from = String(req.query.from || '').trim(), to = String(req.query.to || '').trim();
    if (!from || !to) throw badRequest('from and to are required');
    const amount = Number(req.query.amount ?? 1);
    if (!Number.isFinite(amount) || amount < 0 || amount > 1e15) throw badRequest('amount must be a non-negative number');
    sendData(res, await service.convert(from, to, amount));
  }));

  // ------------------------------------------------------------------ watchlist (per anonymous client id)
  const clientId = (req) => {
    const id = String(req.get('x-client-id') || '');
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) throw badRequest('Missing or invalid X-Client-Id header (8-64 chars: letters, digits, _ or -)');
    return id;
  };
  r.get('/watchlist', asyncH(async (req, res) => {
    const vs = parseVs(req.query.vs), doc = await Watchlist.findOne({ clientId: clientId(req) }).lean(), ids = doc?.coinIds || [];
    if (!ids.length) return res.json({ source: 'db', ids: [], data: [] });
    const { data, source } = await service.getMarkets(vs);
    res.set('X-Data-Source', source).json({ source, ids, data: ids.map((id) => data.find((c) => c.id === id)).filter(Boolean).map((c) => ({ ...c, sparkline: thin(c.sparkline, 42) })) });
  }));
  r.post('/watchlist/:coinId', asyncH(async (req, res) => {
    const id = clientId(req), coinId = parseId(req.params.coinId, 'coinId');
    const doc = await Watchlist.findOne({ clientId: id }).lean();
    if ((doc?.coinIds.length || 0) >= config.maxWatchlist && !doc.coinIds.includes(coinId)) throw badRequest(`Watchlist is limited to ${config.maxWatchlist} coins`);
    await service.assertCoinExists(coinId);
    const out = await Watchlist.findOneAndUpdate({ clientId: id }, { $addToSet: { coinIds: coinId }, $set: { updatedAt: new Date() } }, { upsert: true, returnDocument: 'after' }).lean();
    res.status(201).json({ ids: out.coinIds });
  }));
  r.delete('/watchlist/:coinId', asyncH(async (req, res) => {
    const id = clientId(req), coinId = parseId(req.params.coinId, 'coinId');
    const out = await Watchlist.findOneAndUpdate({ clientId: id }, { $pull: { coinIds: coinId }, $set: { updatedAt: new Date() } }, { returnDocument: 'after' }).lean();
    if (!out) throw notFound('Watchlist not found');
    res.json({ ids: out.coinIds });
  }));

  return r;
}
