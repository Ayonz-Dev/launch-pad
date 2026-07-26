// Covered interest-rate parity (IRP) forward pricing.
//
// This is arbitrage-free maths, not opinion. Keep it a pure, typed, testable
// unit. It must never reach into the database or a Recharts component.
//
// Convention (do not break): USD is the anchor. Every pair is quoted with USD
// as the quote currency, so AUD/USD means USD per 1 AUD.
//
//   F = S * (1 + r_quote * t) / (1 + r_base * t)
//
// A flipped base/quote silently inverts the premium. AUD/USD normally sits at
// a forward discount (AUD short rate above USD), so the sign is unit-tested.

/** How the year fraction to maturity is measured. */
export type DayCount = 'ACT/365' | 'ACT/360';

const DAY_COUNT_BASIS: Record<DayCount, number> = {
  'ACT/365': 365,
  'ACT/360': 360,
};

export interface IrpInputs {
  /** Spot rate, quote per 1 base unit (USD per 1 base). Must be positive. */
  spot: number;
  /** Annualised rate of the base currency, decimal (0.0435 = 4.35 per cent). */
  rateBase: number;
  /** Annualised rate of the quote currency (USD), decimal. */
  rateQuote: number;
  /** Time to maturity in years. Must be non-negative. */
  years: number;
}

/**
 * Covered-parity forward rate for a pair quoted as quote-per-base.
 * Returns the outright forward in the same units as spot.
 */
export function coveredForwardRate(inputs: IrpInputs): number {
  const { spot, rateBase, rateQuote, years } = inputs;
  if (!Number.isFinite(spot) || spot <= 0) {
    throw new RangeError('spot must be a positive finite number');
  }
  if (!Number.isFinite(years) || years < 0) {
    throw new RangeError('years must be a non-negative finite number');
  }
  const denominator = 1 + rateBase * years;
  if (denominator <= 0) {
    throw new RangeError('1 + rateBase * years must be positive');
  }
  return (spot * (1 + rateQuote * years)) / denominator;
}

/** Forward points: outright forward minus spot. Negative means a discount. */
export function forwardPoints(inputs: IrpInputs): number {
  return coveredForwardRate(inputs) - inputs.spot;
}

export type ForwardBasis = 'premium' | 'discount' | 'flat';

/**
 * Whether the forward sits at a premium (above spot), a discount (below spot),
 * or flat. epsilon guards against floating-point noise near zero.
 */
export function forwardBasis(inputs: IrpInputs, epsilon = 1e-9): ForwardBasis {
  const points = forwardPoints(inputs);
  if (points > epsilon) return 'premium';
  if (points < -epsilon) return 'discount';
  return 'flat';
}

/**
 * Resolve base and quote rates for a canonical pair from a per-currency rate
 * map. This is where the flipped base/quote bug tends to hide, so it is a
 * named, tested seam rather than an inline split in the chart component.
 */
export function ratesForPair(
  pair: string,
  ratesByCurrency: Record<string, number>,
): { rateBase: number; rateQuote: number } {
  const [base, quote] = pair.split('/');
  if (!base || !quote) {
    throw new Error(`pair must be canonical, for example AUD/USD, got ${pair}`);
  }
  const rateBase = ratesByCurrency[base];
  const rateQuote = ratesByCurrency[quote];
  if (rateBase == null) throw new Error(`missing rate for base currency ${base}`);
  if (rateQuote == null) throw new Error(`missing rate for quote currency ${quote}`);
  return { rateBase, rateQuote };
}

/** One point on the predictive forward curve. */
export interface ForwardCurvePoint {
  /** ISO date (YYYY-MM-DD) of the maturity. */
  date: string;
  /** Year fraction from asOf to this maturity. */
  years: number;
  /** Covered-parity forward rate at this maturity. */
  forward: number;
}

export interface ForwardCurveParams {
  spot: number;
  rateBase: number;
  rateQuote: number;
  /** Valuation date the curve is anchored to. */
  asOf: Date;
  /** Maturity dates to price, in any order. */
  horizons: Date[];
  /** Day-count basis for the year fraction. Defaults to ACT/365. */
  dayCount?: DayCount;
}

const MS_PER_DAY = 86_400_000;

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Build an IRP predictive line: one forward point per horizon, anchored to
 * asOf. Sorted ascending by maturity so it plots cleanly against spot history.
 */
export function forwardCurve(params: ForwardCurveParams): ForwardCurvePoint[] {
  const { spot, rateBase, rateQuote, asOf, horizons } = params;
  const basis = DAY_COUNT_BASIS[params.dayCount ?? 'ACT/365'];
  const asOfMs = asOf.getTime();

  return horizons
    .map((maturity) => {
      const years = (maturity.getTime() - asOfMs) / MS_PER_DAY / basis;
      return {
        date: toIsoDate(maturity),
        years,
        forward: coveredForwardRate({ spot, rateBase, rateQuote, years }),
      };
    })
    .sort((a, b) => a.years - b.years);
}
