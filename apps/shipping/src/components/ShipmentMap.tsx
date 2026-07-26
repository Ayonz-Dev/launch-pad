"use client";

import { useEffect, useId, useRef, useState } from "react";
import { APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import type { ShipmentDerived } from "@/lib/types";

type LatLng = { lat: number; lng: number };

/** Minimal Leaflet surface used by the OSM fallback (loaded from CDN). */
type LeafletMap = {
  remove: () => void;
  invalidateSize: () => void;
  fitBounds: (path: [number, number][], opts?: { padding?: [number, number] }) => void;
};
type LeafletNS = {
  map: (
    el: HTMLElement,
    opts?: { scrollWheelZoom?: boolean; attributionControl?: boolean },
  ) => LeafletMap & {
    // addTo targets
  };
  tileLayer: (
    url: string,
    opts?: { attribution?: string; maxZoom?: number },
  ) => { addTo: (map: LeafletMap) => unknown };
  polyline: (
    path: [number, number][],
    opts?: { color?: string; weight?: number; opacity?: number },
  ) => { addTo: (map: LeafletMap) => unknown };
  circleMarker: (
    latlng: [number, number],
    opts?: {
      radius?: number;
      color?: string;
      weight?: number;
      fillColor?: string;
      fillOpacity?: number;
    },
  ) => {
    bindTooltip: (title: string) => { addTo: (map: LeafletMap) => unknown };
    addTo: (map: LeafletMap) => unknown;
  };
};

function midpoint(s: ShipmentDerived): LatLng {
  return {
    lat: (s.origin.lat + s.destination.lat) / 2,
    lng: (s.origin.lng + s.destination.lng) / 2,
  };
}

function routePath(s: ShipmentDerived): LatLng[] {
  if (s.routePath.length >= 2) return s.routePath;
  if (s.origin.lat || s.destination.lat) {
    return [
      { lat: s.origin.lat, lng: s.origin.lng },
      { lat: s.destination.lat, lng: s.destination.lng },
    ];
  }
  return [];
}

function hasCoords(s: ShipmentDerived): boolean {
  return routePath(s).length >= 2;
}

// Draws the route polyline + origin/destination/current markers imperatively,
// so we don't need a Cloud-configured Map ID for Advanced Markers.
function GoogleOverlays({ shipment }: { shipment: ShipmentDerived }) {
  const map = useMap();

  useEffect(() => {
    if (!map || typeof google === "undefined") return;
    const created: google.maps.MVCObject[] = [];
    const path = routePath(shipment);

    const line = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: "#1D4ED8",
      strokeOpacity: 0.85,
      strokeWeight: 2.5,
      map,
    });
    created.push(line);

    const dot = (
      position: google.maps.LatLngLiteral,
      color: string,
      title: string,
      scale = 6,
    ) =>
      new google.maps.Marker({
        position,
        map,
        title,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });

    created.push(dot(shipment.origin, "#64748B", `Origin — ${shipment.origin.name}`));
    created.push(
      dot(shipment.destination, "#0F172A", `Destination — ${shipment.destination.name}`),
    );
    if (shipment.currentPosition) {
      const live = shipment.currentPosition.source === "ais";
      created.push(
        dot(
          shipment.currentPosition,
          live ? "#37e5a5" : "#1D4ED8",
          `${shipment.vessel ?? "Vessel"} — ${live ? "live AIS" : "current"}`,
          live ? 8 : 7,
        ),
      );
    }

    const bounds = new google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    if (shipment.currentPosition) bounds.extend(shipment.currentPosition);
    if (!bounds.isEmpty()) map.fitBounds(bounds, 48);

    return () => created.forEach((o) => (o as google.maps.Marker).setMap?.(null));
  }, [map, shipment]);

  return null;
}

const GOOGLE_MAPS_SETUP_HINT =
  "Google Maps rejected this API key (usually referrer restrictions or Maps JavaScript API not enabled for the key). Showing OpenStreetMap instead. Allow http://localhost:3001/* and http://127.0.0.1:3001/* on the key, and under API restrictions include Maps JavaScript API.";

