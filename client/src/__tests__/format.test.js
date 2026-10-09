import { describe, expect, it } from 'vitest';
import { formatMoney, formatCompact, formatPercent, formatAmount, formatNumber, trendClass, formatDate } from '../lib/format.js';

describe('format', () => {
  it('formats money with adaptive precision', () => {
    expect(formatMoney(65000.5, 'usd')).toBe('$65,001');
    expect(formatMoney(12.3456, 'usd')).toBe('$12.35');
    expect(formatMoney(0.5, 'usd')).toBe('$0.5');
    expect(formatMoney(0.00001234, 'usd')).toBe('$0.00001234');
    expect(formatMoney(100, 'eur')).toBe('€100.00');
  });
  it('never throws on bad input or odd currency codes', () => {
    for (const v of [null, undefined, NaN, Infinity, 'x']) expect(formatMoney(v, 'usd')).toBe('—');
    expect(() => formatMoney(5, 'not-a-currency')).not.toThrow();
    expect(formatMoney(5, 'not-a-currency')).toContain('NOT-A-CURRENCY');
  });
  it('formats compact numbers and percentages', () => {
    expect(formatCompact(1.5e12, 'usd')).toBe('$1.5T'); expect(formatCompact(2_500_000)).toBe('2.5M'); expect(formatCompact(null)).toBe('—');
    expect(formatPercent(2.345)).toBe('+2.35%'); expect(formatPercent(-0.5)).toBe('-0.50%'); expect(formatPercent(0)).toBe('0.00%'); expect(formatPercent(undefined)).toBe('—');
  });
  it('formats converter amounts across magnitudes', () => {
    expect(formatAmount(0)).toBe('0'); expect(formatAmount(1234567.891)).toBe('1,234,567.89'); expect(formatAmount(0.00001234567891)).toBe('0.0000123457'); expect(formatAmount(1.23456789)).toBe('1.2346');
  });
  it('misc helpers', () => {
    expect(trendClass(3)).toBe('up'); expect(trendClass(-3)).toBe('down'); expect(trendClass(0)).toBe('flat'); expect(trendClass(null)).toBe('flat');
    expect(formatNumber(1234.5678, 2)).toBe('1,234.57'); expect(formatDate(null)).toBe('—');
  });
});
