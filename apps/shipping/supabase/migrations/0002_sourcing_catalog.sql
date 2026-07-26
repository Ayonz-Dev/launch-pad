-- Sourcing toolkit (Stage 01) — catalog uploads + standalone shortlists
-- Run on the canonical shared project https://jhhorikmpftvzlawcuty.supabase.co
-- then: notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Internal supplier / product catalogue (spreadsheet uploads)
-- relationship: preferred = buy history / past quotes; prospect = no PO yet
-- ---------------------------------------------------------------------------
create table if not exists public.sourcing_catalog_suppliers (
  id uuid primary key default gen_random_uuid()
);

alter table public.sourcing_catalog_suppliers add column if not exists name text;
alter table public.sourcing_catalog_suppliers add column if not exists relationship text;
alter table public.sourcing_catalog_suppliers add column if not exists country text;
alter table public.sourcing_catalog_suppliers add column if not exists contact_name text;
alter table public.sourcing_catalog_suppliers add column if not exists contact_email text;
alter table public.sourcing_catalog_suppliers add column if not exists contact_phone text;
alter table public.sourcing_catalog_suppliers add column if not exists notes text;
alter table public.sourcing_catalog_suppliers add column if not exists source_file text;
alter table public.sourcing_catalog_suppliers add column if not exists created_at timestamptz;
alter table public.sourcing_catalog_suppliers add column if not exists updated_at timestamptz;

update public.sourcing_catalog_suppliers set created_at = now() where created_at is null;
update public.sourcing_catalog_suppliers set updated_at = now() where updated_at is null;
alter table public.sourcing_catalog_suppliers alter column created_at set default now();
alter table public.sourcing_catalog_suppliers alter column updated_at set default now();

do $$
begin
  alter table public.sourcing_catalog_suppliers
    drop constraint if exists sourcing_catalog_suppliers_relationship_check;
  alter table public.sourcing_catalog_suppliers
    add constraint sourcing_catalog_suppliers_relationship_check
    check (relationship in ('preferred', 'prospect'));
exception when others then null;
end $$;

create unique index if not exists sourcing_catalog_suppliers_name_rel_uidx
  on public.sourcing_catalog_suppliers (lower(name), relationship);

create table if not exists public.sourcing_catalog_products (
  id uuid primary key default gen_random_uuid()
);

alter table public.sourcing_catalog_products add column if not exists supplier_id uuid;
alter table public.sourcing_catalog_products add column if not exists sku text;
alter table public.sourcing_catalog_products add column if not exists product_name text;
alter table public.sourcing_catalog_products add column if not exists category text;
alter table public.sourcing_catalog_products add column if not exists fob_price numeric;
alter table public.sourcing_catalog_products add column if not exists currency text;
alter table public.sourcing_catalog_products add column if not exists moq numeric;
alter table public.sourcing_catalog_products add column if not exists moq_unit text;
alter table public.sourcing_catalog_products add column if not exists lead_time_days integer;
alter table public.sourcing_catalog_products add column if not exists last_order_date date;
alter table public.sourcing_catalog_products add column if not exists quote_ref text;
alter table public.sourcing_catalog_products add column if not exists notes text;
alter table public.sourcing_catalog_products add column if not exists agl text;
alter table public.sourcing_catalog_products add column if not exists agl_key text;
alter table public.sourcing_catalog_products add column if not exists model text;
alter table public.sourcing_catalog_products add column if not exists brand text;
alter table public.sourcing_catalog_products add column if not exists retailer text;
alter table public.sourcing_catalog_products add column if not exists retailer_id text;
alter table public.sourcing_catalog_products add column if not exists sales_person text;
alter table public.sourcing_catalog_products add column if not exists order_type text;
alter table public.sourcing_catalog_products add column if not exists barcode text;
alter table public.sourcing_catalog_products add column if not exists outer_carton_barcode text;
alter table public.sourcing_catalog_products add column if not exists factory_name text;
alter table public.sourcing_catalog_products add column if not exists country text;
alter table public.sourcing_catalog_products add column if not exists po_number text;
alter table public.sourcing_catalog_products add column if not exists features jsonb;
alter table public.sourcing_catalog_products add column if not exists packaging_type text;
alter table public.sourcing_catalog_products add column if not exists packaging_material text;
alter table public.sourcing_catalog_products add column if not exists carton_qty numeric;
alter table public.sourcing_catalog_products add column if not exists unit_dims text;
alter table public.sourcing_catalog_products add column if not exists giftbox_dims text;
alter table public.sourcing_catalog_products add column if not exists unit_weight text;
alter table public.sourcing_catalog_products add column if not exists outer_carton_dims text;
alter table public.sourcing_catalog_products add column if not exists outer_carton_weight text;
alter table public.sourcing_catalog_products add column if not exists created_at timestamptz;
alter table public.sourcing_catalog_products add column if not exists updated_at timestamptz;

