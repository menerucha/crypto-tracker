import { notFound } from '../errors.js';

/**
 * Deterministic offline stand-in for CoinGecko (COINGECKO_MODE=mock). Prices are a pure function of
 * (coin, time), so current price, 7d sparkline and historical charts are always mutually consistent
 * and the "live" price still drifts a little every 10 seconds.
 */
const SEED = [
  ['bitcoin','btc','Bitcoin',65000,19.7e6],['ethereum','eth','Ethereum',3200,120e6],['tether','usdt','Tether',1,110e9],['binancecoin','bnb','BNB',580,150e6],
  ['solana','sol','Solana',150,450e6],['usd-coin','usdc','USDC',1,35e9],['ripple','xrp','XRP',0.55,55e9],['staked-ether','steth','Lido Staked Ether',3190,9.5e6],
  ['dogecoin','doge','Dogecoin',0.15,145e9],['the-open-network','ton','Toncoin',6.5,2.5e9],['cardano','ada','Cardano',0.45,36e9],['tron','trx','TRON',0.12,87e9],
  ['avalanche-2','avax','Avalanche',35,400e6],['shiba-inu','shib','Shiba Inu',0.000018,589e12],['polkadot','dot','Polkadot',7,1.4e9],['chainlink','link','Chainlink',14,600e6],
  ['bitcoin-cash','bch','Bitcoin Cash',450,19.7e6],['near','near','NEAR Protocol',6,1.1e9],['matic-network','matic','Polygon',0.7,9.3e9],['litecoin','ltc','Litecoin',80,75e6],
  ['uniswap','uni','Uniswap',8,750e6],['internet-computer','icp','Internet Computer',12,470e6],['dai','dai','Dai',1,5.3e9],['ethereum-classic','etc','Ethereum Classic',27,148e6],
  ['stellar','xlm','Stellar',0.11,29e9],['monero','xmr','Monero',160,18.4e6],['cosmos','atom','Cosmos Hub',8,390e6],['okb','okb','OKB',50,60e6],
  ['filecoin','fil','Filecoin',5.5,580e6],['hedera-hashgraph','hbar','Hedera',0.08,38e9],['aptos','apt','Aptos',9,440e6],['cronos','cro','Cronos',0.1,26e9],
  ['arbitrum','arb','Arbitrum',1.1,3.5e9],['vechain','vet','VeChain',0.03,72e9],['maker','mkr','Maker',2800,920e3],['aave','aave','Aave',95,15e6],
  ['optimism','op','Optimism',2.5,1.1e9],['the-graph','grt','The Graph',0.25,9.5e9],['algorand','algo','Algorand',0.17,8.1e9],['render-token','rndr','Render',7.5,390e6],
  ['fantom','ftm','Fantom',0.7,2.8e9],['theta-token','theta','Theta Network',2,1e9],['flow','flow','Flow',0.7,1.5e9],['tezos','xtz','Tezos',0.9,1e9],
  ['eos','eos','EOS',0.75,1.1e9],['the-sandbox','sand','The Sandbox',0.4,2.3e9],['decentraland','mana','Decentraland',0.4,1.9e9],['axie-infinity','axs','Axie Infinity',6,150e6],
  ['neo','neo','NEO',12,70e6],['iota','iota','IOTA',0.2,3.1e9],
];
const STABLE = new Set(['tether', 'usd-coin', 'dai']);
// Units of each fiat currency per 1 USD
const FIAT = { usd: ['US Dollar', '$', 1], eur: ['Euro', '€', 0.92], gbp: ['British Pound Sterling', '£', 0.79], jpy: ['Japanese Yen', '¥', 150], inr: ['Indian Rupee', '₹', 83.2],
  aud: ['Australian Dollar', 'A$', 1.52], cad: ['Canadian Dollar', 'CA$', 1.36], chf: ['Swiss Franc', 'Fr.', 0.88], cny: ['Chinese Yuan', '¥', 7.2], krw: ['South Korean Won', '₩', 1330],
  brl: ['Brazilian Real', 'R$', 5.1], mxn: ['Mexican Peso', 'MX$', 17.2], sgd: ['Singapore Dollar', 'S$', 1.34], aed: ['United Arab Emirates Dirham', 'DH', 3.67] };
