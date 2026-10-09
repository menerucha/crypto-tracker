import mongoose from 'mongoose';
const { Schema } = mongoose;

/** Latest market snapshot per (coin, fiat). Doubles as a fallback when the upstream API is down. */
const coinSchema = new Schema({
  coinId: { type: String, required: true }, vs: { type: String, required: true },
  symbol: String, name: String, image: String,
  price: Number, marketCap: Number, rank: Number, volume: Number,
  change1h: Number, change24h: Number, change7d: Number,
  high24h: Number, low24h: Number, ath: Number, athChangePct: Number, circulatingSupply: Number,
  sparkline: [Number], lastUpdated: Date,
  fetchedAt: { type: Date, default: Date.now },
}, { versionKey: false });
coinSchema.index({ coinId: 1, vs: 1 }, { unique: true });
coinSchema.index({ vs: 1, rank: 1 });

/** Cached historical chart series. */
const chartSchema = new Schema({
  key: { type: String, required: true, unique: true },
  coinId: String, vs: String, days: String,
  // Stored column-wise (flat number arrays): ~40% smaller than [[ts, price], ...] and portable across Mongo-compatible servers
  ts: { type: [Number], default: [] }, px: { type: [Number], default: [] }, vts: { type: [Number], default: [] }, vol: { type: [Number], default: [] },
  fetchedAt: { type: Date, default: Date.now },
}, { versionKey: false });

/** Per-browser watchlist (anonymous client id; no accounts needed). */
const watchlistSchema = new Schema({
  clientId: { type: String, required: true, unique: true },
  coinIds: { type: [String], default: [] },
  updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

export const Coin = mongoose.models.Coin || mongoose.model('Coin', coinSchema);
export const ChartCache = mongoose.models.ChartCache || mongoose.model('ChartCache', chartSchema);
export const Watchlist = mongoose.models.Watchlist || mongoose.model('Watchlist', watchlistSchema);
