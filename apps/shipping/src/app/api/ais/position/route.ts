import { NextRequest, NextResponse } from "next/server";
import {
  aisConfigured,
  fetchAisPosition,
  type AisPosition,
} from "@/lib/ais/aisstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Short-lived WS listen — allow up to 20s on the route. */
export const maxDuration = 20;

function num(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * GET /api/ais/position?vessel=CSL+SOPHIE&olat=...&olng=...&dlat=...&dlng=...
 * Optional: mmsi=123456789
 *
 * Proxies AISStream (server-side only) and returns a live position when one
 * matching PositionReport arrives within the listen window.
 */
export async function GET(req: NextRequest) {
  if (!aisConfigured()) {
    return NextResponse.json(
      { error: "AISSTREAM_API_KEY is not configured", configured: false },
      { status: 503 },
    );
  }

  const sp = req.nextUrl.searchParams;
  const vessel = sp.get("vessel")?.trim() || undefined;
  const mmsi = sp.get("mmsi")?.trim() || undefined;
  const olat = num(sp.get("olat"));
  const olng = num(sp.get("olng"));
  const dlat = num(sp.get("dlat"));
  const dlng = num(sp.get("dlng"));

  if (!vessel && !mmsi) {
    return NextResponse.json(
      { error: "Provide vessel and/or mmsi" },
      { status: 400 },
    );
  }
  if (olat == null || olng == null || dlat == null || dlng == null) {
    return NextResponse.json(
      { error: "olat, olng, dlat, dlng are required (route corridor)" },
      { status: 400 },
    );
  }

  const debug = sp.get("debug") === "1";

  try {
    const { position, stats } = await fetchAisPosition({
      vessel,
      mmsi,
      origin: { lat: olat, lng: olng },
      destination: { lat: dlat, lng: dlng },
    });

    if (!position) {
      return NextResponse.json({
        configured: true,
        found: false,
        position: null as AisPosition | null,
        hint:
          "No live AIS fix yet. The map keeps the estimated position — try again shortly, or add an MMSI for a tighter match.",
        ...(debug ? { stats } : {}),
      });
    }

    return NextResponse.json({
      configured: true,
      found: true,
      position,
      ...(debug ? { stats } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AIS lookup failed";
    return NextResponse.json({ error: message, configured: true }, { status: 502 });
  }
}
