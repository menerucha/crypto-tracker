/** Number/date formatting helpers. All are total functions: bad input gives "—", never throws. */
const DASH = '—';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function formatMoney(value, currency = 'usd') {
  if (!isNum(value)) return DASH;
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 8;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: abs >= 1000 ? 0 : abs >= 1 ? 2 : 0, maximumFractionDigits: digits }).format(value);
  } catch {
    return `${value.toLocaleString('en-US', { maximumFractionDigits: digits })} ${currency.toUpperCase()}`;
  }
}

export function formatCompact(value, currency) {
  if (!isNum(value)) return DASH;
  const s = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
  if (!currency) return s;
  try { const sym = new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(0).replace(/[\d\s.,]/g, ''); return sym + s; } catch { return s; }
}

export function formatPercent(value, digits = 2) {
  if (!isNum(value)) return DASH;
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

export function formatNumber(value, max = 6) {
  if (!isNum(value)) return DASH;
  return value.toLocaleString('en-US', { maximumFractionDigits: max });
}

/** Amount with a sensible number of significant digits (for converter results of any magnitude). */
export function formatAmount(value) {
  if (!isNum(value)) return DASH;
  const abs = Math.abs(value);
  if (abs === 0) return '0';
  const max = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.0001 ? 6 : 10;
  return value.toLocaleString('en-US', { maximumFractionDigits: max });
}

export const formatDate = (t, opts = { month: 'short', day: 'numeric' }) => (t ? new Date(t).toLocaleDateString('en-US', opts) : DASH);
export const formatDateTime = (t) => (t ? new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : DASH);
export const trendClass = (v) => (!isNum(v) || v === 0 ? 'flat' : v > 0 ? 'up' : 'down');
