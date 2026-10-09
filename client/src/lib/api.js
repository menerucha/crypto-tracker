/**
 * Tiny data layer in front of fetch():
 *  - TTL cache: same URL within `ttl` ms is served from memory (no network)
 *  - in-flight de-duplication: N components asking for the same URL share ONE request
 *  - typed errors, client id for the anonymous watchlist
 *  - counters, so the UI can show how many requests were saved
 */
const BASE = import.meta.env?.VITE_API_BASE || '/api';

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

const cache = new Map();      // path -> { res, at }
const inflight = new Map();   // path -> Promise
export const stats = { network: 0, cacheHits: 0, deduped: 0 };
const listeners = new Set();
const notify = () => listeners.forEach((l) => l({ ...stats }));
export const subscribeStats = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function getClientId() {
  try {
    let id = localStorage.getItem('ct.clientId');
    if (!id) { id = (crypto.randomUUID?.() || `c-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`).replace(/[^A-Za-z0-9_-]/g, ''); localStorage.setItem('ct.clientId', id); }
    return id;
  } catch { return 'anonymous-session-id'; }
}

async function request(path, init = {}) {
  let res;
  try { res = await fetch(BASE + path, { ...init, headers: { Accept: 'application/json', 'X-Client-Id': getClientId(), ...(init.headers || {}) } }); }
  catch { throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection.'); }
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON body */ }
  if (!res.ok) throw new ApiError(res.status, body?.error?.code || 'HTTP_ERROR', body?.error?.message || `Request failed (${res.status})`);
  return body ?? {};
}

/** GET with caching + dedupe. Resolves to the full JSON body ({ source, data, ...meta }). */
export async function apiGet(path, { ttl = 30_000, force = false } = {}) {
  const hit = cache.get(path);
  if (!force && hit && Date.now() - hit.at < ttl) { stats.cacheHits++; notify(); return hit.res; }
  if (inflight.has(path)) { stats.deduped++; notify(); return inflight.get(path); }
  stats.network++; notify();
  const p = request(path).then((res) => { cache.set(path, { res, at: Date.now() }); return res; }).finally(() => inflight.delete(path));
  inflight.set(path, p);
  return p;
}

/** Synchronous look at the cache (used for instant stale-while-revalidate rendering). */
export const peek = (path) => cache.get(path) || null;
export const invalidate = (prefix = '') => { for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k); };
export const clearCache = () => { cache.clear(); inflight.clear(); stats.network = stats.cacheHits = stats.deduped = 0; };

export async function apiSend(method, path) {
  const res = await request(path, { method });
  invalidate('/watchlist');
  return res;
}
