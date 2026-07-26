# apps/costing

The Ayonz Costing Platform: manufacturer-to-retail costing, quotes and the
sales -> manager -> ceo approval chain, with customers, contacts, a product
catalogue, rate cards and a factory purchase-order export.

This is the real platform, ported into the monorepo to replace the earlier
prototype. It authenticates and authorises against the shared **IAM schema**
(the same identity model the other apps use), so bringing it in unifies identity
at the data layer.

## Stack note (down-port)

The app was authored on a newer stack (Next 16 / React 19 / supabase-js 2.110)
and down-ported to the monorepo's stack (Next 14 / React 18 / supabase-js 2.45)
so it shares one toolchain with the other apps. The app barely used newer-stack
features, so the down-port was small: version pins, three route handlers whose
`params` type was unwrapped from a Promise, and a webpack tweak (below). Its own
auth UX is kept: a client `SessionProvider`, a persona and team aware
`AccessPersonaProvider`, and `AppSidebar`. It is deliberately NOT put on the
shared `@launchpad/shell` chrome, which is simpler than what this app already
has. See DECISIONS.md D9.

### node:zlib and the client bundle

`src/lib/zipReplace.ts` rewrites Excel ZIP packages using the browser
`CompressionStream` API, with a guarded dynamic `import("node:zlib")` fallback
that a browser never reaches. Next 14's webpack cannot parse the `node:` scheme
even on that dead branch, so `next.config.mjs` ignores `node:zlib` for the
client build only.

## Required asset (not in git)

The factory purchase-order feature reads a binary Excel template at
`public/templates/ayonz-factory-po.xlsx`. That file is a deploy-provisioned
asset and is not committed to the repository. Without it, the three
`purchaseOrderExcel` tests that open the template fail (the other 23 tests
pass), and the PO export is unavailable at runtime. Drop the template in to
enable both.

## Environment

Copy `.env.local.example` to `.env.local`. Key variables:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` - the
  client (browser) uses the publishable key.
- `SUPABASE_SERVICE_ROLE_KEY` - server-only, for the catalogue and
  purchase-order API routes.

## Database

The shared schema of record lives in `packages/db/migrations` (the real `iam`,
`costing`, `visibility` and sourcing migrations). Apply them in filename order
to the shared project.

## Local setup

```bash
npm install
npm run dev:costing
```

## Tests

```bash
npm run test --workspace @launchpad/costing
```
