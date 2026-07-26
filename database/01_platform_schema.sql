-- ============================================================================
-- Ayonz platform schema (run FIRST) — apply to the shared Supabase project
-- https://jhhorikmpftvzlawcuty.supabase.co
--
-- Creates schemas: iam, iam_private, costing, costing_private, visibility,
-- and the public sourcing_catalog_* / monday_* tables. Consolidated from
-- packages/db/migrations in order. Safe to run once on a fresh project.
-- After running:  notify pgrst, 'reload schema';
-- Expose schemas iam, costing, visibility in the Supabase Data API settings.
-- ============================================================================


-- >>> 20260714234747_initial_costing_platform.sql >>>

-- Ayonz Costing Platform
-- Shared identity and access management is isolated in `iam`.
-- Costing-domain data is isolated in `costing`.

create schema if not exists iam;
create schema if not exists iam_private;
create schema if not exists costing;
create schema if not exists costing_private;

revoke all on schema iam_private from public, anon, authenticated;
revoke all on schema costing_private from public, anon, authenticated;
grant usage on schema iam to authenticated;
grant usage on schema costing to authenticated;
grant usage on schema iam_private to authenticated;

create table iam.applications (
  id uuid primary key default gen_random_uuid(),
  application_key text not null unique check (application_key = lower(application_key)),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table iam.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug = lower(slug)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table iam.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  job_title text,
  phone text,
  default_organization_id uuid references iam.organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table iam.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('invited', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table iam.roles (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references iam.applications(id) on delete cascade,
  role_key text not null check (role_key = lower(role_key)),
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (application_id, role_key),
  unique (id, application_id)
);

create table iam.permissions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references iam.applications(id) on delete cascade,
  permission_key text not null check (permission_key = lower(permission_key)),
  description text,
  created_at timestamptz not null default now(),
  unique (application_id, permission_key),
  unique (id, application_id)
);

create table iam.role_permissions (
  role_id uuid not null,
  permission_id uuid not null,
  application_id uuid not null references iam.applications(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id),
  foreign key (role_id, application_id) references iam.roles(id, application_id) on delete cascade,
  foreign key (permission_id, application_id) references iam.permissions(id, application_id) on delete cascade
);

create table iam.user_role_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id) on delete cascade,
  application_id uuid not null references iam.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (role_id, application_id) references iam.roles(id, application_id) on delete cascade,
  unique (organization_id, application_id, user_id, role_id)
);

create index organization_memberships_user_idx on iam.organization_memberships(user_id, status);
create index user_role_assignments_lookup_idx on iam.user_role_assignments(user_id, organization_id, application_id);
create index role_permissions_role_idx on iam.role_permissions(role_id, permission_id);

create or replace function iam_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function iam_private.set_updated_at() from public, anon, authenticated;

create trigger organizations_set_updated_at
before update on iam.organizations
for each row execute function iam_private.set_updated_at();

create trigger user_profiles_set_updated_at
before update on iam.user_profiles
for each row execute function iam_private.set_updated_at();

create or replace function iam_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into iam.user_profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function iam_private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function iam_private.handle_new_user();

insert into iam.user_profiles (user_id, display_name)
select id, coalesce(raw_user_meta_data ->> 'full_name', split_part(email, '@', 1))
from auth.users
on conflict (user_id) do nothing;

create or replace function iam_private.is_member(requested_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from iam.organization_memberships membership
    where membership.organization_id = requested_organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  );
$$;

create or replace function iam_private.authorized(
  requested_application_key text,
  requested_permission_key text,
  requested_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from iam.user_role_assignments assignment
    join iam.applications application on application.id = assignment.application_id
    join iam.role_permissions binding on binding.role_id = assignment.role_id
    join iam.permissions permission on permission.id = binding.permission_id
    join iam.organization_memberships membership
      on membership.organization_id = assignment.organization_id
      and membership.user_id = assignment.user_id
      and membership.status = 'active'
    where assignment.user_id = (select auth.uid())
      and assignment.organization_id = requested_organization_id
      and application.application_key = requested_application_key
      and permission.permission_key = requested_permission_key
  );
$$;

revoke all on function iam_private.is_member(uuid) from public, anon;
revoke all on function iam_private.authorized(text, text, uuid) from public, anon;
grant execute on function iam_private.is_member(uuid) to authenticated;
grant execute on function iam_private.authorized(text, text, uuid) to authenticated;

insert into iam.applications (application_key, name, description)
values ('costing', 'Costing Platform', 'Manufacturer-to-retail costing, quotes and approvals');

insert into iam.permissions (application_id, permission_key, description)
select app.id, seeded.permission_key, seeded.description
from iam.applications app
cross join (values
  ('quotes.create', 'Create costing quotes'),
  ('quotes.read_all', 'Read all quotes in the organization'),
  ('quotes.update_all', 'Update all quotes in the organization'),
  ('quotes.approve_manager', 'Provide manager approval'),
  ('quotes.approve_ceo', 'Provide final CEO approval'),
  ('rates.manage', 'Manage costing rate cards'),
  ('iam.manage', 'Manage users and roles for this application')
) as seeded(permission_key, description)
where app.application_key = 'costing';

insert into iam.roles (application_id, role_key, name, description, is_system)
select app.id, seeded.role_key, seeded.name, seeded.description, true
from iam.applications app
cross join (values
  ('sales', 'Sales', 'Create and manage own draft quotes'),
  ('manager', 'Sales Manager', 'Review quotes and maintain rate cards'),
  ('ceo', 'CEO', 'Final commercial approval'),
  ('admin', 'Administrator', 'Full costing application administration')
) as seeded(role_key, name, description)
where app.application_key = 'costing';

insert into iam.role_permissions (role_id, permission_id, application_id)
select role.id, permission.id, application.id
from iam.applications application
join iam.roles role on role.application_id = application.id
join iam.permissions permission on permission.application_id = application.id
where application.application_key = 'costing'
  and (
    (role.role_key = 'sales' and permission.permission_key = 'quotes.create')
    or (role.role_key = 'manager' and permission.permission_key in ('quotes.create', 'quotes.read_all', 'quotes.update_all', 'quotes.approve_manager', 'rates.manage'))
    or (role.role_key = 'ceo' and permission.permission_key in ('quotes.read_all', 'quotes.approve_ceo'))
    or role.role_key = 'admin'
  );

create table costing.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id) on delete cascade,
  name text not null,
  customer_code text,
  contact_name text,
  contact_email text,
  payment_terms text,
  trading_terms jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, customer_code)
);

create table costing.rate_cards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id) on delete cascade,
  name text not null,
  currency_rates jsonb not null default '{}'::jsonb,
  logistics_rates jsonb not null default '{}'::jsonb,
  licence_rates jsonb not null default '{}'::jsonb,
  effective_from date not null default current_date,
  effective_to date,
  is_active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create table costing.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id) on delete cascade,
  quote_number text not null,
  status text not null default 'draft' check (status in ('draft', 'ready_for_review', 'manager_approved', 'ceo_approved', 'ready_for_export')),
  sku text not null,
  customer_id uuid references costing.customers(id) on delete set null,
  customer_name text,
  input_snapshot jsonb not null,
  result_snapshot jsonb not null,
  fully_loaded_cost numeric(14, 4),
  net_sell_price numeric(14, 4),
  gross_profit_rate numeric(9, 6),
  retailer_margin_rate numeric(9, 6),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, quote_number)
);

create table costing.quote_versions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references costing.quotes(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  input_snapshot jsonb not null,
  result_snapshot jsonb not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (quote_id, version_number)
);

create table costing.quote_approvals (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references costing.quotes(id) on delete cascade,
  approval_level text not null check (approval_level in ('manager', 'ceo')),
  decision text not null check (decision in ('approved', 'rejected')),
  notes text,
  decided_by uuid not null default auth.uid() references auth.users(id),
  decided_at timestamptz not null default now()
);

