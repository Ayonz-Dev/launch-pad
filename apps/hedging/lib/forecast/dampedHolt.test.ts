import { describe, it, expect } from 'vitest';
import { fitDampedHolt, forecastAt, dampedHoltForecast } from './dampedHolt';

describe('fitDampedHolt', () => {
  it('degenerates to a flat forecast for a single point', () => {
    const fit = fitDampedHolt([0.66]);
    expect(fit.level).toBe(0.66);
    expect(fit.trend).toBe(0);
    expect(fit.sigma).toBe(0);
  });

  it('carries near-zero trend and residual on a constant series', () => {
    const fit = fitDampedHolt(Array(20).fill(0.66));
    expect(fit.trend).toBeCloseTo(0, 6);
    expect(fit.sigma).toBeCloseTo(0, 6);
    expect(forecastAt(fit, 6).point).toBeCloseTo(0.66, 6);
  });
});

describe('forecastAt', () => {
  it('damps the trend so it does not extrapolate linearly', () => {
    // A clean upward ramp.
    const series = Array.from({ length: 12 }, (_, i) => 0.6 + i * 0.01);
    const fit = fitDampedHolt(series, { alpha: 0.5, beta: 0.3, phi: 0.8 });
    const linearAt10 = fit.level + fit.trend * 10; // undamped
    const damped = forecastAt(fit, 10).point;
    // Damped stays below the naive straight-line projection.
    expect(damped).toBeLessThan(linearAt10);
    // But still points upward past the last level.
    expect(damped).toBeGreaterThan(fit.level);
  });

  it('widens the interval with the horizon', () => {
    const series = [0.66, 0.658, 0.662, 0.659, 0.661, 0.657, 0.66, 0.663];
    const fit = fitDampedHolt(series);
    const near = forecastAt(fit, 1);
    const far = forecastAt(fit, 9);
    const nearWidth = near.upper - near.lower;
    const farWidth = far.upper - far.lower;
    expect(farWidth).toBeGreaterThan(nearWidth);
    // Point sits at the centre of the band.
    expect((near.upper + near.lower) / 2).toBeCloseTo(near.point, 10);
  });

  it('has zero band width when residuals are zero', () => {
    const fit = fitDampedHolt(Array(10).fill(0.66));
    const f = forecastAt(fit, 5);
    expect(f.upper - f.lower).toBeCloseTo(0, 8);
  });
});

describe('dampedHoltForecast', () => {
  it('returns one band per requested horizon, in order', () => {
    const series = Array.from({ length: 15 }, (_, i) => 0.66 + 0.001 * Math.sin(i));
    const out = dampedHoltForecast(series, [1, 3, 6, 12]);
    expect(out.map((o) => o.step)).toEqual([1, 3, 6, 12]);
    for (const row of out) {
      expect(row.lower).toBeLessThanOrEqual(row.point);
      expect(row.upper).toBeGreaterThanOrEqual(row.point);
    }
  });
});
