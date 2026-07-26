import type {
  CellComment,
  LineNote,
  Shipment,
  ShipmentNotes,
  Sku,
} from "../types";
import type { GeoPoint } from "../types";
import { milestonesFromStatus } from "../milestones";
import {
  canonicalPortKey,
  linerToCarrier,
  lookupPort,
  normalisePortName,
  normaliseSalesRep,
} from "./ports";
import { SEA_LANES } from "./lanes";
import { matchRetailer } from "./retailers";

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

/** A cell comment as surfaced by the spreadsheet reader. */
export interface CommentRef {
  text: string;
  author?: string;
}

/** Look up a comment on a cell, by 0-based sheet row and column. */
export type CommentLookup = (row: number, col: number) => CommentRef | undefined;

// Header label (normalised) -> our field key. Covers both report variants: the
// Australia file (with a retailer/notes column and price/total) and the
// outside-AU workbook (per-country sheets with CBM, forwarder, sailing days,
// train/air transport and no retailer column). Tolerant of the truncated and
// suffixed headers the source sheets carry.
const HEADER_MAP: Record<string, string> = {
  agl: "agl",
  "agl no": "agl",
  "invoice no": "agl", // Poland "Factory Need" sheet keys by invoice, no AGL
  description: "description",
  brand: "brand",
  model: "model",
  qty: "qty",
  "spare part": "sparePart",
  spare: "sparePart",
  "spare unit": "spareUnit",
  carton: "cartons",
  packages: "cartons",
  price: "price",
  total: "total",
  "port of load": "pol",
  etd: "etd",
  "via hk/sin": "via",
  "via hk/sg": "via",
  "via t/s etd": "via",
  "etd status": "status",
  "etd statu": "status",
  "shipping status": "status",
  "port of destination": "pod",
  "port of destinatio": "pod",
  eta: "eta",
  vessal: "vessel",
  vessel: "vessel",
  "vessel/train/air": "vessel",
  transport: "transport",
  agent: "agent",
  "container no": "container",
  "container qty": "containerQty",
  "20'": "size20",
  "40'": "size40",
  liner: "liner",
  sales: "sales",
  cbm: "cbm",
  ratio: "ratio",
  forwarder: "forwarder",
  "total sailing days": "sailingDays",
  barcode: "barcode",
  warehouse: "warehouse",
  "aol po": "aolPo",
  "import clearance and delivery plan party": "deliveryParty",
};

// Field keys that describe a line item; everything else is shipment-level.
const LINE_FIELDS = new Set([
  "agl",
  "description",
  "brand",
  "model",
  "qty",
  "sparePart",
  "spareUnit",
  "cartons",
  "price",
  "total",
  "cbm",
  "ratio",
  "barcode",
  "warehouse",
  "aolPo",
  "sales",
]);