create or replace function costing_private.enforce_quote_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status = 'draft'
    and new.status = 'ready_for_review'
    and old.created_by = (select auth.uid()) then
    return new;
  end if;

  if new.status = 'manager_approved'
    and old.status = 'ready_for_review'
    and (select iam_private.authorized('costing', 'quotes.approve_manager', old.organization_id)) then
    return new;
  end if;

  if new.status = 'ceo_approved'
    and old.status = 'manager_approved'
    and (select iam_private.authorized('costing', 'quotes.approve_ceo', old.organization_id)) then
    return new;
  end if;

  if new.status = 'ready_for_export'
    and old.status = 'ceo_approved'
    and (select iam_private.authorized('costing', 'quotes.approve_ceo', old.organization_id)) then
    return new;
  end if;

  raise exception 'Quote status transition from % to % is not permitted', old.status, new.status;
end;
$$;

revoke all on function costing_private.enforce_quote_status_transition() from public, anon, authenticated;

create index customers_organization_idx on costing.customers(organization_id, name);
create index rate_cards_active_idx on costing.rate_cards(organization_id, is_active, effective_from desc);
create index quotes_organization_status_idx on costing.quotes(organization_id, status, updated_at desc);
create index quotes_created_by_idx on costing.quotes(created_by, updated_at desc);
create index quote_versions_quote_idx on costing.quote_versions(quote_id, version_number desc);
create index quote_approvals_quote_idx on costing.quote_approvals(quote_id, decided_at desc);

create trigger customers_set_updated_at before update on costing.customers
for each row execute function iam_private.set_updated_at();
create trigger rate_cards_set_updated_at before update on costing.rate_cards
for each row execute function iam_private.set_updated_at();
create trigger quotes_set_updated_at before update on costing.quotes
for each row execute function iam_private.set_updated_at();
create trigger quotes_enforce_status before update of status on costing.quotes
for each row execute function costing_private.enforce_quote_status_transition();

alter table iam.applications enable row level security;
alter table iam.organizations enable row level security;
alter table iam.user_profiles enable row level security;
alter table iam.organization_memberships enable row level security;
alter table iam.roles enable row level security;
alter table iam.permissions enable row level security;
alter table iam.role_permissions enable row level security;
alter table iam.user_role_assignments enable row level security;
alter table costing.customers enable row level security;
alter table costing.rate_cards enable row level security;
alter table costing.quotes enable row level security;
alter table costing.quote_versions enable row level security;
alter table costing.quote_approvals enable row level security;

create policy applications_read on iam.applications for select to authenticated using (true);
create policy roles_read on iam.roles for select to authenticated using (true);
create policy permissions_read on iam.permissions for select to authenticated using (true);
create policy role_permissions_read on iam.role_permissions for select to authenticated using (true);

create policy organizations_member_read on iam.organizations for select to authenticated
using ((select iam_private.is_member(id)));
create policy organizations_admin_update on iam.organizations for update to authenticated
using ((select iam_private.authorized('costing', 'iam.manage', id)))
with check ((select iam_private.authorized('costing', 'iam.manage', id)));

create policy profiles_self_read on iam.user_profiles for select to authenticated
using ((select auth.uid()) = user_id);
create policy profiles_self_update on iam.user_profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy memberships_member_read on iam.organization_memberships for select to authenticated
using ((select iam_private.is_member(organization_id)));
create policy memberships_admin_insert on iam.organization_memberships for insert to authenticated
with check ((select iam_private.authorized('costing', 'iam.manage', organization_id)));
create policy memberships_admin_update on iam.organization_memberships for update to authenticated
using ((select iam_private.authorized('costing', 'iam.manage', organization_id)))
with check ((select iam_private.authorized('costing', 'iam.manage', organization_id)));
create policy memberships_admin_delete on iam.organization_memberships for delete to authenticated
using ((select iam_private.authorized('costing', 'iam.manage', organization_id)));

create policy assignments_member_read on iam.user_role_assignments for select to authenticated
using ((select iam_private.is_member(organization_id)));
create policy assignments_admin_insert on iam.user_role_assignments for insert to authenticated
with check (
  application_id = (select id from iam.applications where application_key = 'costing')
  and (select iam_private.authorized('costing', 'iam.manage', organization_id))
);
create policy assignments_admin_update on iam.user_role_assignments for update to authenticated
using (
  application_id = (select id from iam.applications where application_key = 'costing')
  and (select iam_private.authorized('costing', 'iam.manage', organization_id))
)
with check (
  application_id = (select id from iam.applications where application_key = 'costing')
  and (select iam_private.authorized('costing', 'iam.manage', organization_id))
);
create policy assignments_admin_delete on iam.user_role_assignments for delete to authenticated
using (
  application_id = (select id from iam.applications where application_key = 'costing')
  and (select iam_private.authorized('costing', 'iam.manage', organization_id))
);

create policy customers_member_read on costing.customers for select to authenticated
using ((select iam_private.is_member(organization_id)));
create policy customers_sales_insert on costing.customers for insert to authenticated
with check ((select iam_private.authorized('costing', 'quotes.create', organization_id)) and created_by = (select auth.uid()));
create policy customers_sales_update on costing.customers for update to authenticated
using (created_by = (select auth.uid()) or (select iam_private.authorized('costing', 'quotes.update_all', organization_id)))
with check ((select iam_private.is_member(organization_id)));

create policy rate_cards_member_read on costing.rate_cards for select to authenticated
using ((select iam_private.is_member(organization_id)));
create policy rate_cards_manager_insert on costing.rate_cards for insert to authenticated
with check ((select iam_private.authorized('costing', 'rates.manage', organization_id)) and created_by = (select auth.uid()));
create policy rate_cards_manager_update on costing.rate_cards for update to authenticated
using ((select iam_private.authorized('costing', 'rates.manage', organization_id)))
with check ((select iam_private.authorized('costing', 'rates.manage', organization_id)));
create policy rate_cards_manager_delete on costing.rate_cards for delete to authenticated
using ((select iam_private.authorized('costing', 'rates.manage', organization_id)));

create policy quotes_read on costing.quotes for select to authenticated
using (created_by = (select auth.uid()) or (select iam_private.authorized('costing', 'quotes.read_all', organization_id)));
create policy quotes_create on costing.quotes for insert to authenticated
with check ((select iam_private.authorized('costing', 'quotes.create', organization_id)) and created_by = (select auth.uid()));
create policy quotes_update on costing.quotes for update to authenticated
using (created_by = (select auth.uid()) or (select iam_private.authorized('costing', 'quotes.update_all', organization_id)))
with check ((select iam_private.is_member(organization_id)));

create policy quote_versions_read on costing.quote_versions for select to authenticated
using (exists (
  select 1 from costing.quotes quote
  where quote.id = quote_id
    and (quote.created_by = (select auth.uid()) or (select iam_private.authorized('costing', 'quotes.read_all', quote.organization_id)))
));
create policy quote_versions_insert on costing.quote_versions for insert to authenticated
with check (created_by = (select auth.uid()) and exists (
  select 1 from costing.quotes quote
  where quote.id = quote_id
    and (quote.created_by = (select auth.uid()) or (select iam_private.authorized('costing', 'quotes.update_all', quote.organization_id)))
));

