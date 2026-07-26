# Database schema — run order

Two SQL files to apply to the shared Supabase project
(`https://jhhorikmpftvzlawcuty.supabase.co`). Each is the consolidation, in
order, of the migrations under `packages/db/migrations` and
`apps/hedging/supabase/migrations`. Australian English. No em dashes.

## IMPORTANT: is this a fresh project or the live one?

The live shared project (`jhhorikmpftvzlawcuty`) **already has the platform
schema** (iam, costing, visibility, sourcing), because it is the project the
costing platform and shipment tracker already run against. Re-running
`01_platform_schema.sql` there fails with errors like `relation "applications"
already exists` or `trigger "teams_set_updated_at" already exists`. That is
expected: the objects are already present.

So:

- **On the existing live project:** do NOT run `01`. Run only
  `02_hedging_schema.sql` (the FX engine, which that project does not have yet).
  If you are missing a specific later platform migration, apply just that one
  file from `packages/db/migrations` rather than the whole consolidation.
- **On a brand-new project:** run `01` then `02`.

`02_hedging_schema.sql` is idempotent (every create guarded with
`if not exists` / `or replace`, the trigger dropped first, seeds use
`on conflict do nothing`), so it is safe to run and re-run.

Run them in the Supabase SQL editor (or `psql`) in this order:

## 1. `01_platform_schema.sql` (run first)

Shared identity and the two domain schemas the platform apps use.

- **`iam`** - organisations, memberships, applications, roles, permissions,
  role assignments, and `iam_private.authorized()` / `iam_private.is_member()`.
  This is the identity model all apps authenticate and authorise against.
  Seeds two applications: `costing` and `visibility`, each with roles and
  permissions.
- **`costing`** - the Costing Platform domain: customers, contacts, rate cards,
  customer rate cards, quotes, quote versions, quote approvals, product images,
  teams and salesperson profiles. Used by `apps/costing`.
- **`visibility`** - `visibility.shipments` (the shipment tracker), with its own
  RLS keyed on the IAM permissions. Used by `apps/shipping`, and read by
  `apps/hedging` for incoming USD requirements.
- **`public`** sourcing tables - `sourcing_catalog_*`, `sourcing_shortlist*` and
  the `monday_*` catalogue-sync tables. Used by the Monday sync and sourcing.

Bootstrap an organisation after applying: sign a user in, then call
`select public.bootstrap_costing_organization('Ayonz', 'ayonz');` which creates
the org, makes that user an admin of both `costing` and `visibility`, and sets
their default organisation.

## 2. `02_hedging_schema.sql` (run second)

The FX engine tables and views the hedging app reads, in the `public` schema:
`currency_pairs`, `scenarios`, `usd_exposures`, `forward_orders`,
`usd_cash_balances`, `spot_history`, `rate_assumptions`, `spot_forecasts`,
`bank_forecasts`, `bank_forecast_ranges`, plus the coverage and latest-value
views (`v_hedge_coverage_monthly`, `v_cash_latest`, `v_exposure_signed`,
`v_rate_assumptions_latest`, `v_spot_forecast_latest`, `v_bank_forecast_latest`).

It is independent of the platform schema, but `apps/hedging` reads incoming
orders from `visibility.shipments`, so apply `01` first if you want that link.

## 3. `04_shipment_extras.sql` (run on the live project)

Adds two columns to `visibility.shipments` that the richer report import needs:
`agls` (the AGL batch references on a shipment, the tracking key the import
prunes by so a re-upload overrides the previous entry for each AGL) and `notes`
(categorised free-form detail with no dedicated column: ETA-change comments,
transhipment notes, retailer notes, and any other cell comment or unmapped
column). Idempotent, so safe to run and re-run. Fresh projects get these from
`01` already; run `04` only on a project stood up before this change.

## After both

```sql
notify pgrst, 'reload schema';
```

Then in the Supabase dashboard, Settings -> API -> Exposed schemas, add `iam`,
`costing` and `visibility` alongside `public` so PostgREST serves them.

## Notes

- These files are generated from the migration folders; the folders remain the
  source of truth. If you change a migration, regenerate by concatenating the
  folder in filename order.
- Everything is `create ... if not exists` / `create or replace` where possible,
  so a single run on a fresh project is safe. On an existing project, prefer
  applying the individual migrations you have not run yet.
- `apps/costing` uses the newer Supabase publishable key name
  (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`); `apps/shipping` and `apps/hedging`
  use `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Set the
  same project's keys accordingly in each app's `.env.local`.
