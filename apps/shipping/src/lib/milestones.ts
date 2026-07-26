import type { GeoPoint, Milestone } from "./types";

// The daily report gives a coarse status (ARRIVED / ON WATER / blank) rather
// than event-level milestones. Both the importer and the manager's edit UI turn
// that status into the same milestone set, so status changes stay consistent.

export interface StatusInputs {
  status: string;
  etd: string | null; // ISO
  via: string | null; // ISO transshipment date, if any
  eta: string | null; // ISO
  polName: string; // origin port label
  podName: string; // destination port label
}

export function milestonesFromStatus(i: StatusInputs): Milestone[] {
  const s = (i.status || "").toUpperCase();
  const departed = s === "ON WATER" || s === "ARRIVED";
  const arrived = s === "ARRIVED";
  const ms: Milestone[] = [];

  ms.push({
    code: "VESSEL_DEPARTURE",
    label: "Vessel departed",
    leg: "ocean",
    location: i.polName,
    timestamp: i.etd,
    actual: departed && !!i.etd,
  });
  if (i.via) {
    ms.push({
      code: "TRANSSHIP",
      label: "Transshipment",
      leg: "ocean",
      location: "Via HK/Singapore",
      timestamp: i.via,
      actual: arrived,
    });
  }
  ms.push({
    code: "DISCHARGE",
    label: "Arrived at destination port",
    leg: "ocean",
    location: i.podName,
    timestamp: i.eta,
    actual: arrived && !!i.eta,
  });
  if (arrived) {
    ms.push({
      code: "DELIVERED",
      label: "Arrived (per report)",
      leg: "last_mile",
      location: i.podName,
      timestamp: i.eta,
      actual: true,
    });
  }
  return ms;
}

// Rough map position for a status when there's no live feed track:
// destination if arrived, midpoint if on water, none otherwise.
export function positionFromStatus(
  status: string,
  origin: GeoPoint,
  destination: GeoPoint,
  asOf: string
): { lat: number; lng: number; asOf: string } | undefined {
  const s = (status || "").toUpperCase();
  if (s === "ARRIVED" && destination.lat) {
    return { lat: destination.lat, lng: destination.lng, asOf };
  }
  if (s === "ON WATER" && origin.lat && destination.lat) {
    return {
      lat: (origin.lat + destination.lat) / 2,
      lng: (origin.lng + destination.lng) / 2,
      asOf,
    };
  }
  return undefined;
}
