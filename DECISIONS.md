# Architectural decisions

Written so a version of me starting cold, in a later session, can pick this up
without the earlier context. Australian English. No em dashes.

## Context

Ayonz runs several internal tools. The first two are a product costing app
(five-step approval into a MYOB CSV) and a retail launch readiness planner.
More are coming (hedging, shipping). Rather than each app carrying its own
login, roles and database wiring, `launch-pad` is a monorepo that holds the
shared plumbing once and each product as an app on top of it.

## D1. Monorepo with npm workspaces

Chosen over separate repos, and over pnpm/turbo.

- Separate repos would duplicate the auth and database layers and let them
  drift. The whole point is one identity model across apps.
- npm workspaces (not pnpm) because the existing costing scaffold already used
  npm, the team maintains internal tooling in plain npm, and we do not need
  pnpm's stricter resolution yet. Revisit if install time or phantom
  dependencies become a problem.
- No Turborepo yet. One app builds fast enough. Add a task runner when there
  are three or more apps and caching actually pays for itself. The `build` /
  `typecheck` scripts already fan out with `--workspaces --if-present`, so
  adding one later is not a rewrite.

## D2. Shared packages consumed as source, not built artefacts

`apps/costing` imports `@launchpad/db` and `@launchpad/auth` as TypeScript
source. Next.js transpiles them via `transpilePackages` in `next.config.js`.

- No separate build step for the packages, no stale `dist/` to forget to
  rebuild. Edit shared code and the app picks it up on the next render.
- The trade-off is that only Next-transpiled consumers can import them as-is. If
  a non-Next consumer (a node script, another framework) needs them later, add a
  `tsup` build to that package then. Not worth it for one Next app today.

## D3. Identity and RBAC live in `@launchpad/auth`, as data

The role enum, the human labels, the costing approval chain and the permission
map are all in `packages/auth/src/roles.ts`. App code asks questions of that
model (`canActOn`, `nextStage`), it does not hardcode role logic inline.

- This mirrors a rule carried from the launch readiness brief: business rules
  about who-can-do-what are data, not scattered `if role ===` checks. It keeps
  the chain in one auditable place and lets a second app reuse or extend it.
- The costing roles (`account_coordinator` ... `accounts`) are the first role
  set. When another app needs different roles, extend the model here rather than
  inventing a parallel one in the app. A person still has one `profiles.role`
  per the costing schema; if apps eventually need per-app roles, that becomes a
  join table in this package, not app-local state.

## D4. The database is the source of truth for calculated values

Carried directly from the costing brief and treated as non-negotiable across
the platform. Apps write inputs only. Every derived number comes from a
read-only Postgres view (`costing_computed`). Stage, status and FX transitions
go through `security definer` RPCs, and column grants stop the client from
writing them directly.

- A TypeScript `compute()` (`apps/costing/lib/costing.ts`) mirrors the SQL view
  purely for live editing feel while a field has focus. On save we persist
  inputs and re-read the view. If the two disagree, the view wins and the TS is
  the bug. There is a test that a sample costing matches between them.

## D5. Costing app ported, not rewritten

The on-screen sheet (`AyonzCostingSheet.jsx`) and the schema
(`ayonz_costing_schema.sql`) already existed. They were moved in as
`apps/costing/components/CostingSheet.tsx` and
`packages/db/migrations/0001_costing_schema.sql`, converted to TypeScript and
wired to props/callbacks, but their calculations and presentation were kept.
Do not redesign the sheet; it is the piece the user specifically asked for.

## D6. A shared login shell in `@launchpad/shell`

Sign-in, the authenticated nav chrome, the session guard and the
session-refresh middleware are extracted into `@launchpad/shell` rather than
living in each app.

- A person signs in against one identity model with one look, and a second app
  is chrome-complete on day one: point its login page at `LoginForm`, wrap its
  authed area in `AppShell`, re-export `createSessionMiddleware`. The costing
  app was refactored onto this and lost its own login page, nav and sign-out.
- The shell components are self styled (inline styles over a small `theme`),
  not dependent on any app's `globals.css`, so they render identically wherever
  they are dropped. App-specific content (the costing queue, forms) keeps using
  its own `globals.css`; only the shared shell is themed centrally.
- Client and server code are split by entry point: `@launchpad/shell` is
  client-safe, `@launchpad/shell/server` carries the `next/headers` and
  `redirect` helpers behind `server-only`, and `@launchpad/shell/middleware`
  holds the edge middleware factory. This stops a client component from ever
  pulling `next/headers` into the browser bundle.
- Nav links stay app-owned: `AppShell` takes a `links` array, so each app
  derives its own menu from the user's role while sharing the frame. The role
  logic still lives in `@launchpad/auth` (D3).

## D7. Shipping ported onto per-user auth, not service role

The shipment visibility app arrived as a standalone internal dashboard that read
with the Supabase service-role key (bypassing RLS) and scoped by an environment
org id. It was ported into `apps/shipping` and inverted to per-user auth.

