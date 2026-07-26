-- 001_exposures_and_scenarios.sql
-- Reference tables (currency_pairs, scenarios), the usd_exposures fact table,
-- and the per-row signed exposure view.

-- Canonical pair registry. USD is the anchor, so quote_currency is always USD.
create table currency_pairs (
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
  ('GBP/USD', 'GBP', 'USD', true);

-- A null scenario_id everywhere else means live data. A non-null value means a
-- sandbox what-if. This replaced the old is_sandbox boolean.
create table scenarios (
  id bigint generated always as identity primary key,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

-- Forecast USD cash flows: the centre of gravity for all coverage maths.
-- amount_usd is a positive magnitude. The sign comes from direction.
-- confidence in 0..1 drives risk-adjusted exposure.
create table usd_exposures (
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

create index usd_exposures_scenario_idx on usd_exposures (scenario_id);
create index usd_exposures_pair_date_idx on usd_exposures (pair, forecast_date);

-- Now that currency_pairs exists, enforce canonical pair strings on the
-- historical and forecast timelines too.
alter table spot_history
  add constraint spot_history_pair_fkey foreign key (pair) references currency_pairs (pair);
alter table bank_forecasts
  add constraint bank_forecasts_pair_fkey foreign key (pair) references currency_pairs (pair);

-- Per-row signed and confidence-weighted net exposure.
-- Payable is cash out (negative), receivable is cash in (positive).
create view v_exposure_signed as
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
