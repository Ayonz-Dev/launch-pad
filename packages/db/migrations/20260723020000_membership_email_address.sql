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
