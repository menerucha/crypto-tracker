import { memo, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Sparkline from './Sparkline.jsx';
import { Change, SkeletonRows } from './Common.jsx';
import { formatMoney, formatCompact } from '../lib/format.js';

const SORT_COLS = { rank: ['market_cap_desc', 'market_cap_asc'], name: ['name_asc', 'name_asc'], price: ['price_desc', 'price_asc'], change24h: ['change24h_desc', 'change24h_asc'], volume: ['volume_desc', 'volume_desc'] };

/** Re-render a row only when something a user can SEE changed (the API returns fresh object identities every poll). */
const sameRow = (a, b) => a.currency === b.currency && a.starred === b.starred && a.coin === b.coin
  || (a.currency === b.currency && a.starred === b.starred && ['price', 'change1h', 'change24h', 'change7d', 'volume', 'marketCap', 'rank', 'id'].every((k) => a.coin[k] === b.coin[k])
    && a.coin.sparkline?.[a.coin.sparkline.length - 1] === b.coin.sparkline?.[b.coin.sparkline.length - 1]);

const CoinRow = memo(function CoinRow({ coin, currency, starred, onToggle }) {
  const prev = useRef(coin.price), [flash, setFlash] = useState('');
  useEffect(() => {
    if (prev.current !== coin.price && prev.current != null && coin.price != null) {
      setFlash(coin.price > prev.current ? 'flash-up' : 'flash-down');
      const t = setTimeout(() => setFlash(''), 900); prev.current = coin.price; return () => clearTimeout(t);
    }
    prev.current = coin.price; return undefined;
  }, [coin.price]);
  return (
    <tr data-testid={`row-${coin.id}`}>
      <td className="star"><button className={`star-btn ${starred ? 'on' : ''}`} aria-pressed={starred} aria-label={`${starred ? 'Remove' : 'Add'} ${coin.name} ${starred ? 'from' : 'to'} watchlist`} onClick={() => onToggle(coin.id)}>{starred ? '★' : '☆'}</button></td>
      <td className="num muted">{coin.rank ?? '—'}</td>
      <td><Link to={`/coin/${coin.id}`} className="coin-link"><img src={coin.image} alt="" width="26" height="26" loading="lazy" decoding="async" /><span className="coin-name">{coin.name}</span><span className="sym">{coin.symbol}</span></Link></td>
      <td className={`num strong ${flash}`}>{formatMoney(coin.price, currency)}</td>
      <td className="num hide-sm"><Change value={coin.change1h} /></td>
      <td className="num"><Change value={coin.change24h} /></td>
      <td className="num hide-sm"><Change value={coin.change7d} /></td>
      <td className="num hide-md">{formatCompact(coin.volume, currency)}</td>
      <td className="num hide-md">{formatCompact(coin.marketCap, currency)}</td>
      <td className="hide-sm"><Sparkline values={coin.sparkline} /></td>
    </tr>
  );
}, sameRow);

export default function CoinTable({ coins, currency, watch, onToggle, sort, onSort, loading }) {
  const watchSet = new Set(watch);
  const th = (col, children, cls = '') => {
    const [desc, asc] = SORT_COLS[col] || [], active = sort === desc || sort === asc;
    return (
      <th key={col} className={`${cls} ${onSort && SORT_COLS[col] ? 'sortable' : ''}`} aria-sort={active ? (sort === desc && desc !== asc && col !== 'name' ? 'descending' : 'ascending') : 'none'}>
        {onSort && SORT_COLS[col] ? <button onClick={() => onSort(sort === desc ? asc : desc)}>{children}{active ? (sort === desc && col !== 'name' ? ' ↓' : ' ↑') : ''}</button> : children}
      </th>
    );
  };
  return (
    <div className="table-wrap">
      <table className="coins">
        <thead><tr><th aria-label="Watchlist" />{th('rank', '#', 'num')}{th('name', 'Coin')}{th('price', 'Price', 'num')}<th className="num hide-sm">1h</th>{th('change24h', '24h', 'num')}<th className="num hide-sm">7d</th>{th('volume', '24h Volume', 'num hide-md')}<th className="num hide-md">Market Cap</th><th className="hide-sm">Last 7 days</th></tr></thead>
        <tbody>
          {loading && !coins.length ? <SkeletonRows rows={10} cols={10} /> : coins.map((c) => <CoinRow key={c.id} coin={c} currency={currency} starred={watchSet.has(c.id)} onToggle={onToggle} />)}
        </tbody>
      </table>
    </div>
  );
}
