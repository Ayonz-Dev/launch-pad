import type { Leg, Shipment, ShipmentDerived, ShipmentStatus } from "./types";

const DAY = 1000 * 60 * 60 * 24;

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / DAY);
}

function currentLeg(s: Shipment): Leg {
  // Last leg with an actual (completed) milestone tells us where we are.
  const done = s.milestones.filter((m) => m.actual && m.timestamp);
  if (done.length === 0) return "first_mile";
  return done[done.length - 1].leg;
}

function isDelivered(s: Shipment): boolean {
  return s.milestones.some((m) => m.code === "DELIVERED" && m.actual);
}

/**
 * Status precedence:
 *   delivered  -> done
 *   at_risk    -> ETA now lands after the retailer on-shelf deadline (commercial risk)
 *   delayed    -> ETA has slipped materially vs. the original plan (>= 3 days)
 *   on_track   -> everything else
 * at_risk is deliberately ranked above delayed: a 2-day slip that still misses a
 * Best Buys date matters more than a 4-day slip with weeks of buffer.
 */
export function derive(s: Shipment): ShipmentDerived {
  const etaSlipDays = daysBetween(s.etaCurrent, s.etaOriginal);

  const hasDeadline = Boolean(s.retailerDeadline);
  const daysVsDeadline = hasDeadline
    ? daysBetween(s.retailerDeadline as string, s.etaCurrent)
    : 0;
  const breached = hasDeadline && daysVsDeadline < 0;

  let status: ShipmentStatus;
  if (isDelivered(s)) status = "delivered";
  else if (breached) status = "at_risk";
  else if (etaSlipDays >= 3) status = "delayed";
  else status = "on_track";

  return {
    ...s,
    status,
    currentLeg: currentLeg(s),
    etaSlipDays,
    deadlineRisk: { hasDeadline, breached, daysVsDeadline },
  };
}

export const LEG_LABEL: Record<Leg, string> = {
  first_mile: "Factory → Port",
  ocean: "Ocean",
  customs_drayage: "Customs & Drayage",
  last_mile: "→ Retailer DC",
};

export const STATUS_LABEL: Record<ShipmentStatus, string> = {
  on_track: "On track",
  at_risk: "Deadline risk",
  delayed: "Delayed",
  delivered: "Delivered",
};