create policy quote_approvals_read on costing.quote_approvals for select to authenticated
using (exists (
  select 1 from costing.quotes quote
  where quote.id = quote_id
    and (quote.created_by = (select auth.uid()) or (select iam_private.authorized('costing', 'quotes.read_all', quote.organization_id)))
));
create policy quote_approvals_insert on costing.quote_approvals for insert to authenticated
with check (decided_by = (select auth.uid()) and exists (
  select 1 from costing.quotes quote
  where quote.id = quote_id and (
    (approval_level = 'manager' and (select iam_private.authorized('costing', 'quotes.approve_manager', quote.organization_id)))
    or (approval_level = 'ceo' and (select iam_private.authorized('costing', 'quotes.approve_ceo', quote.organization_id)))
  )
));

grant select on iam.applications, iam.roles, iam.permissions, iam.role_permissions to authenticated;
grant select, update on iam.user_profiles to authenticated;
grant select, update on iam.organizations to authenticated;
grant select, insert, update, delete on iam.organization_memberships, iam.user_role_assignments to authenticated;
grant select, insert, update on costing.customers, costing.quotes to authenticated;
grant select, insert, update, delete on costing.rate_cards to authenticated;
grant select, insert on costing.quote_versions, costing.quote_approvals to authenticated;

create or replace function public.bootstrap_costing_organization(organization_name text, organization_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user uuid := (select auth.uid());
  new_organization_id uuid;
  costing_application_id uuid;
  admin_role_id uuid;
begin
  if requesting_user is null then
    raise exception 'Authentication required';
  end if;
  if nullif(trim(organization_name), '') is null or organization_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' then
    raise exception 'A valid organization name and lowercase slug are required';
  end if;
  if exists (select 1 from iam.organization_memberships where user_id = requesting_user) then
    raise exception 'User already belongs to an organization';
  end if;

  select id into costing_application_id from iam.applications where application_key = 'costing';
  select id into admin_role_id from iam.roles where application_id = costing_application_id and role_key = 'admin';

  insert into iam.organizations (name, slug)
  values (trim(organization_name), organization_slug)
  returning id into new_organization_id;

  insert into iam.organization_memberships (organization_id, user_id, status)
  values (new_organization_id, requesting_user, 'active');
  insert into iam.user_role_assignments (organization_id, application_id, user_id, role_id, granted_by)
  values (new_organization_id, costing_application_id, requesting_user, admin_role_id, requesting_user);
  update iam.user_profiles set default_organization_id = new_organization_id where user_id = requesting_user;

  return new_organization_id;
end;
$$;

revoke all on function public.bootstrap_costing_organization(text, text) from public, anon;
grant execute on function public.bootstrap_costing_organization(text, text) to authenticated;


-- >>> 20260715025400_shipment_visibility.sql >>>

-- Shipment Visibility — shares the Costing Platform Supabase project.
-- Depends on iam / iam_private from 20260714234747_initial_costing_platform.sql.

create schema if not exists visibility;

grant usage on schema visibility to authenticated, service_role;

create table visibility.shipments (
  id                text primary key,
  organization_id   uuid not null references iam.organizations(id) on delete cascade,
  reference         text not null,
  container_no      text,
  bl_no             text,
  booking_no        text,
  carrier           text not null,
  vessel            text,

  origin            jsonb not null,
  destination       jsonb not null,
  current_position  jsonb,
  route_path        jsonb not null default '[]'::jsonb,

  eta_original      date not null,
  eta_current       date not null,

  po                text,
  brand             text not null,
  skus              jsonb not null default '[]'::jsonb,
  retailer          text,
  retailer_deadline date,
  landed_cost_aud   numeric,
  fob_value_usd     numeric,

  agent             text,
  liner             text,
  voyage            text,
  sales_reps        jsonb not null default '[]'::jsonb,
  etd_status        text,
  source            text not null default 'manual',

  milestones        jsonb not null default '[]'::jsonb,

  updated_at        timestamptz not null default now()
);

create index if not exists shipments_organization_idx
  on visibility.shipments (organization_id);
create index if not exists shipments_eta_current_idx
  on visibility.shipments (organization_id, eta_current);
create index if not exists shipments_retailer_idx
  on visibility.shipments (organization_id, retailer);
create index if not exists shipments_brand_idx
  on visibility.shipments (organization_id, brand);
create index if not exists shipments_sales_reps_idx
  on visibility.shipments using gin (sales_reps);
create index if not exists shipments_container_idx
  on visibility.shipments (organization_id, container_no);

create trigger shipments_set_updated_at
before update on visibility.shipments
for each row execute function iam_private.set_updated_at();

-- IAM: register Control Tower as a second application on the shared project.
insert into iam.applications (application_key, name, description)
values (
  'visibility',
  'Shipment Visibility',
  'Factory-to-retailer shipment tracking and commercial-risk surfacing'
)
on conflict (application_key) do nothing;

insert into iam.permissions (application_id, permission_key, description)
select app.id, seeded.permission_key, seeded.description
from iam.applications app
cross join (values
  ('shipments.read', 'View shipments, containers and SKU tracking'),
  ('shipments.write', 'Import reports and edit live shipment status'),
  ('shipments.manage', 'Administer visibility roles and settings'),
  ('iam.manage', 'Manage users and roles for this application')
) as seeded(permission_key, description)
where app.application_key = 'visibility'
on conflict (application_id, permission_key) do nothing;

insert into iam.roles (application_id, role_key, name, description, is_system)
select app.id, seeded.role_key, seeded.name, seeded.description, true
from iam.applications app
cross join (values
  ('viewer', 'Viewer', 'Sales and ops read-only access'),
  ('logistics', 'Logistics', 'Import daily reports and edit shipment status'),
  ('admin', 'Administrator', 'Full shipment visibility administration')
) as seeded(role_key, name, description)
where app.application_key = 'visibility'
on conflict (application_id, role_key) do nothing;

insert into iam.role_permissions (role_id, permission_id, application_id)
select role.id, permission.id, application.id
from iam.applications application
join iam.roles role on role.application_id = application.id
join iam.permissions permission on permission.application_id = application.id
where application.application_key = 'visibility'
  and (
    (role.role_key = 'viewer' and permission.permission_key = 'shipments.read')
    or (role.role_key = 'logistics' and permission.permission_key in (
      'shipments.read', 'shipments.write'
    ))
    or role.role_key = 'admin'
  )
on conflict do nothing;

-- Allow visibility admins to manage role assignments for this application only.
create policy assignments_visibility_admin_insert on iam.user_role_assignments
for insert to authenticated
with check (
  application_id = (select id from iam.applications where application_key = 'visibility')
  and (select iam_private.authorized('visibility', 'iam.manage', organization_id))
);

create policy assignments_visibility_admin_update on iam.user_role_assignments
for update to authenticated
using (
  application_id = (select id from iam.applications where application_key = 'visibility')
  and (select iam_private.authorized('visibility', 'iam.manage', organization_id))
)
with check (
  application_id = (select id from iam.applications where application_key = 'visibility')
  and (select iam_private.authorized('visibility', 'iam.manage', organization_id))
);

create policy assignments_visibility_admin_delete on iam.user_role_assignments
for delete to authenticated
using (
  application_id = (select id from iam.applications where application_key = 'visibility')
  and (select iam_private.authorized('visibility', 'iam.manage', organization_id))
);

alter table visibility.shipments enable row level security;

create policy shipments_read on visibility.shipments
for select to authenticated
using ((select iam_private.authorized('visibility', 'shipments.read', organization_id)));

create policy shipments_write_insert on visibility.shipments
for insert to authenticated
with check ((select iam_private.authorized('visibility', 'shipments.write', organization_id)));

create policy shipments_write_update on visibility.shipments
for update to authenticated
using ((select iam_private.authorized('visibility', 'shipments.write', organization_id)))
with check ((select iam_private.authorized('visibility', 'shipments.write', organization_id)));

create policy shipments_write_delete on visibility.shipments
for delete to authenticated
using ((select iam_private.authorized('visibility', 'shipments.manage', organization_id)));

grant select, insert, update, delete on visibility.shipments to authenticated;
grant select, insert, update, delete on visibility.shipments to service_role;

-- First-org bootstrap also grants Control Tower admin so one /setup covers both apps.
create or replace function public.bootstrap_costing_organization(organization_name text, organization_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user uuid := (select auth.uid());
  new_organization_id uuid;
  costing_application_id uuid;
  visibility_application_id uuid;
  costing_admin_role_id uuid;
  visibility_admin_role_id uuid;
begin
  if requesting_user is null then
    raise exception 'Authentication required';
  end if;
  if nullif(trim(organization_name), '') is null or organization_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' then
    raise exception 'A valid organization name and lowercase slug are required';
  end if;
  if exists (select 1 from iam.organization_memberships where user_id = requesting_user) then
    raise exception 'User already belongs to an organization';
  end if;

  select id into costing_application_id from iam.applications where application_key = 'costing';
  select id into visibility_application_id from iam.applications where application_key = 'visibility';
  select id into costing_admin_role_id
  from iam.roles
  where application_id = costing_application_id and role_key = 'admin';
  select id into visibility_admin_role_id
  from iam.roles
  where application_id = visibility_application_id and role_key = 'admin';

  insert into iam.organizations (name, slug)
  values (trim(organization_name), organization_slug)
  returning id into new_organization_id;

  insert into iam.organization_memberships (organization_id, user_id, status)
  values (new_organization_id, requesting_user, 'active');

  insert into iam.user_role_assignments (organization_id, application_id, user_id, role_id, granted_by)
  values
    (new_organization_id, costing_application_id, requesting_user, costing_admin_role_id, requesting_user),
    (new_organization_id, visibility_application_id, requesting_user, visibility_admin_role_id, requesting_user);

  update iam.user_profiles
  set default_organization_id = new_organization_id
  where user_id = requesting_user;

  return new_organization_id;
end;
$$;

revoke all on function public.bootstrap_costing_organization(text, text) from public, anon;
grant execute on function public.bootstrap_costing_organization(text, text) to authenticated;


-- >>> 20260716010000_costing_admin_directory_and_reject.sql >>>

-- Costing: admin member directory + reject-to-draft workflow
--
-- 1. A security-definer RPC that lets a Costing administrator (iam.manage) read
--    the names and emails of members in their organisation. Row-level security
--    only exposes a user's own profile to the browser, so this function is the
--    controlled way to surface a member directory to admins.
-- 2. Extend the quote status trigger so a manager/CEO (or the owner) can send a
--    quote in review or manager-approved back to draft — i.e. "request changes".

create or replace function public.costing_member_directory(target_organization_id uuid)
returns table (user_id uuid, email text, display_name text, status text)
language sql
security definer
set search_path = ''
as $$
  select m.user_id, u.email::text, p.display_name, m.status
  from iam.organization_memberships m
  join auth.users u on u.id = m.user_id
  left join iam.user_profiles p on p.user_id = m.user_id
  where m.organization_id = target_organization_id
    and (select iam_private.authorized('costing', 'iam.manage', target_organization_id));
$$;

revoke all on function public.costing_member_directory(uuid) from public, anon;
grant execute on function public.costing_member_directory(uuid) to authenticated;

create or replace function costing_private.enforce_quote_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status = 'draft'
    and new.status = 'ready_for_review'
    and old.created_by = (select auth.uid()) then
    return new;
  end if;

  if new.status = 'manager_approved'
    and old.status = 'ready_for_review'
    and (select iam_private.authorized('costing', 'quotes.approve_manager', old.organization_id)) then
    return new;
  end if;

  if new.status = 'ceo_approved'
    and old.status = 'manager_approved'
    and (select iam_private.authorized('costing', 'quotes.approve_ceo', old.organization_id)) then
    return new;
  end if;

  if new.status = 'ready_for_export'
    and old.status = 'ceo_approved'
    and (select iam_private.authorized('costing', 'quotes.approve_ceo', old.organization_id)) then
    return new;
  end if;

  -- Rejection / withdrawal: send an in-review or manager-approved quote back to
  -- draft so the owner can revise and resubmit.
  if new.status = 'draft'
    and old.status in ('ready_for_review', 'manager_approved')
    and (
      old.created_by = (select auth.uid())
      or (select iam_private.authorized('costing', 'quotes.approve_manager', old.organization_id))
      or (select iam_private.authorized('costing', 'quotes.approve_ceo', old.organization_id))
    ) then
    return new;
  end if;

  raise exception 'Quote status transition from % to % is not permitted', old.status, new.status;
end;
$$;

revoke all on function costing_private.enforce_quote_status_transition() from public, anon, authenticated;


-- >>> 20260716020000_contacts_and_product_images.sql >>>

-- Costing: contacts address book, per-SKU product images, and image storage
--
-- Adds a unified contacts table (supplier / customer / representative), links
-- customers and quotes to contacts, a per-organisation + per-SKU product image
-- registry, and a private Supabase Storage bucket with org-scoped policies.

-- ---- Contacts ---------------------------------------------------------------
create table costing.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id) on delete cascade,
  contact_type text not null check (contact_type in ('supplier', 'customer', 'representative')),
  company_name text,
  person_name text,
  email text,
  phone text,
  job_title text,
  address text,
  notes text,
  is_default boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (company_name is not null or person_name is not null)
);
create index contacts_org_type_idx on costing.contacts(organization_id, contact_type, company_name);

