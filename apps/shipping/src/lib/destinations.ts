/**
 * Destination countries for the tracker. Today only Australia is live;
 * add entries here as other country datasets come online.
 */
export interface DestinationCountry {
  code: string; // ISO-ish key, e.g. "AU"
  label: string;
  /** When false, shown disabled in the selector until data is ready. */
  enabled: boolean;
}

export const DESTINATION_COUNTRIES: DestinationCountry[] = [
  { code: "AU", label: "Australia", enabled: true },
  // Future:
  // { code: "NZ", label: "New Zealand", enabled: false },
  // { code: "US", label: "United States", enabled: false },
];

export const DEFAULT_DESTINATION = "AU";

export const DESTINATION_STORAGE_KEY = "ayonz.destinationCountry";
