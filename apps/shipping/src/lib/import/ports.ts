import type { GeoPoint } from "../types";
import portData from "./ports.data.json";

// Port coordinates and spelling aliases live in ports.data.json so they can be
// maintained with the `lanes:add-port` script (and by the assigned maintainer)
// without editing this file. Keys are UPPERCASE canonical port names.
const PORT_COORDS: Record<string, { port: string; lat: number; lng: number }> =
  portData.coords;

// Typos and variant spellings seen in the reports -> a canonical key above.
const PORT_ALIASES: Record<string, string> = portData.aliases;

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

// Canonical lookup key: upper-case, strip diacritics (Małaszewicze) and trailing
// punctuation ("Civitavecchia,"), collapse whitespace, and fold known aliases.
// Used for both coordinate lookup and sea-lane keys so they always agree.
export function canonicalPortKey(raw: string): string {
  let key = String(raw || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining accents
    .replace(/ł/gi, "l") // Polish ł -> l
    .toUpperCase()
    .replace(/[.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  key = PORT_ALIASES[key] ?? key;
  return key;
}

// Returns a GeoPoint. If the port is unknown, coords are 0,0 and the caller is
// warned — the shipment still imports, the map just can't place it yet.
export function lookupPort(raw: string): { point: GeoPoint; known: boolean } {
  const key = canonicalPortKey(raw);
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
