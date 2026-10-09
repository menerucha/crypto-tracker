import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TrendPanel from '../components/TrendPanel.jsx';
import ForecastPanel from '../components/ForecastPanel.jsx';
import PriceChartPanel from '../components/PriceChartPanel.jsx';
import { mockApi, renderApp } from './helpers.jsx';

const DAY = 86400000, T0 = Date.UTC(2026, 5, 1);
const wl = [/^\/watchlist\?/, { source: 'db', ids: [], data: [] }];

describe('TrendPanel', () => {
  const body = { source: 'live', data: { verdict: { label: 'strong bullish', score: 3 }, signals: [{ name: 'Price vs SMA(25)', reading: 'bullish' }, { name: 'RSI(14)', reading: 'overbought' }],
    summary: { windowDays: 30, changePct: 12.5, high: 70000, low: 60000, volatilityAnnualisedPct: 55.2, maxDrawdownPct: -8.1, rsi14: 71.3, sma7: 66000, sma25: 63000, sma50: 61000 },
    series: Array.from({ length: 90 }, (_, i) => ({ t: T0 + i * DAY, price: 60000 + i * 100, sma7: 60000, sma25: 59000, rsi: 50 })) } };
  it('shows verdict, indicator table and signals; window buttons re-query', async () => {
    const calls = mockApi([wl, [/\/trend\?/, body]]);
    renderApp(<TrendPanel id="bitcoin" currency="usd" />);
    expect(await screen.findByTestId('verdict')).toHaveTextContent('strong bullish');
    expect(screen.getByText('+12.50%')).toBeInTheDocument(); expect(screen.getByText('71.3')).toBeInTheDocument(); expect(screen.getByText('overbought')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '60D' }));
    await waitFor(() => expect(calls.paths().some((p) => p.includes('/coins/bitcoin/trend?vs=usd&window=60'))).toBe(true));
  });
  it('shows an error state', async () => {
    mockApi([wl, [/\/trend\?/, { status: 400, body: { error: { message: 'Not enough price history' } } }]]);
    renderApp(<TrendPanel id="x" currency="usd" />); expect(await screen.findByRole('alert')).toHaveTextContent('Not enough price history');
  });
});

describe('ForecastPanel', () => {
  const pts = Array.from({ length: 7 }, (_, i) => ({ t: T0 + (31 + i) * DAY, price: 100 + i, lower: 95 + i, upper: 105 + i, linear: 100, holt: 100 }));
  const body = { source: 'live', data: { horizonDays: 7, lastPrice: 99, points: pts, expectedChangePct: 7.07, history: Array.from({ length: 30 }, (_, i) => ({ t: T0 + i * DAY, price: 90 + i / 3 })),
    metrics: { holdoutDays: 7, mapePct: { linear: 2.1, holt: 1.9, ensemble: 1.7, naive: 2.5 }, beatsNaive: true }, disclaimer: 'Not financial advice.' } };
  it('shows projection, back-test metrics and disclaimer; horizon buttons re-query', async () => {
    const calls = mockApi([wl, [/\/forecast\?/, body]]);
    renderApp(<ForecastPanel id="bitcoin" currency="usd" />);
    expect(await screen.findByText(/Beat the naive baseline/)).toBeInTheDocument();
    expect(screen.getByText('1.7%')).toBeInTheDocument(); expect(screen.getByText(/Not financial advice/)).toBeInTheDocument(); expect(screen.getAllByText('$106.00').length).toBeGreaterThanOrEqual(1);
    await userEvent.click(screen.getByRole('button', { name: '14 days' }));
    await waitFor(() => expect(calls.paths().some((p) => p.includes('horizon=14'))).toBe(true));
  });
  it('warns when the model did not beat the naive baseline', async () => {
    mockApi([wl, [/\/forecast\?/, { ...body, data: { ...body.data, metrics: { ...body.data.metrics, beatsNaive: false } } }]]);
    renderApp(<ForecastPanel id="bitcoin" currency="usd" />); expect(await screen.findByText(/Did not beat the naive baseline/)).toBeInTheDocument();
  });
});

describe('PriceChartPanel', () => {
  const hist = { source: 'live', data: { prices: Array.from({ length: 50 }, (_, i) => [T0 + i * 3600000, 100 + i]), volumes: Array.from({ length: 50 }, (_, i) => [T0 + i * 3600000, 1e6]) } };
  it('shows range stats and requests the selected range', async () => {
    const calls = mockApi([wl, [/\/history\?/, hist]]);
    renderApp(<PriceChartPanel id="bitcoin" currency="usd" />);
    expect(await screen.findByText('$149.00')).toBeInTheDocument();           // high
    expect(calls.paths().some((p) => p.includes('days=7'))).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: '1Y' }));
    await waitFor(() => expect(calls.paths().some((p) => p.includes('days=365'))).toBe(true));
    expect(screen.getByRole('button', { name: '1Y' })).toHaveAttribute('aria-pressed', 'true');
  });
});
