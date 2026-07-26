import type { Shipment, ShipmentDerived, Sku } from "./types";
import { derive } from "./exceptions";
import { MOCK_SHIPMENTS } from "./mockData";
import { getSupabaseServer, requireVisibilityOrganizationId } from "./supabase";

function dataSource(): string {
  return process.env.DATA_SOURCE ?? "mock";
}

function dbSchema(): string {
  return process.env.SUPABASE_DB_SCHEMA?.trim() || "public";
}

// Maps a visibility.shipments row into the domain Shipment.
export function rowToShipment(row: any): Shipment {
  return {
    id: row.id,
    reference: row.reference,
    containerNo: row.container_no ?? undefined,
    blNo: row.bl_no ?? undefined,
    bookingNo: row.booking_no ?? undefined,
    carrier: row.carrier,
    vessel: row.vessel ?? undefined,
    origin: row.origin,
    destination: row.destination,
    currentPosition: row.current_position ?? undefined,
    routePath: row.route_path ?? [],
    etaOriginal: row.eta_original,
    etaCurrent: row.eta_current,
    po: row.po,
    brand: row.brand,
    skus: row.skus ?? [],
    retailer: row.retailer ?? undefined,
    retailerDeadline: row.retailer_deadline ?? undefined,
    landedCostAud: row.landed_cost_aud ?? undefined,
    fobValueUsd: row.fob_value_usd ?? undefined,
    agent: row.agent ?? undefined,
    liner: row.liner ?? undefined,
    voyage: row.voyage ?? undefined,
    salesReps: row.sales_reps ?? undefined,
    etdStatus: row.etd_status ?? undefined,
    source: row.source ?? undefined,
    agls: row.agls ?? undefined,
    transport: row.notes?.transport ?? undefined,
    etaNote: row.notes?.etaNote ?? undefined,
    notes: stripNotesMeta(row.notes),
    milestones: row.milestones ?? [],
  };
}

// notes jsonb holds the categorised ShipmentNotes plus two convenience keys
// (transport, etaNote) that also live as their own domain fields. Split them
// back out on read so the domain object matches its type.
function stripNotesMeta(raw: any): Shipment["notes"] {
  if (!raw || typeof raw !== "object") return undefined;
  const { transport, etaNote, ...rest } = raw;
  return Object.keys(rest).length ? rest : undefined;
}

// Inverse of rowToShipment — used by the import route to upsert into Supabase.
export function shipmentToRow(
  s: Shipment,
  organizationId?: string,
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: s.id,
    reference: s.reference,
    container_no: s.containerNo ?? null,
    bl_no: s.blNo ?? null,
    booking_no: s.bookingNo ?? null,
    carrier: s.carrier,
    vessel: s.vessel ?? null,
    origin: s.origin,
    destination: s.destination,
    current_position: s.currentPosition ?? null,
    route_path: s.routePath,
    eta_original: s.etaOriginal,
    eta_current: s.etaCurrent,
    po: s.po ?? null,
    brand: s.brand,
    skus: s.skus,
    retailer: s.retailer ?? null,
    retailer_deadline: s.retailerDeadline ?? null,
    landed_cost_aud: s.landedCostAud ?? null,
    fob_value_usd: s.fobValueUsd ?? null,
    agent: s.agent ?? null,
    liner: s.liner ?? null,
    voyage: s.voyage ?? null,
    sales_reps: s.salesReps ?? [],
    etd_status: s.etdStatus ?? null,
    source: s.source ?? "manual",
    milestones: s.milestones,
  };
  if (organizationId) {
    row.organization_id = organizationId;
  }
  return row;
}

// Pack the categorised notes plus the transport/etaNote convenience keys into
// the single notes jsonb column.
function buildNotesColumn(s: Shipment): Record<string, unknown> {
  const notes: Record<string, unknown> = { ...(s.notes ?? {}) };
  if (s.transport) notes.transport = s.transport;
  if (s.etaNote) notes.etaNote = s.etaNote;
  return notes;
}

/**
 * Full upsert row. The visibility schema carries organization_id and the two
 * extra columns (agls, notes); the legacy public schema has neither, so we only
 * attach them when writing to visibility.
 */
export function shipmentToInsertRow(s: Shipment): Record<string, unknown> {
  if (dbSchema() === "visibility") {
    const row = shipmentToRow(s, requireVisibilityOrganizationId());
    row.agls = s.agls ?? [];
    row.notes = buildNotesColumn(s);
    return row;
  }
  return shipmentToRow(s);
}

