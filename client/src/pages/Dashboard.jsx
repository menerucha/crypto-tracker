import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useQuery } from '../hooks/useQuery.js';
import { useDebounce } from '../hooks/useDebounce.js';
import CoinTable from '../components/CoinTable.jsx';
import Pagination from '../components/Pagination.jsx';
import { ErrorBox, SourceBadge, StaleBanner } from '../components/Common.jsx';

const PER_PAGE = 20;

export default function Dashboard() {
  const { currency, watch, toggleWatch } = useApp();
  const [q, setQ] = useState(''), [page, setPage] = useState(1), [sort, setSort] = useState('market_cap_desc');
  const dq = useDebounce(q.trim(), 300);                       // don't hit the API on every keystroke
  useEffect(() => { setPage(1); }, [dq, sort, currency]);
  const path = `/coins?vs=${currency}&page=${page}&perPage=${PER_PAGE}&sort=${sort}${dq ? `&q=${encodeURIComponent(dq)}` : ''}`;
  const { data, meta, source, error, loading, refreshing, updatedAt, refetch } = useQuery(path, { ttl: 20_000, refreshMs: 30_000, keepPrevious: true });

  return (
    <section>
      <div className="page-head">
        <div><h1>Cryptocurrency prices</h1><p className="muted">Top {meta?.total ?? '100+'} coins by market cap · refreshes every 30s{refreshing ? ' · updating…' : ''}</p></div>
        <div className="head-tools">
          <SourceBadge source={source} updatedAt={updatedAt} />
          <input type="search" className="search" placeholder="Search coin or symbol…" aria-label="Search coins" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <StaleBanner source={source} />
      {error && !data ? <ErrorBox error={error} onRetry={refetch} /> : (
        <>
          <CoinTable coins={data || []} currency={currency} watch={watch} onToggle={toggleWatch} sort={sort} onSort={setSort} loading={loading} />
          {data && data.length === 0 && <p className="empty">No coins match “{dq}”.</p>}
          <Pagination page={meta?.page || page} totalPages={meta?.totalPages || 1} onChange={setPage} />
          {error && <p className="muted small">Couldn’t refresh: {error.message}</p>}
        </>
      )}
    </section>
  );
}
