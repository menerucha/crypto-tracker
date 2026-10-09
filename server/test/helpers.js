import mongoose from 'mongoose';
import { loadConfig } from '../src/config.js';
import { connectDb, disconnectDb } from '../src/db.js';
import { MockProvider } from '../src/services/mockProvider.js';
import { MarketService } from '../src/services/marketService.js';
import { TtlCache } from '../src/services/cache.js';
import { createApp } from '../src/app.js';
import { Coin, ChartCache, Watchlist } from '../src/models/index.js';

export const TEST_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/crypto_tracker_test';
const silent = { warn() {}, error() {}, log() {} };

/** Wraps a provider: counts calls per method, and `state.failing = true` simulates an upstream outage. */
export function instrument(provider) {
  const counts = {}, state = { failing: false }, wrapped = Object.create(provider);
  for (const m of ['markets', 'coin', 'marketChart', 'simplePrice', 'exchangeRates']) {
    wrapped[m] = async (...a) => {
      counts[m] = (counts[m] || 0) + 1;
      if (state.failing) throw new Error('upstream down');
      return provider[m](...a);
    };
  }
  return Object.assign(wrapped, { counts, state });
}

export async function startTestApp({ overrides = {}, provider } = {}) {
  const config = loadConfig({ mongoUri: TEST_URI, providerMode: 'mock', rateLimitPerMinute: 100000, ...overrides });
  await mongoose.connect(TEST_URI);
  await mongoose.connection.dropDatabase();           // start from a clean slate even if a previous run was interrupted
  await connectDb(TEST_URI);                            // (re)creates the unique indexes
  await Promise.all([Coin.deleteMany({}), ChartCache.deleteMany({}), Watchlist.deleteMany({})]);
  const prov = instrument(provider || new MockProvider(config));
  const cache = new TtlCache();
  const service = new MarketService({ provider: prov, config, cache, logger: silent });
  const app = createApp({ config, service });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const get = async (path, headers = {}) => { const res = await fetch(base + path, { headers }); const body = await res.json().catch(() => null); return { status: res.status, body, headers: res.headers }; };
  const send = async (method, path, headers = {}, json) => { const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: json ? JSON.stringify(json) : undefined }); return { status: res.status, body: await res.json().catch(() => null) }; };
  const stop = async () => {
    await new Promise((r) => server.close(r));
    await sleep(500);                                  // let fire-and-forget persistence finish before dropping
    await mongoose.connection.dropDatabase().catch(() => {});
    await disconnectDb();
  };
  return { base, get, send, stop, service, provider: prov, cache, config };
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Polls until `fn` returns truthy (persistence to MongoDB is fire-and-forget, so tests wait for it). */
export async function waitFor(fn, { timeout = 15000, every = 100 } = {}) {
  const end = Date.now() + timeout;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('waitFor timed out'); await sleep(every); }
}