function normHeader(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ") // drop "(yyyy-mm-dd)" and similar suffixes
    .replace(/[\n\r\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, ""); // strip trailing dots ("Container No." -> "container no")
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

function str(v: unknown): string {
  return String(v ?? "").trim();
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
  transport: string;
  agent: string;
  liner: string;
  status: string;
  skus: Sku[];
  reps: Set<string>;
  brands: Set<string>;
  agls: Set<string>;
  value: number;
  retailer: string | null;
  comments: CellComment[];
  commentKeys: Set<string>; // de-dupe identical comments within a group
  lineNotes: LineNote[];
  extras: Record<string, string>; // shipment-level unmapped columns
}

export function parseReport(
  rows: unknown[][],
  reportDateISO?: string,
  commentAt?: CommentLookup,
): ParseResult {
  const warnings: string[] = [];

  // 1. Find the header row within the first 10 rows. AGL is present on every
  // variant, so a header needs an ETA plus either a container or an AGL column.
  let headerRow = -1;
  let colIndex: Record<string, number> = {};
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const idx: Record<string, number> = {};
    (rows[r] || []).forEach((cell, c) => {
      const key = HEADER_MAP[normHeader(cell)];
      if (key && !(key in idx)) idx[key] = c;
    });
    if ("eta" in idx && ("container" in idx || "agl" in idx)) {
      headerRow = r;
      colIndex = idx;
      break;
    }
  }
  if (headerRow === -1) {
    return {
      shipments: [],
      warnings: [
        "Couldn't find the header row. Expected columns like 'AGL', 'ETA', 'Container No.'. Is this a shipment report?",
      ],
      stats: { lineItems: 0, shipments: 0, arrived: 0, onWater: 0, planned: 0, unknownPorts: [], salesReps: [] },
    };
  }

  const get = (row: unknown[], key: string): unknown =>
    key in colIndex ? row[colIndex[key]] : undefined;

  // Columns we did not map to a field. Named ones become per-line extras; the
  // unnamed one (next to Sales on the Australia sheet) carries retailer/notes.
  const mappedCols = new Set(Object.values(colIndex));
  const headerCells = rows[headerRow] || [];
  let maxCol = headerCells.length - 1;
  for (let r = headerRow + 1; r < rows.length; r++) {
    maxCol = Math.max(maxCol, (rows[r] || []).length - 1);
  }
  const extraCols: { c: number; label: string }[] = [];
  for (let c = 0; c <= maxCol; c++) {
    if (mappedCols.has(c)) continue;
    extraCols.push({ c, label: str(headerCells[c]) });
  }

  // Field key sitting on a given column (for categorising comments).
  const fieldByCol = new Map<number, string>();
  for (const [field, c] of Object.entries(colIndex)) fieldByCol.set(c, field);

  // 2. Group data rows by container + ETD (containers get reused over time). A
  // row without a container but with an AGL still tracks under the AGL.
  const groups = new Map<string, Grouped>();
  const unknownPorts = new Set<string>();
  const allReps = new Set<string>();
  let lineItems = 0;

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const agl = str(get(row, "agl"));
    const container = str(get(row, "container"));
    if (!agl && !container) continue; // skip blank rows

    const etd = toISODate(get(row, "etd"));
    // Key on container when present; fall back to the AGL so container-less legs
    // still land somewhere rather than being dropped.
    const key = container ? `${container}::${etd ?? "na"}` : `AGL:${agl}::${etd ?? "na"}`;

    if (!groups.has(key)) {
      const { vessel, voyage } = splitVessel(get(row, "vessel"));
      const pol = normalisePortName(str(get(row, "pol")));
      const pod = normalisePortName(str(get(row, "pod")));
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
        transport: str(get(row, "transport")),
        agent: str(get(row, "agent")),
        liner: str(get(row, "liner")),
        status: str(get(row, "status")),
        skus: [],
        reps: new Set(),
        brands: new Set(),
        agls: new Set(),
        value: 0,
        retailer: null,
        comments: [],
        commentKeys: new Set(),
        lineNotes: [],
        extras: {},
      });
    }

    const g = groups.get(key)!;
    const qty = num(get(row, "qty")) ?? 0;
    const unitPrice = num(get(row, "price"));
    let lineTotal = num(get(row, "total"));
    if (lineTotal == null && unitPrice != null && qty) lineTotal = unitPrice * qty;
    const brand = str(get(row, "brand"));
    const rep = normaliseSalesRep(get(row, "sales"));
    const model = str(get(row, "model"));

    // Named extra columns not mapped to a field -> per-line extras.
    let lineExtras: Record<string, string> | undefined;
    for (const { c, label } of extraCols) {
      const val = str(row[c]);
      if (!val) continue;
      if (label) {
        (lineExtras ??= {})[label] = val;
      } else {
        // Unnamed column: a retailer, or a free-text note.
        const retailer = matchRetailer(val);
        if (retailer) {
          g.retailer = g.retailer ?? retailer;
        } else {
          g.lineNotes.push({ text: val, agl: agl || undefined, model: model || undefined });
        }
      }
    }

    const sku: Sku = {
      sku: model || agl,
      description: str(get(row, "description")),
      qty,
      agl: agl || undefined,
      brand: brand || undefined,
      model: model || undefined,
      unitPrice,
      lineTotal,
      salesRep: rep ?? undefined,
      sparePart: str(get(row, "sparePart")) || undefined,
      spareUnit: num(get(row, "spareUnit")),
      cartons: num(get(row, "cartons")),
      cbm: num(get(row, "cbm")),
      ratio: num(get(row, "ratio")),
      barcode: str(get(row, "barcode")) || undefined,
      warehouse: str(get(row, "warehouse")) || undefined,
      aolPo: str(get(row, "aolPo")) || undefined,
      extras: lineExtras,
    };
    g.skus.push(sku);

    if (brand) g.brands.add(brand);
    if (agl) g.agls.add(agl);
    if (rep) {
      g.reps.add(rep);
      allReps.add(rep);
    }
    g.value += lineTotal ?? 0;

    // Shipment-level extras: forwarder, delivery party, sailing days. Take the
    // first non-empty across the group's rows.
    for (const field of ["forwarder", "sailingDays", "deliveryParty"] as const) {
      const val = str(get(row, field));
      if (val && !g.extras[field]) g.extras[field] = val;
    }
    if (!g.transport) g.transport = str(get(row, "transport"));

    // Cell comments on this row, categorised by the column's field.
    if (commentAt) {
      for (let c = 0; c <= maxCol; c++) {
        const cm = commentAt(r, c);
        if (!cm) continue;
        const text = cleanComment(cm.text);
        if (!text) continue;
        const field = fieldByCol.get(c) ?? str(headerCells[c]) ?? `col${c}`;
        const dedupe = `${field}::${text}`;
        if (g.commentKeys.has(dedupe)) continue;
        g.commentKeys.add(dedupe);
        g.comments.push({
          field,
          text,
          author: cm.author,
          agl: agl || undefined,
          model: model || undefined,
        });
      }
    }

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

    const routePath = buildRoutePath(g.pol, g.pod, g.transport, origin, destination);
    // Place the current-position dot on the actual lane, not a straight midpoint,
    // so an on-water shipment reads as being at sea rather than over land.
    const currentPosition = positionOnPath(
      routePath,
      g.status,
      reportDateISO ?? g.eta ?? "",
    );

    const brands = [...g.brands];
    const eta = g.eta ?? g.etd ?? reportDateISO ?? new Date().toISOString().slice(0, 10);
    const agls = [...g.agls].sort();
    const etaNote = g.comments.find((c) => c.field === "eta")?.text;

    const notes: ShipmentNotes = {};
    if (g.comments.length) notes.comments = g.comments;
    if (g.lineNotes.length) notes.lineNotes = g.lineNotes;
    if (Object.keys(g.extras).length) notes.extras = g.extras;

    const idBase = g.container || (agls[0] ? `AGL-${agls[0]}` : "NA");
    shipments.push({
      id: `IMP-${idBase}-${(g.etd ?? "na").replace(/-/g, "")}`,
      reference: g.container || agls[0] || idBase,
      containerNo: g.container || undefined,
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
      retailer: g.retailer ?? undefined,
      fobValueUsd: g.value || undefined,
      agent: g.agent || undefined,
      liner: g.liner || undefined,
      salesReps: [...g.reps].sort(),
      etdStatus: g.status || undefined,
      source: "report",
      agls: agls.length ? agls : undefined,
      transport: g.transport || undefined,
      etaNote,
      notes: Object.keys(notes).length ? notes : undefined,
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
      `Unmapped ports (imported without map coordinates): ${[...unknownPorts].join(", ")}. Add them in lib/import/ports.ts.`,
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

// Strips the Excel threaded-comment boilerplate and the "author:" prefix so the
// stored note is just the substance ("Delay 2 days", "origin ETA 15-AUG ...").
function cleanComment(raw: string): string {
  return String(raw ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("[线程批注]") && !line.startsWith("你的Excel"))
    .map((line) => line.replace(/^[A-Za-z0-9 ._-]{1,30}:\s*/, "")) // drop "admin2:" / "Flora Mai:" lead
    .filter(Boolean)
    .join(" ")
    .trim();
}

type LatLng = { lat: number; lng: number };

// The polyline the map draws for a shipment. Sea shipments follow the precomputed
// marine lane (through straits and canals, never across land); train and air
// shipments draw a straight line, which is correct for an overland or flight leg.
// Falls back to a straight origin-to-destination segment when we have no lane.
function buildRoutePath(
  pol: string,
  pod: string,
  transport: string,
  origin: GeoPoint,
  destination: GeoPoint,
): LatLng[] {
  const straight: LatLng[] =
    origin.lat || destination.lat
      ? [
          { lat: origin.lat, lng: origin.lng },
          { lat: destination.lat, lng: destination.lng },
        ]
      : [];
  const mode = transport.toUpperCase();
  if (mode === "TRAIN" || mode === "AIR") return straight;
  const lane = SEA_LANES[`${canonicalPortKey(pol)}__${canonicalPortKey(pod)}`];
  if (lane && lane.length >= 2) return lane.map(([lat, lng]) => ({ lat, lng }));
  return straight;
}

// The current-position dot, placed on the lane itself. Arrived sits at the
// destination; on water sits halfway along the route by distance; anything else
// has not sailed yet, so no dot.
function positionOnPath(
  path: LatLng[],
  status: string,
  asOf: string,
): { lat: number; lng: number; asOf: string } | undefined {
  if (path.length < 2) return undefined;
  const s = status.toUpperCase();
  if (s === "ARRIVED") {
    const end = path[path.length - 1];
    return { lat: end.lat, lng: end.lng, asOf };
  }
  if (s === "ON WATER") {
    const mid = pointAlong(path, 0.5);
    return { lat: mid.lat, lng: mid.lng, asOf };
  }
  return undefined;
}

// Point at `frac` (0..1) of the polyline's length, linearly interpolated.
function pointAlong(path: LatLng[], frac: number): LatLng {
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = Math.hypot(path[i].lat - path[i - 1].lat, path[i].lng - path[i - 1].lng);
    seg.push(d);
    total += d;
  }
  if (total === 0) return path[0];
  let target = frac * total;
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i]) {
      const t = seg[i] === 0 ? 0 : target / seg[i];
      return {
        lat: path[i].lat + (path[i + 1].lat - path[i].lat) * t,
        lng: path[i].lng + (path[i + 1].lng - path[i].lng) * t,
      };
    }
    target -= seg[i];
  }
  return path[path.length - 1];
}