update public.sourcing_catalog_products set currency = 'USD' where currency is null;
update public.sourcing_catalog_products set created_at = now() where created_at is null;
update public.sourcing_catalog_products set updated_at = now() where updated_at is null;
alter table public.sourcing_catalog_products alter column currency set default 'USD';
alter table public.sourcing_catalog_products alter column created_at set default now();
alter table public.sourcing_catalog_products alter column updated_at set default now();

create index if not exists sourcing_catalog_products_supplier_idx
  on public.sourcing_catalog_products (supplier_id);
create index if not exists sourcing_catalog_products_name_trgm_idx
  on public.sourcing_catalog_products using gin (product_name gin_trgm_ops);
create unique index if not exists sourcing_catalog_products_agl_key_uidx
  on public.sourcing_catalog_products (agl_key)
  where agl_key is not null;

-- ---------------------------------------------------------------------------
-- Monday.com product catalogue mirror
-- Monday remains the source of truth. These tables preserve provenance and
-- normalize workflow-heavy boards into catalogue-friendly records.
-- ---------------------------------------------------------------------------
create table if not exists public.monday_catalog_sync_runs (
  id uuid primary key default gen_random_uuid(),
  dry_run boolean not null default false,
  status text not null default 'running',
  counts jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.monday_product_sources (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.sourcing_catalog_products(id) on delete cascade,
  board_id text not null,
  item_id text not null,
  source_kind text not null,
  group_id text,
  group_title text,
  item_name text,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  raw_columns jsonb not null default '{}'::jsonb,
  first_synced_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  unique (board_id, item_id),
  check (source_kind in ('artwork_active', 'artwork_completed'))
);

create index if not exists monday_product_sources_product_idx
  on public.monday_product_sources (product_id);

create table if not exists public.monday_artwork_workflows (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.sourcing_catalog_products(id) on delete cascade,
  source_id uuid not null references public.monday_product_sources(id) on delete cascade,
  designer text,
  silkscreen_status text,
  packaging_status text,
  manuals_status text,
  pop_sticker_status text,
  rating_label_status text,
  energy_label_status text,
  outer_carton_status text,
  presentation_status text,
  product_server_status text,
  product_catalogue_status text,
  website_upload_status text,
  im_upload_status text,
  artwork_due date,
  frd date,
  inspection_status text,
  updated_at timestamptz not null default now(),
  unique (source_id)
);

create table if not exists public.monday_product_assets (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.sourcing_catalog_products(id) on delete cascade,
  social_post_id uuid,
  board_id text not null,
  item_id text not null,
  column_id text not null,
  column_title text,
  asset_id text not null,
  name text,
  file_extension text,
  file_size bigint,
  asset_url text,
  public_url text,
  source_updated_at timestamptz,
  last_synced_at timestamptz not null default now(),
  unique (board_id, item_id, column_id, asset_id)
);

create index if not exists monday_product_assets_product_idx
  on public.monday_product_assets (product_id);

create table if not exists public.monday_social_posts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.sourcing_catalog_products(id) on delete set null,
  board_id text not null,
  item_id text not null,
  group_id text,
  group_title text,
  name text,
  agl text,
  agl_key text,
  model text,
  brand text,
  sales_person text,
  country text,
  retailer text,
  retailer_weblink text,
  status text,
  priority text,
  designer text,
  due_date date,
  post_date date,
  content_type text,
  post_text text,
  description text,
  notes text,
  on_our_website text,
  our_weblink text,
  rrp numeric,
  sale_price numeric,
  boost_amount numeric,
  boost_days text,
  boosted_status text,
  raw_columns jsonb not null default '{}'::jsonb,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  last_synced_at timestamptz not null default now(),
  unique (board_id, item_id)
);

