import { AppError, badRequest } from '../errors.js';

export const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const sendData = (res, { data, source }, extra = {}) => {
  res.set('X-Data-Source', source);
  if (source === 'live' || source === 'mock') res.set('Cache-Control', 'no-cache'); else res.set('Cache-Control', 'public, max-age=5');
  res.json({ source, ...extra, data });
};

const ID_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;
const VS_RE = /^[a-z]{2,10}$/;
export const parseId = (v, name = 'id') => { const s = String(v ?? '').toLowerCase(); if (!ID_RE.test(s)) throw badRequest(`Invalid ${name}`); return s; };
export const parseVs = (v) => { const s = String(v ?? 'usd').toLowerCase(); if (!VS_RE.test(s)) throw badRequest('Invalid vs currency'); return s; };
export const parseIntIn = (v, def, min, max, name) => {
  if (v === undefined || v === '') return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`${name} must be an integer between ${min} and ${max}`);
  return n;
};

export const notFoundHandler = (req, res, next) => next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`));

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  let status = err.status || 500, code = err.code || 'INTERNAL_ERROR', message = err.message;
  if (err.type === 'entity.parse.failed') { status = 400; code = 'BAD_JSON'; message = 'Malformed JSON body'; }
  if (err.name === 'CastError' || err.name === 'ValidationError') { status = 400; code = 'BAD_REQUEST'; }
  if (status >= 500 && !err.status) { console.error('[unhandled]', err); message = 'Internal server error'; }
  if (err.retryAfter) res.set('Retry-After', String(err.retryAfter));
  res.status(status).json({ error: { code, message, ...(err.details ? { details: err.details } : {}) } });
};