// Merge several per-sheet parse results into one, de-duplicating shipments by id
// (a workbook can describe the same container on more than one sheet, e.g. the
// Australia "with price" and plain sheets). Scalar fields prefer the first
// non-empty value; SKUs merge by AGL+model; notes and AGLs are unioned.
export function mergeParseResults(results: ParseResult[]): ParseResult {
  const byId = new Map<string, Shipment>();
  const warnings = new Set<string>();
  const unknownPorts = new Set<string>();
  const salesReps = new Set<string>();
  let lineItems = 0;

  for (const res of results) {
    res.warnings.forEach((w) => warnings.add(w));
    res.stats.unknownPorts.forEach((p) => unknownPorts.add(p));
    res.stats.salesReps.forEach((s) => salesReps.add(s));
    lineItems += res.stats.lineItems;
    for (const s of res.shipments) {
      const existing = byId.get(s.id);
      byId.set(s.id, existing ? mergeShipment(existing, s) : s);
    }
  }

  const shipments = [...byId.values()].sort((a, b) => a.etaCurrent.localeCompare(b.etaCurrent));
  let arrived = 0;
  let onWater = 0;
  let planned = 0;
  for (const s of shipments) {
    const u = (s.etdStatus ?? "").toUpperCase();
    if (u === "ARRIVED") arrived++;
    else if (u === "ON WATER") onWater++;
    else planned++;
  }

  return {
    shipments,
    warnings: [...warnings],
    stats: {
      lineItems,
      shipments: shipments.length,
      arrived,
      onWater,
      planned,
      unknownPorts: [...unknownPorts],
      salesReps: [...salesReps].sort(),
    },
  };
}

