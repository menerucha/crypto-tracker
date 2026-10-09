import { useMemo, useState } from 'react';
import { CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useQuery } from '../hooks/useQuery.js';
import { ErrorBox, Spinner } from './Common.jsx';
import { formatMoney, formatCompact, formatDate, formatPercent, formatNumber } from '../lib/format.js';

const WINDOWS = [14, 30, 60, 90];
const TIP = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 };

export default function TrendPanel({ id, currency }) {
  const [win, setWin] = useState(30);
  const { data: d, error, loading, refetch } = useQuery(`/coins/${id}/trend?vs=${currency}&window=${win}`, { ttl: 120_000, keepPrevious: true });
  const chart = useMemo(() => (d ? d.series.slice(-Math.max(win * 2, 60)) : []), [d, win]);
  if (error && !d) return <ErrorBox error={error} onRetry={refetch} />;
  if (loading && !d) return <Spinner label="Analysing trend…" />;
  if (!d) return null;
  const { verdict, summary: s, signals } = d, tone = /bull/.test(verdict.label) ? 'up' : /bear/.test(verdict.label) ? 'down' : 'flat';
  const xAxis = <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t) => formatDate(t)} stroke="var(--muted)" tick={{ fontSize: 12 }} minTickGap={40} />;
  return (
    <div>
      <div className="panel-bar">
        <div className="seg" role="group" aria-label="Analysis window">{WINDOWS.map((w) => <button key={w} className={win === w ? 'on' : ''} aria-pressed={win === w} onClick={() => setWin(w)}>{w}D</button>)}</div>
        <div className={`verdict ${tone}`} data-testid="verdict">Overall: <strong>{verdict.label}</strong></div>
      </div>
      <div className="grid-2">
        <div>
          <div className="chart" style={{ height: 280 }}>
            <ResponsiveContainer><ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />{xAxis}
              <YAxis domain={['auto', 'auto']} tickFormatter={(v) => formatCompact(v)} stroke="var(--muted)" tick={{ fontSize: 12 }} width={60} orientation="right" />
              <Tooltip contentStyle={TIP} labelFormatter={(t) => formatDate(t, { year: 'numeric', month: 'short', day: 'numeric' })} formatter={(v, n) => [formatMoney(v, currency), n]} /><Legend />
              <Line dataKey="price" name="Price" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="sma7" name="SMA 7" stroke="var(--up)" strokeWidth={1.4} dot={false} connectNulls isAnimationActive={false} />
              <Line dataKey="sma25" name="SMA 25" stroke="var(--warn)" strokeWidth={1.4} dot={false} connectNulls isAnimationActive={false} />
            </ComposedChart></ResponsiveContainer>
          </div>
          <div className="chart" style={{ height: 130 }} aria-label="RSI">
            <ResponsiveContainer><LineChart data={chart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />{xAxis}<YAxis domain={[0, 100]} ticks={[30, 50, 70]} stroke="var(--muted)" tick={{ fontSize: 11 }} width={60} orientation="right" />
              <ReferenceLine y={70} stroke="var(--down)" strokeDasharray="4 4" /><ReferenceLine y={30} stroke="var(--up)" strokeDasharray="4 4" />
              <Tooltip contentStyle={TIP} labelFormatter={(t) => formatDate(t)} formatter={(v) => [formatNumber(v, 1), 'RSI(14)']} />
              <Line dataKey="rsi" stroke="var(--accent)" dot={false} connectNulls strokeWidth={1.6} isAnimationActive={false} />
            </LineChart></ResponsiveContainer>
          </div>
        </div>
        <div>
          <table className="kv"><tbody>
            <tr><th>Change ({s.windowDays}d)</th><td className={s.changePct >= 0 ? 'up' : 'down'}>{formatPercent(s.changePct)}</td></tr>
            <tr><th>High / Low</th><td>{formatMoney(s.high, currency)} / {formatMoney(s.low, currency)}</td></tr>
            <tr><th>Volatility (annualised)</th><td>{formatNumber(s.volatilityAnnualisedPct, 1)}%</td></tr>
            <tr><th>Max drawdown</th><td className="down">{formatPercent(s.maxDrawdownPct)}</td></tr>
            <tr><th>RSI (14)</th><td>{formatNumber(s.rsi14, 1)}</td></tr>
            <tr><th>SMA 7 / 25 / 50</th><td>{[s.sma7, s.sma25, s.sma50].map((v) => formatMoney(v, currency)).join(' / ')}</td></tr>
          </tbody></table>
          <h3>Signals</h3>
          <ul className="signals">{signals.map((x) => <li key={x.name}><span>{x.name}</span><em className={`pill ${x.reading}`}>{x.reading}</em></li>)}</ul>
          <p className="muted small">Indicators are computed on daily closes. They describe past price behaviour and are not trading advice.</p>
        </div>
      </div>
    </div>
  );
}
