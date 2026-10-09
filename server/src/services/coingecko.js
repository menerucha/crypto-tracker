import axios from 'axios';
import { UpstreamError } from '../errors.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Real CoinGecko client. Responsibilities: auth header, timeouts, bounded concurrency,
 * retry with exponential backoff (+ Retry-After) on 429/5xx/network errors, and normalising
 * responses into the app's own shapes so the rest of the code never sees raw CoinGecko JSON.
 */
export class CoinGeckoProvider {
  constructor(cfg) {
    this.name = 'coingecko'; this.isMock = false; this.cfg = cfg;
    this.http = axios.create({
      baseURL: cfg.coingeckoBaseUrl, timeout: cfg.upstream.timeoutMs,
      headers: { accept: 'application/json', ...(cfg.coingeckoApiKey ? { [cfg.coingeckoApiKeyHeader]: cfg.coingeckoApiKey } : {}) },
    });
    this.active = 0; this.waiters = [];
    this.calls = 0;
  }

  async #acquire() { if (this.active >= this.cfg.upstream.maxConcurrent) await new Promise((r) => this.waiters.push(r)); this.active++; }
  #release() { this.active--; this.waiters.shift()?.(); }

  async get(path, params) {
    const { retries, baseDelayMs } = this.cfg.upstream;
    await this.#acquire();
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          this.calls++;
          return (await this.http.get(path, { params })).data;
        } catch (e) {
          const status = e.response?.status;
          const retryable = !status || status === 429 || status >= 500;
          if (!retryable || attempt >= retries) {
            const retryAfter = Number(e.response?.headers?.['retry-after']) || undefined;
            throw new UpstreamError(`CoinGecko ${path} failed: ${status ? 'HTTP ' + status : e.code || e.message}`,
              { status: status === 429 ? 503 : status === 404 ? 404 : 502, upstreamStatus: status, retryAfter });
          }
          const ra = Number(e.response?.headers?.['retry-after']);
          await sleep(ra > 0 ? Math.min(ra * 1000, 15000) : baseDelayMs * 2 ** attempt + Math.random() * 100);
        }
      }
    } finally { this.#release(); }
  }

  async markets({ vs, perPage }) {
    const data = await this.get('/coins/markets', { vs_currency: vs, order: 'market_cap_desc', per_page: Math.min(perPage, 250), page: 1, sparkline: true, price_change_percentage: '1h,24h,7d' });
    return data.map((c) => ({
      id: c.id, symbol: c.symbol, name: c.name, image: c.image, price: n(c.current_price), marketCap: n(c.market_cap), rank: n(c.market_cap_rank),
      volume: n(c.total_volume), change1h: n(c.price_change_percentage_1h_in_currency), change24h: n(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h),
      change7d: n(c.price_change_percentage_7d_in_currency), high24h: n(c.high_24h), low24h: n(c.low_24h), ath: n(c.ath), athChangePct: n(c.ath_change_percentage),
      circulatingSupply: n(c.circulating_supply), sparkline: c.sparkline_in_7d?.price || [], lastUpdated: c.last_updated || null,
    }));
  }

  async coin(id, vs) {
    const c = await this.get(`/coins/${encodeURIComponent(id)}`, { localization: false, tickers: false, community_data: false, developer_data: false, sparkline: false });
    const m = c.market_data || {}, at = (o) => n(o?.[vs]);
    return {
      id: c.id, symbol: c.symbol, name: c.name, image: c.image?.large || c.image?.small, description: (c.description?.en || '').replace(/<[^>]+>/g, ''),
      categories: (c.categories || []).filter(Boolean), genesisDate: c.genesis_date || null,
      links: { homepage: (c.links?.homepage || []).filter(Boolean)[0] || null, blockchain: (c.links?.blockchain_site || []).filter(Boolean).slice(0, 3), twitter: c.links?.twitter_screen_name || null, reddit: c.links?.subreddit_url || null },
      market: {
        price: at(m.current_price), marketCap: at(m.market_cap), rank: n(c.market_cap_rank), volume: at(m.total_volume), high24h: at(m.high_24h), low24h: at(m.low_24h),
        change24h: n(m.price_change_percentage_24h), change7d: n(m.price_change_percentage_7d), change30d: n(m.price_change_percentage_30d), change1y: n(m.price_change_percentage_1y),
        ath: at(m.ath), athDate: m.ath_date?.[vs] || null, atl: at(m.atl), atlDate: m.atl_date?.[vs] || null,
        circulatingSupply: n(m.circulating_supply), totalSupply: n(m.total_supply), maxSupply: n(m.max_supply),
      },
      lastUpdated: c.last_updated || null,
    };
  }

  async marketChart(id, vs, days) {
    const d = await this.get(`/coins/${encodeURIComponent(id)}/market_chart`, { vs_currency: vs, days });
    return { prices: d.prices || [], volumes: d.total_volumes || [] };
  }

  async simplePrice(ids, vs) {
    const d = await this.get('/simple/price', { ids: ids.join(','), vs_currencies: vs });
    const out = {};
    for (const id of ids) if (d[id] && n(d[id][vs]) !== null) out[id] = d[id][vs];
    return out;
  }

  /** Rates are expressed as "value of 1 BTC in this unit" (CoinGecko /exchange_rates). */
  async exchangeRates() {
    const d = await this.get('/exchange_rates');
    const out = {};
    for (const [code, r] of Object.entries(d.rates || {})) out[code] = { name: r.name, unit: r.unit, value: r.value, type: r.type };
    return out;
  }
}