function skuKey(line: Sku): string {
  return `${(line.agl ?? "").toUpperCase()}|${(line.model ?? line.sku ?? "").toUpperCase()}`;
}

function mergeShipment(a: Shipment, b: Shipment): Shipment {
  const pick = <K extends keyof Shipment>(k: K): Shipment[K] =>
    (a[k] ?? b[k]) as Shipment[K];

  // SKUs: fill missing fields from the other sheet's matching line.
  const skus = new Map<string, Sku>();
  for (const line of [...a.skus, ...b.skus]) {
    const key = skuKey(line);
    const existing = skus.get(key);
    skus.set(key, existing ? mergeSku(existing, line) : { ...line });
  }
  const mergedSkus = [...skus.values()];

  const agls = [...new Set([...(a.agls ?? []), ...(b.agls ?? [])])].sort();
  const salesReps = [...new Set([...(a.salesReps ?? []), ...(b.salesReps ?? [])])].sort();
  const value = mergedSkus.reduce((sum, l) => sum + (l.lineTotal ?? 0), 0);

  return {
    ...a,
    vessel: pick("vessel"),
    voyage: pick("voyage"),
    agent: pick("agent"),
    liner: pick("liner"),
    retailer: pick("retailer"),
    transport: pick("transport"),
    etaNote: a.etaNote ?? b.etaNote,
    brand: a.brand && a.brand !== "—" ? a.brand : b.brand,
    skus: mergedSkus,
    agls: agls.length ? agls : undefined,
    salesReps,
    fobValueUsd: value || a.fobValueUsd || b.fobValueUsd,
    notes: mergeNotes(a.notes, b.notes),
  };
}

