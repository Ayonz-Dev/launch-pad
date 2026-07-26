import { NextResponse } from "next/server";
import { getSupabaseServiceRole } from "@/lib/supabase";
import { toMilestones, type RawEvent } from "@/lib/feed/normalize";

export const dynamic = "force-dynamic";

/**
 * Ingest endpoint. Point your n8n polling workflow (or a carrier push) here.
 * n8n fetches the feed on a schedule, hands each shipment's raw events to this
 * route, and we normalise + upsert them into Supabase.
 *
 * Expected body:
 * {
 *   "shipmentId": "SHP-1055",
 *   "currentPosition": { "lat": -20.1, "lng": 132.0, "asOf": "..." },
 *   "etaCurrent": "2026-08-11",
 *   "events": [ { "code": "DISCHARGE", "location": "Melbourne", "timestamp": null, "actual": false } ]
 * }
 */
export async function POST(req: Request) {
  // Shared-secret auth. Set INGEST_TOKEN and send it as x-ingest-token from n8n.
  const token = req.headers.get("x-ingest-token");
  if (!process.env.INGEST_TOKEN || token !== process.env.INGEST_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    shipmentId?: string;
    currentPosition?: { lat: number; lng: number; asOf: string };
    etaCurrent?: string;
    events?: RawEvent[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.shipmentId) {
    return NextResponse.json({ error: "shipmentId required" }, { status: 400 });
  }

  // Only overwrite fields the caller actually sent. A poll that carries just a
  // position update must not blank out the existing timeline, so an empty/omitted
  // `events` array leaves milestones untouched.
  const patch: Record<string, unknown> = {};
  const hasEvents = Array.isArray(body.events) && body.events.length > 0;
  const milestones = hasEvents ? toMilestones(body.events!) : [];
  if (hasEvents) patch.milestones = milestones;
  if (body.currentPosition) patch.current_position = body.currentPosition;
  if (body.etaCurrent) patch.eta_current = body.etaCurrent;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Nothing to update: send events, currentPosition, or etaCurrent." },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseServiceRole();
    const { error } = await supabase
      .from("shipments")
      .update(patch)
      .eq("id", body.shipmentId);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, milestones: milestones.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