export async function getShipments(): Promise<ShipmentDerived[]> {
  let shipments: Shipment[];

  if (dataSource() === "supabase") {
    const supabase = getSupabaseServer();
    let query = supabase
      .from("shipments")
      .select("*")
      .order("eta_current", { ascending: true });
    // On the org-scoped visibility schema, always constrain to our org. Requiring
    // it (rather than filtering only when present) turns a misconfigured deploy
    // into a clear error instead of silently returning every org's shipments.
    if (dbSchema() === "visibility") {
      query = query.eq("organization_id", requireVisibilityOrganizationId());
    }
    const { data, error } = await query;
    if (error) throw new Error(`Supabase read failed: ${error.message}`);
    shipments = (data ?? []).map(rowToShipment);
  } else {
    shipments = MOCK_SHIPMENTS;
  }

  // Active shipments first (by ETA); delivered sinks to the bottom of the list.
  return shipments.map(derive).sort((a, b) => {
    const aDone = a.status === "delivered" ? 1 : 0;
    const bDone = b.status === "delivered" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return a.etaCurrent.localeCompare(b.etaCurrent);
  });
}

export async function getShipment(id: string): Promise<ShipmentDerived | null> {
  const all = await getShipments();
  return all.find((s) => s.id === id) ?? null;
}

export interface ContainerTracking {
  containerNo: string;
  shipments: ShipmentDerived[];
  currentShipment: ShipmentDerived;
  skus: Array<Sku & { brands: string[] }>;
  totalUnits: number;
}

export interface SkuOccurrence {
  shipment: ShipmentDerived;
  line: Sku;
}

/** Product rollup keyed by Model (the SKUs section of the app). */
export interface SkuTracking {
  /** Model code — primary key for /skus */
  sku: string;
  model: string;
  description: string;
  brands: string[];
  agls: string[];
  occurrences: SkuOccurrence[];
  containers: string[];
  totalUnits: number;
  totalLineValue: number | null;
}

/** Product rollup keyed by AGL. */
export interface AglTracking {
  agl: string;
  description: string;
  brands: string[];
  models: string[];
  occurrences: SkuOccurrence[];
  containers: string[];
  totalUnits: number;
  totalLineValue: number | null;
}

function lineModel(line: Sku): string {
  return (line.model || line.sku || "").trim();
}

function lineAgl(line: Sku): string {
  return (line.agl || "").trim();
}