create index if not exists monday_social_posts_product_idx
  on public.monday_social_posts (product_id);
create index if not exists monday_social_posts_agl_key_idx
  on public.monday_social_posts (agl_key);

do $$
begin
  alter table public.monday_product_assets
    add constraint monday_product_assets_social_post_fk
    foreign key (social_post_id)
    references public.monday_social_posts(id)
    on delete cascade;
exception when duplicate_object then null;
end $$;

create table if not exists public.monday_catalog_sync_errors (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.monday_catalog_sync_runs(id) on delete cascade,
  board_id text,
  item_id text,
  code text not null,
  message text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists monday_catalog_sync_errors_run_idx
  on public.monday_catalog_sync_errors (run_id);

-- ---------------------------------------------------------------------------
-- Standalone shortlists (quote_ref is free text until costing-app wiring)
-- ---------------------------------------------------------------------------
create table if not exists public.sourcing_shortlists (
  id uuid primary key default gen_random_uuid()
);

alter table public.sourcing_shortlists add column if not exists name text;
alter table public.sourcing_shortlists add column if not exists quote_ref text;
alter table public.sourcing_shortlists add column if not exists notes text;
alter table public.sourcing_shortlists add column if not exists created_at timestamptz;
alter table public.sourcing_shortlists add column if not exists updated_at timestamptz;

update public.sourcing_shortlists set created_at = now() where created_at is null;
update public.sourcing_shortlists set updated_at = now() where updated_at is null;
alter table public.sourcing_shortlists alter column created_at set default now();
alter table public.sourcing_shortlists alter column updated_at set default now();

create table if not exists public.sourcing_shortlist_items (
  id uuid primary key default gen_random_uuid()
);

alter table public.sourcing_shortlist_items add column if not exists shortlist_id uuid;
alter table public.sourcing_shortlist_items add column if not exists source text;
alter table public.sourcing_shortlist_items add column if not exists catalog_product_id uuid;
alter table public.sourcing_shortlist_items add column if not exists alibaba_product_id text;
alter table public.sourcing_shortlist_items add column if not exists title text;
alter table public.sourcing_shortlist_items add column if not exists supplier_name text;
alter table public.sourcing_shortlist_items add column if not exists price_min numeric;
alter table public.sourcing_shortlist_items add column if not exists currency text;
alter table public.sourcing_shortlist_items add column if not exists listing_url text;
alter table public.sourcing_shortlist_items add column if not exists image_url text;
alter table public.sourcing_shortlist_items add column if not exists meta jsonb;
alter table public.sourcing_shortlist_items add column if not exists added_at timestamptz;

update public.sourcing_shortlist_items set currency = 'USD' where currency is null;
update public.sourcing_shortlist_items set added_at = now() where added_at is null;
alter table public.sourcing_shortlist_items alter column currency set default 'USD';
alter table public.sourcing_shortlist_items alter column added_at set default now();

do $$
begin
  alter table public.sourcing_shortlist_items
    drop constraint if exists sourcing_shortlist_items_source_check;
  alter table public.sourcing_shortlist_items
    add constraint sourcing_shortlist_items_source_check
    check (source in ('catalog', 'alibaba'));
exception when others then null;
end $$;

create index if not exists sourcing_shortlist_items_list_idx
  on public.sourcing_shortlist_items (shortlist_id);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant all on table
  public.sourcing_catalog_suppliers,
  public.sourcing_catalog_products,
  public.sourcing_shortlists,
  public.sourcing_shortlist_items
to anon, authenticated, service_role;

-- Monday raw payloads and file URLs stay server-only.
grant all on table
  public.monday_catalog_sync_runs,
  public.monday_product_sources,
  public.monday_artwork_workflows,
  public.monday_product_assets,
  public.monday_social_posts,
  public.monday_catalog_sync_errors
to service_role;

grant all on all sequences in schema public to anon, authenticated, service_role;

notify pgrst, 'reload schema';
