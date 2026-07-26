-- ============================================================================
-- Ayonz hedging FX engine schema (run SECOND) — same shared project
--
-- Creates the public FX tables/views the hedging app reads: currency_pairs,
-- scenarios, usd_exposures, forward_orders, usd_cash_balances, spot_history,
-- rate_assumptions, spot_forecasts, bank_forecast_ranges and the coverage
-- views. Consolidated from apps/hedging/supabase/migrations (000-007) in order.
-- Independent of the platform schema; the hedging app reads incoming orders
-- from visibility.shipments (created by 01), so run 01 first if using that.
-- After running:  notify pgrst, 'reload schema';
-- ============================================================================


-- >>> 000_baseline.sql >>>

-- 000_baseline.sql
-- Pre-refactor baseline.
--
-- The 001 to 004 chain described in the project brief presupposes an existing
-- database: migration 002 refactors forward_orders and usd_cash_balances that
-- were already there, migrating the retired is_sandbox boolean into scenarios.
-- This baseline recreates that starting state so the whole chain runs on a
-- fresh Supabase project and the is_sandbox migration has real columns to work
-- against.
--
-- Conventions (do not break):
--   USD is the anchor. Every pair is quoted with USD as the quote currency,
--   so AUD/USD means USD per 1 AUD. Base units = amount_usd / rate.
--   Rates are numeric(12,6). Money is numeric(18,2). Never float.
--   Australian English throughout. No em-dashes.

-- Historical USD spot timeline.
create table if not exists spot_history (
  date date not null,
  pair text not null,
  rate numeric(12,6) not null check (rate > 0),
  primary key (date, pair)
);

-- Bank forecast baseline (opinion, not arbitrage-free).
create table if not exists bank_forecasts (
  target_date date not null,
  pair text not null,
  rate numeric(12,6) not null check (rate > 0),
  primary key (target_date, pair)
);

-- Hedges. Plotted as dots at maturity_date. amount_local and buy_sell arrive
-- in migration 002; scenario handling replaces is_sandbox there.
create table if not exists forward_orders (
  id bigint generated always as identity primary key,
  order_number text not null,
  pair text not null,
  contract_rate numeric(12,6) not null check (contract_rate > 0),
  amount_usd numeric(18,2) not null check (amount_usd >= 0),
  maturity_date date not null,
  is_sandbox boolean not null default false,
  created_at timestamptz not null default now()
);

-- Foreign USD cash safety band. Becomes a time series (as_of_date) in 002.
create table if not exists usd_cash_balances (
  id bigint generated always as identity primary key,
  account_name text not null,
  institution text,
  balance_amount_usd numeric(18,2) not null,
  local_currency text not null default 'USD',
  is_sandbox boolean not null default false
);


-- >>> 001_exposures_and_scenarios.sql >>>

-- 001_exposures_and_scenarios.sql
-- Reference tables (currency_pairs, scenarios), the usd_exposures fact table,
-- and the per-row signed exposure view.

-- Canonical pair registry. USD is the anchor, so quote_currency is always USD.
create table if not exists currency_pairs (
  pair text primary key,
  base_currency text not null,
  quote_currency text not null,
  is_active boolean not null default true,
  check (quote_currency = 'USD'),
  check (pair = base_currency || '/' || quote_currency)
);

insert into currency_pairs (pair, base_currency, quote_currency, is_active) values
  ('AUD/USD', 'AUD', 'USD', true),
  ('EUR/USD', 'EUR', 'USD', true),
  ('GBP/USD', 'GBP', 'USD', true)
  on conflict do nothing;

