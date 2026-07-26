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
