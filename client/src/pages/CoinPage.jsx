import { lazy, Suspense, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { useQuery } from '../hooks/useQuery.js';
import { Change, ErrorBox, Spinner, SourceBadge, StaleBanner } from '../components/Common.jsx';
import { formatMoney, formatCompact, formatNumber, formatDate } from '../lib/format.js';

// Each tab (and the heavy charting library inside it) is only downloaded when first opened
const PriceChartPanel = lazy(() => import('../components/PriceChartPanel.jsx'));
const TrendPanel = lazy(() => import('../components/TrendPanel.jsx'));
const ForecastPanel = lazy(() => import('../components/ForecastPanel.jsx'));
const TABS = [['chart', 'Price chart'], ['trend', 'Trend analysis'], ['forecast', 'Forecast']];

export default function CoinPage() {
  const { id } = useParams();
  const { currency, watch, toggleWatch } = useApp();
  const [tab, setTab] = useState('chart');
  const { data: c, source, error, loading, updatedAt, refetch } = useQuery(`/coins/${id}?vs=${currency}`, { ttl: 60_000, refreshMs: 60_000 });

  if (loading && !c) return <Spinner label="Loading coin…" />;
  if (error && !c) return <><Link to="/" className="back">← Back to markets</Link><ErrorBox error={error} onRetry={error.status === 404 ? undefined : refetch} /></>;
  const m = c.market, starred = watch.includes(c.id);
  const athPct = m.ath && m.price ? (m.price / m.ath - 1) * 100 : null;
  const stats = [['Market cap', formatCompact(m.marketCap, currency)], ['24h volume', formatCompact(m.volume, currency)], ['24h high', formatMoney(m.high24h, currency)], ['24h low', formatMoney(m.low24h, currency)],
    ['All-time high', `${formatMoney(m.ath, currency)}${m.athDate ? ` (${formatDate(m.athDate, { year: 'numeric', month: 'short', day: 'numeric' })})` : ''}`], ['From ATH', athPct == null ? '—' : <Change value={athPct} />],
    ['Circulating supply', `${formatNumber(m.circulatingSupply, 0)} ${c.symbol.toUpperCase()}`], ['Max supply', m.maxSupply ? formatNumber(m.maxSupply, 0) : '∞ / n.a.'],
    ['7d', <Change value={m.change7d} />], ['30d', <Change value={m.change30d} />], ['1y', <Change value={m.change1y} />]];
  return (
    <section>
      <Link to="/" className="back">← Back to markets</Link>
      <StaleBanner source={source} />
      <div className="coin-head">
        <img src={c.image} alt="" width="48" height="48" decoding="async" />
        <div><h1>{c.name} <span className="sym">{c.symbol}</span>{m.rank && <span className="rank">Rank #{m.rank}</span>}</h1><div className="price-line"><span className="price">{formatMoney(m.price, currency)}</span><Change value={m.change24h} /> <span className="muted small">24h</span></div></div>
        <div className="head-tools"><SourceBadge source={source} updatedAt={updatedAt} /><button className={`btn ${starred ? 'active' : ''}`} aria-pressed={starred} onClick={() => toggleWatch(c.id)}>{starred ? '★ Watching' : '☆ Add to watchlist'}</button></div>
      </div>
      <div className="stats">{stats.map(([k, v]) => <div className="stat" key={k}><span>{k}</span><strong>{v}</strong></div>)}</div>

      <div className="tabs" role="tablist">{TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>)}</div>
      <div className="card panel" role="tabpanel">
        <Suspense fallback={<Spinner label="Loading chart…" />}>
          {tab === 'chart' && <PriceChartPanel id={c.id} currency={currency} />}
          {tab === 'trend' && <TrendPanel id={c.id} currency={currency} />}
          {tab === 'forecast' && <ForecastPanel id={c.id} currency={currency} />}
        </Suspense>
      </div>
      {(c.description || c.categories?.length > 0) && (
        <div className="card about"><h2>About {c.name}</h2>{c.description && <p>{c.description.length > 700 ? `${c.description.slice(0, 700)}…` : c.description}</p>}
          <div className="chips">{c.categories?.slice(0, 6).map((x) => <span key={x} className="chip">{x}</span>)}{c.links?.homepage && <a className="chip link" href={c.links.homepage} target="_blank" rel="noreferrer noopener">Website ↗</a>}</div></div>
      )}
    </section>
  );
}
