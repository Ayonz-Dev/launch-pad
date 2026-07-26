import { NextResponse } from "next/server";
import { searchCatalogProducts } from "@/lib/catalog/search";
import {
  AuthError,
  getServiceSupabase,
  requireAuthenticatedUser,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") || "";
    const limit = Number(searchParams.get("limit") || "20");
    const hits = await searchCatalogProducts(getServiceSupabase(), query, limit);
    return NextResponse.json(
      { ok: true, hits },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Search failed" },
      { status: 500 },
    );
  }
}
