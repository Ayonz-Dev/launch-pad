import 'server-only';
import { getServerClient } from './server';
import type { CashRow, CoverageRow, Scenario } from '../coverage/types';
import type { ForecastBandPoint, ForecastPoint, ForwardPoint, SpotPoint } from '../chart/series';
import type { HedgeLot, IncomingOrder } from '../recommend';
import type { BankForecastRange } from '../bankForecast';

// Data access for the dashboard. All numeric columns come back from supabase-js
// as strings to preserve precision, so every fetch coerces them to numbers here,
// once, before the rest of the app sees them.

function num(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : null;
}

/**
 * Apply the scenario filter. Live data is scenario_id null, so it needs an IS
 * NULL filter, not an equality one. A plain eq on null would match nothing and
 * silently return an empty dashboard.
 */
function scopeToScenario<T extends { is: Function; eq: Function }>(
  query: T,
  scenarioId: number | null,
): T {
  return (scenarioId === null
    ? query.is('scenario_id', null)
    : query.eq('scenario_id', scenarioId)) as T;
}

export async function fetchScenarios(): Promise<Scenario[]> {
  const client = getServerClient();
  if (!client) return [];
  const { data, error } = await client
    .from('scenarios')
    .select('id, name')
    .order('id', { ascending: true });
  if (error) throw new Error(`fetchScenarios: ${error.message}`);
  return (data ?? []).map((row) => ({ id: row.id as number, name: row.name as string }));
}

export async function fetchCoverage(scenarioId: number | null): Promise<CoverageRow[]> {
  const client = getServerClient();
  if (!client) return [];
  const { data, error } = await scopeToScenario(
    client.from('v_hedge_coverage_monthly').select('*'),
    scenarioId,
  ).order('bucket_month', { ascending: true });
  if (error) throw new Error(`fetchCoverage: ${error.message}`);
  return (data ?? []).map((row) => ({
    bucket_month: row.bucket_month as string,
    scenario_id: (row.scenario_id as number | null) ?? null,
    pair: row.pair as string,
    gross_payable_usd: num(row.gross_payable_usd),
    gross_receivable_usd: num(row.gross_receivable_usd),
    net_exposure_usd: num(row.net_exposure_usd),
    net_exposure_weighted_usd: num(row.net_exposure_weighted_usd),
    hedged_buy_usd: num(row.hedged_buy_usd),
    hedged_sell_usd: num(row.hedged_sell_usd),
    hedged_total_usd: num(row.hedged_total_usd),
    blended_forward_rate: numOrNull(row.blended_forward_rate),
    payable_coverage_ratio: numOrNull(row.payable_coverage_ratio),
    unhedged_payable_usd: num(row.unhedged_payable_usd),
  }));
}

export async function fetchCash(scenarioId: number | null): Promise<CashRow[]> {
  const client = getServerClient();
  if (!client) return [];
  const { data, error } = await scopeToScenario(
    client.from('v_cash_latest').select('*'),
    scenarioId,
  ).order('account_name', { ascending: true });
  if (error) throw new Error(`fetchCash: ${error.message}`);
  return (data ?? []).map((row) => ({
    account_name: row.account_name as string,
    institution: (row.institution as string | null) ?? null,
    balance_amount_usd: num(row.balance_amount_usd),
    local_currency: row.local_currency as string,
    as_of_date: row.as_of_date as string,
    scenario_id: (row.scenario_id as number | null) ?? null,
  }));
}

export async function fetchSpotHistory(pair: string): Promise<SpotPoint[]> {
  const client = getServerClient();
  if (!client) return [];
  const { data, error } = await client
    .from('spot_history')
    .select('date, rate')
    .eq('pair', pair)
    .order('date', { ascending: true });
  if (error) throw new Error(`fetchSpotHistory: ${error.message}`);
  return (data ?? []).map((row) => ({ date: row.date as string, rate: num(row.rate) }));
}

