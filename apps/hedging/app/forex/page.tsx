import Link from 'next/link';
import { KpiCard } from '../../components/KpiCard';
import { isSupabaseConfigured } from '../../lib/supabase/server';
import {
  fetchOrders,
  fetchHedgeInventory,
  fetchCash,
  fetchLatestSpot,
} from '../../lib/supabase/queries';
import { totalCashUsd } from '../../lib/coverage/rollup';
import {
  allocateOrders,
  type AllocationAction,
  type HedgeLot,
  type IncomingOrder,
  type AllocationPlan,
} from '../../lib/recommend';
import { formatMonth, formatRate, formatUsd } from '../../lib/format';

// Forex position and purchase-recommendation dashboard: the landing page the
// costings app links to. It answers one question per incoming order: what is the
// cheapest way, in AUD, to settle it, given the USD cash and hedges already held.

export const dynamic = 'force-dynamic';

const CHART_PAIR = 'AUD/USD';

// Illustrative fallback so the page renders (and can be reviewed) without a
// database. Clearly flagged in the UI. Mirrors a realistic importer position.
const DEMO_SPOT = 0.66;
const DEMO_CASH_USD = 500_000;
const DEMO_HEDGES: HedgeLot[] = [
  { orderNumber: 'FWD-1001', pair: CHART_PAIR, amountUsd: 600_000, contractRate: 0.7, maturityDate: '2026-09-15' },
  { orderNumber: 'FWD-1002', pair: CHART_PAIR, amountUsd: 400_000, contractRate: 0.64, maturityDate: '2026-10-15' },
  { orderNumber: 'FWD-1003', pair: CHART_PAIR, amountUsd: 300_000, contractRate: 0.68, maturityDate: '2026-10-30' },
];
const DEMO_ORDERS: IncomingOrder[] = [
  { id: 'ORD-1', label: 'PO-4471', date: '2026-08-20', pair: CHART_PAIR, amountUsd: 400_000 },
  { id: 'ORD-2', label: 'PO-4488', date: '2026-09-18', pair: CHART_PAIR, amountUsd: 700_000 },
  { id: 'ORD-3', label: 'PO-4502', date: '2026-10-22', pair: CHART_PAIR, amountUsd: 500_000 },
  { id: 'ORD-4', label: 'PO-4519', date: '2026-11-12', pair: CHART_PAIR, amountUsd: 300_000 },
];

interface ForexData {
  orders: IncomingOrder[];
  hedges: HedgeLot[];
  cashUsd: number;
  spot: number | null;
  live: boolean;
}

async function loadForexData(): Promise<ForexData> {
  if (!isSupabaseConfigured()) {
    return { orders: DEMO_ORDERS, hedges: DEMO_HEDGES, cashUsd: DEMO_CASH_USD, spot: DEMO_SPOT, live: false };
  }
  const [orders, hedges, cash, spot] = await Promise.all([
    fetchOrders(null, CHART_PAIR),
    fetchHedgeInventory(null, CHART_PAIR),
    fetchCash(null),
    fetchLatestSpot(CHART_PAIR),
  ]);
  return { orders, hedges, cashUsd: totalCashUsd(cash), spot, live: true };
}

const ACTION_META: Record<AllocationAction, { cls: string; label: string }> = {
  'use-cash': { cls: 'pill pill-cash', label: 'Use cash' },
  'use-hedge': { cls: 'pill pill-hedge', label: 'Use hedge' },
  'buy-spot': { cls: 'pill pill-spot', label: 'Buy at spot' },
  mixed: { cls: 'pill pill-hedge', label: 'Blend' },
  unfunded: { cls: 'pill pill-exposed', label: 'Exposed' },
};

function compactUsd(n: number): string {
  if (n <= 0) return '—';
  return `US$${Math.round(n).toLocaleString('en-AU')}`;
}

export default function ForexPage() {
  return <ForexDashboard />;
}

