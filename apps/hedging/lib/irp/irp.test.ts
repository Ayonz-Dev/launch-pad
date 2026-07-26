import { describe, it, expect } from 'vitest';
import {
  coveredForwardRate,
  forwardPoints,
  forwardBasis,
  ratesForPair,
  forwardCurve,
} from './irp';

// Classic Australian importer picture: AUD short rate above USD, so AUD/USD
// sits at a forward discount. These mirror the 005 seed assumptions.
const AUD = 0.0435;
const USD = 0.041;
const EUR = 0.0325;
const AUD_USD_SPOT = 0.66;

describe('coveredForwardRate', () => {
  it('matches the closed-form IRP value', () => {
    const years = 1;
    const expected = (AUD_USD_SPOT * (1 + USD * years)) / (1 + AUD * years);
    expect(coveredForwardRate({ spot: AUD_USD_SPOT, rateBase: AUD, rateQuote: USD, years }))
      .toBeCloseTo(expected, 10);
  });

  it('returns spot exactly at zero maturity', () => {
    expect(coveredForwardRate({ spot: AUD_USD_SPOT, rateBase: AUD, rateQuote: USD, years: 0 }))
      .toBe(AUD_USD_SPOT);
  });

  it('rejects a non-positive spot', () => {
    expect(() => coveredForwardRate({ spot: 0, rateBase: AUD, rateQuote: USD, years: 1 }))
      .toThrow(RangeError);
  });

  it('rejects a negative maturity', () => {
    expect(() => coveredForwardRate({ spot: AUD_USD_SPOT, rateBase: AUD, rateQuote: USD, years: -0.5 }))
      .toThrow(RangeError);
  });
});

describe('forward sign (the flipped base/quote trap)', () => {
  it('prices AUD/USD at a forward discount when AUD rate is above USD', () => {
    const inputs = { spot: AUD_USD_SPOT, rateBase: AUD, rateQuote: USD, years: 1 };
    expect(forwardPoints(inputs)).toBeLessThan(0);
    expect(forwardBasis(inputs)).toBe('discount');
  });

  it('inverts to a premium when base and quote are flipped', () => {
    // Swapping the arguments is exactly the silent-inversion bug. The sign of
    // the forward points must flip from discount to premium.
    const correct = { spot: AUD_USD_SPOT, rateBase: AUD, rateQuote: USD, years: 1 };
    const flipped = { spot: AUD_USD_SPOT, rateBase: USD, rateQuote: AUD, years: 1 };
    expect(forwardBasis(correct)).toBe('discount');
    expect(forwardBasis(flipped)).toBe('premium');
    expect(Math.sign(forwardPoints(correct))).toBe(-Math.sign(forwardPoints(flipped)));
  });

  it('prices EUR/USD at a forward premium when EUR rate is below USD', () => {
    const inputs = { spot: 1.08, rateBase: EUR, rateQuote: USD, years: 1 };
    expect(forwardBasis(inputs)).toBe('premium');
  });
});

describe('ratesForPair', () => {
  const rates = { AUD, USD, EUR };

  it('assigns base and quote from the canonical pair string', () => {
    expect(ratesForPair('AUD/USD', rates)).toEqual({ rateBase: AUD, rateQuote: USD });
  });

  it('feeds coveredForwardRate to reproduce the AUD/USD discount', () => {
    const { rateBase, rateQuote } = ratesForPair('AUD/USD', rates);
    const inputs = { spot: AUD_USD_SPOT, rateBase, rateQuote, years: 1 };
    expect(forwardBasis(inputs)).toBe('discount');
  });

  it('throws on a missing currency rate', () => {
    expect(() => ratesForPair('GBP/USD', rates)).toThrow(/GBP/);
  });

  it('throws on a non-canonical pair', () => {
    expect(() => ratesForPair('AUDUSD', rates)).toThrow(/canonical/);
  });
});

describe('forwardCurve', () => {
  const asOf = new Date('2026-07-04T00:00:00.000Z');
  const horizons = [
    new Date('2026-10-02T00:00:00.000Z'), // roughly 90 days
    new Date('2027-07-04T00:00:00.000Z'), // roughly one year
    new Date('2026-08-03T00:00:00.000Z'), // roughly 30 days
  ];

  it('sorts points ascending by maturity', () => {
    const curve = forwardCurve({ spot: AUD_USD_SPOT, rateBase: AUD, rateQuote: USD, asOf, horizons });
    const years = curve.map((p) => p.years);
    expect(years).toEqual([...years].sort((a, b) => a - b));
    expect(curve.map((p) => p.date)).toEqual(['2026-08-03', '2026-10-02', '2027-07-04']);
  });

  it('stays at a discount and steepens with maturity for AUD/USD', () => {
    const curve = forwardCurve({ spot: AUD_USD_SPOT, rateBase: AUD, rateQuote: USD, asOf, horizons });
    expect(curve).toHaveLength(3);
    for (const point of curve) {
      expect(point.forward).toBeLessThan(AUD_USD_SPOT);
    }
    const [nearest, , furthest] = curve;
    // Longer maturity, larger discount.
    expect(furthest!.forward).toBeLessThan(nearest!.forward);
  });

  it('respects the day-count basis', () => {
    const base = { spot: AUD_USD_SPOT, rateBase: AUD, rateQuote: USD, asOf, horizons };
    const act365 = forwardCurve({ ...base, dayCount: 'ACT/365' });
    const act360 = forwardCurve({ ...base, dayCount: 'ACT/360' });
    // ACT/360 stretches the year fraction, so the discount is slightly deeper.
    expect(act360[0]!.years).toBeGreaterThan(act365[0]!.years);
  });
});
