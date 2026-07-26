import type { GeoPoint } from "../types";

// Ports seen in the Australia daily report (origin + destination), with a few
// common extras. Keys are UPPERCASE and trimmed; look-ups normalise first.
const PORT_COORDS: Record<string, { port: string; lat: number; lng: number }> = {
  YANTIAN: { port: "CNYTN", lat: 22.59, lng: 114.27 },
  SHEKOU: { port: "CNSHK", lat: 22.48, lng: 113.9 },
  NINGBO: { port: "CNNGB", lat: 29.87, lng: 121.54 },
  XIAMEN: { port: "CNXMN", lat: 24.45, lng: 118.08 },
  SHANGHAI: { port: "CNSHA", lat: 31.23, lng: 121.47 },
  NANSHA: { port: "CNNSA", lat: 22.77, lng: 113.6 },
  NANJING: { port: "CNNKG", lat: 32.09, lng: 118.74 },
  HONGKONG: { port: "HKHKG", lat: 22.3, lng: 114.17 },
  "HONG KONG": { port: "HKHKG", lat: 22.3, lng: 114.17 },
  SINGAPORE: { port: "SGSIN", lat: 1.26, lng: 103.83 },
  SYDNEY: { port: "AUSYD", lat: -33.97, lng: 151.23 },
  MELBOURNE: { port: "AUMEL", lat: -37.83, lng: 144.92 },
  BRISBANE: { port: "AUBNE", lat: -27.38, lng: 153.17 },
  FREMANTLE: { port: "AUFRE", lat: -32.05, lng: 115.74 },
  ADELAIDE: { port: "AUADL", lat: -34.78, lng: 138.48 },
};

// Liner codes in the report -> readable carrier name.
const LINER_CARRIER: Record<string, string> = {
  ANL: "ANL",
  MSC: "MSC",
  MSK: "Maersk",
  MAERSK: "Maersk",
  OOCL: "OOCL",
  HMM: "HMM",
  TSL: "T.S. Lines",
  EMC: "Evergreen",
  COSCO: "COSCO",
  ONE: "ONE",
  PIL: "PIL",
  SNL: "Sinokor",
  CMA: "CMA CGM",
  HLC: "Hapag-Lloyd",
};

export function normalisePortName(raw: string): string {
  return String(raw || "").trim().toUpperCase();
}

// Returns a GeoPoint. If the port is unknown, coords are 0,0 and the caller is
// warned — the shipment still imports, the map just can't place it yet.
export function lookupPort(raw: string): { point: GeoPoint; known: boolean } {
  const key = normalisePortName(raw);
  const hit = PORT_COORDS[key];
  const nameCased = key
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  if (!hit) {
    return {
      point: { name: nameCased || "Unknown", port: "", lat: 0, lng: 0 },
      known: false,
    };
  }
  return {
    point: { name: nameCased, port: hit.port, lat: hit.lat, lng: hit.lng },
    known: true,
  };
}

export function linerToCarrier(raw?: string): string {
  const key = String(raw || "").trim().toUpperCase();
  return LINER_CARRIER[key] ?? (key || "Unknown");
}

// Trim + Title-case sales reps so 'carlo', 'Carlo', 'George ' collapse to one.
export function normaliseSalesRep(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
