import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { subscribeStats, stats } from '../lib/api.js';
import { ErrorBoundary } from './Common.jsx';

export const CURRENCIES = ['usd', 'eur', 'gbp', 'inr', 'jpy', 'aud', 'cad', 'chf', 'cny'];

export default function Layout() {
  const { currency, setCurrency, watch, toast } = useApp();
  const [s, setS] = useState({ ...stats });
  const loc = useLocation();
  useEffect(() => subscribeStats(setS), []);
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">₿ <span>Crypto</span>Tracker</Link>
        <nav aria-label="Main">
          <NavLink to="/" end>Markets</NavLink>
          <NavLink to="/convert">Converter</NavLink>
          <NavLink to="/watchlist">Watchlist{watch.length > 0 && <em className="count">{watch.length}</em>}</NavLink>
        </nav>
        <label className="cur">Currency
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Display currency">{CURRENCIES.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}</select>
        </label>
      </header>
      <main><ErrorBoundary resetKey={loc.pathname}><Outlet /></ErrorBoundary></main>
      {toast && <div className="toast" role="alert">{toast}</div>}
      <footer>
        <span>Market data by CoinGecko · Forecasts are statistical estimates, not financial advice.</span>
        <span className="net" title="Requests the browser made vs. avoided by caching and de-duplication">network {s.network} · cached {s.cacheHits} · deduped {s.deduped}</span>
      </footer>
    </div>
  );
}
