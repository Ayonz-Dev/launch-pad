-- 006_spot_forecasts.sql
-- Model spot forecasts with an uncertainty band, written by a scheduled job
-- (see scripts/generate-forecasts.mjs). This is model opinion, not arbitrage
-- free maths, so it is stored and drawn with a band and a distinct label.
--
-- Each run stamps an as_of date and a full set of target_date rows. The latest
-- view exposes only the most recent run per pair.

create table spot_forecasts (
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

create index spot_forecasts_pair_asof_idx on spot_forecasts (pair, as_of desc);

-- The most recent run per pair, with all of its horizon rows.
create view v_spot_forecast_latest as
with latest as (
  select pair, max(as_of) as as_of
  from spot_forecasts
  group by pair
)
select f.pair, f.as_of, f.target_date, f.forecast_rate, f.lower_rate, f.upper_rate, f.model
from spot_forecasts f
join latest l on l.pair = f.pair and l.as_of = f.as_of
order by f.pair, f.target_date;
