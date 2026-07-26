-- Teams tables had RLS policies but no grants for authenticated (permission denied on insert).

grant select, insert, update, delete on costing.teams to authenticated;
grant select, insert, update, delete on costing.team_memberships to authenticated;
