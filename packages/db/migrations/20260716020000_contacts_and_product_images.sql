-- Costing: contacts address book, per-SKU product images, and image storage
--
-- Adds a unified contacts table (supplier / customer / representative), links
-- customers and quotes to contacts, a per-organisation + per-SKU product image
-- registry, and a private Supabase Storage bucket with org-scoped policies.

-- ---- Contacts ---------------------------------------------------------------
create table costing.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id) on delete cascade,
  contact_type text not null check (contact_type in ('supplier', 'customer', 'representative')),
  company_name text,
  person_name text,
  email text,
  phone text,
  job_title text,
  address text,
  notes text,
  is_default boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (company_name is not null or person_name is not null)
);
create index contacts_org_type_idx on costing.contacts(organization_id, contact_type, company_name);

alter table costing.customers
  add column contact_id uuid references costing.contacts(id) on delete set null;

alter table costing.quotes
  add column customer_contact_id uuid references costing.contacts(id) on delete set null,
  add column representative_contact_id uuid references costing.contacts(id) on delete set null;

-- ---- Product images (keyed by organisation + SKU) ---------------------------
create table costing.product_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references iam.organizations(id) on delete cascade,
  sku text not null,
  storage_path text not null,
  is_primary boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, storage_path)
);
create index product_images_sku_idx on costing.product_images(organization_id, sku, is_primary desc);

create trigger contacts_set_updated_at before update on costing.contacts
for each row execute function iam_private.set_updated_at();

-- ---- Row-level security -----------------------------------------------------
alter table costing.contacts enable row level security;
alter table costing.product_images enable row level security;

create policy contacts_member_read on costing.contacts for select to authenticated
  using ((select iam_private.is_member(organization_id)));
create policy contacts_sales_insert on costing.contacts for insert to authenticated
  with check ((select iam_private.authorized('costing', 'quotes.create', organization_id)) and created_by = (select auth.uid()));
create policy contacts_sales_update on costing.contacts for update to authenticated
  using ((select iam_private.authorized('costing', 'quotes.create', organization_id)))
  with check ((select iam_private.authorized('costing', 'quotes.create', organization_id)));
create policy contacts_sales_delete on costing.contacts for delete to authenticated
  using ((select iam_private.authorized('costing', 'quotes.create', organization_id)));

create policy product_images_member_read on costing.product_images for select to authenticated
  using ((select iam_private.is_member(organization_id)));
create policy product_images_sales_insert on costing.product_images for insert to authenticated
  with check ((select iam_private.authorized('costing', 'quotes.create', organization_id)) and created_by = (select auth.uid()));
create policy product_images_sales_update on costing.product_images for update to authenticated
  using ((select iam_private.authorized('costing', 'quotes.create', organization_id)))
  with check ((select iam_private.authorized('costing', 'quotes.create', organization_id)));
create policy product_images_sales_delete on costing.product_images for delete to authenticated
  using ((select iam_private.authorized('costing', 'quotes.create', organization_id)));

grant select, insert, update, delete on costing.contacts to authenticated;
grant select, insert, update, delete on costing.product_images to authenticated;

-- ---- Storage bucket + policies ---------------------------------------------
-- Objects are stored under `<organization_id>/<sku>/<filename>` so the first
-- path segment scopes access to the owning organisation.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', false)
on conflict (id) do nothing;

create policy "Product images readable by org members"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'product-images'
    and (select iam_private.is_member(((storage.foldername(name))[1])::uuid))
  );

create policy "Product images writable by sales"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and (select iam_private.authorized('costing', 'quotes.create', ((storage.foldername(name))[1])::uuid))
  );

create policy "Product images deletable by sales"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-images'
    and (select iam_private.authorized('costing', 'quotes.create', ((storage.foldername(name))[1])::uuid))
  );
