import { describe, it, expect } from 'vitest';
import { allocateOrders, type AllocationInput, type HedgeLot, type IncomingOrder } from './allocate';

const SPOT = 0.66; // AUD/USD: USD per 1 AUD.

function order(id: string, amountUsd: number, date = '2026-08-01'): IncomingOrder {
  return { id, date, pair: 'AUD/USD', amountUsd };
}

function hedge(orderNumber: string, amountUsd: number, contractRate: number): HedgeLot {
  return { orderNumber, pair: 'AUD/USD', amountUsd, contractRate, maturityDate: '2026-08-01' };
}

function run(partial: Partial<AllocationInput>) {
  return allocateOrders({
    orders: partial.orders ?? [],
    cashUsd: partial.cashUsd ?? 0,
    hedges: partial.hedges ?? [],
    spot: partial.spot ?? SPOT,
  });
}

describe('allocateOrders', () => {
  it('settles from cash first, at no AUD cost', () => {
    const { allocations } = run({ orders: [order('A', 100_000)], cashUsd: 100_000 });
    const a = allocations[0]!;
    expect(a.fromCashUsd).toBe(100_000);
    expect(a.audCost).toBe(0);
    expect(a.action).toBe('use-cash');
    // Saving equals the whole all-spot cost, since no AUD was spent.
    expect(a.saveVsSpotAud).toBeCloseTo(100_000 / SPOT, 1);
  });

  it('uses an in-the-money hedge when its rate beats spot', () => {
    const { allocations } = run({ orders: [order('A', 100_000)], hedges: [hedge('F1', 100_000, 0.7)] });
    const a = allocations[0]!;
    expect(a.fromHedgeUsd).toBe(100_000);
    expect(a.fromSpotUsd).toBe(0);
    expect(a.action).toBe('use-hedge');
    expect(a.effectiveRate).toBeCloseTo(0.7, 6);
    expect(a.audCost).toBeCloseTo(100_000 / 0.7, 1);
    expect(a.saveVsSpotAud).toBeCloseTo(100_000 / SPOT - 100_000 / 0.7, 1);
    expect(a.recommendation).toMatch(/hedged USD/i);
  });

  it('leaves an underwater hedge unused and buys at spot', () => {
    const { allocations, summary } = run({
      orders: [order('A', 100_000)],
      hedges: [hedge('F1', 100_000, 0.62)], // 0.62 < spot 0.66: worse than spot.
    });
    const a = allocations[0]!;
    expect(a.fromHedgeUsd).toBe(0);
    expect(a.fromSpotUsd).toBe(100_000);
    expect(a.action).toBe('unfunded');
    expect(a.saveVsSpotAud).toBe(0);
    expect(summary.hedgeAvailableUsd).toBe(100_000);
    expect(summary.hedgeInTheMoneyUsd).toBe(0);
    expect(summary.exposedAtSpotUsd).toBe(100_000);
  });

  it('blends cash, hedge and spot when one source is not enough', () => {
    const { allocations } = run({
      orders: [order('A', 200_000)],
      cashUsd: 50_000,
      hedges: [hedge('F1', 100_000, 0.7)],
    });
    const a = allocations[0]!;
    expect(a.fromCashUsd).toBe(50_000);
    expect(a.fromHedgeUsd).toBe(100_000);
    expect(a.fromSpotUsd).toBe(50_000);
    expect(a.action).toBe('mixed');
    expect(a.audCost).toBeCloseTo(100_000 / 0.7 + 50_000 / SPOT, 1);
  });

  it('draws shared cash and hedge pools nearest-date first', () => {
    const { allocations } = run({
      orders: [order('A', 60_000, '2026-09-01'), order('B', 60_000, '2026-07-01')],
      cashUsd: 50_000,
      hedges: [hedge('F1', 50_000, 0.7)],
    });
    // B (July) is settled before A (September).
    const b = allocations.find((x) => x.order.id === 'B')!;
    const a = allocations.find((x) => x.order.id === 'A')!;
    expect(b.fromCashUsd).toBe(50_000);
    expect(b.fromHedgeUsd).toBe(10_000);
    expect(b.fromSpotUsd).toBe(0);
    // A gets the leftover hedge, then spot.
    expect(a.fromCashUsd).toBe(0);
    expect(a.fromHedgeUsd).toBe(40_000);
    expect(a.fromSpotUsd).toBe(20_000);
  });

  it('summarises the portfolio and the AUD saved versus all-spot', () => {
    const { summary } = run({
      orders: [order('A', 100_000), order('B', 100_000)],
      cashUsd: 100_000,
      hedges: [hedge('F1', 100_000, 0.7)],
    });
    expect(summary.totalOrderUsd).toBe(200_000);
    expect(summary.fromCashUsd).toBe(100_000);
    expect(summary.fromHedgeUsd).toBe(100_000);
    expect(summary.fromSpotUsd).toBe(0);
    expect(summary.exposedAtSpotUsd).toBe(0);
    expect(summary.totalSaveAud).toBeGreaterThan(0);
    expect(summary.totalAudCost).toBeLessThan(summary.totalAudIfAllSpot);
  });
});
