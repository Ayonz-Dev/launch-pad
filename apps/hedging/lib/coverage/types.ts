// Row shapes for the coverage and cash views. Postgres numeric columns arrive
// from supabase-js as strings to preserve precision, so the query layer coerces
// them to numbers before they reach these types. Keep the maths in numbers.

/** One row of v_hedge_coverage_monthly: month, scenario and pair. */
export interface CoverageRow {
  bucket_month: string;
  scenario_id: number | null;
  pair: string;
  gross_payable_usd: number;
  gross_receivable_usd: number;
  net_exposure_usd: number;
  net_exposure_weighted_usd: number;
  hedged_buy_usd: number;
  hedged_sell_usd: number;
  hedged_total_usd: number;
  blended_forward_rate: number | null;
  payable_coverage_ratio: number | null;
  unhedged_payable_usd: number;
}

/** One row of v_cash_latest: the most recent balance per account and scenario. */
export interface CashRow {
  account_name: string;
  institution: string | null;
  balance_amount_usd: number;
  local_currency: string;
  as_of_date: string;
  scenario_id: number | null;
}

/** A sandbox scenario. A null scenario_id everywhere else means live data. */
export interface Scenario {
  id: number;
  name: string;
}