function GoogleShipmentMap({ shipment }: { shipment: ShipmentDerived }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;
  const [mapsError, setMapsError] = useState<string | null>(null);

  // AuthFailure (billing / API not enabled / referrer blocked) does not always
  // fire APIProvider.onError — Google calls window.gm_authFailure instead.
  useEffect(() => {
    const previous = (window as unknown as { gm_authFailure?: () => void }).gm_authFailure;
    (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
      setMapsError(GOOGLE_MAPS_SETUP_HINT);
      previous?.();
    };
    return () => {
      (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = previous;
    };
  }, []);

  if (mapsError) {
    return <OsmShipmentMap shipment={shipment} notice={mapsError} />;
  }

  return (
    <div className="h-full min-h-[320px] overflow-hidden rounded-xl border border-slate-200">
      <APIProvider
        apiKey={apiKey}
        onError={() => setMapsError(GOOGLE_MAPS_SETUP_HINT)}
      >
        <Map
          defaultCenter={midpoint(shipment)}
          defaultZoom={3}
          gestureHandling="cooperative"
          disableDefaultUI={false}
          style={{ width: "100%", height: "100%", minHeight: 320 }}
        >
          <GoogleOverlays shipment={shipment} />
        </Map>
      </APIProvider>
    </div>
  );
}

let leafletLoader: Promise<LeafletNS> | null = null;

function loadLeaflet(): Promise<LeafletNS> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Leaflet needs a browser"));
  }
  const w = window as unknown as { L?: LeafletNS };
  if (w.L) return Promise.resolve(w.L);
  if (leafletLoader) return leafletLoader;

  leafletLoader = new Promise((resolve, reject) => {
    const cssId = "leaflet-css";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    const existing = document.getElementById("leaflet-js") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve((window as unknown as { L: LeafletNS }).L));
      existing.addEventListener("error", () => reject(new Error("Leaflet script failed")));
      return;
    }

    const script = document.createElement("script");
    script.id = "leaflet-js";
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => resolve((window as unknown as { L: LeafletNS }).L);
    script.onerror = () => reject(new Error("Leaflet script failed"));
    document.head.appendChild(script);
  });

  return leafletLoader;
}

function OsmShipmentMap({
  shipment,
  notice,
}: {
  shipment: ShipmentDerived;
  notice?: string;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapId = useId();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapEl.current || !hasCoords(shipment)) return;
    let cancelled = false;
    let map: LeafletMap | null = null;

    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapEl.current) return;

        const path = routePath(shipment).map((p) => [p.lat, p.lng] as [number, number]);

        map = L.map(mapEl.current, {
          scrollWheelZoom: false,
          attributionControl: true,
        }) as LeafletMap;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 18,
        }).addTo(map);

        L.polyline(path, { color: "#1D4ED8", weight: 3, opacity: 0.85 }).addTo(map);

        const circle = (latlng: [number, number], color: string, title: string, r = 7) =>
          L.circleMarker(latlng, {
            radius: r,
            color: "#fff",
            weight: 2,
            fillColor: color,
            fillOpacity: 1,
          })
            .bindTooltip(title)
            .addTo(map!);

        circle(
          [shipment.origin.lat, shipment.origin.lng],
          "#64748B",
          `Origin — ${shipment.origin.name}`,
        );
        circle(
          [shipment.destination.lat, shipment.destination.lng],
          "#0F172A",
          `Destination — ${shipment.destination.name}`,
        );
        if (shipment.currentPosition) {
          const live = shipment.currentPosition.source === "ais";
          circle(
            [shipment.currentPosition.lat, shipment.currentPosition.lng],
            live ? "#37e5a5" : "#1D4ED8",
            `${shipment.vessel ?? "Vessel"} — ${live ? "live AIS" : "current"}`,
            live ? 9 : 8,
          );
        }

        const fitPath = [...path];
        if (shipment.currentPosition) {
          fitPath.push([shipment.currentPosition.lat, shipment.currentPosition.lng]);
        }
        map.fitBounds(fitPath, { padding: [40, 40] });
        setTimeout(() => map?.invalidateSize(), 50);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [shipment, mapId]);

  if (!hasCoords(shipment)) {
    return (
      <div className="grid h-full min-h-[320px] place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <div>
          <div className="font-display text-sm font-semibold text-ink">
            {shipment.origin.name || "Origin"} → {shipment.destination.name || "Destination"}
          </div>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
            No map coordinates for this lane yet. Re-import after ports are mapped in{" "}
            <code className="rounded bg-slate-200 px-1">lib/import/ports.ts</code>.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid h-full min-h-[320px] place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <p className="text-sm text-slate-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[320px] overflow-hidden rounded-xl border border-slate-200">
      {notice && (
        <div className="absolute inset-x-0 top-0 z-[1000] bg-amber-50/95 px-3 py-1.5 text-center text-xs text-amber-900">
          {notice}
        </div>
      )}
      <div ref={mapEl} className="h-full min-h-[320px] w-full" />
    </div>
  );
}

export default function ShipmentMap({ shipment }: { shipment: ShipmentDerived }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  const forceOsm =
    process.env.NEXT_PUBLIC_MAP_PROVIDER?.trim().toLowerCase() === "osm";

  // Prefer Google when a key is configured; otherwise use free OSM tiles so the
  // route still renders with zero Maps billing setup.
  // Set NEXT_PUBLIC_MAP_PROVIDER=osm to force OSM while fixing Google Cloud.
  if (apiKey && !forceOsm) {
    return <GoogleShipmentMap shipment={shipment} />;
  }

  return <OsmShipmentMap shipment={shipment} />;
}