alter table costing.customers
  add column contact_id uuid references costing.contacts(id) on delete set null;

alter table costing.quotes
  add column customer_contact_id uuid references costing.contacts(id) on delete set null,
  add column representative_contact_id uuid references costing.contacts(id) on delete set null;

-- ---- Product images (keyed by organisation + SKU) ---------------------------
create table costing.product_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id) on delete cascade,
  sku text not null,
  storage_path text not null,
  is_primary boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, storage_path)
);
create index product_images_sku_idx on costing.product_images(organization_id, sku, is_primary desc);

create trigger contacts_set_updated_at before update on costing.contacts
for each row execute function iam_private.set_updated_at();

-- ---- Row-level security -----------------------------------------------------
alter table costing.contacts enable row level security;
alter table costing.product_images enable row level security;

create policy contacts_member_read on costing.contacts for select to authenticated
  using ((select iam_private.is_member(organization_id)));
create policy contacts_sales_insert on costing.contacts for insert to authenticated
  with check ((select iam_private.authorized('costing', 'quotes.create', organization_id)) and created_by = (select auth.uid()));
create policy contacts_sales_update on costing.contacts for update to authenticated
  using ((select iam_private.authorized('costing', 'quotes.create', organization_id)))
  with check ((select iam_private.authorized('costing', 'quotes.create', organization_id)));
create policy contacts_sales_delete on costing.contacts for delete to authenticated
  using ((select iam_private.authorized('costing', 'quotes.create', organization_id)));

create policy product_images_member_read on costing.product_images for select to authenticated
  using ((select iam_private.is_member(organization_id)));
create policy product_images_sales_insert on costing.product_images for insert to authenticated
  with check ((select iam_private.authorized('costing', 'quotes.create', organization_id)) and created_by = (select auth.uid()));
create policy product_images_sales_update on costing.product_images for update to authenticated
  using ((select iam_private.authorized('costing', 'quotes.create', organization_id)))
  with check ((select iam_private.authorized('costing', 'quotes.create', organization_id)));
create policy product_images_sales_delete on costing.product_images for delete to authenticated
  using ((select iam_private.authorized('costing', 'quotes.create', organization_id)));

grant select, insert, update, delete on costing.contacts to authenticated;
grant select, insert, update, delete on costing.product_images to authenticated;

