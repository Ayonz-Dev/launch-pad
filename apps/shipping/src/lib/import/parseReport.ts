import type { Shipment, Sku } from "../types";
import { milestonesFromStatus, positionFromStatus } from "../milestones";
import {
  linerToCarrier,
  lookupPort,
  normalisePortName,
  normaliseSalesRep,
} from "./ports";

export interface ParseResult {
  shipments: Shipment[];
  warnings: string[];
  stats: {
    lineItems: number;
    shipments: number;
    arrived: number;
    onWater: number;
    planned: number;
    unknownPorts: string[];
    salesReps: string[];
  };
}

// Header label (normalised) -> our field key. The report's exact headers, plus
// tolerant variants so a renamed/reordered column still maps.
const HEADER_MAP: Record<string, string> = {
  agl: "agl",
  description: "description",
  brand: "brand",
  model: "model",
  qty: "qty",
  price: "price",
  total: "total",
  "port of load": "pol",
  etd: "etd",
  "via hk/sin": "via",
  "etd status": "status",
  "port of destination": "pod",
  eta: "eta",
  vessal: "vessel",
  vessel: "vessel",
  agent: "agent",
  "container no": "container",
  "container no.": "container",
  liner: "liner",
  sales: "sales",
};

function normHeader(v: unknown): string {
  return String(v ?? "").trim().toLowerCase().replace(/\.+$/, "");
}

// Excel serials, JS Dates, and date strings all -> ISO yyyy-mm-dd (or null).
function toISODate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number" && v > 0) {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[, ]/g, ""));
  return isNaN(n) ? undefined : n;
}

