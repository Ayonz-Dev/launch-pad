import type { GeoPoint } from "../types";

// Ports seen in the Australia daily report (origin + destination), with a few
// common extras. Keys are UPPERCASE and trimmed; look-ups normalise first.
const PORT_COORDS: Record<string, { port: string; lat: number; lng: number }> = {
  // China / HK / Singapore origins
  YANTIAN: { port: "CNYTN", lat: 22.59, lng: 114.27 },
  SHEKOU: { port: "CNSHK", lat: 22.48, lng: 113.9 },
  NINGBO: { port: "CNNGB", lat: 29.87, lng: 121.54 },
  XIAMEN: { port: "CNXMN", lat: 24.45, lng: 118.08 },
  SHANGHAI: { port: "CNSHA", lat: 31.23, lng: 121.47 },
  NANSHA: { port: "CNNSA", lat: 22.77, lng: 113.6 },
  NANJING: { port: "CNNKG", lat: 32.09, lng: 118.74 },
  ZHANGJIAGANG: { port: "CNZJG", lat: 31.94, lng: 120.42 },
  SHENZHEN: { port: "CNSZX", lat: 22.49, lng: 113.88 },
  // Pearl River delta river ports (reach the sea via the estuary)
  ZHONGSHAN: { port: "CNZSN", lat: 22.52, lng: 113.39 },
  BEIJIAO: { port: "CNBJO", lat: 22.92, lng: 113.16 },
  SHUNDE: { port: "CNSDE", lat: 22.84, lng: 113.24 },
  XIAOLAN: { port: "CNXLN", lat: 22.66, lng: 113.24 },
  JIANGMEN: { port: "CNJMN", lat: 22.58, lng: 113.08 },
  GUANGZHOU: { port: "CNGZH", lat: 23.1, lng: 113.25 },
  HONGKONG: { port: "HKHKG", lat: 22.3, lng: 114.17 },
  SINGAPORE: { port: "SGSIN", lat: 1.26, lng: 103.83 },
  NAGOYA: { port: "JPNGO", lat: 35.05, lng: 136.87 },
  // China inland rail origins (China-Europe rail; overland, not sea)
  CHENGDU: { port: "CNCTU", lat: 30.57, lng: 104.07 },
  WUHAN: { port: "CNWUH", lat: 30.59, lng: 114.3 },
  XIAN: { port: "CNSIA", lat: 34.34, lng: 108.94 },
  ZHENGZHOU: { port: "CNCGO", lat: 34.75, lng: 113.62 },
  CHANGSHA: { port: "CNCSX", lat: 28.23, lng: 112.94 },
  // Australia destinations
  SYDNEY: { port: "AUSYD", lat: -33.97, lng: 151.23 },
  MELBOURNE: { port: "AUMEL", lat: -37.83, lng: 144.92 },
  BRISBANE: { port: "AUBNE", lat: -27.38, lng: 153.17 },
  FREMANTLE: { port: "AUFRE", lat: -32.05, lng: 115.74 },
  ADELAIDE: { port: "AUADL", lat: -34.78, lng: 138.48 },
  AUCKLAND: { port: "NZAKL", lat: -36.84, lng: 174.77 },
  // Europe / UK sea destinations
  GDANSK: { port: "PLGDN", lat: 54.4, lng: 18.66 },
  FELIXSTOWE: { port: "GBFXT", lat: 51.95, lng: 1.32 },
  SOUTHAMPTON: { port: "GBSOU", lat: 50.9, lng: -1.4 },
  "LONDON GATEWAY": { port: "GBLGP", lat: 51.51, lng: 0.43 },
  ROTTERDAM: { port: "NLRTM", lat: 51.95, lng: 4.14 },
  "LA SPEZIA": { port: "ITSPE", lat: 44.1, lng: 9.83 },
  VENICE: { port: "ITVCE", lat: 45.44, lng: 12.29 },
  NAPOLI: { port: "ITNAP", lat: 40.84, lng: 14.25 },
  TRIESTE: { port: "ITTRS", lat: 45.65, lng: 13.76 },
  CIVITAVECCHIA: { port: "ITCVV", lat: 42.09, lng: 11.79 },
  "GIOIA TAURO": { port: "ITGIT", lat: 38.43, lng: 15.9 },
  AUGUSTA: { port: "ITAUG", lat: 37.23, lng: 15.22 },
  // Europe inland rail nodes (overland, not sea)
  MALASZEWICZE: { port: "PLMAL", lat: 52.03, lng: 23.55 },
  WARSAW: { port: "PLWAW", lat: 52.23, lng: 21.01 },
  BYDGOSZCZ: { port: "PLBZG", lat: 53.12, lng: 18.01 },
  MILAN: { port: "ITMIL", lat: 45.46, lng: 9.19 },
  // Americas
  ACAJUTLA: { port: "SVAQJ", lat: 13.59, lng: -89.83 },
  "BUENOS AIRES": { port: "ARBUE", lat: -34.6, lng: -58.37 },
};

// Typos and variant spellings seen in the reports -> a canonical key above.
const PORT_ALIASES: Record<string, string> = {
  "HONG KONG": "HONGKONG",
  YANTAN: "YANTIAN",
  GUANZHOU: "GUANGZHOU",
  "AUGUSTA PORT OF CATANIA": "AUGUSTA",
  "ACAJUTLA EL SALVADOR": "ACAJUTLA",
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
