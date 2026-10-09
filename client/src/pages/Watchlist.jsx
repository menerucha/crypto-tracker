import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { useQuery } from '../hooks/useQuery.js';
import CoinTable from '../components/CoinTable.jsx';
import { ErrorBox, SourceBadge, Spinner } from '../components/Common.jsx';

export default function Watchlist() {
  const { currency, watch, toggleWatch } = useApp();
  const { data, source, error, loading, updatedAt, refetch } = useQuery(`/watchlist?vs=${currency}`, { ttl: 10_000, refreshMs: 30_000 });
  const coins = (data || []).filter((c) => watch.includes(c.id));          // optimistic: removals disappear instantly
  return (
    <section>
      <div className="page-head"><div><h1>Your watchlist</h1><p className="muted">Saved in the database for this browser.</p></div><SourceBadge source={source} updatedAt={updatedAt} /></div>
      {loading && !data ? <Spinner /> : error && !data ? <ErrorBox error={error} onRetry={refetch} /> : coins.length === 0
        ? <p className="empty">Nothing here yet. Star coins on the <Link to="/">Markets</Link> page to track them.</p>
        : <CoinTable coins={coins} currency={currency} watch={watch} onToggle={toggleWatch} />}
    </section>
  );
}
