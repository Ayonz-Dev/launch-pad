-- 002_scenario_refactor.sql
-- Retires the is_sandbox boolean in favour of scenario_id, so multiple what-ifs
-- can coexist and be diffed. Adds buy_sell and the generated amount_local to
-- forward_orders, turns usd_cash_balances into a time series, and installs the
-- live and per-scenario uniqueness rules on order_number.

-- Forward orders: scenario handling, direction, and the generated local amount.
alter table forward_orders
  add column scenario_id bigint references scenarios (id),
  add column buy_sell text check (buy_sell in ('buy', 'sell')),
  add column amount_local numeric(18,2)
    generated always as (amount_usd / contract_rate) stored;

-- Enforce canonical pair strings on hedges.
alter table forward_orders
  add constraint forward_orders_pair_fkey foreign key (pair) references currency_pairs (pair);

-- Cash balances: scenario handling plus an as_of_date so the safety band is a
-- time series rather than a single snapshot.
alter table usd_cash_balances
  add column scenario_id bigint references scenarios (id),
  add column as_of_date date not null default current_date;

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
create unique index forward_orders_live_order_no
  on forward_orders (order_number)
  where scenario_id is null;

create unique index forward_orders_scenario_order_no
  on forward_orders (scenario_id, order_number)
  where scenario_id is not null;

create index forward_orders_scenario_idx on forward_orders (scenario_id);
create index usd_cash_balances_scenario_idx on usd_cash_balances (scenario_id);
create index usd_cash_balances_account_asof_idx
  on usd_cash_balances (account_name, as_of_date);
