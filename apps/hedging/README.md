# apps/hedging

FX hedging and cash-analytics for the Ayonz treasury: incoming USD requirements
(driven by shipping orders) laid against USD already held in hedged forwards and
offshore accounts, with the uncovered exposure to buy in AUD / GBP / EUR at spot.

The target is `SPEC.md`. The consolidation of the three Hedging-Tool versions is
mapped in `CONSOLIDATION-MAP.md`. This is being assembled in increments.

## State

Increment 1 (done): the consolidated base is in and green. It is the
`forex-dashboard-bank-intake` branch of Hedging-Tool (the richest single
substrate: main's engine and schema, the DB-backed dashboard, bank-forecast
intake, and the per-order recommendation engine), brought onto the monorepo
stack.

- USD-anchored throughout: every pair is quoted as USD per one unit of the
  funding currency; `scenario_id IS NULL` means live data.
- Libraries (pure, tested): `lib/irp` (covered interest-rate parity forward
  line), `lib/forecast` (damped-Holt projection, from-spot), `lib/coverage`,
  `lib/recommend` (settle each order the cheapest way: cash, then in-the-money
  hedges, then spot), `lib/bankForecast` (parse bank commentary into ranges).
- Migrations `supabase/migrations/000`-`007`.
- Builds on the monorepo stack (Next 14 / React 18 / supabase-js 2.45); 54 unit
  tests pass.

Still to come (see CONSOLIDATION-MAP.md):

- Overlay the crossrate-rebuild chart UI (a price-history chart with
  **1D / 1W / 1M / 1Y** tabs beside a forward-projection chart).
- Wire into the shared platform: the shell login and IAM, incoming orders read
  from `visibility.shipments` (shipping) instead of sample data, and a
  `treasury` schema for forwards and USD account balances.
- Generalise AUD/USD to **AUD / GBP / EUR** with a currency switcher, spot from
  the keyless Frankfurter (ECB) feed.

## Local setup

```bash
npm install
npm run dev:hedging
npm run test --workspace @launchpad/hedging
```

It renders on clearly-labelled sample data when Supabase is not configured.
