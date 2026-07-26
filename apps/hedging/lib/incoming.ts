import type { IncomingOrder } from './recommend';

// Group incoming orders (USD payable) into ISO weeks by the date the USD is
// needed. This is the demand curve the treasury dashboard is anchored on: how
// much USD falls due each week, from the shipping ETAs. Pure and testable.
//
// Australian English. No em dashes.

export interface WeekBucket {
  /** ISO date (Monday) of the week. */
  weekStart: string;
  /** Human label, e.g. "Mon 18 Aug". */
  label: string;
  totalUsd: number;
  count: number;
  orders: IncomingOrder[];
}

function parseIso(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

// The Monday (UTC) of the ISO week containing the given date.
export function isoWeekStart(date: string): string {
  const ms = parseIso(date);
  if (Number.isNaN(ms)) return date;
  const d = new Date(ms);
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  const delta = (day + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - delta);
  return d.toISOString().slice(0, 10);
}

function weekLabel(weekStart: string): string {
  const ms = parseIso(weekStart);
  if (Number.isNaN(ms)) return weekStart;
  return new Date(ms).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

export function groupByIsoWeek(orders: IncomingOrder[]): WeekBucket[] {
  const buckets = new Map<string, WeekBucket>();
  for (const order of orders) {
    const weekStart = isoWeekStart(order.date);
    const bucket = buckets.get(weekStart) ?? {
      weekStart,
      label: weekLabel(weekStart),
      totalUsd: 0,
      count: 0,
      orders: [],
    };
    bucket.totalUsd += order.amountUsd;
    bucket.count += 1;
    bucket.orders.push(order);
    buckets.set(weekStart, bucket);
  }
  return [...buckets.values()].sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart),
  );
}
