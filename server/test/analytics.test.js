import test from 'node:test';
import assert from 'node:assert/strict';
import { sma, ema, rsi, macd, linreg, toDaily, maxDrawdown, annualisedVolatility, analyseTrend, mean } from '../src/analytics/indicators.js';
import { forecast } from '../src/analytics/forecast.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const DAY = 86400000;
const series = (n, f) => Array.from({ length: n }, (_, i) => [Date.UTC(2026, 0, 1) + i * DAY, f(i)]);

test('sma matches hand-computed values and pads with null', () => {
  assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
});
test('ema seeds with SMA and follows recursion', () => {
  const e = ema([1, 2, 3, 4, 5, 6], 3); assert.equal(e[1], null); close(e[2], 2); close(e[3], 3); close(e[5], 5);
});
test('rsi is 100 for monotonic rises, 0 for monotonic falls, 50 for flat', () => {
  const up = rsi(Array.from({ length: 30 }, (_, i) => i + 1)), down = rsi(Array.from({ length: 30 }, (_, i) => 100 - i)), flat = rsi(Array(30).fill(5));
  assert.equal(up.at(-1), 100); assert.equal(down.at(-1), 0); assert.equal(flat.at(-1), 50); assert.equal(up[13], null);
});
test('rsi stays within 0..100 on noisy data', () => {
  const noisy = Array.from({ length: 200 }, (_, i) => 100 + 10 * Math.sin(i / 3) + (i % 7));
  for (const v of rsi(noisy).filter((x) => x !== null)) assert.ok(v >= 0 && v <= 100);
});
test('macd: histogram = line - signal; rising series gives positive line', () => {
  const m = macd(Array.from({ length: 80 }, (_, i) => 100 + i)); const i = 79;
  assert.ok(m.line[i] > 0); close(m.hist[i], m.line[i] - m.signal[i]); assert.equal(m.line[10], null);
});
test('linreg recovers an exact line with r2 = 1', () => {
  const f = linreg([0, 1, 2, 3, 4], [1, 3, 5, 7, 9]); close(f.slope, 2); close(f.intercept, 1); close(f.r2, 1); close(f.se, 0);
});
test('toDaily keeps the last point of each UTC day, sorted, dropping invalid values', () => {
  const d0 = Date.UTC(2026, 0, 1);
  const out = toDaily([[d0 + 3600e3, 10], [d0 + 7200e3, 11], [d0 + DAY + 1000, 20], [d0 + 2 * DAY, NaN], [d0 + 2 * DAY + 5, -1]]);
  assert.deepEqual(out.map((p) => p[1]), [11, 20]);
});
test('maxDrawdown and volatility', () => {
  close(maxDrawdown([100, 120, 60, 90]), -50); assert.equal(maxDrawdown([1, 2, 3]), 0);
  assert.equal(annualisedVolatility([100, 100, 100, 100]), 0); assert.ok(annualisedVolatility([100, 110, 95, 120, 90]) > 50);
});
test('analyseTrend labels a steady uptrend bullish and a downtrend bearish', () => {
  const up = analyseTrend(series(120, (i) => 100 * 1.01 ** i), 30), down = analyseTrend(series(120, (i) => 300 - 0.015 * i * i), 30);   // accelerating sell-off
  assert.match(up.verdict.label, /bullish/); assert.match(down.verdict.label, /bearish/);
  assert.ok(up.summary.changePct > 0 && down.summary.changePct < 0);
  const mixed = analyseTrend(series(120, (i) => 100 * 0.99 ** i), 30);       // decelerating decay: MACD turns up => mixed verdict is legitimate
  assert.ok(mixed.signals.some((s) => s.reading === 'bearish') && mixed.signals.some((s) => s.reading === 'bullish'));
  assert.equal(up.series.length, 120); assert.ok(up.signals.length >= 3);
});
test('forecast: extrapolates an exponential trend closely, bands widen and bracket the mid', () => {
  const f = forecast(series(90, (i) => 100 * 1.01 ** i), 7);
  const expected = 100 * 1.01 ** (89 + 7);
  assert.ok(Math.abs(f.points[6].price / expected - 1) < 0.03, `got ${f.points[6].price} vs ${expected}`);
  let prevWidth = -1;
  for (const p of f.points) { assert.ok(p.lower <= p.price && p.price <= p.upper); const w = p.upper - p.lower; assert.ok(w >= prevWidth - 1e-9); prevWidth = w; }
  assert.equal(f.points.length, 7); assert.ok(f.metrics.mapePct.ensemble < 2);
});
test('forecast on noisy data returns finite positive numbers and a backtest', () => {
  let s = 12345; const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296 - 0.5);
  let p = 50; const pts = series(120, () => (p *= 1 + rnd() * 0.06));
  const f = forecast(pts, 14);
  for (const q of f.points) for (const v of [q.price, q.lower, q.upper]) assert.ok(Number.isFinite(v) && v > 0);
  assert.ok(Number.isFinite(f.metrics.mapePct.naive) && f.metrics.holdoutDays >= 3); assert.ok(f.disclaimer);
});
test('forecast refuses too-short history', () => assert.throws(() => forecast(series(10, (i) => i + 1), 3), /at least 20/));
test('mean helper', () => close(mean([1, 2, 3]), 2));