-- ---- Storage bucket + policies ---------------------------------------------
-- Objects are stored under `<organization_id>/<sku>/<filename>` so the first
-- path segment scopes access to the owning organisation.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', false)
on conflict (id) do nothing;

create policy "Product images readable by org members"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'product-images'
    and (select iam_private.is_member(((storage.foldername(name))[1])::uuid))
  );

create policy "Product images writable by sales"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and (select iam_private.authorized('costing', 'quotes.create', ((storage.foldername(name))[1])::uuid))
  );

create policy "Product images deletable by sales"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-images'
    and (select iam_private.authorized('costing', 'quotes.create', ((storage.foldername(name))[1])::uuid))
  );


-- >>> 20260716030000_rate_layers_and_salespeople.sql >>>

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


-- >>> 20260721000000_teams_and_finance_role.sql >>>

-- Teams, GM/finance roles, team-scoped quote access, and approval transition updates.

-- ---------------------------------------------------------------------------
-- Teams
-- ---------------------------------------------------------------------------
create table if not exists costing.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id) on delete cascade,
  name text not null,
  sales_rep_label text,
  leader_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists costing.team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references costing.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_leader boolean not null default false,
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

alter table costing.customers
  add column if not exists team_id uuid references costing.teams(id) on delete set null;

alter table costing.quotes
  add column if not exists team_id uuid references costing.teams(id) on delete set null;

create index if not exists teams_organization_idx on costing.teams(organization_id, name);
create index if not exists team_memberships_user_idx on costing.team_memberships(user_id);
create index if not exists customers_team_idx on costing.customers(team_id);
create index if not exists quotes_team_idx on costing.quotes(team_id);

create trigger teams_set_updated_at before update on costing.teams
for each row execute function iam_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- IAM: permissions + roles
-- ---------------------------------------------------------------------------
insert into iam.permissions (application_id, permission_key, description)
select app.id, seeded.permission_key, seeded.description
from iam.applications app
cross join (values
  ('quotes.submit_review', 'Submit team quotes to the General Manager'),
  ('quotes.approve_gm', 'General Manager review — send to CEO or reject'),
  ('quotes.finance_export', 'Finance access to approved quotes and PO export')
) as seeded(permission_key, description)
where app.application_key = 'costing'
  and not exists (
    select 1 from iam.permissions p
    where p.application_id = app.id and p.permission_key = seeded.permission_key
  );

insert into iam.roles (application_id, role_key, name, description, is_system)
select app.id, seeded.role_key, seeded.name, seeded.description, true
from iam.applications app
cross join (values
  ('general_manager', 'General Manager', 'Organisation-wide review before CEO'),
  ('finance', 'Finance', 'Convert CEO-approved quotes to purchase orders')
) as seeded(role_key, name, description)
where app.application_key = 'costing'
  and not exists (
    select 1 from iam.roles r
    where r.application_id = app.id and r.role_key = seeded.role_key
  );

update iam.roles
set name = 'Team Leader',
    description = 'Lead a sales team and submit quotes to the General Manager'
where application_id = (select id from iam.applications where application_key = 'costing')
  and role_key = 'manager';

update iam.roles
set name = 'Team Member',
    description = 'Create and manage team quotes for assigned customers'
where application_id = (select id from iam.applications where application_key = 'costing')
  and role_key = 'sales';

-- Reset manager (Team Leader) permissions: create + submit, not org-wide approve.
delete from iam.role_permissions rp
using iam.roles role, iam.applications app
where rp.role_id = role.id
  and role.application_id = app.id
  and app.application_key = 'costing'
  and role.role_key = 'manager';

insert into iam.role_permissions (role_id, permission_id, application_id)
select role.id, permission.id, app.id
from iam.applications app
join iam.roles role on role.application_id = app.id
join iam.permissions permission on permission.application_id = app.id
where app.application_key = 'costing'
  and role.role_key = 'manager'
  and permission.permission_key in ('quotes.create', 'quotes.submit_review');

insert into iam.role_permissions (role_id, permission_id, application_id)
select role.id, permission.id, app.id
from iam.applications app
join iam.roles role on role.application_id = app.id
join iam.permissions permission on permission.application_id = app.id
where app.application_key = 'costing'
  and role.role_key = 'general_manager'
  and permission.permission_key in (
    'quotes.create', 'quotes.read_all', 'quotes.update_all', 'quotes.approve_gm', 'quotes.approve_manager', 'rates.manage'
  )
  and not exists (
    select 1 from iam.role_permissions existing
    where existing.role_id = role.id and existing.permission_id = permission.id
  );

insert into iam.role_permissions (role_id, permission_id, application_id)
select role.id, permission.id, app.id
from iam.applications app
join iam.roles role on role.application_id = app.id
join iam.permissions permission on permission.application_id = app.id
where app.application_key = 'costing'
  and role.role_key = 'finance'
  and permission.permission_key in ('quotes.finance_export', 'rates.manage')
  and not exists (
    select 1 from iam.role_permissions existing
    where existing.role_id = role.id and existing.permission_id = permission.id
  );

insert into iam.role_permissions (role_id, permission_id, application_id)
select role.id, permission.id, app.id
from iam.applications app
join iam.roles role on role.application_id = app.id
join iam.permissions permission on permission.application_id = app.id
where app.application_key = 'costing'
  and role.role_key = 'ceo'
  and permission.permission_key in ('quotes.update_all')
  and not exists (
    select 1 from iam.role_permissions existing
    where existing.role_id = role.id and existing.permission_id = permission.id
  );

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function costing_private.user_team_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tm.team_id
  from costing.team_memberships tm
  where tm.user_id = (select auth.uid());
$$;

create or replace function costing_private.is_team_leader(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from costing.team_memberships tm
    where tm.team_id = target_team_id
      and tm.user_id = (select auth.uid())
      and tm.is_leader = true
  )
  or exists (
    select 1
    from costing.teams t
    where t.id = target_team_id
      and t.leader_user_id = (select auth.uid())
  );
$$;

create or replace function costing_private.can_read_quote(
  quote_org uuid,
  quote_team uuid,
  quote_status text,
  quote_owner uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select iam_private.is_member(quote_org))
    and (
      (select iam_private.authorized('costing', 'quotes.read_all', quote_org))
      or (
        (select iam_private.authorized('costing', 'quotes.finance_export', quote_org))
        and quote_status in ('ceo_approved', 'ready_for_export')
      )
      or (quote_team is not null and quote_team in (select costing_private.user_team_ids()))
      or quote_owner = (select auth.uid())
    );
$$;

