import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { buildRouter } from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/common.js';

export function createApp({ config, service }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(','), exposedHeaders: ['X-Data-Source'] }));
  app.use(compression());
  app.use(express.json({ limit: '10kb' }));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: config.rateLimitPerMinute, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down.' } }) }));
  app.use('/api', buildRouter({ service, config }));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
