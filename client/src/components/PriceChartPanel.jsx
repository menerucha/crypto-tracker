import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, ComposedChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useQuery } from '../hooks/useQuery.js';
import { ErrorBox, Spinner } from './Common.jsx';
import { formatMoney, formatCompact, formatDate, formatDateTime, formatPercent, trendClass } from '../lib/format.js';

const RANGES = [['1', '24H'], ['7', '7D'], ['30', '30D'], ['90', '90D'], ['365', '1Y'], ['max', 'All']];

/** Keeps charts snappy: no more than ~`max` points are handed to the SVG renderer. */
export const downsample = (arr, max = 400) => { if (arr.length <= max) return arr; const step = arr.length / max; return Array.from({ length: max }, (_, i) => arr[Math.floor(i * step)]).concat(arr[arr.length - 1]); };

export default function PriceChartPanel({ id, currency }) {
  const [days, setDays] = useState('7');
  const { data, error, loading, refreshing, refetch } = useQuery(`/coins/${id}/history?vs=${currency}&days=${days}`, { ttl: 60_000, keepPrevious: true });
  const series = useMemo(() => {
    if (!data) return [];
    const vol = new Map(data.volumes.map(([t, v]) => [t, v]));
    return downsample(data.prices.map(([t, price]) => ({ t, price, volume: vol.get(t) ?? null })));
  }, [data]);
  const stats = useMemo(() => {
    if (!series.length) return null;
    const ps = series.map((p) => p.price), first = ps[0], last = ps[ps.length - 1];
    return { high: Math.max(...ps), low: Math.min(...ps), change: (last / first - 1) * 100, up: last >= first };
  }, [series]);
  const intraday = days === '1', color = stats?.up === false ? 'var(--down)' : 'var(--up)';
  const tick = (t) => (intraday ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : formatDate(t, days === '365' || days === 'max' ? { month: 'short', year: '2-digit' } : undefined));

  return (
    <div>
      <div className="panel-bar">
        <div className="seg" role="group" aria-label="Chart range">{RANGES.map(([k, l]) => <button key={k} className={days === k ? 'on' : ''} aria-pressed={days === k} onClick={() => setDays(k)}>{l}</button>)}</div>
        {stats && <div className="mini-stats"><span>High <b>{formatMoney(stats.high, currency)}</b></span><span>Low <b>{formatMoney(stats.low, currency)}</b></span><span>Change <b className={trendClass(stats.change)}>{formatPercent(stats.change)}</b></span>{refreshing && <span className="muted">updating…</span>}</div>}
      </div>
      {error && !data ? <ErrorBox error={error} onRetry={refetch} /> : loading && !data ? <Spinner label="Loading chart…" /> : (
        <>
          <div className="chart" style={{ height: 340 }} data-testid="price-chart">
            <ResponsiveContainer>
              <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.35} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={tick} stroke="var(--muted)" tick={{ fontSize: 12 }} minTickGap={40} />
                <YAxis domain={['auto', 'auto']} tickFormatter={(v) => formatCompact(v)} stroke="var(--muted)" tick={{ fontSize: 12 }} width={64} orientation="right" />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} labelFormatter={formatDateTime} formatter={(v) => [formatMoney(v, currency), 'Price']} />
                <Area type="monotone" dataKey="price" stroke={color} strokeWidth={2} fill="url(#pg)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="chart" style={{ height: 90 }} aria-label="Trading volume">
            <ResponsiveContainer>
              <ComposedChart data={series} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="t" hide /><YAxis hide /><Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} labelFormatter={formatDateTime} formatter={(v) => [formatCompact(v, currency), 'Volume']} />
                <Bar dataKey="volume" fill="var(--muted)" opacity={0.5} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
