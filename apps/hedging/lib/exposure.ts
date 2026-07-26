// Uncovered USD exposure, and what it costs to cover in each funding currency.
//
// All supplier payments are made in USD, so the requirement is a single USD
// figure (from the shipping ETAs). USD already held covers it: hedged forward
// buys plus offshore USD account balances. The shortfall is the uncovered USD.
//
// AUD, GBP and EUR are alternative funding currencies for buying that shortfall
// at spot (a pooled treasury choice, not tied to any order), so the cost to
// cover is shown in each, not split across them.
//
// Pure and tested. Australian English. No em dashes.

export interface ExposureInput {
  /** Total USD due, from incoming shipping orders. */
  requiredUsd: number;
  /** USD locked in hedged forward buys. */
  hedgedUsd: number;
  /** USD sitting in offshore accounts. */
  cashUsd: number;
}

export interface ExposureSummary extends ExposureInput {
  /** hedgedUsd + cashUsd. */
  coveredUsd: number;
  /** The shortfall to buy at spot, never negative. */
  uncoveredUsd: number;
  /** covered / required, capped at 1. Null when nothing is required. */
  coverageRatio: number | null;
}

export function summariseExposure(input: ExposureInput): ExposureSummary {
  const coveredUsd = input.hedgedUsd + input.cashUsd;
  const uncoveredUsd = Math.max(0, input.requiredUsd - coveredUsd);
  const coverageRatio =
    input.requiredUsd > 0 ? Math.min(1, coveredUsd / input.requiredUsd) : null;
  return { ...input, coveredUsd, uncoveredUsd, coverageRatio };
}

// Units of a funding currency needed to buy `usd` at spot. Every pair is quoted
// USD per one unit of the funding currency (AUD/USD = USD per 1 AUD), so the
// units required are usd / rate.
export function fundingNeeded(usd: number, rate: number): number {
  return rate > 0 ? usd / rate : NaN;
}
