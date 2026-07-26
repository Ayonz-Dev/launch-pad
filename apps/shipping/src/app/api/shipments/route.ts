import { NextResponse } from "next/server";
import { getShipments } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const shipments = await getShipments();
    return NextResponse.json({ shipments });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
