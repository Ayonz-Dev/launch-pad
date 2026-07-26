// The four legs of the factory -> retailer journey. Only the ocean leg is a
// commodity feed you buy; the other three you stitch in yourself.
export type Leg = "first_mile" | "ocean" | "customs_drayage" | "last_mile";

export type ShipmentStatus = "on_track" | "at_risk" | "delayed" | "delivered";

export interface Milestone {
  code: string; // e.g. GATE_IN, LOADED, VESSEL_DEPARTURE, TRANSSHIP, DISCHARGE, CUSTOMS_RELEASE, DELIVERED
  label: string;
  leg: Leg;
  location: string;
  timestamp: string | null; // ISO; null = not reached yet
  actual: boolean; // true = happened, false = estimated
}

export interface GeoPoint {
  name: string;
  port: string;
  lat: number;
  lng: number;
}

export interface Sku {
  sku: string;
  description: string;
  qty: number;
  // Present when the line came from the daily report.
  agl?: string; // internal AGL product code
  brand?: string;
  model?: string; // report Model column (sku often mirrors this)
  unitPrice?: number;
  lineTotal?: number;
  salesRep?: string; // owning salesperson — drives the sales-team view
}

export interface Shipment {
  id: string;
  reference: string; // internal Ayonz reference
  containerNo?: string;
  blNo?: string;
  bookingNo?: string;
  carrier: string;
  vessel?: string;

  origin: GeoPoint;
  destination: GeoPoint;
  currentPosition?: {
    lat: number;
    lng: number;
    asOf: string;
    /** Present when the point came from AISStream (or was marked as estimate). */
    source?: "ais" | "estimate";
  };
  routePath: { lat: number; lng: number }[];

  etaOriginal: string; // ISO date
  etaCurrent: string; // ISO date

  // --- commercial join: the part no off-the-shelf tool gives you ---
  po?: string; // optional: the daily report has no PO
  brand: string; // single brand, or "Mixed" for a multi-brand container
  skus: Sku[];
  retailer?: string; // optional until an order is linked
  retailerDeadline?: string; // e.g. Coles Best Buys on-shelf date (ISO)
  landedCostAud?: number; // AUD landed cost (commercial/linked shipments)
  fobValueUsd?: number; // USD FOB order value straight off the daily report

  // --- from the daily shipping report ---
  agent?: string;
  liner?: string; // liner code as reported (ANL, MSC, MSK…)
  voyage?: string;
  salesReps?: string[]; // distinct reps with a line on this container
  etdStatus?: string; // ARRIVED | ON WATER | …
  source?: "feed" | "report" | "manual";

  milestones: Milestone[];
}

// Fields computed server-side so the UI just renders.
export interface ShipmentDerived extends Shipment {
  status: ShipmentStatus;
  currentLeg: Leg;
  etaSlipDays: number; // etaCurrent - etaOriginal, in days
  deadlineRisk: {
    hasDeadline: boolean;
    breached: boolean;
    daysVsDeadline: number; // negative = late against the on-shelf date
  };
}
