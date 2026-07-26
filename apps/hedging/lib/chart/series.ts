import { coveredForwardRate } from '../irp/irp';

// Builds the combined chart model: the historical spot line plus the three
// predictive lines (IRP, bank forecast, manual what-if) on a shared date axis,
// and the forward-order points for the scatter overlay.
//
// The three predictive lines have different epistemic status. IRP is
// arbitrage-free maths, the bank forecast is opinion, the manual line is a
// guess. This module only shapes the data; the component gives each a distinct
// dash style and legend label so they do not read as equally authoritative.
//
// The manual line shifts the endpoint rate and interpolates linearly back to
// the anchor spot, rather than applying a flat drift.

export interface SpotPoint {
  date: string;
  rate: number;
}

export interface ForecastPoint {
  date: string;
  rate: number;
}

/** Model forecast point with an uncertainty band. */
export interface ForecastBandPoint {
  date: string;
  rate: number;
  lower: number;
  upper: number;
}

export interface ForwardPoint {
  date: string;
  rate: number;
  orderNumber?: string;
}

/**
 * A bank forecast RANGE over a horizon (parsed from commentary). Flat low/high
 * from startDate to endDate, with a midpoint. Distinct from the point bank
 * forecast, which is a single opinion rate on a date.
 */
export interface BankRangePoint {
  startDate: string;
  endDate: string;
  low: number;
  high: number;
  mid: number;
}

export interface ChartRow {
  date: string;
  /** Epoch milliseconds for the shared numeric time axis. */
  t: number;
  spot: number | null;
  irp: number | null;
  bank: number | null;
  manual: number | null;
  /** Central model forecast. */
  forecast: number | null;
  /** Forecast band as [lower, upper] for a range area, or null. */
  forecastBand: [number, number] | null;
  /** Bank forecast range as [low, high] for a range area, or null. */
  bankBand: [number, number] | null;
  /** Midline of the bank forecast range, or null. */
  bankMid: number | null;
}

export interface BuildChartParams {
  spotHistory: SpotPoint[];
  bankForecasts: ForecastPoint[];
  modelForecasts?: ForecastBandPoint[];
  bankRanges?: BankRangePoint[];
  forwards?: ForwardPoint[];
  /** Annualised rate of the base currency, decimal. */
  rateBase: number;
  /** Annualised rate of the quote currency (USD), decimal. */
  rateQuote: number;
  /** The manual line's target rate at the far horizon. */
  manualEndpointRate: number;
  /** Months of predictive horizon past the last spot. Defaults to 12. */
  horizonMonths?: number;
  /** Day-count basis for the IRP year fraction. Defaults to 365. */
  dayCount?: number;
}

export interface ChartModel {
  rows: ChartRow[];
  forwards: ForwardPoint[];
  /** Last actual spot date, where the predictive lines are anchored. */
  anchorDate: string | null;
  anchorRate: number | null;
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

export function buildChartModel(params: BuildChartParams): ChartModel {
  const forwards = params.forwards ?? [];
  const spot = [...params.spotHistory].sort((a, b) => parseIso(a.date) - parseIso(b.date));

  if (spot.length === 0) {
    return { rows: [], forwards, anchorDate: null, anchorRate: null };
  }

  const anchor = spot[spot.length - 1]!;
  const anchorMs = parseIso(anchor.date);
  const dayCount = params.dayCount ?? 365;
  const horizonMonths = params.horizonMonths ?? 12;

  // Future date grid: a monthly spine plus any forecast and forward dates that
  // fall past the anchor, so the predictive lines pass through those points.
  const futureDates = new Set<string>();
  for (let m = 1; m <= horizonMonths; m += 1) {
    futureDates.add(addMonthsIso(anchor.date, m));
  }
  for (const b of params.bankForecasts) {
    if (parseIso(b.date) > anchorMs) futureDates.add(b.date);
  }
  for (const f of forwards) {
    if (parseIso(f.date) > anchorMs) futureDates.add(f.date);
  }
  const modelForecasts = params.modelForecasts ?? [];
  for (const m of modelForecasts) {
    if (parseIso(m.date) > anchorMs) futureDates.add(m.date);
  }
  // Add the bank range boundaries so the band has crisp edges per horizon.
  const bankRanges = params.bankRanges ?? [];
  for (const r of bankRanges) {
    if (parseIso(r.startDate) > anchorMs) futureDates.add(r.startDate);
    if (parseIso(r.endDate) > anchorMs) futureDates.add(r.endDate);
  }

  const horizonMs = [...futureDates].reduce((max, d) => Math.max(max, parseIso(d)), anchorMs);
  const span = horizonMs - anchorMs || 1;
  const bankMap = new Map(params.bankForecasts.map((b) => [b.date, b.rate]));
  const forecastMap = new Map(modelForecasts.map((m) => [m.date, m]));

  // The bank range covering a date, if any. Horizons are contiguous, so a
  // boundary date resolves to the first range whose [start, end] contains it.
  const bankRangeAt = (dMs: number): BankRangePoint | null => {
    for (const r of bankRanges) {
      if (dMs >= parseIso(r.startDate) && dMs <= parseIso(r.endDate)) return r;
    }
    return null;
  };

  const rows: ChartRow[] = [];

  // Past actuals: spot only.
  for (const s of spot) {
    if (s.date === anchor.date) continue;
    rows.push({
      date: s.date,
      t: parseIso(s.date),
      spot: s.rate,
      irp: null,
      bank: null,
      manual: null,
      forecast: null,
      forecastBand: null,
      bankBand: null,
      bankMid: null,
    });
  }

  // Anchor row: every predictive line converges on the last actual spot.
  rows.push({
    date: anchor.date,
    t: anchorMs,
    spot: anchor.rate,
    irp: anchor.rate,
    bank: anchor.rate,
    manual: anchor.rate,
    forecast: anchor.rate,
    forecastBand: [anchor.rate, anchor.rate],
    bankBand: null,
    bankMid: null,
  });

  // Future rows: predictive lines only.
  for (const date of futureDates) {
    const dMs = parseIso(date);
    const years = (dMs - anchorMs) / MS_PER_DAY / dayCount;
    const irp = coveredForwardRate({
      spot: anchor.rate,
      rateBase: params.rateBase,
      rateQuote: params.rateQuote,
      years,
    });
    const fraction = (dMs - anchorMs) / span;
    const manual = anchor.rate + (params.manualEndpointRate - anchor.rate) * fraction;
    const bank = bankMap.has(date) ? bankMap.get(date)! : null;
    const fc = forecastMap.get(date);
    const br = bankRangeAt(dMs);
    rows.push({
      date,
      t: dMs,
      spot: null,
      irp,
      bank,
      manual,
      forecast: fc ? fc.rate : null,
      forecastBand: fc ? [fc.lower, fc.upper] : null,
      bankBand: br ? [br.low, br.high] : null,
      bankMid: br ? br.mid : null,
    });
  }

  rows.sort((a, b) => a.t - b.t);

  return { rows, forwards, anchorDate: anchor.date, anchorRate: anchor.rate };
}
