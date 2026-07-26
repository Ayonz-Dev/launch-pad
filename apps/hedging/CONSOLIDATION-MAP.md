# Hedging-Tool — three-version map

Read-only analysis of `Ayonz-Dev/Hedging-Tool` before any consolidation. The
"three versions" are three `claude/*` branches off `main`, none behind it, so
they are parallel experiments, not a linear history. Stack across all of them is
Next 14 / React 18 / supabase-js 2.45 with recharts and vitest, which matches
the monorepo, so no down-port is needed (unlike costing). Australian English.

## The four pieces

### `main` (22 Jul) — the engine and data layer

The shared foundation the others build on. USD-anchored throughout (every pair
quoted as USD per one unit; `scenario_id IS NULL` means live).

- Migrations 000-006: `currency_pairs`, `scenarios`, `usd_exposures`,
  `forward_orders`, `usd_cash_balances`, `v_hedge_coverage_monthly` (the KPI
  source), `v_cash_latest`, `rate_assumptions`, `spot_forecasts`.
- Libraries: `lib/irp` (covered interest-rate parity forward line), `lib/forecast`,
  `lib/coverage`, `lib/chart`. Components: `KpiCard`, `RateChart`,
  `CoveragePairTable`, `ScenarioSwitcher`.

This is the keeper base for the shared maths and schema.

### Version A: `claude/forex-dashboard-bank-intake` (23 Jul, +1 commit)

The most feature-complete, database-backed version. +1532 lines, almost all new
files on top of main.

- `app/forex/page.tsx` - the position and purchase-recommendation dashboard,
  explicitly "the landing page the costings app links to". DB-backed:
  `fetchOrders`, `fetchHedgeInventory`, `fetchCash`, `fetchLatestSpot`.
- `app/bank-forecast/` + `components/BankForecastForm.tsx` +
  `lib/bankForecast/parse.ts` (with tests) - bank commentary intake, parsed into
  horizon ranges. Migration `007_bank_forecast_ranges.sql`.
- `lib/recommend/allocate.ts` (with tests) - the per-order recommendation engine:
  settle each incoming order the cheapest way in AUD (cash first, then in-the-money
  hedges best-first, then spot).

Strengths: real Supabase integration, tests, and it is already designed to link
with costing. Weakness: AUD/USD only; plainer chart UX than version C.

### Version B: `claude/audusd-forecast-overlay` (23 Jul, +1 commit)

A small refactor, net -660 lines. Drops the server-side spot forecast (migration
006 and `scripts/generate-forecasts.ts`) and computes the AUD/USD forecast
overlay client-side instead. Not a feature set of its own. Its idea (client-side
forecast) is realised more fully in version C's damped-Holt model, so it is
mostly superseded.

### Version C: `claude/crossrate-rebuild` (24 Jul, +3 commits) — newest

A from-scratch, self-contained rebuild in a `crossrate/` subdirectory (2997 new
lines, its own package.json/tsconfig). Its README describes almost exactly the
dashboard Marcel asked for:

- Live spot AUD/USD from the keyless Frankfurter API (ECB reference rates) with a
  synthetic fallback so it always renders.
- Position KPIs: incoming USD, USD cash reserves, hedged USD in the money,
  exposure to buy at spot, AUD saved vs buying everything at spot.
- Two charts side by side: PRICE HISTORY with **1D / 1W / 1M / 1Y** tabs, and a
  FORWARD PROJECTION (damped-Holt with an ~80% band, labelled forecast).
- Per-order purchase recommendations with a coloured action pill
  (Use cash / Use hedge / Blend / Buy at spot / Exposed).
- Bank forecast ranges.

It reuses the recommendation rule: `crossrate/lib/recommend/allocate.ts` is
**identical** to version A's. Strengths: newest, cleanest, the exact chart UX
wanted, damped-Holt forecast, renders without a backend. Weaknesses: AUD/USD
only; lives in a subdir with its own toolchain; position data is
Frankfurter + sample rather than the shared database.

## How they overlap

- All four are AUD/USD-centric. None does AUD/GBP/EUR yet (though main's
  `currency_pairs` is built to hold them).
- Versions A and C share the same `allocate` recommendation engine verbatim.
- A integrates with Supabase; C integrates with Frankfurter + sample data; both
  matter for the target.
- The three branches barely touch each other's files, so this is a
  cherry-pick-and-assemble job, not a conflict-ridden merge.

## Recommended consolidation (converging on SPEC.md)

One app, assembled from the best of each, then wired into `launch-pad`:

1. **Base:** main's engine and schema (migrations 000-006) plus version A's
   `007_bank_forecast_ranges.sql`. Keep `lib/irp`, `lib/forecast`, `lib/coverage`.
2. **Dashboard and charts:** version C's dashboard and its 1D/1W/1M/1Y price
   chart + damped-Holt projection as the visual base (newest, matches the ask).
3. **Data integration and features:** version A's Supabase queries, bank-forecast
   intake, and the shared `lib/recommend` (the identical engine). Use Frankfurter
   (keyless, ECB) as the spot + history source, which answers the SPEC's FX-source
   question and gives the chart its day/week/month/year data.
4. **Drop:** version B (superseded), and C's duplicated `crossrate/` toolchain
   (fold its components into the single app, not a nested project).
5. **Generalise AUD/USD -> AUD/GBP/EUR.** This is the main net-new work; the
   USD-anchored `currency_pairs` model already supports it.
6. **Wire into launch-pad as `apps/hedging`** on the shared IAM: incoming orders
   come from `visibility.shipments` (`fob_value_usd` bucketed by ETA week, per
   SPEC section 4), forwards and USD balances from the `treasury` tables, spot
   from Frankfurter. Replace the placeholder app.

## Decision needed before assembling

- **Base choice:** the above (C's UI + main's engine + A's data/features). Confirm.
- **Currency scope:** ship AUD first (all three versions already do AUD) then add
  GBP/EUR, or build all three currencies from the start.
- **Spot source:** Frankfurter (keyless ECB, already used by C) as the default,
  behind the SPEC's provider seam so it can be swapped. Confirm.
- The four open decisions in SPEC.md section 8 still apply (funding-currency
  allocation, payment-timing date, draw-down order, provider).
