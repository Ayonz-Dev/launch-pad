import { describe, it, expect } from 'vitest';
import { groupByIsoWeek, isoWeekStart } from './incoming';
import type { IncomingOrder } from './recommend';

describe('isoWeekStart', () => {
  it('returns the Monday of the week', () => {
    // 2026-08-20 is a Thursday; its ISO week starts Monday 2026-08-17.
    expect(isoWeekStart('2026-08-20')).toBe('2026-08-17');
    // A Monday maps to itself.
    expect(isoWeekStart('2026-08-17')).toBe('2026-08-17');
    // A Sunday maps back to the preceding Monday.
    expect(isoWeekStart('2026-08-23')).toBe('2026-08-17');
  });
});

describe('groupByIsoWeek', () => {
  const orders: IncomingOrder[] = [
    { id: '1', date: '2026-08-18', pair: 'AUD/USD', amountUsd: 400_000 },
    { id: '2', date: '2026-08-20', pair: 'AUD/USD', amountUsd: 100_000 },
    { id: '3', date: '2026-08-25', pair: 'AUD/USD', amountUsd: 250_000 },
  ];

  it('buckets orders by ISO week and sums USD', () => {
    const weeks = groupByIsoWeek(orders);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]!.weekStart).toBe('2026-08-17');
    expect(weeks[0]!.totalUsd).toBe(500_000);
    expect(weeks[0]!.count).toBe(2);
    expect(weeks[1]!.weekStart).toBe('2026-08-24');
    expect(weeks[1]!.totalUsd).toBe(250_000);
  });

  it('returns weeks in chronological order', () => {
    const weeks = groupByIsoWeek([...orders].reverse());
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-08-17', '2026-08-24']);
  });
});
