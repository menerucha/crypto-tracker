import mongoose from 'mongoose';
import { Coin, ChartCache, Watchlist } from './models/index.js';

export async function connectDb(uri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  await Promise.all([Coin.init(), ChartCache.init(), Watchlist.init()]);   // make sure unique indexes exist
  return mongoose.connection;
}
export const disconnectDb = () => mongoose.disconnect();
export const dbReady = () => mongoose.connection.readyState === 1;
