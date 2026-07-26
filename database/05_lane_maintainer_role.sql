-- 05_lane_maintainer_role.sql — run on the live project to add the role that
-- owns shipping-lane maintenance. Idempotent; safe to run and re-run. This is
-- the consolidation of packages/db/migrations/20260726010000_lane_maintainer_role.sql.
--
-- Assign the resulting "Lane Maintainer" role (visibility application) to one
-- user in IAM. Holding it designates the person responsible for running the CLI:
--   npm run lanes:add-port -- --name "<PORT>" --lat <lat> --lng <lng> [--lane POL__POD]
--   npm run lanes:generate
-- The permission is informational (the CLI is run from the repo, not gated at
-- runtime); it exists so the responsibility is a named, assignable role.

insert into iam.permissions (application_id, permission_key, description)
select app.id, 'shipments.lanes', 'Maintain ports and shipping lane geometry'
from iam.applications app
where app.application_key = 'visibility'
on conflict (application_id, permission_key) do nothing;

insert into iam.roles (application_id, role_key, name, description, is_system)
select app.id, 'lane_maintainer', 'Lane Maintainer',
       'Add ports and regenerate the map shipping lanes', true
from iam.applications app
where app.application_key = 'visibility'
on conflict (application_id, role_key) do nothing;

insert into iam.role_permissions (role_id, permission_id, application_id)
select role.id, permission.id, application.id
from iam.applications application
join iam.roles role on role.application_id = application.id
join iam.permissions permission on permission.application_id = application.id
where application.application_key = 'visibility'
  and (
    (role.role_key = 'lane_maintainer'
      and permission.permission_key in ('shipments.read', 'shipments.lanes'))
    or (role.role_key = 'admin' and permission.permission_key = 'shipments.lanes')
  )
on conflict do nothing;

notify pgrst, 'reload schema';
