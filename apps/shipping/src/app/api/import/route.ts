import { NextResponse } from "next/server";
import { getSupabaseServer, requireVisibilityOrganizationId } from "@/lib/supabase";
import { shipmentToInsertRow } from "@/lib/data";
import type { Shipment } from "@/lib/types";

function isVisibilitySchema(): boolean {
  return (process.env.SUPABASE_DB_SCHEMA?.trim() || "public") === "visibility";
}

export const dynamic = "force-dynamic";

const BATCH_SIZE = 100;

/**
 * Receives shipments already parsed in the browser and upserts them into
 * Supabase (keyed on id, so re-importing the next day updates in place).
 *
 * Body: { shipments: Shipment[] }
 * When Supabase isn't configured, returns ok:false with a clear reason so the
 * upload page can still show the parsed preview.
 */
export async function POST(req: Request) {
  // Use the same manager credential as the edit UI. This keeps the service-role
  // database client behind a server-side check rather than an open public route.
  if (process.env.MANAGE_TOKEN) {
    if (req.headers.get("x-manage-token") !== process.env.MANAGE_TOKEN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: { shipments?: Shipment[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const shipments = body.shipments ?? [];
  if (!Array.isArray(shipments) || shipments.length === 0) {
    return NextResponse.json({ ok: false, error: "No shipments to import" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getSupabaseServer();
  } catch {
    return NextResponse.json({
      ok: false,
      persisted: 0,
      reason:
        "Supabase isn't configured yet. The preview above is correct — add the Supabase variables to this deployment to persist.",
    });
  }

  let rows: Record<string, unknown>[];
  try {
    rows = shipments.map(shipmentToInsertRow);
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      persisted: 0,
      reason: err.message,
    });
  }

  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error, count } = await supabase
      .from("shipments")
      .upsert(batch, { onConflict: "id", count: "exact" });

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          persisted: upserted,
          error: error.message,
          reason: `Upsert failed at batch starting row ${i + 1}: ${error.message}`,
        },
        { status: 500 },
      );
    }
    upserted += count ?? 0;
  }

  // AGL override: AGL is the batch tracking key, so a re-upload replaces the
  // previous entry for every AGL it carries. We've just upserted the current
  // legs; now delete any earlier leg of those same AGLs that isn't in this
  // upload (a container consolidated away, an ETD changed the id, etc.). AGLs
  // not present in this file are left untouched. Best-effort: the new data is
  // already persisted, so a prune failure never loses the upload.
  const incomingAgls = [
    ...new Set(rows.flatMap((r) => (r.agls as string[] | undefined) ?? [])),
  ];
  const newIds = new Set(rows.map((r) => r.id as string));
  let pruned = 0;
  if (incomingAgls.length) {
    try {
      let query = supabase.from("shipments").select("id").overlaps("agls", incomingAgls);
      if (isVisibilitySchema()) {
        query = query.eq("organization_id", requireVisibilityOrganizationId());
      }
      const { data: existing, error: existingError } = await query;
      if (!existingError && existing) {
        const staleIds = (existing as { id: string }[])
          .map((e) => e.id)
          .filter((id) => !newIds.has(id));
        if (staleIds.length) {
          const { error: deleteError } = await supabase
            .from("shipments")
            .delete()
            .in("id", staleIds);
          if (!deleteError) pruned = staleIds.length;
        }
      }
    } catch {
      // Prune is best-effort; the upsert above already landed the new data.
    }
  }

  // Don't trust upsert count alone — RLS/grants can report success with 0 rows.
  const sampleIds = rows.slice(0, 5).map((r) => r.id as string);
  const { data: verifyRows, error: verifyError, count: verifyCount } = await supabase
    .from("shipments")
    .select("id", { count: "exact" })
    .in("id", sampleIds);

  if (verifyError) {
    return NextResponse.json({
      ok: false,
      persisted: upserted,
      reason: `Wrote but couldn't verify: ${verifyError.message}`,
    });
  }

  const found = verifyRows?.length ?? 0;
  if (found === 0) {
    return NextResponse.json({
      ok: false,
      persisted: 0,
      reason:
        "Import reported success but no rows are readable afterward. Run supabase/fix_public_shipments_rls.sql in the Supabase SQL Editor (RLS is likely blocking writes), then re-import.",
    });
  }

  return NextResponse.json({
    ok: true,
    persisted: rows.length,
    upserted,
    pruned,
    verifiedSample: found,
    // verifyCount is only for the sample ids, not the full table
    sampleReadable: verifyCount ?? found,
  });
}
