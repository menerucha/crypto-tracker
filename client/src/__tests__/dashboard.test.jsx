import { describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dashboard from '../pages/Dashboard.jsx';
import Layout from '../components/Layout.jsx';
import { Route, Routes } from 'react-router-dom';
import { listBody, makeCoin, mockApi, renderApp } from './helpers.jsx';

const coins = Array.from({ length: 5 }, (_, i) => makeCoin(i + 1));
const base = (extra = []) => [[/^\/watchlist\?/, { source: 'db', ids: [], data: [] }], ...extra];
const coinCalls = (calls) => calls.paths().filter((p) => p.startsWith('/coins?'));

describe('Dashboard', () => {
  it('shows skeletons, then one row per coin with formatted data', async () => {
    mockApi(base([[/^\/coins\?/, listBody(coins, { total: 100, totalPages: 5 })]]));
    renderApp(<Dashboard />);
    expect(document.querySelectorAll('.skeleton-row').length).toBeGreaterThan(0);
    await screen.findByText('Coin 1');
    expect(screen.getAllByRole('row')).toHaveLength(1 + coins.length);
    const row = screen.getByTestId('row-coin-1');
    expect(within(row).getByText('$101.00')).toBeInTheDocument();
    expect(within(row).getByText(/2\.50%/)).toBeInTheDocument();                 // 24h change
    expect(screen.getByText(/Top 100 coins/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Coin 2/ })).toHaveAttribute('href', '/coin/coin-2');
    expect(document.querySelector('img[loading="lazy"]')).toBeTruthy();            // lazy-loaded logos
  });

  it('debounces search: typing fast sends ONE request with the final query', async () => {
    const calls = mockApi(base([[/^\/coins\?/, (p) => listBody(p.includes('q=doge') ? [makeCoin(9, { name: 'Dogecoin' })] : coins)]]));
    renderApp(<Dashboard />); await screen.findByText('Coin 1');
    const before = coinCalls(calls).length;
    await userEvent.type(screen.getByLabelText('Search coins'), 'doge', { delay: 20 });
    await screen.findByText('Dogecoin');
    const after = coinCalls(calls).slice(before);
    expect(after).toHaveLength(1); expect(after[0]).toContain('q=doge');
  });

  it('shows an empty state for no matches', async () => {
    mockApi(base([[/^\/coins\?/, (p) => listBody(p.includes('q=zzz') ? [] : coins)]]));
    renderApp(<Dashboard />); await screen.findByText('Coin 1');
    await userEvent.type(screen.getByLabelText('Search coins'), 'zzz');
    expect(await screen.findByText(/No coins match/)).toBeInTheDocument();
  });

  it('sorting by column re-queries the server and resets to page 1', async () => {
    const calls = mockApi(base([[/^\/coins\?/, listBody(coins, { totalPages: 3 })]]));
    renderApp(<Dashboard />); await screen.findByText('Coin 1');
    await userEvent.click(screen.getByRole('button', { name: 'Next →' }));
    await waitFor(() => expect(coinCalls(calls).some((p) => p.includes('page=2'))).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: /^Price/ }));
    await waitFor(() => expect(coinCalls(calls).at(-1)).toMatch(/sort=price_desc/)); expect(coinCalls(calls).at(-1)).toMatch(/page=1/);
    await userEvent.click(screen.getByRole('button', { name: /^Price/ }));
    await waitFor(() => expect(coinCalls(calls).at(-1)).toMatch(/sort=price_asc/));
  });

  it('keeps the previous page visible while the next one loads (no flicker)', async () => {
    mockApi(base([[/^\/coins\?/, async (p) => { if (p.includes('page=2')) await new Promise((r) => setTimeout(r, 150)); return listBody(p.includes('page=2') ? [makeCoin(21)] : coins, { totalPages: 2, page: p.includes('page=2') ? 2 : 1 }); }]]));
    renderApp(<Dashboard />); await screen.findByText('Coin 1');
    await userEvent.click(screen.getByRole('button', { name: 'Next →' }));
    expect(screen.getByText('Coin 1')).toBeInTheDocument();                     // still there mid-load
    await screen.findByText('Coin 21'); expect(screen.queryByText('Coin 1')).not.toBeInTheDocument();
  });

  it('currency switch in the layout re-queries with the new vs currency', async () => {
    const calls = mockApi(base([[/^\/coins\?/, listBody(coins)]]));
    renderApp(<Routes><Route element={<Layout />}><Route index element={<Dashboard />} /></Route></Routes>);
    await screen.findByText('Coin 1');
    await userEvent.selectOptions(screen.getByLabelText('Display currency'), 'eur');
    await waitFor(() => expect(coinCalls(calls).at(-1)).toMatch(/vs=eur/));
    expect(localStorage.getItem('ct.currency')).toBe('eur'); await screen.findByText('€101.00');
  });

  it('watchlist star is optimistic and persists via the API', async () => {
    const calls = mockApi([[/^\/watchlist\/coin-1/, (p, init) => ({ ids: ['coin-1'] })], ...base([[/^\/coins\?/, listBody(coins)]])]);
    renderApp(<Dashboard />); await screen.findByText('Coin 1');
    const star = screen.getByRole('button', { name: /Add Coin 1 to watchlist/ });
    await userEvent.click(star);
    expect(screen.getByRole('button', { name: /Remove Coin 1 from watchlist/ })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/watchlist/coin-1')).toBe(true));
  });
});

describe('Dashboard resilience', () => {
  it('rolls back an optimistic watchlist change on failure', async () => {
    mockApi([[/^\/watchlist\/coin-1/, { status: 400, body: { error: { code: 'BAD_REQUEST', message: 'Watchlist is limited to 50 coins' } } }], ...base([[/^\/coins\?/, listBody(coins)]])]);
    renderApp(<Routes><Route element={<Layout />}><Route index element={<Dashboard />} /></Route></Routes>);
    await screen.findByText('Coin 1');
    await userEvent.click(screen.getByRole('button', { name: /Add Coin 1 to watchlist/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('limited to 50');
    expect(screen.getByRole('button', { name: /Add Coin 1 to watchlist/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows an error box with Retry, which recovers', async () => {
    let fail = true;
    const calls = mockApi(base([[/^\/coins\?/, () => (fail ? { status: 503, body: { error: { code: 'UPSTREAM_RATE_LIMITED', message: 'Upstream is busy' } } } : listBody(coins))]]));
    renderApp(<Dashboard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Upstream is busy');
    fail = false; await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('Coin 1'); expect(screen.queryByRole('alert')).not.toBeInTheDocument(); expect(coinCalls(calls).length).toBe(2);
  });

  it('warns when the API is serving stale (database) data', async () => {
    mockApi(base([[/^\/coins\?/, listBody(coins, { source: 'stale' })]]));
    renderApp(<Dashboard />);
    expect(await screen.findByText(/live data provider is unreachable/i)).toBeInTheDocument(); expect(screen.getByText(/^Saved data/)).toBeInTheDocument();
  });

  it('auto-refreshes prices every 30s and flashes the changed price', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    let price = 100; const calls = mockApi(base([[/^\/coins\?/, () => listBody([makeCoin(1, { price: price++ })])]]));
    renderApp(<Dashboard />);
    await vi.advanceTimersByTimeAsync(50); expect(screen.getByText('$100.00')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); }); expect(screen.getByText('$101.00')).toBeInTheDocument();
    expect(screen.getByText('$101.00').className).toMatch(/flash-up/); expect(coinCalls(calls)).toHaveLength(2);
  });
});
