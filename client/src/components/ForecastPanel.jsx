import { useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useQuery } from '../hooks/useQuery.js';
import { Change, ErrorBox, Spinner } from './Common.jsx';
import { formatMoney, formatCompact, formatDate } from '../lib/format.js';

const HORIZONS = [3, 7, 14, 30];

export default function ForecastPanel({ id, currency }) {
  const [h, setH] = useState(7);
  const { data: d, error, loading, refetch } = useQuery(`/coins/${id}/forecast?vs=${currency}&horizon=${h}`, { ttl: 120_000, keepPrevious: true });
  const chart = useMemo(() => {
    if (!d) return [];
    const last = d.history[d.history.length - 1];
    return [...d.history.map((p) => ({ t: p.t, price: p.price })), { t: last.t, price: last.price, forecast: last.price, band: [last.price, last.price] },
      ...d.points.map((p) => ({ t: p.t, forecast: p.price, band: [p.lower, p.upper] }))];
  }, [d]);
  if (error && !d) return <ErrorBox error={error} onRetry={refetch} />;
  if (loading && !d) return <Spinner label="Fitting forecast models…" />;
  if (!d) return null;
  const m = d.metrics.mapePct, end = d.points[d.points.length - 1];
  return (
    <div>
      <div className="panel-bar">
        <div className="seg" role="group" aria-label="Forecast horizon">{HORIZONS.map((x) => <button key={x} className={h === x ? 'on' : ''} aria-pressed={h === x} onClick={() => setH(x)}>{x} days</button>)}</div>
        <div className="mini-stats"><span>Projected in {d.horizonDays}d <b>{formatMoney(end.price, currency)}</b></span><span><Change value={d.expectedChangePct} /></span></div>
      </div>
      <div className="chart" style={{ height: 340 }} data-testid="forecast-chart">
        <ResponsiveContainer><ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t) => formatDate(t)} stroke="var(--muted)" tick={{ fontSize: 12 }} minTickGap={40} />
          <YAxis domain={['auto', 'auto']} tickFormatter={(v) => formatCompact(v)} stroke="var(--muted)" tick={{ fontSize: 12 }} width={64} orientation="right" />
          <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} labelFormatter={(t) => formatDate(t, { year: 'numeric', month: 'short', day: 'numeric' })}
            formatter={(v, n) => [Array.isArray(v) ? `${formatMoney(v[0], currency)} – ${formatMoney(v[1], currency)}` : formatMoney(v, currency), n]} /><Legend />
          <Area dataKey="band" name="95% range" stroke="none" fill="var(--accent)" fillOpacity={0.18} isAnimationActive={false} />
          <Line dataKey="price" name="History" stroke="var(--text)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="forecast" name="Forecast" stroke="var(--accent)" strokeWidth={2.4} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
        </ComposedChart></ResponsiveContainer>
      </div>
      <div className="grid-2">
        <table className="kv"><thead><tr><th>Date</th><th>Forecast</th><th>95% range</th></tr></thead>
          <tbody>{d.points.filter((_, i) => d.points.length <= 7 || i % Math.ceil(d.points.length / 7) === 0 || i === d.points.length - 1).map((p) => <tr key={p.t}><th>{formatDate(p.t)}</th><td>{formatMoney(p.price, currency)}</td><td className="muted">{formatMoney(p.lower, currency)} – {formatMoney(p.upper, currency)}</td></tr>)}</tbody></table>
        <div>
          <h3>How reliable is this?</h3>
          <p className="small">Model: <b>linear trend + damped Holt smoothing</b>, averaged. Back-test over the last {d.metrics.holdoutDays} days (mean abs. % error):</p>
          <table className="kv"><tbody>
            <tr><th>Ensemble</th><td>{m.ensemble}%</td></tr><tr><th>Linear</th><td>{m.linear}%</td></tr><tr><th>Holt</th><td>{m.holt}%</td></tr><tr><th>Naive (“same as today”)</th><td>{m.naive}%</td></tr></tbody></table>
          <p className={`small ${d.metrics.beatsNaive ? 'up' : 'warn-text'}`}>{d.metrics.beatsNaive ? '✓ Beat the naive baseline in the back-test.' : '⚠ Did not beat the naive baseline in the back-test — treat with extra caution.'}</p>
          <p className="muted small">{d.disclaimer}</p>
        </div>
      </div>
    </div>
  );
}
