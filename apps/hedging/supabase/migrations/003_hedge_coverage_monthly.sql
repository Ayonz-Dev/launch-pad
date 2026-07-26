-- 003_hedge_coverage_monthly.sql
-- The single source the KPI cards read for coverage, plus the latest cash view.
--
-- Buckets are monthly, matching MYOB and treasury reporting. Grouping is per
-- scenario and per pair. Live rows (scenario_id null) and scenario rows never
-- mix, because the exposure-to-hedge join uses "is not distinct from" on
-- scenario_id. A plain equality join would treat null = null as unknown and
-- silently drop every live bucket.

create view v_hedge_coverage_monthly as
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
create view v_cash_latest as
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
