import type { Leg, Milestone } from "../types";

// Every feed (carrier-direct DCSA, Vizion, Terminal49, TradLinx...) uses its own
// event vocabulary. Normalise into ONE internal vocabulary so the UI and the
// exception engine never care which feed a shipment came from.

// Which leg an event belongs to.
const LEG_BY_CODE: Record<string, Leg> = {
  GATE_IN: "first_mile",
  LOADED: "ocean",
  VESSEL_DEPARTURE: "ocean",
  TRANSSHIP: "ocean",
  VESSEL_ARRIVAL: "ocean",
  DISCHARGE: "ocean",
  CUSTOMS_HOLD: "customs_drayage",
  CUSTOMS_RELEASE: "customs_drayage",
  GATE_OUT: "customs_drayage",
  DELIVERED: "last_mile",
};

const LABEL_BY_CODE: Record<string, string> = {
  GATE_IN: "Gate in, origin",
  LOADED: "Loaded on vessel",
  VESSEL_DEPARTURE: "Vessel departed",
  TRANSSHIP: "Transshipment",
  VESSEL_ARRIVAL: "Vessel arrived",
  DISCHARGE: "Discharge at destination",
  CUSTOMS_HOLD: "Customs inspection hold",
  CUSTOMS_RELEASE: "Customs release",
  GATE_OUT: "Gate out, port",
  DELIVERED: "Delivered to DC",
};

// A raw event from any adapter, already mapped to our internal `code`.
export interface RawEvent {
  code: keyof typeof LEG_BY_CODE | string;
  location: string;
  timestamp: string | null;
  actual: boolean;
}

export function toMilestone(e: RawEvent): Milestone {
  return {
    code: e.code,
    label: LABEL_BY_CODE[e.code] ?? e.code,
    leg: LEG_BY_CODE[e.code] ?? "ocean",
    location: e.location,
    timestamp: e.timestamp,
    actual: e.actual,
  };
}

export function toMilestones(events: RawEvent[]): Milestone[] {
  return events
    .map(toMilestone)
    .sort((a, b) => {
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });
}
