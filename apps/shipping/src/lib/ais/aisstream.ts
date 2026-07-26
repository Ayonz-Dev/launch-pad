/**
 * Server-only AISStream client.
 * Docs: https://aisstream.io/documentation
 * WebSocket: wss://stream.aisstream.io/v0/stream
 *
 * The AISStream key must never be exposed to the browser (no CORS).
 *
 * Architecture: one shared WebSocket per server instance indexes recent
 * PositionReports by ship name / MMSI. Lookups hit the cache first; on miss
 * they wait briefly for a matching frame (AIS reports are bursty).
 */

export type AisPosition = {
  lat: number;
  lng: number;
  asOf: string;
  shipName?: string;
  mmsi?: string;
  sog?: number;
  cog?: number;
  source: "ais";
};

type LatLng = { lat: number; lng: number };

const AIS_URL = "wss://stream.aisstream.io/v0/stream";
const CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_WAIT_MS = 18_000;

type CacheEntry = { position: AisPosition; expires: number };

type StreamMessage = {
  MessageType?: string;
  MetaData?: {
    MMSI?: number | string;
    ShipName?: string;
    latitude?: number;
    longitude?: number;
    time_utc?: string;
  };
  Metadata?: StreamMessage["MetaData"];
  Message?: {
    PositionReport?: {
      Latitude?: number;
      Longitude?: number;
      Sog?: number;
      Cog?: number;
      UserID?: number;
    };
  };
};

function apiKey(): string {
  const key = process.env.AISSTREAM_API_KEY?.trim();
  if (!key) throw new Error("AISSTREAM_API_KEY is not configured");
  return key;
}

export function normalizeShipName(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function shipNamesMatch(a: string, b: string): boolean {
  const na = normalizeShipName(a);
  const nb = normalizeShipName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** Bounding box as [[SW], [NE]] in [lat, lon] per AISStream docs. */
export function routeBoundingBox(
  origin: LatLng,
  destination: LatLng,
  padDeg = 10,
): [[[number, number], [number, number]]] {
  const south = Math.max(-90, Math.min(origin.lat, destination.lat) - padDeg);
  const north = Math.min(90, Math.max(origin.lat, destination.lat) + padDeg);
  const west = Math.max(-180, Math.min(origin.lng, destination.lng) - padDeg);
  const east = Math.min(180, Math.max(origin.lng, destination.lng) + padDeg);
  return [[[south, west], [north, east]]];
}

async function frameToString(data: unknown): Promise<string> {
  if (typeof data === "string") return data;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  }
  // Duck-type Blob — `instanceof Blob` can fail across webpack realms in Next.js.
  if (
    data &&
    typeof data === "object" &&
    typeof (data as { text?: unknown }).text === "function"
  ) {
    return await (data as { text: () => Promise<string> }).text();
  }
  return String(data);
}

function positionFromMessage(msg: StreamMessage): AisPosition | null {
  const meta = msg.MetaData ?? msg.Metadata;
  const report = msg.Message?.PositionReport;
  if (!meta && !report) return null;

  const mmsi = String(meta?.MMSI ?? report?.UserID ?? "");
  const shipName = (meta?.ShipName ?? "").trim();
  const lat = report?.Latitude ?? meta?.latitude;
  const lng = report?.Longitude ?? meta?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  return {
    lat,
    lng,
    asOf: meta?.time_utc ?? new Date().toISOString(),
    shipName: shipName || undefined,
    mmsi: mmsi || undefined,
    sog: report?.Sog,
    cog: report?.Cog,
    source: "ais",
  };
}

type Hub = {
  ws: WebSocket | null;
  byName: Map<string, CacheEntry>;
  byMmsi: Map<string, CacheEntry>;
  waiters: Set<(pos: AisPosition) => void>;
  bboxKey: string;
  frames: number;
  opened: boolean;
};

// Persist across hot reloads in dev.
const g = globalThis as unknown as { __aisHub?: Hub };
function hub(): Hub {
  if (!g.__aisHub) {
    g.__aisHub = {
      ws: null,
      byName: new Map(),
      byMmsi: new Map(),
      waiters: new Set(),
      bboxKey: "",
      frames: 0,
      opened: false,
    };
  }
  return g.__aisHub;
}

function remember(pos: AisPosition): void {
  const expires = Date.now() + CACHE_TTL_MS;
  const entry = { position: pos, expires };
  if (pos.mmsi) hub().byMmsi.set(pos.mmsi, entry);
  if (pos.shipName) {
    const key = normalizeShipName(pos.shipName);
    if (key && key !== "0") hub().byName.set(key, entry);
  }
  for (const waiter of [...hub().waiters]) {
    waiter(pos);
  }
}

function readName(vessel: string): AisPosition | null {
  const h = hub();
  const target = normalizeShipName(vessel);
  if (!target) return null;

  // Exact key first, then substring scan (vessel report names vary).
  const exact = h.byName.get(target);
  if (exact && Date.now() <= exact.expires) return exact.position;

  for (const [key, entry] of h.byName) {
    if (Date.now() > entry.expires) {
      h.byName.delete(key);
      continue;
    }
    if (key.includes(target) || target.includes(key)) return entry.position;
  }
  return null;
}

function readMmsi(mmsi: string): AisPosition | null {
  const entry = hub().byMmsi.get(mmsi);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    hub().byMmsi.delete(mmsi);
    return null;
  }
  return entry.position;
}

