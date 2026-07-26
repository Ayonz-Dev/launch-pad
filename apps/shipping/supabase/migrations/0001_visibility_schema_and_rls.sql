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
