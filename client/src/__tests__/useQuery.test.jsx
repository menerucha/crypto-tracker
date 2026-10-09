import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useQuery } from '../hooks/useQuery.js';
import { apiGet } from '../lib/api.js';
import { mockApi } from './helpers.jsx';

const setHidden = (hidden) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden }); document.dispatchEvent(new Event('visibilitychange')); };

describe('useQuery', () => {
  it('loads data, exposing source and meta', async () => {
    mockApi([['/a', { source: 'live', total: 3, data: [1, 2, 3] }]]);
    const { result } = renderHook(() => useQuery('/a'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual([1, 2, 3]));
    expect(result.current.source).toBe('live'); expect(result.current.meta.total).toBe(3); expect(result.current.loading).toBe(false);
  });
  it('renders cached data instantly (stale-while-revalidate) and does not refetch inside the TTL', async () => {
    const calls = mockApi([['/c', { data: 'cached' }]]);
    await apiGet('/c', { ttl: 60000 });
    const { result } = renderHook(() => useQuery('/c', { ttl: 60000 }));
    expect(result.current.data).toBe('cached'); expect(result.current.loading).toBe(false);
    await act(async () => {}); expect(calls).toHaveLength(1);
  });
  it('does nothing while disabled, loads when enabled', async () => {
    const calls = mockApi([['/d', { data: 1 }]]);
    const { result, rerender } = renderHook(({ on }) => useQuery('/d', { enabled: on }), { initialProps: { on: false } });
    await act(async () => {}); expect(calls).toHaveLength(0); expect(result.current.loading).toBe(false);
    rerender({ on: true }); await waitFor(() => expect(result.current.data).toBe(1)); expect(calls).toHaveLength(1);
  });
  it('keepPrevious keeps old data on screen while the next key loads', async () => {
    mockApi([[/\/p\?n=1/, { data: 'page1' }], [/\/p\?n=2/, async () => { await new Promise((r) => setTimeout(r, 40)); return { data: 'page2' }; }]]);
    const { result, rerender } = renderHook(({ n }) => useQuery(`/p?n=${n}`, { keepPrevious: true }), { initialProps: { n: 1 } });
    await waitFor(() => expect(result.current.data).toBe('page1'));
    rerender({ n: 2 });
    expect(result.current.data).toBe('page1'); expect(result.current.refreshing || result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toBe('page2'));
  });
  it('without keepPrevious the old data is dropped on key change', async () => {
    mockApi([[/\/q\?n=1/, { data: 'one' }], [/\/q\?n=2/, async () => { await new Promise((r) => setTimeout(r, 40)); return { data: 'two' }; }]]);
    const { result, rerender } = renderHook(({ n }) => useQuery(`/q?n=${n}`), { initialProps: { n: 1 } });
    await waitFor(() => expect(result.current.data).toBe('one')); rerender({ n: 2 });
    expect(result.current.data).toBeNull(); await waitFor(() => expect(result.current.data).toBe('two'));
  });
  it('polls on an interval, pauses while the tab is hidden, catches up when visible', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    let n = 0; const calls = mockApi([['/live', () => ({ data: ++n })]]);
    const { result } = renderHook(() => useQuery('/live', { refreshMs: 1000, ttl: 500 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); }); expect(result.current.data).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); expect(calls).toHaveLength(2);
    setHidden(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); }); expect(calls).toHaveLength(2);       // paused
    setHidden(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(10); }); expect(calls).toHaveLength(3);          // immediate catch-up
    expect(result.current.data).toBe(3);
  });
  it('surfaces errors and recovers via refetch', async () => {
    let fail = true; mockApi([['/e', () => (fail ? { status: 500, body: { error: { message: 'boom' } } } : { data: 'ok' })]]);
    const { result } = renderHook(() => useQuery('/e'));
    await waitFor(() => expect(result.current.error?.message).toBe('boom')); expect(result.current.data).toBeNull();
    fail = false; await act(async () => { result.current.refetch(); });
    await waitFor(() => expect(result.current.data).toBe('ok')); expect(result.current.error).toBeNull();
  });
  it('ignores responses from superseded requests (no stale overwrite)', async () => {
    mockApi([[/\/r\?k=a/, async () => { await new Promise((r) => setTimeout(r, 80)); return { data: 'A' }; }], [/\/r\?k=b/, { data: 'B' }]]);
    const { result, rerender } = renderHook(({ k }) => useQuery(`/r?k=${k}`), { initialProps: { k: 'a' } });
    rerender({ k: 'b' }); await waitFor(() => expect(result.current.data).toBe('B'));
    await new Promise((r) => setTimeout(r, 120)); expect(result.current.data).toBe('B');
  });
});
