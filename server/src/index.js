import { loadConfig } from './config.js';
import { connectDb, disconnectDb } from './db.js';
import { CoinGeckoProvider } from './services/coingecko.js';
import { MockProvider } from './services/mockProvider.js';
import { MarketService } from './services/marketService.js';
import { createApp } from './app.js';

const config = loadConfig();
const provider = config.providerMode === 'mock' ? new MockProvider(config) : new CoinGeckoProvider(config);
const service = new MarketService({ provider, config });

try { await connectDb(config.mongoUri); console.log('[db] connected'); }
catch (e) { console.error('[db] connection failed:', e.message); process.exit(1); }

const app = createApp({ config, service });
const server = app.listen(config.port, () => console.log(`[server] http://localhost:${config.port}  provider=${provider.name}  coins=${config.coinCount}`));
service.getMarkets('usd').then(() => console.log('[warmup] markets cached')).catch((e) => console.warn('[warmup] failed:', e.message));  // prime cache + MongoDB

const shutdown = () => server.close(async () => { await disconnectDb(); process.exit(0); });
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
