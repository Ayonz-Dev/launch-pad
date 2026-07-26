# apps/costing

Product costing and the five-step MYOB approval chain.

## The chain

Account Coordinator (builds and submits) -> Account Manager -> General Manager
-> Final Check (CEO) -> Accounts -> Approved.

Any reviewer can send a job back to the coordinator with a mandatory note. On
resubmit it re-enters at Account Manager.

## The data contract (the central rule)

The client reads and writes different objects. This split is enforced by the
database, not just the UI.

Writes (inputs only):
- `costings` - the INPUTS tab, input columns plus the `licences` jsonb and the
  chosen `rate_card_id`. Only the input columns are grantable to the client
  (migration 0002).
- `costing_history` - append only.
- `rate_cards`, `settings` - from the Settings screen only, role gated.

Reads (never written):
- `costing_computed` - the ENGINE and EXPORT tabs. Every landed cost, finance,
  GP, RRP and MYOB export field comes from this read-only view.

Stage, status and `final_fx` changes go through `security definer` RPCs
(`submit_costing`, `approve_costing`, `send_back_costing`, `set_final_fx`), never
a direct table write.

`lib/costing.ts` holds a TypeScript `compute()` that mirrors the SQL view for
live editing feel. On save the app persists inputs and re-reads the view, which
is the source of truth. `lib/costing.test.ts` checks a sample matches between
the two.

## FX

Working rate comes from `settings.working_fx`, set by the CEO on the Settings
screen and snapshotted onto each costing at insert by the `costings_defaults`
trigger. `final_fx` is set later at Final Check or Accounts via `set_final_fx`,
which recalculates the locked cells from the view.

## Routes

- `/login` - Supabase email/password.
- `/queue` - all costings with landed / loaded / GP, plus an "awaiting me"
  filter.
- `/new` - coordinator creates a costing.
- `/costing/[id]` - the sheet, workflow bar, stepper and trail.
- `/settings` - working FX (CEO) and rate cards (Final Check, Accounts).

## CSV and the roadmap

- Phase 1 (built): a single approved costing downloads as a one-row MYOB CSV
  from `costing_computed` (`lib/csv.ts`). The builder already takes an array.
- Phase 2 (seam): batch many approved costings into one multi-line CSV. Caller
  change only.
- Phase 3 (seam): replace the CSV with contract-based REST PUTs to MYOB after
  final approval. The marked no-op is in `lib/myob.ts`.

## Local setup

From the monorepo root:

```bash
npm install
cp apps/costing/.env.local.example apps/costing/.env.local   # fill in Supabase keys
npm run dev:costing
```

Apply `packages/db/migrations/*.sql` in order to the Supabase project, then add
users in Supabase Auth and set each `profiles.role`.
