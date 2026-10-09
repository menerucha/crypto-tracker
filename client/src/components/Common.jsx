import { Component } from 'react';
import { trendClass, formatPercent } from '../lib/format.js';

export const Change = ({ value, digits = 2 }) => (
  <span className={`chg ${trendClass(value)}`}>{value > 0 ? '▲ ' : value < 0 ? '▼ ' : ''}{formatPercent(value, digits).replace(/^[+-]/, '')}</span>
);

export function ErrorBox({ error, onRetry }) {
  return (
    <div className="error-box" role="alert">
      <strong>{error?.status === 404 ? 'Not found' : 'Something went wrong'}</strong>
      <span>{error?.message || 'Unexpected error'}</span>
      {onRetry && <button className="btn" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export const Spinner = ({ label = 'Loading…' }) => <div className="spinner" role="status" aria-live="polite"><span className="dot" />{label}</div>;

export function SkeletonRows({ rows = 10, cols = 10 }) {
  return Array.from({ length: rows }, (_, i) => (
    <tr key={i} className="skeleton-row" aria-hidden="true">{Array.from({ length: cols }, (_, j) => <td key={j}><span className="skeleton" /></td>)}</tr>
  ));
}

/** Tells the user where the numbers came from; warns loudly when serving stale data. */
export function SourceBadge({ source, updatedAt }) {
  if (!source) return null;
  const label = { live: 'Live', cache: 'Live (cached)', mock: 'Demo data', stale: 'Saved data', db: 'Saved' }[source] || source;
  return (
    <span className={`badge badge-${source}`} title={updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString()}` : ''}>
      <span className="pulse" />{label}{updatedAt ? ` · ${new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}
    </span>
  );
}

export const StaleBanner = ({ source }) => source === 'stale'
  ? <div className="banner warn" role="status">The live data provider is unreachable — showing the last saved prices from our database.</div> : null;

export class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  render() { return this.state.error ? <ErrorBox error={{ message: 'This view crashed. Try reloading.' }} onRetry={() => this.setState({ error: null })} /> : this.props.children; }
}
