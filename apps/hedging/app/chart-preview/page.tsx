import { RateChart } from '../../components/RateChart';
import type {
  BankRangePoint,
  ForecastPoint,
  ForwardPoint,
  SpotPoint,
} from '../../lib/chart/series';
import { forecastFromSpot } from '../../lib/forecast';

// Deterministic synthetic data so the chart renders and can be verified without
// a database. Not linked from the app; it is a development and screenshot aid.

export const dynamic = 'force-static';

const AUD = 0.0435;
const USD = 0.041;

function syntheticSpot(): SpotPoint[] {
  const rows: SpotPoint[] = [];
  const start = Date.parse('2026-01-05T00:00:00Z');
  for (let week = 0; week < 26; week += 1) {
    const ms = start + week * 7 * 86_400_000;
    const date = new Date(ms).toISOString().slice(0, 10);
    // A gentle wave around 0.66, no randomness so screenshots are stable.
    const rate = 0.66 + 0.012 * Math.sin(week / 3) - 0.0006 * week;
    rows.push({ date, rate: Number(rate.toFixed(6)) });
  }
  return rows;
}

const bankForecasts: ForecastPoint[] = [
  { date: '2026-09-04', rate: 0.652 },
  { date: '2026-12-04', rate: 0.648 },
];

const forwards: ForwardPoint[] = [
  { date: '2026-08-15', rate: 0.657, orderNumber: 'FWD-1001' },
  { date: '2026-10-30', rate: 0.651, orderNumber: 'FWD-1002' },
  { date: '2027-01-20', rate: 0.646, orderNumber: 'FWD-1003' },
];

// Ranges as they would be parsed from a bank's macro comment (1-3wks, 3-12wks,
// 12wks+), anchored to early July, so the range band and its midline show.
const bankRanges: BankRangePoint[] = [
  { startDate: '2026-07-06', endDate: '2026-07-20', low: 0.6865, high: 0.71, mid: 0.69825 },
  { startDate: '2026-07-20', endDate: '2026-09-21', low: 0.683, high: 0.715, mid: 0.699 },
  { startDate: '2026-09-21', endDate: '2026-12-14', low: 0.725, high: 0.73, mid: 0.7275 },
];

export default function ChartPreviewPage() {
  const spot = syntheticSpot();
  const modelForecasts = forecastFromSpot(spot, { horizonMonths: 12 });
  return (
    <main className="page">
      <header className="page-head">
        <h1>Rate chart preview</h1>
        <span className="anchor">Synthetic AUD/USD</span>
      </header>
      <RateChart
        pair="AUD/USD"
        spotHistory={spot}
        bankForecasts={bankForecasts}
        modelForecasts={modelForecasts}
        bankRanges={bankRanges}
        forwards={forwards}
        rateBase={AUD}
        rateQuote={USD}
      />
    </main>
  );
}