// "CSL SOPHIE\tTLO2INANL" -> { vessel: "CSL SOPHIE", voyage: "TLO2INANL" }
function splitVessel(raw: unknown): { vessel: string; voyage?: string } {
  const s = String(raw ?? "").trim();
  if (!s) return { vessel: "" };
  const parts = s.split(/\t|\s{2,}|\s\/\s/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { vessel: parts[0], voyage: parts.slice(1).join(" ") };
  return { vessel: s };
}

interface Grouped {
  container: string;
  etd: string | null;
  eta: string | null;
  via: string | null;
  pol: string;
  pod: string;
  vessel: string;
  voyage?: string;
  agent: string;
  liner: string;
  status: string;
  skus: Sku[];
  reps: Set<string>;
  brands: Set<string>;
  value: number;
}

export function parseReport(rows: unknown[][], reportDateISO?: string): ParseResult {
  const warnings: string[] = [];

  // 1. Find the header row within the first 10 rows.
  let headerRow = -1;
  let colIndex: Record<string, number> = {};
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const idx: Record<string, number> = {};
    (rows[r] || []).forEach((cell, c) => {
      const key = HEADER_MAP[normHeader(cell)];
      if (key && !(key in idx)) idx[key] = c;
    });
    if ("container" in idx && "eta" in idx && "qty" in idx) {
      headerRow = r;
      colIndex = idx;
      break;
    }
  }
  if (headerRow === -1) {
    return {
      shipments: [],
      warnings: [
        "Couldn't find the header row. Expected columns like 'Container No.', 'ETA', 'QTY'. Is this the daily Australia report?",
      ],
      stats: { lineItems: 0, shipments: 0, arrived: 0, onWater: 0, planned: 0, unknownPorts: [], salesReps: [] },
    };
  }

  const get = (row: unknown[], key: string): unknown =>
    key in colIndex ? row[colIndex[key]] : undefined;

  // 2. Group data rows by container + ETD (containers get reused over time).
  const groups = new Map<string, Grouped>();
  const unknownPorts = new Set<string>();
  const allReps = new Set<string>();
  let lineItems = 0;

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const agl = String(get(row, "agl") ?? "").trim();
    const container = String(get(row, "container") ?? "").trim();
    if (!agl && !container) continue; // skip blank rows
    if (!container) {
      warnings.push(`Row ${r + 1}: line "${agl}" has no container number — skipped.`);
      continue;
    }

    const etd = toISODate(get(row, "etd"));
    const key = `${container}::${etd ?? "na"}`;

    if (!groups.has(key)) {
      const { vessel, voyage } = splitVessel(get(row, "vessel"));
      const pol = normalisePortName(String(get(row, "pol") ?? ""));
      const pod = normalisePortName(String(get(row, "pod") ?? ""));
      if (pol && !lookupPort(pol).known) unknownPorts.add(pol);
      if (pod && !lookupPort(pod).known) unknownPorts.add(pod);
      groups.set(key, {
        container,
        etd,
        eta: toISODate(get(row, "eta")),
        via: toISODate(get(row, "via")),
        pol,
        pod,
        vessel,
        voyage,
        agent: String(get(row, "agent") ?? "").trim(),
        liner: String(get(row, "liner") ?? "").trim(),
        status: String(get(row, "status") ?? "").trim(),
        skus: [],
        reps: new Set(),
        brands: new Set(),
        value: 0,
      });
    }

    const g = groups.get(key)!;
    const qty = num(get(row, "qty")) ?? 0;
    const unitPrice = num(get(row, "price"));
    const lineTotal = num(get(row, "total"));
    const brand = String(get(row, "brand") ?? "").trim();
    const rep = normaliseSalesRep(get(row, "sales"));

    const model = String(get(row, "model") ?? "").trim();
    g.skus.push({
      sku: model || agl,
      description: String(get(row, "description") ?? "").trim(),
      qty,
      agl: agl || undefined,
      brand: brand || undefined,
      model: model || undefined,
      unitPrice,
      lineTotal,
      salesRep: rep ?? undefined,
    });
    if (brand) g.brands.add(brand);
    if (rep) {
      g.reps.add(rep);
      allReps.add(rep);
    }
    g.value += lineTotal ?? 0;
    lineItems++;
  }

  // 3. Build shipments.
  const shipments: Shipment[] = [];
  let arrived = 0;
  let onWater = 0;
  let planned = 0;

  for (const g of groups.values()) {
    const origin = lookupPort(g.pol).point;
    const destination = lookupPort(g.pod).point;
    const statusU = g.status.toUpperCase();
    if (statusU === "ARRIVED") arrived++;
    else if (statusU === "ON WATER") onWater++;
    else planned++;

    // Rough current position for the map (no feed yet). Straight-line route
    // until the real track lands.
    const routePath =
      origin.lat || destination.lat
        ? [
            { lat: origin.lat, lng: origin.lng },
            { lat: destination.lat, lng: destination.lng },
          ]
        : [];
    const currentPosition = positionFromStatus(
      g.status,
      origin,
      destination,
      reportDateISO ?? g.eta ?? ""
    );

    const brands = [...g.brands];
    const eta = g.eta ?? g.etd ?? reportDateISO ?? new Date().toISOString().slice(0, 10);

    shipments.push({
      id: `IMP-${g.container}-${(g.etd ?? "na").replace(/-/g, "")}`,
      reference: g.container,
      containerNo: g.container,
      carrier: linerToCarrier(g.liner),
      vessel: g.vessel || undefined,
      voyage: g.voyage,
      origin,
      destination,
      currentPosition,
      routePath,
      etaOriginal: eta,
      etaCurrent: eta,
      brand: brands.length === 1 ? brands[0] : brands.length ? "Mixed" : "—",
      skus: g.skus,
      fobValueUsd: g.value || undefined,
      agent: g.agent || undefined,
      liner: g.liner || undefined,
      salesReps: [...g.reps].sort(),
      etdStatus: g.status || undefined,
      source: "report",
      milestones: milestonesFromStatus({
        status: g.status,
        etd: g.etd,
        via: g.via,
        eta: g.eta,
        polName: origin.name,
        podName: destination.name,
      }),
    });
  }

  if (unknownPorts.size) {
    warnings.push(
      `Unmapped ports (imported without map coordinates): ${[...unknownPorts].join(", ")}. Add them in lib/import/ports.ts.`
    );
  }

  shipments.sort((a, b) => a.etaCurrent.localeCompare(b.etaCurrent));

  return {
    shipments,
    warnings,
    stats: {
      lineItems,
      shipments: shipments.length,
      arrived,
      onWater,
      planned,
      unknownPorts: [...unknownPorts],
      salesReps: [...allReps].sort(),
    },
  };
}