-- A null scenario_id everywhere else means live data. A non-null value means a
-- sandbox what-if. This replaced the old is_sandbox boolean.
create table if not exists scenarios (
  id bigint generated always as identity primary key,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

-- Forecast USD cash flows: the centre of gravity for all coverage maths.
-- amount_usd is a positive magnitude. The sign comes from direction.
-- confidence in 0..1 drives risk-adjusted exposure.
create table if not exists usd_exposures (
  id bigint generated always as identity primary key,
  forecast_date date not null,
  pair text not null references currency_pairs (pair),
  amount_usd numeric(18,2) not null check (amount_usd >= 0),
  direction text not null check (direction in ('payable', 'receivable')),
  confidence numeric(4,3) not null default 1 check (confidence >= 0 and confidence <= 1),
  source text not null default 'manual',
  scenario_id bigint references scenarios (id),
  created_at timestamptz not null default now()
);

create index if not exists usd_exposures_scenario_idx on usd_exposures (scenario_id);
create index if not exists usd_exposures_pair_date_idx on usd_exposures (pair, forecast_date);

-- Now that currency_pairs exists, enforce canonical pair strings on the
-- historical and forecast timelines too.
alter table spot_history
  add constraint spot_history_pair_fkey foreign key (pair) references currency_pairs (pair);
alter table bank_forecasts
  add constraint bank_forecasts_pair_fkey foreign key (pair) references currency_pairs (pair);

-- Per-row signed and confidence-weighted net exposure.
-- Payable is cash out (negative), receivable is cash in (positive).
create or replace view v_exposure_signed as
select
  e.id,
  e.forecast_date,
  e.pair,
  e.amount_usd,
  e.direction,
  e.confidence,
  e.source,
  e.scenario_id,
  e.created_at,
  case e.direction when 'payable' then -e.amount_usd else e.amount_usd end
    as signed_usd,
  (case e.direction when 'payable' then -e.amount_usd else e.amount_usd end) * e.confidence
    as weighted_usd
from usd_exposures e;


-- >>> 002_scenario_refactor.sql >>>

-- 002_scenario_refactor.sql
-- Retires the is_sandbox boolean in favour of scenario_id, so multiple what-ifs
-- can coexist and be diffed. Adds buy_sell and the generated amount_local to
-- forward_orders, turns usd_cash_balances into a time series, and installs the
-- live and per-scenario uniqueness rules on order_number.

-- Forward orders: scenario handling, direction, and the generated local amount.
alter table forward_orders
  add column if not exists scenario_id bigint references scenarios (id),
  add column if not exists buy_sell text check (buy_sell in ('buy', 'sell')),
  add column if not exists amount_local numeric(18,2)
    generated always as (amount_usd / contract_rate) stored;

-- Enforce canonical pair strings on hedges.
alter table forward_orders
  add constraint forward_orders_pair_fkey foreign key (pair) references currency_pairs (pair);

-- Cash balances: scenario handling plus an as_of_date so the safety band is a
-- time series rather than a single snapshot.
alter table usd_cash_balances
  add column if not exists scenario_id bigint references scenarios (id),
  add column if not exists as_of_date date not null default current_date;

-- Migrate the retired is_sandbox rows into a single Legacy Sandbox scenario.
do $$
declare
  legacy_id bigint;
begin
  insert into scenarios (name, description)
  values ('Legacy Sandbox', 'Migrated from the retired is_sandbox flag.')
  returning id into legacy_id;

  update forward_orders set scenario_id = legacy_id where is_sandbox;
  update usd_cash_balances set scenario_id = legacy_id where is_sandbox;
end $$;

alter table forward_orders drop column is_sandbox;
alter table usd_cash_balances drop column is_sandbox;

-- Uniqueness on order_number is scoped by liveness. A live forward and its
-- forked scenario copy share an order_number, so a plain unique index would
-- reject the fork. Partial indexes keep one live row and one row per scenario.
create unique index if not exists forward_orders_live_order_no
  on forward_orders (order_number)
  where scenario_id is null;

create unique index if not exists forward_orders_scenario_order_no
  on forward_orders (scenario_id, order_number)
  where scenario_id is not null;

create index if not exists forward_orders_scenario_idx on forward_orders (scenario_id);
create index if not exists usd_cash_balances_scenario_idx on usd_cash_balances (scenario_id);
create index if not exists usd_cash_balances_account_asof_idx
  on usd_cash_balances (account_name, as_of_date);


-- >>> 003_hedge_coverage_monthly.sql >>>

-- 003_hedge_coverage_monthly.sql
-- The single source the KPI cards read for coverage, plus the latest cash view.
--
-- Buckets are monthly, matching MYOB and treasury reporting. Grouping is per
-- scenario and per pair. Live rows (scenario_id null) and scenario rows never
-- mix, because the exposure-to-hedge join uses "is not distinct from" on
-- scenario_id. A plain equality join would treat null = null as unknown and
-- silently drop every live bucket.

create or replace view v_hedge_coverage_monthly as
with exposure_m as (
  select
    date_trunc('month', forecast_date)::date as bucket_month,
    scenario_id,
    pair,
    sum(amount_usd) filter (where direction = 'payable')    as gross_payable_usd,
    sum(amount_usd) filter (where direction = 'receivable') as gross_receivable_usd,
    sum(case direction when 'payable' then -amount_usd else amount_usd end)
      as net_exposure_usd,
    sum((case direction when 'payable' then -amount_usd else amount_usd end) * confidence)
      as net_exposure_weighted_usd
  from usd_exposures
  group by 1, 2, 3
),
forward_m as (
  select
    date_trunc('month', maturity_date)::date as bucket_month,
    scenario_id,
    pair,
    sum(amount_usd) filter (where buy_sell = 'buy')  as hedged_buy_usd,
    sum(amount_usd) filter (where buy_sell = 'sell') as hedged_sell_usd,
    sum(amount_usd)                                  as hedged_total_usd,
    -- Amount-weighted blended contract rate: total USD over total base units.
    sum(amount_usd) / nullif(sum(amount_local), 0)   as blended_forward_rate
  from forward_orders
  group by 1, 2, 3
)
select
  coalesce(e.bucket_month, f.bucket_month)            as bucket_month,
  coalesce(e.scenario_id, f.scenario_id)              as scenario_id,
  coalesce(e.pair, f.pair)                            as pair,
  coalesce(e.gross_payable_usd, 0)                    as gross_payable_usd,
  coalesce(e.gross_receivable_usd, 0)                 as gross_receivable_usd,
  coalesce(e.net_exposure_usd, 0)                     as net_exposure_usd,
  coalesce(e.net_exposure_weighted_usd, 0)            as net_exposure_weighted_usd,
  coalesce(f.hedged_buy_usd, 0)                       as hedged_buy_usd,
  coalesce(f.hedged_sell_usd, 0)                      as hedged_sell_usd,
  coalesce(f.hedged_total_usd, 0)                     as hedged_total_usd,
  f.blended_forward_rate                             as blended_forward_rate,
  -- Coverage is gross by default: hedged USD buys over gross USD payables,
  -- which suits a net-payable importer. To hedge on a net basis, swap
  -- gross_payable_usd for abs(net_exposure_usd) on the next two lines.
  case
    when coalesce(e.gross_payable_usd, 0) > 0
      then coalesce(f.hedged_buy_usd, 0) / e.gross_payable_usd
    else null
  end                                                 as payable_coverage_ratio,
  greatest(coalesce(e.gross_payable_usd, 0) - coalesce(f.hedged_buy_usd, 0), 0)
                                                      as unhedged_payable_usd
from exposure_m e
full outer join forward_m f
  on  e.bucket_month = f.bucket_month
  and e.pair = f.pair
  and e.scenario_id is not distinct from f.scenario_id;

-- Most recent balance per cash account and scenario: the numerator for buffer
-- coverage. DISTINCT ON groups NULL scenario_id (live) as a single value.
create or replace view v_cash_latest as
select distinct on (account_name, scenario_id)
  id,
  account_name,
  institution,
  balance_amount_usd,
  local_currency,
  as_of_date,
  scenario_id
from usd_cash_balances
order by account_name, scenario_id, as_of_date desc;


-- >>> 004_soft_delete_reconciliation.sql >>>

-- 004_soft_delete_reconciliation.sql
-- Soft-delete columns on forward_orders, an updated_at trigger, a refresh of
-- the coverage view to ignore retired rows, and the n8n reconciliation DML as
-- a commented template.

alter table forward_orders
  add column if not exists status text not null default 'active'
    check (status in ('active', 'retired')),
  add column if not exists source text not null default 'manual',
  add column if not exists import_batch_id text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists retired_at timestamptz;

-- Keep updated_at honest on every mutation.
create or replace function forward_orders_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists forward_orders_updated_at on forward_orders;
create trigger forward_orders_updated_at
  before update on forward_orders
  for each row execute function forward_orders_set_updated_at();

create index if not exists forward_orders_status_idx on forward_orders (status);
create index if not exists forward_orders_import_batch_idx on forward_orders (import_batch_id);

-- Refresh v_hedge_coverage_monthly so retired forwards drop out of coverage.
-- Same column list as 003, so create or replace is valid. Only the forward_m
-- CTE changes: it now filters retired_at is null.
create or replace view v_hedge_coverage_monthly as
with exposure_m as (
  select
    date_trunc('month', forecast_date)::date as bucket_month,
    scenario_id,
    pair,
    sum(amount_usd) filter (where direction = 'payable')    as gross_payable_usd,
    sum(amount_usd) filter (where direction = 'receivable') as gross_receivable_usd,
    sum(case direction when 'payable' then -amount_usd else amount_usd end)
      as net_exposure_usd,
    sum((case direction when 'payable' then -amount_usd else amount_usd end) * confidence)
      as net_exposure_weighted_usd
  from usd_exposures
  group by 1, 2, 3
),
forward_m as (
  select
    date_trunc('month', maturity_date)::date as bucket_month,
    scenario_id,
    pair,
    sum(amount_usd) filter (where buy_sell = 'buy')  as hedged_buy_usd,
    sum(amount_usd) filter (where buy_sell = 'sell') as hedged_sell_usd,
    sum(amount_usd)                                  as hedged_total_usd,
    sum(amount_usd) / nullif(sum(amount_local), 0)   as blended_forward_rate
  from forward_orders
  where retired_at is null
  group by 1, 2, 3
)
select
  coalesce(e.bucket_month, f.bucket_month)            as bucket_month,
  coalesce(e.scenario_id, f.scenario_id)              as scenario_id,
  coalesce(e.pair, f.pair)                            as pair,
  coalesce(e.gross_payable_usd, 0)                    as gross_payable_usd,
  coalesce(e.gross_receivable_usd, 0)                 as gross_receivable_usd,
  coalesce(e.net_exposure_usd, 0)                     as net_exposure_usd,
  coalesce(e.net_exposure_weighted_usd, 0)            as net_exposure_weighted_usd,
  coalesce(f.hedged_buy_usd, 0)                       as hedged_buy_usd,
  coalesce(f.hedged_sell_usd, 0)                       as hedged_sell_usd,
  coalesce(f.hedged_total_usd, 0)                     as hedged_total_usd,
  f.blended_forward_rate                             as blended_forward_rate,
  case
    when coalesce(e.gross_payable_usd, 0) > 0
      then coalesce(f.hedged_buy_usd, 0) / e.gross_payable_usd
    else null
  end                                                 as payable_coverage_ratio,
  greatest(coalesce(e.gross_payable_usd, 0) - coalesce(f.hedged_buy_usd, 0), 0)
                                                      as unhedged_payable_usd
from exposure_m e
full outer join forward_m f
  on  e.bucket_month = f.bucket_month
  and e.pair = f.pair
  and e.scenario_id is not distinct from f.scenario_id;

-- ---------------------------------------------------------------------------
-- n8n CSV reconciliation template (executed per import batch, not at migrate
-- time). Soft-delete reconciliation: upsert on order_number, then retire the
-- live MYOB rows that were not seen in this batch.
--
-- source defaults to 'manual', so hand-entered live forwards are never
-- auto-retired. Scenario rows (scenario_id not null) are always excluded.
--
-- ASSUMPTION: each CSV is a complete snapshot of live forwards. A partial or
-- delta export would wrongly retire everything it omits. If MYOB exports
-- partials, scope the retire step to the pairs or date range present in the
-- batch.
--
-- 1. Upsert the batch rows (live, sourced from MYOB):
--
-- insert into forward_orders
--   (order_number, pair, contract_rate, amount_usd, maturity_date, buy_sell,
--    scenario_id, source, import_batch_id, status, retired_at)
-- values
--   (:order_number, :pair, :contract_rate, :amount_usd, :maturity_date,
--    :buy_sell, null, 'myob', :batch_id, 'active', null)
-- on conflict (order_number) where scenario_id is null
-- do update set
--   pair           = excluded.pair,
--   contract_rate  = excluded.contract_rate,
--   amount_usd     = excluded.amount_usd,
--   maturity_date  = excluded.maturity_date,
--   buy_sell       = excluded.buy_sell,
--   source         = 'myob',
--   import_batch_id = excluded.import_batch_id,
--   status         = 'active',
--   retired_at     = null;
--
-- 2. Retire the live MYOB rows absent from this batch:
--
-- update forward_orders
--   set status = 'retired', retired_at = now()
-- where scenario_id is null
--   and source = 'myob'
--   and status = 'active'
--   and import_batch_id is distinct from :batch_id;
-- ---------------------------------------------------------------------------


-- >>> 005_rate_assumptions.sql >>>

-- 005_rate_assumptions.sql
-- Interest-rate differential source for the IRP predictive line.
--
-- A per-currency, per-as_of time series so assumptions are auditable and
-- swappable without a redeploy. annual_rate is an annualised decimal, so
-- 0.0435 means 4.35 per cent per annum. The IRP lib stays pure and receives
-- resolved rates; a helper reads the latest row per currency from the view.
--
-- Seed values keep AUD and GBP above USD, so AUD/USD and GBP/USD sit at a
-- forward discount, which matches the classic Australian importer picture and
-- is what the IRP test harness asserts.

create table if not exists rate_assumptions (
  currency text not null,
  as_of date not null default current_date,
  annual_rate numeric(12,6) not null,
  source text not null default 'seed',
  note text,
  primary key (currency, as_of)
);

insert into rate_assumptions (currency, as_of, annual_rate, source, note) values
  ('USD', current_date, 0.041000, 'seed', 'Anchor currency short rate.'),
  ('AUD', current_date, 0.043500, 'seed', 'Above USD, so AUD/USD is at a forward discount.'),
  ('EUR', current_date, 0.032500, 'seed', 'Below USD, so EUR/USD is at a forward premium.'),
  ('GBP', current_date, 0.047500, 'seed', 'Above USD, so GBP/USD is at a forward discount.')
  on conflict do nothing;

-- Latest assumption per currency.
create or replace view v_rate_assumptions_latest as
select distinct on (currency)
  currency,
  as_of,
  annual_rate,
  source,
  note
from rate_assumptions
order by currency, as_of desc;


-- >>> 006_spot_forecasts.sql >>>

-- 006_spot_forecasts.sql
-- Model spot forecasts with an uncertainty band, written by a scheduled job
-- (see scripts/generate-forecasts.mjs). This is model opinion, not arbitrage
-- free maths, so it is stored and drawn with a band and a distinct label.
--
-- Each run stamps an as_of date and a full set of target_date rows. The latest
-- view exposes only the most recent run per pair.

create table if not exists spot_forecasts (
  id bigint generated always as identity primary key,
  pair text not null references currency_pairs (pair),
  as_of date not null default current_date,
  target_date date not null,
  forecast_rate numeric(12,6) not null check (forecast_rate > 0),
  lower_rate numeric(12,6) not null check (lower_rate > 0),
  upper_rate numeric(12,6) not null check (upper_rate >= lower_rate),
  model text not null default 'damped_holt',
  created_at timestamptz not null default now(),
  unique (pair, as_of, target_date)
);

create index if not exists spot_forecasts_pair_asof_idx on spot_forecasts (pair, as_of desc);

-- The most recent run per pair, with all of its horizon rows.
create or replace view v_spot_forecast_latest as
with latest as (
  select pair, max(as_of) as as_of
  from spot_forecasts
  group by pair
)
select f.pair, f.as_of, f.target_date, f.forecast_rate, f.lower_rate, f.upper_rate, f.model
from spot_forecasts f
join latest l on l.pair = f.pair and l.as_of = f.as_of
order by f.pair, f.target_date;


-- >>> 007_bank_forecast_ranges.sql >>>

-- 007_bank_forecast_ranges.sql
-- Bank forecast RANGES parsed from macro commentary pasted out of email.
--
-- Banks give a range over a horizon (e.g. "1-3wks: 0.6865-0.7100"), not a point,
-- so this stores a low/high band per horizon with a generated midpoint. It sits
-- alongside the point `bank_forecasts` table (untouched): that table feeds the
-- simple opinion dot line; this one feeds a shaded range band with a midline.
--
-- Each paste is one run, stamped with the email's as_of date and the bank name.
-- The latest view exposes the most recent run per pair and bank. Rates are
-- numeric(12,6); money is not involved here. Australian English, no em-dashes.

create table if not exists bank_forecast_ranges (
  id bigint generated always as identity primary key,
  pair text not null references currency_pairs (pair),
  as_of date not null default current_date,
  bank text not null default 'Bank',
  horizon_label text not null,
  start_date date not null,
  end_date date not null,
  low_rate numeric(12,6) not null check (low_rate > 0),
  high_rate numeric(12,6) not null check (high_rate >= low_rate),
  mid_rate numeric(12,6) generated always as ((low_rate + high_rate) / 2) stored,
  commentary text,
  created_at timestamptz not null default now(),
  unique (pair, as_of, bank, horizon_label)
);

create index if not exists bank_forecast_ranges_pair_asof_idx
  on bank_forecast_ranges (pair, as_of desc);

-- The most recent run per pair and bank, with all of its horizon rows. When a
-- pair has forecasts from several banks, each bank's latest run is returned.
create or replace view v_bank_forecast_latest as
with latest as (
  select pair, bank, max(as_of) as as_of
  from bank_forecast_ranges
  group by pair, bank
)
select
  r.pair,
  r.bank,
  r.as_of,
  r.horizon_label,
  r.start_date,
  r.end_date,
  r.low_rate,
  r.high_rate,
  r.mid_rate
from bank_forecast_ranges r
join latest l
  on l.pair = r.pair and l.bank = r.bank and l.as_of = r.as_of
order by r.pair, r.bank, r.start_date;

