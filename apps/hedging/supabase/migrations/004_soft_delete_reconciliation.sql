-- 004_soft_delete_reconciliation.sql
-- Soft-delete columns on forward_orders, an updated_at trigger, a refresh of
-- the coverage view to ignore retired rows, and the n8n reconciliation DML as
-- a commented template.

alter table forward_orders
  add column status text not null default 'active'
    check (status in ('active', 'retired')),
  add column source text not null default 'manual',
  add column import_batch_id text,
  add column updated_at timestamptz not null default now(),
  add column retired_at timestamptz;

-- Keep updated_at honest on every mutation.
create or replace function forward_orders_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger forward_orders_updated_at
  before update on forward_orders
  for each row execute function forward_orders_set_updated_at();

create index forward_orders_status_idx on forward_orders (status);
create index forward_orders_import_batch_idx on forward_orders (import_batch_id);

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
