# apps/shipping

Ayonz Control Tower: factory-to-retailer shipment visibility with the thing
off-the-shelf tools do not give you, commercial-risk surfacing. A container
slipping is not just a logistics event here, it is flagged as "will miss the
retailer on-shelf date, landed value exposed".

Ported from the standalone `shipment-visibility` app (in the costing-sheet repo,
`cursor/monday-catalogue-*` branches) onto the shared platform shell.

## What the port changed

The source app was an internal dashboard that read Supabase with the
**service-role key**, bypassing row-level security, and scoped shipments by an
environment org id. It has been converted to **per-user auth**:

- `getSupabaseServer()` now builds a cookie-based `@supabase/ssr` client from the
  signed-in session, so the `visibility` schema's IAM row-level security
  (`iam_private.authorized('visibility', ...)`) decides what each person can see
  and change. Reads and user writes (the manage editor, the importer) go through
  it.
- `getSupabaseServiceRole()` is a separate client for the **machine ingest**
  endpoint (`/api/ingest`) only, which n8n or a carrier push calls with a shared
  secret (`INGEST_TOKEN`) and which has no user session to run as.
- Sign-in is the shared `LoginForm`; the authenticated area is gated by
  `requireSession` and framed by the shared `AppShell` (its old left sidebar was
  swapped for the shared top nav). Session refresh is the shared middleware.

The app authorises through IAM, not the costing `profiles.role` model, so it
only requires a session and lets the database policies do the rest.

## Data source modes

- `DATA_SOURCE=mock` (default): runs entirely on bundled sample data. No keys, no
  database. This is what the build and local dev use out of the box.
- `DATA_SOURCE=supabase`: reads the `visibility` schema of the shared project
  through the signed-in session. Set `SUPABASE_DB_SCHEMA=visibility`.

## Database

`supabase/migrations/0001_visibility_schema_and_rls.sql` is the canonical
visibility schema and its RLS, copied from the shared costing platform. It
depends on the platform's `iam` / `iam_private` schema (organisations,
memberships, roles, permissions), which is created by the costing platform's
initial migration on the same project. Apply it to the shared project; do not
create a second copy of the IAM tables.

## Monday catalogue sync

A background pipeline that mirrors the Monday.com product catalogue (artwork and
social-media boards) into the shared project's `sourcing_catalog_*` and
`monday_*` tables. It is a machine job, not part of the web app: it runs from a
CLI under `tsx`, uses a service-role client (`getSourcingSupabaseServer` in
`src/lib/sourcing-supabase.ts`, kept free of `next/headers` so it needs no Next
request context), and nothing in the browser bundle imports it.

Run it:

```bash
# dry run: fetch and map, report what would change, write nothing
npm run catalog:sync:monday --workspace @launchpad/shipping -- --dry-run

# real run: upsert into Supabase
npm run catalog:sync:monday --workspace @launchpad/shipping

# unit test the board-to-catalogue mapping
npm run test:monday-mapping --workspace @launchpad/shipping
```

Environment (see `.env.local.example`):

- `MONDAY_API_TOKEN` - Monday.com API token (server only).
- `MONDAY_ARTWORK_BOARD_ID`, `MONDAY_COMPLETED_ARTWORK_BOARD_ID`,
  `MONDAY_SOCIAL_MEDIA_BOARD_ID` - board ids (sensible defaults are built in).
- `SOURCING_SUPABASE_URL` and `SOURCING_SUPABASE_SERVICE_ROLE_KEY` - target
  project and key. Default to the main `NEXT_PUBLIC_SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY` when unset.
- Optional: `MONDAY_SYNC_CONCURRENCY`, `MONDAY_API_VERSION`, `SOURCING_DB_SCHEMA`.

The catalogue tables it writes to are defined in
`supabase/migrations/0002_sourcing_catalog.sql`.

## Local setup

From the monorepo root:

```bash
npm install
npm run dev:shipping        # runs on mock data with no keys
```

To run against the shared project, copy `.env.local.example` to `.env.local`,
set `DATA_SOURCE=supabase`, `SUPABASE_DB_SCHEMA=visibility`, the Supabase URL and
anon key, and (for ingest only) the service-role key and `INGEST_TOKEN`.
