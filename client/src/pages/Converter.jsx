import { useMemo, useState } from 'react';
import { useQuery } from '../hooks/useQuery.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { ErrorBox, Spinner, SourceBadge } from '../components/Common.jsx';
import { formatAmount } from '../lib/format.js';

export default function Converter() {
  const [amount, setAmount] = useState('1'), [from, setFrom] = useState('bitcoin'), [to, setTo] = useState('usd');
  const coins = useQuery('/coins?vs=usd&perPage=100&sort=market_cap_desc', { ttl: 60_000 });
  const fiat = useQuery('/currencies', { ttl: 10 * 60_000 });
  const n = Number(amount), valid = amount.trim() !== '' && Number.isFinite(n) && n >= 0;
  const dAmount = useDebounce(amount, 300);
  const dn = Number(dAmount), ready = dAmount.trim() !== '' && Number.isFinite(dn) && dn >= 0;
  const conv = useQuery(ready ? `/convert?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&amount=${dn}` : null, { ttl: 15_000, refreshMs: 30_000, keepPrevious: true });

  const options = useMemo(() => ({
    coins: (coins.data || []).map((c) => ({ value: c.id, label: `${c.name} (${c.symbol.toUpperCase()})` })),
    fiat: (fiat.data || []).map((f) => ({ value: f.code, label: `${f.code.toUpperCase()} — ${f.name}` })),
  }), [coins.data, fiat.data]);

  const select = (id, label, value, onChange) => (
    <label className="field" htmlFor={id}><span>{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <optgroup label="Fiat">{options.fiat.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
        <optgroup label="Crypto">{options.coins.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
      </select>
    </label>
  );

  if ((coins.loading && !coins.data) || (fiat.loading && !fiat.data)) return <Spinner label="Loading currencies…" />;
  if (coins.error && !coins.data) return <ErrorBox error={coins.error} onRetry={coins.refetch} />;
  const r = conv.data;
  return (
    <section className="converter">
      <div className="page-head"><div><h1>Currency converter</h1><p className="muted">Convert between {options.coins.length || 100}+ cryptocurrencies and {options.fiat.length || 10}+ fiat currencies.</p></div><SourceBadge source={conv.source} updatedAt={conv.updatedAt} /></div>
      <div className="card conv-card">
        <label className="field" htmlFor="amount"><span>Amount</span><input id="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!valid} />
          {!valid && <small className="err">Enter a non-negative number</small>}</label>
        {select('from', 'From', from, setFrom)}
        <button className="btn swap" onClick={() => { setFrom(to); setTo(from); }} aria-label="Swap currencies" title="Swap">⇄</button>
        {select('to', 'To', to, setTo)}
      </div>
      <div className="card result" aria-live="polite">
        {conv.error && !r ? <ErrorBox error={conv.error} onRetry={conv.refetch} /> : !valid ? <p className="muted">Enter an amount to convert.</p> : !r ? <Spinner label="Converting…" /> : (
          <>
            <div className="muted">{formatAmount(r.amount)} {r.fromLabel} =</div>
            <div className="big" data-testid="result">{formatAmount(r.result)} <span>{r.toLabel}</span></div>
            <div className="muted small">1 {r.fromLabel} = {formatAmount(r.rate)} {r.toLabel} · 1 {r.toLabel} = {formatAmount(1 / r.rate)} {r.fromLabel}</div>
          </>
        )}
      </div>
    </section>
  );
}