function mergeSku(a: Sku, b: Sku): Sku {
  return {
    ...b,
    ...a,
    qty: a.qty || b.qty,
    unitPrice: a.unitPrice ?? b.unitPrice,
    lineTotal: a.lineTotal ?? b.lineTotal,
    sparePart: a.sparePart ?? b.sparePart,
    spareUnit: a.spareUnit ?? b.spareUnit,
    cartons: a.cartons ?? b.cartons,
    cbm: a.cbm ?? b.cbm,
    ratio: a.ratio ?? b.ratio,
    barcode: a.barcode ?? b.barcode,
    warehouse: a.warehouse ?? b.warehouse,
    aolPo: a.aolPo ?? b.aolPo,
    extras: { ...(b.extras ?? {}), ...(a.extras ?? {}) },
  };
}

function mergeNotes(a?: ShipmentNotes, b?: ShipmentNotes): ShipmentNotes | undefined {
  if (!a) return b;
  if (!b) return a;
  const seen = new Set<string>();
  const comments: CellComment[] = [];
  for (const c of [...(a.comments ?? []), ...(b.comments ?? [])]) {
    const k = `${c.field}::${c.text}`;
    if (seen.has(k)) continue;
    seen.add(k);
    comments.push(c);
  }
  const lineNotes = [...(a.lineNotes ?? []), ...(b.lineNotes ?? [])];
  const extras = { ...(b.extras ?? {}), ...(a.extras ?? {}) };
  const out: ShipmentNotes = {};
  if (comments.length) out.comments = comments;
  if (lineNotes.length) out.lineNotes = lineNotes;
  if (Object.keys(extras).length) out.extras = extras;
  return Object.keys(out).length ? out : undefined;
}
