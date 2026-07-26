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

## Not ported

The Monday.com catalogue sync on the source branch (`src/lib/monday`, `scripts`)
was incomplete and is isolated from the web app. It is excluded from the build
and can be finished later without touching the app.

## Local setup

From the monorepo root:

```bash
npm install
npm run dev:shipping        # runs on mock data with no keys
```

To run against the shared project, copy `.env.local.example` to `.env.local`,
set `DATA_SOURCE=supabase`, `SUPABASE_DB_SCHEMA=visibility`, the Supabase URL and
anon key, and (for ingest only) the service-role key and `INGEST_TOKEN`.