async function ForexDashboard() {
  const data = await loadForexData();

  if (data.spot === null) {
    return (
      <main className="page">
        <ForexHeader />
        <p className="notice">
          No spot rate found for {CHART_PAIR}. Seed <code>spot_history</code> so the dashboard can
          price against the current market.
        </p>
      </main>
    );
  }

  const plan: AllocationPlan = allocateOrders({
    orders: data.orders,
    cashUsd: data.cashUsd,
    hedges: data.hedges,
    spot: data.spot,
  });
  const { summary, allocations } = plan;

  const exposedTone = summary.exposedAtSpotUsd > 0 ? 'warn' : 'good';

  return (
    <main className="page">
      <ForexHeader />

      {!data.live ? (
        <p className="notice">
          Illustrative data for preview — wire up Supabase to drive this from live orders
          (<code>usd_exposures</code>), hedges (<code>forward_orders</code>), cash reserves, and the
          latest <code>spot_history</code>.
        </p>
      ) : null}

      <section className="kpi-grid">
        <KpiCard
          label="Incoming USD (to fund)"
          value={formatUsd(summary.totalOrderUsd)}
          sub={`${allocations.length} order(s) at spot ${formatRate(summary.spot)}`}
        />
        <KpiCard
          label="USD cash reserves"
          value={formatUsd(summary.cashAvailableUsd)}
          tone="good"
          sub={`${compactUsd(summary.cashRemainingUsd)} left after allocation`}
        />
        <KpiCard
          label="Hedged USD available"
          value={formatUsd(summary.hedgeAvailableUsd)}
          tone="good"
          sub={`${compactUsd(summary.hedgeInTheMoneyUsd)} beats spot`}
        />
        <KpiCard
          label="Exposed (buy at spot)"
          value={formatUsd(summary.exposedAtSpotUsd)}
          tone={exposedTone}
          sub={
            summary.totalSaveAud > 0
              ? `Saving ${formatUsd(summary.totalSaveAud)} vs all-spot`
              : 'No cheaper cover than spot'
          }
        />
      </section>

      <h2 className="section-title">Recommended funding by order (cheapest AUD cost)</h2>
      <div className="table-scroll">
        <table className="coverage-table">
          <thead>
            <tr>
              <th>Needed</th>
              <th>Order</th>
              <th className="num">USD</th>
              <th className="num">Cash</th>
              <th className="num">Hedge</th>
              <th className="num">Spot</th>
              <th className="num">Eff. rate</th>
              <th className="num">AUD cost</th>
              <th className="num">Save vs spot</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {allocations.map((a) => {
              const meta = ACTION_META[a.action];
              return (
                <tr key={a.order.id}>
                  <td>{formatMonth(a.order.date)}</td>
                  <td>{a.order.label ?? a.order.id}</td>
                  <td className="num">{formatUsd(a.order.amountUsd)}</td>
                  <td className="num">{compactUsd(a.fromCashUsd)}</td>
                  <td className="num">{compactUsd(a.fromHedgeUsd)}</td>
                  <td className="num">{compactUsd(a.fromSpotUsd)}</td>
                  <td className="num">{a.effectiveRate ? a.effectiveRate.toFixed(4) : '—'}</td>
                  <td className="num">{formatUsd(a.audCost).replace('USD', 'AUD')}</td>
                  <td className="num">
                    {a.saveVsSpotAud > 0 ? formatUsd(a.saveVsSpotAud).replace('USD', 'AUD') : '—'}
                  </td>
                  <td>
                    <span className={meta.cls}>{meta.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="kpi-sub" style={{ marginTop: 12 }}>
        Priority per order: draw USD cash reserves first (already held), then forward hedges whose
        locked rate beats today&apos;s spot (best rate first), then buy the remainder at spot. A
        hedge below spot is left unused — buying at spot is cheaper for that order.
      </p>
    </main>
  );
}

function ForexHeader() {
  return (
    <>
      <header className="page-head">
        <h1>Forex position &amp; purchase recommendations</h1>
        <span className="anchor">USD anchor · {CHART_PAIR}</span>
      </header>
      <nav className="scenario-switcher" aria-label="Sections">
        <Link href="/" className="scenario-chip">
          Coverage dashboard
        </Link>
        <Link href="/forex" className="scenario-chip is-active" aria-current="page">
          Forex position
        </Link>
        <Link href="/bank-forecast" className="scenario-chip">
          Bank forecast
        </Link>
      </nav>
    </>
  );
}
