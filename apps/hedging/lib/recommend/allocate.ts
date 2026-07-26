// Purchase recommendation engine: given incoming USD orders and what the
// business already holds (USD cash reserves and forward hedges bought at a
// locked rate), decide, per order, the cheapest way to settle it in AUD.
//
// Convention (do not break): USD is the anchor, every pair is quoted USD per 1
// base unit, so AUD/USD means USD per 1 AUD. The AUD cost to obtain X USD at a
// rate R is X / R. A HIGHER rate is therefore CHEAPER for an AUD buyer.
//
// Cheapest-AUD-cost priority, per order:
//   1. USD cash reserves already held  -> no new AUD is spent (marginal cost 0).
//   2. Forward hedges whose locked rate beats today's spot (rate > spot),
//      best rate first -> USD already secured more cheaply than buying now.
//   3. Buy the remainder at spot.
// A hedge whose rate is below spot is "underwater" for settling a payable, so
// it is left alone and the order buys at spot instead. Cash and hedges are
// shared pools drawn down across orders in date order (nearest first).
//
// Pure and dependency-free. It receives resolved numbers and returns a plan;
// the app fetches the data and renders the table.

export interface IncomingOrder {
  id: string;
  /** Human label, e.g. an invoice or PO reference. */
  label?: string;
  /** ISO date the USD is needed. Orders are settled nearest-first. */
  date: string;
  pair: string;
  amountUsd: number;
}

export interface HedgeLot {
  orderNumber: string;
  pair: string;
  amountUsd: number;
  /** Locked contract rate, USD per 1 base unit. */
  contractRate: number;
  maturityDate: string;
}

export interface AllocationInput {
  orders: IncomingOrder[];
  /** Aggregate USD cash reserves available to settle orders. */
  cashUsd: number;
  hedges: HedgeLot[];
  /** Current spot rate, USD per 1 base unit. */
  spot: number;
}

export type AllocationAction =
  | 'use-cash'
  | 'use-hedge'
  | 'buy-spot'
  | 'mixed'
  | 'unfunded';

export interface HedgeDraw {
  orderNumber: string;
  usedUsd: number;
  contractRate: number;
}

export interface OrderAllocation {
  order: IncomingOrder;
  fromCashUsd: number;
  fromHedgeUsd: number;
  fromSpotUsd: number;
  hedgeDraws: HedgeDraw[];
  /** AUD actually spent to settle: cash portion is 0, hedge at its rate, spot at spot. */
  audCost: number;
  /** AUD cost had the whole order been bought at spot. */
  audCostIfAllSpot: number;
  /** audCostIfAllSpot - audCost: AUD saved by using cash and in-the-money hedges. */
  saveVsSpotAud: number;
  /** Blended rate on the funded (non-cash) portion, or null if fully cash-funded. */
  effectiveRate: number | null;
  action: AllocationAction;
  /** One-line, plain-language recommendation for the finance team. */
  recommendation: string;
}

export interface AllocationSummary {
  spot: number;
  totalOrderUsd: number;
  cashAvailableUsd: number;
  hedgeAvailableUsd: number;
  /** Hedge USD whose rate beats spot (usable to save vs spot). */
  hedgeInTheMoneyUsd: number;
  fromCashUsd: number;
  fromHedgeUsd: number;
  fromSpotUsd: number;
  cashRemainingUsd: number;
  hedgeRemainingUsd: number;
  totalAudCost: number;
  totalAudIfAllSpot: number;
  totalSaveAud: number;
  /** USD that had to be bought at spot: the exposure the team is deciding on. */
  exposedAtSpotUsd: number;
}

