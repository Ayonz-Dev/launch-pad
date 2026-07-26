-- ============================================================================
-- Ayonz Costing App - migration 0002: column grants, defaults trigger, RPCs
--
-- RLS (in 0001) gates which ROWS a user may touch, but not which COLUMNS. This
-- migration locks the transition columns from direct client writes and routes
-- all stage, status and final_fx changes through security definer RPCs, so they
-- cannot be forged from the client.
--
-- Australian English. No em dashes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Column-level lock: clients may only update input columns directly.
-- ---------------------------------------------------------------------------
revoke update on costings from authenticated;
grant update (sku, description, brand, vendor, fob_usd, duty_rate,
  payment_term, container_config, sell_ex_gst, rrp_inc_gst, licences,
  rate_card_id, updated_at) on costings to authenticated;

-- ---------------------------------------------------------------------------
-- Force the working FX snapshot to come from settings, not the client, and
-- pin the opening stage / status on insert.
-- ---------------------------------------------------------------------------
create or replace function set_working_fx() returns trigger
  language plpgsql as $$
begin
  new.working_fx := (select working_fx from settings where id);
  new.stage := 'account_coordinator';
  new.status := 'draft';
  return new;
end $$;

drop trigger if exists costings_defaults on costings;
create trigger costings_defaults before insert on costings
  for each row execute function set_working_fx();

-- ---------------------------------------------------------------------------
-- Transitions. The client calls these; it never updates stage / status /
-- final_fx itself.
-- ---------------------------------------------------------------------------
create or replace function submit_costing(p_id uuid) returns void
  language plpgsql security definer as $$
declare v_role costing_role; v_owner uuid; v_status costing_status;
begin
  select role into v_role from profiles where id = auth.uid();
  select created_by, status into v_owner, v_status from costings where id = p_id;
  if v_owner <> auth.uid() or v_role <> 'account_coordinator'
     or v_status not in ('draft','sent_back') then
    raise exception 'not permitted';
  end if;
  update costings set stage='account_manager', status='pending', updated_at=now()
    where id = p_id;
  insert into costing_history(costing_id, action, actor, actor_role)
    values (p_id, 'submitted', auth.uid(), v_role);
end $$;

create or replace function approve_costing(p_id uuid) returns void
  language plpgsql security definer as $$
declare v_role costing_role; v_stage costing_role; v_status costing_status; v_next costing_role;
begin
  select role into v_role from profiles where id = auth.uid();
  select stage, status into v_stage, v_status from costings where id = p_id;
  if v_status <> 'pending' or v_stage <> v_role then
    raise exception 'not your step';
  end if;
  v_next := case v_stage
    when 'account_coordinator' then 'account_manager'
    when 'account_manager'     then 'general_manager'
    when 'general_manager'     then 'final_check'
    when 'final_check'         then 'accounts'
    else null end;
  if v_next is null then
    update costings set status='approved', updated_at=now() where id = p_id;
    insert into costing_history(costing_id, action, actor, actor_role)
      values (p_id, 'final_approved', auth.uid(), v_role);
  else
    update costings set stage=v_next, status='pending', updated_at=now() where id = p_id;
    insert into costing_history(costing_id, action, actor, actor_role)
      values (p_id, 'approved', auth.uid(), v_role);
  end if;
end $$;

create or replace function send_back_costing(p_id uuid, p_notes text) returns void
  language plpgsql security definer as $$
declare v_role costing_role; v_stage costing_role; v_status costing_status;
begin
  if coalesce(trim(p_notes),'') = '' then
    raise exception 'a revision note is required';
  end if;
  select role into v_role from profiles where id = auth.uid();
  select stage, status into v_stage, v_status from costings where id = p_id;
  if v_status <> 'pending' or v_stage <> v_role then
    raise exception 'not your step';
  end if;
  update costings set stage='account_coordinator', status='sent_back', updated_at=now()
    where id = p_id;
  insert into costing_history(costing_id, action, actor, actor_role, notes)
    values (p_id, 'sent_back', auth.uid(), v_role, p_notes);
end $$;

create or replace function set_final_fx(p_id uuid, p_fx numeric) returns void
  language plpgsql security definer as $$
declare v_role costing_role; v_stage costing_role; v_status costing_status; v_working numeric;
begin
  select role into v_role from profiles where id = auth.uid();
  select stage, status, working_fx into v_stage, v_status, v_working
    from costings where id = p_id;
  if v_status <> 'pending' or v_stage <> v_role
     or v_role not in ('final_check','accounts') then
    raise exception 'not permitted at this step';
  end if;
  update costings set final_fx = p_fx, updated_at=now() where id = p_id;
  insert into costing_history(costing_id, action, actor, actor_role, detail)
    values (p_id, 'fx_adjusted', auth.uid(), v_role,
            format('working %s to final %s', v_working, p_fx));
end $$;

-- ---------------------------------------------------------------------------
-- With the column grants above, the costings_review update policy from 0001 is
-- redundant (the grants already block stage / status / final_fx writes). Drop
-- it so there is one clear mechanism, not two.
-- ---------------------------------------------------------------------------
drop policy if exists costings_review on costings;
