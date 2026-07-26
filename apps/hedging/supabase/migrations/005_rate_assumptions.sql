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

create table rate_assumptions (
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
  ('GBP', current_date, 0.047500, 'seed', 'Above USD, so GBP/USD is at a forward discount.');

-- Latest assumption per currency.
create view v_rate_assumptions_latest as
select distinct on (currency)
  currency,
  as_of,
  annual_rate,
  source,
  note
from rate_assumptions
order by currency, as_of desc;
