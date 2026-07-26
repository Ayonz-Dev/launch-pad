# Alibaba sourcing pipeline (Stage 01)

Provider-agnostic ingest for **Ayonz Sourcing & Procurement**:

watchlist → SEARCH → normalize → upsert suppliers/products → change detection → enrich only flagged → price snapshots → run log.

The sourcing team works the review queue at `/sourcing`.

## 1. Database

In the Supabase SQL editor, run:

```text
supabase/sourcing_pipeline_schema.sql
```

That creates `sourcing_search_terms`, `sourcing_suppliers`, `sourcing_products`, `sourcing_product_snapshots`, `sourcing_runs`, and the `sourcing_review_queue` view, plus a few seed keywords.

## 2. Environment

In `.env.local` (see also `.env.example`):

```bash
# Canonical shared project (same as costing-app / shipments)
NEXT_PUBLIC_SUPABASE_URL=https://jhhorikmpftvzlawcuty.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Provider (Omkar Alibaba Scraper — free tier; swap without changing schema)
SOURCING_PROVIDER_API_KEY=your-omkar-key
# optional aliases / overrides:
# OMKAR_API_KEY=...
# SOURCING_PROVIDER_BASE_URL=https://alibaba-scraper.omkar.cloud
# SOURCING_SEARCH_PATH=/alibaba/products/search
# SOURCING_PRODUCT_PATH=/alibaba/products/details
# SOURCING_API_KEY_HEADER=API-Key
# SOURCING_SEARCH_CREDIT=1
# SOURCING_ENRICH_CREDIT=1
```

## 3. Run the pipeline

From `shipment-visibility`:

```bash
npm run sourcing:run
```

Useful flags:

```bash
# First test: one watchlist term, search only (no PDP credits)
npm run sourcing:run -- --max-terms=1 --skip-enrich

# Dry run still hits the provider + reads Supabase, but skips writes
npm run sourcing:run -- --dry-run --max-terms=1 --skip-enrich
```

Schedule with cron / GitHub Actions / a Vercel cron that shells this script — there is **no n8n dependency**.

## 4. Sourcing toolkit UI

Also run `supabase/sourcing_toolkit_schema.sql` (catalog + shortlists), then:

- Local: [http://localhost:3000/sourcing](http://localhost:3000/sourcing)
- Production: [https://shipment-visibility.vercel.app/sourcing](https://shipment-visibility.vercel.app/sourcing)

The page is a **search toolkit**: preferred / prospect catalogue (spreadsheet upload), Alibaba factories-only live search, and standalone shortlists with optional quote ref text.

Hub stage **01** on the Ayonz Sourcing & Procurement landing page links here.

## Cost control

- Cap `max_pages` per watchlist term (schema default 3).
- Enrichment runs only for `new` / `price_changed` rows.
- Every run still writes price snapshots for history.
- `sourcing_runs.credits_used` estimates spend from `SOURCING_*_CREDIT`.

## Changing providers

Only edit `scripts/sourcing/provider.ts` and field mapping in `scripts/sourcing/normalize.ts`. Schema, upserts, review queue, and UI stay the same.
