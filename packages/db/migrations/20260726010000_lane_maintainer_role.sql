-- Lane maintainer role — the person who owns shipping-lane maintenance (running
-- `npm run lanes:add-port` and `npm run lanes:generate` to add ports and redraw
-- the map's sea lanes). A dedicated permission and role in the visibility
-- application so it can be assigned to one specific user in IAM.
-- Depends on 20260715025400_shipment_visibility.sql. Idempotent.

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

-- Lane maintainer can read shipments and maintain lanes.
insert into iam.role_permissions (role_id, permission_id, application_id)
select role.id, permission.id, application.id
from iam.applications application
join iam.roles role on role.application_id = application.id
join iam.permissions permission on permission.application_id = application.id
where application.application_key = 'visibility'
  and role.role_key = 'lane_maintainer'
  and permission.permission_key in ('shipments.read', 'shipments.lanes')
on conflict do nothing;

-- Administrators get the new permission too (the base seed only granted the
-- permissions that existed then).
insert into iam.role_permissions (role_id, permission_id, application_id)
select role.id, permission.id, application.id
from iam.applications application
join iam.roles role on role.application_id = application.id
join iam.permissions permission on permission.application_id = application.id
where application.application_key = 'visibility'
  and role.role_key = 'admin'
  and permission.permission_key = 'shipments.lanes'
on conflict do nothing;
