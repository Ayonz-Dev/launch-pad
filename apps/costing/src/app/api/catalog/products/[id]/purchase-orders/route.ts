import { NextResponse } from "next/server";
import { listPurchaseOrderAssets } from "@/lib/catalog/purchaseOrders";
import {
  AuthError,
  getServiceSupabase,
  requireAuthenticatedUser,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Context = { params: { id: string } };

export async function GET(_req: Request, context: Context) {
  try {
    await requireAuthenticatedUser(_req);
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing product id" }, { status: 400 });
    }
    const assets = await listPurchaseOrderAssets(getServiceSupabase(), id);
    return NextResponse.json(
      { ok: true, assets },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not list purchase orders",
      },
      { status: 500 },
    );
  }
}
