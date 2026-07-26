# apps/hedging — target specification

The destination the three tangled Hedging-Tool versions converge onto. Written
before the consolidation so the tidy-up has a fixed target rather than merging
three messes blind. Australian English. No em dashes.

## 1. Purpose

A treasury view of foreign-exchange exposure driven by the shipping pipeline.
Ayonz buys stock from factories in **USD** and sells into **AUD, GBP and EUR**
markets. This tool answers, per month and per week:

- How much **USD do we need** to pay for incoming orders, and when.
- How much **USD do we already hold** against that need: locked in hedged
  forward contracts, plus balances sitting in offshore USD accounts.
- What is the **uncovered USD**, and how much **AUD / GBP / EUR** it will take to
  buy that shortfall at today's spot.

It reads the shipping data already in the shared project and adds two small
treasury tables (forwards, USD accounts) plus an FX feed.

## 2. Currencies

- Requirement currency: **USD** (supplier payments).
- Funding currencies: **AUD, GBP, EUR** (the three markets). The uncovered USD
  is translated into each of these at spot.
- Spot pairs tracked: **AUD/USD, GBP/USD, EUR/USD** (USD per one unit of the
  funding currency).

## 3. Data model

Reads (already exist):

- `visibility.shipments` — the incoming-orders source. Relevant columns:
  `fob_value_usd` (the USD payable), `eta_current` (when the money is needed),
  `retailer`, `destination`, `brand`, `organization_id`. Read through the same
  per-user IAM RLS the shipping app uses.

New treasury tables (proposed, in a `treasury` schema on the shared project, IAM
org-scoped exactly like `visibility`):

```
treasury.forwards
  id                uuid pk
  organization_id   uuid  -> iam.organizations
  currency          text  check in ('AUD','GBP','EUR')   -- funding side sold
  notional_usd      numeric        -- USD bought under the contract
  rate              numeric        -- locked funding/USD rate
  trade_date        date
  settlement_date   date           -- when the USD matures/lands
  counterparty      text
  reference         text
  status            text  check in ('open','settled','cancelled')
  created_by, created_at, updated_at

treasury.usd_accounts
  id                uuid pk
  organization_id   uuid  -> iam.organizations
  name              text           -- e.g. "HSBC USD offshore"
  balance_usd       numeric        -- current cleared balance
  as_of             date
  created_by, created_at, updated_at

treasury.fx_rates            -- cache of spot + historical for the chart
  id                uuid pk
  pair              text  check in ('AUDUSD','GBPUSD','EURUSD')
  as_of             timestamptz
  rate              numeric
  source            text
  unique (pair, as_of)
```

RLS mirrors `visibility`: an IAM application `treasury` with permissions
`treasury.read`, `treasury.write`, `treasury.manage`; select for members, write
for `treasury.write`. Forwards and accounts are org-scoped; `fx_rates` is a
shared cache readable by all authenticated users.

## 4. Derivations (pure functions, tested)

Isolate these in `lib/exposure.ts` as pure functions over plain inputs, no DB or
UI, with unit tests. This is the substance and must be right.

- **Requirement curve.** Group open shipments by ISO week of `eta_current`
  (and roll up to month). `required_usd[week] = sum(fob_value_usd)` over
  shipments not yet delivered/paid.
- **Coverage.**
  - `maturing_forwards[week] = sum(notional_usd)` of open forwards whose
    `settlement_date` falls in that week.
  - `account_balance = sum(balance_usd)` of USD accounts (a standing buffer,
    applied oldest-requirement-first).
- **Uncovered.** Walk weeks in order, drawing down the account buffer then that
  week's maturing forwards:
  `uncovered_usd[week] = max(0, required_usd[week] - applied_forwards - applied_balance)`.
- **Funding translation.** Allocate each order's USD to a funding currency
  (default from the order's destination market: AU -> AUD, UK -> GBP, EU ->
  EUR; overridable). For the uncovered portion, `need[currency] =
  uncovered_usd_in_currency / spot[pair]`. Show the covered portion at its
  blended locked rate so the true landed funding cost is visible.
- **Position summary.** Totals: total required, total hedged (forwards), total
  in accounts, total uncovered, and a coverage ratio.

## 5. Dashboard

One screen, IAM org-scoped, on the shared shell login. Top to bottom:

1. **Spot rate strip.** Three cards, AUD/USD, GBP/USD, EUR/USD, each showing the
   current spot and change on the selected timeframe. A single toggle
   **day / week / month / year** drives a line chart under the strip (one chart,
   switch pair by tab or overlay). Data from `fx_rates` timeseries.
2. **Incoming orders by week.** A bar/table of `required_usd` per ISO week
   (next ~12-16 weeks), from shipping ETAs, drill-down to the orders in a week.
   This is the demand curve and the anchor of the screen.
3. **Coverage vs requirement.** The same weeks overlaid with maturing forwards
   and the account buffer, so covered vs uncovered reads at a glance.
4. **Uncovered exposure and funding need.** Per currency (AUD/GBP/EUR): the
   uncovered USD and the funding-currency amount to buy it at spot, plus the
   blended rate including what is already hedged.
5. **Holdings.** Small panels listing open forwards (notional, rate, settlement)
   and USD account balances, each editable by `treasury.write`.

## 6. FX source

A thin provider interface (`lib/fx/provider.ts`) with one implementation, so the
source is swappable:

- `getSpot(pairs)` -> current rates.
- `getTimeseries(pair, range)` -> points for the chart (day/week/month/year).

A server route `/api/fx/spot` (costing already has one to mirror) and
`/api/fx/timeseries` fetch and upsert into `treasury.fx_rates`, so the dashboard
reads the cache and the provider is hit on a schedule, not per view. Keep the
provider behind an env flag; fall back to the cached last-known rate offline.

## 7. Stack and integration

- Monorepo stack: Next 14 / React 18, same as the other apps.
- Identity: shared IAM. Gate the screen with `requireIamUser`; gate holdings
  edits with `authorized('treasury', 'treasury.write')`.
- Reads shipping through the `visibility` schema; no duplication of shipment
  data.
- Replaces the current `apps/hedging` placeholder.

## 8. Open decisions (resolve with Marcel, do not assume)

- **Funding-currency allocation.** Is each order funded from its market's
  currency (AU->AUD etc.), or pooled and funded at treasury discretion? The spec
  defaults to market-derived with an override; confirm.
- **Payment timing.** Is `eta_current` the right "money needed" date, or is it
  a payment term offset from ETD/BL date? Adjust the bucketing accordingly.
- **Account draw-down order.** Oldest-requirement-first is assumed; confirm vs a
  reserved-buffer policy.
- **FX provider.** Which feed (the existing hedging engine, a bank API, a public
  source), and does it give the historical series the chart needs.

## 9. Consolidating the three versions onto this

Once the repo is accessible, the tidy-up is: pick whichever version's dashboard
and FX charting is furthest along as the visual base, take the requirement/
coverage maths from wherever it is most complete (or write it fresh per section
4, which is small and testable), drop everything that does not serve section 5,
and wire it to the shared `visibility` + `treasury` schemas. The map produced
from diffing the three versions will name which parts come from where.