revoke all on function costing_private.user_team_ids() from public, anon;
revoke all on function costing_private.is_team_leader(uuid) from public, anon;
revoke all on function costing_private.can_read_quote(uuid, uuid, text, uuid) from public, anon;
grant execute on function costing_private.user_team_ids() to authenticated;
grant execute on function costing_private.is_team_leader(uuid) to authenticated;
grant execute on function costing_private.can_read_quote(uuid, uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Status transitions
-- ---------------------------------------------------------------------------
create or replace function costing_private.enforce_quote_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  -- Team Leader (or admin) submits to GM.
  if old.status = 'draft'
    and new.status = 'ready_for_review'
    and (
      (select iam_private.authorized('costing', 'quotes.submit_review', old.organization_id))
      or (select iam_private.authorized('costing', 'iam.manage', old.organization_id))
      or (old.team_id is not null and (select costing_private.is_team_leader(old.team_id)))
    ) then
    return new;
  end if;

  -- GM sends to CEO (approve_gm or legacy approve_manager).
  if new.status = 'manager_approved'
    and old.status = 'ready_for_review'
    and (
      (select iam_private.authorized('costing', 'quotes.approve_gm', old.organization_id))
      or (select iam_private.authorized('costing', 'quotes.approve_manager', old.organization_id))
      or (select iam_private.authorized('costing', 'iam.manage', old.organization_id))
    ) then
    return new;
  end if;

  if new.status = 'ceo_approved'
    and old.status = 'manager_approved'
    and (
      (select iam_private.authorized('costing', 'quotes.approve_ceo', old.organization_id))
      or (select iam_private.authorized('costing', 'iam.manage', old.organization_id))
    ) then
    return new;
  end if;

  -- Finance marks ready for PO / export.
  if new.status = 'ready_for_export'
    and old.status = 'ceo_approved'
    and (
      (select iam_private.authorized('costing', 'quotes.finance_export', old.organization_id))
      or (select iam_private.authorized('costing', 'quotes.approve_ceo', old.organization_id))
      or (select iam_private.authorized('costing', 'iam.manage', old.organization_id))
    ) then
    return new;
  end if;

  -- Rejection / request changes back to draft.
  if new.status = 'draft'
    and old.status in ('ready_for_review', 'manager_approved')
    and (
      old.created_by = (select auth.uid())
      or (select iam_private.authorized('costing', 'quotes.approve_gm', old.organization_id))
      or (select iam_private.authorized('costing', 'quotes.approve_manager', old.organization_id))
      or (select iam_private.authorized('costing', 'quotes.approve_ceo', old.organization_id))
      or (select iam_private.authorized('costing', 'iam.manage', old.organization_id))
    ) then
    return new;
  end if;

  raise exception 'Quote status transition from % to % is not permitted', old.status, new.status;
end;
$$;

revoke all on function costing_private.enforce_quote_status_transition() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table costing.teams enable row level security;
alter table costing.team_memberships enable row level security;

drop policy if exists teams_member_read on costing.teams;
create policy teams_member_read on costing.teams for select to authenticated
using ((select iam_private.is_member(organization_id)));

drop policy if exists teams_admin_write on costing.teams;
create policy teams_admin_insert on costing.teams for insert to authenticated
with check ((select iam_private.authorized('costing', 'iam.manage', organization_id)));
create policy teams_admin_update on costing.teams for update to authenticated
using ((select iam_private.authorized('costing', 'iam.manage', organization_id)))
with check ((select iam_private.authorized('costing', 'iam.manage', organization_id)));
create policy teams_admin_delete on costing.teams for delete to authenticated
using ((select iam_private.authorized('costing', 'iam.manage', organization_id)));

drop policy if exists team_memberships_member_read on costing.team_memberships;
create policy team_memberships_member_read on costing.team_memberships for select to authenticated
using (exists (
  select 1 from costing.teams t
  where t.id = team_id and (select iam_private.is_member(t.organization_id))
));

create policy team_memberships_admin_insert on costing.team_memberships for insert to authenticated
with check (exists (
  select 1 from costing.teams t
  where t.id = team_id and (select iam_private.authorized('costing', 'iam.manage', t.organization_id))
));
create policy team_memberships_admin_update on costing.team_memberships for update to authenticated
using (exists (
  select 1 from costing.teams t
  where t.id = team_id and (select iam_private.authorized('costing', 'iam.manage', t.organization_id))
))
with check (exists (
  select 1 from costing.teams t
  where t.id = team_id and (select iam_private.authorized('costing', 'iam.manage', t.organization_id))
));
create policy team_memberships_admin_delete on costing.team_memberships for delete to authenticated
using (exists (
  select 1 from costing.teams t
  where t.id = team_id and (select iam_private.authorized('costing', 'iam.manage', t.organization_id))
));

drop policy if exists customers_member_read on costing.customers;
create policy customers_member_read on costing.customers for select to authenticated
using (
  (select iam_private.is_member(organization_id))
  and (
    (select iam_private.authorized('costing', 'quotes.read_all', organization_id))
    or (select iam_private.authorized('costing', 'iam.manage', organization_id))
    or (select iam_private.authorized('costing', 'quotes.finance_export', organization_id))
    or team_id is null
    or team_id in (select costing_private.user_team_ids())
    or created_by = (select auth.uid())
  )
);

drop policy if exists quotes_read on costing.quotes;
create policy quotes_read on costing.quotes for select to authenticated
using (
  (select costing_private.can_read_quote(organization_id, team_id, status, created_by))
);

drop policy if exists quote_versions_read on costing.quote_versions;
create policy quote_versions_read on costing.quote_versions for select to authenticated
using (exists (
  select 1 from costing.quotes quote
  where quote.id = quote_id
    and (select costing_private.can_read_quote(quote.organization_id, quote.team_id, quote.status, quote.created_by))
));

drop policy if exists quote_approvals_read on costing.quote_approvals;
create policy quote_approvals_read on costing.quote_approvals for select to authenticated
using (exists (
  select 1 from costing.quotes quote
  where quote.id = quote_id
    and (select costing_private.can_read_quote(quote.organization_id, quote.team_id, quote.status, quote.created_by))
));

-- Allow GM approval inserts via approve_gm as well as legacy approve_manager.
drop policy if exists quote_approvals_insert on costing.quote_approvals;
create policy quote_approvals_insert on costing.quote_approvals for insert to authenticated
with check (exists (
  select 1 from costing.quotes quote
  where quote.id = quote_id
    and (
      (approval_level = 'manager' and (
        (select iam_private.authorized('costing', 'quotes.approve_gm', quote.organization_id))
        or (select iam_private.authorized('costing', 'quotes.approve_manager', quote.organization_id))
        or (select iam_private.authorized('costing', 'iam.manage', quote.organization_id))
      ))
      or (approval_level = 'ceo' and (
        (select iam_private.authorized('costing', 'quotes.approve_ceo', quote.organization_id))
        or (select iam_private.authorized('costing', 'iam.manage', quote.organization_id))
      ))
    )
));


-- >>> 20260723000000_customer_rate_cards_and_basis.sql >>>

-- Associate rate cards with customers; add costing basis on rate cards.

-- ---------------------------------------------------------------------------
-- Rate card: default costing basis (FOB / FIW)
-- ---------------------------------------------------------------------------
alter table costing.rate_cards
  add column if not exists costing_basis text not null default 'FIW';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rate_cards_costing_basis_check'
      and conrelid = 'costing.rate_cards'::regclass
  ) then
    alter table costing.rate_cards
      add constraint rate_cards_costing_basis_check
      check (costing_basis in ('FOB', 'FIW'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Customer ↔ rate card associations
-- ---------------------------------------------------------------------------
create table if not exists costing.customer_rate_cards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id) on delete cascade,
  customer_id uuid not null references costing.customers(id) on delete cascade,
  rate_card_id uuid not null references costing.rate_cards(id) on delete cascade,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (customer_id, rate_card_id)
);

create index if not exists customer_rate_cards_customer_idx
  on costing.customer_rate_cards(customer_id);
create index if not exists customer_rate_cards_rate_card_idx
  on costing.customer_rate_cards(rate_card_id);
create index if not exists customer_rate_cards_org_idx
  on costing.customer_rate_cards(organization_id);

-- At most one default rate card per customer.
create unique index if not exists customer_rate_cards_one_default_idx
  on costing.customer_rate_cards(customer_id)
  where is_default;

alter table costing.customer_rate_cards enable row level security;

drop policy if exists customer_rate_cards_member_read on costing.customer_rate_cards;
create policy customer_rate_cards_member_read on costing.customer_rate_cards
  for select to authenticated
  using ((select iam_private.is_member(organization_id)));

drop policy if exists customer_rate_cards_member_write on costing.customer_rate_cards;
create policy customer_rate_cards_member_write on costing.customer_rate_cards
  for all to authenticated
  using (
    (select iam_private.authorized('costing', 'quotes.create', organization_id))
    or (select iam_private.authorized('costing', 'rates.manage', organization_id))
  )
  with check (
    (select iam_private.authorized('costing', 'quotes.create', organization_id))
    or (select iam_private.authorized('costing', 'rates.manage', organization_id))
  );

