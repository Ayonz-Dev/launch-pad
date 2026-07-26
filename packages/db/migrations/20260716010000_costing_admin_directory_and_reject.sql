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