const DAY = 86400000, HOUR = 3600000, EPOCH = Date.UTC(2026, 0, 1);

const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const hnoise = (seed, k) => { let h = (seed ^ Math.imul(k | 0, 374761393)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h = (h ^ (h >>> 16)) >>> 0; return (h / 4294967295) * 2 - 1; };
const smooth = (seed, x) => { const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f); return hnoise(seed, i) * (1 - s) + hnoise(seed, i + 1) * s; };

function buildCoins(count) {
  const out = SEED.map(([id, symbol, name, price, supply], i) => ({ id, symbol, name, base: price, supply, rank: i + 1 }));
  for (let i = out.length; i < count; i++) {
    const k = String(i + 1).padStart(3, '0'), seed = hashStr('demo' + k);
    const base = Math.round((0.05 + ((seed % 5000) / 5000) * 20) * 1e4) / 1e4;
    out.push({ id: `demo-coin-${k}`, symbol: `dc${k}`, name: `Demo Coin ${k}`, base, supply: (5e8 * 0.97 ** (i - 50)) / base, rank: i + 1 });
  }
  out.forEach((c) => {
    const s = hashStr(c.id); c.seed = s; c.stable = STABLE.has(c.id);
    const v = c.stable ? 0.0004 : 0.03 + ((s % 100) / 100) * 0.06;
    c.p = { a1: v * 1.2, a2: v * 0.8, ph1: (s % 628) / 100, ph2: ((s >> 8) % 628) / 100, n1: v * 0.55, n2: v * 0.12, n3: c.stable ? 0.00005 : 0.0006, trend: c.stable ? 0 : (((s >> 4) % 200) - 90) / 100 };
  });
  return out;
}

export class MockProvider {
  constructor(cfg) {
    this.name = 'mock'; this.isMock = true; this.calls = 0;
    this.coins = buildCoins(Math.max(cfg.coinCount, 100)); this.byId = new Map(this.coins.map((c) => [c.id, c]));
    this.btc = this.byId.get('bitcoin');
  }

  priceUsd(c, t) {
    const p = c.p;
    const ln = p.a1 * Math.sin((2 * Math.PI * (t - EPOCH)) / (23 * DAY) + p.ph1) + p.a2 * Math.sin((2 * Math.PI * (t - EPOCH)) / (6.3 * DAY) + p.ph2)
      + p.n1 * smooth(c.seed, t / (6 * HOUR)) + p.n2 * smooth(c.seed ^ 0x9e37, t / HOUR) + p.n3 * smooth(c.seed ^ 0x51ed, t / 10000) + (p.trend * (t - EPOCH)) / (365 * DAY);
    return c.base * Math.exp(ln);
  }

  #get(id) { const c = this.byId.get(id); if (!c) throw notFound(`Coin '${id}' not found`); return c; }
  #fx(vs) { const f = FIAT[vs]; if (!f) return null; return f[2]; }
  #rate(vs) { const r = this.#fx(vs); if (r !== null) return r; const c = this.byId.get(vs); if (c) return 1 / this.priceUsd(c, Date.now()); return null; }
  #px(c, vs, t) { const r = this.#rate(vs); if (r === null) throw new Error(`unsupported vs_currency ${vs}`); return this.priceUsd(c, t) * r; }
  #now() { return Math.floor(Date.now() / 10000) * 10000; }

