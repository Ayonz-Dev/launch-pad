# Launch Pad

Ayonz internal platform. A monorepo home for internal apps that share one
identity, role-based access control (RBAC) and Supabase database layer.

Australian English throughout. No em dashes in generated copy.

## Why a monorepo

Ayonz is building several internal tools (product costing, hedging, shipping,
retail launch readiness). They should not each reinvent login, roles and the
database client. Launch Pad keeps the shared plumbing in `packages/*` and each
product in `apps/*`, so a person signs in once against one identity model and
every app reads roles the same way.

```
launch-pad/
  apps/
    costing/          # Ayonz Costing Platform: quotes, sales/manager/ceo approval (real app, IAM)
    hedging/          # FX hedging & treasury (consolidating 3 Hedging-Tool versions)
    shipping/         # Shipment visibility control tower (ported, per-user auth + RLS)
  packages/
    db/               # Supabase browser/server clients, DB types, SQL migrations
    auth/             # Shared identity: roles, permissions, approval chain, guards
    shell/            # Shared login shell: sign-in, app chrome, session guard, middleware
```

Later apps (`hedging`, `shipping`, `launch-readiness`) drop in under `apps/*`
and depend on `@launchpad/db` and `@launchpad/auth`.

## Apps

### `apps/costing`

The Ayonz Costing Platform: manufacturer-to-retail costing, quotes and a
sales -> manager -> ceo approval chain, with customers, contacts, a product
catalogue, rate cards and a factory purchase-order export. The real app (not a
prototype), down-ported to the monorepo stack and authorising against the shared
IAM schema. It keeps its own persona-aware chrome rather than the shared shell.
See `apps/costing/README.md`.

### `apps/hedging`

A placeholder app that proves the shared shell end to end: it signs in through
`@launchpad/shell`, is framed by the shared `AppShell`, and reads the same
identity as costing. Content is blank until the real Hedging-Tool logic is
ported in. See `apps/hedging/README.md`.

### `apps/shipping`

Ayonz Control Tower: factory-to-retailer shipment visibility with
commercial-risk surfacing (AIS vessel tracking, ocean feed normalisation, xlsx
import). Ported from the standalone shipment-visibility app and converted from a
service-role dashboard to per-user auth: reads and user writes now run through
the signed-in session so the visibility schema's IAM row-level security applies,
and only the machine ingest endpoint keeps a service-role key (behind a shared
secret). See `apps/shipping/README.md`.

## Packages

### `@launchpad/db`

- `client.ts` - `createBrowserClient` from `@supabase/ssr`.
- `server.ts` - `createServerClient` wired to Next cookies, plus
  `createIamServerSupabase` (an iam-schema per-user client).
- `types.ts` / `iam-types.ts` - database types. `iam-types.ts` models the shared
  IAM schema (organisations, memberships, applications, roles, permissions,
  assignments).
- `migrations/` - the shared schema of record:
  `0001_iam_and_costing_platform.sql` is the real `iam` + `costing` schema. (The
  prototype costing app's own flat schema lives in
  `apps/costing/supabase/migrations`.)

### `@launchpad/auth`

- `iam.ts` - the canonical shared identity: `loadIamUser` loads a signed-in
  user's organisations, role assignments and computed permissions, and
  `authorized()` / `permissionsFor()` mirror the database `iam_private.authorized`
  in TypeScript for UI gating. App and permission keys are constants here.
- `roles.ts` / `guards.ts` - the prototype costing app's flat `profiles.role`
  model and profiles-based guards. Kept for `apps/costing` until it is migrated
  onto IAM; not the shared identity.

### `@launchpad/shell`

The shared login shell, so every app signs in and frames itself the same way.

- `LoginForm` - the Supabase email/password sign-in, self styled, parameterised
  by brand and redirect target.
- `AppShell` - the authenticated chrome (brand, nav links, identity, sign out).
  Each app passes its own role-derived links; the chrome is shared.
- `server.ts` - `getServerSupabase` (the Next cookies() adapter); `requireUser`
  (prototype profiles model); `requireSession` (session only); and
  `requireIamUser` / `getIamServerSupabase` for the shared IAM model.
- `middleware.ts` - `createSessionMiddleware`, so each app's middleware is a two
  line re-export.

## Getting started

Requires Node 18.18+ and npm 9+ (npm workspaces).

```bash
npm install

# copy the example env into the costing app and fill in Supabase keys
cp apps/costing/.env.local.example apps/costing/.env.local

# run the costing app
npm run dev:costing
```

### Environment

Each app reads its own `.env.local`. The costing app needs:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Never put the service role key in an app. It is only for admin scripts.

### Database

Apply the migrations in `packages/db/migrations/` in order to your Supabase
project, then regenerate types:

```bash
supabase gen types typescript --project-id <id> > packages/db/src/types.ts
```

## Conventions

- Australian English in code comments, UI copy and docs. No em dashes.
- Shared plumbing goes in `packages/*`, never copied into an app.
- The database is the source of truth for every calculated value. Apps send
  inputs and read computed views; they never write derived numbers.
- Ask before adding dependencies.

See `DECISIONS.md` for the architectural choices and their rationale.
