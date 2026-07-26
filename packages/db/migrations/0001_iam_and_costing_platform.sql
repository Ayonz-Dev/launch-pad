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
