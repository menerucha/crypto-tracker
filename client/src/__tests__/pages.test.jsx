import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import Converter from '../pages/Converter.jsx';
import CoinPage from '../pages/CoinPage.jsx';
import Watchlist from '../pages/Watchlist.jsx';
import { listBody, makeCoin, mockApi, renderApp } from './helpers.jsx';
import { clearCache } from '../lib/api.js';

vi.mock('../components/PriceChartPanel.jsx', () => ({ default: ({ id }) => <div data-testid="chart-panel">chart:{id}</div> }));
vi.mock('../components/TrendPanel.jsx', () => ({ default: ({ id }) => <div data-testid="trend-panel">trend:{id}</div> }));
vi.mock('../components/ForecastPanel.jsx', () => ({ default: ({ id }) => <div data-testid="forecast-panel">forecast:{id}</div> }));

const coins = [makeCoin(1, { id: 'bitcoin', name: 'Bitcoin', symbol: 'btc' }), makeCoin(2, { id: 'ethereum', name: 'Ethereum', symbol: 'eth' })];
const fiat = { source: 'live', data: [{ code: 'usd', name: 'US Dollar', symbol: '$' }, { code: 'eur', name: 'Euro', symbol: '€' }] };
const wl = [/^\/watchlist\?/, { source: 'db', ids: [], data: [] }];

describe('Converter', () => {
  const conv = (p) => { const u = new URL('http://x' + p), a = Number(u.searchParams.get('amount')), from = u.searchParams.get('from'), to = u.searchParams.get('to');
    const rate = from === 'bitcoin' ? 65000 : to === 'bitcoin' ? 1 / 65000 : 1; return { source: 'live', data: { from, to, fromLabel: from.toUpperCase(), toLabel: to.toUpperCase(), amount: a, rate, result: a * rate } }; };

  it('converts and displays the result and the reverse rate', async () => {
    mockApi([wl, [/^\/coins\?/, listBody(coins)], ['/currencies', fiat], [/^\/convert/, conv]]);
    renderApp(<Converter />);
    expect(await screen.findByTestId('result')).toHaveTextContent('65,000 USD');
    expect(screen.getByText(/1 BITCOIN = 65,000 USD/)).toBeInTheDocument();
    expect(screen.getByLabelText('From')).toHaveDisplayValue('Bitcoin (BTC)');
  });

  it('debounces amount typing and recomputes', async () => {
    const calls = mockApi([wl, [/^\/coins\?/, listBody(coins)], ['/currencies', fiat], [/^\/convert/, conv]]);
    renderApp(<Converter />); await screen.findByTestId('result');
    const n0 = calls.paths().filter((p) => p.startsWith('/convert')).length;
    const amt = screen.getByLabelText('Amount'); await userEvent.clear(amt); await userEvent.type(amt, '2.5', { delay: 10 });
    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('162,500 USD'));
    expect(calls.paths().filter((p) => p.startsWith('/convert')).length - n0).toBe(1);
  });

  it('validates the amount without calling the API', async () => {
    const calls = mockApi([wl, [/^\/coins\?/, listBody(coins)], ['/currencies', fiat], [/^\/convert/, conv]]);
    renderApp(<Converter />); await screen.findByTestId('result');
    const n0 = calls.paths().filter((p) => p.startsWith('/convert')).length;
    const amt = screen.getByLabelText('Amount'); await userEvent.clear(amt); await userEvent.type(amt, 'abc');
    expect(await screen.findByText('Enter a non-negative number')).toBeInTheDocument(); expect(amt).toHaveAttribute('aria-invalid', 'true');
    await new Promise((r) => setTimeout(r, 450)); expect(calls.paths().filter((p) => p.startsWith('/convert')).length).toBe(n0);
  });

  it('swap exchanges the currencies', async () => {
    const calls = mockApi([wl, [/^\/coins\?/, listBody(coins)], ['/currencies', fiat], [/^\/convert/, conv]]);
    renderApp(<Converter />); await screen.findByTestId('result');
    await userEvent.click(screen.getByRole('button', { name: 'Swap currencies' }));
    await waitFor(() => expect(calls.paths().at(-1)).toMatch(/from=usd&to=bitcoin/));
    expect(screen.getByLabelText('To')).toHaveDisplayValue('Bitcoin (BTC)');
  });

  it('shows an error when conversion fails', async () => {
    mockApi([wl, [/^\/coins\?/, listBody(coins)], ['/currencies', fiat], [/^\/convert/, { status: 404, body: { error: { code: 'NOT_FOUND', message: "Unknown currency or coin 'x'" } } }]]);
    renderApp(<Converter />); expect(await screen.findByRole('alert')).toHaveTextContent('Unknown currency');
  });
});

