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

Increment 2 (done): the crossrate chart UI is overlaid. A price-history panel
with **1D / 1W / 1M / 1Y** tabs sits beside a forward-projection panel
(damped-Holt, 80% band), from the keyless Frankfurter (ECB) feed with a
synthetic fallback. `components/SpotChartPanel` + `SpotRateChart`, dark-themed.

Increment 3, part 1 (done): incoming USD requirements are read from the shipping
app. `fetchIncomingFromShipping` reads `visibility.shipments`
(`fob_value_usd` due around `eta_current`) and the dashboard shows an "Incoming
USD from shipping, by week ETA" demand-curve section (`lib/incoming`, tested).

Increment 3, part 2 (done): the spot section is **multi-currency**. A currency
switcher (`components/CurrencySpot`) swaps the pair shown between AUD/USD,
GBP/USD and EUR/USD, each quoted USD per unit.

Still to come:

- **Shared shell login and IAM gate.** The app has no login yet; adding the
  shared `LoginForm` and a session gate needs the pages moved under an `(app)`
  route group (which shifts their relative imports), so it is a clean follow-on
  rather than a rushed change.
- **Funding-currency allocation.** Which of AUD/GBP/EUR settles each incoming
  order is an open decision (SPEC section 8). Until it is set, incoming orders
  are counted as USD (correct in total) and the currency switcher drives the
  spot view. A `treasury` schema for forwards/USD accounts is only needed if the
  app's existing `forward_orders` and `usd_cash_balances` tables are not reused.

## Local setup

```bash
npm install
npm run dev:hedging
npm run test --workspace @launchpad/hedging
```

It renders on clearly-labelled sample data when Supabase is not configured.
