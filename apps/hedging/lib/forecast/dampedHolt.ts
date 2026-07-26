// Damped-trend exponential smoothing (damped Holt) for FX spot.
//
// Why this model: a pure random walk is famously hard to beat on FX, and
// extrapolating an undamped trend on a rate is dangerous, it runs away. Damped
// Holt captures a level and a short-run trend, then flattens the trend over the
// horizon so the forecast settles rather than exploding. It is deterministic
// given its parameters and needs no external data or model weights.
//
// This is a model opinion, not arbitrage-free maths. It is always drawn with an
// uncertainty band and labelled as a forecast so it never reads like the IRP
// line.

export interface DampedHoltParams {
  /** Level smoothing, 0..1. */
  alpha: number;
  /** Trend smoothing, 0..1. */
  beta: number;
  /** Trend damping, 0..1. Below 1 flattens the trend over the horizon. */
  phi: number;
}

export const DEFAULT_PARAMS: DampedHoltParams = { alpha: 0.4, beta: 0.1, phi: 0.9 };

// z for an ~80 per cent central interval (the 90th percentile of the normal).
export const Z_80 = 1.2816;

export interface HoltFit {
  level: number;
  trend: number;
  /** One-step residual standard deviation, the scale for the interval. */
  sigma: number;
  phi: number;
  /** Number of points fitted. */
  n: number;
}

export interface ForecastBand {
  point: number;
  lower: number;
  upper: number;
}

/**
 * Fit damped Holt to an ordered series. Needs at least two points; with fewer
 * it degenerates to a flat forecast at the last value and a zero residual scale.
 */
export function fitDampedHolt(series: number[], params: DampedHoltParams = DEFAULT_PARAMS): HoltFit {
  const { alpha, beta, phi } = params;
  const n = series.length;

  if (n === 0) {
    return { level: 0, trend: 0, sigma: 0, phi, n };
  }
  if (n === 1) {
    return { level: series[0]!, trend: 0, sigma: 0, phi, n };
  }

  let level = series[0]!;
  let trend = series[1]! - series[0]!;
  let sumSqResid = 0;
  let residCount = 0;

  for (let t = 1; t < n; t += 1) {
    const prevLevel = level;
    const prevTrend = trend;
    // One-step-ahead forecast made before seeing series[t].
    const fitted = prevLevel + phi * prevTrend;
    const resid = series[t]! - fitted;
    sumSqResid += resid * resid;
    residCount += 1;

    level = alpha * series[t]! + (1 - alpha) * (prevLevel + phi * prevTrend);
    trend = beta * (level - prevLevel) + (1 - beta) * phi * prevTrend;
  }

  const sigma = residCount > 0 ? Math.sqrt(sumSqResid / residCount) : 0;
  return { level, trend, sigma, phi, n };
}

/** Sum of the damping weights phi + phi^2 + ... + phi^h, for real h >= 0. */
function dampSum(phi: number, h: number): number {
  if (h <= 0) return 0;
  if (phi >= 1) return h;
  return (phi * (1 - Math.pow(phi, h))) / (1 - phi);
}

/**
 * Forecast the fitted model h steps ahead (h may be fractional). The interval
 * widens with the square root of the horizon, the random-walk-style scaling.
 */
export function forecastAt(fit: HoltFit, h: number, z: number = Z_80): ForecastBand {
  const point = fit.level + fit.trend * dampSum(fit.phi, h);
  const halfWidth = z * fit.sigma * Math.sqrt(Math.max(h, 0));
  return { point, lower: point - halfWidth, upper: point + halfWidth };
}

/** Convenience: forecast a series at a set of integer step horizons. */
export function dampedHoltForecast(
  series: number[],
  horizons: number[],
  params: DampedHoltParams = DEFAULT_PARAMS,
  z: number = Z_80,
): Array<{ step: number } & ForecastBand> {
  const fit = fitDampedHolt(series, params);
  return horizons.map((step) => ({ step, ...forecastAt(fit, step, z) }));
}
