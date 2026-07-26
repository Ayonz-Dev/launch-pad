import Link from 'next/link';
import { KpiCard } from '../components/KpiCard';
import { ScenarioSwitcher } from '../components/ScenarioSwitcher';
import { CoveragePairTable } from '../components/CoveragePairTable';
import { RateChart } from '../components/RateChart';
import { SpotChartPanel } from '../components/SpotChartPanel';
import { IncomingByWeek } from '../components/IncomingByWeek';
import { groupByIsoWeek } from '../lib/incoming';
import { isSupabaseConfigured } from '../lib/supabase/server';
import {
  fetchCash,
  fetchCoverage,
  fetchScenarios,
  fetchSpotHistory,
  fetchBankForecasts,
  fetchForwards,
  fetchRateAssumptions,
  fetchSpotForecasts,
  fetchBankForecastRanges,
  fetchIncomingFromShipping,
} from '../lib/supabase/queries';
import {
  rollupCoverage,
  totalCashUsd,
  bufferCoverageRatio,
} from '../lib/coverage/rollup';
import { ratesForPair } from '../lib/irp/irp';
import { formatPercent, formatUsd } from '../lib/format';

export const dynamic = 'force-dynamic';

const CHART_PAIR = 'AUD/USD';

function parseScenario(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || value === 'live') return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function coverageTone(ratio: number | null): 'good' | 'warn' | 'bad' | 'neutral' {
  if (ratio === null) return 'neutral';
  if (ratio >= 0.8) return 'good';
  if (ratio >= 0.5) return 'warn';
  return 'bad';
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { scenario?: string | string[] };
}) {
  const scenarioId = parseScenario(searchParams.scenario);

  if (!isSupabaseConfigured()) {
    return (
      <main className="page">
        <header className="page-head">
          <h1>FX Hedging & Cash Analytics</h1>
          <span className="anchor">USD anchor</span>
        </header>
        <p className="notice">
          Supabase is not configured. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and a
          key (<code>SUPABASE_SERVICE_ROLE_KEY</code> or{' '}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>), then run the migrations in{' '}
          <code>supabase/migrations</code>.
        </p>
        <h2 className="section-title">Live spot and projection</h2>
        <SpotChartPanel pair="AUD/USD" base="AUD" />
      </main>
    );
  }

  const [
    scenarios,
    coverage,
    cash,
    spotHistory,
    bankForecasts,
    modelForecasts,
    bankRanges,
    forwards,
    rateMap,
  ] = await Promise.all([
    fetchScenarios(),
    fetchCoverage(scenarioId),
    fetchCash(scenarioId),
    fetchSpotHistory(CHART_PAIR),
    fetchBankForecasts(CHART_PAIR),
    fetchSpotForecasts(CHART_PAIR),
    fetchBankForecastRanges(CHART_PAIR),
    fetchForwards(scenarioId, CHART_PAIR),
    fetchRateAssumptions(),
  ]);

  // Incoming USD requirements sourced from the shipping app (visibility.shipments).
  const incoming = await fetchIncomingFromShipping();
  const incomingWeeks = groupByIsoWeek(incoming);

  const rollup = rollupCoverage(coverage);
  const cashUsd = totalCashUsd(cash);
  const buffer = bufferCoverageRatio(cashUsd, rollup.unhedgedPayableUsd);

  // Resolve base and quote rates for the IRP line. If an assumption is missing,
  // skip the chart rather than mispricing it.
  let chartRates: { rateBase: number; rateQuote: number } | null = null;
  try {
    chartRates = ratesForPair(CHART_PAIR, rateMap);
  } catch {
    chartRates = null;
  }

  return (
    <main className="page">
      <header className="page-head">
        <h1>FX Hedging & Cash Analytics</h1>
        <span className="anchor">USD anchor</span>
      </header>

      <nav className="scenario-switcher" aria-label="Sections">
        <Link href="/" className="scenario-chip is-active" aria-current="page">
          Coverage dashboard
        </Link>
        <Link href="/forex" className="scenario-chip">
          Forex position
        </Link>
        <Link href="/bank-forecast" className="scenario-chip">
          Bank forecast
        </Link>
      </nav>

      <ScenarioSwitcher scenarios={scenarios} active={scenarioId} />

      <section className="kpi-grid">
        <KpiCard
          label="Payable coverage"
          value={formatPercent(rollup.payableCoverageRatio)}
          tone={coverageTone(rollup.payableCoverageRatio)}
          sub={`${formatUsd(rollup.hedgedBuyUsd)} hedged of ${formatUsd(rollup.grossPayableUsd)} payable`}
        />
        <KpiCard
          label="Unhedged payable"
          value={formatUsd(rollup.unhedgedPayableUsd)}
          tone={rollup.unhedgedPayableUsd > 0 ? 'warn' : 'good'}
          sub={`${rollup.pairs.length} pair(s), ${rollup.monthCount} month(s)`}
        />
        <KpiCard
          label="Net exposure (weighted)"
          value={formatUsd(rollup.netExposureWeightedUsd)}
          sub="Confidence-weighted, negative is net payable"
        />
        <KpiCard
          label="USD cash buffer"
          value={formatUsd(cashUsd)}
          tone={buffer === null ? 'good' : buffer >= 1 ? 'good' : 'warn'}
          sub={
            buffer === null
              ? 'Covers the unhedged payable'
              : `${formatPercent(buffer)} of unhedged payable`
          }
        />
      </section>

      <h2 className="section-title">Incoming USD from shipping, by week ETA</h2>
      <IncomingByWeek buckets={incomingWeeks} />

      <h2 className="section-title">Live spot and projection</h2>
      <SpotChartPanel pair="AUD/USD" base="AUD" />

      <h2 className="section-title">{CHART_PAIR} spot, predictions and forwards</h2>
      {chartRates ? (
        <RateChart
          pair={CHART_PAIR}
          spotHistory={spotHistory}
          bankForecasts={bankForecasts}
          modelForecasts={modelForecasts}
          bankRanges={bankRanges}
          forwards={forwards}
          rateBase={chartRates.rateBase}
          rateQuote={chartRates.rateQuote}
        />
      ) : (
        <p className="empty">
          No rate assumptions for {CHART_PAIR}. Seed <code>rate_assumptions</code> to draw the IRP
          line.
        </p>
      )}

      <h2 className="section-title">Monthly coverage by pair</h2>
      <CoveragePairTable rows={coverage} />
    </main>
  );
}