function ensureStream(bbox: [[[number, number], [number, number]]]): void {
  const h = hub();
  const bboxKey = JSON.stringify(bbox);
  if (h.ws && (h.ws.readyState === WebSocket.OPEN || h.ws.readyState === WebSocket.CONNECTING)) {
    // Re-subscribe if corridor changed materially.
    if (h.bboxKey !== bboxKey && h.ws.readyState === WebSocket.OPEN) {
      h.bboxKey = bboxKey;
      h.ws.send(
        JSON.stringify({
          APIKey: apiKey(),
          BoundingBoxes: bbox,
          FilterMessageTypes: ["PositionReport"],
        }),
      );
    }
    return;
  }

  const ws = new WebSocket(AIS_URL);
  try {
    ws.binaryType = "arraybuffer";
  } catch {
    /* ignore */
  }
  h.ws = ws;
  h.bboxKey = bboxKey;
  h.opened = false;

  ws.addEventListener("open", () => {
    h.opened = true;
    ws.send(
      JSON.stringify({
        APIKey: apiKey(),
        BoundingBoxes: bbox,
        FilterMessageTypes: ["PositionReport"],
      }),
    );
  });

  ws.addEventListener("message", (event) => {
    void (async () => {
      try {
        const raw = await frameToString(event.data);
        const msg = JSON.parse(raw) as StreamMessage;
        if (msg.MessageType && msg.MessageType !== "PositionReport") return;
        const pos = positionFromMessage(msg);
        if (!pos) return;
        h.frames += 1;
        remember(pos);
      } catch {
        /* ignore malformed frames */
      }
    })();
  });

  ws.addEventListener("close", () => {
    h.ws = null;
    h.opened = false;
  });

  ws.addEventListener("error", () => {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    h.ws = null;
    h.opened = false;
  });
}

export type FetchAisOptions = {
  vessel?: string;
  mmsi?: string;
  origin: LatLng;
  destination: LatLng;
  /** Max time to wait for a live frame when cache is cold. */
  listenMs?: number;
  bypassCache?: boolean;
};

export type FetchAisResult = {
  position: AisPosition | null;
  stats: {
    frames: number;
    opened: boolean;
    cacheSize: number;
    fromCache: boolean;
  };
};

/**
 * Resolve a live AIS position for a vessel name and/or MMSI.
 * Uses a shared stream + in-memory cache on the server instance.
 */
export async function fetchAisPosition(
  opts: FetchAisOptions,
): Promise<FetchAisResult> {
  const vessel = opts.vessel?.trim();
  const mmsi = opts.mmsi?.trim();
  if (!vessel && !mmsi) {
    throw new Error("vessel or mmsi is required");
  }

  const bbox = routeBoundingBox(opts.origin, opts.destination);
  ensureStream(bbox);

  const statsBase = () => ({
    frames: hub().frames,
    opened: hub().opened,
    cacheSize: hub().byName.size,
  });

  if (!opts.bypassCache) {
    const cached = mmsi ? readMmsi(mmsi) : null;
    const byVessel = !cached && vessel ? readName(vessel) : null;
    const hit = cached ?? byVessel;
    if (hit) {
      return { position: hit, stats: { ...statsBase(), fromCache: true } };
    }
  }

  const waitMs = opts.listenMs ?? DEFAULT_WAIT_MS;

  const position = await new Promise<AisPosition | null>((resolve) => {
    const timer = setTimeout(() => {
      hub().waiters.delete(onPos);
      // Final cache check in case a frame landed during teardown.
      const late = mmsi ? readMmsi(mmsi) : vessel ? readName(vessel) : null;
      resolve(late);
    }, waitMs);

    const onPos = (pos: AisPosition) => {
      if (mmsi && pos.mmsi === mmsi) {
        clearTimeout(timer);
        hub().waiters.delete(onPos);
        resolve(pos);
        return;
      }
      if (vessel && pos.shipName && shipNamesMatch(pos.shipName, vessel)) {
        clearTimeout(timer);
        hub().waiters.delete(onPos);
        resolve(pos);
      }
    };

    hub().waiters.add(onPos);
  });

  return {
    position,
    stats: { ...statsBase(), fromCache: false },
  };
}

export function aisConfigured(): boolean {
  return Boolean(process.env.AISSTREAM_API_KEY?.trim());
}