export async function fetchBankForecasts(pair: string): Promise<ForecastPoint[]> {
  const client = getServerClient();
  if (!client) return [];
  const { data, error } = await client
    .from('bank_forecasts')
    .select('target_date, rate')
    .eq('pair', pair)
    .order('target_date', { ascending: true });
  if (error) throw new Error(`fetchBankForecasts: ${error.message}`);
  return (data ?? []).map((row) => ({ date: row.target_date as string, rate: num(row.rate) }));
}

/** Live or scenario forwards for a pair, retired rows excluded, as scatter points. */
export async function fetchForwards(
  scenarioId: number | null,
  pair: string,
): Promise<ForwardPoint[]> {
  const client = getServerClient();
  if (!client) return [];
  const { data, error } = await scopeToScenario(
    client
      .from('forward_orders')
      .select('order_number, contract_rate, maturity_date, pair, retired_at')
      .eq('pair', pair)
      .is('retired_at', null),
    scenarioId,
  ).order('maturity_date', { ascending: true });
  if (error) throw new Error(`fetchForwards: ${error.message}`);
  return (data ?? []).map((row) => ({
    date: row.maturity_date as string,
    rate: num(row.contract_rate),
    orderNumber: row.order_number as string,
  }));
}

/** Latest model spot forecast per pair, with the uncertainty band. */
export async function fetchSpotForecasts(pair: string): Promise<ForecastBandPoint[]> {
  const client = getServerClient();
  if (!client) return [];
  const { data, error } = await client
    .from('v_spot_forecast_latest')
    .select('target_date, forecast_rate, lower_rate, upper_rate')
    .eq('pair', pair)
    .order('target_date', { ascending: true });
  if (error) throw new Error(`fetchSpotForecasts: ${error.message}`);
  return (data ?? []).map((row) => ({
    date: row.target_date as string,
    rate: num(row.forecast_rate),
    lower: num(row.lower_rate),
    upper: num(row.upper_rate),
  }));
}

/** Latest bank forecast ranges per pair (all banks' most recent runs). */
export async function fetchBankForecastRanges(pair: string): Promise<BankForecastRange[]> {
  const client = getServerClient();
  if (!client) return [];
  const { data, error } = await client
    .from('v_bank_forecast_latest')
    .select('bank, as_of, horizon_label, start_date, end_date, low_rate, high_rate, mid_rate')
    .eq('pair', pair)
    .order('start_date', { ascending: true });
  if (error) throw new Error(`fetchBankForecastRanges: ${error.message}`);
  return (data ?? []).map((row) => ({
    horizonLabel: row.horizon_label as string,
    startWeeks: 0,
    endWeeks: 0,
    openEnded: false,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    low: num(row.low_rate),
    high: num(row.high_rate),
    mid: num(row.mid_rate),
  }));
}

/**
 * Incoming USD payable orders for the recommendation engine. Receivables and
 * retired-scenario rows are out of scope; a payable is USD the business must buy.
 */
