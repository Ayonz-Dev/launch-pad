import { describe, it, expect } from 'vitest';
import { buildChartModel, type SpotPoint } from './series';

// AUD short rate above USD, so the IRP line runs at a forward discount.
const AUD = 0.0435;
const USD = 0.041;

const spot: SpotPoint[] = [
  { date: '2026-05-04', rate: 0.662 },
  { date: '2026-06-04', rate: 0.658 },
  { date: '2026-07-04', rate: 0.66 },
];

function base(manualEndpointRate: number) {
  return {
    spotHistory: spot,
    bankForecasts: [{ date: '2026-10-04', rate: 0.67 }],
    forwards: [{ date: '2026-09-04', rate: 0.655, orderNumber: 'FWD-1' }],
    rateBase: AUD,
    rateQuote: USD,
    manualEndpointRate,
    horizonMonths: 6,
  };
}

describe('buildChartModel', () => {
  it('returns nothing for empty spot history', () => {
    const model = buildChartModel({ ...base(0.66), spotHistory: [] });
    expect(model.rows).toEqual([]);
    expect(model.anchorDate).toBeNull();
  });

  it('anchors every predictive line on the last actual spot', () => {
    const model = buildChartModel(base(0.66));
    expect(model.anchorDate).toBe('2026-07-04');
    expect(model.anchorRate).toBe(0.66);
    const anchorRow = model.rows.find((r) => r.date === '2026-07-04')!;
    expect(anchorRow.spot).toBe(0.66);
    expect(anchorRow.irp).toBe(0.66);
    expect(anchorRow.bank).toBe(0.66);
    expect(anchorRow.manual).toBe(0.66);
  });

  it('leaves predictive lines null in the past and spot null in the future', () => {
    const model = buildChartModel(base(0.66));
    const past = model.rows.find((r) => r.date === '2026-05-04')!;
    expect(past.spot).toBe(0.662);
    expect(past.irp).toBeNull();
    expect(past.manual).toBeNull();

    const future = model.rows.find((r) => r.date === '2026-10-04')!;
    expect(future.spot).toBeNull();
    expect(future.irp).not.toBeNull();
  });

  it('runs the IRP line at a discount below the anchor', () => {
    const model = buildChartModel(base(0.66));
    const future = model.rows.filter((r) => r.irp !== null && r.date > '2026-07-04');
    expect(future.length).toBeGreaterThan(0);
    for (const row of future) {
      expect(row.irp!).toBeLessThan(0.66);
    }
  });

  it('interpolates the manual line linearly from anchor to endpoint', () => {
    const endpoint = 0.7;
    const model = buildChartModel(base(endpoint));
    const withManual = model.rows.filter((r) => r.manual !== null);
    const last = withManual[withManual.length - 1]!;
    // The far horizon hits the endpoint.
    expect(last.manual!).toBeCloseTo(endpoint, 6);
    // Every manual point sits between anchor and endpoint, and rises over time.
    for (const row of withManual) {
      expect(row.manual!).toBeGreaterThanOrEqual(0.66 - 1e-9);
      expect(row.manual!).toBeLessThanOrEqual(endpoint + 1e-9);
    }
  });

  it('places bank forecast points only at their own dates', () => {
    const model = buildChartModel(base(0.66));
    const bankRows = model.rows.filter((r) => r.bank !== null);
    // The anchor plus the single forecast date.
    expect(bankRows.map((r) => r.date)).toEqual(['2026-07-04', '2026-10-04']);
  });

  it('passes forwards through for the scatter overlay', () => {
    const model = buildChartModel(base(0.66));
    expect(model.forwards).toEqual([{ date: '2026-09-04', rate: 0.655, orderNumber: 'FWD-1' }]);
  });

  it('keeps rows sorted ascending by date', () => {
    const model = buildChartModel(base(0.66));
    const dates = model.rows.map((r) => r.date);
    expect(dates).toEqual([...dates].sort());
  });
});
