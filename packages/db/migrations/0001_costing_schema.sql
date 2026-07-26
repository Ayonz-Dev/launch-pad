-- ============================================================================
-- Ayonz Costing App — Supabase schema (starting migration)
-- Principle: store ONLY inputs. Every calculated ("locked") cell is derived in
-- a read-only VIEW, so the numbers can never be written or tampered with from
-- the client. The UI locks them visually; the database locks them for real.
-- Australian English. Review with Claude Code before applying to production.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Roles / profiles  (Supabase Auth provides auth.users; we add a profile)
-- ---------------------------------------------------------------------------
create type costing_role as enum
  ('account_coordinator','account_manager','general_manager','final_check','accounts');

create type costing_status as enum ('draft','pending','sent_back','approved');

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        costing_role not null default 'account_coordinator',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 1. Global settings  (CEO working FX rate — single row)
-- ---------------------------------------------------------------------------
create table settings (
  id          boolean primary key default true check (id),   -- forces one row
  working_fx  numeric(10,4) not null default 0.6500,
  updated_by  uuid references profiles(id),
  updated_at  timestamptz not null default now()
);
insert into settings (id) values (true) on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Rate card  (the RATES tab — shared cost assumptions)
-- ---------------------------------------------------------------------------
create table rate_cards (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  is_default      boolean not null default false,
  units_20        integer not null,
  units_40        integer not null,
  units_40hc      integer not null,
  freight_20_usd  numeric(12,2) not null,
  freight_40_usd  numeric(12,2) not null,
  freight_40hc_usd numeric(12,2) not null,
  destuff_aud     numeric(10,4) not null,
  consultant_aud  numeric(10,4) not null,
  ewaste_aud      numeric(10,4) not null,
  gst_rate        numeric(6,4)  not null default 0.10,
  finance_lc      numeric(6,4)  not null default 0.02,
  finance_30      numeric(6,4)  not null default 0.04,
  finance_60      numeric(6,4)  not null default 0.06,
  finance_90      numeric(6,4)  not null default 0.08,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Costings  (the INPUTS tab — pure inputs only, no derived values)
-- ---------------------------------------------------------------------------
create table costings (
  id              uuid primary key default gen_random_uuid(),
  sku             text not null,
  description     text,
  brand           text,
  vendor          text,
  fob_usd         numeric(12,2) not null,
  duty_rate       numeric(6,4)  not null default 0.05,
  payment_term    text not null default 'TT 60 days',   -- LC at sight | TT 30/60/90 days
  container_config text not null default '40FT High',   -- 20FT | 40FT | 40FT High
  sell_ex_gst     numeric(12,2) not null,
  rrp_inc_gst     numeric(12,2) not null,
  licences        jsonb not null default '[]'::jsonb,    -- [{name, usd, on}]
  rate_card_id    uuid not null references rate_cards(id),
  working_fx      numeric(10,4) not null,                -- snapshot at creation
  final_fx        numeric(10,4),                         -- set at Final Check / Accounts
  stage           costing_role   not null default 'account_coordinator',
  status          costing_status not null default 'draft',
  created_by      uuid not null references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on costings (status, stage);
create index on costings (created_by);

-- ---------------------------------------------------------------------------
-- 4. Approval trail  (append-only history)
-- ---------------------------------------------------------------------------
create table costing_history (
  id          uuid primary key default gen_random_uuid(),
  costing_id  uuid not null references costings(id) on delete cascade,
  action      text not null,          -- submitted | approved | sent_back | fx_adjusted | final_approved
  actor       uuid references profiles(id),
  actor_role  costing_role,
  notes       text,
  detail      text,
  created_at  timestamptz not null default now()
);
create index on costing_history (costing_id, created_at);

-- ---------------------------------------------------------------------------
-- 5. Computed view  (the ENGINE + EXPORT tabs — READ ONLY, derived live)
--    A view cannot be written to, so these values are structurally locked.
-- ---------------------------------------------------------------------------
create or replace view costing_computed as
with base as (
  select
    c.id, c.sku, c.description, c.brand, c.vendor, c.fob_usd, c.duty_rate,
    c.payment_term, c.container_config, c.sell_ex_gst, c.rrp_inc_gst,
    c.licences, c.working_fx, c.final_fx, c.stage, c.status,
    r.units_20, r.units_40, r.units_40hc,
    r.freight_20_usd, r.freight_40_usd, r.freight_40hc_usd,
    r.destuff_aud, r.consultant_aud, r.ewaste_aud, r.gst_rate,
    r.finance_lc, r.finance_30, r.finance_60, r.finance_90,
    coalesce(c.final_fx, c.working_fx) as fx,
    (select coalesce(sum((l->>'usd')::numeric),0)
       from jsonb_array_elements(c.licences) l
       where (l->>'on')::boolean) as royalty_usd,
    case c.container_config
      when '20FT' then nullif(r.units_20,0)
      when '40FT' then nullif(r.units_40,0)
      else nullif(r.units_40hc,0) end as units,
    case c.container_config
      when '20FT' then r.freight_20_usd
      when '40FT' then r.freight_40_usd
      else r.freight_40hc_usd end as freight_ctr_usd,
    case c.payment_term
      when 'LC at sight' then r.finance_lc
      when 'TT 30 days'  then r.finance_30
      when 'TT 90 days'  then r.finance_90
      else r.finance_60 end as finance_rate
  from costings c
  join rate_cards r on r.id = c.rate_card_id
),
calc as (
  select *,
    (fob_usd + royalty_usd) / fx                       as exworks_aud,
    duty_rate * (fob_usd / fx)                          as duty_aud,
    (freight_ctr_usd / units) / fx                      as freight_aud,
    destuff_aud                                         as destuff_pu_aud
  from base
),
landed as (
  select *, (exworks_aud + duty_aud + freight_aud + destuff_pu_aud) as landed_aud
  from calc
),
loaded as (
  select *,
    (finance_rate * landed_aud)                         as finance_aud,
    landed_aud + (finance_rate * landed_aud) + consultant_aud + ewaste_aud as loaded_aud,
    rrp_inc_gst / (1 + gst_rate)                        as rrp_ex_gst
  from landed
)
select
  id, sku, description, brand, vendor, container_config, payment_term,
  fx, royalty_usd,
  round(exworks_aud,2)  as exworks_aud,
  round(duty_aud,2)     as duty_aud,
  round(freight_aud,2)  as freight_per_unit_aud,
  round(destuff_pu_aud,2) as destuff_per_unit_aud,
  round(landed_aud,2)   as landed_aud,
  round(finance_aud,2)  as finance_aud,
  round(consultant_aud,2) as consultant_aud,
  round(ewaste_aud,2)   as ewaste_aud,
  round(loaded_aud,2)   as loaded_aud,
  sell_ex_gst,
  round(sell_ex_gst - loaded_aud,2)                     as gross_profit_aud,
  round((sell_ex_gst - loaded_aud) / nullif(sell_ex_gst,0),4) as gp_pct,
  round(rrp_ex_gst,2)   as rrp_ex_gst,
  rrp_inc_gst,
  round((rrp_ex_gst - sell_ex_gst) / nullif(rrp_ex_gst,0),4)  as retailer_margin_pct,
  stage, status
from loaded;

-- ---------------------------------------------------------------------------
-- 6. Row Level Security  (who may edit what — enforced server-side)
-- ---------------------------------------------------------------------------
alter table costings enable row level security;
alter table costing_history enable row level security;
alter table rate_cards enable row level security;
alter table settings enable row level security;

-- helper: current user's role
create or replace function my_role() returns costing_role
  language sql stable as $$ select role from profiles where id = auth.uid() $$;

-- everyone signed in can read costings and the computed view
create policy costings_read on costings for select using (auth.uid() is not null);

-- coordinators create their own costings
create policy costings_insert on costings for insert
  with check (created_by = auth.uid() and my_role() = 'account_coordinator');

-- coordinators may edit only their own drafts / sent-back jobs (the input cells)
create policy costings_edit_own_draft on costings for update
  using (created_by = auth.uid() and my_role() = 'account_coordinator'
         and status in ('draft','sent_back'));

-- reviewers may advance / send back the job that is currently at their stage.
-- (Restrict which columns actually change in the API layer or a trigger; RLS
--  gates the row, the app gates stage/status/final_fx transitions.)
create policy costings_review on costings for update
  using (status = 'pending' and stage = my_role());

-- history is append-only for signed-in users; no updates or deletes
create policy history_read on costing_history for select using (auth.uid() is not null);
create policy history_insert on costing_history for insert with check (auth.uid() is not null);

-- rate cards and settings: read for all, write for final_check (CEO) / accounts
create policy rates_read on rate_cards for select using (auth.uid() is not null);
create policy rates_write on rate_cards for all
  using (my_role() in ('final_check','accounts'))
  with check (my_role() in ('final_check','accounts'));
create policy settings_read on settings for select using (auth.uid() is not null);
create policy settings_write on settings for update using (my_role() = 'final_check');

-- ============================================================================
-- Notes for the build:
--  * The client only ever writes to `costings` (inputs) and `costing_history`.
--    It reads `costing_computed` for every locked cell. That is the whole
--    "editable fields only" contract, enforced by the database.
--  * CSV export for MYOB is generated from `costing_computed` once status =
--    'approved'. Phase 2 batches many approved rows into one multi-line CSV.
--  * Phase 3 replaces the CSV with contract-based REST PUT calls to MYOB,
--    triggered from an n8n flow or an edge function after final approval.
-- ============================================================================
