import { Coin, ChartCache } from '../models/index.js';
import { TtlCache } from './cache.js';
import { badRequest, notFound } from '../errors.js';

const VALID_DAYS = new Set(['1', '7', '14', '30', '90', '180', '365', 'max']);

/**
 * Orchestrates data access with three layers:
 *   1. in-memory TTL cache (+ request coalescing)  -> source "cache"
 *   2. upstream provider (CoinGecko or mock)       -> source "live" / "mock"
 *   3. MongoDB snapshot, used only if the upstream fails -> source "stale"
 * Every successful upstream result is also persisted to MongoDB (best effort, never blocks the response).
 */
export class MarketService {
  constructor({ provider, config, cache = new TtlCache(), logger = console }) {
    this.provider = provider; this.cfg = config; this.cache = cache; this.log = logger;
    this.staleUntil = new Map();      // cache keys currently holding a MongoDB fallback -> expiry; keeps them labelled "stale" on cache hits
  }

  get liveSource() { return this.provider.isMock ? 'mock' : 'live'; }

  async #resolve({ key, ttl, load, persist, fallback }) {
    let loaded = false;
    try {
      const { value, cached } = await this.cache.wrap(key, ttl * 1000, async () => {
        const v = await load(); loaded = true;
        if (persist) persist(v).catch((e) => this.log.warn?.(`[persist] ${key}: ${e.message}`));
        return v;
      });
      if (!cached) this.staleUntil.delete(key);
      const stillStale = cached && (this.staleUntil.get(key) || 0) > Date.now();
      return { data: value, source: stillStale ? 'stale' : cached ? 'cache' : this.liveSource, loaded };
    } catch (err) {
      if (!fallback) throw err;
      let snap = null;
      try { snap = await fallback(); } catch (e) { this.log.warn?.(`[fallback] ${key}: ${e.message}`); }
      if (!snap) throw err;
      this.cache.set(key, snap, this.cfg.ttl.stale * 1000);     // avoid hammering a failing upstream
      this.staleUntil.set(key, Date.now() + this.cfg.ttl.stale * 1000);
      this.log.warn?.(`[stale] serving ${key} from MongoDB after upstream failure: ${err.message}`);
      return { data: snap, source: 'stale' };
    }
  }

  // ------------------------------------------------------------ markets
  getMarkets(vs) {
    const { coinCount } = this.cfg;
    return this.#resolve({
      key: `markets:${vs}`, ttl: this.cfg.ttl.markets,
      load: () => this.provider.markets({ vs, perPage: coinCount }),
      persist: async (list) => {
        if (!list.length) return;
        await Coin.bulkWrite(list.map((c) => {
          const { id, ...rest } = c;
          return { updateOne: { filter: { coinId: id, vs }, update: { $set: { ...rest, lastUpdated: rest.lastUpdated ? new Date(rest.lastUpdated) : null, fetchedAt: new Date() } }, upsert: true } };
        }), { ordered: false });
      },
      fallback: async () => {
        const docs = await Coin.find({ vs }).sort({ rank: 1 }).limit(coinCount).lean();
        return docs.length ? docs.map(({ _id, coinId, fetchedAt, ...r }) => ({ id: coinId, ...r, lastUpdated: r.lastUpdated?.toISOString?.() ?? null })) : null;
      },
    });
  }

  // ------------------------------------------------------------ single coin
  async getCoin(id, vs) {
    return this.#resolve({
      key: `coin:${id}:${vs}`, ttl: this.cfg.ttl.detail,
      load: () => this.provider.coin(id, vs),
      fallback: async () => {
        const c = await Coin.findOne({ coinId: id, vs }).lean();
        if (!c) return null;
        return { id, symbol: c.symbol, name: c.name, image: c.image, description: '', categories: [], genesisDate: null, links: {}, lastUpdated: c.lastUpdated?.toISOString?.() ?? null,
          market: { price: c.price, marketCap: c.marketCap, rank: c.rank, volume: c.volume, high24h: c.high24h, low24h: c.low24h, change24h: c.change24h, change7d: c.change7d, ath: c.ath, circulatingSupply: c.circulatingSupply } };
      },
    });
  }

  // ------------------------------------------------------------ chart history
  getChart(id, vs, days) {
    const d = String(days);
    if (!VALID_DAYS.has(d)) throw badRequest(`days must be one of ${[...VALID_DAYS].join(', ')}`);
    const key = `chart:${id}:${vs}:${d}`;
    return this.#resolve({
      key, ttl: d === '1' ? this.cfg.ttl.chartIntraday : this.cfg.ttl.chart,
      load: () => this.provider.marketChart(id, vs, d),
      persist: async (c) => {
        await ChartCache.updateOne({ key }, { $set: { key, coinId: id, vs, days: d, ts: c.prices.map((p) => p[0]), px: c.prices.map((p) => p[1]), vts: c.volumes.map((p) => p[0]), vol: c.volumes.map((p) => p[1]), fetchedAt: new Date() } }, { upsert: true });
      },
      fallback: async () => {
        const c = await ChartCache.findOne({ key }).lean();
        return c && c.ts.length ? { prices: c.ts.map((t, i) => [t, c.px[i]]), volumes: c.vts.map((t, i) => [t, c.vol[i]]) } : null;
      },
    });
  }

  // ------------------------------------------------------------ converter
  async getRates() { return this.#resolve({ key: 'rates', ttl: this.cfg.ttl.rates, load: () => this.provider.exchangeRates() }); }

  async getCurrencies() {
    const { data, source } = await this.getRates();
    const list = Object.entries(data).filter(([, r]) => r.type === 'fiat').map(([code, r]) => ({ code, name: r.name, symbol: r.unit })).sort((a, b) => a.code.localeCompare(b.code));
    return { data: list, source };
  }

  /** Converts between any two of: coin id, coin symbol, fiat code. Everything is routed through USD. */
  async convert(from, to, amount) {
    const [{ data: rates, source: s1 }, { data: markets }] = await Promise.all([this.getRates(), this.getMarkets('usd')]);
    const resolve = (raw) => {
      const q = raw.toLowerCase();
      const fiat = rates[q]?.type === 'fiat' ? q : null;
      if (fiat) return { kind: 'fiat', id: fiat, label: fiat.toUpperCase(), usd: rates.usd.value / rates[fiat].value };
      const coin = markets.find((c) => c.id === q) || markets.find((c) => c.symbol === q);
      if (coin) return { kind: 'coin', id: coin.id, label: coin.symbol.toUpperCase(), usd: coin.price };
      return null;
    };
    const a = resolve(from), b = resolve(to);
    if (!a) throw notFound(`Unknown currency or coin '${from}'`);
    if (!b) throw notFound(`Unknown currency or coin '${to}'`);
    const unitRate = a.usd / b.usd;
    return { data: { from: a.id, to: b.id, fromLabel: a.label, toLabel: b.label, amount, rate: unitRate, result: amount * unitRate, fromKind: a.kind, toKind: b.kind, timestamp: new Date().toISOString() }, source: s1 };
  }

  async assertCoinExists(id, vs = 'usd') {
    const { data } = await this.getMarkets(vs);
    if (data.some((c) => c.id === id)) return true;
    await this.getCoin(id, vs);        // throws 404 from the provider if it doesn't exist
    return true;
  }
}
