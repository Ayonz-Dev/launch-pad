"use client";

import { useEffect, useState } from "react";
import ShipmentMap from "@/components/ShipmentMap";
import type { ShipmentDerived } from "@/lib/types";

type LivePos = {
  lat: number;
  lng: number;
  asOf: string;
  source?: "ais" | "estimate";
  shipName?: string;
};

type AisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "live"; position: LivePos }
  | { status: "miss" }
  | { status: "skipped"; reason: string }
  | { status: "error"; message: string }
  | { status: "unconfigured" };

function shouldFetchAis(s: ShipmentDerived): { ok: true } | { ok: false; reason: string } {
  if (!s.vessel?.trim()) return { ok: false, reason: "No vessel name on this shipment" };
  if (s.status === "delivered") return { ok: false, reason: "Shipment delivered" };
  const etd = (s.etdStatus ?? "").toUpperCase();
  if (etd === "ARRIVED" || etd.includes("DELIVERED")) {
    return { ok: false, reason: "Vessel already arrived" };
  }
  if (!s.origin.lat && !s.destination.lat) {
    return { ok: false, reason: "No route coordinates for AIS corridor" };
  }
  return { ok: true };
}

export default function LiveShipmentMap({ shipment }: { shipment: ShipmentDerived }) {
  const [ais, setAis] = useState<AisState>({ status: "idle" });

  useEffect(() => {
    const gate = shouldFetchAis(shipment);
    if (!gate.ok) {
      setAis({ status: "skipped", reason: gate.reason });
      return;
    }

    const ac = new AbortController();
    setAis({ status: "loading" });

    const params = new URLSearchParams({
      vessel: shipment.vessel!,
      olat: String(shipment.origin.lat),
      olng: String(shipment.origin.lng),
      dlat: String(shipment.destination.lat),
      dlng: String(shipment.destination.lng),
    });

    fetch(`/api/ais/position?${params}`, { signal: ac.signal, cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json()) as {
          configured?: boolean;
          found?: boolean;
          position?: LivePos | null;
          error?: string;
        };
        if (res.status === 503 || body.configured === false) {
          setAis({ status: "unconfigured" });
          return;
        }
        if (!res.ok) {
          setAis({ status: "error", message: body.error ?? "AIS lookup failed" });
          return;
        }
        if (body.found && body.position) {
          setAis({
            status: "live",
            position: { ...body.position, source: "ais" },
          });
          return;
        }
        setAis({ status: "miss" });
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setAis({ status: "error", message: err.message });
      });

    return () => ac.abort();
  }, [
    shipment.vessel,
    shipment.status,
    shipment.etdStatus,
    shipment.origin.lat,
    shipment.origin.lng,
    shipment.destination.lat,
    shipment.destination.lng,
  ]);

  const merged: ShipmentDerived =
    ais.status === "live"
      ? {
          ...shipment,
          currentPosition: {
            lat: ais.position.lat,
            lng: ais.position.lng,
            asOf: ais.position.asOf,
            source: "ais",
          },
        }
      : shipment;

  return (
    <div className="relative h-full min-h-[320px]">
      <ShipmentMap shipment={merged} />
      <AisBadge state={ais} vessel={shipment.vessel} />
    </div>
  );
}

function AisBadge({ state, vessel }: { state: AisState; vessel?: string }) {
  if (state.status === "idle" || state.status === "skipped") return null;

  const label =
    state.status === "loading"
      ? `Listening for ${vessel ?? "vessel"} on AIS…`
      : state.status === "live"
        ? `Live AIS · ${vessel ?? "vessel"}`
        : state.status === "miss"
          ? "No live AIS fix yet — showing estimated position"
          : state.status === "unconfigured"
            ? "AISStream not configured"
            : state.message;

  const tone =
    state.status === "live"
      ? "bg-[#0b1f17]/90 text-[#37e5a5] ring-[#37e5a5]/40"
      : state.status === "loading"
        ? "bg-slate-900/85 text-slate-100 ring-slate-500/40"
        : state.status === "error" || state.status === "unconfigured"
          ? "bg-amber-50/95 text-amber-950 ring-amber-200"
          : "bg-white/90 text-slate-600 ring-slate-200";

  return (
    <div
      className={`pointer-events-none absolute bottom-3 left-3 z-[1000] max-w-[min(100%-1.5rem,20rem)] rounded-md px-2.5 py-1.5 text-[11px] font-medium tracking-wide ring-1 backdrop-blur ${tone}`}
    >
      {label}
    </div>
  );
}
