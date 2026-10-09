import 'dotenv/config';

const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

/** Builds the runtime config from env vars; `overrides` is used by tests. */
export function loadConfig(overrides = {}) {
  const env = process.env;
  const cfg = {
    port: num(env.PORT, 4000),
    mongoUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27017/crypto_tracker',
    // live = real CoinGecko API, mock = deterministic offline data (demo/dev without internet)
    providerMode: (env.COINGECKO_MODE || 'live').toLowerCase(),
    coingeckoBaseUrl: env.COINGECKO_BASE_URL || 'https://api.coingecko.com/api/v3',
    coingeckoApiKey: env.COINGECKO_API_KEY || '',
    coingeckoApiKeyHeader: env.COINGECKO_API_KEY_HEADER || 'x-cg-demo-api-key',
    coinCount: num(env.COIN_COUNT, 100),
    corsOrigin: env.CORS_ORIGIN || '*',
    rateLimitPerMinute: num(env.RATE_LIMIT_PER_MINUTE, 600),
    upstream: { timeoutMs: num(env.UPSTREAM_TIMEOUT_MS, 10000), retries: num(env.UPSTREAM_RETRIES, 3), baseDelayMs: num(env.UPSTREAM_BASE_DELAY_MS, 500), maxConcurrent: num(env.UPSTREAM_MAX_CONCURRENT, 3) },
    // How long each kind of upstream data is served from memory before refetching (seconds)
    ttl: {
      markets: num(env.TTL_MARKETS, 60), detail: num(env.TTL_DETAIL, 300), rates: num(env.TTL_RATES, 300),
      chartIntraday: num(env.TTL_CHART_SHORT, 120), chart: num(env.TTL_CHART, 900), stale: num(env.TTL_STALE, 20),
    },
    maxWatchlist: 50,
  };
  return { ...cfg, ...overrides, upstream: { ...cfg.upstream, ...(overrides.upstream || {}) }, ttl: { ...cfg.ttl, ...(overrides.ttl || {}) } };
}
