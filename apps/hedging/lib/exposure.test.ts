import { describe, it, expect } from 'vitest';
import { summariseExposure, fundingNeeded } from './exposure';

describe('summariseExposure', () => {
  it('covers required from hedges and cash, leaving the shortfall', () => {
    const s = summariseExposure({ requiredUsd: 1_600_000, hedgedUsd: 1_000_000, cashUsd: 300_000 });
    expect(s.coveredUsd).toBe(1_300_000);
    expect(s.uncoveredUsd).toBe(300_000);
    expect(s.coverageRatio).toBeCloseTo(0.8125, 6);
  });

  it('never reports negative uncovered when over-covered', () => {
    const s = summariseExposure({ requiredUsd: 500_000, hedgedUsd: 600_000, cashUsd: 200_000 });
    expect(s.uncoveredUsd).toBe(0);
    expect(s.coverageRatio).toBe(1);
  });

  it('returns a null ratio when nothing is required', () => {
    const s = summariseExposure({ requiredUsd: 0, hedgedUsd: 0, cashUsd: 0 });
    expect(s.coverageRatio).toBeNull();
    expect(s.uncoveredUsd).toBe(0);
  });
});

describe('fundingNeeded', () => {
  it('converts USD to funding units at a USD-per-unit rate', () => {
    // To buy 300,000 USD at AUD/USD 0.66 needs 300000 / 0.66 = 454,545 AUD.
    expect(fundingNeeded(300_000, 0.66)).toBeCloseTo(454_545.45, 2);
    // At GBP/USD 1.27, 300000 / 1.27 = 236,220 GBP.
    expect(fundingNeeded(300_000, 1.27)).toBeCloseTo(236_220.47, 2);
  });

  it('is NaN for a non-positive rate', () => {
    expect(Number.isNaN(fundingNeeded(1000, 0))).toBe(true);
  });
});
