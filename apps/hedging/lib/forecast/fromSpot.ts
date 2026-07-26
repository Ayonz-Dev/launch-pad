import type { SpotPoint } from '../chart/series';
import { fitDampedHolt, forecastAt, DEFAULT_PARAMS, Z_80, type DampedHoltParams } from './dampedHolt';

// Adapter from a dated spot series to dated forecast points with an uncertainty
// band, so the output slots straight into the chart and a spot_forecasts table.
//
// The model works in series steps; this maps each future calendar date to a
// fractional step using the median spacing of the history, so an irregular
// series still forecasts at clean monthly dates.

export interface ForecastPointBand {
  date: string;
  rate: number;
  lower: number;
  upper: number;
}

export interface ForecastFromSpotOptions {
  horizonMonths?: number;
  params?: DampedHoltParams;
  z?: number;
}

const MS_PER_DAY = 86_400_000;

function parseIso(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function addMonthsIso(date: string, months: number): string {
  const dt = new Date(`${date}T00:00:00Z`);
  dt.setUTCMonth(dt.getUTCMonth() + months);
  return dt.toISOString().slice(0, 10);
}

function medianDayDelta(sortedMs: number[]): number {
  if (sortedMs.length < 2) return 30; // fall back to roughly a month
  const deltas: number[] = [];
  for (let i = 1; i < sortedMs.length; i += 1) {
    deltas.push((sortedMs[i]! - sortedMs[i - 1]!) / MS_PER_DAY);
  }
  deltas.sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  const median = deltas.length % 2 === 0 ? (deltas[mid - 1]! + deltas[mid]!) / 2 : deltas[mid]!;
  return median > 0 ? median : 30;
}

/**
 * Forecast a pair's spot forward at monthly dates. Returns an empty array when
 * there is too little history to fit (fewer than three points).
 */
export function forecastFromSpot(
  spotHistory: SpotPoint[],
  options: ForecastFromSpotOptions = {},
): ForecastPointBand[] {
  const horizonMonths = options.horizonMonths ?? 12;
  const params = options.params ?? DEFAULT_PARAMS;
  const z = options.z ?? Z_80;

  const sorted = [...spotHistory].sort((a, b) => parseIso(a.date) - parseIso(b.date));
  if (sorted.length < 3) return [];

  const rates = sorted.map((p) => p.rate);
  const lastDate = sorted[sorted.length - 1]!.date;
  const lastMs = parseIso(lastDate);
  const stepDays = medianDayDelta(sorted.map((p) => parseIso(p.date)));

  const fit = fitDampedHolt(rates, params);

  const out: ForecastPointBand[] = [];
  for (let m = 1; m <= horizonMonths; m += 1) {
    const date = addMonthsIso(lastDate, m);
    const daysAhead = (parseIso(date) - lastMs) / MS_PER_DAY;
    const h = daysAhead / stepDays;
    const band = forecastAt(fit, h, z);
    out.push({
      date,
      rate: Number(band.point.toFixed(6)),
      lower: Number(band.lower.toFixed(6)),
      upper: Number(band.upper.toFixed(6)),
    });
  }
  return out;
}
