# apps/hedging

FX hedging. Currently a **placeholder** app that exists to prove the shared
platform shell end to end. It signs in through `@launchpad/shell`, is framed by
the shared `AppShell`, and reads the same identity as every other app. The
content is intentionally blank until the real Hedging-Tool logic is ported in.

## What it demonstrates

- Login is one `<LoginForm brand="Ayonz · Hedging" redirectTo="/dashboard" />`.
- The `(app)` layout is `requireUser` + `<AppShell>`; no bespoke session
  handling or nav chrome.
- `middleware.ts` is a two line re-export of the shell's session middleware.
- Three routes (`/dashboard`, `/positions`, `/rates`) show the shared nav and
  active-link highlighting working.

That is the whole cost of a new app on the platform.

## What lands here later

When `Hedging-Tool` is in scope and ported:

- Live and forward AUD/USD rates from the hedging engine.
- Open forward contracts and coverage against exposure.
- The working-rate feed the costing app already consumes, so both price from
  one source.
- Role-derived nav and permissions via `@launchpad/auth`, not a parallel model.

## Local setup

From the monorepo root:

```bash
npm install
cp apps/hedging/.env.local.example apps/hedging/.env.local   # fill in Supabase keys
npm run dev --workspace @launchpad/hedging
```

Uses the same Supabase project and `profiles` identity as the costing app, so a
user who can sign in there can sign in here.
