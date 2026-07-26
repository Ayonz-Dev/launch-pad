-- Costing: layered rate resolution — account freight/buffer, salesperson
-- commission, and rate-card baseline defaults.
--
-- Rates now resolve top-down: standard rate card -> customer/account ->
-- salesperson (commission) -> per-quote override.

-- ---- Customer / account layer ----------------------------------------------
alter table costing.customers
  add column freight_model text not null default 'container'
    check (freight_model in ('container', 'distribution', 'wholesaler')),
  add column freight_per_container_aud numeric(14, 2),
  add column distribution_cost_per_unit_aud numeric(14, 4) not null default 0,
  add column ewaste_fee_per_unit_aud numeric(14, 4) not null default 0,
  add column cost_buffer_rate numeric(9, 6) not null default 0,
  add column default_costing_basis text not null default 'FIW'
    check (default_costing_basis in ('FOB', 'FIW'));

-- ---- Salesperson layer (per app user) --------------------------------------
create table costing.salesperson_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  commission_rate numeric(9, 6) not null default 0,
  is_active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index salesperson_profiles_org_idx on costing.salesperson_profiles(organization_id, user_id);

create trigger salesperson_profiles_set_updated_at before update on costing.salesperson_profiles
for each row execute function iam_private.set_updated_at();

-- ---- Rate-card baseline defaults -------------------------------------------
-- Baseline trading terms + approval thresholds applied to every new costing.
alter table costing.rate_cards
  add column trading_terms jsonb not null default '{}'::jsonb,
  add column thresholds jsonb not null default '{}'::jsonb;

-- ---- Row-level security -----------------------------------------------------
alter table costing.salesperson_profiles enable row level security;

-- Any member can read the roster (so the calculator can resolve commission);
-- only administrators (iam.manage) can set rates.
create policy salesperson_member_read on costing.salesperson_profiles for select to authenticated
  using ((select iam_private.is_member(organization_id)));
create policy salesperson_admin_insert on costing.salesperson_profiles for insert to authenticated
  with check ((select iam_private.authorized('costing', 'iam.manage', organization_id)) and created_by = (select auth.uid()));
create policy salesperson_admin_update on costing.salesperson_profiles for update to authenticated
  using ((select iam_private.authorized('costing', 'iam.manage', organization_id)))
  with check ((select iam_private.authorized('costing', 'iam.manage', organization_id)));
create policy salesperson_admin_delete on costing.salesperson_profiles for delete to authenticated
  using ((select iam_private.authorized('costing', 'iam.manage', organization_id)));

grant select, insert, update, delete on costing.salesperson_profiles to authenticated;
