import type { CashRow, CoverageRow } from './types';

// Coverage aggregation for the KPI cards. The view is per month, scenario and
// pair. The cards roll a selected scenario up across its months and pairs.
//
// Ratios are computed from summed dollars, never by averaging per-row ratios,
// which would silently weight a tiny month the same as a large one.

export interface CoverageRollup {
  grossPayableUsd: number;
  grossReceivableUsd: number;
  netExposureUsd: number;
  netExposureWeightedUsd: number;
  hedgedBuyUsd: number;
  hedgedSellUsd: number;
  hedgedTotalUsd: number;
  /** hedgedBuyUsd / grossPayableUsd. Null when there is nothing payable. */
  payableCoverageRatio: number | null;
  /** Gross payable not covered by hedged buys, floored at zero. */
  unhedgedPayableUsd: number;
  /** Distinct month buckets represented. */
  monthCount: number;
  /** Distinct pairs represented, sorted. */
  pairs: string[];
}

export function rollupCoverage(rows: CoverageRow[]): CoverageRollup {
  const months = new Set<string>();
  const pairs = new Set<string>();

  let grossPayableUsd = 0;
  let grossReceivableUsd = 0;
  let netExposureUsd = 0;
  let netExposureWeightedUsd = 0;
  let hedgedBuyUsd = 0;
  let hedgedSellUsd = 0;
  let hedgedTotalUsd = 0;

  for (const row of rows) {
    months.add(row.bucket_month);
    pairs.add(row.pair);
    grossPayableUsd += row.gross_payable_usd;
    grossReceivableUsd += row.gross_receivable_usd;
    netExposureUsd += row.net_exposure_usd;
    netExposureWeightedUsd += row.net_exposure_weighted_usd;
    hedgedBuyUsd += row.hedged_buy_usd;
    hedgedSellUsd += row.hedged_sell_usd;
    hedgedTotalUsd += row.hedged_total_usd;
  }

  const payableCoverageRatio =
    grossPayableUsd > 0 ? hedgedBuyUsd / grossPayableUsd : null;
  const unhedgedPayableUsd = Math.max(grossPayableUsd - hedgedBuyUsd, 0);

  return {
    grossPayableUsd,
    grossReceivableUsd,
    netExposureUsd,
    netExposureWeightedUsd,
    hedgedBuyUsd,
    hedgedSellUsd,
    hedgedTotalUsd,
    payableCoverageRatio,
    unhedgedPayableUsd,
    monthCount: months.size,
    pairs: [...pairs].sort(),
  };
}

/** Total of the transparent USD safety band across the selected accounts. */
export function totalCashUsd(rows: CashRow[]): number {
  return rows.reduce((sum, row) => sum + row.balance_amount_usd, 0);
}

/**
 * How far the USD cash buffer covers the unhedged payable.
 * Null when nothing is unhedged, since coverage is then unbounded.
 */
export function bufferCoverageRatio(
  cashUsd: number,
  unhedgedPayableUsd: number,
): number | null {
  if (unhedgedPayableUsd <= 0) return null;
  return cashUsd / unhedgedPayableUsd;
}
