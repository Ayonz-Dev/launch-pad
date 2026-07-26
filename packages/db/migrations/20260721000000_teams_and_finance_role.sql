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
