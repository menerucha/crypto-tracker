import { describe, expect, it, vi } from 'vitest';
import { apiGet, apiSend, peek, stats, getClientId, ApiError } from '../lib/api.js';
import { mockApi } from './helpers.jsx';

describe('api client', () => {
  it('caches GETs within the TTL (one network call)', async () => {
    const calls = mockApi([['/x', { source: 'live', data: 1 }]]);
    await apiGet('/x', { ttl: 1000 }); await apiGet('/x', { ttl: 1000 }); await apiGet('/x', { ttl: 1000 });
    expect(calls).toHaveLength(1); expect(stats.network).toBe(1); expect(stats.cacheHits).toBe(2);
  });
  it('de-duplicates concurrent identical requests', async () => {
    const calls = mockApi([['/slow', async () => { await new Promise((r) => setTimeout(r, 20)); return { data: 'ok' }; }]]);
    const rs = await Promise.all([apiGet('/slow'), apiGet('/slow'), apiGet('/slow'), apiGet('/slow')]);
    expect(calls).toHaveLength(1); expect(stats.deduped).toBe(3); expect(rs.every((r) => r.data === 'ok')).toBe(true);
  });
  it('refetches after TTL expiry and when forced', async () => {
    vi.useFakeTimers(); vi.setSystemTime(1_000_000);
    const calls = mockApi([['/t', () => ({ data: Date.now() })]]);
    await apiGet('/t', { ttl: 5000 }); vi.setSystemTime(1_004_000); await apiGet('/t', { ttl: 5000 }); expect(calls).toHaveLength(1);
    vi.setSystemTime(1_006_000); await apiGet('/t', { ttl: 5000 }); expect(calls).toHaveLength(2);
    await apiGet('/t', { ttl: 5000, force: true }); expect(calls).toHaveLength(3);
  });
  it('maps API error bodies to ApiError and does not cache failures', async () => {
    let n = 0; const calls = mockApi([['/bad', () => (++n === 1 ? { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Coin missing' } } } : { data: 'fine' })]]);
    await expect(apiGet('/bad')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'Coin missing' });
    expect(peek('/bad')).toBeNull();
    expect((await apiGet('/bad')).data).toBe('fine'); expect(calls).toHaveLength(2);
  });
  it('reports network failures with a friendly error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed to fetch')));
    await expect(apiGet('/down')).rejects.toBeInstanceOf(ApiError);
    await expect(apiGet('/down')).rejects.toMatchObject({ code: 'NETWORK', status: 0 });
  });
  it('sends a stable anonymous client id and invalidates the watchlist cache on writes', async () => {
    const calls = mockApi([['/watchlist', { ids: ['bitcoin'] }]]);
    await apiGet('/watchlist?vs=usd'); expect(peek('/watchlist?vs=usd')).not.toBeNull();
    await apiSend('POST', '/watchlist/bitcoin');
    expect(peek('/watchlist?vs=usd')).toBeNull();
    const id = getClientId(); expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/); expect(getClientId()).toBe(id);
    expect(calls[0].headers['X-Client-Id']).toBe(id); expect(calls[1].method).toBe('POST');
  });
});
