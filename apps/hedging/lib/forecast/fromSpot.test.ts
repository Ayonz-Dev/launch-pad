import { describe, it, expect } from 'vitest';
import { forecastFromSpot } from './fromSpot';
import type { SpotPoint } from '../chart/series';

function weeklySeries(n: number, fn: (i: number) => number): SpotPoint[] {
  const start = Date.parse('2026-01-05T00:00:00Z');
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(start + i * 7 * 86_400_000).toISOString().slice(0, 10),
    rate: Number(fn(i).toFixed(6)),
  }));
}

describe('forecastFromSpot', () => {
  it('returns nothing with too little history', () => {
    expect(forecastFromSpot(weeklySeries(2, () => 0.66))).toEqual([]);
  });

  it('produces one dated band per month of horizon', () => {
    const out = forecastFromSpot(weeklySeries(20, () => 0.66), { horizonMonths: 6 });
    expect(out).toHaveLength(6);
    for (const p of out) {
      expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.lower).toBeLessThanOrEqual(p.rate);
      expect(p.upper).toBeGreaterThanOrEqual(p.rate);
    }
  });

  it('holds a level series near flat', () => {
    const out = forecastFromSpot(weeklySeries(20, () => 0.66), { horizonMonths: 12 });
    expect(out[0]!.rate).toBeCloseTo(0.66, 4);
    expect(out[out.length - 1]!.rate).toBeCloseTo(0.66, 4);
    // A perfectly constant series has zero residual, so the band is zero width.
    expect(out[0]!.upper - out[0]!.lower).toBeCloseTo(0, 8);
  });

  it('widens the band with horizon when the series has noise', () => {
    // Level around 0.66 but with alternating noise, so residuals are non-zero.
    const out = forecastFromSpot(
      weeklySeries(20, (i) => 0.66 + (i % 2 === 0 ? 0.002 : -0.002)),
      { horizonMonths: 12 },
    );
    const firstWidth = out[0]!.upper - out[0]!.lower;
    const lastWidth = out[out.length - 1]!.upper - out[out.length - 1]!.lower;
    expect(firstWidth).toBeGreaterThan(0);
    expect(lastWidth).toBeGreaterThan(firstWidth);
  });

  it('dates the forecast after the last spot date', () => {
    const series = weeklySeries(20, (i) => 0.66 + 0.0005 * i);
    const out = forecastFromSpot(series, { horizonMonths: 3 });
    const lastSpot = series[series.length - 1]!.date;
    expect(out[0]!.date > lastSpot).toBe(true);
  });
});
