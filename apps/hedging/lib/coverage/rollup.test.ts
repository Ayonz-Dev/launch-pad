import { describe, it, expect } from 'vitest';
import { rollupCoverage, totalCashUsd, bufferCoverageRatio } from './rollup';
import type { CashRow, CoverageRow } from './types';

function coverageRow(overrides: Partial<CoverageRow>): CoverageRow {
  return {
    bucket_month: '2026-08-01',
    scenario_id: null,
    pair: 'AUD/USD',
    gross_payable_usd: 0,
    gross_receivable_usd: 0,
    net_exposure_usd: 0,
    net_exposure_weighted_usd: 0,
    hedged_buy_usd: 0,
    hedged_sell_usd: 0,
    hedged_total_usd: 0,
    blended_forward_rate: null,
    payable_coverage_ratio: null,
    unhedged_payable_usd: 0,
    ...overrides,
  };
}

describe('rollupCoverage', () => {
  it('returns a zeroed rollup with a null ratio for no rows', () => {
    const r = rollupCoverage([]);
    expect(r.grossPayableUsd).toBe(0);
    expect(r.payableCoverageRatio).toBeNull();
    expect(r.monthCount).toBe(0);
    expect(r.pairs).toEqual([]);
  });

  it('sums dollars and derives the ratio from the totals', () => {
    const rows = [
      coverageRow({ bucket_month: '2026-08-01', gross_payable_usd: 1_000_000, hedged_buy_usd: 600_000 }),
      coverageRow({ bucket_month: '2026-09-01', gross_payable_usd: 1_000_000, hedged_buy_usd: 200_000 }),
    ];
    const r = rollupCoverage(rows);
    expect(r.grossPayableUsd).toBe(2_000_000);
    expect(r.hedgedBuyUsd).toBe(800_000);
    // 800k / 2m = 0.4, not the average of 0.6 and 0.2.
    expect(r.payableCoverageRatio).toBeCloseTo(0.4, 10);
    expect(r.unhedgedPayableUsd).toBe(1_200_000);
    expect(r.monthCount).toBe(2);
  });

  it('floors unhedged payable at zero when over-hedged', () => {
    const r = rollupCoverage([
      coverageRow({ gross_payable_usd: 500_000, hedged_buy_usd: 600_000 }),
    ]);
    expect(r.payableCoverageRatio).toBeGreaterThan(1);
    expect(r.unhedgedPayableUsd).toBe(0);
  });

  it('collects distinct pairs sorted', () => {
    const r = rollupCoverage([
      coverageRow({ pair: 'GBP/USD' }),
      coverageRow({ pair: 'AUD/USD' }),
      coverageRow({ pair: 'AUD/USD' }),
    ]);
    expect(r.pairs).toEqual(['AUD/USD', 'GBP/USD']);
  });
});

describe('cash buffer', () => {
  const cash: CashRow[] = [
    { account_name: 'Op USD', institution: 'ANZ', balance_amount_usd: 300_000, local_currency: 'USD', as_of_date: '2026-07-01', scenario_id: null },
    { account_name: 'Reserve USD', institution: 'NAB', balance_amount_usd: 150_000, local_currency: 'USD', as_of_date: '2026-07-01', scenario_id: null },
  ];

  it('totals the safety band', () => {
    expect(totalCashUsd(cash)).toBe(450_000);
  });

  it('measures buffer against the unhedged payable', () => {
    expect(bufferCoverageRatio(450_000, 900_000)).toBeCloseTo(0.5, 10);
  });

  it('returns null when nothing is unhedged', () => {
    expect(bufferCoverageRatio(450_000, 0)).toBeNull();
  });
});