describe('CoinPage', () => {
  const detail = { source: 'live', data: { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', image: '/b.png', description: 'Digital gold', categories: ['Layer 1'], links: { homepage: 'https://bitcoin.org' },
    market: { price: 65000, marketCap: 1.2e12, rank: 1, volume: 3e10, high24h: 66000, low24h: 64000, change24h: 2, change7d: -1, change30d: 10, change1y: 80, ath: 73000, athDate: '2024-03-14T00:00:00Z', circulatingSupply: 19.7e6, maxSupply: 21e6 } } };
  const routes = (extra = []) => [wl, [/^\/coins\/bitcoin\?/, detail], ...extra];
  const page = () => renderApp(<Routes><Route path="/coin/:id" element={<CoinPage />} /></Routes>, { route: '/coin/bitcoin' });

  it('renders header, stats and the chart tab by default', async () => {
    mockApi(routes()); page();
    expect(await screen.findByRole('heading', { level: 1, name: /Bitcoin/ })).toBeInTheDocument();
    expect(screen.getByText('$65,000')).toBeInTheDocument(); expect(screen.getByText('Rank #1')).toBeInTheDocument(); expect(screen.getByText('$1.2T')).toBeInTheDocument();
    expect(await screen.findByTestId('chart-panel')).toHaveTextContent('chart:bitcoin'); expect(screen.getByText('Digital gold')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Website/ })).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('mounts trend/forecast panels only when their tab is opened (lazy)', async () => {
    mockApi(routes()); page(); await screen.findByTestId('chart-panel');
    expect(screen.queryByTestId('trend-panel')).not.toBeInTheDocument(); expect(screen.queryByTestId('forecast-panel')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Trend analysis' })); expect(await screen.findByTestId('trend-panel')).toBeInTheDocument(); expect(screen.queryByTestId('chart-panel')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Forecast' })); expect(await screen.findByTestId('forecast-panel')).toBeInTheDocument();
  });

  it('shows Not found for unknown coins and can add to watchlist', async () => {
    mockApi([wl, [/^\/coins\/nope/, { status: 404, body: { error: { code: 'NOT_FOUND', message: "Coin 'nope' not found" } } }]]);
    renderApp(<Routes><Route path="/coin/:id" element={<CoinPage />} /></Routes>, { route: '/coin/nope' });
    expect(await screen.findByRole('alert')).toHaveTextContent("Coin 'nope' not found"); expect(screen.getByText('Not found')).toBeInTheDocument();
  });

  it('adds the coin to the watchlist from the header button', async () => {
    const calls = mockApi(routes([[/^\/watchlist\/bitcoin/, { ids: ['bitcoin'] }]])); page();
    await userEvent.click(await screen.findByRole('button', { name: /Add to watchlist/ }));
    expect(await screen.findByRole('button', { name: /Watching/ })).toHaveAttribute('aria-pressed', 'true'); expect(calls.some((c) => c.method === 'POST')).toBe(true);
  });
});

describe('Watchlist page', () => {
  it('shows an empty state, and lists saved coins', async () => {
    mockApi([[/^\/watchlist\?/, { source: 'db', ids: [], data: [] }]]);
    const { unmount } = renderApp(<Watchlist />); expect(await screen.findByText(/Nothing here yet/)).toBeInTheDocument(); unmount(); clearCache();
    mockApi([[/^\/watchlist\?/, { source: 'live', ids: ['bitcoin', 'ethereum'], data: coins }]]);
    renderApp(<Watchlist />); expect(await screen.findByText('Bitcoin')).toBeInTheDocument(); expect(screen.getByText('Ethereum')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove Bitcoin from watchlist/ })).toBeInTheDocument();
  });

  it('removing a coin makes it disappear immediately', async () => {
    mockApi([[/^\/watchlist\?/, { source: 'live', ids: ['bitcoin', 'ethereum'], data: coins }], [/^\/watchlist\/bitcoin/, { ids: ['ethereum'] }]]);
    renderApp(<Watchlist />); await screen.findByText('Bitcoin');
    await userEvent.click(screen.getByRole('button', { name: /Remove Bitcoin/ }));
    await waitFor(() => expect(screen.queryByText('Bitcoin')).not.toBeInTheDocument()); expect(screen.getByText('Ethereum')).toBeInTheDocument();
  });
});