function buildProductRollup(occurrences: SkuOccurrence[]): {
  description: string;
  brands: string[];
  containers: string[];
  totalUnits: number;
  totalLineValue: number | null;
} {
  const brands = [
    ...new Set(
      occurrences.map(({ shipment, line }) => line.brand ?? shipment.brand),
    ),
  ].sort();
  const containers = [
    ...new Set(
      occurrences
        .map(({ shipment }) => shipment.containerNo)
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort();
  const valuedLines = occurrences.filter(({ line }) => line.lineTotal != null);

  return {
    description: occurrences[0]?.line.description ?? "",
    brands,
    containers,
    totalUnits: occurrences.reduce((sum, { line }) => sum + line.qty, 0),
    totalLineValue:
      valuedLines.length > 0
        ? valuedLines.reduce((sum, { line }) => sum + (line.lineTotal ?? 0), 0)
        : null,
  };
}

function pushOccurrence(
  grouped: Map<string, SkuOccurrence[]>,
  key: string,
  shipment: ShipmentDerived,
  line: Sku,
) {
  if (!key) return;
  const existing = grouped.get(key) ?? [];
  const occurrence = existing.find((item) => item.shipment.id === shipment.id);
  if (occurrence) {
    occurrence.line.qty += line.qty;
    if (line.lineTotal != null) {
      occurrence.line.lineTotal = (occurrence.line.lineTotal ?? 0) + line.lineTotal;
    }
  } else {
    existing.push({ shipment, line: { ...line } });
  }
  grouped.set(key, existing);
}

function buildContainer(
  containerNo: string,
  shipments: ShipmentDerived[],
): ContainerTracking {
  const skuMap = new Map<string, Sku & { brands: string[] }>();

  for (const shipment of shipments) {
    for (const line of shipment.skus) {
      const model = lineModel(line);
      if (!model) continue;
      const key = model.toUpperCase();
      const existing = skuMap.get(key);
      if (existing) {
        existing.qty += line.qty;
        if (line.lineTotal != null) {
          existing.lineTotal = (existing.lineTotal ?? 0) + line.lineTotal;
        }
        if (!existing.brands.includes(line.brand ?? shipment.brand)) {
          existing.brands.push(line.brand ?? shipment.brand);
        }
      } else {
        skuMap.set(key, {
          ...line,
          sku: model,
          model,
          brands: [line.brand ?? shipment.brand],
        });
      }
    }
  }

  const currentShipment =
    shipments.find((shipment) => shipment.status !== "delivered") ?? shipments[0];
  const skus = [...skuMap.values()].sort((a, b) =>
    (a.model || a.sku).localeCompare(b.model || b.sku),
  );

  return {
    containerNo,
    shipments,
    currentShipment,
    skus,
    totalUnits: skus.reduce((sum, line) => sum + line.qty, 0),
  };
}

export async function getContainers(): Promise<ContainerTracking[]> {
  const shipments = await getShipments();
  const grouped = new Map<string, ShipmentDerived[]>();

  for (const shipment of shipments) {
    if (!shipment.containerNo) continue;
    const key = shipment.containerNo.toUpperCase();
    const existing = grouped.get(key) ?? [];
    existing.push(shipment);
    grouped.set(key, existing);
  }

  return [...grouped.entries()]
    .map(([containerNo, linkedShipments]) =>
      buildContainer(
        containerNo,
        linkedShipments.sort((a, b) => a.etaCurrent.localeCompare(b.etaCurrent)),
      ),
    )
    .sort((a, b) => a.containerNo.localeCompare(b.containerNo));
}

export async function getContainer(
  containerNo: string,
): Promise<ContainerTracking | null> {
  const containers = await getContainers();
  return (
    containers.find(
      (container) =>
        container.containerNo.toUpperCase() === decodeURIComponent(containerNo).toUpperCase(),
    ) ?? null
  );
}

/** SKUs view — roll up entirely by Model. */
export async function getSkus(): Promise<SkuTracking[]> {
  const shipments = await getShipments();
  const grouped = new Map<string, SkuOccurrence[]>();

  for (const shipment of shipments) {
    for (const line of shipment.skus) {
      const model = lineModel(line);
      if (!model) continue;
      pushOccurrence(grouped, model.toUpperCase(), shipment, line);
    }
  }

  return [...grouped.entries()]
    .map(([modelKey, occurrences]) => {
      const rollup = buildProductRollup(occurrences);
      const model = lineModel(occurrences[0].line) || modelKey;
      const agls = [
        ...new Set(
          occurrences
            .map(({ line }) => lineAgl(line))
            .filter(Boolean),
        ),
      ].sort();

      return {
        sku: model,
        model,
        agls,
        ...rollup,
        occurrences,
      };
    })
    .sort((a, b) => a.model.localeCompare(b.model));
}

export async function getSku(sku: string): Promise<SkuTracking | null> {
  const skus = await getSkus();
  const key = decodeURIComponent(sku).toUpperCase();
  return skus.find((item) => item.model.toUpperCase() === key) ?? null;
}

/** AGLs view — roll up by AGL product code. */
export async function getAgls(): Promise<AglTracking[]> {
  const shipments = await getShipments();
  const grouped = new Map<string, SkuOccurrence[]>();

  for (const shipment of shipments) {
    for (const line of shipment.skus) {
      const agl = lineAgl(line);
      if (!agl) continue;
      pushOccurrence(grouped, agl.toUpperCase(), shipment, line);
    }
  }

  return [...grouped.entries()]
    .map(([aglKey, occurrences]) => {
      const rollup = buildProductRollup(occurrences);
      const agl = lineAgl(occurrences[0].line) || aglKey;
      const models = [
        ...new Set(
          occurrences
            .map(({ line }) => lineModel(line))
            .filter(Boolean),
        ),
      ].sort();

      return {
        agl,
        models,
        ...rollup,
        occurrences,
      };
    })
    .sort((a, b) => a.agl.localeCompare(b.agl));
}

export async function getAgl(agl: string): Promise<AglTracking | null> {
  const agls = await getAgls();
  const key = decodeURIComponent(agl).toUpperCase();
  return agls.find((item) => item.agl.toUpperCase() === key) ?? null;
}