export interface AllocationPlan {
  allocations: OrderAllocation[];
  summary: AllocationSummary;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function audCostOf(usd: number, rate: number): number {
  return rate > 0 ? usd / rate : 0;
}

function describe(a: Omit<OrderAllocation, 'recommendation'>, spot: number): string {
  const usd = (n: number) => `USD ${Math.round(n).toLocaleString('en-AU')}`;
  switch (a.action) {
    case 'use-cash':
      return `Settle from USD cash reserves; no AUD purchase needed.`;
    case 'use-hedge': {
      const rate = a.effectiveRate ?? spot;
      return `Use hedged USD at ${rate.toFixed(4)} (beats spot ${spot.toFixed(4)}); saves ${usd(
        a.saveVsSpotAud,
      ).replace('USD', 'AUD')} vs buying at spot.`;
    }
    case 'buy-spot':
      return `No cheaper cover available; buy ${usd(a.fromSpotUsd)} at spot ${spot.toFixed(4)}.`;
    case 'mixed': {
      const parts: string[] = [];
      if (a.fromCashUsd > 0) parts.push(`${usd(a.fromCashUsd)} from cash`);
      if (a.fromHedgeUsd > 0) parts.push(`${usd(a.fromHedgeUsd)} hedged`);
      if (a.fromSpotUsd > 0) parts.push(`${usd(a.fromSpotUsd)} at spot`);
      return `Blend: ${parts.join(', ')}. Saves ${`AUD ${Math.round(
        a.saveVsSpotAud,
      ).toLocaleString('en-AU')}`} vs all-spot.`;
    }
    case 'unfunded':
    default:
      return `Exposed: buy ${usd(a.fromSpotUsd)} at spot ${spot.toFixed(4)} — no cash or in-the-money hedge to draw on.`;
  }
}

/**
 * Build the settlement plan. Orders are settled nearest-date first, drawing on
 * shared cash and in-the-money hedge pools, then spot for the remainder.
 */
export function allocateOrders(input: AllocationInput): AllocationPlan {
  const { spot } = input;
  const orders = [...input.orders].sort((a, b) => a.date.localeCompare(b.date));

  let cashPool = Math.max(input.cashUsd, 0);
  const cashAvailable = cashPool;

  // In-the-money hedges only (locked rate beats spot), best rate first.
  const hedgeAvailableUsd = input.hedges.reduce((s, h) => s + h.amountUsd, 0);
  const beneficial = input.hedges
    .filter((h) => h.contractRate > spot)
    .sort((a, b) => b.contractRate - a.contractRate)
    .map((h) => ({ ...h, remaining: h.amountUsd }));
  const hedgeInTheMoneyUsd = beneficial.reduce((s, h) => s + h.remaining, 0);

  const allocations: OrderAllocation[] = [];

  for (const order of orders) {
    let need = Math.max(order.amountUsd, 0);

    const fromCashUsd = Math.min(need, cashPool);
    cashPool -= fromCashUsd;
    need -= fromCashUsd;

    let fromHedgeUsd = 0;
    let hedgeAudCost = 0;
    const hedgeDraws: HedgeDraw[] = [];
    for (const h of beneficial) {
      if (need <= 0) break;
      if (h.remaining <= 0) continue;
      const use = Math.min(need, h.remaining);
      h.remaining -= use;
      need -= use;
      fromHedgeUsd += use;
      hedgeAudCost += audCostOf(use, h.contractRate);
      hedgeDraws.push({ orderNumber: h.orderNumber, usedUsd: use, contractRate: h.contractRate });
    }

    const fromSpotUsd = need;
    const spotAudCost = audCostOf(fromSpotUsd, spot);

    const audCost = round2(hedgeAudCost + spotAudCost);
    const audCostIfAllSpot = round2(audCostOf(order.amountUsd, spot));
    const saveVsSpotAud = round2(audCostIfAllSpot - audCost);
    const fundedUsd = fromHedgeUsd + fromSpotUsd;
    const effectiveRate = fundedUsd > 0 ? fundedUsd / (hedgeAudCost + spotAudCost) : null;

    let action: AllocationAction;
    if (fromCashUsd === order.amountUsd && order.amountUsd > 0) action = 'use-cash';
    else if (fromHedgeUsd > 0 && fromSpotUsd === 0 && fromCashUsd === 0) action = 'use-hedge';
    else if (fromSpotUsd === order.amountUsd && order.amountUsd > 0) action = 'unfunded';
    else if (fromSpotUsd > 0 && fromCashUsd === 0 && fromHedgeUsd === 0) action = 'buy-spot';
    else action = 'mixed';

    const base: Omit<OrderAllocation, 'recommendation'> = {
      order,
      fromCashUsd: round2(fromCashUsd),
      fromHedgeUsd: round2(fromHedgeUsd),
      fromSpotUsd: round2(fromSpotUsd),
      hedgeDraws,
      audCost,
      audCostIfAllSpot,
      saveVsSpotAud,
      effectiveRate,
      action,
    };
    allocations.push({ ...base, recommendation: describe(base, spot) });
  }

  const sum = (fn: (a: OrderAllocation) => number) => allocations.reduce((s, a) => s + fn(a), 0);
  const fromCashUsd = round2(sum((a) => a.fromCashUsd));
  const fromHedgeUsd = round2(sum((a) => a.fromHedgeUsd));
  const fromSpotUsd = round2(sum((a) => a.fromSpotUsd));

  const summary: AllocationSummary = {
    spot,
    totalOrderUsd: round2(sum((a) => a.order.amountUsd)),
    cashAvailableUsd: round2(cashAvailable),
    hedgeAvailableUsd: round2(hedgeAvailableUsd),
    hedgeInTheMoneyUsd: round2(hedgeInTheMoneyUsd),
    fromCashUsd,
    fromHedgeUsd,
    fromSpotUsd,
    cashRemainingUsd: round2(cashPool),
    hedgeRemainingUsd: round2(beneficial.reduce((s, h) => s + h.remaining, 0)),
    totalAudCost: round2(sum((a) => a.audCost)),
    totalAudIfAllSpot: round2(sum((a) => a.audCostIfAllSpot)),
    totalSaveAud: round2(sum((a) => a.saveVsSpotAud)),
    exposedAtSpotUsd: fromSpotUsd,
  };

  return { allocations, summary };
}