export async function fetchOrders(
  scenarioId: number | null,
  pair: string,
): Promise<IncomingOrder[]> {
  const client = getServerClient();
  if (!client) return [];
  const { data, error } = await scopeToScenario(
    client
      .from('usd_exposures')
      .select('id, forecast_date, pair, amount_usd, direction')
      .eq('pair', pair)
      .eq('direction', 'payable'),
    scenarioId,
  ).order('forecast_date', { ascending: true });
  if (error) throw new Error(`fetchOrders: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    date: row.forecast_date as string,
    pair: row.pair as string,
    amountUsd: num(row.amount_usd),
  }));
}

/** Forward hedge inventory: buy contracts (USD bought forward) still live. */
export async function fetchHedgeInventory(
  scenarioId: number | null,
  pair: string,
): Promise<HedgeLot[]> {
  const client = getServerClient();
  if (!client) return [];
  const { data, error } = await scopeToScenario(
    client
      .from('forward_orders')
      .select('order_number, pair, amount_usd, contract_rate, maturity_date, buy_sell, retired_at')
      .eq('pair', pair)
      .eq('buy_sell', 'buy')
      .is('retired_at', null),
    scenarioId,
  ).order('maturity_date', { ascending: true });
  if (error) throw new Error(`fetchHedgeInventory: ${error.message}`);
  return (data ?? []).map((row) => ({
    orderNumber: row.order_number as string,
    pair: row.pair as string,
    amountUsd: num(row.amount_usd),
    contractRate: num(row.contract_rate),
    maturityDate: row.maturity_date as string,
  }));
}

/** The most recent spot rate for a pair, or null when there is no history. */
export async function fetchLatestSpot(pair: string): Promise<number | null> {
  const client = getServerClient();
  if (!client) return null;
  const { data, error } = await client
    .from('spot_history')
    .select('rate')
    .eq('pair', pair)
    .order('date', { ascending: false })
    .limit(1);
  if (error) throw new Error(`fetchLatestSpot: ${error.message}`);
  const row = (data ?? [])[0];
  return row ? num(row.rate) : null;
}

/** Latest annualised rate per currency, as a lookup for the IRP line. */
export async function fetchRateAssumptions(): Promise<Record<string, number>> {
  const client = getServerClient();
  if (!client) return {};
  const { data, error } = await client
    .from('v_rate_assumptions_latest')
    .select('currency, annual_rate');
  if (error) throw new Error(`fetchRateAssumptions: ${error.message}`);
  const map: Record<string, number> = {};
  for (const row of data ?? []) {
    map[row.currency as string] = num(row.annual_rate);
  }
  return map;
}

// Incoming USD requirements sourced from the shipping app (visibility.shipments)
// instead of manually-entered exposures. Each shipment's fob_value_usd is the
// USD payable, due around its eta_current. Read through the same shared Supabase
// client, pointed at the visibility schema. Returns [] if the schema or table is
// not present (for example running against a project without shipping applied).
//
// All supplier payments are made in USD, so the requirement is a single USD
// figure; AUD/GBP/EUR are alternative funding currencies (SPEC section 8). Every
// order is quoted AUD/USD here; the total incoming USD is currency-agnostic.
//
// Only FUTURE shipments count as a requirement: a shipment whose ETA has passed
// is already paid, not money still to find. So this filters to eta_current on or
// after today. Historical imports therefore do not inflate the future exposure.
export async function fetchIncomingFromShipping(): Promise<IncomingOrder[]> {
  const client = getServerClient();
  if (!client) return [];
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { data, error } = await client
      .schema('visibility')
      .from('shipments')
      .select('id, reference, po, container_no, fob_value_usd, eta_current')
      .not('fob_value_usd', 'is', null)
      .not('eta_current', 'is', null)
      .gte('eta_current', today)
      .order('eta_current', { ascending: true });
    if (error) return [];
    return (data ?? [])
      .map((row) => ({
        id: String((row as Record<string, unknown>).id),
        label:
          ((row as Record<string, unknown>).reference as string) ||
          ((row as Record<string, unknown>).po as string) ||
          ((row as Record<string, unknown>).container_no as string) ||
          String((row as Record<string, unknown>).id),
        date: (row as Record<string, unknown>).eta_current as string,
        pair: 'AUD/USD',
        amountUsd: num((row as Record<string, unknown>).fob_value_usd),
      }))
      .filter((o) => o.amountUsd > 0);
  } catch {
    return [];
  }
}

// Total USD locked in open hedged forward buys, across all funding currencies.
// Unlike fetchHedgeInventory (pair-scoped), this sums every open buy, because
// hedged USD covers the single USD requirement regardless of which currency the
// forward was bought with. Returns 0 when Supabase is not configured.
export async function fetchTotalHedgedUsd(
  scenarioId: number | null,
): Promise<number> {
  const client = getServerClient();
  if (!client) return 0;
  const { data, error } = await scopeToScenario(
    client
      .from('forward_orders')
      .select('amount_usd, buy_sell, retired_at')
      .eq('buy_sell', 'buy')
      .is('retired_at', null),
    scenarioId,
  );
  if (error) return 0;
  return (data ?? []).reduce((sum, row) => sum + num(row.amount_usd), 0);
}
