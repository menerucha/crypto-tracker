/** Pure numeric helpers for trend analysis. Arrays are aligned with the input; unavailable entries are null. */

export const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
export const stdev = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

export function sma(values, period) {
  const out = new Array(values.length).fill(null); let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]; if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values, period) {
  const out = new Array(values.length).fill(null), k = 2 / (period + 1);
  if (values.length < period) return out;
  let prev = mean(values.slice(0, period)); out[period - 1] = prev;
  for (let i = period; i < values.length; i++) { prev = values[i] * k + prev * (1 - k); out[i] = prev; }
  return out;
}

/** Wilder's RSI. Returns null entries until `period` changes are available. */
export function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) { const d = values[i] - values[i - 1]; if (d >= 0) gain += d; else loss -= d; }
  gain /= period; loss /= period;
  const calc = () => (loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss));
  out[period] = calc();
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period; loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = calc();
  }
  return out;
}

export function macd(values, fast = 12, slow = 26, signalP = 9) {
  const ef = ema(values, fast), es = ema(values, slow);
  const line = values.map((_, i) => (ef[i] !== null && es[i] !== null ? ef[i] - es[i] : null));
  const first = line.findIndex((v) => v !== null);
  const signal = new Array(values.length).fill(null);
  if (first >= 0) { const sig = ema(line.slice(first), signalP); sig.forEach((v, i) => { signal[first + i] = v; }); }
  const hist = line.map((v, i) => (v !== null && signal[i] !== null ? v - signal[i] : null));
  return { line, signal, hist };
}

export const logReturns = (p) => p.slice(1).map((x, i) => Math.log(x / p[i]));
/** Annualised volatility (%) from daily closes. */
export const annualisedVolatility = (daily) => stdev(logReturns(daily)) * Math.sqrt(365) * 100;

export function maxDrawdown(values) {
  let peak = values[0], mdd = 0;
  for (const v of values) { if (v > peak) peak = v; mdd = Math.min(mdd, v / peak - 1); }
  return mdd * 100;
}

/** Ordinary least squares y = a + b*x. Returns slope, intercept, r2, residual std error. */
export function linreg(x, y) {
  const n = x.length, mx = mean(x), my = mean(y);
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxx += (x[i] - mx) ** 2; sxy += (x[i] - mx) * (y[i] - my); syy += (y[i] - my) ** 2; }
  const slope = sxx === 0 ? 0 : sxy / sxx, intercept = my - slope * mx;
  const sse = y.reduce((s, yi, i) => s + (yi - (intercept + slope * x[i])) ** 2, 0);
  return { slope, intercept, r2: syy === 0 ? 1 : 1 - sse / syy, se: n > 2 ? Math.sqrt(sse / (n - 2)) : 0, sxx, mx, n };
}

/** Collapses [[ts, price], ...] (any granularity) into one close per UTC day. */
export function toDaily(points) {
  const days = new Map();
  for (const [t, p] of points) if (Number.isFinite(p) && p > 0) days.set(Math.floor(t / 86400000), [t, p]);
  return [...days.entries()].sort((a, b) => a[0] - b[0]).map(([d, [, p]]) => [d * 86400000, p]);
}

/** Combines the indicators into a readable bullish/bearish verdict. */
export function analyseTrend(dailyPoints, windowDays = 30) {
  const ts = dailyPoints.map((p) => p[0]), px = dailyPoints.map((p) => p[1]), n = px.length, last = px[n - 1];
  const s7 = sma(px, 7), s25 = sma(px, 25), s50 = sma(px, 50), r = rsi(px, 14), m = macd(px), e12 = ema(px, 12), e26 = ema(px, 26);
  const w = px.slice(-Math.min(windowDays + 1, n)), wdays = w.length - 1;
  const lastOf = (a) => a[a.length - 1];
  const rsiNow = lastOf(r), histNow = lastOf(m.hist), s7n = lastOf(s7), s25n = lastOf(s25);

  const signals = []; let score = 0;
  if (s25n !== null) { const v = last > s25n ? 1 : -1; score += v; signals.push({ name: 'Price vs SMA(25)', value: +(((last / s25n) - 1) * 100).toFixed(2), unit: '%', reading: v > 0 ? 'bullish' : 'bearish' }); }
  if (s7n !== null && s25n !== null) { const v = s7n > s25n ? 1 : -1; score += v; signals.push({ name: 'SMA(7) vs SMA(25)', value: +(((s7n / s25n) - 1) * 100).toFixed(2), unit: '%', reading: v > 0 ? 'bullish' : 'bearish' }); }
  if (histNow !== null) { const v = histNow > 0 ? 1 : -1; score += v; signals.push({ name: 'MACD histogram', value: +histNow.toPrecision(4), unit: '', reading: v > 0 ? 'bullish' : 'bearish' }); }
  if (rsiNow !== null) {
    const v = rsiNow >= 70 ? -0.5 : rsiNow <= 30 ? 0.5 : 0; score += v;
    signals.push({ name: 'RSI(14)', value: +rsiNow.toFixed(1), unit: '', reading: rsiNow >= 70 ? 'overbought' : rsiNow <= 30 ? 'oversold' : 'neutral' });
  }
  const label = score >= 2.5 ? 'strong bullish' : score >= 1 ? 'bullish' : score <= -2.5 ? 'strong bearish' : score <= -1 ? 'bearish' : 'neutral';

  return {
    verdict: { label, score },
    signals,
    summary: {
      price: last, windowDays: wdays, changePct: +((last / w[0] - 1) * 100).toFixed(2),
      high: Math.max(...w), low: Math.min(...w), volatilityAnnualisedPct: +annualisedVolatility(w).toFixed(2), maxDrawdownPct: +maxDrawdown(w).toFixed(2),
      sma7: s7n, sma25: s25n, sma50: lastOf(s50), rsi14: rsiNow, macd: lastOf(m.line), macdSignal: lastOf(m.signal),
    },
    series: ts.map((t, i) => ({ t, price: px[i], sma7: s7[i], sma25: s25[i], ema12: e12[i], ema26: e26[i], rsi: r[i], macd: m.line[i], macdSignal: m.signal[i], macdHist: m.hist[i] })),
  };
}
