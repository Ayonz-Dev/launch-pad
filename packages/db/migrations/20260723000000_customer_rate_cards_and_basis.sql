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
