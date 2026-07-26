import { NextResponse } from "next/server";
import { getShipment } from "@/lib/data";
import { getSupabaseServer } from "@/lib/supabase";
import { rowToShipment, shipmentToRow } from "@/lib/data";
import { milestonesFromStatus, positionFromStatus } from "@/lib/milestones";
import type { Shipment } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const shipment = await getShipment(params.id);
    if (!shipment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ shipment });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Fields the manager can edit.
interface Patch {
  etaCurrent?: string;
  etdStatus?: string;
  vessel?: string;
  voyage?: string;
  carrier?: string;
  retailer?: string;
  retailerDeadline?: string | null;
  po?: string;
  landedCostAud?: number | null;
  currentPosition?: { lat: number; lng: number; asOf: string } | null;
}

/**
 * The logistics manager's write path. Applies a partial update; when status or
 * ETA changes, milestones and the map position are rebuilt from the same helper
 * the importer uses, so the sales-team view stays consistent the moment she saves.
 * Set MANAGE_TOKEN to require an x-manage-token header before writes are accepted.
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  if (process.env.MANAGE_TOKEN) {
    if (req.headers.get("x-manage-token") !== process.env.MANAGE_TOKEN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let patch: Patch;
  try {
    patch = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getSupabaseServer();
  } catch {
    return NextResponse.json(
      { error: "Supabase not configured. Set DATA_SOURCE=supabase and keys." },
      { status: 400 }
    );
  }

  const { data: existingRow, error: readErr } = await supabase
    .from("shipments")
    .select("*")
    .eq("id", params.id)
    .single();
  if (readErr || !existingRow) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }

  const s: Shipment = rowToShipment(existingRow);

  // Apply scalar edits.
  if (patch.etaCurrent) s.etaCurrent = patch.etaCurrent;
  if (patch.etdStatus !== undefined) s.etdStatus = patch.etdStatus;
  if (patch.vessel !== undefined) s.vessel = patch.vessel || undefined;
  if (patch.voyage !== undefined) s.voyage = patch.voyage || undefined;
  if (patch.carrier) s.carrier = patch.carrier;
  if (patch.retailer !== undefined) s.retailer = patch.retailer || undefined;
  if (patch.retailerDeadline !== undefined)
    s.retailerDeadline = patch.retailerDeadline || undefined;
  if (patch.po !== undefined) s.po = patch.po || undefined;
  if (patch.landedCostAud !== undefined)
    s.landedCostAud = patch.landedCostAud ?? undefined;

  // Recompute milestones + position when status or ETA moved.
  const statusOrEtaChanged =
    patch.etdStatus !== undefined || patch.etaCurrent !== undefined;
  if (statusOrEtaChanged && s.etdStatus) {
    const dep = s.milestones.find((m) => m.code === "VESSEL_DEPARTURE");
    const via = s.milestones.find((m) => m.code === "TRANSSHIP");
    s.milestones = milestonesFromStatus({
      status: s.etdStatus,
      etd: dep?.timestamp ?? null,
      via: via?.timestamp ?? null,
      eta: s.etaCurrent,
      polName: s.origin.name,
      podName: s.destination.name,
    });
    const pos = positionFromStatus(
      s.etdStatus,
      s.origin,
      s.destination,
      new Date().toISOString().slice(0, 10)
    );
    if (pos) s.currentPosition = pos;
  }

  // Explicit position override always wins.
  if (patch.currentPosition !== undefined) {
    s.currentPosition = patch.currentPosition ?? undefined;
  }

  const { error: writeErr } = await supabase
    .from("shipments")
    .update(shipmentToRow(s))
    .eq("id", params.id);
  if (writeErr) {
    return NextResponse.json({ error: writeErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, shipment: s });
}
