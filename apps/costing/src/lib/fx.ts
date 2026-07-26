/** FX helpers — rate card currencies are USD-based; engine uses AUD per 1 factory unit. */

export type SpotQuote = {
  code: string;
  /** AUD per 1 unit of this currency */
  audPerUnit: number;
  /** Units of this currency per 1 USD */
  unitsPerUsd: number;
};

export type SpotBundle = {
  base: "USD";
  audPerUsd: number;
  fetchedAt: string;
  quotes: SpotQuote[];
};

/** Foreign units per 1 USD given AUD-per-unit rates. */
export function unitsPerUsd(audPerUsd: number, audPerUnit: number): number {
  if (!(audPerUsd > 0) || !(audPerUnit > 0)) return 0;
  return audPerUsd / audPerUnit;
}

/** AUD per 1 foreign unit given AUD/USD and foreign units per USD. */
export function audPerUnitFromUsdCross(audPerUsd: number, foreignPerUsd: number): number {
  if (!(audPerUsd > 0) || !(foreignPerUsd > 0)) return 0;
  return audPerUsd / foreignPerUsd;
}

export function formatFxTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Sydney",
  }).format(date);
}
