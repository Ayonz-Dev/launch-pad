import type { RawEvent } from "./normalize";

/**
 * Carrier-direct adapter using the DCSA Track & Trace 3.0 standard.
 *
 * Why this exists: the big lines (Maersk, Hapag-Lloyd, CMA CGM, ONE, MSC...)
 * publish a *standardised* T&T API. If your volume concentrates on a handful of
 * carriers, integrating them directly is the cheapest feed — often a free or
 * low-cost developer tier — and avoids per-container aggregator fees. The
 * trade-off is you maintain one auth/endpoint per carrier and cover gaps for
 * smaller lines yourself.
 *
 * This is a STUB. Each carrier gives you a developer portal + OAuth client.
 * Fill CARRIER_ENDPOINTS and the auth per carrier, then map their DCSA
 * `transportEventTypeCode` / `shipmentEventTypeCode` to our internal codes.
 */

const CARRIER_ENDPOINTS: Record<string, string> = {
  // "MAEU": "https://api.maersk.com/track-and-trace/...",
  // "HLCU": "https://api.hapag-lloyd.com/...",
};

// DCSA event code -> our internal milestone code.
const DCSA_TO_INTERNAL: Record<string, string> = {
  "LOAD": "LOADED",
  "DEPA": "VESSEL_DEPARTURE",
  "ARRI": "VESSEL_ARRIVAL",
  "DISC": "DISCHARGE",
  "GTIN": "GATE_IN",
  "GTOT": "GATE_OUT",
};

export interface DcsaConfig {
  carrierCode: string; // SCAC, e.g. MAEU
  token: string; // OAuth bearer for that carrier
}

export async function fetchDcsaEvents(
  config: DcsaConfig,
  containerOrBl: string
): Promise<RawEvent[]> {
  const base = CARRIER_ENDPOINTS[config.carrierCode];
  if (!base) {
    throw new Error(
      `No DCSA endpoint configured for carrier ${config.carrierCode}. Add it in dcsa.ts.`
    );
  }

  const res = await fetch(`${base}/events?equipmentReference=${containerOrBl}`, {
    headers: { Authorization: `Bearer ${config.token}` },
    // Vercel/Next caching: revalidate hourly to match feed cadence.
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`DCSA fetch ${res.status}`);
  const events: any[] = await res.json();

  return events.map((e) => ({
    code: DCSA_TO_INTERNAL[e.transportEventTypeCode ?? e.eventType] ?? "OCEAN",
    location: e.eventLocation?.locationName ?? "",
    timestamp: e.eventDateTime ?? null,
    actual: (e.eventClassifierCode ?? "ACT") === "ACT",
  }));
}
