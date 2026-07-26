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
    costing/          # Product costing and five-step MYOB approval chain
  packages/
    db/               # Supabase browser/server clients, DB types, SQL migrations
    auth/             # Shared identity: roles, permissions, approval chain, guards
```

Later apps (`hedging`, `shipping`, `launch-readiness`) drop in under `apps/*`
and depend on `@launchpad/db` and `@launchpad/auth`.

## Apps

### `apps/costing`

Takes a single product costing through a five-step approval chain and, on final
approval, produces a CSV ready to import into MYOB Acumatica.

Chain: Account Coordinator (builds and submits) -> Account Manager -> General
Manager -> Final Check (CEO) -> Accounts -> Approved.

The costing is shown as an on-screen spreadsheet. Only input cells are editable;
every calculated cell is derived server-side from a read-only view and is never
stored. See `apps/costing/README.md` for the full contract.

## Packages

### `@launchpad/db`

- `client.ts` - `createBrowserClient` from `@supabase/ssr`.
- `server.ts` - `createServerClient` wired to Next cookies.
- `types.ts` - database types (regenerate with the Supabase CLI after schema
  changes).
- `migrations/` - ordered SQL. Apply in filename order to the Supabase project.

### `@launchpad/auth`

- `roles.ts` - the role enum, human labels, the costing approval chain and a
  small permission model. No business rule about a role lives in app code; it
  lives here as data.
- `guards.ts` - `requireSession` / `requireRole` helpers for server components.

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
