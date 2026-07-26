import { NextResponse } from "next/server";
import { downloadPurchaseOrderFile } from "@/lib/catalog/purchaseOrders";
import {
  AuthError,
  getServiceSupabase,
  requireAuthenticatedUser,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Context = { params: { id: string; assetId: string } };

export async function GET(req: Request, context: Context) {
  try {
    await requireAuthenticatedUser(req);
    const { id, assetId } = await context.params;
    if (!id || !assetId) {
      return NextResponse.json({ ok: false, error: "Missing product or asset id" }, { status: 400 });
    }
    const file = await downloadPurchaseOrderFile(getServiceSupabase(), id, assetId);
    return new NextResponse(file.buffer, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.name.replace(/"/g, "")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const status =
      error instanceof AuthError
        ? 401
        : typeof error === "object" &&
            error &&
            "status" in error &&
            typeof (error as { status: unknown }).status === "number"
          ? (error as { status: number }).status
          : 500;
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not download purchase order",
      },
      { status },
    );
  }
}
