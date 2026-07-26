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

create table bank_forecast_ranges (
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

create index bank_forecast_ranges_pair_asof_idx
  on bank_forecast_ranges (pair, as_of desc);

-- The most recent run per pair and bank, with all of its horizon rows. When a
-- pair has forecasts from several banks, each bank's latest run is returned.
create view v_bank_forecast_latest as
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
