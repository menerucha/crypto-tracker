import { linreg, stdev, mean } from './indicators.js';

/**
 * Short-horizon price forecasting on daily closes, done in log-price space (so forecasts stay positive and
 * errors are multiplicative). Two classic models are fitted and averaged:
 *   1. Linear trend (OLS on the last `lookback` days) with a regression prediction interval.
 *   2. Damped Holt exponential smoothing (level + trend), (alpha, beta) tuned by grid search on one-step SSE.
 * A hold-out backtest scores each model against a naive "tomorrow = today" baseline. This is a statistical
 * extrapolation, NOT financial advice -- crypto prices are very hard to predict.
 */
const Z95 = 1.96, PHI = 0.9;

export function linearModel(logP, horizon, lookback = 30) {
  const y = logP.slice(-Math.min(lookback, logP.length)), L = y.length, x = y.map((_, i) => i);
  const fit = linreg(x, y);
  return {
    r2: fit.r2,
    predict: (h) => {
      const t0 = L - 1 + h, mid = fit.intercept + fit.slope * t0;
      const half = Z95 * fit.se * Math.sqrt(1 + 1 / L + (t0 - fit.mx) ** 2 / (fit.sxx || 1));
      return { mid, lo: mid - half, hi: mid + half };
    },
    horizon,
  };
}

export function holtModel(logP, horizon) {
  let best = null;
  for (const alpha of [0.1, 0.2, 0.3, 0.5, 0.7, 0.9]) for (const beta of [0.05, 0.1, 0.2, 0.3]) {
    let level = logP[0], trend = logP[1] - logP[0], sse = 0; const errs = [];
    for (let i = 1; i < logP.length; i++) {
      const f = level + PHI * trend, e = logP[i] - f; sse += e * e; errs.push(e);
      const prev = level; level = alpha * logP[i] + (1 - alpha) * f; trend = beta * (level - prev) + (1 - beta) * PHI * trend;
    }
    if (!best || sse < best.sse) best = { alpha, beta, sse, level, trend, sigma: stdev(errs) };
  }
  return {
    alpha: best.alpha, beta: best.beta,
    predict: (h) => {
      let damp = 0; for (let i = 1; i <= h; i++) damp += PHI ** i;
      const mid = best.level + damp * best.trend, half = Z95 * best.sigma * Math.sqrt(h);
      return { mid, lo: mid - half, hi: mid + half };
    },
    horizon,
  };
}

const mape = (actual, pred) => mean(actual.map((a, i) => Math.abs((pred[i] - a) / a))) * 100;

export function forecast(dailyPoints, horizon = 7) {
  if (dailyPoints.length < 20) throw new Error('Need at least 20 daily data points to forecast');
  const prices = dailyPoints.map((p) => p[1]), logP = prices.map(Math.log), n = prices.length, DAY = 86400000, lastT = dailyPoints[n - 1][0];

  const lin = linearModel(logP, horizon), holt = holtModel(logP, horizon), points = [];
  for (let h = 1; h <= horizon; h++) {
    const a = lin.predict(h), b = holt.predict(h);
    points.push({
      t: lastT + h * DAY, price: Math.exp((a.mid + b.mid) / 2), lower: Math.exp((a.lo + b.lo) / 2), upper: Math.exp((a.hi + b.hi) / 2),
      linear: Math.exp(a.mid), holt: Math.exp(b.mid),
    });
  }

  // Hold-out backtest: fit on all-but-last k days, predict those k days, compare to what actually happened
  const k = Math.max(3, Math.min(7, Math.floor(n / 5))), train = logP.slice(0, n - k), actual = prices.slice(n - k);
  const bl = linearModel(train, k), bh = holtModel(train, k), steps = Array.from({ length: k }, (_, i) => i + 1);
  const pl = steps.map((h) => Math.exp(bl.predict(h).mid)), ph = steps.map((h) => Math.exp(bh.predict(h).mid));
  const pe = steps.map((_, i) => (pl[i] * ph[i]) ** 0.5), naive = steps.map(() => Math.exp(train[train.length - 1]));
  const metrics = { holdoutDays: k, mapePct: { linear: +mape(actual, pl).toFixed(2), holt: +mape(actual, ph).toFixed(2), ensemble: +mape(actual, pe).toFixed(2), naive: +mape(actual, naive).toFixed(2) } };
  metrics.beatsNaive = metrics.mapePct.ensemble < metrics.mapePct.naive;

  return {
    horizonDays: horizon, lastPrice: prices[n - 1], points,
    expectedChangePct: +((points[horizon - 1].price / prices[n - 1] - 1) * 100).toFixed(2),
    model: { type: 'ensemble(linear-trend, damped-holt)', linearR2: +lin.r2.toFixed(3), holt: { alpha: holt.alpha, beta: holt.beta }, interval: '95%' },
    metrics,
    disclaimer: 'Statistical extrapolation of past prices for educational purposes only. Not financial advice.',
  };
}
