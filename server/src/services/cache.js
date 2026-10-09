/**
 * In-memory TTL cache with request coalescing: concurrent callers asking for the same missing key
 * share ONE loader call, so N identical requests produce 1 upstream/API call.
 */
export class TtlCache {
  constructor({ maxEntries = 1000, now = () => Date.now() } = {}) {
    this.map = new Map(); this.inflight = new Map(); this.maxEntries = maxEntries; this.now = now;
    this.stats = { hits: 0, misses: 0, coalesced: 0 };
  }

  get(key) {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expires <= this.now()) { this.map.delete(key); return undefined; }
    return e.value;
  }

  set(key, value, ttlMs) {
    if (this.map.size >= this.maxEntries) this.map.delete(this.map.keys().next().value);  // evict oldest
    this.map.set(key, { value, expires: this.now() + ttlMs });
  }

  delete(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
  get size() { return this.map.size; }

  /** Returns cached value, joins an in-flight load, or runs `loader` (result cached for ttlMs). */
  async wrap(key, ttlMs, loader) {
    const hit = this.get(key);
    if (hit !== undefined) { this.stats.hits++; return { value: hit, cached: true }; }
    if (this.inflight.has(key)) { this.stats.coalesced++; return { value: await this.inflight.get(key), cached: false }; }
    this.stats.misses++;
    const p = (async () => { const v = await loader(); this.set(key, v, ttlMs); return v; })();
    this.inflight.set(key, p);
    try { return { value: await p, cached: false }; } finally { this.inflight.delete(key); }
  }
}