- Reads and user-initiated writes now run through the signed-in session
  (`getSupabaseServer` builds a cookie-based `@supabase/ssr` client). The
  `visibility` schema already ships complete IAM row-level security
  (`iam_private.authorized('visibility', ...)`), so authorisation is the
  database's job; the app just needs a session. The env-based org filter on
  reads is therefore redundant and was dropped.
- The one exception is the machine ingest endpoint (`/api/ingest`), which n8n or
  a carrier push calls with a shared secret and which has no user session to run
  as. It keeps a service-role client (`getSupabaseServiceRole`). This is the
  correct split: humans go through RLS, machines go through a secret.
- The app authorises through IAM, not the costing `profiles.role` model, so it
  gates on session presence (`requireSession` from the shell) and lets RLS
  decide the rest. `requireSession` was added to the shell for exactly this
  case: apps that carry their own authorisation model.
- Its bespoke left sidebar was replaced by the shared `AppShell` top nav, per
  the chosen approach, so it frames like the other apps. Its Tailwind content
  styling is kept.
- The Monday.com catalogue sync (`src/lib/monday`, `scripts/monday`) is wired in
  as a background CLI job, not part of the web app. It uses a service-role
  client in `src/lib/sourcing-supabase.ts`, deliberately kept out of
  `lib/supabase.ts` so it carries no `next/headers` dependency and runs under
  plain `tsx`. The missing `getSourcingSupabaseServer` (referenced but never
  defined on the source branch) is provided there. Its catalogue tables are in
  `supabase/migrations/0002_sourcing_catalog.sql`. Nothing in the browser bundle
  imports it, so it does not affect the web build.

## D8. Shared identity reconciled onto the IAM model

The inconsistency flagged under D7 (the shared packages modelled a flat
`profiles.role`, but the real shared project uses a rich IAM schema) is now
resolved in the shared layer.

- `packages/db/migrations/0001_iam_and_costing_platform.sql` is the shared
  schema of record: the real `iam` schema (organisations, memberships,
  applications, roles, permissions, role assignments, `iam_private.authorized`)
  plus the real `costing` domain. The prototype's flat schema moved to
  `apps/costing/supabase/migrations`, where it belongs.
- `packages/db` gained `IamDatabase` types and `createIamServerSupabase`, an
  iam-schema per-user client.
- `@launchpad/auth` gained `iam.ts`: `loadIamUser` reads the signed-in user's
  own IAM rows (which the IAM RLS permits) and computes their effective
  permissions per application and organisation, mirroring
  `iam_private.authorized` in TypeScript. `authorized()` / `permissionsFor()`
  gate UI without a privileged call; the database RLS still enforces the truth
  on every query.
- `@launchpad/shell` gained `requireIamUser` (and `getIamServerSupabase`).
  `apps/shipping` now uses it in Supabase mode to hide the write-only nav
  (Import, Manage) from users without `shipments.write`, proving the reconciled
  layer against the real schema it targets. In mock mode it stays auth-free so
  the no-keys dev experience is intact.

## D9. apps/costing is the real Costing Platform, down-ported

The prototype costing app was replaced with the real Ayonz Costing Platform
(quotes, sales / manager / ceo approval, customers, contacts, catalogue, rate
cards, factory PO export). It already authorises against the shared IAM schema,
so this is the identity unification promised in D8, now realised in the app.

- Down-ported, not rebuilt from scratch. The real app was authored on Next 16 /
  React 19 / supabase-js 2.110; it was down-ported to the monorepo stack (Next
  14 / React 18 / supabase-js 2.45) so the repo stays single-stack. The app used
  almost no newer-stack features, so the change was small: version pins, three
  route handlers whose `params` type was unwrapped from a Promise (Next 14 route
  params are not promises), and a webpack `IgnorePlugin` for a `node:zlib`
  dynamic-import fallback that the browser never reaches. Verified by a green
  production build (14 routes) and 23 of 26 unit tests; the three failures are a
  missing binary Excel template that is not committed to git, not a code issue.
- Kept its own auth UX. The app has a client `SessionProvider`, a persona and
  team aware `AccessPersonaProvider` and its own `AppSidebar`, all reading the
  IAM schema directly. It is deliberately NOT put on `@launchpad/shell`, which is
  simpler than what this app already has. Forcing the shared chrome would
  regress it, and it also uses the newer `PUBLISHABLE_KEY` env name rather than
  the shell's `ANON_KEY`. So it does not depend on the shared UI packages; the
  integration that matters (one identity model) is at the shared IAM data layer.
  The shared shell remains for the lighter apps (hedging, shipping).

## Open questions (do not resolve unilaterally)

- Whether roles stay single-per-person (`profiles.role`) or become per-app once
  a second app with different roles lands. D3 leaves room for either.
- Whether the shared packages ever need a real build step (D2). Only if a
  non-Next consumer appears.
- Whether to adopt Turborepo (D1). Only at three or more apps.