grant select, insert, update, delete on costing.customer_rate_cards to authenticated;


-- >>> 20260723010000_teams_grants.sql >>>

-- Teams tables had RLS policies but no grants for authenticated (permission denied on insert).

grant select, insert, update, delete on costing.teams to authenticated;
grant select, insert, update, delete on costing.team_memberships to authenticated;


-- >>> 20260723020000_membership_email_address.sql >>>

-- Store member email on organization_memberships (invite / directory convenience).

alter table iam.organization_memberships
  add column if not exists email_address text;

comment on column iam.organization_memberships.email_address is
  'Email for this membership (copied from auth.users on create; may be set for invites before user exists).';

-- Backfill from auth.users where available.
update iam.organization_memberships m
set email_address = u.email
from auth.users u
where u.id = m.user_id
  and (m.email_address is null or btrim(m.email_address) = '');

create index if not exists organization_memberships_email_idx
  on iam.organization_memberships (lower(email_address))
  where email_address is not null;

-- Refresh org bootstrap so new memberships store email_address.
-- Keeps dual-app admin grants (costing + visibility) from the visibility migration.
create or replace function public.bootstrap_costing_organization(organization_name text, organization_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requesting_user uuid := (select auth.uid());
  requesting_email text;
  new_organization_id uuid;
  costing_application_id uuid;
  visibility_application_id uuid;
  costing_admin_role_id uuid;
  visibility_admin_role_id uuid;
begin
  if requesting_user is null then
    raise exception 'Authentication required';
  end if;
  if nullif(trim(organization_name), '') is null or organization_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' then
    raise exception 'A valid organization name and lowercase slug are required';
  end if;
  if exists (select 1 from iam.organization_memberships where user_id = requesting_user) then
    raise exception 'User already belongs to an organization';
  end if;

  select email into requesting_email from auth.users where id = requesting_user;

  select id into costing_application_id from iam.applications where application_key = 'costing';
  select id into visibility_application_id from iam.applications where application_key = 'visibility';
  select id into costing_admin_role_id
  from iam.roles
  where application_id = costing_application_id and role_key = 'admin';
  select id into visibility_admin_role_id
  from iam.roles
  where application_id = visibility_application_id and role_key = 'admin';

  insert into iam.organizations (name, slug)
  values (trim(organization_name), organization_slug)
  returning id into new_organization_id;

  insert into iam.organization_memberships (organization_id, user_id, status, email_address)
  values (new_organization_id, requesting_user, 'active', requesting_email);

  insert into iam.user_role_assignments (organization_id, application_id, user_id, role_id, granted_by)
  values
    (new_organization_id, costing_application_id, requesting_user, costing_admin_role_id, requesting_user),
    (new_organization_id, visibility_application_id, requesting_user, visibility_admin_role_id, requesting_user);

  update iam.user_profiles
  set default_organization_id = new_organization_id
  where user_id = requesting_user;

  return new_organization_id;
end;
$$;

revoke all on function public.bootstrap_costing_organization(text, text) from public, anon;
grant execute on function public.bootstrap_costing_organization(text, text) to authenticated;


-- >>> 20260724000000_sourcing_catalog.sql >>>

-- Sourcing toolkit (Stage 01) — catalog uploads + standalone shortlists
-- Run on the canonical shared project https://jhhorikmpftvzlawcuty.supabase.co
-- then: notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Internal supplier / product catalogue (spreadsheet uploads)
-- relationship: preferred = buy history / past quotes; prospect = no PO yet
-- ---------------------------------------------------------------------------
create table if not exists public.sourcing_catalog_suppliers (
  id uuid primary key default gen_random_uuid()
);

alter table public.sourcing_catalog_suppliers add column if not exists name text;
alter table public.sourcing_catalog_suppliers add column if not exists relationship text;
alter table public.sourcing_catalog_suppliers add column if not exists country text;
alter table public.sourcing_catalog_suppliers add column if not exists contact_name text;
alter table public.sourcing_catalog_suppliers add column if not exists contact_email text;
alter table public.sourcing_catalog_suppliers add column if not exists contact_phone text;
alter table public.sourcing_catalog_suppliers add column if not exists notes text;
alter table public.sourcing_catalog_suppliers add column if not exists source_file text;
alter table public.sourcing_catalog_suppliers add column if not exists created_at timestamptz;
alter table public.sourcing_catalog_suppliers add column if not exists updated_at timestamptz;

update public.sourcing_catalog_suppliers set created_at = now() where created_at is null;
update public.sourcing_catalog_suppliers set updated_at = now() where updated_at is null;
alter table public.sourcing_catalog_suppliers alter column created_at set default now();
alter table public.sourcing_catalog_suppliers alter column updated_at set default now();

do $$
begin
  alter table public.sourcing_catalog_suppliers
    drop constraint if exists sourcing_catalog_suppliers_relationship_check;
  alter table public.sourcing_catalog_suppliers
    add constraint sourcing_catalog_suppliers_relationship_check
    check (relationship in ('preferred', 'prospect'));
exception when others then null;
end $$;

create unique index if not exists sourcing_catalog_suppliers_name_rel_uidx
  on public.sourcing_catalog_suppliers (lower(name), relationship);

create table if not exists public.sourcing_catalog_products (
  id uuid primary key default gen_random_uuid()
);

alter table public.sourcing_catalog_products add column if not exists supplier_id uuid;
alter table public.sourcing_catalog_products add column if not exists sku text;
alter table public.sourcing_catalog_products add column if not exists product_name text;
alter table public.sourcing_catalog_products add column if not exists category text;
alter table public.sourcing_catalog_products add column if not exists fob_price numeric;
alter table public.sourcing_catalog_products add column if not exists currency text;
alter table public.sourcing_catalog_products add column if not exists moq numeric;
alter table public.sourcing_catalog_products add column if not exists moq_unit text;
alter table public.sourcing_catalog_products add column if not exists lead_time_days integer;
alter table public.sourcing_catalog_products add column if not exists last_order_date date;
alter table public.sourcing_catalog_products add column if not exists quote_ref text;
alter table public.sourcing_catalog_products add column if not exists notes text;
alter table public.sourcing_catalog_products add column if not exists agl text;
alter table public.sourcing_catalog_products add column if not exists agl_key text;
alter table public.sourcing_catalog_products add column if not exists model text;
alter table public.sourcing_catalog_products add column if not exists brand text;
alter table public.sourcing_catalog_products add column if not exists retailer text;
alter table public.sourcing_catalog_products add column if not exists retailer_id text;
alter table public.sourcing_catalog_products add column if not exists sales_person text;
alter table public.sourcing_catalog_products add column if not exists order_type text;
alter table public.sourcing_catalog_products add column if not exists barcode text;
alter table public.sourcing_catalog_products add column if not exists outer_carton_barcode text;
alter table public.sourcing_catalog_products add column if not exists factory_name text;
alter table public.sourcing_catalog_products add column if not exists country text;
alter table public.sourcing_catalog_products add column if not exists po_number text;
alter table public.sourcing_catalog_products add column if not exists features jsonb;
alter table public.sourcing_catalog_products add column if not exists packaging_type text;
alter table public.sourcing_catalog_products add column if not exists packaging_material text;
alter table public.sourcing_catalog_products add column if not exists carton_qty numeric;
alter table public.sourcing_catalog_products add column if not exists unit_dims text;
alter table public.sourcing_catalog_products add column if not exists giftbox_dims text;
alter table public.sourcing_catalog_products add column if not exists unit_weight text;
alter table public.sourcing_catalog_products add column if not exists outer_carton_dims text;
alter table public.sourcing_catalog_products add column if not exists outer_carton_weight text;
alter table public.sourcing_catalog_products add column if not exists created_at timestamptz;
alter table public.sourcing_catalog_products add column if not exists updated_at timestamptz;

update public.sourcing_catalog_products set currency = 'USD' where currency is null;
update public.sourcing_catalog_products set created_at = now() where created_at is null;
update public.sourcing_catalog_products set updated_at = now() where updated_at is null;
alter table public.sourcing_catalog_products alter column currency set default 'USD';
alter table public.sourcing_catalog_products alter column created_at set default now();
alter table public.sourcing_catalog_products alter column updated_at set default now();

create index if not exists sourcing_catalog_products_supplier_idx
  on public.sourcing_catalog_products (supplier_id);
create index if not exists sourcing_catalog_products_name_trgm_idx
  on public.sourcing_catalog_products using gin (product_name gin_trgm_ops);
create unique index if not exists sourcing_catalog_products_agl_key_uidx
  on public.sourcing_catalog_products (agl_key)
  where agl_key is not null;

-- ---------------------------------------------------------------------------
-- Monday.com product catalogue mirror
-- Monday remains the source of truth. These tables preserve provenance and
-- normalize workflow-heavy boards into catalogue-friendly records.
-- ---------------------------------------------------------------------------
create table if not exists public.monday_catalog_sync_runs (
  id uuid primary key default gen_random_uuid(),
  dry_run boolean not null default false,
  status text not null default 'running',
  counts jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.monday_product_sources (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.sourcing_catalog_products(id) on delete cascade,
  board_id text not null,
  item_id text not null,
  source_kind text not null,
  group_id text,
  group_title text,
  item_name text,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  raw_columns jsonb not null default '{}'::jsonb,
  first_synced_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  unique (board_id, item_id),
  check (source_kind in ('artwork_active', 'artwork_completed'))
);

create index if not exists monday_product_sources_product_idx
  on public.monday_product_sources (product_id);

create table if not exists public.monday_artwork_workflows (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.sourcing_catalog_products(id) on delete cascade,
  source_id uuid not null references public.monday_product_sources(id) on delete cascade,
  designer text,
  silkscreen_status text,
  packaging_status text,
  manuals_status text,
  pop_sticker_status text,
  rating_label_status text,
  energy_label_status text,
  outer_carton_status text,
  presentation_status text,
  product_server_status text,
  product_catalogue_status text,
  website_upload_status text,
  im_upload_status text,
  artwork_due date,
  frd date,
  inspection_status text,
  updated_at timestamptz not null default now(),
  unique (source_id)
);

create table if not exists public.monday_product_assets (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.sourcing_catalog_products(id) on delete cascade,
  social_post_id uuid,
  board_id text not null,
  item_id text not null,
  column_id text not null,
  column_title text,
  asset_id text not null,
  name text,
  file_extension text,
  file_size bigint,
  asset_url text,
  public_url text,
  source_updated_at timestamptz,
  last_synced_at timestamptz not null default now(),
  unique (board_id, item_id, column_id, asset_id)
);

create index if not exists monday_product_assets_product_idx
  on public.monday_product_assets (product_id);

create table if not exists public.monday_social_posts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.sourcing_catalog_products(id) on delete set null,
  board_id text not null,
  item_id text not null,
  group_id text,
  group_title text,
  name text,
  agl text,
  agl_key text,
  model text,
  brand text,
  sales_person text,
  country text,
  retailer text,
  retailer_weblink text,
  status text,
  priority text,
  designer text,
  due_date date,
  post_date date,
  content_type text,
  post_text text,
  description text,
  notes text,
  on_our_website text,
  our_weblink text,
  rrp numeric,
  sale_price numeric,
  boost_amount numeric,
  boost_days text,
  boosted_status text,
  raw_columns jsonb not null default '{}'::jsonb,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  last_synced_at timestamptz not null default now(),
  unique (board_id, item_id)
);

create index if not exists monday_social_posts_product_idx
  on public.monday_social_posts (product_id);
create index if not exists monday_social_posts_agl_key_idx
  on public.monday_social_posts (agl_key);

do $$
begin
  alter table public.monday_product_assets
    add constraint monday_product_assets_social_post_fk
    foreign key (social_post_id)
    references public.monday_social_posts(id)
    on delete cascade;
exception when duplicate_object then null;
end $$;

create table if not exists public.monday_catalog_sync_errors (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.monday_catalog_sync_runs(id) on delete cascade,
  board_id text,
  item_id text,
  code text not null,
  message text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists monday_catalog_sync_errors_run_idx
  on public.monday_catalog_sync_errors (run_id);

-- ---------------------------------------------------------------------------
-- Standalone shortlists (quote_ref is free text until costing-app wiring)
-- ---------------------------------------------------------------------------
create table if not exists public.sourcing_shortlists (
  id uuid primary key default gen_random_uuid()
);

alter table public.sourcing_shortlists add column if not exists name text;
alter table public.sourcing_shortlists add column if not exists quote_ref text;
alter table public.sourcing_shortlists add column if not exists notes text;
alter table public.sourcing_shortlists add column if not exists created_at timestamptz;
alter table public.sourcing_shortlists add column if not exists updated_at timestamptz;

update public.sourcing_shortlists set created_at = now() where created_at is null;
update public.sourcing_shortlists set updated_at = now() where updated_at is null;
alter table public.sourcing_shortlists alter column created_at set default now();
alter table public.sourcing_shortlists alter column updated_at set default now();

create table if not exists public.sourcing_shortlist_items (
  id uuid primary key default gen_random_uuid()
);

alter table public.sourcing_shortlist_items add column if not exists shortlist_id uuid;
alter table public.sourcing_shortlist_items add column if not exists source text;
alter table public.sourcing_shortlist_items add column if not exists catalog_product_id uuid;
alter table public.sourcing_shortlist_items add column if not exists alibaba_product_id text;
alter table public.sourcing_shortlist_items add column if not exists title text;
alter table public.sourcing_shortlist_items add column if not exists supplier_name text;
alter table public.sourcing_shortlist_items add column if not exists price_min numeric;
alter table public.sourcing_shortlist_items add column if not exists currency text;
alter table public.sourcing_shortlist_items add column if not exists listing_url text;
alter table public.sourcing_shortlist_items add column if not exists image_url text;
alter table public.sourcing_shortlist_items add column if not exists meta jsonb;
alter table public.sourcing_shortlist_items add column if not exists added_at timestamptz;

update public.sourcing_shortlist_items set currency = 'USD' where currency is null;
update public.sourcing_shortlist_items set added_at = now() where added_at is null;
alter table public.sourcing_shortlist_items alter column currency set default 'USD';
alter table public.sourcing_shortlist_items alter column added_at set default now();

do $$
begin
  alter table public.sourcing_shortlist_items
    drop constraint if exists sourcing_shortlist_items_source_check;
  alter table public.sourcing_shortlist_items
    add constraint sourcing_shortlist_items_source_check
    check (source in ('catalog', 'alibaba'));
exception when others then null;
end $$;

create index if not exists sourcing_shortlist_items_list_idx
  on public.sourcing_shortlist_items (shortlist_id);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant all on table
  public.sourcing_catalog_suppliers,
  public.sourcing_catalog_products,
  public.sourcing_shortlists,
  public.sourcing_shortlist_items
to anon, authenticated, service_role;

-- Monday raw payloads and file URLs stay server-only.
grant all on table
  public.monday_catalog_sync_runs,
  public.monday_product_sources,
  public.monday_artwork_workflows,
  public.monday_product_assets,
  public.monday_social_posts,
  public.monday_catalog_sync_errors
to service_role;

grant all on all sequences in schema public to anon, authenticated, service_role;

notify pgrst, 'reload schema';