  async markets({ vs, perPage }) {
    this.calls++;
    const now = this.#now(), r = this.#rate(vs);
    if (r === null) throw notFound(`Unsupported vs_currency '${vs}'`);
    return this.coins.slice(0, perPage).map((c) => {
      const price = this.#px(c, vs, now), hourly = Array.from({ length: 168 }, (_, i) => this.#px(c, vs, now - (167 - i) * HOUR));
      const last24 = hourly.slice(-24), ath = Math.max(...Array.from({ length: 365 }, (_, i) => this.#px(c, vs, now - i * DAY)), price);
      const pct = (a, b) => ((a / b) - 1) * 100;
      return { id: c.id, symbol: c.symbol, name: c.name, image: `/api/mock-icon/${c.symbol}.svg`, price, marketCap: price * c.supply, rank: c.rank,
        volume: price * c.supply * (0.03 + 0.02 * (smooth(c.seed, now / DAY) + 1)), change1h: pct(price, hourly[166]), change24h: pct(price, this.#px(c, vs, now - DAY)),
        change7d: pct(price, hourly[0]), high24h: Math.max(...last24, price), low24h: Math.min(...last24, price), ath, athChangePct: pct(price, ath),
        circulatingSupply: c.supply, sparkline: hourly, lastUpdated: new Date(now).toISOString() };
    });
  }

  async coin(id, vs) {
    this.calls++;
    const c = this.#get(id), now = this.#now(), price = this.#px(c, vs, now), pct = (d) => ((price / this.#px(c, vs, now - d * DAY)) - 1) * 100;
    const daily = Array.from({ length: 365 }, (_, i) => ({ t: now - i * DAY, p: this.#px(c, vs, now - i * DAY) }));
    const hi = daily.reduce((a, b) => (b.p > a.p ? b : a)), lo = daily.reduce((a, b) => (b.p < a.p ? b : a)), h24 = Array.from({ length: 24 }, (_, i) => this.#px(c, vs, now - i * HOUR));
    return { id: c.id, symbol: c.symbol, name: c.name, image: `/api/mock-icon/${c.symbol}.svg`,
      description: `${c.name} (${c.symbol.toUpperCase()}) is a demo asset generated by the offline mock provider. Prices are synthetic and deterministic; switch COINGECKO_MODE=live for real market data.`,
      categories: c.stable ? ['Stablecoins'] : ['Cryptocurrency', 'Demo'], genesisDate: '2015-01-01',
      links: { homepage: 'https://www.coingecko.com', blockchain: [], twitter: null, reddit: null },
      market: { price, marketCap: price * c.supply, rank: c.rank, volume: price * c.supply * 0.04, high24h: Math.max(...h24), low24h: Math.min(...h24), change24h: pct(1), change7d: pct(7), change30d: pct(30), change1y: pct(364),
        ath: hi.p, athDate: new Date(hi.t).toISOString(), atl: lo.p, atlDate: new Date(lo.t).toISOString(), circulatingSupply: c.supply, totalSupply: c.supply * 1.05, maxSupply: null },
      lastUpdated: new Date(now).toISOString() };
  }

  async marketChart(id, vs, days) {
    this.calls++;
    const c = this.#get(id), now = this.#now();
    const d = days === 'max' ? 1460 : Number(days);
    const step = d <= 1 ? 5 * 60000 : d <= 90 ? HOUR : DAY, start = now - d * DAY;
    const prices = [], volumes = [];
    for (let t = Math.ceil(start / step) * step; t < now; t += step) {
      prices.push([t, this.#px(c, vs, t)]);
      volumes.push([t, this.#px(c, vs, t) * c.supply * 0.04 * (1 + 0.3 * smooth(c.seed ^ 77, t / (12 * HOUR)))]);
    }
    prices.push([now, this.#px(c, vs, now)]); volumes.push([now, volumes[volumes.length - 1]?.[1] || 0]);
    return { prices, volumes };
  }

  async simplePrice(ids, vs) {
    this.calls++;
    const now = this.#now(), out = {};
    for (const id of ids) { const c = this.byId.get(id); if (c) out[id] = this.#px(c, vs, now); }
    return out;
  }

  async exchangeRates() {
    this.calls++;
    const btcUsd = this.priceUsd(this.btc, this.#now()), out = {};
    out.btc = { name: 'Bitcoin', unit: 'BTC', value: 1, type: 'crypto' };
    out.eth = { name: 'Ether', unit: 'ETH', value: btcUsd / this.priceUsd(this.byId.get('ethereum'), this.#now()), type: 'crypto' };
    for (const [code, [name, unit, perUsd]] of Object.entries(FIAT)) out[code] = { name, unit, value: btcUsd * perUsd, type: 'fiat' };
    return out;
  }

  static iconSvg(symbol) {
    const hue = hashStr(symbol) % 360, label = symbol.slice(0, 3).toUpperCase();
    return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="hsl(${hue},65%,45%)"/><text x="32" y="38" font-family="Arial" font-size="${label.length > 3 ? 16 : 20}" font-weight="700" fill="#fff" text-anchor="middle">${label}</text></svg>`;
  }
}
